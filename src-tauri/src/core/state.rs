use std::collections::HashMap;

use parking_lot::Mutex;
use rusqlite::Connection;

use crate::core::error::{AppError, AppResult};
use crate::core::models::ModuleSession;

/// Estado global compartilhado entre os comandos Tauri.
pub struct AppState {
    pub db: Mutex<Connection>,
    /// Sessões de módulo ativas (token -> sessão). Login individual por módulo.
    pub sessions: Mutex<HashMap<String, ModuleSession>>,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        Self {
            db: Mutex::new(db),
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Recupera a sessão associada a um token ou erro de não autenticado.
    pub fn session(&self, token: &str) -> AppResult<ModuleSession> {
        self.sessions
            .lock()
            .get(token)
            .cloned()
            .ok_or(AppError::Unauthenticated)
    }

    /// Recupera a sessão garantindo que pertence ao módulo esperado.
    pub fn session_for(&self, token: &str, module_id: &str) -> AppResult<ModuleSession> {
        let s = self.session(token)?;
        if s.module_id != module_id {
            return Err(AppError::Forbidden(format!("{}:access", module_id)));
        }
        Ok(s)
    }
}
