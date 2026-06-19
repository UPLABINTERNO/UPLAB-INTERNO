/**
 * Cálculo de prazo em HORAS ÚTEIS (seg–sex, horário comercial 8h–18h).
 * Timezone = horário local da máquina (uso interno, Brasil).
 */
const INI = 8;   // início do expediente
const FIM = 18;  // fim do expediente

function avancaParaExpediente(d: Date): void {
  for (;;) {
    const dia = d.getDay(); // 0 dom … 6 sáb
    if (dia === 0) { d.setDate(d.getDate() + 1); d.setHours(INI, 0, 0, 0); continue; }
    if (dia === 6) { d.setDate(d.getDate() + 2); d.setHours(INI, 0, 0, 0); continue; }
    const h = d.getHours() + d.getMinutes() / 60;
    if (h < INI) { d.setHours(INI, 0, 0, 0); continue; }
    if (h >= FIM) { d.setDate(d.getDate() + 1); d.setHours(INI, 0, 0, 0); continue; }
    break;
  }
}

/** Data de vencimento = `inicio` + `horas` úteis. */
export function prazoUtil(inicio: Date, horas: number): Date {
  const d = new Date(inicio);
  let restMin = Math.max(0, Math.round(horas * 60));
  avancaParaExpediente(d);
  while (restMin > 0) {
    avancaParaExpediente(d);
    const fimDia = new Date(d); fimDia.setHours(FIM, 0, 0, 0);
    const dispMin = Math.round((fimDia.getTime() - d.getTime()) / 60000);
    if (restMin <= dispMin) { d.setTime(d.getTime() + restMin * 60000); restMin = 0; }
    else { restMin -= dispMin; d.setTime(fimDia.getTime()); }
  }
  return d;
}

export type TomPrazo = 'ok' | 'warn' | 'late' | 'done';

/** Rótulo + tom do prazo, considerando o status do ticket. */
export function statusPrazo(prazo: string | null, status: string): { label: string; tom: TomPrazo } {
  if (status === 'resolvido' || status === 'fechado') return { label: 'Concluído', tom: 'done' };
  if (!prazo) return { label: '', tom: 'ok' };
  const ms = new Date(prazo).getTime() - Date.now();
  if (ms < 0) return { label: 'Atrasado', tom: 'late' };
  const h = ms / 3_600_000;
  if (h < 9) return { label: `Vence em ${Math.max(1, Math.round(h))}h`, tom: 'warn' };
  return { label: `Vence em ${Math.round(h / 24)}d`, tom: 'ok' };
}

export const SLA_PADRAO_LIVRE = 24; // horas úteis p/ assunto livre (sem tópico)
