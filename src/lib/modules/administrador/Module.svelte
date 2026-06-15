<script lang="ts">
  import { onMount } from 'svelte';
  import { MODULES } from '$core/modules';
  import { INTERNAL_ROLES, ROLE_LABEL, currentSession } from '$core/auth.svelte';
  import {
    listUsers,
    listUserPermissions,
    grant,
    revoke,
    createUser,
    setRole,
    type UserRow
  } from './api';

  const ACOES: { key: string; label: string }[] = [
    { key: 'access', label: 'Acessar' },
    { key: 'read', label: 'Ler' },
    { key: 'create', label: 'Criar' },
    { key: 'update', label: 'Editar' },
    { key: 'delete', label: 'Excluir' }
  ];

  let users = $state<UserRow[]>([]);
  let selected = $state<UserRow | null>(null);
  let perms = $state<Set<string>>(new Set());
  let error = $state('');
  let saving = $state('');

  // Cadastro de novo usuário (sempre com um nível interno).
  let novo = $state({ nome: '', email: '', password: '', nivel: 'funcionario' });
  let criando = $state(false);
  let okMsg = $state('');

  onMount(carregarUsuarios);

  async function cadastrar(e: Event) {
    e.preventDefault();
    criando = true;
    error = '';
    okMsg = '';
    try {
      const id = await createUser(novo.email.trim(), novo.password, novo.nome.trim());
      if (id) await setRole(id, novo.nivel);
      okMsg = `Usuário ${novo.email} criado.`;
      novo = { nome: '', email: '', password: '', nivel: 'funcionario' };
      await carregarUsuarios();
    } catch (err) {
      error = msg(err);
    } finally {
      criando = false;
    }
  }

  async function carregarUsuarios() {
    try {
      users = await listUsers();
    } catch (e) {
      error = msg(e);
    }
  }

  async function selecionar(u: UserRow) {
    selected = u;
    perms = new Set();
    error = '';
    try {
      perms = new Set(await listUserPermissions(u.id));
    } catch (e) {
      error = msg(e);
    }
  }

  async function mudarNivel(e: Event) {
    if (!selected) return;
    const role = (e.currentTarget as HTMLSelectElement).value;
    const ehProprio = selected.id === currentSession()?.user.id;
    if (ehProprio && role !== 'admin') {
      if (!confirm('Você está rebaixando o PRÓPRIO usuário e pode perder o acesso de admin. Continuar?')) {
        (e.currentTarget as HTMLSelectElement).value = selected.role;
        return;
      }
    }
    error = '';
    try {
      await setRole(selected.id, role);
      selected = { ...selected, role };
      users = users.map((u) => (u.id === selected!.id ? { ...u, role } : u));
    } catch (err) {
      error = msg(err);
    }
  }

  function has(mod: string, acao: string): boolean {
    return perms.has(`${mod}:${acao}`);
  }

  async function toggle(mod: string, acao: string, checked: boolean) {
    if (!selected) return;
    const permission = `${mod}:${acao}`;
    saving = permission;
    error = '';
    try {
      if (checked) {
        await grant(selected.id, permission);
        perms.add(permission);
      } else {
        await revoke(selected.id, permission);
        perms.delete(permission);
      }
      perms = new Set(perms); // dispara reatividade
    } catch (e) {
      error = msg(e);
    } finally {
      saving = '';
    }
  }

  function msg(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return String(e);
  }
</script>

<div class="layout">
  <aside>
    <h3>Novo usuário</h3>
    <form class="cadastro" onsubmit={cadastrar}>
      <input placeholder="Nome" bind:value={novo.nome} required />
      <input type="email" placeholder="E-mail" bind:value={novo.email} required />
      <input type="password" placeholder="Senha" bind:value={novo.password} minlength="6" required />
      <select bind:value={novo.nivel} aria-label="Nível de acesso">
        {#each INTERNAL_ROLES as r}<option value={r}>{ROLE_LABEL[r]}</option>{/each}
      </select>
      <button class="primary" type="submit" disabled={criando}>
        {criando ? 'Criando…' : 'Cadastrar'}
      </button>
      {#if okMsg}<p class="ok">{okMsg}</p>{/if}
    </form>

    <h3>Usuários</h3>
    {#each users as u (u.id)}
      <button class="user" class:active={selected?.id === u.id} onclick={() => selecionar(u)}>
        <span class="nome">{u.nome || u.email}</span>
        <span class="email">{u.email}</span>
        <span class="role" class:admin={u.role === 'admin'}>{u.role}</span>
      </button>
    {:else}
      <p class="dim">Nenhum usuário.</p>
    {/each}
  </aside>

  <section>
    {#if error}<p class="err">{error}</p>{/if}
    {#if !selected}
      <p class="dim">Selecione um usuário para gerenciar.</p>
    {:else}
      <div class="userhead">
        <div>
          <h3>{selected.nome}</h3>
          <span class="dim">{selected.email}</span>
        </div>
        <label class="nivel">
          <span>Nível de acesso</span>
          <select value={selected.role} onchange={mudarNivel}>
            {#each INTERNAL_ROLES as r}<option value={r}>{ROLE_LABEL[r]}</option>{/each}
            {#if !INTERNAL_ROLES.includes(selected.role as never)}
              <option value={selected.role}>{ROLE_LABEL[selected.role] ?? selected.role}</option>
            {/if}
          </select>
        </label>
      </div>

      {#if selected.role === 'admin'}
        <p class="dim note">
          <strong>Administrador</strong> vê e faz tudo em todos os módulos — as
          permissões por módulo abaixo não se aplicam.
        </p>
      {:else}
        <h4>Permissões por módulo</h4>
        <table>
        <thead>
          <tr>
            <th>Módulo</th>
            {#each ACOES as a}<th class="c">{a.label}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each MODULES as m (m.id)}
            <tr>
              <td>{m.label}</td>
              {#each ACOES as a}
                <td class="c">
                  <input
                    type="checkbox"
                    checked={has(m.id, a.key)}
                    disabled={saving === `${m.id}:${a.key}`}
                    onchange={(e) => toggle(m.id, a.key, e.currentTarget.checked)}
                  />
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
        <p class="dim hint">
          "Acessar" controla se o módulo aparece no launcher do usuário. As
          demais controlam as ações CRUD dentro do módulo.
        </p>
      {/if}
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 1.2rem;
    align-items: start;
  }
  aside,
  section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    padding: 1.1rem;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  aside h3,
  section h3 {
    margin: 0 0 0.7rem;
    font-size: 0.95rem;
  }
  .user {
    display: grid;
    text-align: left;
    gap: 0.12rem;
    padding: 0.55rem 0.7rem;
    background: var(--surface-2);
  }
  .user.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(39, 102, 201, 0.15);
  }
  .user .nome {
    font-weight: 600;
  }
  .user .email {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .user .role {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .user .role.admin {
    color: var(--accent);
  }
  .c {
    text-align: center;
  }
  table th:first-child,
  table td:first-child {
    font-weight: 500;
  }
  input[type='checkbox'] {
    width: 17px;
    height: 17px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .cadastro {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-bottom: 1.1rem;
    padding-bottom: 1.1rem;
    border-bottom: 1px solid var(--border);
  }
  .err {
    color: var(--danger);
  }
  .ok {
    color: var(--ok);
    font-size: 0.8rem;
    margin: 0;
  }
  .dim {
    color: var(--text-dim);
  }
  .hint {
    font-size: 0.8rem;
    margin-top: 0.9rem;
  }
  .userhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .userhead h3 {
    margin: 0;
  }
  .nivel {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .note {
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 0.8rem 1rem;
  }
  section h4 {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
  }
</style>
