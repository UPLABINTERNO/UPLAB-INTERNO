<script lang="ts">
  import { onMount } from 'svelte';
  import { hasLevel, currentProfile } from '$core/auth.svelte';
  import { getDashboard, type DashboardDia } from './api';
  import {
    listarAtendimentos, mapaClientes, buscarClientes, mensagensUnificadas, listarAtendentes,
    atualizarCliente, telefonePrincipal, meuAtendente, nomeExib,
    listarUsuariosInternos, listarVinculos, salvarVinculo,
    type Atendimento, type Cliente, type MensagemHist, type Atendente, type Usuario
  } from './chat';

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const profile = currentProfile();
  const podeGerencial = $derived(hasLevel('gestor'));

  type Aba = 'atendimentos' | 'metricas' | 'gerencial' | 'vinculos';
  let aba = $state<Aba>('atendimentos');
  let error = $state('');
  const podeAdmin = $derived(hasLevel('admin'));

  // ---- carregamento inicial (tela bonita) ----
  let carregando = $state(true);
  let progresso = $state(0);
  let etapa = $state('Iniciando…');

  let atendimentos = $state<Atendimento[]>([]);
  let clientesMap = $state<Record<string, Cliente>>({});
  let atendentes = $state<Atendente[]>([]);
  let meuAtendUuid = $state<string | null>(null);

  onMount(async () => {
    const t0 = Date.now();
    try {
      etapa = 'Carregando atendimentos…'; progresso = 20;
      atendimentos = await listarAtendimentos(); progresso = 50;
      etapa = 'Identificando clientes…';
      clientesMap = await mapaClientes(); progresso = 72;
      etapa = 'Carregando equipe…';
      atendentes = await listarAtendentes(); progresso = 88;
      if (profile) meuAtendUuid = await meuAtendente(profile.id);
      etapa = 'Organizando por data…'; progresso = 100;
    } catch (e) { error = msg(e); }
    const dt = Date.now() - t0;
    if (dt < 1800) await sleep(1800 - dt);
    carregando = false;
  });

  // ---- navegação Atendimentos ----
  type Modo = 'datas' | 'dia' | 'busca';
  let modo = $state<Modo>('datas');
  let diaSel = $state<string | null>(null);
  let busca = $state('');
  let resultados = $state<Cliente[]>([]);
  let buscaTimer: ReturnType<typeof setTimeout> | undefined;

  const nomeCli = (chatId: string) => nomeExib(clientesMap[chatId]) ?? chatId;

  const datas = $derived.by(() => {
    const m = new Map<string, { dia: string; total: number; encerradas: number }>();
    for (const a of atendimentos) {
      if (!a.dia) continue;
      const o = m.get(a.dia) ?? { dia: a.dia, total: 0, encerradas: 0 };
      o.total++; if (a.encerrada) o.encerradas++;
      m.set(a.dia, o);
    }
    return [...m.values()].sort((x, y) => y.dia.localeCompare(x.dia));
  });
  const atendDoDia = $derived(diaSel ? atendimentos.filter((a) => a.dia === diaSel) : []);

  function onBuscar() {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(async () => {
      if (!busca.trim()) { modo = 'datas'; resultados = []; return; }
      modo = 'busca';
      try { resultados = await buscarClientes(busca); } catch (e) { error = msg(e); }
    }, 250);
  }
  function abrirDia(d: string) { diaSel = d; modo = 'dia'; }
  function voltarDatas() { diaSel = null; modo = 'datas'; busca = ''; resultados = []; }

  // ---- thread ----
  let sel = $state<Cliente | null>(null);
  let msgs = $state<MensagemHist[]>([]);
  let carregandoMsgs = $state(false);
  let msgsEl = $state<HTMLElement | null>(null);
  let editando = $state(false);
  let edNome = $state(''), edCod = $state(''), edAtend = $state(''), salvando = $state(false);

  const RUIDO = /facebook leads|formul[aá]rio recebido/i;
  const limpa = (m: MensagemHist) => !!m.texto && !RUIDO.test(m.texto) && m.texto.trim().toLowerCase() !== 'start';

  async function abrirCliente(c: Cliente) {
    sel = c; editando = false; carregandoMsgs = true; msgs = [];
    try { msgs = (await mensagensUnificadas(c)).filter(limpa); }
    catch (e) { error = msg(e); } finally { carregandoMsgs = false; }
  }
  function abrirAtend(a: Atendimento) {
    const c = clientesMap[a.chat_id] ?? ({ chat_id: a.chat_id, nome: a.chat_id, telefones: [], is_grupo: false } as unknown as Cliente);
    abrirCliente(c);
  }
  function abrirEdicao() {
    if (!sel) return;
    edNome = sel.nome ?? ''; edCod = sel.codigo_loja ?? ''; edAtend = sel.atendente_uuid ?? ''; editando = true;
  }
  async function salvarEdicao() {
    if (!sel) return;
    salvando = true; error = '';
    const campos = { nome: edNome.trim() || null, codigo_loja: edCod.trim() || null, atendente_uuid: edAtend || null };
    try {
      await atualizarCliente(sel.chat_id, campos);
      sel = { ...sel, ...campos };
      clientesMap[sel.chat_id] = sel;
      editando = false;
    } catch (e) { error = msg(e); } finally { salvando = false; }
  }
  function exportar() {
    if (!sel) return;
    const linhas = msgs.map((m) => {
      const quem = m.classe === 'robo' ? 'Robô' : m.classe === 'sistema' ? 'Sistema' : (m.autor_nome ?? (m.classe === 'cliente' ? 'Cliente' : 'Atendente'));
      return `[${new Date(m.ts).toLocaleString('pt-BR')}] ${quem}: ${m.texto}`;
    });
    const tel = telefonePrincipal(sel);
    const blob = new Blob([`Conversa — ${sel.nome ?? tel}\nTelefone: ${tel}\n${'='.repeat(40)}\n` + linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `conversa-${tel}.txt`; a.click(); URL.revokeObjectURL(a.href);
  }

  function agrupa(itens: MensagemHist[]) {
    const out: { dia: string; itens: MensagemHist[] }[] = [];
    let cur: { dia: string; itens: MensagemHist[] } | null = null;
    for (const m of itens) {
      const dia = new Date(m.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      if (!cur || cur.dia !== dia) { cur = { dia, itens: [] }; out.push(cur); }
      cur.itens.push(m);
    }
    return out;
  }
  $effect(() => { if (msgs.length && msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight; });

  // ---- Métricas ----
  let mDe = $state(''), mAte = $state(''), mAtendFiltro = $state('');
  const ehGestor = $derived(podeGerencial);
  const metricasBase = $derived.by(() => {
    let lista = atendimentos.filter((a) => a.dia);
    if (mDe) lista = lista.filter((a) => a.dia! >= mDe);
    if (mAte) lista = lista.filter((a) => a.dia! <= mAte);
    if (!ehGestor) lista = meuAtendUuid ? lista.filter((a) => a.atendente_uuid === meuAtendUuid) : [];
    else if (mAtendFiltro) lista = lista.filter((a) => a.atendente_uuid === mAtendFiltro);
    return lista;
  });
  const resumoMet = $derived.by(() => {
    const cli = new Set<string>(); let msgsTot = 0, enc = 0;
    for (const a of metricasBase) { cli.add(a.chat_id); msgsTot += a.total_msgs || 0; if (a.encerrada) enc++; }
    return { atendimentos: metricasBase.length, clientes: cli.size, mensagens: msgsTot, encerradas: enc };
  });
  const porAtendente = $derived.by(() => {
    const m = new Map<string, { nome: string; atendimentos: number; mensagens: number; clientes: Set<string>; encerradas: number }>();
    for (const a of metricasBase) {
      const key = a.atendente_nome?.trim() || a.atendente_uuid || '— sem atendente';
      const o = m.get(key) ?? { nome: key, atendimentos: 0, mensagens: 0, clientes: new Set(), encerradas: 0 };
      o.atendimentos++; o.mensagens += a.total_msgs || 0; o.clientes.add(a.chat_id); if (a.encerrada) o.encerradas++;
      m.set(key, o);
    }
    return [...m.values()].map((o) => ({ ...o, clientes: o.clientes.size })).sort((x, y) => y.atendimentos - x.atendimentos);
  });
  const maxAtend = $derived(Math.max(1, ...porAtendente.map((a) => a.atendimentos)));

  // ---- Gerencial (KPIs do dia, ao vivo) ----
  let dash = $state<DashboardDia | null>(null);
  let dashOk = false;
  async function carregarDash() { if (dashOk) return; try { dash = await getDashboard(); dashOk = true; } catch (e) { error = msg(e); } }
  // ---- Vínculos (admin) ----
  let usuarios = $state<Usuario[]>([]);
  let vinculos = $state<Record<string, string>>({});
  let vincOk = false;
  let salvandoV = $state<string | null>(null);
  async function carregarVinculos() {
    if (vincOk) return;
    try { [usuarios, vinculos] = await Promise.all([listarUsuariosInternos(), listarVinculos()]); vincOk = true; }
    catch (e) { error = msg(e); }
  }
  async function definirVinculo(userId: string, atendUuid: string) {
    salvandoV = userId; error = '';
    try { await salvarVinculo(userId, atendUuid); vinculos = { ...vinculos, [userId]: atendUuid }; if (userId === profile?.id) meuAtendUuid = atendUuid; }
    catch (e) { error = msg(e); } finally { salvandoV = null; }
  }

  function irPara(a: Aba) { aba = a; error = ''; if (a === 'gerencial') carregarDash(); if (a === 'vinculos') carregarVinculos(); }

  // helpers
  const horaMin = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const inicial = (n: string | null) => (n?.trim()?.[0] ?? '?').toUpperCase();
  const PAL = ['#0d9488', '#2766c9', '#6366f1', '#0891b2', '#1aa179', '#7c3aed', '#2f8fd6', '#db6d28'];
  const cor = (s: string) => PAL[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
  const diaLabel = (d: string) => {
    const [y, m, dd] = d.split('-');
    const dt = new Date(+y, +m - 1, +dd), hoje = new Date();
    if (dt.toDateString() === hoje.toDateString()) return 'Hoje';
    const ont = new Date(hoje); ont.setDate(hoje.getDate() - 1);
    if (dt.toDateString() === ont.toDateString()) return 'Ontem';
    return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  };
  function exibirTexto(t: string): string {
    const s = (t ?? '').trim();
    if (/^https?:\/\/\S+\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(s)) return '📷 Imagem';
    if (/^https?:\/\/\S+\.(mp4|mov|webm)(\?|$)/i.test(s)) return '🎬 Vídeo';
    if (/^https?:\/\/\S+\.(mp3|ogg|opus|wav|m4a)(\?|$)/i.test(s)) return '🎵 Áudio';
    if (/^https?:\/\/\S+\.(pdf|docx?|xlsx?|pptx?|zip|rar)(\?|$)/i.test(s)) return '📎 Documento';
    if (/^https?:\/\/(s3\.)?zapresponder\.com\.br\/\S+/i.test(s) || /\/uploads\/\S+\/chats\//i.test(s)) return '📷 Imagem';
    return t;
  }
  function msg(e: unknown): string { return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e); }
</script>

{#snippet bolhas(itens: MensagemHist[], isGrupo: boolean)}
  {#each agrupa(itens) as dia (dia.dia)}
    <div class="sep"><span>{dia.dia}</span></div>
    {#each dia.itens as m (m.id)}
      {#if m.classe === 'sistema'}
        <div class="sys">{m.texto} · {horaMin(m.ts)}</div>
      {:else}
        <div class="row {m.classe === 'cliente' ? 'in' : 'out'}">
          <div class="bubble {m.classe}">
            {#if m.classe === 'cliente' && isGrupo && m.autor_nome}<span class="autor" style="color:{cor(m.autor_nome)}">{m.autor_nome}</span>
            {:else if m.classe === 'atendente'}<span class="autor at">{m.autor_nome ?? 'Atendente'}</span>
            {:else if m.classe === 'robo'}<span class="autor bot">🤖 Robô</span>{/if}
            <span class="txt">{exibirTexto(m.texto)}</span>
            <span class="hora">{horaMin(m.ts)}</span>
          </div>
        </div>
      {/if}
    {/each}
  {/each}
{/snippet}

{#if carregando}
  <div class="loading">
    <div class="orb"><img src="/logo.png" alt="UPLAB" /></div>
    <strong>Central de Atendimento</strong>
    <span class="et">{etapa}</span>
    <div class="bar"><div class="fill" style="width:{progresso}%"></div></div>
  </div>
{:else}
  <div class="modulo">
    <nav class="rail">
      <button class:on={aba === 'atendimentos'} onclick={() => irPara('atendimentos')}>
        <svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></svg><span>Conversas</span>
      </button>
      <button class:on={aba === 'metricas'} onclick={() => irPara('metricas')}>
        <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" /></svg><span>{ehGestor ? 'Métricas' : 'Minhas'}</span>
      </button>
      {#if podeGerencial}
        <button class:on={aba === 'gerencial'} onclick={() => irPara('gerencial')}>
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg><span>Gerencial</span>
        </button>
      {/if}
      {#if podeAdmin}
        <button class:on={aba === 'vinculos'} onclick={() => irPara('vinculos')}>
          <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg><span>Vínculos</span>
        </button>
      {/if}
    </nav>

    <div class="area">
      {#if error}<p class="err">{error}</p>{/if}

      {#if aba === 'atendimentos'}
        <div class="wa">
          <aside>
            <div class="topo"><input class="busca" placeholder="Buscar cliente, telefone ou código…" bind:value={busca} oninput={onBuscar} /></div>
            <div class="lista">
              {#if modo === 'busca'}
                {#each resultados as c (c.chat_id)}
                  <button class="item" class:sel={sel?.chat_id === c.chat_id} onclick={() => abrirCliente(c)}>
                    <span class="av" style="background:{cor(nomeExib(c))}">{inicial(nomeExib(c))}</span>
                    <span class="meio"><span class="l1"><span class="nome">{nomeExib(c)}</span></span><span class="l2"><span class="prev">{telefonePrincipal(c)}{c.codigo_loja ? ` · loja ${c.codigo_loja}` : ''}{c.cidade ? ` · ${c.cidade}` : ''}</span></span></span>
                  </button>
                {:else}<p class="dim pad">Nenhum resultado.</p>{/each}
              {:else if modo === 'datas'}
                {#each datas as d (d.dia)}
                  <button class="diaitem" onclick={() => abrirDia(d.dia)}>
                    <span class="dlabel">{diaLabel(d.dia)}</span>
                    <span class="dcount">{d.total}<small> conversa(s)</small></span>
                  </button>
                {:else}<p class="dim pad">Sem atendimentos.</p>{/each}
              {:else}
                <button class="voltar" onclick={voltarDatas}>← Datas</button>
                <div class="diahead">{diaSel ? diaLabel(diaSel) : ''} · {atendDoDia.length}</div>
                {#each atendDoDia as a (a.conversation_id)}
                  <button class="item" class:sel={sel?.chat_id === a.chat_id} onclick={() => abrirAtend(a)}>
                    <span class="av" style="background:{cor(nomeCli(a.chat_id))}">{inicial(nomeCli(a.chat_id))}</span>
                    <span class="meio">
                      <span class="l1"><span class="nome">{nomeCli(a.chat_id)}</span><span class="hora">{a.fim ? horaMin(a.fim) : ''}</span></span>
                      <span class="l2">
                        <span class="chip" class:x={a.encerrada} class:ok={!a.encerrada}>{a.encerrada ? 'encerrada' : 'aberta'}</span>
                        <span class="prev">{a.atendente_nome ?? 'sem atendente'}</span>
                      </span>
                    </span>
                  </button>
                {/each}
              {/if}
            </div>
          </aside>

          <section class="thread">
            {#if !sel}
              <div class="vazio"><div class="logo-bg"></div><p>Escolha uma data e uma conversa para ver o histórico completo.</p></div>
            {:else}
              <header class="th-head">
                <span class="av" style="background:{cor(nomeExib(sel))}">{inicial(nomeExib(sel))}</span>
                <div class="info">
                  <strong>{nomeExib(sel)}</strong>
                  <span class="sub">
                    {telefonePrincipal(sel)}{sel.codigo_loja ? ` · loja ${sel.codigo_loja}` : ''}{sel.cidade ? ` · ${sel.cidade}` : ''}{sel.vendedor ? ` · vend. ${sel.vendedor}` : ''}{sel.carteira ? ` · ${sel.carteira}` : ''}
                  </span>
                </div>
                <button class="ico" title="Exportar" onclick={exportar} aria-label="Exportar"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4M4 21h16" /></svg></button>
                <button class="ico" title="Editar / transferir" onclick={abrirEdicao} aria-label="Editar"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg></button>
              </header>
              {#if editando}
                <div class="editor">
                  <label>Nome <input bind:value={edNome} /></label>
                  <label>Código da loja <input bind:value={edCod} placeholder="ex: 2705" /></label>
                  <label>Atendente <select bind:value={edAtend}><option value="">—</option>{#each atendentes as a (a.uuid)}<option value={a.uuid}>{a.nome ?? a.uuid}</option>{/each}</select></label>
                  <div class="ed-acoes"><button class="primary" onclick={salvarEdicao} disabled={salvando}>{salvando ? '…' : 'Salvar'}</button><button onclick={() => (editando = false)}>Cancelar</button></div>
                </div>
              {/if}
              <div class="msgs" bind:this={msgsEl}>
                {#if carregandoMsgs}<p class="dim pad center">Carregando conversa…</p>{:else}{@render bolhas(msgs, sel.is_grupo)}{/if}
              </div>
              <div class="ro">Somente leitura · histórico do ZapResponder</div>
            {/if}
          </section>
        </div>

      {:else if aba === 'metricas'}
        <div class="met-head">
          <h3>{ehGestor ? 'Métricas da equipe' : 'Minhas métricas'}</h3>
          <div class="filtros-met">
            <input type="date" bind:value={mDe} title="De" />
            <input type="date" bind:value={mAte} title="Até" />
            {#if ehGestor}
              <select bind:value={mAtendFiltro}><option value="">Todos atendentes</option>{#each atendentes as a (a.uuid)}<option value={a.uuid}>{a.nome ?? a.uuid}</option>{/each}</select>
            {/if}
          </div>
        </div>
        {#if !ehGestor && !meuAtendUuid}
          <p class="aviso">Seu usuário ainda não está vinculado a um atendente. Peça a um administrador para fazer o vínculo.</p>
        {:else}
          <div class="kpis">
            <div class="kpi"><span class="rot">Atendimentos</span><strong>{resumoMet.atendimentos}</strong></div>
            <div class="kpi"><span class="rot">Clientes</span><strong>{resumoMet.clientes}</strong></div>
            <div class="kpi"><span class="rot">Mensagens</span><strong>{resumoMet.mensagens}</strong></div>
            <div class="kpi"><span class="rot">Encerradas</span><strong>{resumoMet.encerradas}</strong></div>
          </div>
          {#if ehGestor}
            <div class="cardp">
              <h4>Atendimentos por atendente</h4>
              {#each porAtendente as a (a.nome)}
                <div class="barra-row">
                  <span class="barra-nome" title={a.nome}>{a.nome}</span>
                  <div class="barra-trilho"><div class="barra-fill" style="width:{(a.atendimentos / maxAtend) * 100}%"></div></div>
                  <span class="barra-val">{a.atendimentos}</span>
                </div>
              {:else}<p class="dim">Sem dados no período.</p>{/each}
            </div>
          {/if}
        {/if}

      {:else if aba === 'gerencial'}
        <h3 class="titulo">Painel gerencial · hoje</h3>
        {#if dash}
          <div class="kpis">
            <div class="kpi"><span class="rot">Clientes hoje</span><strong>{dash.clientes_atendidos_hoje}</strong></div>
            <div class="kpi"><span class="rot">Abertas</span><strong>{dash.conversas_abertas}</strong></div>
            <div class="kpi"><span class="rot">Encerradas hoje</span><strong>{dash.conversas_encerradas_hoje}</strong></div>
            <div class="kpi"><span class="rot">Mensagens hoje</span><strong>{dash.mensagens_hoje}</strong></div>
            <div class="kpi"><span class="rot">Atendentes ativos</span><strong>{dash.atendentes_hoje}</strong></div>
          </div>
        {:else}<p class="dim">Carregando…</p>{/if}
        <div class="cardp">
          <h4>Histórico acumulado</h4>
          <div class="kpis">
            <div class="kpi"><span class="rot">Atendimentos</span><strong>{atendimentos.length}</strong></div>
            <div class="kpi"><span class="rot">Clientes</span><strong>{Object.keys(clientesMap).length}</strong></div>
            <div class="kpi"><span class="rot">Atendentes</span><strong>{atendentes.length}</strong></div>
          </div>
        </div>

      {:else}
        <h3 class="titulo">Vínculos · usuário → atendente</h3>
        <p class="dim" style="margin-top:-0.6rem">Defina qual atendente do ZapResponder corresponde a cada usuário interno (usado nas métricas individuais).</p>
        <div class="cardp">
          <table>
            <thead><tr><th>Usuário</th><th>Papel</th><th>Atendente</th></tr></thead>
            <tbody>
              {#each usuarios as u (u.id)}
                <tr>
                  <td><strong>{u.nome}</strong><br /><span class="dim" style="font-size:0.72rem">{u.email ?? ''}</span></td>
                  <td>{u.role}</td>
                  <td>
                    <select value={vinculos[u.id] ?? ''} onchange={(e) => definirVinculo(u.id, (e.currentTarget as HTMLSelectElement).value)} disabled={salvandoV === u.id}>
                      <option value="">—</option>
                      {#each atendentes as a (a.uuid)}<option value={a.uuid}>{a.nome ?? a.uuid}</option>{/each}
                    </select>
                    {#if salvandoV === u.id}<span class="dim"> salvando…</span>{/if}
                  </td>
                </tr>
              {:else}
                <tr><td colspan="3" class="dim">Nenhum usuário interno.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ---- Loading ---- */
  .loading { height: calc(100vh - 130px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; }
  .orb { width: 92px; height: 92px; border-radius: 24px; display: grid; place-items: center; background: var(--navy-grad); box-shadow: 0 14px 36px rgba(16,47,92,0.4); animation: pulse 1.6s ease-in-out infinite; }
  .orb img { width: 58px; height: 58px; object-fit: contain; filter: brightness(0) invert(1); opacity: 0.95; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  .loading strong { font-size: 1.05rem; }
  .loading .et { font-size: 0.82rem; color: var(--text-dim); }
  .bar { width: 240px; height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; box-shadow: inset 0 0 0 1px var(--border); }
  .bar .fill { height: 100%; background: var(--brand-grad); border-radius: 999px; transition: width 0.5s ease; }

  .modulo { display: grid; grid-template-columns: 76px 1fr; gap: 1rem; height: calc(100vh - 130px); }
  .rail { display: flex; flex-direction: column; gap: 0.4rem; }
  .rail button { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.6rem 0.3rem; border-radius: var(--radius-sm); font-size: 0.64rem; color: var(--text-dim); border-color: transparent; background: transparent; }
  .rail button svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .rail button:hover { background: var(--surface); color: var(--text); box-shadow: none; }
  .rail button.on { background: var(--surface); color: var(--accent); box-shadow: var(--shadow-sm); font-weight: 600; }
  .area { min-width: 0; min-height: 0; overflow: auto; }
  .titulo { margin: 0 0 1rem; font-size: 1.05rem; }
  .dim { color: var(--text-dim); }
  .pad { padding: 1rem; }
  .center { text-align: center; }
  .err { color: var(--danger); }
  .aviso { background: #fff6e6; border: 1px solid #f0d28a; color: #8a5a00; padding: 0.8rem 1rem; border-radius: var(--radius); }

  .wa { display: grid; grid-template-columns: 330px 1fr; height: 100%; min-height: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); background: var(--surface); }
  aside { display: flex; flex-direction: column; border-right: 1px solid var(--border); min-width: 0; min-height: 0; }
  .topo { display: flex; gap: 0.4rem; padding: 0.6rem; border-bottom: 1px solid var(--border); }
  .busca { flex: 1; min-width: 0; }
  .lista { flex: 1; min-height: 0; overflow-y: auto; }
  .voltar { width: 100%; text-align: left; border: none; border-bottom: 1px solid var(--border); border-radius: 0; background: var(--surface-2); color: var(--accent); font-size: 0.8rem; font-weight: 600; padding: 0.5rem 0.8rem; }
  .voltar:hover { box-shadow: none; }
  .diahead { padding: 0.4rem 0.8rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); background: var(--surface-2); border-bottom: 1px solid var(--border); }
  .diaitem { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 0.85rem; border: none; border-bottom: 1px solid var(--border); border-radius: 0; background: transparent; text-align: left; }
  .diaitem:hover { background: var(--surface-2); box-shadow: none; }
  .dlabel { font-weight: 600; font-size: 0.86rem; text-transform: capitalize; }
  .dcount { font-size: 0.8rem; color: var(--accent); font-weight: 700; }
  .dcount small { color: var(--text-dim); font-weight: 400; }

  .item { width: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.7rem; border: none; border-bottom: 1px solid var(--border); border-radius: 0; background: transparent; text-align: left; }
  .item:hover { background: var(--surface-2); box-shadow: none; }
  .item.sel { background: var(--accent-soft); }
  .av { display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; color: #fff; font-weight: 700; }
  .meio { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 0.1rem; }
  .l1 { display: flex; justify-content: space-between; gap: 0.4rem; align-items: baseline; }
  .l1 .nome { font-weight: 600; font-size: 0.86rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .l1 .hora { font-size: 0.68rem; color: var(--text-dim); flex-shrink: 0; }
  .l2 { display: flex; align-items: center; gap: 0.3rem; min-width: 0; }
  .l2 .prev { font-size: 0.76rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip { font-size: 0.58rem; font-weight: 700; text-transform: uppercase; padding: 0.05rem 0.35rem; border-radius: var(--radius-pill); flex-shrink: 0; }
  .chip.ok { color: var(--ok); background: rgba(18,160,106,0.14); }
  .chip.x { color: var(--text-dim); background: rgba(107,120,144,0.14); }

  .thread { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #efeae2; }
  .vazio { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; color: #5b6b7a; padding: 2rem; text-align: center; }
  .logo-bg { width: 90px; height: 90px; border-radius: 50%; background: linear-gradient(135deg, #d7ccc0, #cfe9dd); opacity: 0.7; }
  .th-head { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.7rem; background: var(--surface); border-bottom: 1px solid var(--border); }
  .th-head .av { width: 38px; height: 38px; font-size: 0.9rem; }
  .th-head .info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .th-head strong { font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .th-head .sub { font-size: 0.72rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ico { display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; padding: 0; }
  .ico svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .editor { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: end; padding: 0.7rem 0.9rem; background: var(--surface-2); border-bottom: 1px solid var(--border); }
  .editor label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.72rem; font-weight: 600; color: var(--text-dim); }
  .ed-acoes { display: flex; gap: 0.4rem; }
  .msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 0.8rem 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .sep { text-align: center; margin: 0.5rem 0; }
  .sep span { font-size: 0.68rem; color: #5b6b7a; background: #e4ddd2; border-radius: var(--radius-pill); padding: 0.18rem 0.7rem; text-transform: capitalize; box-shadow: 0 1px 1px rgba(0,0,0,0.08); }
  .sys { align-self: center; font-size: 0.7rem; color: #5b6b7a; background: #e4ddd2; border-radius: 6px; padding: 0.2rem 0.7rem; max-width: 80%; text-align: center; box-shadow: 0 1px 1px rgba(0,0,0,0.08); }
  .row { display: flex; }
  .row.in { justify-content: flex-start; }
  .row.out { justify-content: flex-end; }
  .bubble { max-width: 74%; padding: 0.35rem 0.55rem 0.3rem; border-radius: 8px; font-size: 0.85rem; line-height: 1.3; box-shadow: 0 1px 1px rgba(0,0,0,0.13); display: flex; flex-direction: column; }
  .bubble.cliente { background: #fff; border-top-left-radius: 0; }
  .bubble.atendente { background: #d9fdd3; border-top-right-radius: 0; }
  .bubble.robo { background: #eaf6e0; border-top-right-radius: 0; }
  .autor { font-size: 0.7rem; font-weight: 700; margin-bottom: 0.05rem; }
  .autor.at { color: #1f8f6b; }
  .autor.bot { color: #6b7890; }
  .txt { white-space: pre-wrap; word-break: break-word; color: #111b21; }
  .bubble .hora { align-self: flex-end; font-size: 0.6rem; color: #667781; margin-top: 0.05rem; }
  .ro { text-align: center; font-size: 0.68rem; color: #5b6b7a; background: var(--surface); padding: 0.35rem; border-top: 1px solid var(--border); }

  .met-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .met-head h3 { margin: 0; font-size: 1.05rem; }
  .filtros-met { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .filtros-met input, .filtros-met select { font-size: 0.8rem; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.8rem; margin-bottom: 1rem; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .kpi .rot { font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi strong { font-size: 1.5rem; background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .cardp { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); padding: 1rem 1.1rem; margin-bottom: 1rem; }
  .cardp h4 { margin: 0 0 0.8rem; font-size: 0.9rem; }
  .barra-row { display: grid; grid-template-columns: 150px 1fr 36px; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
  .barra-nome { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .barra-trilho { background: var(--surface-2); border-radius: var(--radius-pill); height: 10px; overflow: hidden; }
  .barra-fill { height: 100%; background: var(--brand-grad); border-radius: var(--radius-pill); transition: width 0.4s ease; }
  .barra-val { font-size: 0.8rem; font-weight: 600; text-align: right; color: var(--text-dim); }
</style>
