import { supabase } from '$core/supabase';
import { painelGet } from '$core/painel';

// --- Conversas (lista recente) ---
export interface Conversa {
  conversation_id: string;
  chat_id: string;
  contact_name: string | null;
  department: string | null;
  attendant_name: string | null;
  labels: { nome?: string; color?: string }[];
  is_closed: boolean;
  last_message_at: string | null;
  updated_at: string;
}

/** Lista as conversas recentes (organizadas) via API do painel (Vercel). */
export async function listConversas(): Promise<Conversa[]> {
  const { itens } = await painelGet<{ itens: Partial<Conversa>[] }>('/api/conversas');
  return (itens ?? []).map((c) => ({
    conversation_id: c.conversation_id ?? '',
    chat_id: c.chat_id ?? '',
    contact_name: c.contact_name ?? null,
    department: c.department ?? null,
    attendant_name: c.attendant_name ?? null,
    labels: c.labels ?? [],
    is_closed: c.is_closed ?? false,
    last_message_at: c.last_message_at ?? null,
    updated_at: c.updated_at ?? c.last_message_at ?? ''
  }));
}

// --- Apelidos editáveis (sobrepõem o nome do ZapResponder) ---
export async function listApelidos(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('uplab_contatos').select('chat_id, apelido');
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[r.chat_id] = r.apelido;
  return map;
}

export async function salvarApelido(chatId: string, apelido: string): Promise<void> {
  const nome = apelido.trim();
  if (!nome) {
    const { error } = await supabase.from('uplab_contatos').delete().eq('chat_id', chatId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('uplab_contatos')
    .upsert({ chat_id: chatId, apelido: nome, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw error;
}

/** Limpa o cache de conversas/mensagens do webhook (somente admin via RLS). */
export async function limparConversasCache(): Promise<void> {
  const e1 = await supabase.from('uplab_mensagens').delete().gte('created_at', '1900-01-01');
  if (e1.error) throw e1.error;
  const e2 = await supabase.from('uplab_conversas').delete().gte('created_at', '1900-01-01');
  if (e2.error) throw e2.error;
}

// --- Histórico AO VIVO via API do painel (ZapResponder por trás) ---
export type ClasseMsg = 'cliente' | 'atendente' | 'sistema';
export interface ZapMensagem {
  id: string;
  texto: string;
  classe: ClasseMsg;
  quem: string;
  ts: string;
}
export interface ZapConversa {
  id: string;
  chat_id: string;
  contato: string | null;
  is_fechado: boolean;
  status: string | null;
  atendente_nome: string | null;
  qtd_conversas: number;
  count: number;
}
export interface ZapResult {
  conversa: ZapConversa | null;
  mensagens: ZapMensagem[];
}

/** Busca o histórico do cliente (ZapResponder ao vivo) via API do painel. */
export async function buscarConversaZap(phone: string): Promise<ZapResult> {
  return painelGet<ZapResult>(`/api/conversa?phone=${encodeURIComponent(phone)}`);
}

// --- Dashboard do dia ---
export interface DashboardDia {
  clientes_atendidos_hoje: number;
  mensagens_hoje: number;
  atendentes_hoje: number;
  conversas_abertas: number;
  conversas_encerradas_hoje: number;
  tempo_resposta_hoje_s: number | null;
}
export async function getDashboard(): Promise<DashboardDia> {
  return painelGet<DashboardDia>('/api/dashboard');
}

// --- Métricas por atendente + KPIs gerais ---
export interface Metrica {
  atendente: string;
  conversas: number;
  tempo_resposta_medio_s: number | null;
  tempo_primeira_resposta_medio_s: number | null;
  tempo_assumir_medio_s: number | null;
}
export interface Kpis {
  total_conversas: number;
  atendentes_ativos: number;
  tempo_resposta_medio_s: number | null;
  tempo_primeira_resposta_medio_s: number | null;
  tempo_assumir_medio_s: number | null;
}
export interface MetricasResult {
  kpis: Kpis;
  atendentes: Metrica[];
}

export async function getMetricas(): Promise<MetricasResult> {
  const r = await painelGet<MetricasResult>('/api/metricas');
  return {
    kpis: r.kpis ?? {
      total_conversas: 0,
      atendentes_ativos: 0,
      tempo_resposta_medio_s: null,
      tempo_primeira_resposta_medio_s: null,
      tempo_assumir_medio_s: null
    },
    atendentes: r.atendentes ?? []
  };
}
