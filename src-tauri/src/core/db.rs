use rusqlite::Connection;

use crate::core::auth;
use crate::core::error::{AppError, AppResult};

/// Cria/abre a conexão SQLite, aplica migrações e faz o seed inicial.
pub fn init(path: &std::path::Path) -> AppResult<Connection> {
    let conn = Connection::open(path).map_err(|e| AppError::Database(e.to_string()))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| AppError::Database(e.to_string()))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| AppError::Database(e.to_string()))?;
    migrate(&conn)?;
    seed(&conn)?;
    Ok(conn)
}

/// Esquema base do núcleo (auth/RBAC/logs) + tabelas dos módulos.
fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id            TEXT PRIMARY KEY,
            username      TEXT NOT NULL UNIQUE,
            display_name  TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            active        INTEGER NOT NULL DEFAULT 1,
            created_at    INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS roles (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission TEXT NOT NULL,
            PRIMARY KEY (role_id, permission)
        );

        CREATE TABLE IF NOT EXISTS user_roles (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, role_id)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id         TEXT PRIMARY KEY,
            ts         INTEGER NOT NULL,
            user_id    TEXT,
            module_id  TEXT NOT NULL,
            action     TEXT NOT NULL,
            detail     TEXT NOT NULL DEFAULT ''
        );

        -- Tabela do módulo de exemplo (Financeiro).
        CREATE TABLE IF NOT EXISTS fin_lancamentos (
            id          TEXT PRIMARY KEY,
            descricao   TEXT NOT NULL,
            tipo        TEXT NOT NULL,          -- 'receita' | 'despesa'
            valor_cents INTEGER NOT NULL,
            categoria   TEXT NOT NULL DEFAULT '',
            data        TEXT NOT NULL,          -- ISO yyyy-mm-dd
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Cria papéis padrão e o usuário admin inicial (admin / admin123) se não houver usuários.
fn seed(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
        .map_err(|e| AppError::Database(e.to_string()))?;
    if count > 0 {
        return Ok(());
    }

    let now = crate::core::now_epoch();

    // Papel admin: curinga total.
    conn.execute(
        "INSERT INTO roles (id, name, description) VALUES (?1, ?2, ?3)",
        ("role-admin", "Administrador", "Acesso total a todos os módulos"),
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute(
        "INSERT INTO role_permissions (role_id, permission) VALUES ('role-admin', '*:*')",
        [],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    // Usuário admin inicial.
    let hash = auth::hash_password("admin123")?;
    conn.execute(
        "INSERT INTO users (id, username, display_name, password_hash, active, created_at)
         VALUES ('user-admin', 'admin', 'Administrador', ?1, 1, ?2)",
        (hash, now),
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute(
        "INSERT INTO user_roles (user_id, role_id) VALUES ('user-admin', 'role-admin')",
        [],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    log::info!("Seed inicial criado: usuário 'admin' (senha 'admin123').");
    Ok(())
}
