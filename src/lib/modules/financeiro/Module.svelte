<script lang="ts">
  import { onMount } from 'svelte';
  import { can, hasLevel } from '$core/auth.svelte';
  import { financeiroApi, type Lancamento, type LancamentoInput } from './api';

  let itens = $state<Lancamento[]>([]);
  let error = $state('');
  let editing = $state<string | null>(null);

  const podeCriar = $derived(can('financeiro', 'create'));
  const podeEditar = $derived(can('financeiro', 'update'));
  const podeExcluir = $derived(can('financeiro', 'delete'));

  // Tela por NÍVEL: o resumo financeiro só aparece para diretoria/admin.
  const verResumo = $derived(hasLevel('diretoria'));
  const totais = $derived.by(() => {
    let receitas = 0;
    let despesas = 0;
    for (const l of itens) {
      if (l.tipo === 'receita') receitas += l.valor_cents;
      else despesas += l.valor_cents;
    }
    return { receitas, despesas, saldo: receitas - despesas };
  });

  const vazio = (): LancamentoInput => ({
    descricao: '',
    tipo: 'receita',
    valor_cents: 0,
    categoria: '',
    data: new Date().toISOString().slice(0, 10)
  });
  let form = $state<LancamentoInput>(vazio());
  let valorReais = $state('');

  onMount(carregar);

  async function carregar() {
    try {
      itens = await financeiroApi.list();
    } catch (e) {
      error = msg(e);
    }
  }

  async function salvar(e: Event) {
    e.preventDefault();
    error = '';
    form.valor_cents = Math.round(parseFloat(valorReais || '0') * 100);
    try {
      if (editing) await financeiroApi.update(editing, form);
      else await financeiroApi.create(form);
      cancelar();
      await carregar();
    } catch (err) {
      error = msg(err);
    }
  }

  function editar(l: Lancamento) {
    editing = l.id;
    form = {
      descricao: l.descricao,
      tipo: l.tipo,
      valor_cents: l.valor_cents,
      categoria: l.categoria,
      data: l.data
    };
    valorReais = (l.valor_cents / 100).toFixed(2);
  }

  function cancelar() {
    editing = null;
    form = vazio();
    valorReais = '';
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este lançamento?')) return;
    try {
      await financeiroApi.remove(id);
      await carregar();
    } catch (e) {
      error = msg(e);
    }
  }

  function msg(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return String(e);
  }

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
</script>

{#if error}<p class="err">{error}</p>{/if}

{#if verResumo}
  <div class="resumo">
    <div class="rcard">
      <span class="rlabel">Receitas</span>
      <strong style="color:var(--ok)">{fmt(totais.receitas)}</strong>
    </div>
    <div class="rcard">
      <span class="rlabel">Despesas</span>
      <strong style="color:var(--danger)">{fmt(totais.despesas)}</strong>
    </div>
    <div class="rcard">
      <span class="rlabel">Saldo</span>
      <strong style="color:{totais.saldo >= 0 ? 'var(--ok)' : 'var(--danger)'}">{fmt(totais.saldo)}</strong>
    </div>
  </div>
{/if}

{#if podeCriar || editing}
  <form onsubmit={salvar} class="form">
    <input placeholder="Descrição" bind:value={form.descricao} required />
    <select bind:value={form.tipo}>
      <option value="receita">Receita</option>
      <option value="despesa">Despesa</option>
    </select>
    <input placeholder="Valor (R$)" type="number" step="0.01" bind:value={valorReais} required />
    <input placeholder="Categoria" bind:value={form.categoria} />
    <input type="date" bind:value={form.data} required />
    <button class="primary" type="submit">{editing ? 'Salvar' : 'Adicionar'}</button>
    {#if editing}<button type="button" onclick={cancelar}>Cancelar</button>{/if}
  </form>
{/if}

<table>
  <thead>
    <tr>
      <th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th></th>
    </tr>
  </thead>
  <tbody>
    {#each itens as l (l.id)}
      <tr>
        <td>{l.data}</td>
        <td>{l.descricao}</td>
        <td>{l.categoria}</td>
        <td>{l.tipo}</td>
        <td style="color:{l.tipo === 'receita' ? 'var(--ok)' : 'var(--danger)'}">{fmt(l.valor_cents)}</td>
        <td class="acoes">
          {#if podeEditar}<button onclick={() => editar(l)}>Editar</button>{/if}
          {#if podeExcluir}<button class="danger" onclick={() => excluir(l.id)}>Excluir</button>{/if}
        </td>
      </tr>
    {:else}
      <tr><td colspan="6" class="dim">Nenhum lançamento.</td></tr>
    {/each}
  </tbody>
</table>

<style>
  .resumo {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.8rem;
    margin-bottom: 1.2rem;
  }
  .rcard {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 1rem 1.1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .rcard strong {
    font-size: 1.35rem;
  }
  .rlabel {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 1.2rem;
  }
  .err {
    color: var(--danger);
  }
  .dim {
    color: var(--text-dim);
  }
  .acoes {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
  }
</style>
