-- ============================================================================
-- Números ignorados no histórico (teste/interno). A consolidação e a limpeza
-- usam esta lista. Adicionar um número = 1 insert aqui. Dedicado qdxnejemwztjrqtospht.
-- ============================================================================

create table if not exists uplab_chat_ignorados (
  numero    text primary key,
  motivo    text,
  criado_em timestamptz default now()
);
insert into uplab_chat_ignorados (numero, motivo) values
  ('554174003872', 'número de teste/interno'),
  ('558197812872', 'teste'),
  ('554192004781', 'teste')
on conflict (numero) do nothing;

alter table uplab_chat_ignorados enable row level security;
drop policy if exists sel_ign on uplab_chat_ignorados;
drop policy if exists all_ign on uplab_chat_ignorados;
create policy sel_ign on uplab_chat_ignorados for select to authenticated using (true);
create policy all_ign on uplab_chat_ignorados for all to authenticated using (uplab_eh_gestor()) with check (uplab_eh_gestor());

-- Recria a consolidação FILTRANDO os ignorados.
create or replace function uplab_consolidar_historico()
returns text language plpgsql security definer set search_path = public as $$
declare cutoff timestamptz; ins_msg int;
begin
  select coalesce(max(ts), timestamptz '2000-01-01') into cutoff from uplab_chat_mensagens;

  insert into uplab_chat_mensagens
    (dedupe_key, chat_id, conversation_id, direcao, classe, autor_nome, autor_tipo, texto, tipo, ts, ord)
  select 'wh:' || m.id, m.chat_id, m.conversation_id, m.direcao,
    case
      when m.evento = 'message_logs' or m.author_type = 'system' then 'sistema'
      when m.author_type = 'bot' then 'robo'
      when m.author_type = 'usuario' or m.direcao = 'recebida' then 'cliente'
      else 'atendente'
    end,
    m.author_name, m.author_type, m.texto, 'text', m.ts,
    (extract(epoch from m.ts) * 1000)::bigint
  from uplab_mensagens m
  where m.ts > cutoff and coalesce(m.texto, '') <> ''
    and m.chat_id not in (select numero from uplab_chat_ignorados)
  on conflict (dedupe_key) do nothing;
  get diagnostics ins_msg = row_count;

  insert into uplab_chat_grupos (chat_id, nome, is_grupo, ultima_msg_at, ultima_msg_texto, busca)
  select c.chat_id, max(c.contact_name), false, max(c.last_message_at),
         (array_agg(c.contact_name order by c.last_message_at desc nulls last))[1], c.chat_id
  from uplab_conversas c
  where c.last_message_at > cutoff and c.chat_id not in (select numero from uplab_chat_ignorados)
  group by c.chat_id
  on conflict (chat_id) do update set
    ultima_msg_at = greatest(uplab_chat_grupos.ultima_msg_at, excluded.ultima_msg_at),
    ultima_msg_texto = coalesce(excluded.ultima_msg_texto, uplab_chat_grupos.ultima_msg_texto),
    nome = coalesce(uplab_chat_grupos.nome, excluded.nome);

  insert into uplab_chat_atendimentos
    (conversation_id, chat_id, dia, inicio, fim, atendente_nome, total_msgs, encerrada, ord)
  select m.conversation_id, max(m.chat_id),
         (min(m.ts) at time zone 'America/Sao_Paulo')::date, min(m.ts), max(m.ts),
         (array_agg(m.author_name) filter (where m.author_type = 'atendente' and m.author_name is not null))[1],
         count(*)::int, bool_or(coalesce(co.is_closed, false)),
         (extract(epoch from min(m.ts)) * 1000)::bigint
  from uplab_mensagens m
  left join uplab_conversas co on co.conversation_id = m.conversation_id
  where m.conversation_id is not null and m.ts > cutoff and coalesce(m.texto, '') <> ''
    and m.chat_id not in (select numero from uplab_chat_ignorados)
  group by m.conversation_id
  on conflict (conversation_id) do update set
    fim = greatest(uplab_chat_atendimentos.fim, excluded.fim),
    total_msgs = uplab_chat_atendimentos.total_msgs + excluded.total_msgs,
    encerrada = excluded.encerrada,
    atendente_nome = coalesce(uplab_chat_atendimentos.atendente_nome, excluded.atendente_nome);

  return format('consolidado: %s mensagens novas (cutoff %s)', ins_msg, cutoff);
end $$;

-- Limpa o que (eventualmente) já entrou desses números.
delete from uplab_chat_mensagens    where chat_id in (select numero from uplab_chat_ignorados) or participante in (select numero from uplab_chat_ignorados);
delete from uplab_chat_atendimentos where chat_id in (select numero from uplab_chat_ignorados);
delete from uplab_chat_grupos       where chat_id in (select numero from uplab_chat_ignorados);
