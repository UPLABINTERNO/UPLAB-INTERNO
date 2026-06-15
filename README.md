# Interno UPLAB

Sistema interno **modular** em **Tauri 2 + SvelteKit 5 (TypeScript)**.

- App único com um **launcher**; cada módulo abre **sob demanda (lazy)**.
- **Login individual por módulo** + **permissões RBAC** (gate de acesso e de cada ação CRUD).
- Camada de dados **abstraída**: hoje **SQLite local**, amanhã **API HTTP** sem reescrever os módulos.

---

## Stack

| Camada    | Tecnologia                                              |
| --------- | ------------------------------------------------------- |
| Desktop   | Tauri 2 (Rust)                                          |
| Frontend  | SvelteKit 5 (SPA, `adapter-static`) + TypeScript + Vite |
| Dados     | SQLite (`rusqlite`, embutido) via trait de repositório  |
| Auth      | Argon2 (hash de senha) + sessões de módulo em memória   |

## Pré-requisitos

- Node.js 20+ e npm
- Rust (stable) + toolchain do Tauri ([pré-requisitos por SO](https://tauri.app/start/prerequisites/))

## Rodando

```bash
npm install
npm run tauri:dev      # backend Rust + frontend juntos
```

Apenas frontend (browser, sem IPC): `npm run dev`.

Build de produção:

```bash
# 1x: gerar ícones a partir de um PNG quadrado (necessário para o bundle)
npm run tauri icon caminho/para/logo.png
npm run tauri:build
```

### Login inicial

No primeiro start é criado o usuário **`admin` / `admin123`** com o papel
*Administrador* (permissão curinga `*:*`). Troque a senha em produção.

---

## Arquitetura

```
src/                              # Frontend (SvelteKit)
├── routes/
│   ├── +layout.svelte            # shell global (CSS, SPA)
│   ├── +page.svelte              # LAUNCHER: grid de módulos
│   └── modulo/[id]/+page.svelte  # abre módulo: login → lazy load → render
└── lib/
    ├── core/                     # núcleo compartilhado
    │   ├── ipc.ts                # wrapper tipado de invoke + IpcError
    │   ├── types.ts              # tipos espelhando o backend
    │   ├── session.svelte.ts     # sessões por módulo + checagem de permissão
    │   ├── registry.ts           # mapa id → import dinâmico (lazy) do módulo
    │   └── ui/                   # ModuleLogin, ModuleShell
    └── modules/
        ├── _stub/Module.svelte   # placeholder dos módulos não implementados
        └── financeiro/           # MÓDULO DE EXEMPLO (template completo)
            ├── api.ts            # chamadas IPC do módulo
            └── Module.svelte     # tela CRUD com gates de permissão

src-tauri/                        # Backend (Rust)
├── tauri.conf.json
├── capabilities/default.json
└── src/
    ├── main.rs / lib.rs          # bootstrap + invoke_handler
    ├── commands.rs               # comandos do núcleo (login, permissões, catálogo)
    ├── core/
    │   ├── db.rs                 # SQLite: migrações + seed (admin)
    │   ├── models.rs             # User, Role, ModuleSession, Action
    │   ├── auth.rs               # hash/verify senha, module_login
    │   ├── permissions.rs        # RBAC com curingas + require()
    │   ├── logging.rs            # auditoria (tabela audit_log)
    │   ├── repository.rs         # contrato de abstração de dados
    │   ├── state.rs              # AppState (conexão + sessões)
    │   └── error.rs              # AppError serializável p/ o frontend
    └── modules/
        ├── mod.rs                # catálogo de módulos (launcher)
        └── financeiro.rs         # MÓDULO DE EXEMPLO (repo + comandos CRUD)
```

### Fluxo de abertura de um módulo

1. Launcher lista o catálogo (`modules_catalog`).
2. Ao clicar, vai para `/modulo/<id>`.
3. Sem sessão → mostra **`ModuleLogin`**. O backend valida credenciais e exige
   `<id>:access`, devolvendo uma `ModuleSession` (token + permissões efetivas).
4. Com sessão → o componente do módulo é **carregado sob demanda** (`registry.ts`)
   e renderizado dentro de `ModuleShell`.

### Permissões (RBAC)

- Permissão = `"<modulo>:<acao>"`, ações: `access | create | read | update | delete`.
- Curingas: `*:*`, `<modulo>:*`, `*:<acao>`.
- **Dupla checagem**: o frontend usa `can(modulo, acao)` para mostrar/ocultar
  botões; o backend **sempre** revalida com `permissions::require` em cada comando.
  A UI é conveniência — a autoridade é o Rust.

### Abstração de dados (SQLite → API depois)

Cada módulo define um **trait de repositório** (ex.: `FinanceiroRepository`) e uma
implementação (`SqliteFinanceiro`). Trocar para uma API HTTP no futuro é criar
outra impl (ex.: `ApiFinanceiro`) com as mesmas assinaturas — comandos e frontend
permanecem iguais.

---

## Como adicionar um novo módulo

Exemplo: módulo `comercial`.

**Backend (`src-tauri`):**

1. Crie `src/modules/comercial.rs` (copie `financeiro.rs` como base): entidade,
   trait de repositório, impl SQLite e comandos `comercial_*` com
   `state.session_for(&token, "comercial")` + `require(&session, Action::…)`.
2. Adicione a tabela em `core/db.rs` (`migrate`).
3. `pub mod comercial;` em `modules/mod.rs` e registre o card em `catalog()`.
4. Registre os comandos no `invoke_handler!` em `lib.rs`.

**Frontend (`src`):**

5. Crie `src/lib/modules/comercial/{api.ts,Module.svelte}` (copie de `financeiro/`).
6. Troque o stub pelo real em `core/registry.ts`:
   `comercial: () => import('$modules/comercial/Module.svelte')`.

**Permissões:** conceda `comercial:access`, `comercial:read`, etc. aos papéis
(via módulo Administrador, ou direto no banco em `role_permissions`).

---

## Módulos previstos

`atendimento`, `comercial`, `financeiro` ✅, `campanhas`, `tickets_clientes`,
`tickets_internos`, `chat`, `api`, `banco_dados`, `logs`, `administrador`.

> **Administrador** é o módulo de gestão de **usuários, papéis e permissões**
> (lê/escreve `users`, `roles`, `role_permissions`, `user_roles`).
> **Logs** lê a tabela `audit_log` alimentada por todos os módulos.

Apenas `financeiro` está implementado de ponta a ponta (template). Os demais já
têm card no launcher, login e gate de permissão — falta o CRUD de cada um.
