import { supabase } from '$core/supabase';

export interface Lancamento {
  id: string;
  descricao: string;
  tipo: 'receita' | 'despesa';
  valor_cents: number;
  categoria: string;
  data: string; // ISO yyyy-mm-dd
  created_at: string;
  updated_at: string;
}

export interface LancamentoInput {
  descricao: string;
  tipo: 'receita' | 'despesa';
  valor_cents: number;
  categoria: string;
  data: string;
}

const TABLE = 'financeiro';

/** CRUD do módulo Financeiro direto no Supabase (RLS aplica as permissões). */
export const financeiroApi = {
  async list(): Promise<Lancamento[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Lancamento[];
  },

  async create(input: LancamentoInput): Promise<Lancamento> {
    const { data, error } = await supabase.from(TABLE).insert(input).select().single();
    if (error) throw error;
    return data as Lancamento;
  },

  async update(id: string, input: LancamentoInput): Promise<Lancamento> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Lancamento;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
};
