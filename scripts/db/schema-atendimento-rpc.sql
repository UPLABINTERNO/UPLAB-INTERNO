-- ============================================================================
-- Atendimento: RPCs de TEMPO DE RESPOSTA (agregado no banco p/ poupar egress).
-- Projeto Supabase dedicado: qdxnejemwztjrqtospht. Idempotente.
--
-- Tempo de resposta = gap entre uma mensagem do CLIENTE e a próxima do
-- ATENDENTE na mesma conversa (ordenado por ts). Ignora gaps > 12h (overnight)
-- e respostas sem par. Agrupa por nome do atendente (trim, p/ unir 'Kelen' e
-- 'Kelen '). Retorna poucas linhas — o cliente NÃO baixa as 30k mensagens.
-- ============================================================================

create or replace function uplab_tr_atendente(de timestamptz, ate timestamptz)
returns table(atendente text, respostas int, tempo_medio_s numeric)
language sql stable security definer set search_path = public as $$
  with seq as (
    select conversation_id, classe, ts, autor_nome,
           lag(ts)     over (partition by conversation_id order by ts) prev_ts,
           lag(classe) over (partition by conversation_id order by ts) prev_classe
    from uplab_chat_mensagens
    where ts is not null and conversation_id is not null and ts >= de and ts < ate
  )
  select coalesce(nullif(btrim(autor_nome), ''), '(sem nome)') as atendente,
         count(*)::int as respostas,
         round(avg(extract(epoch from (ts - prev_ts))))::numeric as tempo_medio_s
  from seq
  where classe = 'atendente' and prev_classe = 'cliente'
    and ts > prev_ts and (ts - prev_ts) < interval '12 hours'
  group by 1
  order by respostas desc;
$$;

create or replace function uplab_tr_dia(de timestamptz, ate timestamptz)
returns table(dia date, respostas int, tempo_medio_s numeric)
language sql stable security definer set search_path = public as $$
  with seq as (
    select ts, classe,
           lag(ts)     over (partition by conversation_id order by ts) prev_ts,
           lag(classe) over (partition by conversation_id order by ts) prev_classe
    from uplab_chat_mensagens
    where ts is not null and conversation_id is not null and ts >= de and ts < ate
  )
  select (ts at time zone 'America/Sao_Paulo')::date as dia,
         count(*)::int as respostas,
         round(avg(extract(epoch from (ts - prev_ts))))::numeric as tempo_medio_s
  from seq
  where classe = 'atendente' and prev_classe = 'cliente'
    and ts > prev_ts and (ts - prev_ts) < interval '12 hours'
  group by 1
  order by 1;
$$;
