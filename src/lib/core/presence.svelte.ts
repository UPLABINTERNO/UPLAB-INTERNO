import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { currentProfile } from './auth.svelte';

/**
 * Presença da equipe: cada usuário emite um "heartbeat" periódico com seu
 * status manual (online/ausente/almoço). "offline" é DERIVADO — quando o
 * último heartbeat fica velho (sem app aberto). Propagado via Realtime.
 */
export type StatusManual = 'online' | 'ausente' | 'almoco';
export type StatusEfetivo = StatusManual | 'offline';

interface PresRow { user_id: string; status: StatusManual; last_seen: string; }

const ONLINE_MS = 45_000;     // sem heartbeat além disso => offline
const HEARTBEAT_MS = 25_000;  // emite presença a cada 25s
const TICK_MS = 15_000;       // recalcula online/offline pelo relógio

const STATUS_LABEL: Record<StatusEfetivo, string> = {
  online: 'Disponível',
  ausente: 'Ausente',
  almoco: 'Horário de almoço',
  offline: 'Offline'
};
const STATUS_COR: Record<StatusEfetivo, string> = {
  online: '#25d366',
  ausente: '#f4c20d',
  almoco: '#ff9800',
  offline: '#94a3b8'
};

let mapa = $state<Record<string, PresRow>>({});
let meuStatus = $state<StatusManual>('online');
let tick = $state(0);
let canal: RealtimeChannel | null = null;
let hb: ReturnType<typeof setInterval> | null = null;
let relogio: ReturnType<typeof setInterval> | null = null;
let iniciado = false;

async function heartbeat(): Promise<void> {
  const me = currentProfile();
  if (!me) return;
  const agora = new Date().toISOString();
  const row: PresRow & { updated_at: string } = {
    user_id: me.id, status: meuStatus, last_seen: agora, updated_at: agora
  };
  mapa[me.id] = { user_id: me.id, status: meuStatus, last_seen: agora };
  await supabase.from('uplab_presenca').upsert(row, { onConflict: 'user_id' });
}

function marcarOffline(): void {
  const me = currentProfile();
  if (!me) return;
  // best-effort ao fechar: joga last_seen pro passado p/ cair como offline já.
  void supabase.from('uplab_presenca')
    .update({ last_seen: new Date(0).toISOString() }).eq('user_id', me.id);
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void heartbeat();
}

/** Inicia a presença (idempotente). Chamar após login interno. */
export async function initPresence(): Promise<void> {
  const me = currentProfile();
  if (!me || iniciado) return;
  iniciado = true;
  meuStatus = 'online';
  await heartbeat();

  const { data } = await supabase.from('uplab_presenca').select('user_id,status,last_seen');
  for (const r of data ?? []) mapa[(r as PresRow).user_id] = r as PresRow;

  canal = supabase.channel('presenca')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'uplab_presenca' }, (p) => {
      const r = p.new as PresRow;
      if (r?.user_id) mapa[r.user_id] = r;
    }).subscribe();

  hb = setInterval(() => void heartbeat(), HEARTBEAT_MS);
  relogio = setInterval(() => (tick = tick + 1), TICK_MS);
  window.addEventListener('beforeunload', marcarOffline);
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopPresence(): void {
  if (hb) clearInterval(hb);
  if (relogio) clearInterval(relogio);
  if (canal) void supabase.removeChannel(canal);
  window.removeEventListener('beforeunload', marcarOffline);
  document.removeEventListener('visibilitychange', onVisibility);
  hb = relogio = canal = null;
  iniciado = false;
}

export async function setMeuStatus(s: StatusManual): Promise<void> {
  meuStatus = s;
  await heartbeat();
}

/** Status EFETIVO de um usuário (offline se o heartbeat estiver velho). */
export function statusDe(userId: string): StatusEfetivo {
  void tick; // reativo ao relógio
  const r = mapa[userId];
  if (!r) return 'offline';
  const fresco = Date.now() - new Date(r.last_seen).getTime() < ONLINE_MS;
  return fresco ? r.status : 'offline';
}

export const getMeuStatus = (): StatusManual => meuStatus;
export const labelStatus = (s: StatusEfetivo): string => STATUS_LABEL[s];
export const corStatus = (s: StatusEfetivo): string => STATUS_COR[s];
export const STATUS_OPCOES: StatusManual[] = ['online', 'ausente', 'almoco'];
