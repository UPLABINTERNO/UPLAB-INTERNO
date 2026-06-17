import type { Component } from 'svelte';

/**
 * Registro de módulos do frontend.
 *
 * Cada módulo é carregado SOB DEMANDA (lazy) via import dinâmico — o código do
 * módulo só entra no bundle quando o usuário o abre. Para adicionar um módulo,
 * crie `src/lib/modules/<id>/Module.svelte` e registre o id aqui.
 *
 * A chave deve bater com o `id` do catálogo (`$core/modules`).
 */
// A rota passa `moduleId`; o módulo pode usá-lo ou ignorá-lo. Tipo permissivo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModuleComponent = Component<any>;
type Loader = () => Promise<{ default: ModuleComponent }>;

const loaders: Record<string, Loader> = {
  financeiro: () => import('$modules/financeiro/Module.svelte'),

  atendimento: () => import('$modules/atendimento/Module.svelte'),

  // Demais módulos usam o stub até serem implementados (mesmo padrão do Financeiro).
  comercial: () => import('$modules/_stub/Module.svelte'),
  campanhas: () => import('$modules/_stub/Module.svelte'),
  tickets_clientes: () => import('$modules/_stub/Module.svelte'),
  tickets_internos: () => import('$modules/_stub/Module.svelte'),
  chat: () => import('$modules/chat/Module.svelte'),
  api: () => import('$modules/_stub/Module.svelte'),
  banco_dados: () => import('$modules/_stub/Module.svelte'),
  logs: () => import('$modules/_stub/Module.svelte'),
  administrador: () => import('$modules/administrador/Module.svelte'),
  permissoes: () => import('$modules/permissoes/Module.svelte')
};

export function hasModule(id: string): boolean {
  return id in loaders;
}

export function loadModule(id: string): Loader | undefined {
  return loaders[id];
}
