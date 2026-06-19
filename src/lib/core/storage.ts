import { supabase } from './supabase';

/**
 * Helpers de anexo no Storage privado `chat-anexos` (download via signed URL).
 * Compartilhado entre módulos (chat, tickets, …). Limite 25 MB (alinhado ao
 * file_size_limit do bucket).
 */
export interface AnexoMeta { path: string; nome: string; mime: string; tam: number; }

const BUCKET = 'chat-anexos';
const MAX_ANEXO = 25 * 1024 * 1024;

export async function uploadAnexo(file: File, scope: string): Promise<AnexoMeta> {
  if (file.size > MAX_ANEXO) throw new Error('Arquivo acima do limite de 25 MB.');
  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
  const path = `${scope}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return { path, nome: file.name, mime: file.type || 'application/octet-stream', tam: file.size };
}

export async function urlsAnexos(paths: string[], expiraSeg = 7200): Promise<Record<string, string>> {
  const limpos = [...new Set(paths.filter(Boolean))];
  if (!limpos.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(limpos, expiraSeg);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

export const fmtTam = (b: number | null): string =>
  !b ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
