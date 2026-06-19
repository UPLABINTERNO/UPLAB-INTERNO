-- ============================================================================
-- Tickets Internos: chamados direcionados a uma PESSOA, com comentários/anexos.
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. Idempotente.
--
-- Visibilidade RESTRITA: solicitante e responsável veem o ticket; gestor+
-- (gestor/diretoria/admin) veem todos. Comentários seguem a visibilidade do
-- ticket pai. Anexos vão no bucket privado `chat-anexos` (scope 'tickets/...').
-- ============================================================================

-- ---- Tickets ---------------------------------------------------------------
create table if not exists uplab_tickets (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  descricao       text,
  prioridade      text not null default 'media',   -- baixa | media | alta | urgente
  status          text not null default 'aberto',  -- aberto | andamento | resolvido | fechado
  solicitante_id  uuid not null,
  solicitante_nome text,
  responsavel_id  uuid,
  responsavel_nome text,
  anexo_path text, anexo_nome text, anexo_mime text, anexo_tam bigint,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  resolvido_em    timestamptz
);
create index if not exists idx_tickets_solic   on uplab_tickets (solicitante_id);
create index if not exists idx_tickets_resp    on uplab_tickets (responsavel_id);
create index if not exists idx_tickets_status  on uplab_tickets (status);
create index if not exists idx_tickets_created on uplab_tickets (created_at desc);

-- ---- Comentários / andamento -----------------------------------------------
create table if not exists uplab_ticket_comentarios (
  id         bigint generated always as identity primary key,
  ticket_id  uuid not null references uplab_tickets(id) on delete cascade,
  user_id    uuid,
  autor_nome text,
  texto      text,
  anexo_path text, anexo_nome text, anexo_mime text, anexo_tam bigint,
  created_at timestamptz default now()
);
create index if not exists idx_tcom_ticket on uplab_ticket_comentarios (ticket_id, created_at);

-- ---- Funções de autoridade (security definer: ignoram RLS internamente) -----
create or replace function uplab_eh_gestor() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('gestor','diretoria','admin'));
$$;

create or replace function uplab_pode_ver_ticket(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select uplab_eh_gestor() or exists (
    select 1 from uplab_tickets t
    where t.id = tid and (t.solicitante_id = auth.uid() or t.responsavel_id = auth.uid())
  );
$$;

-- ---- RLS -------------------------------------------------------------------
alter table uplab_tickets            enable row level security;
alter table uplab_ticket_comentarios enable row level security;

drop policy if exists sel_tickets on uplab_tickets;
drop policy if exists ins_tickets on uplab_tickets;
drop policy if exists upd_tickets on uplab_tickets;
drop policy if exists del_tickets on uplab_tickets;
create policy sel_tickets on uplab_tickets for select to authenticated
  using (solicitante_id = auth.uid() or responsavel_id = auth.uid() or uplab_eh_gestor());
create policy ins_tickets on uplab_tickets for insert to authenticated
  with check (solicitante_id = auth.uid());
create policy upd_tickets on uplab_tickets for update to authenticated
  using (solicitante_id = auth.uid() or responsavel_id = auth.uid() or uplab_eh_gestor())
  with check (solicitante_id = auth.uid() or responsavel_id = auth.uid() or uplab_eh_gestor());
create policy del_tickets on uplab_tickets for delete to authenticated
  using (solicitante_id = auth.uid() or uplab_eh_gestor());

drop policy if exists sel_tcom on uplab_ticket_comentarios;
drop policy if exists ins_tcom on uplab_ticket_comentarios;
create policy sel_tcom on uplab_ticket_comentarios for select to authenticated
  using (uplab_pode_ver_ticket(ticket_id));
create policy ins_tcom on uplab_ticket_comentarios for insert to authenticated
  with check (user_id = auth.uid() and uplab_pode_ver_ticket(ticket_id));
