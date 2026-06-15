//! Comandos do núcleo expostos ao frontend (autenticação, permissões, catálogo).

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::ModuleSession;
use crate::core::state::AppState;
use crate::modules;

/// Login individual de um módulo. Valida credenciais e exige `<modulo>:access`.
#[tauri::command]
pub fn auth_module_login(
    state: State<AppState>,
    module_id: String,
    username: String,
    password: String,
) -> AppResult<ModuleSession> {
    let session = {
        let conn = state.db.lock();
        let s = crate::core::auth::module_login(&conn, &module_id, &username, &password)?;
        crate::core::logging::audit(&conn, Some(&s.user_id), &module_id, "login", "")?;
        s
    };
    state
        .sessions
        .lock()
        .insert(session.token.clone(), session.clone());
    Ok(session)
}

/// Encerra a sessão de um módulo.
#[tauri::command]
pub fn auth_module_logout(state: State<AppState>, token: String) -> AppResult<()> {
    if let Some(s) = state.sessions.lock().remove(&token) {
        let conn = state.db.lock();
        let _ = crate::core::logging::audit(&conn, Some(&s.user_id), &s.module_id, "logout", "");
    }
    Ok(())
}

/// Verifica uma permissão (ex.: "financeiro:create") para a sessão informada.
#[tauri::command]
pub fn permissions_check(state: State<AppState>, token: String, permission: String) -> bool {
    match state.session(&token) {
        Ok(s) => crate::core::permissions::granted(&s.permissions, &permission),
        Err(_) => false,
    }
}

/// Catálogo estático de módulos disponíveis (alimenta o launcher).
#[tauri::command]
pub fn modules_catalog() -> Vec<modules::ModuleInfo> {
    modules::catalog()
}
