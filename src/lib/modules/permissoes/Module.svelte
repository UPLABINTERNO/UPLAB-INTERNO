<script lang="ts">
  import { onMount } from 'svelte';
  import { isAdmin, ROLE_LABEL } from '$core/auth.svelte';
  import { MODULES } from '$core/modules';
  import { screensOf } from '$core/screens';
  import { ROLES_GERENCIAVEIS, listRolePerms, grantRolePerm, revokeRolePerm } from './api';

  let roleSel = $state<string>('funcionario');
  let perms = $state<Set<string>>(new Set());
  let error = $state('');
  let salvando = $state('');

  onMount(() => carregar('funcionario'));

  async function carregar(role: string) {
    roleSel = role;
    error = '';
    perms = new Set();
    try {
      perms = new Set(await listRolePerms(role));
    } catch (e) {
      error = msg(e);
    }
  }

  function has(permission: string): boolean {
    return perms.has(permission);
  }

  async function toggle(permission: string, checked: boolean) {
    salvando = permission;
    error = '';
    try {
      if (checked) {
        await grantRolePerm(roleSel, permission);
        perms.add(permission);
      } else {
        await revokeRolePerm(roleSel, permission);
        perms.delete(permission);
        // Se tirou o acesso ao módulo, remove também as telas dele.
        if (!permission.includes(':')) {
          for (const s of screensOf(permission)) {
            await revokeRolePerm(roleSel, `${permission}:${s.id}`);
            perms.delete(`${permission}:${s.id}`);
          }
        }
      }
      perms = new Set(perms);
    } catch (e) {
      error = msg(e);
    } finally {
      salvando = '';
    }
  }

  function msg(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return String(e);
  }
</script>

{#if !isAdmin()}
  <p class="dim">Esta área é restrita a administradores.</p>
{:else}
  <p class="dim intro">
    Defina, por <strong>papel</strong>, quais módulos e telas cada um acessa. Vale para todos os
    usuários daquele papel. <strong>Administrador</strong> sempre vê tudo.
  </p>

  <div class="roles">
    {#each ROLES_GERENCIAVEIS as r}
      <button class:on={roleSel === r} onclick={() => carregar(r)}>{ROLE_LABEL[r] ?? r}</button>
    {/each}
  </div>

  {#if error}<p class="err">{error}</p>{/if}

  <div class="grid">
    {#each MODULES as m (m.id)}
      {@const telas = screensOf(m.id)}
      <div class="card">
        <label class="mod">
          <input
            type="checkbox"
            checked={has(m.id)}
            disabled={salvando === m.id}
            onchange={(e) => toggle(m.id, e.currentTarget.checked)}
          />
          <span>{m.label}</span>
        </label>
        {#if telas.length && has(m.id)}
          <div class="telas">
            {#each telas as t}
              <label class="tela">
                <input
                  type="checkbox"
                  checked={has(`${m.id}:${t.id}`)}
                  disabled={salvando === `${m.id}:${t.id}`}
                  onchange={(e) => toggle(`${m.id}:${t.id}`, e.currentTarget.checked)}
                />
                <span>{t.label}</span>
              </label>
            {/each}
          </div>
        {:else if telas.length}
          <p class="aviso">Libere o módulo para escolher as telas.</p>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .intro { margin: 0 0 1rem; max-width: 720px; }
  .dim { color: var(--text-dim); }
  .err { color: var(--danger); }
  .roles { display: flex; gap: 0.5rem; margin-bottom: 1.2rem; }
  .roles button.on { background: var(--brand-grad); color: #fff; border-color: transparent; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.8rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); padding: 0.9rem 1rem; }
  .mod { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
  .telas { margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.4rem; }
  .tela { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; padding-left: 0.4rem; }
  input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
  .aviso { margin: 0.6rem 0 0; font-size: 0.78rem; color: var(--text-dim); }
</style>
