//! Abstração de fonte de dados.
//!
//! A decisão "SQLite agora, API HTTP depois" é honrada aqui: cada módulo
//! define um *trait* de repositório (ex.: `FinanceiroRepository`) e fornece
//! uma implementação. Hoje a implementação usa SQLite local; no futuro basta
//! criar outra implementação (ex.: `ApiFinanceiroRepository`) que fale HTTP,
//! sem alterar os comandos Tauri nem o frontend.
//!
//! Os comandos recebem `&AppState` e obtêm a conexão via `state.db.lock()`.
//! Quando a fonte virar API, troca-se o conteúdo de `AppState` e as impls,
//! mantendo as assinaturas dos traits.

/// Marcador comum a todas as entidades persistidas (id textual/UUID).
pub trait Entity {
    fn id(&self) -> &str;
}
