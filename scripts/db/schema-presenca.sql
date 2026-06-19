-- ============================================================================
-- Presença dos usuários internos (online / ausente / almoço; offline derivado).
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. Idempotente.
--
-- `status` é o status MANUAL escolhido (online|ausente|almoco). "offline" não
-- é gravado: o app deriva offline quando `last_seen` está velho (sem heartbeat).
-- ============================================================================

create table if not exists uplab_presenca (
  user_id    uuid primary key,
  status     text not null default 'online',   -- online | ausente | almoco
  last_seen  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_presenca_seen on uplab_presenca (last_seen desc);

alter table uplab_presenca enable row level security;

drop policy if exists sel_presenca on uplab_presenca;
drop policy if exists all_presenca on uplab_presenca;
-- todos os internos leem a presença de todos; cada um só escreve a própria.
create policy sel_presenca on uplab_presenca for select to authenticated using (true);
create policy all_presenca on uplab_presenca for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table uplab_presenca;
exception when others then null; end $$;
