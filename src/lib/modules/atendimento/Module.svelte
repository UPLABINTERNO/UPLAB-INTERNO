<script lang="ts">
  import { onMount } from 'svelte';
  import { isAdmin } from '$core/auth.svelte';
  import {
    listHorarios,
    salvarHorarios,
    DIAS,
    API_REFS,
    listConversas,
    listMensagens,
    type Horario,
    type Conversa,
    type Mensagem
  } from './api';

  type Aba = 'conversas' | 'horarios' | 'apis';
  let aba = $state<Aba>('conversas');
  let error = $state('');

  // ---- Conversas (time de atendimento) ----
  let conversas = $state<Conversa[]>([]);
  let busca = $state('');
  let convSel = $state<Conversa | null>(null);
  let mensagens = $state<Mensagem[]>([]);
  let carregandoMsg = $state(false);

  onMount(carregarConversas);

  async function carregarConversas() {
    error = '';
    try {
      conversas = await listConversas(busca);
    } catch (e) {
      error = msg(e);
    }
  }

  async function abrirConversa(c: Conversa) {
    convSel = c;
    carregandoMsg = true;
    mensagens = [];
    try {
      mensagens = await listMensagens(c.conversation_id);
    } catch (e) {
      error = msg(e);
    } finally {
      carregandoMsg = false;
    }
  }

  const hora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ---- Horários (admin) ----
  let todos = $state<Horario[]>([]);
  let departamentos = $state<string[]>([]);
  let depAtual = $state('geral');
  let dias = $state<Horario[]>([]);
  let novoDep = $state('');
  let okMsg = $state('');
  let salvando = $state(false);

  async function carregarHorarios() {
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
  function montarDias() {
    dias = Array.from({ length: 7 }, (_, d) => {
      const ex = todos.find((h) => h.departamento === depAtual && h.dia_semana === d);
      return ex ?? { departamento: depAtual, dia_semana: d, abre: '08:00', fecha: '18:00', ativo: d >= 1 && d <= 5 };
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
      await carregarHorarios();
    } catch (e) {
      error = msg(e);
    } finally {
      salvando = false;
    }
  }

  // ---- APIs (admin) ----
  let copiado = $state('');
  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copiado = url;
      setTimeout(() => (copiado = ''), 1500);
    } catch {
      /* ignora */
    }
  }

  function irPara(a: Aba) {
    aba = a;
    if (a === 'horarios' && todos.length === 0) carregarHorarios();
  }

  function msg(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return String(e);
  }
</script>

<div class="tabs">
  <button class:active={aba === 'conversas'} onclick={() => irPara('conversas')}>Conversas</button>
  {#if isAdmin()}
    <button class:active={aba === 'horarios'} onclick={() => irPara('horarios')}>Horários</button>
    <button class:active={aba === 'apis'} onclick={() => irPara('apis')}>APIs do robô</button>
  {/if}
</div>

{#if error}<p class="err">{error}</p>{/if}

{#if aba === 'conversas'}
  <div class="conv">
    <aside>
      <form class="busca" onsubmit={(e) => { e.preventDefault(); carregarConversas(); }}>
        <input placeholder="Buscar cliente ou telefone" bind:value={busca} />
        <button type="submit">Buscar</button>
      </form>
      <div class="lista">
        {#each conversas as c (c.conversation_id)}
          <button class="conv-item" class:active={convSel?.conversation_id === c.conversation_id} onclick={() => abrirConversa(c)}>
            <span class="nome">{c.contact_name || c.chat_id}</span>
            <span class="sub">{c.chat_id}{c.department ? ' · ' + c.department : ''}</span>
            <span class="when">{c.last_message_at ? hora(c.last_message_at) : ''}{c.is_closed ? ' · encerrada' : ''}</span>
          </button>
        {:else}
          <p class="dim pad">Nenhuma conversa ainda. Assim que o webhook do ZapResponder começar a enviar, elas aparecem aqui.</p>
        {/each}
      </div>
    </aside>

    <section class="thread">
      {#if !convSel}
        <p class="dim pad">Selecione uma conversa para ver o histórico.</p>
      {:else}
        <header class="thread-head">
          <strong>{convSel.contact_name || convSel.chat_id}</strong>
          <span class="dim">{convSel.chat_id}{convSel.attendant_name ? ' · ' + convSel.attendant_name : ''}</span>
        </header>
        <div class="msgs">
          {#if carregandoMsg}
            <p class="dim pad">Carregando…</p>
          {:else}
            {#each mensagens as m (m.id)}
              {#if m.direcao === 'sistema'}
                <div class="sys">{m.texto} · {hora(m.ts)}</div>
              {:else}
                <div class="bubble {m.direcao}">
                  {#if m.direcao === 'enviada' && m.author_name}<span class="autor">{m.author_name}</span>{/if}
                  <span class="txt">{m.texto}</span>
                  <span class="t">{hora(m.ts)}</span>
                </div>
              {/if}
            {:else}
              <p class="dim pad">Sem mensagens nesta conversa.</p>
            {/each}
          {/if}
        </div>
      {/if}
    </section>
  </div>
{:else if aba === 'horarios'}
  <p class="dim intro">
    Horário em que o robô considera o atendimento aberto (<code>/api/horario-atendimento</code>).
    Editar aqui <strong>não muda o link</strong> do robô — só o comportamento.
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
  <table class="estreita">
    <thead><tr><th>Dia</th><th>Ativo</th><th>Abre</th><th>Fecha</th></tr></thead>
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
    <button class="primary" onclick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : `Salvar "${depAtual}"`}</button>
    {#if okMsg}<span class="ok">{okMsg}</span>{/if}
  </div>
{:else}
  <p class="dim intro">Links do robô. Só os <strong>horários</strong> são editáveis aqui; o resto fica no projeto da API.</p>
  <table>
    <thead><tr><th>API</th><th>Editável aqui?</th><th>Link</th><th></th></tr></thead>
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

<style>
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .tabs button.active { background: var(--brand-grad); color: #fff; border-color: transparent; }
  .intro { margin: 0 0 1rem; }
  .dim { color: var(--text-dim); }
  .pad { padding: 1rem; }
  .mini { font-size: 0.75rem; }
  .err { color: var(--danger); }
  .ok { color: var(--ok); font-size: 0.85rem; }

  /* Conversas */
  .conv { display: grid; grid-template-columns: 300px 1fr; gap: 1rem; height: calc(100vh - 160px); }
  aside { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
  .busca { display: flex; gap: 0.4rem; padding: 0.7rem; border-bottom: 1px solid var(--border); }
  .busca input { flex: 1; min-width: 0; }
  .lista { overflow-y: auto; }
  .conv-item { width: 100%; text-align: left; border: none; border-bottom: 1px solid var(--border); border-radius: 0; background: transparent; display: grid; gap: 0.15rem; padding: 0.6rem 0.8rem; }
  .conv-item:hover { background: var(--surface-2); box-shadow: none; }
  .conv-item.active { background: var(--surface-2); border-left: 3px solid var(--accent); }
  .conv-item .nome { font-weight: 600; font-size: 0.9rem; }
  .conv-item .sub, .conv-item .when { font-size: 0.74rem; color: var(--text-dim); }
  .thread { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
  .thread-head { padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; background: var(--surface-2); }
  .msgs { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .bubble { max-width: 72%; padding: 0.5rem 0.7rem; border-radius: 12px; display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.88rem; }
  .bubble.recebida { align-self: flex-start; background: var(--surface-2); border: 1px solid var(--border); }
  .bubble.enviada { align-self: flex-end; background: var(--brand-blue); color: #fff; }
  .bubble .autor { font-size: 0.7rem; opacity: 0.85; font-weight: 600; }
  .bubble .t { font-size: 0.66rem; opacity: 0.7; align-self: flex-end; }
  .sys { align-self: center; font-size: 0.74rem; color: var(--text-dim); background: var(--surface-2); border-radius: 999px; padding: 0.2rem 0.7rem; }

  /* Horários / APIs */
  .deps { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
  .chip { text-transform: capitalize; padding: 0.4rem 0.8rem; }
  .chip.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .novo { display: flex; gap: 0.4rem; margin-left: auto; }
  .estreita { max-width: 640px; }
  .acoes { display: flex; align-items: center; gap: 1rem; margin-top: 1.2rem; }
  .url { font-size: 0.75rem; word-break: break-all; }
</style>
