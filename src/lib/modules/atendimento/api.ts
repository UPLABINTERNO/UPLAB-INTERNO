import { supabase } from '$core/supabase';

/** Linha de horário de atendimento (tabela compartilhada com o robô do WhatsApp). */
export interface Horario {
  id?: string;
  departamento: string;
  dia_semana: number; // 0=domingo ... 6=sábado
  abre: string; // "HH:MM"
  fecha: string; // "HH:MM"
  ativo: boolean;
}

export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Normaliza "HH:MM:SS" → "HH:MM" para o <input type=time>. */
const hhmm = (t: string) => (t ?? '').slice(0, 5);

export async function listHorarios(): Promise<Horario[]> {
  const { data, error } = await supabase
    .from('horarios_atendimento')
    .select('id, departamento, dia_semana, abre, fecha, ativo')
    .order('departamento')
    .order('dia_semana');
  if (error) throw error;
  return (data ?? []).map((h) => ({ ...h, abre: hhmm(h.abre), fecha: hhmm(h.fecha) })) as Horario[];
}

/** Salva (upsert) as 7 linhas de um departamento. unique(departamento, dia_semana). */
export async function salvarHorarios(rows: Horario[]): Promise<void> {
  const payload = rows.map((r) => ({
    departamento: r.departamento.trim().toLowerCase(),
    dia_semana: r.dia_semana,
    abre: r.abre,
    fecha: r.fecha,
    ativo: r.ativo,
    updated_at: new Date().toISOString()
  }));
  const { error } = await supabase
    .from('horarios_atendimento')
    .upsert(payload, { onConflict: 'departamento,dia_semana' });
  if (error) throw error;
}

/** Lista de endpoints do robô (referência para copiar). */
export interface ApiRef {
  nome: string;
  metodo: string;
  url: string;
  publico: boolean;
  editavelAqui: string | null;
}

const BASE = 'https://uplab.vercel.app';

export const API_REFS: ApiRef[] = [
  {
    nome: 'Horário de atendimento',
    metodo: 'GET',
    url: `${BASE}/api/horario-atendimento?departamento=geral`,
    publico: true,
    editavelAqui: 'Sim — edite os horários nesta tela.'
  },
  {
    nome: 'Identificar telefone',
    metodo: 'GET',
    url: `${BASE}/api/buscar-telefone?telefone=$phone`,
    publico: true,
    editavelAqui: null
  },
  {
    nome: 'Roteamento do atendimento',
    metodo: 'GET',
    url: `${BASE}/api/rota/destino/satisfacao?telefone=$phone`,
    publico: true,
    editavelAqui: null
  },
  {
    nome: 'Enviar template (campanha)',
    metodo: 'GET',
    url: `${BASE}/api/enviar-template?telefone=$phone&template=campanha_do_mes_&de=novo&chave=•••`,
    publico: false,
    editavelAqui: null
  },
  {
    nome: 'Flow de cadastro / campanha',
    metodo: 'GET',
    url: `${BASE}/api/whatsapp-flow/enviar?telefone=$phone&flow=cadastro&de=novo&chave=•••`,
    publico: false,
    editavelAqui: null
  }
];
