import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Autenticação global (Supabase Auth) + perfil/permissões.
 *
 * Um único login dá acesso ao launcher e a todas as janelas de módulo.
 * O Supabase deste projeto é COMPARTILHADO com o sistema existente, então o
 * perfil vem da tabela `profiles` real (colunas `nome`, `role`, ...).
 * As permissões por módulo vêm da tabela nova `uplab_user_permissions`.
 * Quem tem role `admin` vê/faz tudo (gate de UI). A autoridade real é a RLS.
 */

export interface Profile {
  id: string;
  nome: string;
  email: string | null;
  role: string; // 'admin' | 'cliente' | ...
}

type Action = 'access' | 'create' | 'read' | 'update' | 'delete';

let session = $state<Session | null>(null);
let profile = $state<Profile | null>(null);
let permissions = $state<string[]>([]); // CRUD por usuário (uplab_user_permissions)
let rolePermissions = $state<string[]>([]); // acesso a módulo/tela por papel (uplab_role_permissions)
let ready = $state(false);
let profileLoaded = $state(false);

export async function initAuth(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (session) await loadIdentity();
  supabase.auth.onAuthStateChange((_event, s) => {
    session = s;
    if (s) void loadIdentity();
    else {
      profile = null;
      permissions = [];
      profileLoaded = false;
    }
  });
  ready = true;
}

async function loadIdentity(): Promise<void> {
  if (!session) return;
  profileLoaded = false;
  const { data: prof } = await supabase
    .from('profiles')
    .select('id, nome, email, role')
    .eq('id', session.user.id)
    .single();
  profile = (prof as Profile) ?? null;

  const [{ data: perms }, { data: rperms }] = await Promise.all([
    supabase.from('uplab_user_permissions').select('permission').eq('user_id', session.user.id),
    profile
      ? supabase.from('uplab_role_permissions').select('permission').eq('role', profile.role)
      : Promise.resolve({ data: [] as { permission: string }[] })
  ]);
  permissions = (perms ?? []).map((r: { permission: string }) => r.permission);
  rolePermissions = (rperms ?? []).map((r: { permission: string }) => r.permission);
  profileLoaded = true;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// --- Níveis internos (hierarquia). 'cliente' (externo) fica fora → nível 0. ---
export const ROLE_LEVELS: Record<string, number> = {
  funcionario: 1,
  gestor: 2,
  diretoria: 3,
  admin: 4
};
/** Papéis internos selecionáveis no Administrador, do menor ao maior. */
export const INTERNAL_ROLES = ['funcionario', 'gestor', 'diretoria', 'admin'] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  funcionario: 'Funcionário',
  gestor: 'Gestor',
  diretoria: 'Diretoria',
  admin: 'Administrador',
  cliente: 'Cliente (externo)'
};

// --- Getters reativos (lidos dentro de componentes mantêm reatividade) ---
export const authReady = () => ready;
/** True quando não há sessão, ou quando a sessão já teve seu profile carregado. */
export const identityReady = () => !session || profileLoaded;
export const currentSession = () => session;
export const currentProfile = () => profile;
export const currentRole = () => profile?.role ?? null;
export const currentLevel = () => (profile ? (ROLE_LEVELS[profile.role] ?? 0) : 0);
export const isAdmin = () => profile?.role === 'admin';
/** Usuário interno = tem um dos papéis da hierarquia (nível >= 1). */
export const isInternal = () => currentLevel() >= 1;
export const userLabel = () => profile?.nome || session?.user.email || '';

/** O usuário tem pelo menos o nível informado? (ex.: hasLevel('gestor')). */
export function hasLevel(min: InternalRole | number): boolean {
  const need = typeof min === 'number' ? min : (ROLE_LEVELS[min] ?? 99);
  return currentLevel() >= need;
}

// --- Acesso a módulo/tela por PAPEL (uplab_role_permissions). Admin vê tudo. ---

/** O papel do usuário acessa o módulo (ou alguma tela dele)? */
export function canModule(moduleId: string): boolean {
  if (profile?.role === 'admin') return true;
  return rolePermissions.some((p) => p === moduleId || p.startsWith(`${moduleId}:`));
}

/** O papel do usuário acessa uma tela específica do módulo? */
export function canScreen(moduleId: string, screenId: string): boolean {
  if (profile?.role === 'admin') return true;
  return rolePermissions.includes(`${moduleId}:${screenId}`);
}

/** Permissões de papel já carregadas (para a tela de Permissões refletir mudanças). */
export const currentRolePermissions = () => rolePermissions;

/** Checagem de permissão de UI. Admin vê tudo; demais conforme uplab_user_permissions. */
export function can(moduleId: string, action: Action): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return granted(permissions, `${moduleId}:${action}`);
}

/** Curingas: `*:*`, `<mod>:*`, `*:<acao>`. */
export function granted(perms: string[], needed: string): boolean {
  const [nm, na] = split(needed);
  return perms.some((p) => {
    const [m, a] = split(p);
    return (m === '*' || m === nm) && (a === '*' || a === na);
  });
}

function split(perm: string): [string, string] {
  const i = perm.indexOf(':');
  return i === -1 ? [perm, '*'] : [perm.slice(0, i), perm.slice(i + 1)];
}
