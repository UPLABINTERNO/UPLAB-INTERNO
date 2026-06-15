// Driver de UI do Interno UPLAB.
//
// Dirige o FRONTEND real (build SvelteKit servido pelo Vite) num Chromium do
// Playwright, com o IPC do Tauri MOCKADO (window.__TAURI_INTERNALS__.invoke).
// É o caminho reproduzível e headless para clicar/preencher/screenshotar a UI
// dos módulos sem precisar abrir a janela WebView2 nativa.
//
// Uso:
//   node .claude/skills/run-interno-uplab/driver.mjs            # fluxo completo + screenshots
//   node .claude/skills/run-interno-uplab/driver.mjs --headed   # com janela visível
//
// Screenshots vão para .claude/skills/run-interno-uplab/screenshots/.
// O driver sobe o `vite dev` sozinho e o derruba ao final.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..'); // <unit>/
const SHOTS = join(HERE, 'screenshots');
const URL = 'http://localhost:1420';
const HEADED = process.argv.includes('--headed');

mkdirSync(SHOTS, { recursive: true });

// --- Mock do backend Tauri, injetado no browser antes dos scripts da página ---
// Roda no contexto do navegador; precisa ser auto-contido.
function installTauriMock() {
  const db = [];
  let seq = 1;
  const ADMIN = {
    token: 'tok-mock',
    user_id: 'user-admin',
    username: 'admin',
    display_name: 'Administrador',
    module_id: '',
    permissions: ['*:*'],
    opened_at: Math.floor(Date.now() / 1000)
  };
  const catalog = [
    ['atendimento', 'Atendimento', 'Atendimento ao cliente', 'headset'],
    ['comercial', 'Comercial', 'Vendas e propostas', 'briefcase'],
    ['financeiro', 'Financeiro', 'Lançamentos e fluxo de caixa', 'wallet'],
    ['campanhas', 'Campanhas', 'Campanhas comerciais', 'megaphone'],
    ['tickets_clientes', 'Tickets Clientes', 'Chamados de clientes', 'ticket'],
    ['tickets_internos', 'Tickets Internos', 'Chamados internos', 'tool'],
    ['chat', 'Chat Interno', 'Mensagens entre a equipe', 'chat'],
    ['api', 'Integrações/API', 'Configuração de integrações', 'plug'],
    ['banco_dados', 'Banco de Dados', 'Administração de dados', 'database'],
    ['logs', 'Logs', 'Auditoria e logs do sistema', 'list'],
    ['administrador', 'Administrador', 'Usuários, papéis e permissões', 'shield']
  ].map(([id, label, description, icon]) => ({
    id,
    label,
    description,
    icon,
    access_permission: `${id}:access`
  }));

  const handlers = {
    modules_catalog: () => catalog,
    auth_module_login: ({ moduleId }) => ({ ...ADMIN, module_id: moduleId }),
    auth_module_logout: () => null,
    permissions_check: () => true,
    financeiro_list: () => db.slice().reverse(),
    financeiro_create: ({ input }) => {
      const now = Math.floor(Date.now() / 1000);
      const item = { id: `lanc-${seq++}`, ...input, created_at: now, updated_at: now };
      db.push(item);
      return item;
    },
    financeiro_update: ({ id, input }) => {
      const i = db.findIndex((x) => x.id === id);
      if (i < 0) return Promise.reject({ code: 'NOT_FOUND', message: 'não encontrado' });
      db[i] = { ...db[i], ...input, updated_at: Math.floor(Date.now() / 1000) };
      return db[i];
    },
    financeiro_delete: ({ id }) => {
      const i = db.findIndex((x) => x.id === id);
      if (i >= 0) db.splice(i, 1);
      return null;
    }
  };

  window.__TAURI_INTERNALS__ = {
    transformCallback: (cb) => cb,
    invoke: (cmd, args = {}) => {
      const h = handlers[cmd];
      if (!h) return Promise.reject({ code: 'UNKNOWN', message: `mock sem ${cmd}` });
      return Promise.resolve(h(args));
    }
  };
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite não respondeu em ${url}`);
}

async function main() {
  console.log('[driver] subindo vite dev…');
  // shell:true é necessário no Windows + Node 24 para executar npm.cmd.
  const vite = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', shell: true });
  let browser;
  try {
    await waitForServer(URL);
    console.log('[driver] vite pronto, abrindo chromium…');
    browser = await chromium.launch({ headless: !HEADED });
    const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
    await page.addInitScript(installTauriMock);

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.getByText('Selecione um módulo').waitFor();
    await page.screenshot({ path: join(SHOTS, '01-launcher.png') });
    console.log('[driver] 01-launcher.png');

    // Abrir o módulo Financeiro.
    await page.getByText('Financeiro', { exact: true }).click();
    await page.getByRole('button', { name: 'Entrar no módulo' }).waitFor();
    await page.screenshot({ path: join(SHOTS, '02-login.png') });
    console.log('[driver] 02-login.png');

    // Login individual do módulo.
    await page.locator('input[autocomplete="username"]').fill('admin');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: 'Entrar no módulo' }).click();

    // CRUD: adicionar um lançamento.
    await page.getByPlaceholder('Descrição').waitFor();
    await page.getByPlaceholder('Descrição').fill('Venda de exame');
    await page.getByPlaceholder('Valor (R$)').fill('250.50');
    await page.getByPlaceholder('Categoria').fill('Serviços');
    await page.getByRole('button', { name: 'Adicionar' }).click();
    await page.getByText('Venda de exame').waitFor();
    await page.screenshot({ path: join(SHOTS, '03-financeiro-crud.png') });
    console.log('[driver] 03-financeiro-crud.png');

    console.log('[driver] OK — fluxo completo (launcher → login → CRUD).');
  } finally {
    if (browser) await browser.close();
    vite.kill();
    // vite filhos (esbuild) podem ficar; encerra a árvore no Windows.
    try {
      spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* ok */
    }
  }
}

main().catch((e) => {
  console.error('[driver] FALHOU:', e);
  process.exit(1);
});
