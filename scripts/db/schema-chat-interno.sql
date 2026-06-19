-- ============================================================================
-- Chat Interno: Setores (departamentos) + Canais/Grupos.
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. Idempotente.
--
-- Modelo:
--   uplab_setores          — setor/departamento.
--   uplab_usuario_setor    — N:N usuário<->setor (um usuário em vários setores).
--   uplab_canais           — canal de SETOR (automático) ou GRUPO (manual).
--   uplab_canal_setores    — vincula um grupo a setores inteiros (entre setores).
--   uplab_canal_membros    — membros diretos de um grupo (além dos vindos do setor).
--   uplab_canal_mensagens  — mensagens dos canais/grupos.
--
-- Participação automática: ao entrar num setor o usuário passa a enxergar o
-- canal daquele setor E todo grupo vinculado ao setor — sem adicionar 1 a 1.
-- ============================================================================

-- ---- Setores (= departamentos) ---------------------------------------------
create table if not exists uplab_setores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  descricao  text,
  cor        text,
  criado_em  timestamptz default now()
);

-- ---- Associação usuário <-> setor (N:N) ------------------------------------
create table if not exists uplab_usuario_setor (
  user_id   uuid not null,
  setor_id  uuid not null references uplab_setores(id) on delete cascade,
  criado_em timestamptz default now(),
  primary key (user_id, setor_id)
);
create index if not exists idx_usetor_user  on uplab_usuario_setor (user_id);
create index if not exists idx_usetor_setor on uplab_usuario_setor (setor_id);

-- ---- Canais (canal de setor automático OU grupo manual) --------------------
create table if not exists uplab_canais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  tipo       text not null default 'grupo',   -- 'setor' | 'grupo'
  setor_id   uuid references uplab_setores(id) on delete cascade,  -- só p/ tipo='setor'
  descricao  text,
  criado_por uuid,
  criado_em  timestamptz default now()
);
create index if not exists idx_canais_setor on uplab_canais (setor_id);
create unique index if not exists uq_canal_setor on uplab_canais (setor_id) where tipo = 'setor';

-- ---- Grupos vinculados a setores inteiros (comunicação entre setores) ------
create table if not exists uplab_canal_setores (
  canal_id uuid not null references uplab_canais(id) on delete cascade,
  setor_id uuid not null references uplab_setores(id) on delete cascade,
  primary key (canal_id, setor_id)
);

-- ---- Membros diretos de um grupo -------------------------------------------
create table if not exists uplab_canal_membros (
  canal_id uuid not null references uplab_canais(id) on delete cascade,
  user_id  uuid not null,
  primary key (canal_id, user_id)
);

-- ---- Mensagens dos canais/grupos -------------------------------------------
create table if not exists uplab_canal_mensagens (
  id         bigint generated always as identity primary key,
  canal_id   uuid not null references uplab_canais(id) on delete cascade,
  user_id    uuid,
  autor_nome text,
  texto      text not null,
  created_at timestamptz default now()
);
create index if not exists idx_canalmsg_canal on uplab_canal_mensagens (canal_id, created_at);

-- ---- Criar setor cria o canal de setor automaticamente ---------------------
create or replace function uplab_setor_cria_canal() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into uplab_canais (nome, tipo, setor_id) values (new.nome, 'setor', new.id);
  return new;
end $$;
drop trigger if exists trg_setor_canal on uplab_setores;
create trigger trg_setor_canal after insert on uplab_setores
  for each row execute function uplab_setor_cria_canal();

-- ---- Renomear setor mantém o nome do canal de setor em sincronia -----------
create or replace function uplab_setor_sync_canal() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update uplab_canais set nome = new.nome where tipo = 'setor' and setor_id = new.id;
  return new;
end $$;
drop trigger if exists trg_setor_sync on uplab_setores;
create trigger trg_setor_sync after update on uplab_setores
  for each row execute function uplab_setor_sync_canal();

-- ---- Canais visíveis para o usuário atual (setor + grupo direto + grupo via setor)
create or replace function uplab_meus_canais()
  returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from uplab_canais c
    join uplab_usuario_setor us on us.setor_id = c.setor_id
   where c.tipo = 'setor' and us.user_id = auth.uid()
  union
  select cm.canal_id from uplab_canal_membros cm where cm.user_id = auth.uid()
  union
  select cs.canal_id from uplab_canal_setores cs
    join uplab_usuario_setor us on us.setor_id = cs.setor_id
   where us.user_id = auth.uid();
$$;

-- ---- RLS -------------------------------------------------------------------
alter table uplab_setores         enable row level security;
alter table uplab_usuario_setor   enable row level security;
alter table uplab_canais          enable row level security;
alter table uplab_canal_setores   enable row level security;
alter table uplab_canal_membros   enable row level security;
alter table uplab_canal_mensagens enable row level security;

-- Cadastro (setores/canais/membros): leitura e escrita p/ qualquer interno
-- autenticado; o gate por papel (gestor+) é feito na UI. Endurecer depois se preciso.
drop policy if exists sel_setores on uplab_setores;
drop policy if exists all_setores on uplab_setores;
create policy sel_setores on uplab_setores for select to authenticated using (true);
create policy all_setores on uplab_setores for all to authenticated using (true) with check (true);

drop policy if exists sel_usetor on uplab_usuario_setor;
drop policy if exists all_usetor on uplab_usuario_setor;
create policy sel_usetor on uplab_usuario_setor for select to authenticated using (true);
create policy all_usetor on uplab_usuario_setor for all to authenticated using (true) with check (true);

drop policy if exists sel_canais on uplab_canais;
drop policy if exists all_canais on uplab_canais;
create policy sel_canais on uplab_canais for select to authenticated using (true);
create policy all_canais on uplab_canais for all to authenticated using (true) with check (true);

drop policy if exists sel_canalset on uplab_canal_setores;
drop policy if exists all_canalset on uplab_canal_setores;
create policy sel_canalset on uplab_canal_setores for select to authenticated using (true);
create policy all_canalset on uplab_canal_setores for all to authenticated using (true) with check (true);

drop policy if exists sel_canalmemb on uplab_canal_membros;
drop policy if exists all_canalmemb on uplab_canal_membros;
create policy sel_canalmemb on uplab_canal_membros for select to authenticated using (true);
create policy all_canalmemb on uplab_canal_membros for all to authenticated using (true) with check (true);

-- Mensagens: só lê de canais que o usuário enxerga; só insere como ele mesmo.
drop policy if exists sel_canalmsg on uplab_canal_mensagens;
drop policy if exists ins_canalmsg on uplab_canal_mensagens;
create policy sel_canalmsg on uplab_canal_mensagens for select to authenticated
  using (canal_id in (select uplab_meus_canais()));
create policy ins_canalmsg on uplab_canal_mensagens for insert to authenticated
  with check (user_id = auth.uid() and canal_id in (select uplab_meus_canais()));

-- ---- Realtime --------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table uplab_canal_mensagens;
exception when others then null; end $$;
