<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { supabase } from '$core/supabase';
  import { currentProfile, hasLevel } from '$core/auth.svelte';
  import Icon from '$core/ui/Icon.svelte';
  import EmojiPicker from '$core/ui/EmojiPicker.svelte';
  import {
    statusDe, getMeuStatus, setMeuStatus, labelStatus, corStatus, STATUS_OPCOES,
    type StatusManual
  } from '$core/presence.svelte';
  import {
    listUsuarios, listSetores, meusCanais,
    criarSetor, editarSetor, excluirSetor, membrosSetor, setMembrosSetor,
    criarGrupo, listMensagens, enviarMensagem, uploadAnexo, urlsAnexos,
    type Usuario, type Setor, type Canal, type CanalMsg, type AnexoMeta
  } from './api';

  interface AnexoRow { anexo_path?: string | null; anexo_nome?: string | null; anexo_mime?: string | null; anexo_tam?: number | null; }
  interface MsgGeral extends AnexoRow { id: number; user_id: string | null; autor_nome: string | null; texto: string; created_at: string; }
  interface MsgDM extends AnexoRow { id: number; de_id: string; para_id: string; de_nome: string | null; texto: string; created_at: string; }
  type Msg = { id: number; mine: boolean; autor: string | null; texto: string; ts: string;
    anexoPath: string | null; anexoNome: string | null; anexoMime: string | null; anexoTam: number | null };
  type View = { tipo: 'geral' } | { tipo: 'canal'; canal: Canal } | { tipo: 'dm'; user: Usuario };

  const GERAL_COLS = 'id,user_id,autor_nome,texto,created_at,anexo_path,anexo_nome,anexo_mime,anexo_tam';
  const DM_COLS = 'id,de_id,para_id,de_nome,texto,created_at,anexo_path,anexo_nome,anexo_mime,anexo_tam';

  const me = currentProfile();
  const podeGerir = hasLevel('gestor');

  let usuarios = $state<Usuario[]>([]);
  let setores = $state<Setor[]>([]);
  let canais = $state<Canal[]>([]);
  let view = $state<View>({ tipo: 'geral' });
  let msgs = $state<Msg[]>([]);
  let urlMap = $state<Record<string, string>>({});
  let texto = $state('');
  let busca = $state('');
  let arquivo = $state<File | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let emojiAberto = $state(false);
  let enviando = $state(false);
  let carregando = $state(false);
  let error = $state('');
  let el = $state<HTMLElement | null>(null);
  let statusMenu = $state(false);

  let canalGeral: RealtimeChannel | null = null;
  let canalDM: RealtimeChannel | null = null;
  let canalCanais: RealtimeChannel | null = null;

  const q = $derived(busca.trim().toLowerCase());
  const canaisSetor = $derived(canais.filter((c) => c.tipo === 'setor' && c.nome.toLowerCase().includes(q)));
  const grupos = $derived(canais.filter((c) => c.tipo === 'grupo' && c.nome.toLowerCase().includes(q)));
  const dms = $derived(usuarios.filter((u) => u.nome.toLowerCase().includes(q)));

  function toMsg(o: { id: number; mine: boolean; autor: string | null; texto: string; ts: string } & AnexoRow): Msg {
    return { id: o.id, mine: o.mine, autor: o.autor, texto: o.texto, ts: o.ts,
      anexoPath: o.anexo_path ?? null, anexoNome: o.anexo_nome ?? null, anexoMime: o.anexo_mime ?? null, anexoTam: o.anexo_tam ?? null };
  }
  async function resolverUrls(arr: Msg[]) {
    const paths = arr.map((m) => m.anexoPath).filter((p): p is string => !!p);
    if (!paths.length) return;
    try { urlMap = { ...urlMap, ...(await urlsAnexos(paths)) }; } catch { /* ignora */ }
  }
  async function addUrl(m: Msg) {
    if (!m.anexoPath || urlMap[m.anexoPath]) return;
    try { urlMap = { ...urlMap, ...(await urlsAnexos([m.anexoPath])) }; } catch { /* ignora */ }
  }

  async function scroll() { await tick(); if (el) el.scrollTop = el.scrollHeight; }
  function push(m: Msg) { if (!msgs.some((x) => x.id === m.id)) { msgs = [...msgs, m]; void addUrl(m); scroll(); } }

  async function carregar() {
    carregando = true; error = ''; msgs = [];
    try {
      if (view.tipo === 'geral') {
        const { data, error: e } = await supabase.from('uplab_chat_interno').select(GERAL_COLS)
          .order('created_at', { ascending: true }).limit(200);
        if (e) throw e;
        msgs = (data ?? []).map((m: MsgGeral) => toMsg({ ...m, mine: m.user_id === me?.id, autor: m.autor_nome, ts: m.created_at }));
      } else if (view.tipo === 'canal') {
        const data = await listMensagens(view.canal.id);
        msgs = data.map((m: CanalMsg) => toMsg({ ...m, mine: m.user_id === me?.id, autor: m.autor_nome, ts: m.created_at }));
      } else {
        const outro = view.user.id;
        const { data, error: e } = await supabase.from('uplab_chat_dm').select(DM_COLS)
          .or(`and(de_id.eq.${me?.id},para_id.eq.${outro}),and(de_id.eq.${outro},para_id.eq.${me?.id})`)
          .order('created_at', { ascending: true }).limit(200);
        if (e) throw e;
        msgs = (data ?? []).map((m: MsgDM) => toMsg({ ...m, mine: m.de_id === me?.id, autor: m.de_nome, ts: m.created_at }));
      }
      await resolverUrls(msgs);
      await scroll();
    } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { carregando = false; }
  }

  function abrir(v: View) { view = v; emojiAberto = false; arquivo = null; carregar(); }

  async function enviar(e: Event) {
    e.preventDefault();
    const t = texto.trim();
    if ((!t && !arquivo) || !me) return;
    enviando = true; error = '';
    try {
      let anexo: AnexoMeta | undefined;
      if (arquivo) {
        const scope = view.tipo === 'geral' ? 'geral' : view.tipo === 'canal' ? `canal/${view.canal.id}` : 'dm';
        anexo = await uploadAnexo(arquivo, scope);
      }
      const ax = anexo ? { anexo_path: anexo.path, anexo_nome: anexo.nome, anexo_mime: anexo.mime, anexo_tam: anexo.tam } : {};
      if (view.tipo === 'geral') {
        const { data, error: err } = await supabase.from('uplab_chat_interno')
          .insert({ user_id: me.id, autor_nome: me.nome, texto: t, ...ax }).select(GERAL_COLS).single();
        if (err) throw err;
        if (data) push(toMsg({ ...(data as MsgGeral), mine: true, autor: (data as MsgGeral).autor_nome, ts: (data as MsgGeral).created_at }));
      } else if (view.tipo === 'canal') {
        const cm = await enviarMensagem(view.canal.id, me.id, me.nome, t, anexo);
        push(toMsg({ ...cm, mine: true, autor: cm.autor_nome, ts: cm.created_at }));
      } else {
        const { data, error: err } = await supabase.from('uplab_chat_dm')
          .insert({ de_id: me.id, para_id: view.user.id, de_nome: me.nome, texto: t, ...ax }).select(DM_COLS).single();
        if (err) throw err;
        if (data) push(toMsg({ ...(data as MsgDM), mine: true, autor: (data as MsgDM).de_nome, ts: (data as MsgDM).created_at }));
      }
      texto = ''; arquivo = null; emojiAberto = false;
    } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { enviando = false; }
  }

  function escolherArquivo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { arquivo = f; emojiAberto = false; }
    if (fileInput) fileInput.value = '';
  }
  function onEmoji(emoji: string) { texto += emoji; }

  async function recarregarSidebar() {
    const [u, s, c] = await Promise.all([listUsuarios(), listSetores(), meusCanais()]);
    usuarios = u.filter((x) => x.id !== me?.id); setores = s; canais = c;
  }

  onMount(async () => {
    if (me) await recarregarSidebar();
    await carregar();
    canalGeral = supabase.channel('chat-geral')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uplab_chat_interno' }, (p) => {
        if (view.tipo !== 'geral') return;
        const m = p.new as MsgGeral;
        push(toMsg({ ...m, mine: m.user_id === me?.id, autor: m.autor_nome, ts: m.created_at }));
      }).subscribe();
    canalDM = supabase.channel('chat-dm')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uplab_chat_dm' }, (p) => {
        if (view.tipo !== 'dm') return;
        const m = p.new as MsgDM;
        const outro = view.user.id;
        if ((m.de_id === me?.id && m.para_id === outro) || (m.de_id === outro && m.para_id === me?.id))
          push(toMsg({ ...m, mine: m.de_id === me?.id, autor: m.de_nome, ts: m.created_at }));
      }).subscribe();
    canalCanais = supabase.channel('chat-canais')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uplab_canal_mensagens' }, (p) => {
        if (view.tipo !== 'canal') return;
        const m = p.new as CanalMsg;
        if (m.canal_id === view.canal.id) push(toMsg({ ...m, mine: m.user_id === me?.id, autor: m.autor_nome, ts: m.created_at }));
      }).subscribe();
  });
  onDestroy(() => { for (const c of [canalGeral, canalDM, canalCanais]) if (c) supabase.removeChannel(c); });

  const blocos = $derived.by(() => {
    const out: { dia: string; itens: Msg[] }[] = [];
    let cur: { dia: string; itens: Msg[] } | null = null;
    for (const m of msgs) {
      const dia = new Date(m.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      if (!cur || cur.dia !== dia) { cur = { dia, itens: [] }; out.push(cur); }
      cur.itens.push(m);
    }
    return out;
  });

  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const inicial = (n: string | null) => (n?.trim()?.[0] ?? '?').toUpperCase();
  const PAL = ['#0d9488', '#2766c9', '#6366f1', '#0891b2', '#1aa179', '#7c3aed', '#2f8fd6', '#db6d28'];
  const cor = (s: string) => PAL[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
  const fmtTam = (b: number | null) => !b ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const ehImagem = (m: Msg) => !!m.anexoMime?.startsWith('image/');

  const tituloAtual = $derived(view.tipo === 'geral' ? 'Equipe UPLAB' : view.tipo === 'canal' ? view.canal.nome : view.user.nome);
  const subtituloAtual = $derived(
    view.tipo === 'geral' ? 'Canal geral da equipe'
      : view.tipo === 'canal' ? (view.canal.tipo === 'setor' ? 'Canal do setor' : 'Grupo')
      : labelStatus(statusDe(view.user.id))
  );

  function escolherStatus(s: StatusManual) { void setMeuStatus(s); statusMenu = false; }

  // ============================ Modais de gestão =============================
  let modal = $state<'none' | 'setores' | 'grupo'>('none');
  let setorSel = $state<Setor | null>(null);
  let novoSetorNome = $state('');
  let novoSetorCor = $state('#075e54');
  let setorMembros = $state<Set<string>>(new Set());
  let salvandoSetor = $state(false);
  let modalErr = $state('');

  function abrirSetores() { modal = 'setores'; setorSel = null; modalErr = ''; }
  async function selSetor(s: Setor) {
    setorSel = s; modalErr = '';
    novoSetorNome = s.nome; novoSetorCor = s.cor ?? '#075e54';
    setorMembros = new Set(await membrosSetor(s.id));
  }
  async function addSetor() {
    const nome = novoSetorNome.trim(); if (!nome) return;
    salvandoSetor = true; modalErr = '';
    try { const s = await criarSetor(nome, '', novoSetorCor); await recarregarSidebar(); await selSetor(s); }
    catch (e) { modalErr = e instanceof Error ? e.message : String(e); } finally { salvandoSetor = false; }
  }
  async function salvarSetor() {
    if (!setorSel) return;
    salvandoSetor = true; modalErr = '';
    try {
      await editarSetor(setorSel.id, { nome: novoSetorNome.trim(), cor: novoSetorCor });
      await setMembrosSetor(setorSel.id, [...setorMembros]);
      await recarregarSidebar(); modalErr = 'ok';
    } catch (e) { modalErr = e instanceof Error ? e.message : String(e); } finally { salvandoSetor = false; }
  }
  async function removerSetor() {
    if (!setorSel || !confirm(`Excluir o setor "${setorSel.nome}"? O canal do setor também será removido.`)) return;
    salvandoSetor = true; modalErr = '';
    try { await excluirSetor(setorSel.id); setorSel = null; await recarregarSidebar(); }
    catch (e) { modalErr = e instanceof Error ? e.message : String(e); } finally { salvandoSetor = false; }
  }

  let grupoNome = $state('');
  let grupoDesc = $state('');
  let grupoMembros = $state<Set<string>>(new Set());
  let grupoSetores = $state<Set<string>>(new Set());
  let salvandoGrupo = $state(false);
  function abrirNovoGrupo() { modal = 'grupo'; modalErr = ''; grupoNome = ''; grupoDesc = ''; grupoMembros = new Set(); grupoSetores = new Set(); }
  async function salvarGrupo() {
    const nome = grupoNome.trim(); if (!nome || !me) return;
    salvandoGrupo = true; modalErr = '';
    try {
      const c = await criarGrupo(nome, { descricao: grupoDesc.trim(), membros: [...grupoMembros], setores: [...grupoSetores], criadoPor: me.id });
      await recarregarSidebar(); modal = 'none'; abrir({ tipo: 'canal', canal: c });
    } catch (e) { modalErr = e instanceof Error ? e.message : String(e); } finally { salvandoGrupo = false; }
  }
  function toggle(set: Set<string>, id: string): Set<string> { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; }
</script>

<div class="wa">
  <!-- ============================ Lista (esquerda) ============================ -->
  <aside>
    <header class="side-top">
      <button class="me" onclick={() => (statusMenu = !statusMenu)} title="Meu status">
        <span class="av" style="background:{cor(me?.nome ?? '?')}">
          {inicial(me?.nome ?? '?')}
          <span class="dot" style="background:{corStatus(getMeuStatus())}"></span>
        </span>
        <span class="me-info"><strong>{me?.nome ?? 'Eu'}</strong><span class="me-st">{labelStatus(getMeuStatus())}</span></span>
      </button>
      <div class="side-actions">
        <button class="ic" title="Novo grupo" onclick={abrirNovoGrupo}><Icon name="plus" size={20} /></button>
        {#if podeGerir}<button class="ic" title="Gerenciar setores" onclick={abrirSetores}><Icon name="settings" size={19} /></button>{/if}
      </div>
      {#if statusMenu}
        <div class="status-menu">
          {#each STATUS_OPCOES as s (s)}
            <button class="st-opt" onclick={() => escolherStatus(s)}>
              <span class="sdot" style="background:{corStatus(s)}"></span>{labelStatus(s)}
              {#if getMeuStatus() === s}<span class="chk"><Icon name="check-check" size={15} /></span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </header>

    <div class="search">
      <Icon name="search" size={16} />
      <input placeholder="Pesquisar" bind:value={busca} />
    </div>

    <div class="list">
      <button class="conv" class:on={view.tipo === 'geral'} onclick={() => abrir({ tipo: 'geral' })}>
        <span class="cav geral"><Icon name="users" size={20} /></span>
        <span class="cbody"><span class="cname">Equipe UPLAB</span><span class="cprev">Canal geral da equipe</span></span>
      </button>

      <div class="grp"><span>Setores</span>{#if podeGerir}<button class="cog" title="Gerenciar setores" onclick={abrirSetores}><Icon name="settings" size={15} /></button>{/if}</div>
      {#each canaisSetor as c (c.id)}
        <button class="conv" class:on={view.tipo === 'canal' && view.canal.id === c.id} onclick={() => abrir({ tipo: 'canal', canal: c })}>
          <span class="cav setor"><Icon name="hash" size={18} /></span>
          <span class="cbody"><span class="cname">{c.nome}</span><span class="cprev">Canal do setor</span></span>
        </button>
      {:else}<p class="vazio-list">{podeGerir ? 'Crie um setor no ⚙ acima.' : 'Você não está em nenhum setor.'}</p>{/each}

      <div class="grp"><span>Grupos</span><button class="cog" title="Novo grupo" onclick={abrirNovoGrupo}><Icon name="plus" size={16} /></button></div>
      {#each grupos as c (c.id)}
        <button class="conv" class:on={view.tipo === 'canal' && view.canal.id === c.id} onclick={() => abrir({ tipo: 'canal', canal: c })}>
          <span class="cav grupo"><Icon name="message-circle" size={18} /></span>
          <span class="cbody"><span class="cname">{c.nome}</span><span class="cprev">{c.descricao || 'Grupo'}</span></span>
        </button>
      {:else}<p class="vazio-list">Nenhum grupo ainda.</p>{/each}

      <div class="grp"><span>Conversas</span></div>
      {#each dms as u (u.id)}
        <button class="conv" class:on={view.tipo === 'dm' && view.user.id === u.id} onclick={() => abrir({ tipo: 'dm', user: u })}>
          <span class="av" style="background:{cor(u.nome)}">{inicial(u.nome)}<span class="dot" style="background:{corStatus(statusDe(u.id))}"></span></span>
          <span class="cbody"><span class="cname">{u.nome}</span><span class="cprev">{labelStatus(statusDe(u.id))}</span></span>
        </button>
      {:else}<p class="vazio-list">Nenhum outro usuário cadastrado.</p>{/each}
    </div>
  </aside>

  <!-- ============================ Conversa (direita) ============================ -->
  <section class="thread">
    <header class="th-head">
      {#if view.tipo === 'dm'}
        <span class="av" style="background:{cor(view.user.nome)}">{inicial(view.user.nome)}<span class="dot" style="background:{corStatus(statusDe(view.user.id))}"></span></span>
      {:else}
        <span class="cav {view.tipo === 'canal' && view.canal.tipo === 'grupo' ? 'grupo' : view.tipo === 'canal' ? 'setor' : 'geral'}">
          <Icon name={view.tipo === 'geral' ? 'users' : view.tipo === 'canal' && view.canal.tipo === 'grupo' ? 'message-circle' : 'hash'} size={20} />
        </span>
      {/if}
      <div class="th-info"><strong>{tituloAtual}</strong><span>{subtituloAtual}</span></div>
      <div class="th-actions">
        <button class="ic" title="Pesquisar"><Icon name="search" size={19} /></button>
        <button class="ic" title="Chamada de voz"><Icon name="phone" size={18} /></button>
        <button class="ic" title="Chamada de vídeo"><Icon name="video" size={19} /></button>
        <button class="ic" title="Mais"><Icon name="more-vertical" size={19} /></button>
      </div>
    </header>

    <div class="msgs" bind:this={el}>
      {#if error}<p class="err">{error}</p>{/if}
      {#if carregando}
        <p class="vazio">Carregando…</p>
      {:else}
        {#each blocos as g (g.dia)}
          <div class="sep"><span>{g.dia}</span></div>
          {#each g.itens as m (m.id)}
            <div class="row {m.mine ? 'out' : 'in'}">
              <div class="bubble {m.mine ? 'mine' : ''}">
                {#if !m.mine && view.tipo !== 'dm'}<span class="autor" style="color:{cor(m.autor ?? '?')}">{m.autor ?? 'Alguém'}</span>{/if}
                {#if m.anexoPath}
                  {#if ehImagem(m) && urlMap[m.anexoPath]}
                    <a class="anexo-img-wrap" href={urlMap[m.anexoPath]} target="_blank" rel="noreferrer">
                      <img class="anexo-img" src={urlMap[m.anexoPath]} alt={m.anexoNome ?? 'imagem'} />
                    </a>
                  {:else}
                    <a class="anexo-file" href={urlMap[m.anexoPath] ?? '#'} target="_blank" rel="noreferrer" download={m.anexoNome}>
                      <span class="af-ic"><Icon name="paperclip" size={18} /></span>
                      <span class="af-info"><span class="af-nome">{m.anexoNome ?? 'arquivo'}</span><span class="af-tam">{fmtTam(m.anexoTam)}</span></span>
                    </a>
                  {/if}
                {/if}
                {#if m.texto}<span class="txt">{m.texto}</span>{/if}
                <span class="meta">{hora(m.ts)}{#if m.mine}<span class="ticks"><Icon name="check-check" size={15} /></span>{/if}</span>
              </div>
            </div>
          {/each}
        {:else}
          <p class="vazio">{view.tipo === 'dm' ? `Comece a conversa com ${tituloAtual}.` : 'Diga olá 👋'}</p>
        {/each}
      {/if}
    </div>

    <div class="comp-wrap">
      {#if emojiAberto}<div class="emoji-pop"><EmojiPicker onpick={onEmoji} /></div>{/if}
      {#if arquivo}
        <div class="chip">
          <span class="chip-ic"><Icon name="paperclip" size={15} /></span>
          <span class="chip-nome">{arquivo.name}</span><span class="chip-tam">{fmtTam(arquivo.size)}</span>
          <button class="ic" title="Remover" onclick={() => (arquivo = null)}><Icon name="x" size={14} /></button>
        </div>
      {/if}
      <form class="comp" onsubmit={enviar}>
        <button type="button" class="ic" title="Emoji" onclick={() => (emojiAberto = !emojiAberto)}><Icon name="smile" size={22} /></button>
        <button type="button" class="ic" title="Anexar arquivo" onclick={() => fileInput?.click()}><Icon name="paperclip" size={21} /></button>
        <input class="file-hidden" type="file" bind:this={fileInput} onchange={escolherArquivo} />
        <input placeholder={enviando ? 'Enviando…' : 'Digite uma mensagem'} bind:value={texto} maxlength="2000" disabled={enviando} />
        <button class="send" type="submit" disabled={enviando || (!texto.trim() && !arquivo)} title={texto.trim() || arquivo ? 'Enviar' : 'Áudio'}>
          <Icon name={texto.trim() || arquivo ? 'send' : 'mic'} size={20} />
        </button>
      </form>
    </div>
  </section>
</div>

<!-- ============================ Modal: Setores ============================ -->
{#if modal === 'setores'}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" role="presentation" onclick={() => (modal = 'none')} onkeydown={(e) => { if (e.key === 'Escape') modal = 'none'; }}>
    <div class="dlg lg" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <header class="dlg-h"><strong>Setores / Departamentos</strong><button class="ic" onclick={() => (modal = 'none')}><Icon name="x" size={18} /></button></header>
      <div class="dlg-body two">
        <div class="col-list">
          {#each setores as s (s.id)}
            <button class="lit" class:on={setorSel?.id === s.id} onclick={() => selSetor(s)}>
              <span class="sdot" style="background:{s.cor ?? '#075e54'}"></span><span class="nm">{s.nome}</span>
            </button>
          {:else}<p class="vazio-list">Nenhum setor.</p>{/each}
          <div class="novo">
            <input placeholder="Novo setor…" bind:value={novoSetorNome} onkeydown={(e) => { if (e.key === 'Enter' && !setorSel) addSetor(); }} />
            {#if !setorSel}<button class="primary sm" onclick={addSetor} disabled={salvandoSetor || !novoSetorNome.trim()}>Criar</button>{/if}
          </div>
        </div>
        <div class="col-detail">
          {#if setorSel}
            <label class="fld"><span>Nome</span><input bind:value={novoSetorNome} /></label>
            <label class="fld"><span>Cor</span><input type="color" bind:value={novoSetorCor} /></label>
            <div class="fld"><span>Membros do setor</span>
              <div class="check-list">
                {#each (me ? [me, ...usuarios] : usuarios) as u (u.id)}
                  <label class="ck"><input type="checkbox" checked={setorMembros.has(u.id)} onchange={() => (setorMembros = toggle(setorMembros, u.id))} /> {u.nome}{u.id === me?.id ? ' (você)' : ''}</label>
                {/each}
              </div>
            </div>
            {#if modalErr && modalErr !== 'ok'}<p class="err">{modalErr}</p>{/if}
            {#if modalErr === 'ok'}<p class="ok">Salvo ✓</p>{/if}
            <div class="dlg-actions">
              <button class="danger" onclick={removerSetor} disabled={salvandoSetor}>Excluir</button>
              <button class="primary" onclick={salvarSetor} disabled={salvandoSetor}>Salvar</button>
            </div>
          {:else}
            <p class="vazio">Selecione um setor à esquerda ou crie um novo. Quem entra no setor participa do canal automaticamente.</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ============================ Modal: Novo grupo ============================ -->
{#if modal === 'grupo'}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" role="presentation" onclick={() => (modal = 'none')} onkeydown={(e) => { if (e.key === 'Escape') modal = 'none'; }}>
    <div class="dlg" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <header class="dlg-h"><strong>Novo grupo</strong><button class="ic" onclick={() => (modal = 'none')}><Icon name="x" size={18} /></button></header>
      <div class="dlg-body">
        <label class="fld"><span>Nome</span><input bind:value={grupoNome} placeholder="Ex.: Comercial ↔ Financeiro" /></label>
        <label class="fld"><span>Descrição (opcional)</span><input bind:value={grupoDesc} /></label>
        <div class="fld"><span>Setores no grupo (todos do setor participam)</span>
          <div class="check-list sm">
            {#each setores as s (s.id)}
              <label class="ck"><input type="checkbox" checked={grupoSetores.has(s.id)} onchange={() => (grupoSetores = toggle(grupoSetores, s.id))} /> {s.nome}</label>
            {:else}<p class="vazio-list">Nenhum setor cadastrado.</p>{/each}
          </div>
        </div>
        <div class="fld"><span>Membros avulsos</span>
          <div class="check-list sm">
            {#each usuarios as u (u.id)}
              <label class="ck"><input type="checkbox" checked={grupoMembros.has(u.id)} onchange={() => (grupoMembros = toggle(grupoMembros, u.id))} /> {u.nome}</label>
            {/each}
          </div>
        </div>
        {#if modalErr && modalErr !== 'ok'}<p class="err">{modalErr}</p>{/if}
        <div class="dlg-actions">
          <button onclick={() => (modal = 'none')}>Cancelar</button>
          <button class="primary" onclick={salvarGrupo} disabled={salvandoGrupo || !grupoNome.trim()}>Criar grupo</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Paleta WhatsApp clássico */
  .wa {
    --wa-green: #075e54; --wa-green-2: #128c7e; --wa-accent: #00a884;
    --wa-mine: #d9fdd3; --wa-recv: #ffffff; --wa-bg: #efeae2; --wa-ink: #111b21; --wa-sub: #667781;
    display: grid; grid-template-columns: 320px 1fr; height: 100%; min-height: 520px;
    border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); background: #fff;
  }

  /* ---- Lista (esquerda) ---- */
  aside { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid #e9edef; background: #fff; }
  .side-top { position: relative; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem; background: var(--wa-green); color: #fff; }
  .me { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; border: none; background: transparent; color: #fff; padding: 0.2rem; }
  .me:hover { background: transparent; color: #fff; }
  .me-info { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
  .me-info strong { font-size: 0.9rem; line-height: 1.1; }
  .me-st { font-size: 0.7rem; color: rgba(255,255,255,0.8); }
  .side-actions { display: flex; gap: 0.1rem; }
  .ic { display: grid; place-items: center; border: none; background: transparent; color: inherit; padding: 0.4rem; border-radius: 50%; line-height: 0; }
  .ic:hover { background: rgba(0,0,0,0.08); color: inherit; }
  .side-top .ic { color: #fff; }
  .side-top .ic:hover { background: rgba(255,255,255,0.16); }
  .status-menu { position: absolute; top: 100%; left: 0.7rem; z-index: 20; background: #fff; color: var(--text); border-radius: 10px; box-shadow: var(--shadow); padding: 0.3rem; min-width: 200px; }
  .st-opt { display: flex; align-items: center; gap: 0.55rem; width: 100%; border: none; background: transparent; padding: 0.5rem 0.6rem; border-radius: 8px; color: var(--text); }
  .st-opt:hover { background: var(--surface-2); color: var(--text); }
  .st-opt .chk { margin-left: auto; color: var(--wa-accent); display: grid; }
  .sdot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }

  .search { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem; color: var(--wa-sub); border-bottom: 1px solid #f0f2f5; }
  .search input { flex: 1; border: none; background: #f0f2f5; border-radius: var(--radius-pill); padding: 0.45rem 0.8rem; font-size: 0.85rem; }
  .search input:focus { box-shadow: none; background: #eaedef; }

  .list { flex: 1; overflow-y: auto; padding: 0.2rem 0; }
  .grp { display: flex; align-items: center; justify-content: space-between; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--wa-sub); padding: 0.7rem 0.9rem 0.25rem; }
  .grp .cog { border: none; background: transparent; color: var(--wa-sub); padding: 0.15rem; border-radius: 6px; line-height: 0; }
  .grp .cog:hover { color: var(--wa-green); background: #f0f2f5; }
  .conv { display: flex; align-items: center; gap: 0.7rem; width: 100%; border: none; background: transparent; text-align: left; padding: 0.5rem 0.9rem; color: var(--text); }
  .conv:hover { background: #f5f6f6; }
  .conv.on { background: #f0f2f5; }
  .cbody { display: flex; flex-direction: column; min-width: 0; gap: 0.1rem; }
  .cname { font-size: 0.9rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cprev { font-size: 0.76rem; color: var(--wa-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .av { position: relative; display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; color: #fff; font-weight: 700; font-size: 1rem; }
  .cav { display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; color: #fff; }
  .cav.geral { background: #6b7280; } .cav.setor { background: var(--wa-green-2); } .cav.grupo { background: var(--wa-accent); }
  .dot { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; }
  .vazio-list { font-size: 0.76rem; color: var(--wa-sub); padding: 0.3rem 0.9rem 0.5rem; }

  /* ---- Conversa (direita) ---- */
  .thread { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--wa-bg); }
  .th-head { display: flex; align-items: center; gap: 0.7rem; padding: 0.5rem 0.9rem; background: var(--wa-green); color: #fff; }
  .th-head .av, .th-head .cav { width: 38px; height: 38px; font-size: 0.9rem; }
  .th-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .th-info strong { font-size: 0.92rem; line-height: 1.15; }
  .th-info span { font-size: 0.72rem; color: rgba(255,255,255,0.8); }
  .th-actions { display: flex; gap: 0.1rem; }
  .th-actions .ic { color: #fff; } .th-actions .ic:hover { background: rgba(255,255,255,0.16); }
  .err { color: var(--danger); background: #fff; padding: 0.4rem 0.7rem; border-radius: 8px; align-self: center; }

  .msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem 6%; display: flex; flex-direction: column; gap: 0.2rem;
    background-color: var(--wa-bg);
    background-image: radial-gradient(rgba(0,0,0,0.022) 1px, transparent 1px); background-size: 22px 22px; }
  .vazio { margin: auto; color: var(--wa-sub); background: #fff; padding: 0.5rem 1rem; border-radius: 10px; box-shadow: var(--shadow-sm); }
  .sep { text-align: center; margin: 0.6rem 0; }
  .sep span { font-size: 0.68rem; color: var(--wa-sub); background: #fff; border-radius: 8px; padding: 0.25rem 0.8rem; box-shadow: var(--shadow-sm); text-transform: capitalize; }
  .row { display: flex; }
  .row.out { justify-content: flex-end; }
  .bubble { position: relative; max-width: 65%; padding: 0.35rem 0.55rem 0.32rem; border-radius: 8px; background: var(--wa-recv); color: var(--wa-ink); box-shadow: 0 1px 0.5px rgba(11,20,26,0.13); display: flex; flex-direction: column; }
  .bubble.mine { background: var(--wa-mine); }
  .autor { font-size: 0.74rem; font-weight: 600; margin-bottom: 0.05rem; }
  .txt { font-size: 0.885rem; white-space: pre-wrap; word-break: break-word; line-height: 1.3; }
  .meta { display: flex; align-items: center; gap: 0.2rem; align-self: flex-end; margin-top: 0.05rem; font-size: 0.62rem; color: var(--wa-sub); }
  .ticks { display: grid; color: #53bdeb; }
  .anexo-img-wrap { display: block; margin-bottom: 0.2rem; }
  .anexo-img { max-width: 260px; max-height: 280px; border-radius: 6px; display: block; }
  .anexo-file { display: flex; align-items: center; gap: 0.55rem; padding: 0.5rem 0.6rem; margin-bottom: 0.2rem; background: rgba(0,0,0,0.05); border-radius: 7px; text-decoration: none; color: inherit; }
  .anexo-file:hover { background: rgba(0,0,0,0.09); }
  .af-ic { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--wa-accent); color: #fff; flex-shrink: 0; }
  .af-info { display: flex; flex-direction: column; min-width: 0; }
  .af-nome { font-size: 0.82rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .af-tam { font-size: 0.68rem; color: var(--wa-sub); }

  .comp-wrap { position: relative; background: #f0f2f5; }
  .emoji-pop { position: absolute; bottom: 100%; left: 8px; margin-bottom: 8px; z-index: 30; }
  .chip { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.8rem; border-bottom: 1px solid #e4e7e9; font-size: 0.82rem; color: var(--text); }
  .chip-ic { display: grid; color: var(--wa-sub); }
  .chip-nome { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
  .chip-tam { color: var(--wa-sub); font-size: 0.72rem; }
  .chip .ic { margin-left: auto; color: var(--wa-sub); padding: 0.2rem; }
  .file-hidden { display: none; }
  .comp { display: flex; align-items: center; gap: 0.3rem; padding: 0.5rem 0.7rem; }
  .comp .ic { color: #54656f; }
  .comp .ic:hover { background: #e4e7e9; color: #54656f; }
  .comp input:not(.file-hidden) { flex: 1; border: none; background: #fff; border-radius: var(--radius-pill); padding: 0.6rem 0.9rem; font-size: 0.9rem; }
  .comp input:not(.file-hidden):focus { box-shadow: none; }
  .send { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; border: none; background: var(--wa-accent); color: #fff; flex-shrink: 0; }
  .send:hover:not(:disabled) { background: #017561; color: #fff; border: none; }

  /* ---- Modais ---- */
  .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: grid; place-items: center; z-index: 50; padding: 1rem; }
  .dlg { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); width: min(460px, 96vw); max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
  .dlg.lg { width: min(720px, 96vw); }
  .dlg-h { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1rem; border-bottom: 1px solid var(--border); }
  .dlg-h .ic { color: var(--text-dim); }
  .dlg-body { padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.8rem; }
  .dlg-body.two { display: grid; grid-template-columns: 240px 1fr; gap: 0; padding: 0; }
  .col-list { border-right: 1px solid var(--border); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.1rem; overflow-y: auto; }
  .col-list .lit { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.6rem; border: none; border-radius: var(--radius-sm); background: transparent; text-align: left; width: 100%; color: var(--text); }
  .col-list .lit:hover { background: var(--surface-2); }
  .col-list .lit.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .col-list .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; }
  .col-list .novo { display: flex; gap: 0.3rem; margin-top: 0.5rem; }
  .col-list .novo input { flex: 1; min-width: 0; }
  .col-detail { padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; overflow-y: auto; }
  .fld { display: flex; flex-direction: column; gap: 0.3rem; }
  .fld > span { font-size: 0.72rem; font-weight: 600; color: var(--text-dim); }
  .check-list { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.4rem 0.6rem; max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .check-list.sm { max-height: 150px; }
  .ck { display: flex; align-items: center; gap: 0.45rem; font-size: 0.84rem; cursor: pointer; }
  .ok { color: var(--ok); font-size: 0.8rem; }
  .dlg-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
  .danger { margin-right: auto; }
  .primary.sm { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
</style>
