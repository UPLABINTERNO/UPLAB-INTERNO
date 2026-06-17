<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { supabase } from '$core/supabase';
  import { currentProfile } from '$core/auth.svelte';

  interface MsgGeral { id: number; user_id: string | null; autor_nome: string | null; texto: string; created_at: string; }
  interface MsgDM { id: number; de_id: string; para_id: string; de_nome: string | null; texto: string; created_at: string; }
  interface Usuario { id: string; nome: string; email: string | null; role: string; }
  type View = { tipo: 'geral' } | { tipo: 'dm'; user: Usuario };

  const me = currentProfile();
  let usuarios = $state<Usuario[]>([]);
  let view = $state<View>({ tipo: 'geral' });
  let msgs = $state<{ id: number; mine: boolean; autor: string | null; texto: string; ts: string }[]>([]);
  let texto = $state('');
  let enviando = $state(false);
  let carregando = $state(false);
  let error = $state('');
  let el = $state<HTMLElement | null>(null);
  let canalGeral: RealtimeChannel | null = null;
  let canalDM: RealtimeChannel | null = null;

  const norm = (m: { id: number; mine: boolean; autor: string | null; texto: string; ts: string }) => m;
  async function scroll() { await tick(); if (el) el.scrollTop = el.scrollHeight; }
  function push(m: { id: number; mine: boolean; autor: string | null; texto: string; ts: string }) {
    if (!msgs.some((x) => x.id === m.id)) { msgs = [...msgs, m]; scroll(); }
  }

  async function carregar() {
    carregando = true; error = ''; msgs = [];
    try {
      if (view.tipo === 'geral') {
        const { data, error: e } = await supabase.from('uplab_chat_interno')
          .select('id,user_id,autor_nome,texto,created_at').order('created_at', { ascending: true }).limit(500);
        if (e) throw e;
        msgs = (data ?? []).map((m: MsgGeral) => norm({ id: m.id, mine: m.user_id === me?.id, autor: m.autor_nome, texto: m.texto, ts: m.created_at }));
      } else {
        const outro = view.user.id;
        const { data, error: e } = await supabase.from('uplab_chat_dm')
          .select('id,de_id,para_id,de_nome,texto,created_at')
          .or(`and(de_id.eq.${me?.id},para_id.eq.${outro}),and(de_id.eq.${outro},para_id.eq.${me?.id})`)
          .order('created_at', { ascending: true }).limit(500);
        if (e) throw e;
        msgs = (data ?? []).map((m: MsgDM) => norm({ id: m.id, mine: m.de_id === me?.id, autor: m.de_nome, texto: m.texto, ts: m.created_at }));
      }
      await scroll();
    } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { carregando = false; }
  }

  function abrir(v: View) { view = v; carregar(); }

  async function enviar(e: Event) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !me) return;
    enviando = true; error = '';
    try {
      if (view.tipo === 'geral') {
        const { data, error: err } = await supabase.from('uplab_chat_interno')
          .insert({ user_id: me.id, autor_nome: me.nome, texto: t }).select('id,user_id,autor_nome,texto,created_at').single();
        if (err) throw err;
        if (data) push(norm({ id: data.id, mine: true, autor: data.autor_nome, texto: data.texto, ts: data.created_at }));
      } else {
        const { data, error: err } = await supabase.from('uplab_chat_dm')
          .insert({ de_id: me.id, para_id: view.user.id, de_nome: me.nome, texto: t }).select('id,de_id,para_id,de_nome,texto,created_at').single();
        if (err) throw err;
        if (data) push(norm({ id: data.id, mine: true, autor: data.de_nome, texto: data.texto, ts: data.created_at }));
      }
      texto = '';
    } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { enviando = false; }
  }

  onMount(async () => {
    if (me) {
      const { data } = await supabase.from('profiles').select('id,nome,email,role').neq('role', 'cliente').neq('id', me.id).order('nome');
      usuarios = (data ?? []) as Usuario[];
    }
    await carregar();
    canalGeral = supabase.channel('chat-geral')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uplab_chat_interno' }, (p) => {
        if (view.tipo !== 'geral') return;
        const m = p.new as MsgGeral;
        push(norm({ id: m.id, mine: m.user_id === me?.id, autor: m.autor_nome, texto: m.texto, ts: m.created_at }));
      }).subscribe();
    canalDM = supabase.channel('chat-dm')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uplab_chat_dm' }, (p) => {
        if (view.tipo !== 'dm') return;
        const m = p.new as MsgDM;
        const outro = view.user.id;
        const pertence = (m.de_id === me?.id && m.para_id === outro) || (m.de_id === outro && m.para_id === me?.id);
        if (pertence) push(norm({ id: m.id, mine: m.de_id === me?.id, autor: m.de_nome, texto: m.texto, ts: m.created_at }));
      }).subscribe();
  });
  onDestroy(() => { if (canalGeral) supabase.removeChannel(canalGeral); if (canalDM) supabase.removeChannel(canalDM); });

  const grupos = $derived.by(() => {
    const out: { dia: string; itens: typeof msgs }[] = [];
    let cur: { dia: string; itens: typeof msgs } | null = null;
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
  const tituloAtual = $derived(view.tipo === 'geral' ? 'Equipe UPLAB' : view.user.nome);
</script>

<div class="wrap">
  <aside>
    <div class="grp">Canais</div>
    <button class="lit" class:on={view.tipo === 'geral'} onclick={() => abrir({ tipo: 'geral' })}>
      <span class="hash">#</span><span class="nm">Equipe UPLAB</span>
    </button>
    <div class="grp">Mensagens diretas</div>
    {#each usuarios as u (u.id)}
      <button class="lit" class:on={view.tipo === 'dm' && view.user.id === u.id} onclick={() => abrir({ tipo: 'dm', user: u })}>
        <span class="av" style="background:{cor(u.nome)}">{inicial(u.nome)}</span><span class="nm">{u.nome}</span>
      </button>
    {:else}
      <p class="vazio-list">Nenhum outro usuário cadastrado ainda.</p>
    {/each}
  </aside>

  <section class="thread">
    <header class="th-head">
      {#if view.tipo === 'geral'}<span class="badge">#</span>{:else}<span class="av" style="background:{cor(view.user.nome)}">{inicial(view.user.nome)}</span>{/if}
      <div><strong>{tituloAtual}</strong><span class="dim">{view.tipo === 'geral' ? 'Canal geral da equipe' : view.user.email ?? ''}</span></div>
    </header>

    <div class="msgs" bind:this={el}>
      {#if error}<p class="err">{error}</p>{/if}
      {#if carregando}
        <p class="vazio">Carregando…</p>
      {:else}
        {#each grupos as g (g.dia)}
          <div class="sep"><span>{g.dia}</span></div>
          {#each g.itens as m (m.id)}
            <div class="row {m.mine ? 'out' : 'in'}">
              {#if !m.mine}<span class="av sm" style="background:{cor(m.autor ?? '?')}">{inicial(m.autor)}</span>{/if}
              <div class="bubble {m.mine ? 'mine' : ''}">
                {#if !m.mine && view.tipo === 'geral'}<span class="autor" style="color:{cor(m.autor ?? '?')}">{m.autor ?? 'Alguém'}</span>{/if}
                <span class="txt">{m.texto}</span><span class="t">{hora(m.ts)}</span>
              </div>
            </div>
          {/each}
        {:else}
          <p class="vazio">{view.tipo === 'geral' ? 'Diga olá à equipe 👋' : `Comece a conversa com ${tituloAtual}.`}</p>
        {/each}
      {/if}
    </div>

    <form class="comp" onsubmit={enviar}>
      <input placeholder={view.tipo === 'geral' ? 'Mensagem para a equipe…' : `Mensagem para ${tituloAtual}…`} bind:value={texto} maxlength="2000" />
      <button class="primary" type="submit" disabled={enviando || !texto.trim()}>Enviar</button>
    </form>
  </section>
</div>

<style>
  .wrap { display: grid; grid-template-columns: 240px 1fr; height: calc(100vh - 130px); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); background: var(--surface); }
  aside { display: flex; flex-direction: column; gap: 0.1rem; border-right: 1px solid var(--border); overflow-y: auto; padding: 0.5rem 0.4rem; background: var(--surface-2); }
  .grp { font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); padding: 0.6rem 0.6rem 0.3rem; }
  .lit { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.6rem; border: none; border-radius: var(--radius-sm); background: transparent; text-align: left; width: 100%; color: var(--text); }
  .lit:hover { background: var(--surface); box-shadow: none; }
  .lit.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .lit .hash { width: 26px; text-align: center; font-weight: 700; color: var(--text-dim); }
  .lit .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.84rem; }
  .av { display: grid; place-items: center; width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; color: #fff; font-weight: 700; font-size: 0.72rem; }
  .vazio-list { font-size: 0.76rem; color: var(--text-dim); padding: 0.5rem 0.6rem; }

  .thread { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .th-head { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); background: var(--navy-grad); color: #fff; }
  .th-head .badge { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: rgba(255,255,255,0.18); font-size: 1.1rem; font-weight: 700; }
  .th-head .av { width: 34px; height: 34px; font-size: 0.85rem; }
  .th-head strong { font-size: 0.92rem; display: block; }
  .th-head .dim { color: rgba(255,255,255,0.75); font-size: 0.72rem; }
  .err { color: var(--danger); }

  .msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.35rem; background: #eef2f8; }
  .vazio { margin: auto; color: var(--text-dim); }
  .sep { text-align: center; margin: 0.5rem 0; }
  .sep span { font-size: 0.68rem; color: var(--text-dim); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 0.15rem 0.7rem; text-transform: capitalize; }
  .row { display: flex; gap: 0.5rem; align-items: flex-end; }
  .row.out { justify-content: flex-end; }
  .av.sm { width: 28px; height: 28px; }
  .bubble { max-width: 70%; padding: 0.4rem 0.65rem 0.3rem; border-radius: 12px; background: var(--surface); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.05rem; border-top-left-radius: 3px; }
  .bubble.mine { background: var(--brand-blue); color: #fff; border-top-left-radius: 12px; border-top-right-radius: 3px; }
  .autor { font-size: 0.7rem; font-weight: 700; }
  .txt { font-size: 0.88rem; white-space: pre-wrap; word-break: break-word; }
  .bubble .t { font-size: 0.62rem; opacity: 0.7; align-self: flex-end; }
  .comp { display: flex; gap: 0.5rem; padding: 0.7rem; border-top: 1px solid var(--border); background: var(--surface); }
  .comp input { flex: 1; }
</style>
