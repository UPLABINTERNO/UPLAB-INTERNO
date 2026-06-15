<script lang="ts">
  import { onMount } from 'svelte';
  import { isAdmin } from '$core/auth.svelte';
  import { listHorarios, salvarHorarios, DIAS, API_REFS, type Horario } from './api';

  let aba = $state<'horarios' | 'apis'>('horarios');
  let todos = $state<Horario[]>([]);
  let departamentos = $state<string[]>([]);
  let depAtual = $state('geral');
  let dias = $state<Horario[]>([]);
  let novoDep = $state('');
  let error = $state('');
  let okMsg = $state('');
  let salvando = $state(false);
  let copiado = $state('');

  onMount(carregar);

  async function carregar() {
    error = '';
    try {
      todos = await listHorarios();
      const set = new Set(todos.map((h) => h.departamento));
      set.add('geral');
      departamentos = [...set].sort();
      if (!departamentos.includes(depAtual)) depAtual = departamentos[0] ?? 'geral';
      montarDias();
    } catch (e) {
      error = msg(e);
    }
  }

  // Monta os 7 dias do departamento atual (preenche dias sem cadastro com padrão).
  function montarDias() {
    dias = Array.from({ length: 7 }, (_, d) => {
      const existente = todos.find((h) => h.departamento === depAtual && h.dia_semana === d);
      return (
        existente ?? {
          departamento: depAtual,
          dia_semana: d,
          abre: '08:00',
          fecha: '18:00',
          ativo: d >= 1 && d <= 5
        }
      );
    });
  }

  function trocarDep(dep: string) {
    depAtual = dep;
    okMsg = '';
    montarDias();
  }

  function adicionarDep(e: Event) {
    e.preventDefault();
    const nome = novoDep.trim().toLowerCase();
    if (!nome) return;
    if (!departamentos.includes(nome)) departamentos = [...departamentos, nome].sort();
    novoDep = '';
    trocarDep(nome);
  }

  async function salvar() {
    salvando = true;
    error = '';
    okMsg = '';
    try {
      await salvarHorarios(dias);
      okMsg = `Horários de "${depAtual}" salvos.`;
      await carregar();
    } catch (e) {
      error = msg(e);
    } finally {
      salvando = false;
    }
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copiado = url;
      setTimeout(() => (copiado = ''), 1500);
    } catch {
      /* ignora */
    }
  }

  function msg(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return String(e);
  }
</script>

{#if !isAdmin()}
  <p class="dim">Esta área é restrita a administradores.</p>
{:else}
  <div class="tabs">
    <button class:active={aba === 'horarios'} onclick={() => (aba = 'horarios')}>Horários</button>
    <button class:active={aba === 'apis'} onclick={() => (aba = 'apis')}>APIs do robô</button>
  </div>

  {#if error}<p class="err">{error}</p>{/if}

  {#if aba === 'horarios'}
    <p class="dim intro">
      Define o horário em que o robô considera o atendimento aberto (endpoint
      <code>/api/horario-atendimento</code>). Editar aqui <strong>não muda o link</strong>
      usado pelo robô — só o comportamento.
    </p>

    <div class="deps">
      {#each departamentos as d (d)}
        <button class="chip" class:active={d === depAtual} onclick={() => trocarDep(d)}>{d}</button>
      {/each}
      <form class="novo" onsubmit={adicionarDep}>
        <input placeholder="novo departamento" bind:value={novoDep} />
        <button type="submit">+ Adicionar</button>
      </form>
    </div>

    <table>
      <thead>
        <tr><th>Dia</th><th>Ativo</th><th>Abre</th><th>Fecha</th></tr>
      </thead>
      <tbody>
        {#each dias as dia (dia.dia_semana)}
          <tr>
            <td>{DIAS[dia.dia_semana]}</td>
            <td><input type="checkbox" bind:checked={dia.ativo} /></td>
            <td><input type="time" bind:value={dia.abre} disabled={!dia.ativo} /></td>
            <td><input type="time" bind:value={dia.fecha} disabled={!dia.ativo} /></td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="acoes">
      <button class="primary" onclick={salvar} disabled={salvando}>
        {salvando ? 'Salvando…' : `Salvar horários de "${depAtual}"`}
      </button>
      {#if okMsg}<span class="ok">{okMsg}</span>{/if}
    </div>
  {:else}
    <p class="dim intro">
      Links que o robô usa. Só os <strong>horários</strong> são editáveis por aqui hoje;
      o resto (números, templates, chave, roteamento) está no projeto da API.
    </p>
    <table>
      <thead>
        <tr><th>API</th><th>Editável aqui?</th><th>Link</th><th></th></tr>
      </thead>
      <tbody>
        {#each API_REFS as a (a.url)}
          <tr>
            <td>{a.nome}<br /><span class="dim mini">{a.metodo} · {a.publico ? 'público' : 'com chave'}</span></td>
            <td>{a.editavelAqui ?? '—'}</td>
            <td><code class="url">{a.url}</code></td>
            <td><button onclick={() => copiar(a.url)}>{copiado === a.url ? 'Copiado!' : 'Copiar'}</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/if}

<style>
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .tabs button.active {
    background: var(--brand-grad);
    color: #fff;
    border-color: transparent;
  }
  .intro {
    margin: 0 0 1rem;
  }
  .dim {
    color: var(--text-dim);
  }
  .mini {
    font-size: 0.75rem;
  }
  .err {
    color: var(--danger);
  }
  .ok {
    color: var(--ok);
    font-size: 0.85rem;
  }
  .deps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .chip {
    text-transform: capitalize;
    padding: 0.4rem 0.8rem;
  }
  .chip.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .novo {
    display: flex;
    gap: 0.4rem;
    margin-left: auto;
  }
  table {
    max-width: 640px;
  }
  .acoes {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 1.2rem;
  }
  .url {
    font-size: 0.75rem;
    word-break: break-all;
  }
</style>
