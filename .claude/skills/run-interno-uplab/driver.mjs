// Driver de UI do Interno UPLAB.
//
// Dirige o FRONTEND real (SvelteKit servido pelo Vite) num Chromium do
// Playwright, fazendo LOGIN REAL no Supabase (admin@uplab.com / admin123) e
// navegando pelo launcher e pelo módulo Atendimento. É o caminho reproduzível
// e headless para clicar/screenshotar a UI.
//
// Arquitetura atual: login global (Supabase Auth) -> launcher (módulos por
// permissão) -> cada módulo. Conversas/Métricas/Dashboard do Atendimento
// consomem a API do Vercel (https://uplab-painel-api.vercel.app). Não há mais
// IPC do Tauri mockado — tudo é Supabase + API.
//
// Uso:
//   node .claude/skills/run-interno-uplab/driver.mjs            # headless
//   node .claude/skills/run-interno-uplab/driver.mjs --headed   # com janela
//
// Reaproveita um dev server já aberto na 1420; senão sobe `npm run dev`.
// Screenshots em .claude/skills/run-interno-uplab/screenshots/.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..'); // <unit>/
const SHOTS = join(HERE, 'screenshots');
const BASE = 'http://localhost:1420'; // não use o nome `URL` (sombrearia o global)
const HEADED = process.argv.includes('--headed');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOTS, { recursive: true });

async function serverUp() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function waitServer(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await serverUp()) return;
    await sleep(800);
  }
  throw new Error('dev server não respondeu na 1420');
}

async function main() {
  let vite = null;
  if (!(await serverUp())) {
    console.log('[driver] subindo vite dev…');
    // shell:true é obrigatório no Windows + Node 24 para executar npm.cmd.
    vite = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', shell: true });
    await waitServer();
  } else {
    console.log('[driver] reaproveitando dev server já aberto na 1420');
  }

  const browser = await chromium.launch({ headless: !HEADED });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Login global (Supabase Auth).
    await page.locator('input[type="email"]').fill('admin@uplab.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // O texto "Sistema Interno" aparece no login E no launcher; espere o
    // formulário SUMIR (senha desanexada) para confirmar que logou.
    await page.locator('input[type="password"]').waitFor({ state: 'detached', timeout: 20000 });
    await sleep(800);
    await page.screenshot({ path: join(SHOTS, '01-launcher.png') });
    console.log('[driver] 01-launcher.png');

    // Abre o módulo Atendimento (em browser, navega na mesma aba).
    await page.goto(`${BASE}/modulo/atendimento`, { waitUntil: 'networkidle' });
    // Espera a UI do módulo (botão da aba Conversas no menu lateral).
    await page.getByRole('button', { name: 'Conversas' }).waitFor({ timeout: 20000 });
    await sleep(1000);
    await page.screenshot({ path: join(SHOTS, '02-atendimento.png') });
    console.log('[driver] 02-atendimento.png');

    console.log('[driver] OK — login → launcher → Atendimento.');
  } finally {
    await browser.close();
    if (vite) {
      vite.kill();
      try {
        spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        /* ok */
      }
    }
  }
}

main().catch((e) => {
  console.error('[driver] FALHOU:', e);
  process.exit(1);
});
