-- ============================================================================
-- Histórico de conversas (ZapResponder) — tabelas DEDICADAS do Interno UPLAB.
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. NÃO toca nas tabelas que o
-- webhook de produção usa (uplab_conversas/uplab_mensagens).
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================================

create extension if not exists pg_trgm;

-- ---- Atendentes (espelho do ZapResponder) ----------------------------------
create table if not exists uplab_atendentes (
  uuid          text primary key,
  nome          text,
  email         text,
  is_admin      boolean default false,
  is_ativo      boolean default true,
  atualizado_em timestamptz default now()
);

-- ---- Grupos/contatos (cada ótica-loja é um grupo de WhatsApp) --------------
create table if not exists uplab_chat_grupos (
  chat_id           text primary key,
  nome              text,
  origem            text,
  is_grupo          boolean default false,
  codigo_loja       text,
  foto_url          text,
  atendente_uuid    text,
  departamento_uuid text,
  total_mensagens   int default 0,
  total_conversas   int default 0,
  is_closed         boolean default false,
  primeira_msg_at   timestamptz,
  ultima_msg_at     timestamptz,
  ultima_msg_texto  text,
  telefones         jsonb default '[]'::jsonb,
  busca             text,
  atualizado_em     timestamptz default now()
);
create index if not exists idx_grupos_ultima on uplab_chat_grupos (ultima_msg_at desc nulls last);
create index if not exists idx_grupos_busca  on uplab_chat_grupos using gin (busca gin_trgm_ops);

-- ---- Mensagens -------------------------------------------------------------
create table if not exists uplab_chat_mensagens (
  id              bigint generated always as identity primary key,
  dedupe_key      text unique,
  chat_id         text not null,
  conversation_id text,
  protocolo       text,
  direcao         text,   -- recebida | enviada | sistema
  classe          text,   -- cliente | atendente | robo | sistema
  autor_nome      text,
  autor_tipo      text,   -- usuario | bot | atendente | system | mobile
  atendente_uuid  text,
  participante    text,   -- telefone de quem falou (dentro do grupo)
  texto           text,
  tipo            text,   -- text | file | template
  media_url       text,
  ts              timestamptz,
  criado_em       timestamptz default now()
);
-- `ord`: ordenação confiável (metade das msgs não tem timestamp real).
alter table uplab_chat_mensagens add column if not exists ord bigint;
create index if not exists idx_msgs_chat_ord on uplab_chat_mensagens (chat_id, ord);
create index if not exists idx_msgs_chat_ts on uplab_chat_mensagens (chat_id, ts);
create index if not exists idx_msgs_ts       on uplab_chat_mensagens (ts);
create index if not exists idx_msgs_part     on uplab_chat_mensagens (participante);
create index if not exists idx_msgs_texto    on uplab_chat_mensagens using gin (texto gin_trgm_ops);

-- ---- Atendimentos (1 por conversa) — para agrupar por DATA ------------------
create table if not exists uplab_chat_atendimentos (
  conversation_id text primary key,
  chat_id         text not null,
  dia             date,
  inicio          timestamptz,
  fim             timestamptz,
  atendente_uuid  text,
  atendente_nome  text,
  departamento_uuid text,
  total_msgs      int default 0,
  encerrada       boolean default false,
  resumo          text,
  ord             bigint
);
create index if not exists idx_atend_dia    on uplab_chat_atendimentos (dia desc);
create index if not exists idx_atend_chat   on uplab_chat_atendimentos (chat_id);
create index if not exists idx_atend_atend  on uplab_chat_atendimentos (atendente_uuid);

-- Vínculo usuário interno -> atendente do ZapResponder (métrica individual).
create table if not exists uplab_usuario_atendente (
  user_id        uuid primary key,
  atendente_uuid text not null,
  atualizado_em  timestamptz default now()
);

-- ---- ERP (espelho do Supabase compartilhado) — nome real do cliente --------
create table if not exists uplab_erp_clientes (
  codigo        text primary key,
  nome_fantasia text,
  razao_social  text,
  cnpj_cpf      text,
  cidade        text,
  estado        text,
  vendedor      text,
  carteira      text
);
create table if not exists uplab_erp_vinculos (
  telefone text primary key,
  codigo   text
);
-- Dados do cliente (ERP) aplicados ao contato/loja.
alter table uplab_chat_grupos add column if not exists nome_cliente text;
alter table uplab_chat_grupos add column if not exists cidade text;
alter table uplab_chat_grupos add column if not exists vendedor text;
alter table uplab_chat_grupos add column if not exists carteira text;

-- ---- RLS: leitura p/ qualquer interno autenticado; edição de campos --------
alter table uplab_atendentes        enable row level security;
alter table uplab_chat_grupos       enable row level security;
alter table uplab_chat_mensagens    enable row level security;
alter table uplab_chat_atendimentos enable row level security;
alter table uplab_usuario_atendente enable row level security;
alter table uplab_erp_clientes      enable row level security;
alter table uplab_erp_vinculos      enable row level security;

drop policy if exists sel_atendentes on uplab_atendentes;
drop policy if exists upd_atendentes on uplab_atendentes;
drop policy if exists sel_grupos     on uplab_chat_grupos;
drop policy if exists upd_grupos     on uplab_chat_grupos;
drop policy if exists sel_msgs       on uplab_chat_mensagens;
drop policy if exists sel_atend      on uplab_chat_atendimentos;
drop policy if exists sel_uatend     on uplab_usuario_atendente;
drop policy if exists upd_uatend     on uplab_usuario_atendente;

create policy sel_atendentes on uplab_atendentes for select to authenticated using (true);
create policy upd_atendentes on uplab_atendentes for update to authenticated using (true) with check (true);
create policy sel_grupos     on uplab_chat_grupos for select to authenticated using (true);
create policy upd_grupos     on uplab_chat_grupos for update to authenticated using (true) with check (true);
create policy sel_msgs       on uplab_chat_mensagens for select to authenticated using (true);
create policy sel_atend      on uplab_chat_atendimentos for select to authenticated using (true);
create policy sel_uatend     on uplab_usuario_atendente for select to authenticated using (true);
create policy upd_uatend     on uplab_usuario_atendente for all to authenticated using (true) with check (true);
drop policy if exists sel_erp_c on uplab_erp_clientes;
drop policy if exists sel_erp_v on uplab_erp_vinculos;
create policy sel_erp_c       on uplab_erp_clientes for select to authenticated using (true);
create policy sel_erp_v       on uplab_erp_vinculos for select to authenticated using (true);
