import { supabase } from './supabase';
import { MODULES } from './modules';

/**
 * Ativação de módulos. O padrão vem do catálogo (`pronto`); o admin pode
 * sobrescrever por módulo na tabela `uplab_modulos`.
 */
export async function carregarModulosAtivos(): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  try {
    const { data } = await supabase.from('uplab_modulos').select('id, ativo');
    for (const r of data ?? []) map[r.id] = r.ativo;
  } catch {
    /* sem rede: cai no padrão */
  }
  return map;
}

/** Módulo está ativo? Override do banco tem prioridade; senão usa `pronto`. */
export function moduloAtivo(id: string, overrides: Record<string, boolean>): boolean {
  if (id in overrides) return overrides[id];
  return MODULES.find((m) => m.id === id)?.pronto ?? false;
}

export async function setModuloAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from('uplab_modulos')
    .upsert({ id, ativo, atualizado_em: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
}
