---
name: run-interno-uplab
description: Build, run, screenshot e teste do app desktop Interno UPLAB (Tauri 2 + SvelteKit). Use ao pedir para rodar/iniciar/buildar/testar/tirar screenshot do sistema interno, do launcher ou de um módulo (ex.: Financeiro).
---

# Rodar o Interno UPLAB

App desktop **Tauri 2 (Rust) + SvelteKit 5 (SPA)**. Launcher com 11 módulos;
cada módulo abre com login individual e gate de permissão RBAC.

Há **dois caminhos**, por camada — escolha o que a sua mudança toca:

- **Frontend (UI dos módulos)** → `driver.mjs`: dirige o frontend real num
  Chromium do Playwright com o **IPC do Tauri mockado** (backend em memória).
  Headless, reproduzível, clica/preenche/screenshota. **É o caminho do agente.**
- **Backend (comandos/repos/permissões Rust)** → `cargo test` no `src-tauri`.

> Caminhos relativos à raiz do projeto (`<unit>/`). O driver fica em
> `.claude/skills/run-interno-uplab/driver.mjs`.

## Prerequisites

Já presentes nesta máquina (Windows): Node 24, Rust 1.96, WebView2 149, Edge 149.

```bash
npm install
npx playwright install chromium      # 1x; Playwright 1.61 quer o build 1228
```

## Build

```bash
# Ícones: o tauri-build EXIGE src-tauri/icons/icon.ico mesmo em dev/cargo check.
npm run tauri icon "src-tauri/icons/source.png"

# Backend compila limpo (3 warnings de dead_code são esperados — scaffolding do admin):
cd src-tauri && cargo check
```

Se faltar `source.png`, gere qualquer PNG quadrado >=512px e aponte para ele.

## Run — caminho do agente (frontend, headless)

O driver sobe o `vite dev` sozinho, injeta o mock do IPC, executa
launcher → login do módulo Financeiro → CRUD, e salva screenshots.

```bash
node ".claude/skills/run-interno-uplab/driver.mjs"            # headless
node ".claude/skills/run-interno-uplab/driver.mjs" --headed   # com janela
```

Saída esperada (termina com `OK — fluxo completo`):

```
[driver] subindo vite dev…
[driver] vite pronto, abrindo chromium…
[driver] 01-launcher.png
[driver] 02-login.png
[driver] 03-financeiro-crud.png
[driver] OK — fluxo completo (launcher → login → CRUD).
```

Screenshots em `.claude/skills/run-interno-uplab/screenshots/`. **Abra-as** —
`03-financeiro-crud.png` deve mostrar a tabela com o lançamento criado.

**Para dirigir outro módulo / outro flow:** edite o objeto `handlers` em
`driver.mjs` (adicione os comandos `invoke` mockados do módulo) e troque os
seletores do flow. O mock implementa um backend em memória para o Financeiro;
copie esse padrão para `comercial_*`, `administrador_*`, etc.

## Backend (camada Rust)

```bash
cd src-tauri && cargo test
```

Roda os testes de permissão RBAC (`core::permissions::tests::wildcards`).
Para cobrir um comando novo, escreva um teste que exercite o repositório do
módulo contra um `Connection::open_in_memory()` + `core::db::init`.

## Run — app real (janela WebView2, caminho humano)

```bash
npm run tauri:dev
```

Compila o binário e abre a janela nativa. **Útil só com display** (não headless)
e **não rode junto com o driver** — ambos usam a porta 1420.

Para um screenshot da janela real de forma programática (foi assim que
`screenshots/04-tauri-window.png` foi gerado), com o app já aberto:

```powershell
Add-Type -AssemblyName System.Drawing
$sig='using System;using System.Runtime.InteropServices;public class Win{[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);[StructLayout(LayoutKind.Sequential)]public struct RECT{public int Left,Top,Right,Bottom;}}'
Add-Type $sig
$p=Get-Process -Name 'interno-uplab' | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
$r=New-Object Win+RECT; [Win]::GetWindowRect($p.MainWindowHandle,[ref]$r) | Out-Null
$w=$r.Right-$r.Left; $h=$r.Bottom-$r.Top
$bmp=New-Object System.Drawing.Bitmap $w,$h
([System.Drawing.Graphics]::FromImage($bmp)).CopyFromScreen($r.Left,$r.Top,0,0,(New-Object System.Drawing.Size $w,$h))
$bmp.Save("$PWD\.claude\skills\run-interno-uplab\screenshots\04-tauri-window.png")
```

> Encontre o app pelo **nome do processo `interno-uplab`**, nunca pelo título
> "UPLAB" — isso casa com o VS Code (`... - INTERNO UPLAB - Visual Studio Code`).

Login inicial do app real: **`admin` / `admin123`**.

## Gotchas (cicatrizes reais)

- **`tauri:dev` morre com "Port 1420 is already in use".** Sobra um `vite` de
  uma run anterior (o driver usa a mesma porta). Mate o ocupante antes:
  `Get-NetTCPConnection -LocalPort 1420 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`.
- **`spawn EINVAL` no driver.** Node 24 no Windows exige `shell:true` para
  executar `npm.cmd`. Já tratado no `driver.mjs`; replique em qualquer spawn novo.
- **Playwright "Executable doesn't exist … chromium_headless_shell-1228".** O
  cache tinha outro build; rode `npx playwright install chromium`.
- **`cargo check` falha com "icons/icon.ico not found".** O `tauri-build` exige
  o `.ico` mesmo fora do bundle. Rode `npm run tauri icon` antes.
- **`OsRng` ausente ao compilar argon2.** Precisa de `rand_core` com feature
  `getrandom` no `Cargo.toml` (já está lá). Não remova essa dep.
- **`sveltekit` import.** Vem de `@sveltejs/kit/vite`, NÃO de
  `@sveltejs/vite-plugin-svelte`. `npm run check` pega isso.
- **Mock vs. backend real.** O `driver.mjs` NÃO exercita o Rust — valida UI,
  roteamento, login e gates de permissão do frontend. Lógica de backend é
  `cargo test` ou a janela real.

## Troubleshooting

| Sintoma | Causa / fix |
|---|---|
| `Port 1420 is already in use` | vite remanescente — mate o ocupante da 1420 (acima). |
| `spawn EINVAL` | `shell:true` no spawn (já no driver). |
| Playwright `Executable doesn't exist` | `npx playwright install chromium`. |
| cargo: `icon.ico not found` | `npm run tauri icon "src-tauri/icons/source.png"`. |
| Screenshot pega VS Code | filtre pelo processo `interno-uplab`, não pelo título. |
| `npm run check` aponta `sveltekit` | importe de `@sveltejs/kit/vite`. |
