import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Cliente Supabase compartilhado por todo o frontend.
 * Usa a ANON KEY (respeita RLS). A sessão é persistida no localStorage do
 * webview — como todas as janelas Tauri compartilham a mesma origem, o login
 * feito no launcher vale também para as janelas dos módulos.
 */
export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
