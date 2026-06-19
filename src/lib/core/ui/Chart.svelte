<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartT, ChartType, ChartData, ChartOptions } from 'chart.js';

  let { type, data, options, altura = 240 }:
    { type: ChartType; data: ChartData; options?: ChartOptions; altura?: number } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: ChartT | null = null;

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    if (canvas) chart = new Chart(canvas, { type, data, options });
  });

  // Atualiza ao vivo quando os dados/opções mudam (interativo e reativo).
  $effect(() => {
    const d = data, o = options;
    if (chart) { chart.data = d; if (o) chart.options = o; chart.update(); }
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="chart" style="height:{altura}px"><canvas bind:this={canvas}></canvas></div>

<style>
  .chart { position: relative; width: 100%; }
</style>
