// ============================================================================
// Sincroniza o ERP (clientes + cliente_vinculos) do Supabase COMPARTILHADO para
// o dedicado, e enriquece uplab_chat_grupos com o nome real do cliente.
//   node --env-file=.env scripts/sync-erp.mjs
// service_role do compartilhado: SHARED_* (só local, nunca no app).
// ============================================================================
import pg from 'pg';

const SH_URL = process.env.SHARED_SUPABASE_URL;
const SH_KEY = process.env.SHARED_SERVICE_ROLE;
const DB_URL = process.env.SUPABASE_DB_URL;
if (!SH_URL || !SH_KEY || !DB_URL) throw new Error('faltam SHARED_* e/ou SUPABASE_DB_URL no .env');

const h = { apikey: SH_KEY, Authorization: 'Bearer ' + SH_KEY };

/** Lê uma tabela inteira do compartilhado, paginando (PostgREST corta em 1000). */
async function lerTudo(tabela, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SH_URL}/rest/v1/${tabela}?select=${cols}`, { headers: { ...h, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${tabela}: ${r.status}`);
    const lote = await r.json();
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

function digits(s) { return String(s || '').replace(/\D/g, ''); }

async function main() {
  console.log('[erp] lendo compartilhado…');
  const clientes = await lerTudo('clientes', 'codigo,nome_fantasia,razao_social,cnpj_cpf,cidade,estado,vendedor,carteira');
  const vinculos = await lerTudo('cliente_vinculos', 'telefone,codigo');
  console.log(`[erp] ${clientes.length} clientes, ${vinculos.length} vínculos`);

  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // clientes
    for (let i = 0; i < clientes.length; i += 500) {
      const slice = clientes.slice(i, i + 500);
      const vals = [], params = [];
      slice.forEach((c, j) => {
        const b = j * 8;
        vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
        params.push(c.codigo, c.nome_fantasia, c.razao_social, c.cnpj_cpf, c.cidade, c.estado, c.vendedor, c.carteira);
      });
      await client.query(
        `insert into uplab_erp_clientes (codigo,nome_fantasia,razao_social,cnpj_cpf,cidade,estado,vendedor,carteira) values ${vals.join(',')}
         on conflict (codigo) do update set nome_fantasia=excluded.nome_fantasia,razao_social=excluded.razao_social,cnpj_cpf=excluded.cnpj_cpf,cidade=excluded.cidade,estado=excluded.estado,vendedor=excluded.vendedor,carteira=excluded.carteira`,
        params
      );
    }
    // vínculos (telefone -> codigo)
    for (const v of vinculos) {
      await client.query(
        `insert into uplab_erp_vinculos (telefone,codigo) values ($1,$2) on conflict (telefone) do update set codigo=excluded.codigo`,
        [digits(v.telefone), v.codigo]
      );
    }
    console.log('[erp] ERP espelhado no dedicado');

    // Enriquece os grupos: telefone -> vínculo -> cliente.
    const cliByCod = new Map(clientes.map((c) => [String(c.codigo), c]));
    let enriquecidos = 0;
    for (const v of vinculos) {
      const tel = digits(v.telefone);
      const c = cliByCod.get(String(v.codigo));
      if (!tel || !c) continue;
      const nome = c.nome_fantasia || c.razao_social || null;
      const r = await client.query(
        `update uplab_chat_grupos set
            nome_cliente=$2, codigo_loja=coalesce($3,codigo_loja), cidade=$4, vendedor=$5, carteira=$6,
            busca = coalesce(busca,'') || ' ' || coalesce($2,'') || ' ' || coalesce($3,'') || ' ' || coalesce($4,''),
            atualizado_em=now()
         where chat_id=$1 or busca ilike '%' || $1 || '%'`,
        [tel, nome, v.codigo, c.cidade, c.vendedor, c.carteira]
      );
      enriquecidos += r.rowCount;
    }
    console.log(`[erp] ${enriquecidos} grupos enriquecidos com nome do ERP`);
  } finally {
    await client.end();
  }
  console.log('[erp] OK');
}

main().catch((e) => { console.error('[erp] FALHOU:', e); process.exit(1); });
