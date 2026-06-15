use serde::{Deserialize, Serialize};

/// Usuário do sistema. A senha nunca é serializada para o frontend.
#[derive(Debug, Clone, Serialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub active: bool,
    /// Papéis (roles) atribuídos ao usuário.
    pub roles: Vec<String>,
    /// Permissões efetivas resolvidas a partir dos papéis.
    pub permissions: Vec<String>,
}

/// Papel (role) do RBAC. Agrupa permissões.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Permissões no formato "<modulo>:<acao>", ex.: "financeiro:create".
    pub permissions: Vec<String>,
}

/// Sessão de um módulo aberto individualmente (login por módulo).
#[derive(Debug, Clone, Serialize)]
pub struct ModuleSession {
    /// Token opaco usado pelo frontend para autorizar chamadas do módulo.
    pub token: String,
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    /// Módulo ao qual esta sessão está restrita.
    pub module_id: String,
    /// Permissões efetivas do usuário DENTRO deste módulo (ex.: "financeiro:create").
    pub permissions: Vec<String>,
    /// Epoch (segundos) de abertura.
    pub opened_at: i64,
}

/// Ação CRUD genérica usada na verificação de permissões.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Access,
    Create,
    Read,
    Update,
    Delete,
}

impl Action {
    pub fn as_str(&self) -> &'static str {
        match self {
            Action::Access => "access",
            Action::Create => "create",
            Action::Read => "read",
            Action::Update => "update",
            Action::Delete => "delete",
        }
    }
}
