use serde::Serialize;

/// Erro de aplicação. Serializa para o frontend como `{ code, message }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("não autenticado")]
    Unauthenticated,

    #[error("sem permissão: {0}")]
    Forbidden(String),

    #[error("credenciais inválidas")]
    InvalidCredentials,

    #[error("não encontrado: {0}")]
    NotFound(String),

    #[error("entrada inválida: {0}")]
    Validation(String),

    #[error("erro de banco de dados: {0}")]
    Database(String),

    #[error("erro interno: {0}")]
    Internal(String),
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            AppError::Unauthenticated => "UNAUTHENTICATED",
            AppError::Forbidden(_) => "FORBIDDEN",
            AppError::InvalidCredentials => "INVALID_CREDENTIALS",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Validation(_) => "VALIDATION",
            AppError::Database(_) => "DATABASE",
            AppError::Internal(_) => "INTERNAL",
        }
    }
}

/// Forma serializada do erro entregue ao frontend via IPC.
#[derive(Serialize)]
pub struct AppErrorPayload {
    pub code: String,
    pub message: String,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let payload = AppErrorPayload {
            code: self.code().to_string(),
            message: self.to_string(),
        };
        payload.serialize(serializer)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("registro".into()),
            other => AppError::Database(other.to_string()),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
