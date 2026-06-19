-- ============================================================================
-- Tickets: catálogo de TÓPICOS (com SLA) + colunas de SLA/prazo no ticket.
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. Idempotente.
--
-- O prazo (SLA) vem do TÓPICO escolhido — não da prioridade do solicitante.
-- SLA em horas ÚTEIS (cálculo seg–sex comercial é feito no app; aqui guardamos
-- o `prazo` já calculado e `sla_horas` aplicado). Gestor+ cadastra tópicos.
-- ============================================================================

create table if not exists uplab_ticket_topicos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  descricao  text,
  sla_horas  int not null default 24,        -- horas úteis até o prazo
  prioridade text not null default 'media',  -- baixa | media | alta | urgente
  ativo      boolean not null default true,
  ordem      int default 0,
  created_at timestamptz default now()
);

alter table uplab_tickets add column if not exists topico_id   uuid references uplab_ticket_topicos(id) on delete set null;
alter table uplab_tickets add column if not exists topico_nome text;   -- nome do tópico OU null p/ assunto livre
alter table uplab_tickets add column if not exists sla_horas   int;
alter table uplab_tickets add column if not exists prazo       timestamptz;
create index if not exists idx_tickets_prazo on uplab_tickets (prazo);

-- RLS: todos os internos leem o catálogo; só gestor+ cria/edita tópicos.
alter table uplab_ticket_topicos enable row level security;
drop policy if exists sel_topicos on uplab_ticket_topicos;
drop policy if exists all_topicos on uplab_ticket_topicos;
create policy sel_topicos on uplab_ticket_topicos for select to authenticated using (true);
create policy all_topicos on uplab_ticket_topicos for all to authenticated
  using (uplab_eh_gestor()) with check (uplab_eh_gestor());
