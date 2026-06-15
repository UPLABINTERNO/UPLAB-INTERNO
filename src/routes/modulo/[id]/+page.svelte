<script lang="ts">
  import { page } from '$app/stores';
  import type { Component } from 'svelte';
  import { findModule } from '$core/modules';
  import { can } from '$core/auth.svelte';
  import { hasModule, loadModule } from '$core/registry';
  import { closeSelf } from '$core/windows';
  import ModuleShell from '$core/ui/ModuleShell.svelte';

  const moduleId = $derived($page.params.id ?? '');
  const info = $derived(findModule(moduleId));
  const allowed = $derived(info ? can(moduleId, 'access') : false);

  let ModuleComponent = $state<Component<{ moduleId: string }> | null>(null);

  // Carrega o componente do módulo sob demanda quando id muda e há acesso.
  $effect(() => {
    void moduleId;
    ModuleComponent = null;
    if (info && allowed && hasModule(moduleId)) void mount();
  });

  async function mount() {
    const loader = loadModule(moduleId);
    if (!loader) return;
    const mod = await loader();
    ModuleComponent = mod.default;
  }
</script>

{#if !info}
  <div class="msg">
    <p>Módulo desconhecido: <code>{moduleId}</code></p>
    <button onclick={closeSelf}>Fechar</button>
  </div>
{:else if !allowed}
  <div class="msg">
    <p>Você não tem permissão para acessar <strong>{info.label}</strong>.</p>
    <button onclick={closeSelf}>Fechar</button>
  </div>
{:else if !hasModule(moduleId)}
  <div class="msg">
    <p>Módulo <strong>{info.label}</strong> ainda não implementado no frontend.</p>
    <button onclick={closeSelf}>Fechar</button>
  </div>
{:else if ModuleComponent}
  <ModuleShell {info}>
    <ModuleComponent {moduleId} />
  </ModuleShell>
{:else}
  <div class="msg dim">Carregando módulo…</div>
{/if}

<style>
  .msg {
    padding: 2rem;
  }
  .dim {
    color: var(--text-dim);
  }
</style>
