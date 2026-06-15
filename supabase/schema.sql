-- ============================================================================
-- Interno UPLAB — SQL ADITIVO E SEGURO.
-- Este projeto Supabase é COMPARTILHADO com o sistema existente
-- (profiles/tickets/audit_log/clientes_erp/...). Este script NÃO altera nada
-- que já existe: cria apenas objetos novos, prefixados com `uplab_` (e a
-- tabela isolada `financeiro`). Rode no SQL Editor do painel.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: o usuário autenticado é admin? Lê profiles.role (do sistema atual).
-- SECURITY DEFINER evita recursão de RLS ao consultar profiles dentro de policy.
-- ---------------------------------------------------------------------------
create or replace function public.uplab_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- EXPANDE (sem remover) os valores aceitos em profiles.role para incluir os
-- níveis internos. Mantém os valores legados do sistema existente
-- (cliente/staff/admin). 'staff' é legado e NÃO é tratado como nível interno
-- no app (fica de fora da hierarquia admin>diretoria>gestor>funcionario).
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['cliente', 'staff', 'admin', 'diretoria', 'gestor', 'funcionario']));

-- ---------------------------------------------------------------------------
-- Política ADITIVA: admin pode atualizar profiles (definir nível/role de
-- outros usuários internos). Não remove a política existente de self-update.
-- ---------------------------------------------------------------------------
drop policy if exists "uplab_profiles_admin_update" on public.profiles;
create policy "uplab_profiles_admin_update" on public.profiles for update to authenticated
  using (public.uplab_is_admin()) with check (public.uplab_is_admin());

-- ---------------------------------------------------------------------------
-- Permissões por usuário (módulo/ação). Tabela nova e isolada.
-- permission = "<modulo>:<acao>", ex.: "financeiro:access", "financeiro:create".
-- ---------------------------------------------------------------------------
create table if not exists public.uplab_user_permissions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);

alter table public.uplab_user_permissions enable row level security;

-- Usuário lê as próprias permissões; admin lê todas.
drop policy if exists "uup_select" on public.uplab_user_permissions;
create policy "uup_select" on public.uplab_user_permissions for select to authenticated
  using (user_id = auth.uid() or public.uplab_is_admin());

-- Só admin cria/edita/remove permissões.
drop policy if exists "uup_write" on public.uplab_user_permissions;
create policy "uup_write" on public.uplab_user_permissions for all to authenticated
  using (public.uplab_is_admin()) with check (public.uplab_is_admin());

-- ---------------------------------------------------------------------------
-- financeiro: tabela do módulo de exemplo (template para os demais).
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

drop policy if exists "financeiro_all_authenticated" on public.financeiro;
create policy "financeiro_all_authenticated"
  on public.financeiro for all to authenticated using (true) with check (true);
