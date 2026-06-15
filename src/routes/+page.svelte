<script lang="ts">
  import { onMount } from 'svelte';
  import { MODULES } from '$core/modules';
  import { can, userLabel, signOut } from '$core/auth.svelte';
  import { openModule } from '$core/windows';
  import { checarAtualizacao, atualizarAgora } from '$core/updater';
  import ModuleIcon from '$core/ui/ModuleIcon.svelte';
  import WinControls from '$core/ui/WinControls.svelte';

  // Admin vê tudo; demais veem só os módulos com permissão de acesso.
  const visiveis = $derived(MODULES.filter((m) => can(m.id, 'access')));

  // Atualização automática.
  let upd = $state<{ disponivel: boolean; versao?: string }>({ disponivel: false });
  let baixando = $state(false);
  let progresso = $state(0);

  onMount(async () => {
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
      <img src="/logo.png" alt="UPLAB" />
      <div>
        <strong>Sistema Interno</strong>
        <span class="dim">{userLabel()}</span>
      </div>
    </div>
    <div class="actions">
      <button class="sair" onclick={signOut} title="Sair da conta">Sair</button>
      <WinControls />
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
    <div class="grid">
      {#each visiveis as m, i (m.id)}
        <button
          class="card"
          style="animation-delay:{i * 45}ms"
          onclick={() => openModule(m.id, m.label)}
          title={m.description}
        >
          <span class="icon"><ModuleIcon id={m.id} size={22} /></span>
          <span class="label">{m.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .launcher {
    min-height: 100vh;
    padding: 0 1rem 1.4rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1.2rem;
    padding: 0.75rem 0.2rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .brand img {
    width: 40px;
    height: 40px;
    object-fit: contain;
    border-radius: 10px;
    box-shadow: var(--shadow-sm);
  }
  .brand div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .brand strong {
    font-size: 0.95rem;
    line-height: 1.2;
  }
  .dim {
    color: var(--text-dim);
    font-size: 0.78rem;
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
    font-size: 0.82rem;
    padding: 0.4rem 0.7rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.7rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 1.1rem 0.5rem;
    background: var(--surface);
    border-radius: var(--radius);
    min-height: 110px;
    text-align: center;
    box-shadow: var(--shadow-sm);
    animation: pop 0.4s ease both;
  }
  @keyframes pop {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .card:hover {
    border-color: var(--accent);
    transform: translateY(-3px);
    box-shadow: var(--shadow);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 13px;
    background: var(--brand-grad);
    color: #fff;
    box-shadow: 0 5px 14px rgba(39, 102, 201, 0.32);
    transition: transform 0.15s;
  }
  .card:hover .icon {
    transform: scale(1.08);
  }
  .label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
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
    margin-bottom: 1rem;
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    font-size: 0.85rem;
  }
</style>
