-- ============================================================================
-- Atendimento: configuração de quais atendentes aparecem nos dashboards.
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. Idempotente.
-- Chave = nome do atendente (trim). Ausente = visível por padrão.
-- Só gestor+ edita (uplab_eh_gestor); todos leem.
-- ============================================================================

create table if not exists uplab_atend_config (
  nome          text primary key,
  visivel       boolean not null default true,
  atualizado_em timestamptz default now()
);

alter table uplab_atend_config enable row level security;
drop policy if exists sel_atendcfg on uplab_atend_config;
drop policy if exists all_atendcfg on uplab_atend_config;
create policy sel_atendcfg on uplab_atend_config for select to authenticated using (true);
create policy all_atendcfg on uplab_atend_config for all to authenticated
  using (uplab_eh_gestor()) with check (uplab_eh_gestor());
