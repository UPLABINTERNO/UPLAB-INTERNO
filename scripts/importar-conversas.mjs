// ============================================================================
// Importa o export do ZapResponder (conversas/*.json) para o Supabase dedicado.
//   node --env-file=.env scripts/importar-conversas.mjs
//
// - Agrupa conversas por chatId (cada grupo de WhatsApp = uma ótica/loja).
// - ORDEM confiável: metade das mensagens não tem timestamp; a ordem real é a
//   do array. Gravamos `ord` = createdAt(conversa) + índice, e ordenamos por ele.
// - ATENDENTE: usa author.name; quando falta, herda o último que "assumiu/
//   transferiu" (dos logs) ou o atendente da conversa.
// - STATUS: is_closed do grupo = status da conversa MAIS RECENTE.
// - Idempotente: ON CONFLICT DO UPDATE (reprocessa e corrige).
// ============================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', 'conversas');
const DB_URL = process.env.SUPABASE_DB_URL;
const ZAP_BASE = process.env.ZAP_BASE_URL;
const ZAP_TOKEN = process.env.ZAP_TOKEN;
if (!DB_URL) throw new Error('SUPABASE_DB_URL ausente no .env');

const IGNORAR = /facebook leads|formul[aá]rio recebido/i; // (mantido p/ referência)
const ACAO = /assumiu a conversa|transferi|encerr|entrou na (fila|conversa)|saiu da conversa|reabriu|aguarde.*transferindo|bot (ativado|desativado)/i;
const norm = (v) => (v === 'null' || v === 'undefined' || v == null ? null : v);
const ehGrupoId = (id) => /^120363\d+/.test(id) || String(id).length > 16;
const ehTelefone = (id) => /^\d{10,15}$/.test(String(id)) && !ehGrupoId(id);
const codigoDoNome = (nome) => (nome && nome.match(/[-–]\s*(\d{2,6})\s*$/)?.[1]) || null;

function classificar(m, texto) {
  const tipo = m.type;
  const at = m.author?.type;
  if (tipo === 'message_logs' || at === 'system' || ACAO.test(texto)) return { classe: 'sistema', direcao: 'sistema' };
  if (at === 'usuario' || tipo === 'message_received') return { classe: 'cliente', direcao: 'recebida' };
  if (at === 'bot') return { classe: 'robo', direcao: 'enviada' };
  return { classe: 'atendente', direcao: 'enviada' };
}

// "ADM assumiu a conversa" / "Kelen transferiu para Robô" -> "ADM" / "Kelen"
function nomeDoLog(texto) {
  const m = texto.match(/^(.{2,40}?)\s+(?:assumiu|transferiu|entrou na|reabriu|saiu da)/i);
  const n = m?.[1]?.trim();
  return n && !/^rob[oô]$/i.test(n) ? n : null;
}

async function puxarAtendentes() {
  const map = {};
  if (!ZAP_BASE || !ZAP_TOKEN) return map;
  try {
    const r = await fetch(`${ZAP_BASE}/api/atendentes`, { headers: { Authorization: `Bearer ${ZAP_TOKEN}` } });
    if (!r.ok) return map;
    for (const a of await r.json()) map[a._id] = { nome: (a.nome || '').trim(), email: a.email ?? null, is_admin: !!a.isAdmin, is_ativo: a.isAtivo !== false };
    console.log(`[import] ${Object.keys(map).length} atendentes da API`);
  } catch (e) { console.warn('[import] atendentes API:', e.message); }
  return map;
}

function arquivoJson() {
  const f = readdirSync(DIR).find((x) => x.endsWith('.json') && !x.startsWith('._') && x.includes('conversations'));
  if (!f) throw new Error('nenhum export .json em conversas/');
  return join(DIR, f);
}

async function main() {
  const atendentes = await puxarAtendentes();
  const nomeAtendente = (uuid) => (uuid && atendentes[uuid]?.nome) || null;

  console.log('[import] lendo JSON…');
  const data = JSON.parse(readFileSync(arquivoJson(), 'utf8'));
  console.log(`[import] ${data.length} conversas`);

  const grupos = new Map();
  const mensagens = [];
  const atendimentos = [];

  for (const c of data) {
    const chatId = c.chatId;
    if (!chatId) continue;
    const convId = norm(c._id) || norm(c.conversationId);
    const base = Date.parse(norm(c.createdAt) || norm(c.dataInicioConversa) || '') || 0;

    let g = grupos.get(chatId);
    if (!g) {
      g = {
        chat_id: chatId, nome: null, nomeDireto: null, origem: c.origem ?? null, is_grupo: ehGrupoId(chatId),
        atendente_uuid: norm(c.atendente), departamento_uuid: norm(c.departamento) || norm(c.departamento_responsavel_atendimento),
        is_closed: false, foto_url: null, total_mensagens: 0, convIds: new Set(), telefones: new Map(),
        primeira: null, ultima: null, ultimaTexto: null, maxBase: -1
      };
      grupos.set(chatId, g);
    }
    if (convId) g.convIds.add(convId);
    // status e atendente vêm da conversa MAIS RECENTE
    if (base >= g.maxBase) {
      g.maxBase = base;
      g.is_closed = c.isFechado === 'true' || c.isFechado === true;
      if (norm(c.atendente)) g.atendente_uuid = norm(c.atendente);
    }

    let atendenteAtual = nomeAtendente(norm(c.atendente)); // propaga dentro da conversa
    let ultimoTsMs = base || Date.now();
    let primeiraCliente = null;

    const msgs = c.messages || [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const raw = m.raw_message || {};
      const mtipo = m.message?.type || 'text';
      let texto = (m.message?.mensagem ?? m.message?.content ?? '').toString().trim();
      if (!texto && mtipo !== 'text') texto = mtipo === 'file' ? '[arquivo]' : `[${mtipo}]`;

      // timestamp p/ EXIBIR: real quando existe; senão herda o último conhecido
      const tNum = raw.timestamp;
      if (typeof tNum === 'number') ultimoTsMs = tNum > 1e12 ? tNum : tNum * 1000;
      const ts = new Date(ultimoTsMs).toISOString();
      const ord = base + i; // ORDEM confiável

      const { classe, direcao } = classificar(m, texto);

      if (m.author?.name) atendenteAtual = norm(m.author.name);
      else if (classe === 'sistema') { const n = nomeDoLog(texto); if (n) atendenteAtual = n; }

      if (raw.infoGroup?.name && !g.nome) g.nome = raw.infoGroup.name;
      if (raw.isgroup === true) g.is_grupo = true;
      const participante = norm(raw.participant);
      const pushName = norm(raw.pushName) || norm(m.contactName);

      let autor_nome = null;
      let atendente_uuid = null;
      if (classe === 'cliente') {
        autor_nome = pushName;
        if (!primeiraCliente && texto && !IGNORAR.test(texto) && texto.toLowerCase() !== 'start') primeiraCliente = texto;
        if (pushName && !g.is_grupo) g.nomeDireto = pushName; // nome do contato (conversa direta)
        if (participante && !g.telefones.has(participante)) g.telefones.set(participante, pushName || null);
        if (!g.is_grupo && raw.profilePicture && !g.foto_url) g.foto_url = raw.profilePicture;
      } else if (classe === 'atendente') {
        autor_nome = norm(m.author?.name) || atendenteAtual || nomeAtendente(g.atendente_uuid);
        atendente_uuid = g.atendente_uuid;
      }

      mensagens.push({
        dedupe_key: raw.id ? `wa:${raw.id}` : `c:${convId ?? chatId}#${i}`,
        chat_id: chatId, conversation_id: convId, protocolo: norm(c.protocolo) || norm(m.protocol),
        direcao, classe, autor_nome, autor_tipo: norm(m.author?.type), atendente_uuid,
        participante, texto, tipo: mtipo, media_url: null, ts, ord
      });

      g.total_mensagens++;
      if (!g.primeira || ord < g.primeira) g.primeira = ts;
      if (g.ultima === null || ord >= g.ultimaOrd) { g.ultima = ts; g.ultimaOrd = ord; g.ultimaTexto = texto; }
    }

    if (convId) {
      atendimentos.push({
        conversation_id: convId, chat_id: chatId,
        dia: base ? new Date(base).toISOString().slice(0, 10) : null,
        inicio: base ? new Date(base).toISOString() : null,
        fim: new Date(ultimoTsMs).toISOString(),
        atendente_uuid: norm(c.atendente),
        atendente_nome: atendenteAtual || nomeAtendente(norm(c.atendente)),
        departamento_uuid: norm(c.departamento) || norm(c.departamento_responsavel_atendimento),
        total_msgs: msgs.length,
        encerrada: c.isFechado === 'true' || c.isFechado === true,
        resumo: primeiraCliente,
        ord: base
      });
    }
  }

  console.log(`[import] ${grupos.size} grupos, ${mensagens.length} mensagens`);

  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const [uuid, a] of Object.entries(atendentes)) {
      await client.query(
        `insert into uplab_atendentes (uuid,nome,email,is_admin,is_ativo,atualizado_em) values ($1,$2,$3,$4,$5,now())
         on conflict (uuid) do update set nome=excluded.nome,email=excluded.email,is_admin=excluded.is_admin,is_ativo=excluded.is_ativo,atualizado_em=now()`,
        [uuid, a.nome, a.email, a.is_admin, a.is_ativo]
      );
    }

    for (const g of grupos.values()) {
      const telefones = [...g.telefones.entries()].map(([telefone, nome]) => ({ telefone, nome }));
      if (!g.is_grupo && ehTelefone(g.chat_id) && !telefones.some((t) => t.telefone === g.chat_id)) telefones.unshift({ telefone: g.chat_id, nome: g.nome });
      const nome = g.nome || g.nomeDireto || g.chat_id;
      const codigo_loja = codigoDoNome(g.nome);
      const busca = [nome, codigo_loja, ...telefones.map((t) => t.telefone), ...telefones.map((t) => t.nome)].filter(Boolean).join(' ');
      await client.query(
        `insert into uplab_chat_grupos
          (chat_id,nome,origem,is_grupo,codigo_loja,atendente_uuid,departamento_uuid,total_mensagens,total_conversas,is_closed,foto_url,primeira_msg_at,ultima_msg_at,ultima_msg_texto,telefones,busca,atualizado_em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
         on conflict (chat_id) do update set
           nome=excluded.nome,origem=excluded.origem,is_grupo=excluded.is_grupo,
           codigo_loja=coalesce(uplab_chat_grupos.codigo_loja,excluded.codigo_loja),
           atendente_uuid=excluded.atendente_uuid,departamento_uuid=excluded.departamento_uuid,
           total_mensagens=excluded.total_mensagens,total_conversas=excluded.total_conversas,is_closed=excluded.is_closed,
           foto_url=coalesce(uplab_chat_grupos.foto_url,excluded.foto_url),
           primeira_msg_at=excluded.primeira_msg_at,ultima_msg_at=excluded.ultima_msg_at,ultima_msg_texto=excluded.ultima_msg_texto,
           telefones=excluded.telefones,busca=excluded.busca,atualizado_em=now()`,
        [g.chat_id, nome, g.origem, g.is_grupo, codigo_loja, g.atendente_uuid, g.departamento_uuid, g.total_mensagens, g.convIds.size,
         g.is_closed, g.foto_url, g.primeira, g.ultima, g.ultimaTexto, JSON.stringify(telefones), busca]
      );
    }
    console.log(`[import] ${grupos.size} grupos gravados`);

    const COLS = ['dedupe_key', 'chat_id', 'conversation_id', 'protocolo', 'direcao', 'classe', 'autor_nome', 'autor_tipo', 'atendente_uuid', 'participante', 'texto', 'tipo', 'media_url', 'ts', 'ord'];
    const BATCH = 500;
    for (let i = 0; i < mensagens.length; i += BATCH) {
      const slice = mensagens.slice(i, i + BATCH);
      const vals = [];
      const params = [];
      slice.forEach((m, j) => {
        const b = j * COLS.length;
        vals.push(`(${COLS.map((_, k) => `$${b + k + 1}`).join(',')})`);
        params.push(m.dedupe_key, m.chat_id, m.conversation_id, m.protocolo, m.direcao, m.classe, m.autor_nome, m.autor_tipo, m.atendente_uuid, m.participante, m.texto, m.tipo, m.media_url, m.ts, m.ord);
      });
      await client.query(
        `insert into uplab_chat_mensagens (${COLS.join(',')}) values ${vals.join(',')}
         on conflict (dedupe_key) do update set
           direcao=excluded.direcao,classe=excluded.classe,autor_nome=excluded.autor_nome,autor_tipo=excluded.autor_tipo,
           atendente_uuid=excluded.atendente_uuid,participante=excluded.participante,texto=excluded.texto,tipo=excluded.tipo,ts=excluded.ts,ord=excluded.ord`,
        params
      );
      if (i % 5000 === 0) console.log(`[import] mensagens ${i}/${mensagens.length}…`);
    }
    console.log(`[import] ${mensagens.length} mensagens processadas`);

    // Atendimentos (1 por conversa)
    const ACOLS = ['conversation_id', 'chat_id', 'dia', 'inicio', 'fim', 'atendente_uuid', 'atendente_nome', 'departamento_uuid', 'total_msgs', 'encerrada', 'resumo', 'ord'];
    for (let i = 0; i < atendimentos.length; i += 500) {
      const slice = atendimentos.slice(i, i + 500);
      const vals = [];
      const params = [];
      slice.forEach((a, j) => {
        const b = j * ACOLS.length;
        vals.push(`(${ACOLS.map((_, k) => `$${b + k + 1}`).join(',')})`);
        params.push(a.conversation_id, a.chat_id, a.dia, a.inicio, a.fim, a.atendente_uuid, a.atendente_nome, a.departamento_uuid, a.total_msgs, a.encerrada, a.resumo, a.ord);
      });
      await client.query(
        `insert into uplab_chat_atendimentos (${ACOLS.join(',')}) values ${vals.join(',')}
         on conflict (conversation_id) do update set
           chat_id=excluded.chat_id,dia=excluded.dia,inicio=excluded.inicio,fim=excluded.fim,
           atendente_uuid=excluded.atendente_uuid,atendente_nome=excluded.atendente_nome,departamento_uuid=excluded.departamento_uuid,
           total_msgs=excluded.total_msgs,encerrada=excluded.encerrada,resumo=excluded.resumo,ord=excluded.ord`,
        params
      );
    }
    console.log(`[import] ${atendimentos.length} atendimentos gravados`);
  } finally {
    await client.end();
  }
  console.log('[import] OK');
}

main().catch((e) => { console.error('[import] FALHOU:', e); process.exit(1); });
