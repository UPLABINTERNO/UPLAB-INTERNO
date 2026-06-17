// Aplica um arquivo .sql no Supabase (via pooler IPv4). Uso:
//   node --env-file=.env scripts/db/run-sql.mjs scripts/db/schema-chat.sql
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
const file = process.argv[2];
if (!url) throw new Error('SUPABASE_DB_URL ausente no .env');
if (!file) throw new Error('uso: run-sql.mjs <arquivo.sql>');

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log('[run-sql] aplicado:', file);
} finally {
  await client.end();
}
