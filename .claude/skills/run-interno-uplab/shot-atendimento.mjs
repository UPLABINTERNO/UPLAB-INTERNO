// Screenshot do módulo Atendimento refatorado (loading, datas, thread, métricas).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const SHOTS = join(HERE, 'screenshots');
const BASE = 'http://localhost:1420';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOTS, { recursive: true });
const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };

async function main() {
  let vite = null;
  if (!(await up())) {
    vite = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', shell: true });
    const start = Date.now();
    while (Date.now() - start < 120000 && !(await up())) await sleep(800);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1040, height: 700 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill('admin@uplab.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.locator('input[type="password"]').waitFor({ state: 'detached', timeout: 20000 });
    await sleep(700);

    await page.goto(`${BASE}/modulo/atendimento`, { waitUntil: 'networkidle' });
    await sleep(700);
    await page.screenshot({ path: join(SHOTS, 'atend-00-loading.png') });
    console.log('[shot] atend-00-loading.png');

    await page.locator('.diaitem').first().waitFor({ timeout: 25000 });
    await sleep(500);
    await page.screenshot({ path: join(SHOTS, 'atend-01-datas.png') });
    console.log('[shot] atend-01-datas.png');

    await page.locator('.diaitem').first().click();
    await sleep(800);
    await page.locator('.item').first().click();
    await sleep(2500);
    await page.screenshot({ path: join(SHOTS, 'atend-02-thread.png') });
    console.log('[shot] atend-02-thread.png');

    await page.locator('.rail button').nth(1).click(); // Métricas/Gerencial 2º botão
    await sleep(1200);
    await page.screenshot({ path: join(SHOTS, 'atend-03-metricas.png') });
    console.log('[shot] atend-03-metricas.png OK');
  } finally {
    await browser.close();
    if (vite) { vite.kill(); try { spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
  }
}
main().catch((e) => { console.error('[shot] FALHOU:', e); process.exit(1); });
