import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:1420';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('admin@uplab.com');
  await page.locator('input[type="password"]').fill('admin123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Espera o login sair (form some) antes de navegar.
  await page.locator('input[type="password"]').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/modulo/atendimento`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'APIs do robô' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(HERE, 'screenshots', '10-atendimento.png') });
  console.log('OK — 10-atendimento');
} finally {
  await browser.close();
}
