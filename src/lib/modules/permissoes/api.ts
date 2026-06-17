import { supabase } from '$core/supabase';

/** Papéis gerenciáveis aqui (admin é curinga e não entra na edição). */
export const ROLES_GERENCIAVEIS = ['funcionario', 'gestor', 'diretoria'] as const;

/** Permissões atuais de um papel (lista de "<modulo>" e "<modulo>:<tela>"). */
export async function listRolePerms(role: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('uplab_role_permissions')
    .select('permission')
    .eq('role', role);
  if (error) throw error;
  return (data ?? []).map((r) => r.permission as string);
}

export async function grantRolePerm(role: string, permission: string): Promise<void> {
  const { error } = await supabase
    .from('uplab_role_permissions')
    .upsert({ role, permission }, { onConflict: 'role,permission' });
  if (error) throw error;
}

export async function revokeRolePerm(role: string, permission: string): Promise<void> {
  const { error } = await supabase
    .from('uplab_role_permissions')
    .delete()
    .eq('role', role)
    .eq('permission', permission);
  if (error) throw error;
}
