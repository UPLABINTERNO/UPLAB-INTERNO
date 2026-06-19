<script lang="ts">
  import { onMount } from 'svelte';
  import { hasLevel, currentProfile } from '$core/auth.svelte';
  import Chart from '$core/ui/Chart.svelte';
  import type { ChartData, ChartOptions } from 'chart.js';
  import {
    listarAtendimentos, mapaClientes, mensagensDoCliente, listarAtendentes,
    atualizarCliente, telefonePrincipal, meuAtendente, nomeExib,
    listarUsuariosInternos, listarVinculos, salvarVinculo,
    trPorAtendente, trPorDia, listarConfigAtend, salvarConfigAtend,
    type Atendimento, type Cliente, type MensagemHist, type Atendente, type Usuario,
    type TRAtendente, type TRDia
  } from './chat';

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const profile = currentProfile();
  const podeGerencial = $derived(hasLevel('gestor'));
  const podeAdmin = $derived(hasLevel('admin'));

  type Aba = 'atendimentos' | 'desempenho' | 'resultados' | 'config' | 'vinculos';
  let aba = $state<Aba>('atendimentos');
  let error = $state('');
  let configAtend = $state<Record<string, boolean>>({});
  const visivel = (nome: string) => configAtend[nome] !== false;

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
      atendentes = await listarAtendentes(); progresso = 84;
      configAtend = await listarConfigAtend(); progresso = 90;
      if (profile) meuAtendUuid = await meuAtendente(profile.id);
      etapa = 'Organizando…'; progresso = 100;
    } catch (e) { error = msg(e); }
    const dt = Date.now() - t0;
    if (dt < 1400) await sleep(1400 - dt);
    carregando = false;
  });

  // período coberto (para rótulo "histórico até …")
  const periodoDados = $derived.by(() => {
    const dias = atendimentos.map((a) => a.dia).filter(Boolean) as string[];
    if (!dias.length) return null;
    return { min: dias.reduce((a, b) => (a < b ? a : b)), max: dias.reduce((a, b) => (a > b ? a : b)) };
  });

  // ---- navegação Atendimentos: lista POR CLIENTE (1 chat por número) ----
  let busca = $state('');
  const clientesArr = $derived(
    Object.values(clientesMap).sort((a, b) => (b.ultima_msg_at ?? '').localeCompare(a.ultima_msg_at ?? ''))
  );
  const clientesFiltrados = $derived.by(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return clientesArr;
    const dig = t.replace(/\D/g, '');
    return clientesArr.filter((c) => {
      const nome = (nomeExib(c) || '').toLowerCase();
      const cod = (c.codigo_loja || '').toLowerCase();
      const cid = (c.cidade || '').toLowerCase();
      return nome.includes(t) || cod.includes(t) || cid.includes(t) || (dig.length >= 3 && (telefonePrincipal(c) || '').includes(dig));
    });
  });

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
    try { msgs = (await mensagensDoCliente(c.chat_id)).filter(limpa); }
    catch (e) { error = msg(e); } finally { carregandoMsgs = false; }
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
      sel = { ...sel, ...campos }; clientesMap[sel.chat_id] = sel; editando = false;
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

  // ================= Desempenho =================
  let mDe = $state(''), mAte = $state(''), mAtendFiltro = $state('');
  let trAtend = $state<TRAtendente[]>([]);
  let trDias = $state<TRDia[]>([]);
  let trCarregando = $state(false);

  const meuAtendNome = $derived(atendentes.find((a) => a.uuid === meuAtendUuid)?.nome?.trim() ?? null);
  const atendFiltradoUuid = $derived(!podeGerencial ? meuAtendUuid : (mAtendFiltro || null));

  const SEM_ATEND = 'Sem atendimento humano';
  const baseAtend = $derived(atendimentos.filter((a) =>
    a.dia && (!mDe || a.dia >= mDe) && (!mAte || a.dia <= mAte)
    && (!atendFiltradoUuid || a.atendente_uuid === atendFiltradoUuid)
    && visivel(a.atendente_nome?.trim() || SEM_ATEND)));

  const resumo = $derived.by(() => {
    const cli = new Set<string>(); let msgsTot = 0, enc = 0;
    for (const a of baseAtend) { cli.add(a.chat_id); msgsTot += a.total_msgs || 0; if (a.encerrada) enc++; }
    return { conversas: baseAtend.length, clientes: cli.size, mensagens: msgsTot, encerradas: enc };
  });

  const serieConversas = $derived.by(() => {
    const m = new Map<string, number>();
    for (const a of baseAtend) if (a.dia) m.set(a.dia, (m.get(a.dia) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([x, y]) => ({ x, y }));
  });

  const nomeFiltro = $derived(
    !podeGerencial ? meuAtendNome
      : (mAtendFiltro ? atendentes.find((a) => a.uuid === mAtendFiltro)?.nome?.trim() ?? null : null));
  const trVisivel = $derived(nomeFiltro ? trAtend.filter((t) => t.atendente.trim() === nomeFiltro) : trAtend);
  const tempoMedio = $derived.by(() => {
    let r = 0, s = 0;
    for (const t of trVisivel) { r += t.respostas; s += t.respostas * Number(t.tempo_medio_s); }
    return r ? s / r : null;
  });
  const serieTempo = $derived(trDias.map((d) => ({ x: d.dia, y: Number(d.tempo_medio_s) / 60 })));

  interface RelItem { nome: string; conversas: number; mensagens: number; clientes: number; encerradas: number; tempo_s: number | null; duracao_s: number | null; }
  const relatorio = $derived.by<RelItem[]>(() => {
    const m = new Map<string, { nome: string; conversas: number; mensagens: number; clientes: Set<string>; encerradas: number; durSoma: number; durN: number }>();
    for (const a of baseAtend) {
      const nome = a.atendente_nome?.trim() || SEM_ATEND;
      const o = m.get(nome) ?? { nome, conversas: 0, mensagens: 0, clientes: new Set<string>(), encerradas: 0, durSoma: 0, durN: 0 };
      o.conversas++; o.mensagens += a.total_msgs || 0; o.clientes.add(a.chat_id); if (a.encerrada) o.encerradas++;
      if (a.inicio && a.fim) {
        const d = (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 1000;
        if (d > 0 && d < 86400) { o.durSoma += d; o.durN++; }
      }
      m.set(nome, o);
    }
    const trMap = new Map(trAtend.map((t) => [t.atendente.trim(), Number(t.tempo_medio_s)]));
    return [...m.values()]
      .map((o) => ({ nome: o.nome, conversas: o.conversas, mensagens: o.mensagens, clientes: o.clientes.size, encerradas: o.encerradas, tempo_s: trMap.get(o.nome) ?? null, duracao_s: o.durN ? o.durSoma / o.durN : null }))
      .sort((x, y) => y.conversas - x.conversas);
  });
  const maxTempo = $derived(Math.max(1, ...relatorio.map((a) => a.tempo_s ?? 0)));
  // só atendentes humanos, p/ a tela de Resultados (apresentação)
  const relatorioHumano = $derived(relatorio.filter((a) => a.nome !== SEM_ATEND));

  // ---- Configs Chart.js ----
  const eixoComum: ChartOptions = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 800, easing: 'easeOutQuart' },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { padding: 10, displayColors: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } } }
  };
  const chartConversas = $derived<ChartData>({
    labels: serieConversas.map((d) => ddmm(d.x)),
    datasets: [{ label: 'Conversas', data: serieConversas.map((d) => d.y), borderColor: '#2766c9', backgroundColor: 'rgba(39,102,201,0.14)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }]
  });
  const chartTempo = $derived<ChartData>({
    labels: serieTempo.map((d) => ddmm(d.x)),
    datasets: [{ label: 'Tempo médio (min)', data: serieTempo.map((d) => Math.round(d.y)), borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.14)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }]
  });
  const chartBarras = $derived<ChartData>({
    labels: relatorioHumano.map((a) => a.nome),
    datasets: [{ label: 'Conversas', data: relatorioHumano.map((a) => a.conversas), backgroundColor: '#2f8fd6', borderRadius: 6, maxBarThickness: 34 }]
  });
  const barrasOpt: ChartOptions = { ...eixoComum, indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } }, y: { grid: { display: false } } } };

  function rangeISO() {
    const de = mDe ? `${mDe}T00:00:00` : (periodoDados?.min ? `${periodoDados.min}T00:00:00` : '2000-01-01');
    const ate = mAte ? `${mAte}T23:59:59` : (periodoDados?.max ? `${periodoDados.max}T23:59:59` : '2100-01-01');
    return { de, ate };
  }
  let trCarregado = false;
  async function carregarTR() {
    trCarregando = true; error = '';
    try {
      const { de, ate } = rangeISO();
      [trAtend, trDias] = await Promise.all([trPorAtendente(de, ate), trPorDia(de, ate)]);
      trCarregado = true;
    } catch (e) { error = msg(e); } finally { trCarregando = false; }
  }

  // ---- Config: atendentes visíveis nos dashboards ----
  const nomesParaConfig = $derived.by(() => {
    const s = new Set<string>();
    for (const a of atendimentos) { const n = a.atendente_nome?.trim(); if (n) s.add(n); }
    for (const a of atendentes) { const n = a.nome?.trim(); if (n) s.add(n); }
    return [...s].sort((x, y) => x.localeCompare(y));
  });
  async function toggleVisivel(nome: string) {
    const novo = !visivel(nome);
    configAtend = { ...configAtend, [nome]: novo };
    try { await salvarConfigAtend(nome, novo); } catch (e) { error = msg(e); }
  }

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

  function irPara(a: Aba) { aba = a; error = ''; if ((a === 'desempenho' || a === 'resultados') && !trCarregado) carregarTR(); if (a === 'vinculos') carregarVinculos(); }

  // helpers
  const horaMin = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const inicial = (n: string | null) => (n?.trim()?.[0] ?? '?').toUpperCase();
  const PAL = ['#0d9488', '#2766c9', '#6366f1', '#0891b2', '#1aa179', '#7c3aed', '#2f8fd6', '#db6d28'];
  const cor = (s: string) => PAL[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
  const fmtDur = (s: number | null) => s == null ? '—' : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;
  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const ultimaData = (iso: string) => {
    const d = new Date(iso), hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return horaMin(iso);
    const ont = new Date(hoje); ont.setDate(hoje.getDate() - 1);
    if (d.toDateString() === ont.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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
  function exportarRelatorio() {
    const head = ['Atendente', 'Conversas', 'Mensagens', 'Clientes', 'Encerradas', 'Tempo medio resposta (s)'];
    const linhas = relatorio.map((a) => [a.nome, a.conversas, a.mensagens, a.clientes, a.encerradas, a.tempo_s ?? ''].join(';'));
    const blob = new Blob(['﻿' + [head.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `relatorio-atendentes.csv`; a.click(); URL.revokeObjectURL(a.href);
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
      <button class:on={aba === 'desempenho'} onclick={() => irPara('desempenho')}>
        <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg><span>Desempenho</span>
      </button>
      {#if podeGerencial}
        <button class:on={aba === 'resultados'} onclick={() => irPara('resultados')}>
          <svg viewBox="0 0 24 24"><path d="M6 9H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2" /><path d="M18 9h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2" /><rect x="9" y="3" width="6" height="18" rx="1" /></svg><span>Resultados</span>
        </button>
      {/if}
      {#if podeGerencial}
        <button class:on={aba === 'config'} onclick={() => irPara('config')}>
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg><span>Config</span>
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
            <div class="topo"><input class="busca" placeholder="🔎 Buscar cliente, telefone, código ou cidade…" bind:value={busca} /></div>
            <div class="dica">Cada cliente reúne <strong>todo o histórico do número</strong> num chat só. {clientesFiltrados.length} cliente(s). Atualizado diariamente às 10h.</div>
            <div class="lista">
              {#each clientesFiltrados as c (c.chat_id)}
                <button class="item" class:sel={sel?.chat_id === c.chat_id} onclick={() => abrirCliente(c)}>
                  <span class="av" style="background:{cor(nomeExib(c))}">{inicial(nomeExib(c))}</span>
                  <span class="meio">
                    <span class="l1"><span class="nome">{nomeExib(c)}</span><span class="hora">{c.ultima_msg_at ? ultimaData(c.ultima_msg_at) : ''}</span></span>
                    <span class="l2"><span class="prev">{c.ultima_msg_texto ? exibirTexto(c.ultima_msg_texto) : `${telefonePrincipal(c)}${c.codigo_loja ? ` · loja ${c.codigo_loja}` : ''}`}</span></span>
                  </span>
                </button>
              {:else}<p class="dim pad">Nenhum cliente encontrado.</p>{/each}
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
                  <span class="sub">{telefonePrincipal(sel)}{sel.codigo_loja ? ` · loja ${sel.codigo_loja}` : ''}{sel.cidade ? ` · ${sel.cidade}` : ''}{sel.vendedor ? ` · vend. ${sel.vendedor}` : ''}</span>
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
              <div class="ro">Somente leitura · histórico importado do ZapResponder</div>
            {/if}
          </section>
        </div>

      {:else if aba === 'desempenho'}
        <div class="dash-head">
          <div>
            <h3>{podeGerencial ? 'Desempenho da equipe' : 'Meu desempenho'}</h3>
            {#if periodoDados}<span class="dim sub">Histórico de {ddmm(periodoDados.min)} a {ddmm(periodoDados.max)}</span>{/if}
            <span class="upd">⟳ Atualizado diariamente às 10h</span>
          </div>
          <div class="filtros-met">
            <input type="date" bind:value={mDe} title="De" onchange={carregarTR} />
            <input type="date" bind:value={mAte} title="Até" onchange={carregarTR} />
            {#if podeGerencial}
              <select bind:value={mAtendFiltro}><option value="">Todos atendentes</option>{#each atendentes as a (a.uuid)}<option value={a.uuid}>{a.nome ?? a.uuid}</option>{/each}</select>
              <button onclick={exportarRelatorio} title="Exportar CSV"><svg class="mini" viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4M4 21h16" /></svg> CSV</button>
            {/if}
          </div>
        </div>

        {#if !podeGerencial && !meuAtendUuid}
          <p class="aviso">Seu usuário ainda não está vinculado a um atendente. Peça a um administrador para fazer o vínculo (aba Vínculos).</p>
        {:else}
          <div class="kpis">
            <div class="kpi"><span class="rot">Conversas</span><strong>{resumo.conversas}</strong></div>
            <div class="kpi"><span class="rot">Clientes</span><strong>{resumo.clientes}</strong></div>
            <div class="kpi"><span class="rot">Mensagens</span><strong>{resumo.mensagens}</strong></div>
            <div class="kpi"><span class="rot">Tempo médio resp.</span><strong>{trCarregando ? '…' : fmtDur(tempoMedio)}</strong></div>
            <div class="kpi"><span class="rot">Encerradas</span><strong>{resumo.encerradas}</strong></div>
          </div>

          <div class="grid2">
            <div class="cardp">
              <h4>Conversas por dia</h4>
              {#if serieConversas.length}<Chart type="line" data={chartConversas} options={eixoComum} altura={220} />{:else}<p class="dim pad">Sem dados no período.</p>{/if}
            </div>
            <div class="cardp">
              <h4>Tempo médio de resposta por dia (min)</h4>
              {#if trCarregando}<p class="dim pad">Calculando…</p>{:else if serieTempo.length}<Chart type="line" data={chartTempo} options={eixoComum} altura={220} />{:else}<p class="dim pad">Sem dados no período.</p>{/if}
            </div>
          </div>

          {#if podeGerencial}
            <div class="cardp">
              <div class="cardp-h"><h4>Relatório por atendente</h4><span class="dim">{relatorio.length} atendentes</span></div>
              <div class="tbl-wrap">
                <table class="rel">
                  <thead><tr><th>Atendente</th><th class="num">Conversas</th><th class="num">Mensagens</th><th class="num">Clientes</th><th>Tempo médio de resposta</th></tr></thead>
                  <tbody>
                    {#each relatorio as a (a.nome)}
                      <tr>
                        <td><span class="av sm" style="background:{cor(a.nome)}">{inicial(a.nome)}</span> {a.nome}</td>
                        <td class="num">{a.conversas}</td>
                        <td class="num">{a.mensagens}</td>
                        <td class="num">{a.clientes}</td>
                        <td>
                          <div class="trbar">
                            <div class="trbar-trilho"><div class="trbar-fill" style="width:{((a.tempo_s ?? 0) / maxTempo) * 100}%"></div></div>
                            <span class="trbar-val">{fmtDur(a.tempo_s)}</span>
                          </div>
                        </td>
                      </tr>
                    {:else}
                      <tr><td colspan="5" class="dim">Sem dados no período.</td></tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        {/if}

      {:else if aba === 'resultados'}
        <div class="dash-head">
          <div>
            <h3>Resultados por atendente</h3>
            {#if periodoDados}<span class="dim sub">Período: {ddmm(periodoDados.min)} a {ddmm(periodoDados.max)}</span>{/if}
            <span class="upd">⟳ Atualizado diariamente às 10h</span>
          </div>
          <div class="filtros-met">
            <input type="date" bind:value={mDe} title="De" onchange={carregarTR} />
            <input type="date" bind:value={mAte} title="Até" onchange={carregarTR} />
            <button onclick={exportarRelatorio} title="Exportar CSV"><svg class="mini" viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4M4 21h16" /></svg> CSV</button>
          </div>
        </div>

        {#if trCarregando}<p class="dim pad">Calculando indicadores…</p>{/if}

        <div class="cardp">
          <h4>Conversas por atendente</h4>
          {#if relatorioHumano.length}<Chart type="bar" data={chartBarras} options={barrasOpt} altura={Math.max(180, relatorioHumano.length * 38)} />{:else}<p class="dim">Sem dados no período.</p>{/if}
        </div>

        <div class="ranking">
          {#each relatorioHumano as a, i (a.nome)}
            <div class="rk">
              <div class="rk-top">
                <span class="rk-pos">#{i + 1}</span>
                <span class="av" style="background:{cor(a.nome)}">{inicial(a.nome)}</span>
                <strong class="rk-nome">{a.nome}</strong>
              </div>
              <div class="rk-nums">
                <div class="rk-n"><span class="rk-v">{a.conversas}</span><span class="rk-l">Conversas</span></div>
                <div class="rk-n"><span class="rk-v">{fmtDur(a.tempo_s)}</span><span class="rk-l">Resposta média</span></div>
                <div class="rk-n"><span class="rk-v">{fmtDur(a.duracao_s)}</span><span class="rk-l">Duração média</span></div>
              </div>
            </div>
          {:else}
            <p class="dim">Sem atendentes no período.</p>
          {/each}
        </div>

      {:else if aba === 'config'}
        <h3 class="titulo">Configurações · atendentes nos dashboards</h3>
        <p class="dim" style="margin-top:-0.6rem">Marque quais atendentes aparecem em <strong>Desempenho</strong> e <strong>Resultados</strong>. Desmarque os de teste/sistema (ex.: ADM). Vale para todas as telas de dashboard.</p>
        <div class="cardp">
          <div class="cfg-list">
            {#each nomesParaConfig as nome (nome)}
              <label class="cfg-item" class:off={!visivel(nome)}>
                <input type="checkbox" checked={visivel(nome)} onchange={() => toggleVisivel(nome)} />
                <span class="av sm" style="background:{cor(nome)}">{inicial(nome)}</span>
                <span class="cfg-nome">{nome}</span>
                <span class="cfg-tag">{visivel(nome) ? 'visível' : 'oculto'}</span>
              </label>
            {:else}
              <p class="dim">Nenhum atendente encontrado.</p>
            {/each}
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
  .loading { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; }
  .orb { width: 92px; height: 92px; border-radius: 24px; display: grid; place-items: center; background: var(--navy-grad); box-shadow: 0 14px 36px rgba(16,47,92,0.4); animation: pulse 1.6s ease-in-out infinite; }
  .orb img { width: 58px; height: 58px; object-fit: contain; filter: brightness(0) invert(1); opacity: 0.95; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  .loading strong { font-size: 1.05rem; }
  .loading .et { font-size: 0.82rem; color: var(--text-dim); }
  .bar { width: 240px; height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; box-shadow: inset 0 0 0 1px var(--border); }
  .bar .fill { height: 100%; background: var(--brand-grad); border-radius: 999px; transition: width 0.5s ease; }

  .modulo { display: grid; grid-template-columns: 76px 1fr; gap: 1rem; height: 100%; min-height: 0; }
  .rail { display: flex; flex-direction: column; gap: 0.4rem; }
  .rail button { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.6rem 0.3rem; border-radius: var(--radius-sm); font-size: 0.64rem; color: var(--text-dim); border-color: transparent; background: transparent; }
  .rail button svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .rail button:hover { background: var(--surface); color: var(--text); box-shadow: none; }
  .rail button.on { background: var(--surface); color: var(--accent); box-shadow: var(--shadow-sm); font-weight: 600; }
  .area { min-width: 0; min-height: 0; overflow: auto; }
  .titulo { margin: 0 0 1rem; font-size: 1.05rem; }
  .dim { color: var(--text-dim); }
  .pad { padding: 1rem; } .center { text-align: center; }
  .err { color: var(--danger); }
  .aviso { background: #fff6e6; border: 1px solid #f0d28a; color: #8a5a00; padding: 0.8rem 1rem; border-radius: var(--radius); }

  .wa { display: grid; grid-template-columns: 330px 1fr; height: 100%; min-height: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); background: var(--surface); }
  aside { display: flex; flex-direction: column; border-right: 1px solid var(--border); min-width: 0; min-height: 0; }
  .topo { display: flex; gap: 0.4rem; padding: 0.6rem; border-bottom: 1px solid var(--border); }
  .busca { flex: 1; min-width: 0; }
  .lista { flex: 1; min-height: 0; overflow-y: auto; }
  .item { width: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.7rem; border: none; border-bottom: 1px solid var(--border); border-radius: 0; background: transparent; text-align: left; }
  .item:hover { background: var(--surface-2); box-shadow: none; }
  .item.sel { background: var(--accent-soft); }
  .av { display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; color: #fff; font-weight: 700; }
  .av.sm { width: 26px; height: 26px; font-size: 0.7rem; display: inline-grid; vertical-align: middle; margin-right: 0.35rem; }
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
  .row { display: flex; } .row.in { justify-content: flex-start; } .row.out { justify-content: flex-end; }
  .bubble { max-width: 74%; padding: 0.35rem 0.55rem 0.3rem; border-radius: 8px; font-size: 0.85rem; line-height: 1.3; box-shadow: 0 1px 1px rgba(0,0,0,0.13); display: flex; flex-direction: column; }
  .bubble.cliente { background: #fff; border-top-left-radius: 0; }
  .bubble.atendente { background: #d9fdd3; border-top-right-radius: 0; }
  .bubble.robo { background: #eaf6e0; border-top-right-radius: 0; }
  .autor { font-size: 0.7rem; font-weight: 700; margin-bottom: 0.05rem; }
  .autor.at { color: #1f8f6b; } .autor.bot { color: #6b7890; }
  .txt { white-space: pre-wrap; word-break: break-word; color: #111b21; }
  .bubble .hora { align-self: flex-end; font-size: 0.6rem; color: #667781; margin-top: 0.05rem; }
  .ro { text-align: center; font-size: 0.68rem; color: #5b6b7a; background: var(--surface); padding: 0.35rem; border-top: 1px solid var(--border); }

  /* Desempenho */
  .dash-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .dash-head h3 { margin: 0; font-size: 1.1rem; }
  .dash-head .sub { font-size: 0.76rem; }
  .filtros-met { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
  .filtros-met input, .filtros-met select { font-size: 0.8rem; }
  .filtros-met button { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
  .mini { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.8rem; margin-bottom: 1rem; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .kpi .rot { font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi strong { font-size: 1.5rem; background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
  .cardp { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); padding: 1rem 1.1rem; margin-bottom: 1rem; }
  .cardp h4 { margin: 0 0 0.8rem; font-size: 0.9rem; }
  .cardp-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .cardp-h h4 { margin: 0; }
  .tbl-wrap { overflow-x: auto; }
  table.rel th, table.rel td { padding: 0.55rem 0.7rem; }
  table.rel td { font-size: 0.86rem; }
  table.rel .num { text-align: right; font-variant-numeric: tabular-nums; }
  .trbar { display: flex; align-items: center; gap: 0.5rem; min-width: 160px; }
  .trbar-trilho { flex: 1; background: var(--surface-2); border-radius: var(--radius-pill); height: 8px; overflow: hidden; }
  .trbar-fill { height: 100%; background: linear-gradient(90deg, #0d9488, #34bcd6); border-radius: var(--radius-pill); }
  .trbar-val { font-size: 0.8rem; font-weight: 600; color: var(--text-dim); white-space: nowrap; }
  .dica { padding: 0.5rem 0.7rem; font-size: 0.74rem; color: var(--text-dim); background: var(--surface-2); border-bottom: 1px solid var(--border); line-height: 1.35; }
  .dica strong { color: var(--accent); }
  .upd { display: block; font-size: 0.72rem; color: var(--ok); margin-top: 0.15rem; font-weight: 600; }
  .cfg-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.4rem; }
  .cfg-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
  .cfg-item:hover { background: var(--surface-2); }
  .cfg-item.off { opacity: 0.55; }
  .cfg-nome { flex: 1; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cfg-tag { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim); }

  .ranking { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.8rem; }
  .rk { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); padding: 0.9rem 1rem; }
  .rk-top { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.7rem; }
  .rk-pos { font-size: 0.82rem; font-weight: 800; color: var(--text-dim); min-width: 26px; }
  .rk-top .av { width: 34px; height: 34px; font-size: 0.8rem; }
  .rk-nome { font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rk-nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
  .rk-n { display: flex; flex-direction: column; gap: 0.15rem; text-align: center; background: var(--surface-2); border-radius: var(--radius-sm); padding: 0.5rem 0.3rem; }
  .rk-v { font-size: 1.02rem; font-weight: 700; color: var(--accent); }
  .rk-l { font-size: 0.6rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.03em; }

  @media (max-width: 900px) { .grid2 { grid-template-columns: 1fr; } }
</style>
