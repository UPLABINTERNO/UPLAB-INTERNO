import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:1420';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('admin@uplab.com');
  await page.locator('input[type="password"]').fill('admin123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('input[type="password"]').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(700);
  await page.goto(`${BASE}/modulo/atendimento`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Telefone com DDD').waitFor({ timeout: 15000 });
  await page.getByPlaceholder('Telefone com DDD').fill('554199830103');
  await page.getByRole('button', { name: 'Buscar' }).click();
  // espera as mensagens renderizarem
  await page.locator('.dia').first().waitFor({ timeout: 35000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(HERE, 'screenshots', '13-conversas.png') });
  console.log('OK — 13-conversas');
} finally {
  await browser.close();
}
