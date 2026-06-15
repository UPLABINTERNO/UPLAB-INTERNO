// Verificação pontual: loga de verdade (Supabase) e abre o módulo Administrador.
// Requer o dev server na 1420 (já sobe junto do `npm run tauri:dev`).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:1420';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Login global real.
  await page.locator('input[type="email"]').fill('admin@uplab.com');
  await page.locator('input[type="password"]').fill('admin123');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Launcher → abre Administrador (em browser cai em navegação na mesma aba).
  await page.getByText('Administrador', { exact: true }).waitFor({ timeout: 15000 });
  await page.goto(`${BASE}/modulo/administrador`, { waitUntil: 'networkidle' });

  await page.getByText('Novo usuário').waitFor({ timeout: 15000 });
  await page.getByText('cliente@teste.com').first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: join(HERE, 'screenshots', '06-admin.png') });
  console.log('OK — Administrador renderizou (06-admin.png).');
} finally {
  await browser.close();
}
