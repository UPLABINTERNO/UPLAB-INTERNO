/** Catálogo de módulos (frontend). Antes vinha do Rust; agora é estático aqui. */
export interface ModuleInfo {
  id: string;
  label: string;
  description: string;
  icon: string;
  pronto: boolean; // false = em desenvolvimento (desativado por padrão)
}

export const MODULES: ModuleInfo[] = [
  { id: 'atendimento', label: 'Atendimento', description: 'Atendimento ao cliente', icon: 'H', pronto: true },
  { id: 'comercial', label: 'Comercial', description: 'Vendas e propostas', icon: 'B', pronto: false },
  { id: 'financeiro', label: 'Financeiro', description: 'Lançamentos e fluxo de caixa', icon: 'W', pronto: true },
  { id: 'campanhas', label: 'Campanhas', description: 'Campanhas comerciais', icon: 'M', pronto: false },
  { id: 'tickets_clientes', label: 'Tickets Clientes', description: 'Chamados de clientes', icon: 'T', pronto: false },
  { id: 'tickets_internos', label: 'Tickets Internos', description: 'Chamados internos', icon: 'T', pronto: true },
  { id: 'chat', label: 'Chat Interno', description: 'Mensagens entre a equipe', icon: 'C', pronto: true },
  { id: 'api', label: 'Integrações/API', description: 'Configuração de integrações', icon: 'P', pronto: false },
  { id: 'banco_dados', label: 'Banco de Dados', description: 'Administração de dados', icon: 'D', pronto: false },
  { id: 'logs', label: 'Logs', description: 'Auditoria e logs do sistema', icon: 'L', pronto: false },
  { id: 'administrador', label: 'Administrador', description: 'Usuários e níveis', icon: 'S', pronto: true },
  { id: 'permissoes', label: 'Permissões', description: 'Acessos por papel e tela', icon: 'K', pronto: true }
];

export function findModule(id: string): ModuleInfo | undefined {
  return MODULES.find((m) => m.id === id);
}

/** Cor de identidade por módulo (paleta fria da marca + apoios). Dá presença
 * e tira a cara de "tudo igual": cada módulo tem seu tom no badge do ícone. */
export const MODULE_COLORS: Record<string, string> = {
  atendimento: '#2766c9',
  comercial: '#0d9488',
  financeiro: '#16a34a',
  campanhas: '#6366f1',
  tickets_clientes: '#2f8fd6',
  tickets_internos: '#0891b2',
  chat: '#4f6ef0',
  api: '#7c3aed',
  banco_dados: '#0e7490',
  logs: '#64748b',
  administrador: '#1b4f9c',
  permissoes: '#0ea5b7'
};

export const moduleColor = (id: string): string => MODULE_COLORS[id] ?? '#2766c9';
