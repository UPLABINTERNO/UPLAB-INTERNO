// Edge Function: zap-info
//
// Painel de integração (somente leitura) do ZapResponder.
// GET ?recurso=atendentes|departamentos|etiquetas  -> lista o recurso.
// Token do ZapResponder fica só aqui. Só admin pode chamar.
//
// Deploy: supabase functions deploy zap-info --project-ref cxhdoqwrhxcmsrxccwzd

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

const RECURSOS: Record<string, string> = {
  atendentes: '/atendentes',
  departamentos: '/departamentos',
  etiquetas: '/etiquetas'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'sem token' });

  // Somente admin.
  const caller = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(401, { error: 'token inválido' });
  const { data: prof } = await caller.from('profiles').select('role').eq('id', user.id).single();
  if (prof?.role !== 'admin') return json(403, { error: 'apenas administradores' });

  const recurso = new URL(req.url).searchParams.get('recurso') ?? '';
  const path = RECURSOS[recurso];
  if (!path) return json(400, { error: 'recurso inválido' });

  try {
    const r = await fetch(`${ZAP_BASE}${path}`, { headers: { Authorization: `Bearer ${ZAP_TOKEN}` } });
    if (!r.ok) return json(502, { error: `ZapResponder ${r.status}` });
    const data = await r.json();
    const lista = Array.isArray(data) ? data : (data.data ?? data.docs ?? data.items ?? []);
    // Normaliza para { id, nome, extra } o que der.
    const itens = (Array.isArray(lista) ? lista : []).map((x: Record<string, unknown>) => ({
      id: x._id ?? x.id ?? null,
      nome: x.nome ?? x.name ?? '(sem nome)',
      status: x.status ?? null,
      ativo: x.isAtivo ?? x.isActivate ?? null,
      cor: x.color ?? null,
      raw: x
    }));
    return json(200, { recurso, total: itens.length, itens });
  } catch (e) {
    return json(502, { error: String(e) });
  }
});
