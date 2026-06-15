use rusqlite::Connection;
use uuid::Uuid;

use crate::core::error::AppResult;

/// Registra uma entrada de auditoria (módulo de logs lê desta tabela).
pub fn audit(
    conn: &Connection,
    user_id: Option<&str>,
    module_id: &str,
    action: &str,
    detail: &str,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO audit_log (id, ts, user_id, module_id, action, detail)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            Uuid::new_v4().to_string(),
            crate::core::now_epoch(),
            user_id,
            module_id,
            action,
            detail,
        ),
    )?;
    Ok(())
}
