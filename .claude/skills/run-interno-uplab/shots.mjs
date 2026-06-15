// Screenshots das telas (login/launcher/admin) contra o dev server na 1420.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'screenshots');
const BASE = 'http://localhost:1420';
const browser = await chromium.launch({ headless: true });
try {
  // Login (sem sessão) — janela pequena como o launcher real.
  const small = await browser.newPage({ viewport: { width: 460, height: 660 } });
  await small.goto(BASE, { waitUntil: 'networkidle' });
  await small.getByRole('button', { name: 'Entrar' }).waitFor();
  await small.waitForTimeout(600);
  await small.screenshot({ path: join(SHOTS, '07-login.png') });

  await small.locator('input[type="email"]').fill('admin@uplab.com');
  await small.locator('input[type="password"]').fill('admin123');
  await small.getByRole('button', { name: 'Entrar' }).click();
  await small.getByText('Sistema Interno').waitFor({ timeout: 15000 });
  await small.waitForTimeout(400);
  await small.screenshot({ path: join(SHOTS, '08-launcher.png') });

  // Admin na MESMA aba logada (janela maior, como abre em janela própria).
  await small.setViewportSize({ width: 1100, height: 720 });
  await small.goto(`${BASE}/modulo/administrador`, { waitUntil: 'networkidle' });
  await small.getByText('Novo usuário').waitFor({ timeout: 15000 });
  // seleciona um usuário interno para mostrar o seletor de Nível
  await small.getByText('admin@uplab.com').first().click();
  await small.getByText('Nível de acesso').waitFor({ timeout: 15000 });
  await small.waitForTimeout(400);
  await small.screenshot({ path: join(SHOTS, '09-admin.png') });

  console.log('OK — 07-login, 08-launcher, 09-admin');
} finally {
  await browser.close();
}
