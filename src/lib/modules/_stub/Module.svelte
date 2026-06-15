<script lang="ts">
  import { can } from '$core/auth.svelte';

  let { moduleId }: { moduleId: string } = $props();
</script>

<div class="stub">
  <h2>Módulo em construção</h2>
  <p class="dim">
    Este módulo (<code>{moduleId}</code>) já tem janela própria e gate de
    permissão, mas ainda não tem telas. Use o <strong>Financeiro</strong> como
    template (CRUD via Supabase em <code>src/lib/modules/financeiro/</code>).
  </p>
  <ul>
    <li>Criar: <strong>{can(moduleId, 'create') ? 'sim' : 'não'}</strong></li>
    <li>Ler: <strong>{can(moduleId, 'read') ? 'sim' : 'não'}</strong></li>
    <li>Editar: <strong>{can(moduleId, 'update') ? 'sim' : 'não'}</strong></li>
    <li>Excluir: <strong>{can(moduleId, 'delete') ? 'sim' : 'não'}</strong></li>
  </ul>
</div>

<style>
  .stub {
    max-width: 560px;
  }
  .dim {
    color: var(--text-dim);
  }
  ul {
    color: var(--text-dim);
    line-height: 1.8;
  }
</style>
