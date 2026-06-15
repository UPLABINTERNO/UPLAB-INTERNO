//! Módulo Administrador — gestão de usuários, papéis (roles) e permissões.
//!
//! É o painel do "acessos com permissões": escreve nas tabelas do núcleo
//! (`users`, `roles`, `role_permissions`, `user_roles`). Segue o mesmo padrão
//! do módulo Financeiro: valida a sessão do módulo, exige a permissão CRUD,
//! executa e audita.

use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{Action, Role, User};
use crate::core::permissions::require;
use crate::core::state::AppState;

const MODULE_ID: &str = "administrador";

// --------------------------------------------------------------------------
// Leitura
// --------------------------------------------------------------------------

fn load_user_roles(conn: &Connection, user_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT role_id FROM user_roles WHERE user_id = ?1")?;
    let v = stmt
        .query_map([user_id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(v)
}

fn load_role_permissions(conn: &Connection, role_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT permission FROM role_permissions WHERE role_id = ?1")?;
    let v = stmt
        .query_map([role_id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(v)
}

fn users(conn: &Connection) -> AppResult<Vec<User>> {
    let base: Vec<(String, String, String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT id, username, display_name, active FROM users ORDER BY username",
        )?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let mut out = Vec::with_capacity(base.len());
    for (id, username, display_name, active) in base {
        let roles = load_user_roles(conn, &id)?;
        out.push(User {
            id,
            username,
            display_name,
            active: active != 0,
            roles,
            permissions: Vec::new(),
        });
    }
    Ok(out)
}

fn roles(conn: &Connection) -> AppResult<Vec<Role>> {
    let base: Vec<(String, String, String)> = {
        let mut stmt =
            conn.prepare("SELECT id, name, description FROM roles ORDER BY name")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let mut out = Vec::with_capacity(base.len());
    for (id, name, description) in base {
        let permissions = load_role_permissions(conn, &id)?;
        out.push(Role { id, name, description, permissions });
    }
    Ok(out)
}

// --------------------------------------------------------------------------
// Entradas
// --------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct UserInput {
    pub username: String,
    pub display_name: String,
    pub active: bool,
    pub roles: Vec<String>,
    /// Senha em texto puro; obrigatória na criação, opcional na edição.
    pub password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RoleInput {
    pub name: String,
    pub description: String,
    pub permissions: Vec<String>,
}

fn set_user_roles(conn: &Connection, user_id: &str, role_ids: &[String]) -> AppResult<()> {
    conn.execute("DELETE FROM user_roles WHERE user_id = ?1", [user_id])?;
    for rid in role_ids {
        conn.execute(
            "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?1, ?2)",
            (user_id, rid),
        )?;
    }
    Ok(())
}

fn set_role_permissions(conn: &Connection, role_id: &str, perms: &[String]) -> AppResult<()> {
    conn.execute("DELETE FROM role_permissions WHERE role_id = ?1", [role_id])?;
    for p in perms {
        let p = p.trim();
        if p.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?1, ?2)",
            (role_id, p),
        )?;
    }
    Ok(())
}

// --------------------------------------------------------------------------
// Comandos Tauri — USUÁRIOS
// --------------------------------------------------------------------------

#[tauri::command]
pub fn admin_users_list(state: State<AppState>, token: String) -> AppResult<Vec<User>> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Read)?;
    let conn = state.db.lock();
    users(&conn)
}

#[tauri::command]
pub fn admin_user_create(
    state: State<AppState>,
    token: String,
    input: UserInput,
) -> AppResult<User> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Create)?;

    if input.username.trim().is_empty() {
        return Err(AppError::Validation("usuário obrigatório".into()));
    }
    let password = input
        .password
        .as_deref()
        .filter(|p| !p.is_empty())
        .ok_or_else(|| AppError::Validation("senha obrigatória".into()))?;
    let hash = crate::core::auth::hash_password(password)?;
    let id = Uuid::new_v4().to_string();

    let mut conn = state.db.lock();
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;
    tx.execute(
        "INSERT INTO users (id, username, display_name, password_hash, active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &id,
            input.username.trim(),
            input.display_name.trim(),
            &hash,
            input.active as i64,
            crate::core::now_epoch(),
        ),
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(_, _) => AppError::Validation("usuário já existe".into()),
        other => AppError::Database(other.to_string()),
    })?;
    set_user_roles(&tx, &id, &input.roles)?;
    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "user_create", &id)?;
    users(&conn)?
        .into_iter()
        .find(|u| u.id == id)
        .ok_or_else(|| AppError::NotFound(id.clone()))
}

#[tauri::command]
pub fn admin_user_update(
    state: State<AppState>,
    token: String,
    id: String,
    input: UserInput,
) -> AppResult<User> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Update)?;

    let mut conn = state.db.lock();
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;
    let affected = tx.execute(
        "UPDATE users SET display_name = ?2, active = ?3 WHERE id = ?1",
        (&id, input.display_name.trim(), input.active as i64),
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("usuário {id}")));
    }
    // Troca de senha opcional.
    if let Some(p) = input.password.as_deref().filter(|p| !p.is_empty()) {
        let hash = crate::core::auth::hash_password(p)?;
        tx.execute("UPDATE users SET password_hash = ?2 WHERE id = ?1", (&id, &hash))?;
    }
    set_user_roles(&tx, &id, &input.roles)?;
    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "user_update", &id)?;
    users(&conn)?
        .into_iter()
        .find(|u| u.id == id)
        .ok_or_else(|| AppError::NotFound(id.clone()))
}

#[tauri::command]
pub fn admin_user_delete(state: State<AppState>, token: String, id: String) -> AppResult<()> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Delete)?;
    if id == session.user_id {
        return Err(AppError::Validation("não é possível excluir o próprio usuário".into()));
    }
    let conn = state.db.lock();
    let affected = conn.execute("DELETE FROM users WHERE id = ?1", [&id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("usuário {id}")));
    }
    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "user_delete", &id)?;
    Ok(())
}

// --------------------------------------------------------------------------
// Comandos Tauri — PAPÉIS (ROLES)
// --------------------------------------------------------------------------

#[tauri::command]
pub fn admin_roles_list(state: State<AppState>, token: String) -> AppResult<Vec<Role>> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Read)?;
    let conn = state.db.lock();
    roles(&conn)
}

#[tauri::command]
pub fn admin_role_create(
    state: State<AppState>,
    token: String,
    input: RoleInput,
) -> AppResult<Role> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Create)?;
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("nome do papel obrigatório".into()));
    }
    let id = Uuid::new_v4().to_string();
    let mut conn = state.db.lock();
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;
    tx.execute(
        "INSERT INTO roles (id, name, description) VALUES (?1, ?2, ?3)",
        (&id, input.name.trim(), input.description.trim()),
    )
    .map_err(|_| AppError::Validation("papel já existe".into()))?;
    set_role_permissions(&tx, &id, &input.permissions)?;
    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;
    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "role_create", &id)?;
    roles(&conn)?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| AppError::NotFound(id.clone()))
}

#[tauri::command]
pub fn admin_role_update(
    state: State<AppState>,
    token: String,
    id: String,
    input: RoleInput,
) -> AppResult<Role> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Update)?;
    let mut conn = state.db.lock();
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;
    let affected = tx.execute(
        "UPDATE roles SET name = ?2, description = ?3 WHERE id = ?1",
        (&id, input.name.trim(), input.description.trim()),
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("papel {id}")));
    }
    set_role_permissions(&tx, &id, &input.permissions)?;
    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;
    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "role_update", &id)?;
    roles(&conn)?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| AppError::NotFound(id.clone()))
}

#[tauri::command]
pub fn admin_role_delete(state: State<AppState>, token: String, id: String) -> AppResult<()> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Delete)?;
    let conn = state.db.lock();
    let affected = conn.execute("DELETE FROM roles WHERE id = ?1", [&id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("papel {id}")));
    }
    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "role_delete", &id)?;
    Ok(())
}
