//! Módulo Financeiro — exemplo COMPLETO de módulo CRUD full-stack.
//!
//! Serve de template para os demais módulos. Padrão:
//!   1. Entidade serializável (`Lancamento`).
//!   2. Trait de repositório (`FinanceiroRepository`) — a abstração de dados.
//!   3. Implementação SQLite (`SqliteFinanceiro`).
//!   4. Comandos Tauri que: validam a sessão do módulo, exigem a permissão
//!      CRUD correspondente, chamam o repositório e auditam a ação.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::Action;
use crate::core::permissions::require;
use crate::core::repository::Entity;
use crate::core::state::AppState;

const MODULE_ID: &str = "financeiro";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lancamento {
    pub id: String,
    pub descricao: String,
    pub tipo: String, // "receita" | "despesa"
    pub valor_cents: i64,
    pub categoria: String,
    pub data: String, // ISO yyyy-mm-dd
    pub created_at: i64,
    pub updated_at: i64,
}

impl Entity for Lancamento {
    fn id(&self) -> &str {
        &self.id
    }
}

/// Entrada para criação/edição (sem campos gerenciados pelo servidor).
#[derive(Debug, Deserialize)]
pub struct LancamentoInput {
    pub descricao: String,
    pub tipo: String,
    pub valor_cents: i64,
    pub categoria: String,
    pub data: String,
}

impl LancamentoInput {
    fn validate(&self) -> AppResult<()> {
        if self.descricao.trim().is_empty() {
            return Err(AppError::Validation("descrição obrigatória".into()));
        }
        if self.tipo != "receita" && self.tipo != "despesa" {
            return Err(AppError::Validation("tipo deve ser receita ou despesa".into()));
        }
        if self.valor_cents <= 0 {
            return Err(AppError::Validation("valor deve ser positivo".into()));
        }
        Ok(())
    }
}

/// Abstração de dados do módulo. Hoje: SQLite. Amanhã: HTTP, sem mudar comandos.
pub trait FinanceiroRepository {
    fn list(&self) -> AppResult<Vec<Lancamento>>;
    fn get(&self, id: &str) -> AppResult<Lancamento>;
    fn create(&self, input: &LancamentoInput) -> AppResult<Lancamento>;
    fn update(&self, id: &str, input: &LancamentoInput) -> AppResult<Lancamento>;
    fn delete(&self, id: &str) -> AppResult<()>;
}

/// Implementação sobre SQLite.
pub struct SqliteFinanceiro<'a>(pub &'a Connection);

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Lancamento> {
    Ok(Lancamento {
        id: r.get(0)?,
        descricao: r.get(1)?,
        tipo: r.get(2)?,
        valor_cents: r.get(3)?,
        categoria: r.get(4)?,
        data: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

const COLS: &str =
    "id, descricao, tipo, valor_cents, categoria, data, created_at, updated_at";

impl<'a> FinanceiroRepository for SqliteFinanceiro<'a> {
    fn list(&self) -> AppResult<Vec<Lancamento>> {
        let sql = format!("SELECT {COLS} FROM fin_lancamentos ORDER BY data DESC, created_at DESC");
        let mut stmt = self.0.prepare(&sql)?;
        let rows = stmt.query_map([], map_row)?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn get(&self, id: &str) -> AppResult<Lancamento> {
        let sql = format!("SELECT {COLS} FROM fin_lancamentos WHERE id = ?1");
        Ok(self.0.query_row(&sql, [id], map_row)?)
    }

    fn create(&self, input: &LancamentoInput) -> AppResult<Lancamento> {
        input.validate()?;
        let now = crate::core::now_epoch();
        let item = Lancamento {
            id: Uuid::new_v4().to_string(),
            descricao: input.descricao.trim().to_string(),
            tipo: input.tipo.clone(),
            valor_cents: input.valor_cents,
            categoria: input.categoria.clone(),
            data: input.data.clone(),
            created_at: now,
            updated_at: now,
        };
        self.0.execute(
            "INSERT INTO fin_lancamentos (id, descricao, tipo, valor_cents, categoria, data, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                &item.id, &item.descricao, &item.tipo, item.valor_cents,
                &item.categoria, &item.data, item.created_at, item.updated_at,
            ),
        )?;
        Ok(item)
    }

    fn update(&self, id: &str, input: &LancamentoInput) -> AppResult<Lancamento> {
        input.validate()?;
        let now = crate::core::now_epoch();
        let affected = self.0.execute(
            "UPDATE fin_lancamentos
             SET descricao = ?2, tipo = ?3, valor_cents = ?4, categoria = ?5, data = ?6, updated_at = ?7
             WHERE id = ?1",
            (
                id, input.descricao.trim(), &input.tipo, input.valor_cents,
                &input.categoria, &input.data, now,
            ),
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("lançamento {id}")));
        }
        self.get(id)
    }

    fn delete(&self, id: &str) -> AppResult<()> {
        let affected = self
            .0
            .execute("DELETE FROM fin_lancamentos WHERE id = ?1", [id])?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("lançamento {id}")));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Comandos Tauri — cada um valida sessão + permissão CRUD e audita.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn financeiro_list(state: State<AppState>, token: String) -> AppResult<Vec<Lancamento>> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Read)?;
    let conn = state.db.lock();
    SqliteFinanceiro(&conn).list()
}

#[tauri::command]
pub fn financeiro_create(
    state: State<AppState>,
    token: String,
    input: LancamentoInput,
) -> AppResult<Lancamento> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Create)?;
    let conn = state.db.lock();
    let item = SqliteFinanceiro(&conn).create(&input)?;
    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "create", &item.id)?;
    Ok(item)
}

#[tauri::command]
pub fn financeiro_update(
    state: State<AppState>,
    token: String,
    id: String,
    input: LancamentoInput,
) -> AppResult<Lancamento> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Update)?;
    let conn = state.db.lock();
    let item = SqliteFinanceiro(&conn).update(&id, &input)?;
    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "update", &id)?;
    Ok(item)
}

#[tauri::command]
pub fn financeiro_delete(state: State<AppState>, token: String, id: String) -> AppResult<()> {
    let session = state.session_for(&token, MODULE_ID)?;
    require(&session, Action::Delete)?;
    let conn = state.db.lock();
    SqliteFinanceiro(&conn).delete(&id)?;
    crate::core::logging::audit(&conn, Some(&session.user_id), MODULE_ID, "delete", &id)?;
    Ok(())
}
