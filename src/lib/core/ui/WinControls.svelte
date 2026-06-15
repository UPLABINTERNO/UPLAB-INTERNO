<script lang="ts">
  import { minimizeSelf, closeSelf } from '$core/windows';

  // `tone="light"` para uso sobre fundo escuro/gradiente (ícones claros).
  let { tone = 'dark' }: { tone?: 'dark' | 'light' } = $props();
</script>

<div class="controls {tone}">
  <button class="ctl" onclick={minimizeSelf} title="Minimizar" aria-label="Minimizar">
    <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" /></svg>
  </button>
  <button class="ctl close" onclick={closeSelf} title="Fechar" aria-label="Fechar">
    <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
  </button>
</div>

<style>
  .controls {
    display: flex;
    gap: 0.25rem;
    -webkit-app-region: no-drag;
  }
  .ctl {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 8px;
    color: var(--text-dim);
  }
  .ctl svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .ctl:hover {
    background: rgba(0, 0, 0, 0.07);
    box-shadow: none;
    color: var(--text);
  }
  .ctl.close:hover {
    background: var(--danger);
    color: #fff;
  }
  .light .ctl {
    color: rgba(255, 255, 255, 0.85);
  }
  .light .ctl:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
  .light .ctl.close:hover {
    background: var(--danger);
  }
</style>
