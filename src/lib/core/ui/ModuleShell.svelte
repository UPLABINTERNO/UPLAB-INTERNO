<script lang="ts">
  import type { Snippet } from 'svelte';
  import { userLabel } from '$core/auth.svelte';
  import { moduleColor, type ModuleInfo } from '$core/modules';
  import ModuleIcon from '$core/ui/ModuleIcon.svelte';
  import WinControls from '$core/ui/WinControls.svelte';

  let { info, children }: { info: ModuleInfo; children: Snippet } = $props();
</script>

<header data-tauri-drag-region>
  <div class="title">
    <span class="badge" style="--c:{moduleColor(info.id)}"><ModuleIcon id={info.id} size={20} /></span>
    <div>
      <strong>{info.label}</strong>
      <span class="dim">{info.description}</span>
    </div>
  </div>
  <div class="right">
    <span class="dim user">{userLabel()}</span>
    <WinControls />
  </div>
</header>

<main>
  {@render children()}
</main>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 1rem 0.6rem 1.2rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--c, var(--accent));
    color: #fff;
    box-shadow: 0 4px 10px color-mix(in srgb, var(--c, var(--accent)) 40%, transparent);
  }
  .title div {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .dim {
    color: var(--text-dim);
    font-size: 0.82rem;
  }
  main {
    padding: 1.4rem;
  }
</style>
