<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { currentProfile, hasLevel } from '$core/auth.svelte';
  import Icon from '$core/ui/Icon.svelte';
  import { uploadAnexo, urlsAnexos, fmtTam } from '$core/storage';
  import { prazoUtil, statusPrazo, SLA_PADRAO_LIVRE } from './sla';
  import {
    listUsuarios, listTickets, criarTicket, atualizarTicket, excluirTicket,
    listComentarios, addComentario,
    listTopicos, criarTopico, editarTopico, excluirTopico, assuntosFrequentes,
    type Ticket, type TicketComentario, type Usuario, type Prioridade, type StatusTicket, type Topico
  } from './api';

  const me = currentProfile();
  const ehGestor = hasLevel('gestor');

  let tickets = $state<Ticket[]>([]);
  let usuarios = $state<Usuario[]>([]);
  let topicos = $state<Topico[]>([]);
  let sel = $state<Ticket | null>(null);
  let comentarios = $state<TicketComentario[]>([]);
  let urlMap = $state<Record<string, string>>({});
  let carregando = $state(true);
  let error = $state('');

  let escopo = $state<'todos' | 'meus' | 'atribuidos'>('todos');
  let fStatus = $state<'all' | StatusTicket>('all');
  let busca = $state('');

  const STATUS: { v: StatusTicket; l: string }[] = [
    { v: 'aberto', l: 'Aberto' }, { v: 'andamento', l: 'Em andamento' },
    { v: 'resolvido', l: 'Resolvido' }, { v: 'fechado', l: 'Fechado' }
  ];
  const PRIOS: { v: Prioridade; l: string }[] = [
    { v: 'baixa', l: 'Baixa' }, { v: 'media', l: 'Média' }, { v: 'alta', l: 'Alta' }, { v: 'urgente', l: 'Urgente' }
  ];
  const stLabel = (s: string) => STATUS.find((x) => x.v === s)?.l ?? s;
  const prLabel = (p: string) => PRIOS.find((x) => x.v === p)?.l ?? p;

  const q = $derived(busca.trim().toLowerCase());
  const filtrados = $derived(tickets.filter((t) =>
    (escopo === 'todos' || (escopo === 'meus' && t.solicitante_id === me?.id) || (escopo === 'atribuidos' && t.responsavel_id === me?.id))
    && (fStatus === 'all' || t.status === fStatus)
    && (!q || t.titulo.toLowerCase().includes(q))
  ));
  const podeEditar = (t: Ticket) => t.solicitante_id === me?.id || t.responsavel_id === me?.id || ehGestor;
  const topicosAtivos = $derived(topicos.filter((t) => t.ativo));

  const inicial = (n: string | null) => (n?.trim()?.[0] ?? '?').toUpperCase();
  const PAL = ['#0d9488', '#2766c9', '#6366f1', '#0891b2', '#1aa179', '#7c3aed', '#2f8fd6', '#db6d28'];
  const cor = (s: string | null) => PAL[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
  const dt = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const ehImagem = (m: string | null) => !!m?.startsWith('image/');

  async function resolverUrls(paths: (string | null)[]) {
    const ps = paths.filter((p): p is string => !!p);
    if (!ps.length) return;
    try { urlMap = { ...urlMap, ...(await urlsAnexos(ps)) }; } catch { /* ignora */ }
  }

  async function carregar() {
    carregando = true; error = '';
    try {
      [tickets, usuarios, topicos] = await Promise.all([
        listTickets(),
        usuarios.length ? Promise.resolve(usuarios) : listUsuarios(),
        listTopicos()
      ]);
      await resolverUrls(tickets.map((t) => t.anexo_path));
    } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { carregando = false; }
  }

  async function abrir(t: Ticket) {
    sel = t; comentarios = [];
    try {
      comentarios = await listComentarios(t.id);
      await resolverUrls([t.anexo_path, ...comentarios.map((c) => c.anexo_path)]);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }

  onMount(carregar);

  async function mudar(patch: Partial<Ticket>) {
    if (!sel) return;
    try {
      const upd = await atualizarTicket(sel.id, patch);
      sel = upd; tickets = tickets.map((t) => (t.id === upd.id ? upd : t));
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  function mudarResponsavel(id: string) {
    const u = usuarios.find((x) => x.id === id);
    mudar({ responsavel_id: id || null, responsavel_nome: u?.nome ?? null });
  }
  async function remover() {
    if (!sel || !confirm(`Excluir o ticket "${sel.titulo}"?`)) return;
    try { const id = sel.id; await excluirTicket(id); sel = null; tickets = tickets.filter((t) => t.id !== id); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
  }

  // ---- Comentário ----
  let coment = $state('');
  let comentArquivo = $state<File | null>(null);
  let comentInput = $state<HTMLInputElement | null>(null);
  let enviandoComent = $state(false);
  let thread = $state<HTMLElement | null>(null);

  async function enviarComentario(e: Event) {
    e.preventDefault();
    const t = coment.trim();
    if ((!t && !comentArquivo) || !sel || !me) return;
    enviandoComent = true; error = '';
    try {
      const anexo = comentArquivo ? await uploadAnexo(comentArquivo, `tickets/${sel.id}`) : undefined;
      const c = await addComentario(sel.id, { id: me.id, nome: me.nome }, t, anexo);
      comentarios = [...comentarios, c];
      if (c.anexo_path) await resolverUrls([c.anexo_path]);
      coment = ''; comentArquivo = null;
      await tick(); if (thread) thread.scrollTop = thread.scrollHeight;
    } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { enviandoComent = false; }
  }
  function escolherComentArquivo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) comentArquivo = f;
    if (comentInput) comentInput.value = '';
  }

  // ---- Novo ticket ----
  let modalNovo = $state(false);
  let nTitulo = $state('');
  let nDescricao = $state('');
  let nTopicoId = $state('');
  let nResponsavel = $state('');
  let nArquivo = $state<File | null>(null);
  let nInput = $state<HTMLInputElement | null>(null);
  let salvando = $state(false);
  let modalErr = $state('');

  const topSel = $derived(topicos.find((t) => t.id === nTopicoId));
  const slaAplicado = $derived(topSel ? topSel.sla_horas : SLA_PADRAO_LIVRE);
  const prioAplicada = $derived<Prioridade>(topSel ? topSel.prioridade : 'media');
  const prazoPrevisto = $derived(prazoUtil(new Date(), slaAplicado));

  function abrirNovo() { modalNovo = true; modalErr = ''; nTitulo = ''; nDescricao = ''; nTopicoId = ''; nResponsavel = ''; nArquivo = null; }
  async function salvarNovo() {
    const titulo = nTitulo.trim();
    if (!titulo || !me) { modalErr = 'Informe um título.'; return; }
    salvando = true; modalErr = '';
    try {
      const u = usuarios.find((x) => x.id === nResponsavel);
      const anexo = nArquivo ? await uploadAnexo(nArquivo, 'tickets/novo') : undefined;
      const t = await criarTicket({
        titulo, descricao: nDescricao.trim(),
        topico_id: topSel?.id ?? null, topico_nome: topSel?.nome ?? null,
        prioridade: prioAplicada, sla_horas: slaAplicado, prazo: prazoPrevisto.toISOString(),
        responsavel_id: nResponsavel || null, responsavel_nome: u?.nome ?? null
      }, { id: me.id, nome: me.nome }, anexo);
      tickets = [t, ...tickets];
      if (t.anexo_path) await resolverUrls([t.anexo_path]);
      modalNovo = false; abrir(t);
    } catch (e) { modalErr = e instanceof Error ? e.message : String(e); } finally { salvando = false; }
  }

  // ---- Gestão de tópicos (gestor+) ----
  let modalTopicos = $state(false);
  let sugestoes = $state<{ titulo: string; n: number }[]>([]);
  let tEdit = $state<string | null>(null); // id em edição, ou null = novo
  let tNome = $state(''); let tDesc = $state(''); let tSla = $state(24); let tPrio = $state<Prioridade>('media');
  let salvandoTopico = $state(false); let topicoErr = $state('');

  async function abrirTopicos() {
    modalTopicos = true; topicoErr = ''; limparFormTopico();
    try { sugestoes = await assuntosFrequentes(2); } catch { sugestoes = []; }
  }
  function limparFormTopico() { tEdit = null; tNome = ''; tDesc = ''; tSla = 24; tPrio = 'media'; }
  function editarFormTopico(t: Topico) { tEdit = t.id; tNome = t.nome; tDesc = t.descricao ?? ''; tSla = t.sla_horas; tPrio = t.prioridade; }
  function usarSugestao(s: { titulo: string }) { limparFormTopico(); tNome = s.titulo; }

  async function salvarTopico() {
    const nome = tNome.trim();
    if (!nome) { topicoErr = 'Informe o nome do tópico.'; return; }
    salvandoTopico = true; topicoErr = '';
    try {
      if (tEdit) await editarTopico(tEdit, { nome, descricao: tDesc.trim() || null, sla_horas: tSla, prioridade: tPrio });
      else await criarTopico({ nome, descricao: tDesc.trim(), sla_horas: tSla, prioridade: tPrio });
      topicos = await listTopicos();
      limparFormTopico();
    } catch (e) { topicoErr = e instanceof Error ? e.message : String(e); } finally { salvandoTopico = false; }
  }
  async function alternarAtivo(t: Topico) {
    try { await editarTopico(t.id, { ativo: !t.ativo }); topicos = await listTopicos(); }
    catch (e) { topicoErr = e instanceof Error ? e.message : String(e); }
  }
  async function removerTopico(t: Topico) {
    if (!confirm(`Excluir o tópico "${t.nome}"? Tickets já criados não são afetados.`)) return;
    try { await excluirTopico(t.id); topicos = await listTopicos(); if (tEdit === t.id) limparFormTopico(); }
    catch (e) { topicoErr = e instanceof Error ? e.message : String(e); }
  }
</script>

<div class="tk">
  <!-- ===================== Lista ===================== -->
  <aside>
    <div class="topo">
      <button class="primary novo" onclick={abrirNovo}><Icon name="plus" size={17} /> Novo ticket</button>
      {#if ehGestor}<button class="icbtn" title="Gerenciar tópicos / SLA" onclick={abrirTopicos}><Icon name="settings" size={18} /></button>{/if}
    </div>
    <div class="filtros">
      <div class="search"><Icon name="search" size={15} /><input placeholder="Buscar título…" bind:value={busca} /></div>
      <div class="segs">
        <button class:on={escopo === 'todos'} onclick={() => (escopo = 'todos')}>Todos</button>
        <button class:on={escopo === 'meus'} onclick={() => (escopo = 'meus')}>Abertos por mim</button>
        <button class:on={escopo === 'atribuidos'} onclick={() => (escopo = 'atribuidos')}>Atribuídos a mim</button>
      </div>
      <select bind:value={fStatus} class="fstatus">
        <option value="all">Todos os status</option>
        {#each STATUS as s (s.v)}<option value={s.v}>{s.l}</option>{/each}
      </select>
    </div>

    <div class="lista">
      {#if carregando}
        <p class="dim pad">Carregando…</p>
      {:else}
        {#each filtrados as t (t.id)}
          {@const sp = statusPrazo(t.prazo, t.status)}
          <button class="card" class:on={sel?.id === t.id} onclick={() => abrir(t)}>
            <div class="card-top">
              <span class="pr pr-{t.prioridade}">{prLabel(t.prioridade)}</span>
              <span class="st st-{t.status}">{stLabel(t.status)}</span>
              {#if sp.label}<span class="prazo pz-{sp.tom}">{sp.label}</span>{/if}
            </div>
            <span class="ctitulo">{t.titulo}</span>
            <div class="card-meta">
              <span>{t.responsavel_nome ? `→ ${t.responsavel_nome}` : 'sem responsável'}</span>
              <span>{t.topico_nome ?? 'Assunto livre'}</span>
            </div>
          </button>
        {:else}
          <p class="dim pad">Nenhum ticket {escopo !== 'todos' || fStatus !== 'all' || q ? 'com esses filtros' : 'ainda'}.</p>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- ===================== Detalhe ===================== -->
  <section class="detalhe">
    {#if error}<p class="err">{error}</p>{/if}
    {#if !sel}
      <div class="vazio"><Icon name="message-circle" size={40} /><p>Selecione um ticket ou crie um novo.</p></div>
    {:else}
      {@const sp = statusPrazo(sel.prazo, sel.status)}
      <header class="det-head">
        <div class="dh-main">
          <div class="badges">
            <span class="pr pr-{sel.prioridade}">{prLabel(sel.prioridade)}</span>
            <span class="st st-{sel.status}">{stLabel(sel.status)}</span>
            {#if sp.label}<span class="prazo pz-{sp.tom}">{sp.label}</span>{/if}
          </div>
          <h2>{sel.titulo}</h2>
          <p class="dh-sub">
            {sel.topico_nome ?? 'Assunto livre'} · aberto por <strong>{sel.solicitante_nome ?? '—'}</strong> · {dt(sel.created_at)}
            {#if sel.prazo} · prazo {dt(sel.prazo)}{/if}
          </p>
        </div>
        {#if podeEditar(sel)}
          <button class="danger" onclick={remover} title="Excluir"><Icon name="x" size={16} /></button>
        {/if}
      </header>

      <div class="corpo">
        <div class="controles">
          <label class="ct"><span>Status</span>
            <select value={sel.status} disabled={!podeEditar(sel)} onchange={(e) => mudar({ status: e.currentTarget.value as StatusTicket })}>
              {#each STATUS as s (s.v)}<option value={s.v}>{s.l}</option>{/each}
            </select>
          </label>
          <label class="ct"><span>Responsável</span>
            <select value={sel.responsavel_id ?? ''} disabled={!podeEditar(sel)} onchange={(e) => mudarResponsavel(e.currentTarget.value)}>
              <option value="">— ninguém —</option>
              {#each usuarios as u (u.id)}<option value={u.id}>{u.nome}</option>{/each}
            </select>
          </label>
        </div>

        {#if sel.descricao}<div class="descr">{sel.descricao}</div>{/if}
        {#if sel.anexo_path}
          {@const url = urlMap[sel.anexo_path]}
          {#if ehImagem(sel.anexo_mime) && url}
            <a href={url} target="_blank" rel="noreferrer"><img class="anexo-img" src={url} alt={sel.anexo_nome ?? ''} /></a>
          {:else}
            <a class="anexo-file" href={url ?? '#'} target="_blank" rel="noreferrer" download={sel.anexo_nome}>
              <span class="af-ic"><Icon name="paperclip" size={16} /></span>
              <span class="af-info"><span class="af-nome">{sel.anexo_nome}</span><span class="af-tam">{fmtTam(sel.anexo_tam)}</span></span>
            </a>
          {/if}
        {/if}

        <div class="and-titulo">Andamento</div>
        <div class="thread" bind:this={thread}>
          {#each comentarios as c (c.id)}
            <div class="cmt">
              <span class="av" style="background:{cor(c.autor_nome)}">{inicial(c.autor_nome)}</span>
              <div class="cmt-b">
                <div class="cmt-h"><strong>{c.autor_nome ?? 'Alguém'}</strong><span>{dt(c.created_at)}</span></div>
                {#if c.texto}<p class="cmt-txt">{c.texto}</p>{/if}
                {#if c.anexo_path}
                  {@const url = urlMap[c.anexo_path]}
                  {#if ehImagem(c.anexo_mime) && url}
                    <a href={url} target="_blank" rel="noreferrer"><img class="anexo-img sm" src={url} alt={c.anexo_nome ?? ''} /></a>
                  {:else}
                    <a class="anexo-file" href={url ?? '#'} target="_blank" rel="noreferrer" download={c.anexo_nome}>
                      <span class="af-ic"><Icon name="paperclip" size={15} /></span>
                      <span class="af-info"><span class="af-nome">{c.anexo_nome}</span><span class="af-tam">{fmtTam(c.anexo_tam)}</span></span>
                    </a>
                  {/if}
                {/if}
              </div>
            </div>
          {:else}
            <p class="dim">Sem andamento ainda. Adicione um comentário abaixo.</p>
          {/each}
        </div>

        <form class="comp" onsubmit={enviarComentario}>
          {#if comentArquivo}<div class="chip"><Icon name="paperclip" size={13} /> {comentArquivo.name} <button type="button" class="lnk" onclick={() => (comentArquivo = null)}><Icon name="x" size={13} /></button></div>{/if}
          <div class="comp-row">
            <button type="button" class="icbtn" title="Anexar" onclick={() => comentInput?.click()}><Icon name="paperclip" size={18} /></button>
            <input class="file-hidden" type="file" bind:this={comentInput} onchange={escolherComentArquivo} />
            <input placeholder="Escreva um comentário…" bind:value={coment} disabled={enviandoComent} />
            <button class="primary" type="submit" disabled={enviandoComent || (!coment.trim() && !comentArquivo)}>Comentar</button>
          </div>
        </form>
      </div>
    {/if}
  </section>
</div>

<!-- ===================== Modal: Novo ticket ===================== -->
{#if modalNovo}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" role="presentation" onclick={() => (modalNovo = false)} onkeydown={(e) => { if (e.key === 'Escape') modalNovo = false; }}>
    <div class="dlg" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <header class="dlg-h"><strong>Novo ticket</strong><button class="icbtn" onclick={() => (modalNovo = false)}><Icon name="x" size={18} /></button></header>
      <div class="dlg-body">
        <label class="fld"><span>Tópico</span>
          <select bind:value={nTopicoId}>
            <option value="">— Outro assunto (livre) —</option>
            {#each topicosAtivos as t (t.id)}<option value={t.id}>{t.nome} · SLA {t.sla_horas}h</option>{/each}
          </select>
        </label>
        <div class="sla-info">
          <Icon name="check-check" size={15} />
          <span>
            {topSel ? `Tópico: SLA ${slaAplicado}h úteis · prioridade ${prLabel(prioAplicada)}` : `Assunto livre · SLA padrão ${SLA_PADRAO_LIVRE}h úteis`}
            — prazo previsto <strong>{dt(prazoPrevisto.toISOString())}</strong>
          </span>
        </div>
        <label class="fld"><span>Título</span><input bind:value={nTitulo} placeholder="Ex.: Impressora do balcão sem tinta" /></label>
        <label class="fld"><span>Descrição</span><textarea rows="4" bind:value={nDescricao} placeholder="Detalhe o problema/solicitação…"></textarea></label>
        <label class="fld"><span>Responsável</span>
          <select bind:value={nResponsavel}>
            <option value="">— escolher —</option>
            {#each usuarios as u (u.id)}<option value={u.id}>{u.nome}</option>{/each}
          </select>
        </label>
        <div class="fld"><span>Anexo (opcional)</span>
          <div class="anexo-row">
            <button type="button" onclick={() => nInput?.click()}><Icon name="paperclip" size={15} /> Escolher arquivo</button>
            <input class="file-hidden" type="file" bind:this={nInput} onchange={(e) => (nArquivo = (e.target as HTMLInputElement).files?.[0] ?? null)} />
            {#if nArquivo}<span class="dim">{nArquivo.name} ({fmtTam(nArquivo.size)})</span>{/if}
          </div>
        </div>
        {#if modalErr}<p class="err">{modalErr}</p>{/if}
        <div class="dlg-actions">
          <button onclick={() => (modalNovo = false)}>Cancelar</button>
          <button class="primary" onclick={salvarNovo} disabled={salvando || !nTitulo.trim()}>Abrir ticket</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ===================== Modal: Tópicos (gestor+) ===================== -->
{#if modalTopicos}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" role="presentation" onclick={() => (modalTopicos = false)} onkeydown={(e) => { if (e.key === 'Escape') modalTopicos = false; }}>
    <div class="dlg lg" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <header class="dlg-h"><strong>Tópicos de chamado &amp; SLA</strong><button class="icbtn" onclick={() => (modalTopicos = false)}><Icon name="x" size={18} /></button></header>
      <div class="dlg-body two">
        <div class="col-list">
          {#each topicos as t (t.id)}
            <div class="trow" class:off={!t.ativo}>
              <button class="trow-main" onclick={() => editarFormTopico(t)}>
                <span class="pr pr-{t.prioridade}">{prLabel(t.prioridade)}</span>
                <span class="tnome">{t.nome}</span><span class="tsla">{t.sla_horas}h</span>
              </button>
              <button class="lnk" title={t.ativo ? 'Desativar' : 'Ativar'} onclick={() => alternarAtivo(t)}>{t.ativo ? '◉' : '○'}</button>
              <button class="lnk" title="Excluir" onclick={() => removerTopico(t)}><Icon name="x" size={14} /></button>
            </div>
          {:else}<p class="vazio-list">Nenhum tópico ainda. Crie ao lado →</p>{/each}

          {#if sugestoes.length}
            <div class="sug-titulo">Assuntos frequentes (sugestões)</div>
            {#each sugestoes as s (s.titulo)}
              <button class="sug" onclick={() => usarSugestao(s)}>
                <span class="sug-nome">{s.titulo}</span><span class="sug-n">{s.n}×</span>
              </button>
            {/each}
          {/if}
        </div>
        <div class="col-detail">
          <strong class="form-titulo">{tEdit ? 'Editar tópico' : 'Novo tópico'}</strong>
          <label class="fld"><span>Nome</span><input bind:value={tNome} placeholder="Ex.: Impressora com problema" /></label>
          <label class="fld"><span>Descrição (opcional)</span><input bind:value={tDesc} /></label>
          <div class="grid2">
            <label class="fld"><span>SLA (horas úteis)</span><input type="number" min="1" bind:value={tSla} /></label>
            <label class="fld"><span>Prioridade</span>
              <select bind:value={tPrio}>{#each PRIOS as p (p.v)}<option value={p.v}>{p.l}</option>{/each}</select>
            </label>
          </div>
          {#if topicoErr}<p class="err">{topicoErr}</p>{/if}
          <div class="dlg-actions">
            {#if tEdit}<button onclick={limparFormTopico}>Cancelar edição</button>{/if}
            <button class="primary" onclick={salvarTopico} disabled={salvandoTopico || !tNome.trim()}>{tEdit ? 'Salvar' : 'Criar tópico'}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tk { display: grid; grid-template-columns: 340px 1fr; height: 100%; min-height: 520px; gap: 0.9rem; }

  /* Lista */
  aside { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); }
  .topo { padding: 0.7rem; border-bottom: 1px solid var(--border); display: flex; gap: 0.5rem; }
  .novo { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
  .filtros { padding: 0.6rem 0.7rem; display: flex; flex-direction: column; gap: 0.5rem; border-bottom: 1px solid var(--border); }
  .search { display: flex; align-items: center; gap: 0.45rem; color: var(--text-dim); background: var(--surface-2); border-radius: var(--radius-sm); padding: 0 0.6rem; }
  .search input { flex: 1; border: none; background: transparent; padding: 0.45rem 0; }
  .search input:focus { box-shadow: none; }
  .segs { display: flex; gap: 0.25rem; }
  .segs button { flex: 1; padding: 0.35rem 0.1rem; font-size: 0.7rem; border-radius: var(--radius-sm); }
  .segs button.on { background: var(--accent-soft); border-color: transparent; color: var(--accent); font-weight: 600; }
  .fstatus { width: 100%; }

  .lista { flex: 1; overflow-y: auto; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.45rem; }
  .card { display: flex; flex-direction: column; gap: 0.35rem; text-align: left; padding: 0.6rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
  .card:hover { border-color: var(--border-strong); background: var(--surface-2); }
  .card.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .card-top { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .ctitulo { font-size: 0.9rem; font-weight: 600; line-height: 1.25; }
  .card-meta { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.72rem; color: var(--text-dim); }
  .card-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pad { padding: 1rem; } .dim { color: var(--text-dim); }

  /* Badges */
  .pr, .st, .prazo { font-size: 0.64rem; font-weight: 700; padding: 0.12rem 0.5rem; border-radius: var(--radius-pill); text-transform: uppercase; letter-spacing: 0.03em; }
  .pr-baixa { background: #eef2f7; color: #64748b; } .pr-media { background: var(--accent-soft); color: var(--accent); }
  .pr-alta { background: #fff1e6; color: #ea580c; } .pr-urgente { background: #fde8e8; color: #dc2626; }
  .st-aberto { background: #e7efff; color: #2056b8; } .st-andamento { background: #fef3c7; color: #92580e; }
  .st-resolvido { background: #dcfce7; color: #166534; } .st-fechado { background: #e9edf3; color: #5b6677; }
  .pz-ok { background: #eef2f7; color: #64748b; } .pz-warn { background: #fff1e6; color: #ea580c; }
  .pz-late { background: #fde8e8; color: #dc2626; } .pz-done { background: #dcfce7; color: #166534; }

  /* Detalhe */
  .detalhe { min-width: 0; min-height: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; overflow: hidden; }
  .err { color: var(--danger); padding: 0.6rem 1rem; }
  .vazio { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; color: var(--text-dim); }
  .det-head { display: flex; gap: 0.8rem; padding: 1rem 1.2rem; border-bottom: 1px solid var(--border); }
  .dh-main { flex: 1; min-width: 0; }
  .badges { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.4rem; }
  .det-head h2 { margin: 0; font-size: 1.1rem; }
  .dh-sub { margin: 0.3rem 0 0; font-size: 0.78rem; color: var(--text-dim); }

  .corpo { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .controles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .ct { display: flex; flex-direction: column; gap: 0.25rem; }
  .ct > span { font-size: 0.7rem; font-weight: 600; color: var(--text-dim); }
  .descr { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.7rem 0.8rem; font-size: 0.88rem; white-space: pre-wrap; line-height: 1.4; }
  .and-titulo { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); border-top: 1px solid var(--border); padding-top: 0.8rem; }

  .thread { display: flex; flex-direction: column; gap: 0.7rem; }
  .cmt { display: flex; gap: 0.6rem; }
  .av { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; color: #fff; font-weight: 700; font-size: 0.78rem; }
  .cmt-b { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.5rem 0.7rem; }
  .cmt-h { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 0.15rem; }
  .cmt-h strong { color: var(--text); font-size: 0.82rem; }
  .cmt-txt { margin: 0; font-size: 0.87rem; white-space: pre-wrap; word-break: break-word; line-height: 1.35; }

  .anexo-img { max-width: 280px; max-height: 240px; border-radius: 8px; display: block; margin-top: 0.3rem; }
  .anexo-img.sm { max-width: 200px; max-height: 180px; }
  .anexo-file { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.6rem; margin-top: 0.3rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--text); }
  .anexo-file:hover { border-color: var(--accent); }
  .af-ic { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: #fff; flex-shrink: 0; }
  .af-info { display: flex; flex-direction: column; min-width: 0; }
  .af-nome { font-size: 0.8rem; font-weight: 500; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .af-tam { font-size: 0.68rem; color: var(--text-dim); }

  .comp { border-top: 1px solid var(--border); padding-top: 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .comp-row { display: flex; align-items: center; gap: 0.4rem; }
  .comp-row input:not(.file-hidden) { flex: 1; }
  .icbtn { display: grid; place-items: center; border: none; background: transparent; color: var(--text-dim); padding: 0.4rem; border-radius: 50%; }
  .icbtn:hover { background: var(--surface-2); color: var(--accent); }
  .chip { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--text-dim); }
  .lnk { border: none; background: transparent; padding: 0.15rem 0.3rem; color: var(--text-dim); display: grid; place-items: center; }
  .lnk:hover { color: var(--accent); }
  .file-hidden { display: none; }

  /* SLA info no novo ticket */
  .sla-info { display: flex; align-items: center; gap: 0.5rem; background: var(--accent-soft); color: var(--accent); border-radius: var(--radius-sm); padding: 0.5rem 0.7rem; font-size: 0.78rem; }
  .sla-info strong { color: var(--text); }

  /* Modal */
  .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: grid; place-items: center; z-index: 50; padding: 1rem; }
  .dlg { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); width: min(540px, 96vw); max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
  .dlg.lg { width: min(760px, 96vw); }
  .dlg-h { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1rem; border-bottom: 1px solid var(--border); }
  .dlg-body { padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.8rem; }
  .dlg-body.two { display: grid; grid-template-columns: 300px 1fr; gap: 0; padding: 0; }
  .col-list { border-right: 1px solid var(--border); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.25rem; overflow-y: auto; max-height: 70vh; }
  .trow { display: flex; align-items: center; gap: 0.2rem; }
  .trow.off { opacity: 0.5; }
  .trow-main { flex: 1; display: flex; align-items: center; gap: 0.45rem; border: none; background: transparent; text-align: left; padding: 0.4rem 0.5rem; border-radius: var(--radius-sm); }
  .trow-main:hover { background: var(--surface-2); }
  .tnome { flex: 1; font-size: 0.84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tsla { font-size: 0.72rem; color: var(--text-dim); font-weight: 600; }
  .sug-titulo, .form-titulo { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-dim); }
  .sug-titulo { margin-top: 0.7rem; padding: 0.3rem 0.5rem; border-top: 1px dashed var(--border); }
  .sug { display: flex; align-items: center; gap: 0.5rem; border: 1px dashed var(--border-strong); background: var(--surface-2); border-radius: var(--radius-sm); padding: 0.35rem 0.5rem; text-align: left; }
  .sug:hover { border-color: var(--accent); }
  .sug-nome { flex: 1; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sug-n { font-size: 0.72rem; font-weight: 700; color: var(--accent); }
  .col-detail { padding: 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .vazio-list { font-size: 0.78rem; color: var(--text-dim); padding: 0.5rem; }
  .fld { display: flex; flex-direction: column; gap: 0.3rem; }
  .fld > span { font-size: 0.72rem; font-weight: 600; color: var(--text-dim); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .anexo-row { display: flex; align-items: center; gap: 0.6rem; }
  .anexo-row button { display: inline-flex; align-items: center; gap: 0.4rem; }
  .dlg-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
