use crate::core::error::{AppError, AppResult};
use crate::core::models::{Action, ModuleSession};

/// Verifica se uma lista de permissões concede `needed`.
///
/// Suporta curingas:
/// - `*:*`            → tudo
/// - `<modulo>:*`     → todas as ações do módulo
/// - `*:<acao>`       → a ação em qualquer módulo
/// - `<modulo>:<acao>`→ exata
pub fn granted(permissions: &[String], needed: &str) -> bool {
    let (need_mod, need_act) = split(needed);
    permissions.iter().any(|p| {
        let (m, a) = split(p);
        (m == "*" || m == need_mod) && (a == "*" || a == need_act)
    })
}

fn split(perm: &str) -> (&str, &str) {
    match perm.split_once(':') {
        Some((m, a)) => (m, a),
        None => (perm, "*"),
    }
}

/// Monta a string de permissão "<modulo>:<acao>".
pub fn perm(module_id: &str, action: Action) -> String {
    format!("{}:{}", module_id, action.as_str())
}

/// Garante que a sessão do módulo possui a ação requerida; erro `Forbidden` caso contrário.
pub fn require(session: &ModuleSession, action: Action) -> AppResult<()> {
    let needed = perm(&session.module_id, action);
    if granted(&session.permissions, &needed) {
        Ok(())
    } else {
        Err(AppError::Forbidden(needed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildcards() {
        assert!(granted(&["*:*".into()], "financeiro:create"));
        assert!(granted(&["financeiro:*".into()], "financeiro:delete"));
        assert!(granted(&["*:read".into()], "comercial:read"));
        assert!(granted(&["financeiro:read".into()], "financeiro:read"));
        assert!(!granted(&["financeiro:read".into()], "financeiro:delete"));
        assert!(!granted(&["comercial:*".into()], "financeiro:read"));
    }
}
