<script lang="ts">
  import { onMount } from 'svelte';
  import { signIn } from '$core/auth.svelte';
  import WinControls from '$core/ui/WinControls.svelte';

  const STORE_KEY = 'uplab.cred';

  let email = $state('');
  let password = $state('');
  let lembrar = $state(false);
  let loading = $state(false);
  let error = $state('');

  onMount(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        email = c.email ?? '';
        password = c.password ?? '';
        lembrar = true;
      }
    } catch {
      /* ignora */
    }
  });

  async function submit(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';
    try {
      await signIn(email.trim(), password);
      if (lembrar) localStorage.setItem(STORE_KEY, JSON.stringify({ email: email.trim(), password }));
      else localStorage.removeItem(STORE_KEY);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Falha no login';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth" data-tauri-drag-region>
  <div class="aurora a1"></div>
  <div class="aurora a2"></div>
  <div class="aurora a3"></div>
  <div class="grid-fx"></div>

  <div class="winbar"><WinControls /></div>

  <div class="panel">
    <div class="logo-chip"><img src="/logo.png" alt="UPLAB Brasil" /></div>
    <h1>Sistema Interno</h1>
    <p class="sub">UPLAB Brasil · Indústria Óptica</p>

    <form onsubmit={submit}>
      <label>
        <span>E-mail</span>
        <input type="email" bind:value={email} autocomplete="username" placeholder="voce@uplab.com" required />
      </label>
      <label>
        <span>Senha</span>
        <input type="password" bind:value={password} autocomplete="current-password" placeholder="••••••••" required />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={lembrar} />
        <span>Salvar senha neste computador</span>
      </label>
      {#if error}<p class="err">{error}</p>{/if}
      <button class="cta" type="submit" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  </div>
</div>

<style>
  @property --beam {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
  }

  .auth {
    position: relative;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.2rem;
    overflow: hidden;
    background: #070d1a;
  }

  /* Aurora viva: manchas de luz da marca flutuando devagar. */
  .aurora {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.55;
    pointer-events: none;
  }
  .a1 { width: 360px; height: 360px; background: #1f6fe0; top: -110px; left: -90px; animation: drift 22s ease-in-out infinite; }
  .a2 { width: 320px; height: 320px; background: #16c0d8; bottom: -120px; right: -70px; animation: drift 26s ease-in-out infinite reverse; }
  .a3 { width: 260px; height: 260px; background: #2bbfa6; top: 45%; left: 40%; opacity: 0.4; animation: drift 30s ease-in-out infinite; }
  @keyframes drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(40px, -30px) scale(1.12); }
    66% { transform: translate(-30px, 25px) scale(0.95); }
  }

  /* Malha técnica sutil, esmaecida no centro. */
  .grid-fx {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(120, 170, 255, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120, 170, 255, 0.06) 1px, transparent 1px);
    background-size: 38px 38px;
    mask-image: radial-gradient(circle at 50% 45%, #000 10%, transparent 72%);
    pointer-events: none;
  }

  .winbar {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    z-index: 5;
  }

  .panel {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 312px;
    padding: 1.7rem 1.6rem 1.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    border-radius: 20px;
    background: rgba(16, 26, 48, 0.72);
    backdrop-filter: blur(18px);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    animation: rise 0.5s ease both;
  }
  /* Border-beam: luz da marca girando na borda do painel. */
  .panel::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1.5px;
    background: conic-gradient(
      from var(--beam),
      transparent 0deg,
      #34bcd6 40deg,
      #2766c9 80deg,
      transparent 130deg,
      transparent 360deg
    );
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    animation: beam 5s linear infinite;
    pointer-events: none;
  }
  /* Borda base estática (o beam passa por cima). */
  .panel::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1px solid rgba(120, 160, 220, 0.14);
    pointer-events: none;
  }
  @keyframes beam {
    to { --beam: 360deg; }
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .logo-chip {
    position: relative;
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    margin-bottom: 0.6rem;
    background: #fff;
    border-radius: 15px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
  .logo-chip img {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }

  h1 {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 700;
    color: #f3f7ff;
  }
  .sub {
    margin: 0.25rem 0 1.2rem;
    font-size: 0.66rem;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #7e93b8;
  }

  form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-align: left;
    font-size: 0.72rem;
    font-weight: 600;
    color: #9fb0cf;
  }
  .panel input[type='email'],
  .panel input[type='password'] {
    background: rgba(8, 15, 30, 0.6);
    border: 1px solid rgba(120, 160, 220, 0.18);
    color: #eaf1ff;
    border-radius: 10px;
    padding: 0.55rem 0.7rem;
    font-size: 0.88rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .panel input::placeholder {
    color: #5d6f90;
  }
  .panel input:focus {
    outline: none;
    border-color: var(--accent-2);
    box-shadow: 0 0 0 3px rgba(52, 188, 214, 0.18);
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    font-size: 0.74rem;
    color: #9fb0cf;
    cursor: pointer;
  }
  label.check input {
    width: 15px;
    height: 15px;
    accent-color: var(--accent-2);
  }

  .cta {
    margin-top: 0.3rem;
    padding: 0.62rem;
    font-size: 0.92rem;
    font-weight: 600;
    color: #fff;
    border: none;
    border-radius: 11px;
    background: linear-gradient(135deg, #2766c9, #34bcd6);
    box-shadow: 0 8px 22px rgba(39, 102, 201, 0.45);
    transition: filter 0.15s, box-shadow 0.15s, transform 0.06s;
  }
  .cta:hover:not(:disabled) {
    filter: brightness(1.08);
    box-shadow: 0 10px 28px rgba(52, 188, 214, 0.5);
  }
  .cta:active:not(:disabled) {
    transform: translateY(1px);
  }
  .cta:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .err {
    color: #ff8a8f;
    font-size: 0.8rem;
    margin: 0;
    text-align: left;
  }
</style>
