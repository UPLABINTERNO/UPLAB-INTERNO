import { PUBLIC_PAINEL_API_URL } from '$env/static/public';
import { supabase } from './supabase';

/**
 * Cliente da API do painel (Vercel). Envia o JWT do Supabase no Authorization;
 * a API valida e responde. Usado pela tela de Conversas (sem Edge Function).
 */
async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export async function painelGet<T>(path: string): Promise<T> {
  const r = await fetch(`${PUBLIC_PAINEL_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${await token()}` }
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || `Erro ${r.status}`);
  }
  return r.json() as Promise<T>;
}
