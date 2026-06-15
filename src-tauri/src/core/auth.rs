use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rusqlite::Connection;
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::ModuleSession;

pub fn hash_password(plain: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(e.to_string()))
}

fn verify_password(plain: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(plain.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

/// Resolve as permissões efetivas de um usuário a partir dos seus papéis.
fn resolve_permissions(conn: &Connection, user_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT rp.permission
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?1",
    )?;
    let perms = stmt
        .query_map([user_id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(perms)
}

/// Login individual de módulo: valida credenciais e exige `<modulo>:access`.
/// Retorna uma sessão restrita ao módulo com as permissões efetivas.
pub fn module_login(
    conn: &Connection,
    module_id: &str,
    username: &str,
    password: &str,
) -> AppResult<ModuleSession> {
    let row = conn.query_row(
        "SELECT id, display_name, password_hash, active FROM users WHERE username = ?1",
        [username],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
            ))
        },
    );

    let (user_id, display_name, hash, active) = match row {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Err(AppError::InvalidCredentials),
        Err(e) => return Err(AppError::Database(e.to_string())),
    };

    if active == 0 || !verify_password(password, &hash) {
        return Err(AppError::InvalidCredentials);
    }

    let permissions = resolve_permissions(conn, &user_id)?;

    // Exige acesso ao módulo.
    let access = crate::core::permissions::perm(module_id, crate::core::models::Action::Access);
    if !crate::core::permissions::granted(&permissions, &access) {
        return Err(AppError::Forbidden(access));
    }

    Ok(ModuleSession {
        token: Uuid::new_v4().to_string(),
        user_id,
        username: username.to_string(),
        display_name,
        module_id: module_id.to_string(),
        permissions,
        opened_at: crate::core::now_epoch(),
    })
}
