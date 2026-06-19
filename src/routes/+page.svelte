<script lang="ts">
  import { onMount } from 'svelte';
  import { MODULES, moduleColor } from '$core/modules';
  import { carregarModulosAtivos, moduloAtivo } from '$core/modules-config';
  import { canModule, userLabel, signOut } from '$core/auth.svelte';
  import { openModule } from '$core/windows';
  import { checarAtualizacao, atualizarAgora } from '$core/updater';
  import ModuleIcon from '$core/ui/ModuleIcon.svelte';
  import WinControls from '$core/ui/WinControls.svelte';

  // Módulos ativos (admin liga/desliga); padrão vem de `pronto`.
  let ativos = $state<Record<string, boolean>>({});
  // Admin vê tudo (por papel); só aparecem os módulos ATIVOS no sistema.
  const visiveis = $derived(MODULES.filter((m) => canModule(m.id) && moduloAtivo(m.id, ativos)));

  // Atualização automática.
  let upd = $state<{ disponivel: boolean; versao?: string }>({ disponivel: false });
  let baixando = $state(false);
  let progresso = $state(0);

  onMount(async () => {
    ativos = await carregarModulosAtivos();
    try {
      upd = await checarAtualizacao();
    } catch {
      /* sem rede / sem release ainda */
    }
  });

  async function atualizar() {
    baixando = true;
    try {
      await atualizarAgora((b, t) => (progresso = t ? Math.round((b / t) * 100) : 0));
    } catch (e) {
      baixando = false;
      alert('Falha ao atualizar: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
</script>

<div class="launcher">
  <header data-tauri-drag-region>
    <div class="brand">
      <div class="logo-chip"><img src="/logo.png" alt="UPLAB" /></div>
      <div>
        <strong>Sistema Interno</strong>
        <span class="who">{userLabel()}</span>
      </div>
    </div>
    <div class="actions">
      <button class="sair" onclick={signOut} title="Sair da conta">Sair</button>
      <WinControls tone="light" />
    </div>
  </header>

  {#if upd.disponivel}
    <div class="update">
      <span>Nova versão <strong>{upd.versao}</strong> disponível.</span>
      <button class="primary" onclick={atualizar} disabled={baixando}>
        {baixando ? `Atualizando… ${progresso}%` : 'Atualizar agora'}
      </button>
    </div>
  {/if}

  {#if visiveis.length === 0}
    <p class="dim empty">Seu usuário não tem acesso a nenhum módulo.</p>
  {:else}
    <span class="section">Módulos</span>
    <div class="grid">
      {#each visiveis as m, i (m.id)}
        <button
          class="card"
          style="--c:{moduleColor(m.id)}; animation-delay:{i * 40}ms"
          onclick={() => openModule(m.id, m.label)}
          title={m.description}
        >
          <span class="icon"><ModuleIcon id={m.id} size={18} /></span>
          <span class="label">{m.label}</span>
          {#if !m.pronto}<span class="dev">dev</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .launcher {
    min-height: 100vh;
    padding: 0 0 1.2rem;
    background: var(--bg-grad, var(--bg));
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1.1rem;
    padding: 0.8rem 1rem 0.9rem;
    color: #fff;
    background: var(--navy-grad);
    box-shadow: 0 6px 18px rgba(16, 47, 92, 0.18);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .logo-chip {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    background: #fff;
    border-radius: 11px;
    box-shadow: 0 3px 10px rgba(8, 25, 55, 0.25);
  }
  .logo-chip img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
  .brand div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .brand strong {
    font-size: 0.98rem;
    font-weight: 700;
    line-height: 1.2;
    color: #fff;
  }
  .who {
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.76rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .sair {
    font-size: 0.8rem;
    padding: 0.36rem 0.7rem;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }
  .sair:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.4);
  }
  .section {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-dim);
    margin: 0 1rem 0.6rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
    padding: 0 1rem;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.65rem;
    padding: 0.65rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    min-height: 58px;
    text-align: left;
    box-shadow: var(--shadow-sm);
    animation: pop 0.35s ease both;
  }
  .dev {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 0.56rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #b4690e;
    background: rgba(217, 125, 40, 0.16);
    padding: 0.05rem 0.3rem;
    border-radius: var(--radius-pill);
  }
  @keyframes pop {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .card:hover {
    border-color: var(--c);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 10px;
    background: var(--c);
    color: #fff;
    box-shadow: 0 3px 9px color-mix(in srgb, var(--c) 40%, transparent);
    transition: transform 0.15s;
  }
  .card:hover .icon {
    transform: scale(1.06);
  }
  .label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
    line-height: 1.2;
  }
  .empty {
    text-align: center;
    margin-top: 2rem;
  }
  .update {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem 1rem;
    margin: 0 1rem 1rem;
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    font-size: 0.85rem;
  }
</style>
