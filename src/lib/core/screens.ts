/**
 * Registro de TELAS por módulo, para permissões granulares (papel × módulo × tela).
 * Permissão = "<modulo>" (acesso ao módulo) ou "<modulo>:<tela>" (acesso à tela).
 * Módulos sem telas listadas têm acesso controlado só no nível do módulo.
 */
export interface ScreenDef {
  id: string;
  label: string;
}

export const MODULE_SCREENS: Record<string, ScreenDef[]> = {
  atendimento: [
    { id: 'atendimentos', label: 'Conversas' },
    { id: 'metricas', label: 'Métricas' },
    { id: 'gerencial', label: 'Gerencial' }
  ]
  // Adicione telas de outros módulos aqui conforme eles passarem a usar canScreen().
};

export function screensOf(moduleId: string): ScreenDef[] {
  return MODULE_SCREENS[moduleId] ?? [];
}
