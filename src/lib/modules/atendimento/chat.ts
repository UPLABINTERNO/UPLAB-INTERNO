// Camada de dados do Atendimento (Supabase dedicado). Consulta de histórico —
// sem chat ao vivo. Identidade do cliente = TELEFONE.
import { supabase } from '$core/supabase';

export interface Telefone { telefone: string; nome: string | null; }
export interface Cliente {
  chat_id: string;
  nome: string | null;
  nome_cliente: string | null; // nome do cadastro (ERP)
  cidade: string | null;
  vendedor: string | null;
  carteira: string | null;
  origem: string | null;
  is_grupo: boolean;
  codigo_loja: string | null;
  atendente_uuid: string | null;
  total_mensagens: number;
  total_conversas: number;
  is_closed: boolean;
  ultima_msg_at: string | null;
  ultima_msg_texto: string | null;
  telefones: Telefone[];
}

/** Nome a exibir: cadastro (ERP) tem prioridade sobre o nome do WhatsApp. */
export const nomeExib = (c: Cliente | undefined | null): string =>
  c?.nome_cliente || c?.nome || c?.chat_id || '?';
export interface Atendimento {
  conversation_id: string;
  chat_id: string;
  dia: string | null;
  inicio: string | null;
  fim: string | null;
  atendente_uuid: string | null;
  atendente_nome: string | null;
  total_msgs: number;
  encerrada: boolean;
  resumo: string | null;
  ord: number | null;
}
export interface MensagemHist {
  id: number;
  chat_id: string;
  classe: 'cliente' | 'atendente' | 'robo' | 'sistema';
  autor_nome: string | null;
  texto: string;
  tipo: string;
  ts: string;
}
export interface Atendente { uuid: string; nome: string | null; email: string | null; is_ativo: boolean; }

const CLI_COLS =
  'chat_id,nome,nome_cliente,cidade,vendedor,carteira,origem,is_grupo,codigo_loja,atendente_uuid,total_mensagens,total_conversas,is_closed,ultima_msg_at,ultima_msg_texto,telefones';

/** Todos os atendimentos (1 por conversa), p/ agrupar por data e métricas.
 *  Pagina em blocos porque o PostgREST corta em 1000 linhas por requisição. */
export async function listarAtendimentos(): Promise<Atendimento[]> {
  const PAGE = 1000;
  const todos: Atendimento[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('uplab_chat_atendimentos')
      .select('conversation_id,chat_id,dia,inicio,fim,atendente_uuid,atendente_nome,total_msgs,encerrada,resumo,ord')
      .order('ord', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as Atendimento[]));
    if (!data || data.length < PAGE) break;
  }
  return todos;
}

/** Mapa chat_id -> dados do cliente (nome, código, telefone) p/ exibição. */
export async function mapaClientes(): Promise<Record<string, Cliente>> {
  const { data, error } = await supabase.from('uplab_chat_grupos').select(CLI_COLS).limit(2000);
  if (error) throw error;
  const map: Record<string, Cliente> = {};
  for (const c of (data ?? []) as Cliente[]) map[c.chat_id] = c;
  return map;
}

/** Busca clientes por nome/telefone/código (campo `busca`). */
export async function buscarClientes(termo: string, limit = 50): Promise<Cliente[]> {
  const t = termo.trim();
  if (!t) return [];
  const dig = t.replace(/\D/g, '');
  const q = supabase.from('uplab_chat_grupos').select(CLI_COLS);
  const { data, error } = await (dig.length >= 3 ? q.ilike('busca', `%${dig}%`) : q.ilike('busca', `%${t}%`))
    .order('ultima_msg_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Cliente[];
}

export function telefonePrincipal(c: Cliente): string {
  return c.telefones?.[0]?.telefone ?? c.chat_id;
}

async function chatIdsDoTelefone(telefone: string, atual: string): Promise<string[]> {
  const tel = telefone.replace(/\D/g, '');
  const ids = new Set<string>([atual]);
  if (tel.length >= 8) {
    const { data } = await supabase.from('uplab_chat_grupos').select('chat_id').or(`chat_id.eq.${tel},busca.ilike.%${tel}%`).limit(50);
    for (const g of data ?? []) ids.add(g.chat_id);
  }
  return [...ids];
}

/** Thread UNIFICADA: tudo que foi falado com o cliente (por telefone). */
export async function mensagensUnificadas(c: Cliente): Promise<MensagemHist[]> {
  const ids = await chatIdsDoTelefone(telefonePrincipal(c), c.chat_id);
  const PAGE = 1000;
  const todas: MensagemHist[] = [];
  for (let from = 0; from < 6000; from += PAGE) {
    const { data, error } = await supabase
      .from('uplab_chat_mensagens')
      .select('id,chat_id,classe,autor_nome,texto,tipo,ts,ord')
      .in('chat_id', ids)
      .order('ord', { ascending: true, nullsFirst: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    todas.push(...((data ?? []) as MensagemHist[]));
    if (!data || data.length < PAGE) break;
  }
  return todas;
}

export async function listarAtendentes(): Promise<Atendente[]> {
  const { data, error } = await supabase.from('uplab_atendentes').select('uuid,nome,email,is_ativo').order('nome');
  if (error) throw error;
  return (data ?? []) as Atendente[];
}

export async function atualizarCliente(chatId: string, campos: Partial<Pick<Cliente, 'codigo_loja' | 'atendente_uuid' | 'nome'>>): Promise<void> {
  const { error } = await supabase.from('uplab_chat_grupos').update(campos).eq('chat_id', chatId);
  if (error) throw error;
}

export interface Usuario { id: string; nome: string; email: string | null; role: string; }
/** Usuários internos (profiles, exceto clientes externos). */
export async function listarUsuariosInternos(): Promise<Usuario[]> {
  const { data, error } = await supabase.from('profiles').select('id,nome,email,role').neq('role', 'cliente').order('nome');
  if (error) throw error;
  return (data ?? []) as Usuario[];
}

// --- Vínculo usuário interno -> atendente (métrica individual) ---
export async function meuAtendente(userId: string): Promise<string | null> {
  const { data } = await supabase.from('uplab_usuario_atendente').select('atendente_uuid').eq('user_id', userId).maybeSingle();
  return data?.atendente_uuid ?? null;
}
export async function listarVinculos(): Promise<Record<string, string>> {
  const { data } = await supabase.from('uplab_usuario_atendente').select('user_id,atendente_uuid');
  const map: Record<string, string> = {};
  for (const v of data ?? []) map[v.user_id] = v.atendente_uuid;
  return map;
}
export async function salvarVinculo(userId: string, atendenteUuid: string): Promise<void> {
  const { error } = await supabase.from('uplab_usuario_atendente').upsert({ user_id: userId, atendente_uuid: atendenteUuid, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
