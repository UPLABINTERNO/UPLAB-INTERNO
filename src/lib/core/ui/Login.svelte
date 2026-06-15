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
      // Salva (ou limpa) as credenciais conforme a opção.
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
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <div class="grid-overlay"></div>

  <div class="winbar"><WinControls tone="light" /></div>

  <div class="card">
    <img class="logo" src="/logo.png" alt="UPLAB Brasil" />
    <h1>Sistema Interno</h1>
    <p class="sub">Acesse com suas credenciais</p>

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
      <button class="primary" type="submit" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>

    <span class="tag">UPLAB Brasil · Indústria Óptica</span>
  </div>
</div>

<style>
  .auth {
    position: relative;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    overflow: hidden;
    background: linear-gradient(135deg, #0e2c54, #1d52a8 45%, #2f9fd0 100%);
    background-size: 200% 200%;
    animation: shift 16s ease infinite;
  }

  @keyframes shift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  .winbar {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    z-index: 3;
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(70px);
    opacity: 0.55;
    animation: float 18s ease-in-out infinite;
  }
  .b1 { width: 380px; height: 380px; background: #34bcd6; top: -90px; left: -80px; }
  .b2 { width: 420px; height: 420px; background: #3bb6a6; bottom: -120px; right: -90px; animation-delay: -6s; }
  .b3 { width: 300px; height: 300px; background: #5aa9ff; top: 40%; right: 18%; animation-delay: -10s; }
  @keyframes float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(20px, -30px) scale(1.08); }
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: radial-gradient(circle at 50% 40%, black, transparent 75%);
  }

  .card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 380px;
    padding: 2.2rem 2rem 1.6rem;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 20px;
    box-shadow: 0 24px 60px rgba(8, 25, 55, 0.4);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    animation: rise 0.5s ease both;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .logo {
    width: 92px;
    height: 92px;
    object-fit: contain;
    border-radius: 18px;
    box-shadow: 0 8px 22px rgba(8, 25, 55, 0.12);
    margin-bottom: 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.45rem;
    background: var(--brand-grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .sub {
    margin: 0.3rem 0 1.4rem;
    color: var(--text-dim);
    font-size: 0.9rem;
  }

  form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    text-align: left;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    cursor: pointer;
  }
  label.check input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
  form button {
    margin-top: 0.3rem;
    padding: 0.7rem;
    font-size: 1rem;
  }
  .err {
    color: var(--danger);
    font-size: 0.85rem;
    margin: 0;
    text-align: left;
  }
  .tag {
    margin-top: 1.4rem;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #95a3ba;
  }
</style>
