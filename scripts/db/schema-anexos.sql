-- ============================================================================
-- Anexos do Chat Interno: bucket de Storage + colunas de anexo nas mensagens.
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. Idempotente.
--
-- Bucket PRIVADO (download só via signed URL gerada pelo app autenticado).
-- Limite de 25 MB por arquivo p/ segurar egress/storage no plano Free.
-- ============================================================================

-- ---- Bucket de anexos -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-anexos', 'chat-anexos', false, 26214400)   -- 25 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit, public = excluded.public;

-- Qualquer interno autenticado lê (signed URL) e envia; remove só o que enviou.
drop policy if exists chat_anexos_sel on storage.objects;
drop policy if exists chat_anexos_ins on storage.objects;
drop policy if exists chat_anexos_del on storage.objects;
create policy chat_anexos_sel on storage.objects for select to authenticated using (bucket_id = 'chat-anexos');
create policy chat_anexos_ins on storage.objects for insert to authenticated with check (bucket_id = 'chat-anexos');
create policy chat_anexos_del on storage.objects for delete to authenticated using (bucket_id = 'chat-anexos' and owner = auth.uid());

-- ---- Colunas de anexo nas 3 tabelas de mensagens ---------------------------
alter table uplab_chat_interno    add column if not exists anexo_path text;
alter table uplab_chat_interno    add column if not exists anexo_nome text;
alter table uplab_chat_interno    add column if not exists anexo_mime text;
alter table uplab_chat_interno    add column if not exists anexo_tam  bigint;

alter table uplab_chat_dm         add column if not exists anexo_path text;
alter table uplab_chat_dm         add column if not exists anexo_nome text;
alter table uplab_chat_dm         add column if not exists anexo_mime text;
alter table uplab_chat_dm         add column if not exists anexo_tam  bigint;

alter table uplab_canal_mensagens add column if not exists anexo_path text;
alter table uplab_canal_mensagens add column if not exists anexo_nome text;
alter table uplab_canal_mensagens add column if not exists anexo_mime text;
alter table uplab_canal_mensagens add column if not exists anexo_tam  bigint;
