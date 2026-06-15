// Edge Function: webhook-zap
//
// Recebe os eventos do ZapResponder (mensagens, conversas, logs) e grava nas
// tabelas uplab_conversas / uplab_mensagens para o painel de Atendimento.
// É um webhook PÚBLICO (verify_jwt=false) protegido por ?secret=<WEBHOOK_SECRET>.
//
// Aponte o webhook do ZapResponder para:
//   https://<ref>.supabase.co/functions/v1/webhook-zap?secret=<WEBHOOK_SECRET>
//
// Deploy:
//   supabase functions deploy webhook-zap --no-verify-jwt --project-ref cxhdoqwrhxcmsrxccwzd

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const db = createClient(url, serviceKey);

function ts(unixSecOrIso: unknown): string {
  if (typeof unixSecOrIso === 'number') return new Date(unixSecOrIso * 1000).toISOString();
  if (typeof unixSecOrIso === 'string' && unixSecOrIso) return new Date(unixSecOrIso).toISOString();
  return new Date().toISOString();
}

function mapLabels(arr: unknown): unknown[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((l: Record<string, unknown>) => ({ nome: l.nome ?? l.name, color: l.color }));
}

// Atualiza/insere a conversa a partir de um objeto (top-level ou aninhado).
async function upsertConversa(c: Record<string, unknown>, lastMsgAt?: string) {
  const conversation_id = (c._id ?? c.conversationId) as string | undefined;
  const chat_id = c.chatId as string | undefined;
  if (!conversation_id || !chat_id) return;
  const attendant = c.attendant as Record<string, unknown> | null;
  const department = c.department as Record<string, unknown> | null;
  const contact = c.contact as Record<string, unknown> | null;
  const row: Record<string, unknown> = {
    conversation_id,
    chat_id,
    contact_name: c.pushName ?? c.contactName ?? contact?.name ?? null,
    attendant_name: attendant?.name ?? attendant?.nome ?? null,
    department: department?.name ?? department?.nome ?? null,
    labels: mapLabels(c.labels),
    is_closed: c.isClosed === true,
    protocol: c.protocol ?? null,
    updated_at: new Date().toISOString()
  };
  if (lastMsgAt) row.last_message_at = lastMsgAt;
  await db.from('uplab_conversas').upsert(row, { onConflict: 'conversation_id' });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok'); // healthcheck/GET

  if (SECRET) {
    const provided = new URL(req.url).searchParams.get('secret');
    if (provided !== SECRET) return new Response('unauthorized', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const tipo = body.type as string;

  try {
    if (tipo === 'message_received' || tipo === 'message_sent' || tipo === 'message_logs') {
      const message = body.message as Record<string, unknown> | undefined;
      const raw = body.raw_message as Record<string, unknown> | undefined;
      const author = body.author as Record<string, unknown> | undefined;
      const quando = ts(raw?.timestamp);
      const direcao =
        tipo === 'message_received' ? 'recebida' : tipo === 'message_sent' ? 'enviada' : 'sistema';

      await db.from('uplab_mensagens').insert({
        conversation_id: body.conversationId ?? null,
        chat_id: body.chatId,
        contact_name: body.contactName ?? null,
        direcao,
        author_type: author?.type ?? null,
        author_name: author?.name ?? author?.nome ?? null,
        texto: (message?.mensagem ?? message?.content ?? '') as string,
        evento: tipo,
        ts: quando,
        raw: body
      });

      // Garante a conversa na lista, mesmo sem evento conversation_created.
      await db.from('uplab_conversas').upsert(
        {
          conversation_id: (body.conversationId ?? `chat-${body.chatId}`) as string,
          chat_id: body.chatId,
          contact_name: body.contactName ?? null,
          last_message_at: quando,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'conversation_id' }
      );
    } else if (typeof tipo === 'string' && tipo.startsWith('conversation_')) {
      // conversation_created traz os dados no topo; os demais em body.conversation
      const c = (body.conversation ?? body) as Record<string, unknown>;
      await upsertConversa(c);
    }
  } catch (e) {
    console.error('[webhook-zap] erro:', e);
    // Nunca quebra o webhook (evita reenvio infinito do ZapResponder).
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
