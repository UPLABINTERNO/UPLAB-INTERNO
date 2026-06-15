<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import {
    initAuth,
    authReady,
    identityReady,
    currentSession,
    isInternal,
    userLabel,
    signOut
  } from '$core/auth.svelte';
  import Login from '$core/ui/Login.svelte';
  import WinControls from '$core/ui/WinControls.svelte';

  let { children } = $props();

  // Gate global: login obrigatório antes de qualquer rota (launcher e módulos).
  onMount(initAuth);
</script>

{#if !authReady()}
  <div class="center dim">Carregando…</div>
{:else if !currentSession()}
  <Login />
{:else if !identityReady()}
  <div class="center dim">Carregando perfil…</div>
{:else if !isInternal()}
  <div class="center noaccess" data-tauri-drag-region>
    <div class="winbar"><WinControls /></div>
    <img src="/logo.png" alt="UPLAB" />
    <h2>Acesso restrito</h2>
    <p class="dim">
      A conta <strong>{userLabel()}</strong> não tem acesso ao sistema interno.
      Fale com um administrador.
    </p>
    <button onclick={signOut}>Sair</button>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .center {
    display: grid;
    place-items: center;
    min-height: 100vh;
  }
  .dim {
    color: var(--text-dim);
  }
  .noaccess {
    gap: 0.6rem;
    text-align: center;
    padding: 2rem;
    position: relative;
  }
  .noaccess img {
    width: 72px;
    height: 72px;
    object-fit: contain;
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
  }
  .noaccess h2 {
    margin: 0.4rem 0 0;
  }
  .noaccess p {
    max-width: 360px;
  }
  .winbar {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
  }
</style>
