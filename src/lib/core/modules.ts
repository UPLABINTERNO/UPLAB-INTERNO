/** Catálogo de módulos (frontend). Antes vinha do Rust; agora é estático aqui. */
export interface ModuleInfo {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export const MODULES: ModuleInfo[] = [
  { id: 'atendimento', label: 'Atendimento', description: 'Atendimento ao cliente', icon: 'H' },
  { id: 'comercial', label: 'Comercial', description: 'Vendas e propostas', icon: 'B' },
  { id: 'financeiro', label: 'Financeiro', description: 'Lançamentos e fluxo de caixa', icon: 'W' },
  { id: 'campanhas', label: 'Campanhas', description: 'Campanhas comerciais', icon: 'M' },
  { id: 'tickets_clientes', label: 'Tickets Clientes', description: 'Chamados de clientes', icon: 'T' },
  { id: 'tickets_internos', label: 'Tickets Internos', description: 'Chamados internos', icon: 'T' },
  { id: 'chat', label: 'Chat Interno', description: 'Mensagens entre a equipe', icon: 'C' },
  { id: 'api', label: 'Integrações/API', description: 'Configuração de integrações', icon: 'P' },
  { id: 'banco_dados', label: 'Banco de Dados', description: 'Administração de dados', icon: 'D' },
  { id: 'logs', label: 'Logs', description: 'Auditoria e logs do sistema', icon: 'L' },
  { id: 'administrador', label: 'Administrador', description: 'Usuários, papéis e permissões', icon: 'S' }
];

export function findModule(id: string): ModuleInfo | undefined {
  return MODULES.find((m) => m.id === id);
}
