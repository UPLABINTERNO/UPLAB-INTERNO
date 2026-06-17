// Edge Function: zap-conversa
//
// Busca o histórico de conversa de um cliente no ZapResponder, por telefone.
// O token do ZapResponder vive só aqui (secret ZAP_TOKEN) — nunca no app.
// Só usuários internos autenticados podem chamar.
//
// GET ?phone=5541999999999  ->  { conversa, mensagens: [...] }
//
// Deploy:
//   supabase functions deploy zap-conversa --project-ref cxhdoqwrhxcmsrxccwzd

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ZAP_BASE = Deno.env.get('ZAP_BASE_URL')!;
const ZAP_TOKEN = Deno.env.get('ZAP_TOKEN')!;
const INTERNOS = ['admin', 'diretoria', 'gestor', 'funcionario'];

function direcao(autor: string): 'recebida' | 'enviada' {
  return autor === 'usuario' ? 'recebida' : 'enviada';
}
function autorLabel(autor: string): string {
  if (autor === 'usuario') return 'Cliente';
  if (autor === 'bot') return 'Robô';
  return 'Atendente';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'sem token' });

  // 1) Valida que o chamador é um usuário interno.
  const caller = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(401, { error: 'token inválido' });
  const { data: prof } = await caller.from('profiles').select('role').eq('id', user.id).single();
  if (!prof || !INTERNOS.includes(prof.role)) return json(403, { error: 'acesso restrito' });

  // 2) Telefone (via query ?phone= ou body {phone}; só dígitos; garante DDI 55).
  let phoneRaw = new URL(req.url).searchParams.get('phone') ?? '';
  if (!phoneRaw && req.method === 'POST') {
    try {
      phoneRaw = ((await req.json()) as { phone?: string }).phone ?? '';
    } catch {
      /* sem body */
    }
  }
  const raw = String(phoneRaw).replace(/\D/g, '');
  if (raw.length < 10) return json(400, { error: 'telefone inválido' });
  const phone = raw.startsWith('55') ? raw : `55${raw}`;

  const zapHeaders = { Authorization: `Bearer ${ZAP_TOKEN}` };

  try {
    // Mapa id->nome dos atendentes (para mostrar quem respondeu).
    const atendentes: Record<string, string> = {};
    try {
      const aRes = await fetch(`${ZAP_BASE}/atendentes`, { headers: zapHeaders });
      if (aRes.ok) {
        const arr = await aRes.json();
        if (Array.isArray(arr)) for (const a of arr) atendentes[a._id] = a.nome;
      }
    } catch {
      /* segue sem nomes */
    }
    const nomeAtendente = (autor: string) => atendentes[autor] ?? null;

    // 3) Conversa por telefone.
    const cRes = await fetch(`${ZAP_BASE}/v2/conversations/chatId/${phone}?includeClosed=true`, { headers: zapHeaders });
    if (cRes.status === 404) return json(200, { conversa: null, mensagens: [] });
    if (!cRes.ok) return json(502, { error: `ZapResponder ${cRes.status}` });
    const conv = (await cRes.json())?.conversation;
    if (!conv) return json(200, { conversa: null, mensagens: [] });
    const id = conv._id ?? conv.id;

    // 4) Mensagens da conversa (uma página; cursor disponível p/ paginação futura).
    const mRes = await fetch(`${ZAP_BASE}/v2/conversations/${id}/messages`, { headers: zapHeaders });
    const mJson = mRes.ok ? await mRes.json() : { messages: [] };
    const lista = Array.isArray(mJson.messages) ? mJson.messages : [];

    const mensagens = lista
      .map((m: Record<string, unknown>) => {
        const msg = (m.mensagem ?? {}) as Record<string, unknown>;
        const autor = String(m.autor ?? '');
        const nome = nomeAtendente(autor);
        return {
          id: m._id,
          texto: (msg.mensagem ?? msg.content ?? '') as string,
          tipo: (msg.type ?? 'text') as string,
          autor,
          // Nome do atendente quando houver; senão Cliente/Robô/Atendente.
          autor_label: nome ?? autorLabel(autor),
          direcao: direcao(autor),
          ts: m.createdAt as string
        };
      })
      .filter((m: { texto: string }) => m.texto)
      .sort((a: { ts: string }, b: { ts: string }) => +new Date(a.ts) - +new Date(b.ts));

    return json(200, {
      conversa: {
        id,
        chat_id: phone,
        contato: conv.pushName ?? conv.name ?? conv.contato?.name ?? null,
        is_fechado: conv.isFechado === true,
        status: conv.status ?? null,
        atendente: conv.atendente ?? null,
        atendente_nome: conv.atendente ? nomeAtendente(conv.atendente) : null,
        qtd_etiquetas: Array.isArray(conv.etiquetas) ? conv.etiquetas.length : 0,
        count: conv.count ?? mensagens.length,
        next_cursor: mJson.nextCursor ?? null
      },
      mensagens
    });
  } catch (e) {
    return json(502, { error: String(e) });
  }
});
