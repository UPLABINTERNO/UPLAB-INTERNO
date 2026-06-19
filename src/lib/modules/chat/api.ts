import { supabase } from '$core/supabase';
import { INTERNAL_ROLES } from '$core/auth.svelte';

export interface Setor { id: string; nome: string; descricao: string | null; cor: string | null; }
export interface Canal {
  id: string; nome: string; tipo: 'setor' | 'grupo';
  setor_id: string | null; descricao: string | null; criado_por: string | null;
}
export interface Usuario { id: string; nome: string; email: string | null; role: string; }
export interface AnexoCols {
  anexo_path: string | null; anexo_nome: string | null; anexo_mime: string | null; anexo_tam: number | null;
}
export interface CanalMsg extends AnexoCols {
  id: number; canal_id: string; user_id: string | null; autor_nome: string | null;
  texto: string; created_at: string;
}
export interface AnexoMeta { path: string; nome: string; mime: string; tam: number; }

const BUCKET = 'chat-anexos';
const MAX_ANEXO = 25 * 1024 * 1024; // 25 MB (alinhado ao file_size_limit do bucket)

/** Sobe um arquivo ao bucket privado e devolve os metadados p/ gravar na msg. */
export async function uploadAnexo(file: File, scope: string): Promise<AnexoMeta> {
  if (file.size > MAX_ANEXO) throw new Error('Arquivo acima do limite de 25 MB.');
  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
  const path = `${scope}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return { path, nome: file.name, mime: file.type || 'application/octet-stream', tam: file.size };
}

/** Gera URLs assinadas (bucket privado) para um conjunto de paths. */
export async function urlsAnexos(paths: string[], expiraSeg = 7200): Promise<Record<string, string>> {
  const limpos = [...new Set(paths.filter(Boolean))];
  if (!limpos.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(limpos, expiraSeg);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

// ---- Usuários internos ------------------------------------------------------
export async function listUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('profiles').select('id,nome,email,role')
    .in('role', [...INTERNAL_ROLES]).order('nome');
  if (error) throw error;
  return (data ?? []) as Usuario[];
}

// ---- Setores ----------------------------------------------------------------
export async function listSetores(): Promise<Setor[]> {
  const { data, error } = await supabase
    .from('uplab_setores').select('id,nome,descricao,cor').order('nome');
  if (error) throw error;
  return (data ?? []) as Setor[];
}

export async function criarSetor(nome: string, descricao = '', cor = ''): Promise<Setor> {
  const { data, error } = await supabase
    .from('uplab_setores').insert({ nome, descricao: descricao || null, cor: cor || null })
    .select('id,nome,descricao,cor').single();
  if (error) throw error;
  return data as Setor;
}

export async function editarSetor(id: string, patch: Partial<Pick<Setor, 'nome' | 'descricao' | 'cor'>>): Promise<void> {
  const { error } = await supabase.from('uplab_setores').update(patch).eq('id', id);
  if (error) throw error;
}

export async function excluirSetor(id: string): Promise<void> {
  const { error } = await supabase.from('uplab_setores').delete().eq('id', id);
  if (error) throw error;
}

/** user_ids que pertencem ao setor. */
export async function membrosSetor(setorId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('uplab_usuario_setor').select('user_id').eq('setor_id', setorId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}

/** Substitui a lista de membros do setor (diff de inserts/deletes). */
export async function setMembrosSetor(setorId: string, userIds: string[]): Promise<void> {
  const atuais = new Set(await membrosSetor(setorId));
  const novos = new Set(userIds);
  const add = [...novos].filter((u) => !atuais.has(u));
  const del = [...atuais].filter((u) => !novos.has(u));
  if (add.length) {
    const { error } = await supabase.from('uplab_usuario_setor')
      .insert(add.map((user_id) => ({ user_id, setor_id: setorId })));
    if (error) throw error;
  }
  if (del.length) {
    const { error } = await supabase.from('uplab_usuario_setor')
      .delete().eq('setor_id', setorId).in('user_id', del);
    if (error) throw error;
  }
}

/** setor_ids de um usuário. */
export async function setoresDoUsuario(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('uplab_usuario_setor').select('setor_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.setor_id as string);
}

// ---- Canais / Grupos --------------------------------------------------------
/** Canais que EU enxergo (canal de setor + grupos diretos + grupos via setor). */
export async function meusCanais(): Promise<Canal[]> {
  const { data: idsRaw, error: e1 } = await supabase.rpc('uplab_meus_canais');
  if (e1) throw e1;
  const ids = (idsRaw ?? []).map((x: unknown) =>
    typeof x === 'string' ? x : (Object.values(x as object)[0] as string)
  );
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('uplab_canais').select('id,nome,tipo,setor_id,descricao,criado_por')
    .in('id', ids).order('nome');
  if (error) throw error;
  return (data ?? []) as Canal[];
}

/** Cria um grupo manual com membros diretos e/ou setores vinculados. */
export async function criarGrupo(
  nome: string, opts: { descricao?: string; membros?: string[]; setores?: string[]; criadoPor?: string }
): Promise<Canal> {
  const { data, error } = await supabase
    .from('uplab_canais')
    .insert({ nome, tipo: 'grupo', descricao: opts.descricao || null, criado_por: opts.criadoPor ?? null })
    .select('id,nome,tipo,setor_id,descricao,criado_por').single();
  if (error) throw error;
  const canal = data as Canal;
  if (opts.membros?.length) {
    const { error: em } = await supabase.from('uplab_canal_membros')
      .insert(opts.membros.map((user_id) => ({ canal_id: canal.id, user_id })));
    if (em) throw em;
  }
  if (opts.setores?.length) {
    const { error: es } = await supabase.from('uplab_canal_setores')
      .insert(opts.setores.map((setor_id) => ({ canal_id: canal.id, setor_id })));
    if (es) throw es;
  }
  return canal;
}

export async function excluirGrupo(canalId: string): Promise<void> {
  const { error } = await supabase.from('uplab_canais').delete().eq('id', canalId).eq('tipo', 'grupo');
  if (error) throw error;
}

export async function membrosCanal(canalId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('uplab_canal_membros').select('user_id').eq('canal_id', canalId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}

export async function setoresCanal(canalId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('uplab_canal_setores').select('setor_id').eq('canal_id', canalId);
  if (error) throw error;
  return (data ?? []).map((r) => r.setor_id as string);
}

export async function setMembrosCanal(canalId: string, userIds: string[]): Promise<void> {
  const atuais = new Set(await membrosCanal(canalId));
  const novos = new Set(userIds);
  const add = [...novos].filter((u) => !atuais.has(u));
  const del = [...atuais].filter((u) => !novos.has(u));
  if (add.length) {
    const { error } = await supabase.from('uplab_canal_membros')
      .insert(add.map((user_id) => ({ canal_id: canalId, user_id })));
    if (error) throw error;
  }
  if (del.length) {
    const { error } = await supabase.from('uplab_canal_membros')
      .delete().eq('canal_id', canalId).in('user_id', del);
    if (error) throw error;
  }
}

export async function setSetoresCanal(canalId: string, setorIds: string[]): Promise<void> {
  const atuais = new Set(await setoresCanal(canalId));
  const novos = new Set(setorIds);
  const add = [...novos].filter((s) => !atuais.has(s));
  const del = [...atuais].filter((s) => !novos.has(s));
  if (add.length) {
    const { error } = await supabase.from('uplab_canal_setores')
      .insert(add.map((setor_id) => ({ canal_id: canalId, setor_id })));
    if (error) throw error;
  }
  if (del.length) {
    const { error } = await supabase.from('uplab_canal_setores')
      .delete().eq('canal_id', canalId).in('setor_id', del);
    if (error) throw error;
  }
}

// ---- Mensagens de canal -----------------------------------------------------
const MSG_COLS = 'id,canal_id,user_id,autor_nome,texto,created_at,anexo_path,anexo_nome,anexo_mime,anexo_tam';

export async function listMensagens(canalId: string): Promise<CanalMsg[]> {
  const { data, error } = await supabase
    .from('uplab_canal_mensagens')
    .select(MSG_COLS)
    .eq('canal_id', canalId).order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []) as CanalMsg[];
}

export async function enviarMensagem(
  canalId: string, userId: string, autorNome: string, texto: string, anexo?: AnexoMeta
): Promise<CanalMsg> {
  const row: Record<string, unknown> = { canal_id: canalId, user_id: userId, autor_nome: autorNome, texto };
  if (anexo) Object.assign(row, { anexo_path: anexo.path, anexo_nome: anexo.nome, anexo_mime: anexo.mime, anexo_tam: anexo.tam });
  const { data, error } = await supabase
    .from('uplab_canal_mensagens').insert(row).select(MSG_COLS).single();
  if (error) throw error;
  return data as CanalMsg;
}
