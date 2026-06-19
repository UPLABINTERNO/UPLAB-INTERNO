import { supabase } from '$core/supabase';
import { INTERNAL_ROLES } from '$core/auth.svelte';
import type { AnexoMeta } from '$core/storage';

export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente';
export type StatusTicket = 'aberto' | 'andamento' | 'resolvido' | 'fechado';

interface AnexoCols { anexo_path: string | null; anexo_nome: string | null; anexo_mime: string | null; anexo_tam: number | null; }

export interface Topico {
  id: string; nome: string; descricao: string | null;
  sla_horas: number; prioridade: Prioridade; ativo: boolean; ordem: number;
}
export interface Ticket extends AnexoCols {
  id: string; titulo: string; descricao: string | null;
  prioridade: Prioridade; status: StatusTicket;
  topico_id: string | null; topico_nome: string | null; sla_horas: number | null; prazo: string | null;
  solicitante_id: string; solicitante_nome: string | null;
  responsavel_id: string | null; responsavel_nome: string | null;
  created_at: string; updated_at: string; resolvido_em: string | null;
}
export interface TicketComentario extends AnexoCols {
  id: number; ticket_id: string; user_id: string | null; autor_nome: string | null;
  texto: string | null; created_at: string;
}
export interface Usuario { id: string; nome: string; email: string | null; role: string; }

export interface TicketInput {
  titulo: string; descricao: string;
  topico_id: string | null; topico_nome: string | null;
  prioridade: Prioridade; sla_horas: number; prazo: string;
  responsavel_id: string | null; responsavel_nome: string | null;
}

function anexoCols(a?: AnexoMeta) {
  return a ? { anexo_path: a.path, anexo_nome: a.nome, anexo_mime: a.mime, anexo_tam: a.tam } : {};
}

export async function listUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('profiles').select('id,nome,email,role').in('role', [...INTERNAL_ROLES]).order('nome');
  if (error) throw error;
  return (data ?? []) as Usuario[];
}

// ---- Tópicos (catálogo; gestor+ gerencia, RLS garante) ----------------------
export async function listTopicos(somenteAtivos = false): Promise<Topico[]> {
  let qb = supabase.from('uplab_ticket_topicos').select('*').order('ordem').order('nome');
  if (somenteAtivos) qb = qb.eq('ativo', true);
  const { data, error } = await qb;
  if (error) throw error;
  return (data ?? []) as Topico[];
}

export async function criarTopico(t: Pick<Topico, 'nome' | 'descricao' | 'sla_horas' | 'prioridade'>): Promise<Topico> {
  const { data, error } = await supabase.from('uplab_ticket_topicos')
    .insert({ nome: t.nome, descricao: t.descricao || null, sla_horas: t.sla_horas, prioridade: t.prioridade })
    .select('*').single();
  if (error) throw error;
  return data as Topico;
}

export async function editarTopico(id: string, patch: Partial<Topico>): Promise<void> {
  const { error } = await supabase.from('uplab_ticket_topicos').update(patch).eq('id', id);
  if (error) throw error;
}

export async function excluirTopico(id: string): Promise<void> {
  const { error } = await supabase.from('uplab_ticket_topicos').delete().eq('id', id);
  if (error) throw error;
}

/** Assuntos livres (sem tópico) que se repetem — candidatos a virar tópico fixo. */
export async function assuntosFrequentes(min = 2): Promise<{ titulo: string; n: number }[]> {
  const { data, error } = await supabase.from('uplab_tickets').select('titulo').is('topico_id', null).limit(500);
  if (error) throw error;
  const map = new Map<string, { titulo: string; n: number }>();
  for (const r of data ?? []) {
    const norm = (r.titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    if (!norm) continue;
    const e = map.get(norm) ?? { titulo: r.titulo as string, n: 0 };
    e.n++; map.set(norm, e);
  }
  return [...map.values()].filter((x) => x.n >= min).sort((a, b) => b.n - a.n);
}

// ---- Tickets ----------------------------------------------------------------
export async function listTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('uplab_tickets').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as Ticket[];
}

export async function criarTicket(
  input: TicketInput, solicitante: { id: string; nome: string }, anexo?: AnexoMeta
): Promise<Ticket> {
  const row: Record<string, unknown> = {
    titulo: input.titulo, descricao: input.descricao || null,
    prioridade: input.prioridade, status: 'aberto' as StatusTicket,
    topico_id: input.topico_id, topico_nome: input.topico_nome,
    sla_horas: input.sla_horas, prazo: input.prazo,
    solicitante_id: solicitante.id, solicitante_nome: solicitante.nome,
    responsavel_id: input.responsavel_id, responsavel_nome: input.responsavel_nome,
    ...anexoCols(anexo)
  };
  const { data, error } = await supabase.from('uplab_tickets').insert(row).select('*').single();
  if (error) throw error;
  return data as Ticket;
}

export async function atualizarTicket(
  id: string, patch: Partial<Pick<Ticket, 'titulo' | 'descricao' | 'prioridade' | 'status' | 'responsavel_id' | 'responsavel_nome'>>
): Promise<Ticket> {
  const upd: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.status) upd.resolvido_em = patch.status === 'resolvido' ? new Date().toISOString() : null;
  const { data, error } = await supabase.from('uplab_tickets').update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Ticket;
}

export async function excluirTicket(id: string): Promise<void> {
  const { error } = await supabase.from('uplab_tickets').delete().eq('id', id);
  if (error) throw error;
}

export async function listComentarios(ticketId: string): Promise<TicketComentario[]> {
  const { data, error } = await supabase
    .from('uplab_ticket_comentarios').select('*').eq('ticket_id', ticketId)
    .order('created_at', { ascending: true }).limit(300);
  if (error) throw error;
  return (data ?? []) as TicketComentario[];
}

export async function addComentario(
  ticketId: string, autor: { id: string; nome: string }, texto: string, anexo?: AnexoMeta
): Promise<TicketComentario> {
  const row: Record<string, unknown> = { ticket_id: ticketId, user_id: autor.id, autor_nome: autor.nome, texto: texto || null, ...anexoCols(anexo) };
  const { data, error } = await supabase.from('uplab_ticket_comentarios').insert(row).select('*').single();
  if (error) throw error;
  return data as TicketComentario;
}
