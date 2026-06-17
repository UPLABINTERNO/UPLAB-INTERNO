---
name: run-interno-uplab
description: Build, run, screenshot, teste e DESIGN/UI do app desktop Interno UPLAB (Tauri 2 + SvelteKit). Use ao pedir para rodar/iniciar/buildar/testar/tirar screenshot do sistema interno, do launcher ou de um módulo (ex.: Financeiro), E ao mexer em tema/layout/componentes/UI — traz princípios de design enterprise e refs (shadcn-svelte, Bits UI, Skeleton, Flowbite, Tauri docs).
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

## Design & Engenharia de referência (app de empresa)

Antes de mexer em **tema, layout ou componentes**, consulte estas referências.
O alvo é um SaaS/admin **enterprise**: sóbrio, denso de informação sem poluir,
consistente entre módulos. Não invente um visual por módulo — padronize via
tokens em `src/app.css` e componentes compartilhados em `src/lib/core/ui`.

### Princípios a aplicar (destilados das refs)

- **Tokens, não valores soltos.** Cor, raio, sombra, espaçamento e tipografia
  saem de CSS vars em `:root` (`src/app.css`). Trocar tema = trocar tokens, não
  caçar hex pelos `.svelte`. Mantenha suporte a tema claro/escuro via
  `color-scheme` + vars duplicadas.
- **Shell consistente.** Todo módulo usa o mesmo `ModuleShell` (header + área de
  conteúdo). Considere **sidebar de navegação** + breadcrumb para módulos com
  várias telas (padrão de admin dashboard), em vez de só header.
- **Densidade enterprise.** Tabelas com zebra/hover sutil, alinhamento de
  números à direita, estados vazios e de erro explícitos, paginação/filtros no
  topo. Cards de métrica (KPI) com rótulo + valor grande + delta.
- **Hierarquia tipográfica** clara (1 família, pesos 400/500/600/700), contraste
  AA, foco visível em todos os interativos (acessibilidade = requisito corporativo).
- **Motion contido.** Transições curtas (120–200ms), sem animações chamativas em
  fluxo de trabalho. Skeleton/loading states em vez de spinners onde possível.

### Stack de componentes (Svelte 5) — preferência

1. **shadcn-svelte** — https://www.shadcn-svelte.com — base preferida: você copia
   os componentes pro projeto (sem dep pesada), estiliza via tokens. Casa com a
   filosofia de `src/lib/core/ui`.
2. **Bits UI** — https://bits-ui.com — primitivos headless acessíveis (é a base do
   shadcn-svelte). Use direto quando precisar de um primitivo não coberto.
3. **Skeleton** — https://www.skeleton.dev — sistema de design Svelte + Tailwind,
   bom catálogo de padrões de tema.
4. **Flowbite Svelte Admin** — https://flowbite-svelte-admin-dashboard.vercel.app —
   referência de layout de admin/dashboard (sidebar, tabelas, KPIs).
5. SvelteForge Admin / **HTMLrev** (https://htmlrev.com/free-svelte-templates.html)
   — templates prontos para roubar estrutura de tela.

> Antes de adicionar lib nova, cheque o que já existe no projeto e prefira copiar
> componente (shadcn style) a importar framework inteiro — o app é Tauri (bundle
> enxuto importa).

### Inspiração visual (design)

- **Mobbin** (https://mobbin.com), **Dribbble – SaaS Dashboard**
  (https://dribbble.com/tags/saas-dashboard), **Behance – Enterprise UI**
  (https://www.behance.net), **Pinterest – Dashboard UI**. Use para padrões de
  layout/cor; adapte aos tokens da marca UPLAB (azul/ciano/teal), não copie cru.
- Prototipagem antes de codar telas grandes: **Figma** / **Moqups**.

### Documentação técnica (engenharia)

- **Tauri v2** — https://v2.tauri.app — janelas, IPC, updater, segurança/CSP,
  multi-window (cada módulo abre em janela própria).
- **Tauri + SvelteKit** — https://v2.tauri.app/start/frontend/sveltekit/ —
  config SPA (`adapter-static`, `ssr=false`), que é o setup deste projeto.

## Troubleshooting

| Sintoma | Causa / fix |
|---|---|
| `Port 1420 is already in use` | vite remanescente — mate o ocupante da 1420 (acima). |
| `spawn EINVAL` | `shell:true` no spawn (já no driver). |
| Playwright `Executable doesn't exist` | `npx playwright install chromium`. |
| cargo: `icon.ico not found` | `npm run tauri icon "src-tauri/icons/source.png"`. |
| Screenshot pega VS Code | filtre pelo processo `interno-uplab`, não pelo título. |
| `npm run check` aponta `sveltekit` | importe de `@sveltejs/kit/vite`. |
