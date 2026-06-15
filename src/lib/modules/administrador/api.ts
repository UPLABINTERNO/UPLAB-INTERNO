import { supabase } from '$core/supabase';
import { INTERNAL_ROLES } from '$core/auth.svelte';

export interface UserRow {
  id: string;
  nome: string;
  email: string | null;
  role: string;
}

/**
 * Lista apenas os usuários INTERNOS (admin/diretoria/gestor/funcionário).
 * A tabela `profiles` é compartilhada e contém também os clientes do WhatsApp,
 * que NÃO acessam este sistema interno e ficam fora desta lista.
 */
export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, role')
    .in('role', [...INTERNAL_ROLES])
    .order('nome');
  if (error) throw error;
  return data as UserRow[];
}

/** Define o nível (role) de um usuário. Requer policy de admin update em profiles. */
export async function setRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

/** Permissões atuais de um usuário (lista de "<modulo>:<acao>"). */
export async function listUserPermissions(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('uplab_user_permissions')
    .select('permission')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.permission as string);
}

/** Concede uma permissão (idempotente). */
export async function grant(userId: string, permission: string): Promise<void> {
  const { error } = await supabase
    .from('uplab_user_permissions')
    .upsert({ user_id: userId, permission }, { onConflict: 'user_id,permission' });
  if (error) throw error;
}

/** Revoga uma permissão. */
export async function revoke(userId: string, permission: string): Promise<void> {
  const { error } = await supabase
    .from('uplab_user_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('permission', permission);
  if (error) throw error;
}

/**
 * Cadastra um usuário via Edge Function `admin-create-user` (a service_role
 * fica no servidor). Requer que o chamador seja admin.
 */
export async function createUser(email: string, password: string, nome: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, nome }
  });
  if (error) {
    // FunctionsHttpError expõe a resposta em `context`; extrai a mensagem real.
    let detalhe = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        if (j?.error) detalhe = j.error;
      } catch {
        /* mantém a mensagem padrão */
      }
    }
    throw new Error(detalhe);
  }
  return (data as { id: string }).id;
}
