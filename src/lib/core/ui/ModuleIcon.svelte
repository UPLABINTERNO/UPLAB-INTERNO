<script lang="ts">
  // Ícones (estilo line / Lucide) por módulo. stroke = currentColor.
  let { id, size = 24 }: { id: string; size?: number } = $props();

  const paths: Record<string, string> = {
    atendimento:
      'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
    comercial:
      'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M2 9h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z',
    financeiro:
      'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z',
    campanhas: 'M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6',
    tickets_clientes:
      'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 11v2M13 17v2',
    tickets_internos:
      'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    chat: 'M7.9 20A9 9 0 1 0 4 16.1L2 22z',
    api: 'M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z',
    banco_dados: '',
    logs: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    administrador:
      'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4'
  };

  const d = $derived(paths[id] ?? 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z');
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#if id === 'banco_dados'}
    <!-- database: elipses + corpo -->
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  {:else}
    <path d={d} />
  {/if}
</svg>

<style>
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
