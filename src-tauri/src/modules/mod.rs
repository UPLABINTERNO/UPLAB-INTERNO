//! Registro dos módulos de negócio.
//!
//! Cada módulo é independente: define seus próprios comandos Tauri e checa
//! permissões via `core::permissions::require`. O catálogo abaixo alimenta o
//! launcher do frontend (id, rótulo, ícone e permissão de acesso exigida).

use serde::Serialize;

pub mod administrador;
pub mod financeiro;

/// Metadados de um módulo para o launcher.
#[derive(Debug, Clone, Serialize)]
pub struct ModuleInfo {
    pub id: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    /// Permissão exigida para abrir o módulo (ex.: "financeiro:access").
    pub access_permission: String,
}

fn module(id: &str, label: &str, description: &str, icon: &str) -> ModuleInfo {
    ModuleInfo {
        id: id.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        icon: icon.to_string(),
        access_permission: format!("{}:access", id),
    }
}

/// Catálogo completo de módulos do sistema interno UPLAB.
pub fn catalog() -> Vec<ModuleInfo> {
    vec![
        module("atendimento", "Atendimento", "Atendimento ao cliente", "headset"),
        module("comercial", "Comercial", "Vendas e propostas", "briefcase"),
        module("financeiro", "Financeiro", "Lançamentos e fluxo de caixa", "wallet"),
        module("campanhas", "Campanhas", "Campanhas comerciais", "megaphone"),
        module("tickets_clientes", "Tickets Clientes", "Chamados de clientes", "ticket"),
        module("tickets_internos", "Tickets Internos", "Chamados internos", "tool"),
        module("chat", "Chat Interno", "Mensagens entre a equipe", "chat"),
        module("api", "Integrações/API", "Configuração de integrações", "plug"),
        module("banco_dados", "Banco de Dados", "Administração de dados", "database"),
        module("logs", "Logs", "Auditoria e logs do sistema", "list"),
        module("administrador", "Administrador", "Usuários, papéis e permissões", "shield"),
    ]
}
