-- ============================================================================
-- Interno UPLAB — schema do projeto DEDICADO (qdxnejemwztjrqtospht).
-- Banco só nosso: criamos nosso próprio profiles/auth. Rodar no SQL Editor
-- ou via Management API. Idempotente onde possível.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: 1 linha por usuário do Auth. role = nível interno.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  email      text,
  role       text not null default 'funcionario'
             check (role in ('admin', 'diretoria', 'gestor', 'funcionario')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Helpers de papel (SECURITY DEFINER evita recursão de RLS).
create or replace function public.uplab_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
create or replace function public.uplab_is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'diretoria', 'gestor', 'funcionario')
  );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (auth.uid() = id);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.uplab_is_admin()) with check (public.uplab_is_admin());

-- Cria o profile automaticamente no signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Permissões CRUD por usuário.
-- ---------------------------------------------------------------------------
create table if not exists public.uplab_user_permissions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);
alter table public.uplab_user_permissions enable row level security;
drop policy if exists uup_select on public.uplab_user_permissions;
create policy uup_select on public.uplab_user_permissions for select to authenticated
  using (user_id = auth.uid() or public.uplab_is_admin());
drop policy if exists uup_write on public.uplab_user_permissions;
create policy uup_write on public.uplab_user_permissions for all to authenticated
  using (public.uplab_is_admin()) with check (public.uplab_is_admin());

-- ---------------------------------------------------------------------------
-- Permissões de acesso por PAPEL (módulo e tela) + seed.
-- ---------------------------------------------------------------------------
create table if not exists public.uplab_role_permissions (
  role       text not null,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);
alter table public.uplab_role_permissions enable row level security;
drop policy if exists urp_read on public.uplab_role_permissions;
create policy urp_read on public.uplab_role_permissions for select to authenticated using (public.uplab_is_internal());
drop policy if exists urp_write on public.uplab_role_permissions;
create policy urp_write on public.uplab_role_permissions for all to authenticated
  using (public.uplab_is_admin()) with check (public.uplab_is_admin());

insert into public.uplab_role_permissions (role, permission) values
  ('funcionario','atendimento'),('funcionario','atendimento:conversas'),
  ('gestor','atendimento'),('gestor','atendimento:conversas'),('gestor','atendimento:horarios'),('gestor','financeiro'),
  ('diretoria','atendimento'),('diretoria','atendimento:conversas'),('diretoria','atendimento:horarios'),('diretoria','financeiro'),('diretoria','comercial'),('diretoria','campanhas')
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------------------
-- Apelidos editáveis de contatos.
-- ---------------------------------------------------------------------------
create table if not exists public.uplab_contatos (
  chat_id    text primary key,
  apelido    text not null,
  updated_at timestamptz not null default now()
);
alter table public.uplab_contatos enable row level security;
drop policy if exists uc_read on public.uplab_contatos;
create policy uc_read on public.uplab_contatos for select to authenticated using (public.uplab_is_internal());
drop policy if exists uc_write on public.uplab_contatos;
create policy uc_write on public.uplab_contatos for all to authenticated
  using (public.uplab_is_internal()) with check (public.uplab_is_internal());

-- ---------------------------------------------------------------------------
-- Cache de conversas/mensagens (webhook). Leitura interna; escrita service role.
-- ---------------------------------------------------------------------------
create table if not exists public.uplab_conversas (
  conversation_id text primary key,
  chat_id         text not null,
  contact_name    text,
  department      text,
  attendant_name  text,
  labels          jsonb not null default '[]',
  is_closed       boolean not null default false,
  protocol        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz
);
create index if not exists uplab_conversas_chat_idx on public.uplab_conversas (chat_id);
create index if not exists uplab_conversas_updated_idx on public.uplab_conversas (last_message_at desc);
alter table public.uplab_conversas enable row level security;
drop policy if exists uconv_read on public.uplab_conversas;
create policy uconv_read on public.uplab_conversas for select to authenticated using (public.uplab_is_internal());
drop policy if exists uconv_admin_del on public.uplab_conversas;
create policy uconv_admin_del on public.uplab_conversas for delete to authenticated using (public.uplab_is_admin());

create table if not exists public.uplab_mensagens (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text,
  chat_id         text not null,
  contact_name    text,
  direcao         text not null,
  author_type     text,
  author_name     text,
  texto           text,
  evento          text,
  ts              timestamptz not null default now(),
  raw             jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists uplab_mensagens_conv_idx on public.uplab_mensagens (conversation_id, ts);
alter table public.uplab_mensagens enable row level security;
drop policy if exists umsg_read on public.uplab_mensagens;
create policy umsg_read on public.uplab_mensagens for select to authenticated using (public.uplab_is_internal());
drop policy if exists umsg_admin_del on public.uplab_mensagens;
create policy umsg_admin_del on public.uplab_mensagens for delete to authenticated using (public.uplab_is_admin());

-- ---------------------------------------------------------------------------
-- financeiro (módulo de exemplo).
-- ---------------------------------------------------------------------------
create table if not exists public.financeiro (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  tipo        text not null check (tipo in ('receita','despesa')),
  valor_cents bigint not null check (valor_cents > 0),
  categoria   text not null default '',
  data        date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.financeiro enable row level security;
drop policy if exists financeiro_all_authenticated on public.financeiro;
create policy financeiro_all_authenticated on public.financeiro for all to authenticated using (true) with check (true);
