// Edge Function: admin-create-user
//
// Cria um usuário no Supabase Auth de forma SEGURA. A service_role vive só aqui
// (no servidor da função, injetada pela plataforma) — nunca no app.
// Fluxo: valida o JWT do chamador -> confere que ele é admin (profiles.role) ->
// cria o usuário já confirmado com a service_role.
//
// Deploy:
//   supabase functions deploy admin-create-user --project-ref cxhdoqwrhxcmsrxccwzd

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'método não permitido' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'sem token de autenticação' });

  // 1) Identifica o chamador a partir do JWT.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const {
    data: { user },
    error: userErr
  } = await caller.auth.getUser();
  if (userErr || !user) return json(401, { error: 'token inválido' });

  // 2) Confere que o chamador é admin.
  const { data: prof } = await caller
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (prof?.role !== 'admin') return json(403, { error: 'apenas administradores' });

  // 3) Cria o usuário com a service_role (já confirmado).
  let payload: { email?: string; password?: string; nome?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'corpo inválido' });
  }
  const { email, password, nome } = payload;
  if (!email || !password) return json(400, { error: 'email e senha são obrigatórios' });

  const admin = createClient(url, serviceKey);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: nome ?? '', display_name: nome ?? '' }
  });
  if (createErr) return json(400, { error: createErr.message });

  // 4) Garante nome no profile (o trigger do sistema já cria a linha).
  if (nome && created.user) {
    await admin.from('profiles').update({ nome }).eq('id', created.user.id);
  }

  return json(200, { id: created.user?.id, email });
});
