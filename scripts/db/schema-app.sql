-- ============================================================================
-- Config de módulos (ativar/desativar) + Chat interno da equipe.
-- Idempotente.
-- ============================================================================

-- ---- Ativação de módulos (override do padrão do catálogo) ------------------
create table if not exists uplab_modulos (
  id            text primary key,
  ativo         boolean not null default true,
  atualizado_em timestamptz default now()
);

-- ---- Chat interno (canal único da equipe) ---------------------------------
create table if not exists uplab_chat_interno (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  autor_nome text,
  texto      text not null,
  created_at timestamptz default now()
);
create index if not exists idx_chatint_ts on uplab_chat_interno (created_at);

-- ---- Mensagens diretas (1:1 entre usuários internos) ----------------------
create table if not exists uplab_chat_dm (
  id         bigint generated always as identity primary key,
  de_id      uuid not null,
  para_id    uuid not null,
  de_nome    text,
  texto      text not null,
  lida       boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_dm_par on uplab_chat_dm (de_id, para_id, created_at);

alter table uplab_modulos      enable row level security;
alter table uplab_chat_interno enable row level security;
alter table uplab_chat_dm      enable row level security;

drop policy if exists sel_modulos on uplab_modulos;
drop policy if exists all_modulos on uplab_modulos;
drop policy if exists sel_chatint on uplab_chat_interno;
drop policy if exists ins_chatint on uplab_chat_interno;

create policy sel_modulos on uplab_modulos for select to authenticated using (true);
create policy all_modulos on uplab_modulos for all to authenticated using (true) with check (true);
create policy sel_chatint on uplab_chat_interno for select to authenticated using (true);
create policy ins_chatint on uplab_chat_interno for insert to authenticated with check (user_id = auth.uid());

drop policy if exists sel_dm on uplab_chat_dm;
drop policy if exists ins_dm on uplab_chat_dm;
-- Cada um vê só as DMs em que participa.
create policy sel_dm on uplab_chat_dm for select to authenticated using (de_id = auth.uid() or para_id = auth.uid());
create policy ins_dm on uplab_chat_dm for insert to authenticated with check (de_id = auth.uid());

-- Realtime (ignora se já estiver na publicação).
do $$ begin
  alter publication supabase_realtime add table uplab_chat_interno;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table uplab_chat_dm;
exception when others then null; end $$;
