// Cria (ou reaproveita) um usuário admin no Supabase Auth e garante role='admin'
// no profile. SEGURO: não toca em usuários/linhas existentes além do alvo.
// Usa a SERVICE_ROLE_KEY — roda SÓ localmente, nunca no app distribuído.
//
// Uso:
//   node scripts/setup-admin.mjs [email] [senha]
//   (padrão: admin@uplab.com / admin123)

import process from 'node:process';

process.loadEnvFile('.env');

// Não use o nome `URL` (sombrearia o construtor global usado por fetch).
const BASE = process.env.PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2] || 'admin@uplab.com';
const password = process.argv[3] || 'admin123';
const nome = 'Administrador UPLAB';

if (!BASE || !SERVICE) {
  console.error('Faltam PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const headers = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json'
};

async function findUserByEmail(mail) {
  const r = await fetch(`${BASE}/auth/v1/admin/users?per_page=200`, { headers });
  const j = await r.json();
  const list = Array.isArray(j) ? j : j.users || [];
  return list.find((u) => u.email === mail) || null;
}

async function getProfile(id) {
  const r = await fetch(`${BASE}/rest/v1/profiles?id=eq.${id}&select=*`, { headers });
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function main() {
  // 1) Cria o usuário (ou reaproveita se já existir).
  let userId;
  const create = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, display_name: nome }
    })
  });

  if (create.ok) {
    userId = (await create.json()).id;
    console.log(`Usuário criado: ${email}`);
  } else {
    const existing = await findUserByEmail(email);
    if (!existing) {
      console.error('Falha ao criar usuário:', await create.text());
      process.exit(1);
    }
    userId = existing.id;
    console.log(`Usuário já existia: ${email}`);
  }

  // 2) Garante o profile com role=admin (cobre os 2 casos: trigger criou ou não).
  const existingProfile = await getProfile(userId);
  let res;
  if (existingProfile) {
    res = await fetch(`${BASE}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'admin' })
    });
  } else {
    res = await fetch(`${BASE}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ id: userId, email, nome, role: 'admin' })
    });
  }

  if (!res.ok) {
    console.error('Falha ao gravar o profile admin:', await res.text());
    process.exit(1);
  }

  console.log(`OK — admin pronto: ${email} / ${password} (role=admin)`);
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});
