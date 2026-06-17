// Screenshot do LOGIN e do LAUNCHER no tamanho real da janela (440x640).
// Uso: node .claude/skills/run-interno-uplab/shot-login-launcher.mjs
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
    console.log('[shot] subindo vite dev…');
    vite = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', shell: true });
    const start = Date.now();
    while (Date.now() - start < 120000 && !(await up())) await sleep(800);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 640 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await sleep(700);
    await page.screenshot({ path: join(SHOTS, 'redesign-01-login.png') });
    console.log('[shot] redesign-01-login.png');

    await page.locator('input[type="email"]').fill('admin@uplab.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.locator('input[type="password"]').waitFor({ state: 'detached', timeout: 20000 });
    await sleep(900);
    await page.screenshot({ path: join(SHOTS, 'redesign-02-launcher.png') });
    console.log('[shot] redesign-02-launcher.png');
    console.log('[shot] OK');
  } finally {
    await browser.close();
    if (vite) { vite.kill(); try { spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
  }
}
main().catch((e) => { console.error('[shot] FALHOU:', e); process.exit(1); });
