import { inTauri } from './windows';

/**
 * Verifica/instala atualizações via tauri-plugin-updater.
 * Baixa o `latest.json` da última release do GitHub (configurado em
 * tauri.conf > plugins.updater.endpoints) e valida a assinatura com a pubkey.
 */
export interface UpdateStatus {
  disponivel: boolean;
  versao?: string;
  notas?: string;
}

/** Checa se há atualização (não instala). */
export async function checarAtualizacao(): Promise<UpdateStatus> {
  if (!inTauri()) return { disponivel: false };
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return { disponivel: false };
  return { disponivel: true, versao: update.version, notas: update.body ?? '' };
}

/**
 * Checa, baixa, instala e reinicia o app se houver atualização.
 * `onProgress` recebe o total baixado/baixando (opcional).
 */
export async function atualizarAgora(
  onProgress?: (baixado: number, total: number | null) => void
): Promise<boolean> {
  if (!inTauri()) return false;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return false;

  let baixado = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') total = event.data.contentLength ?? null;
    else if (event.event === 'Progress') {
      baixado += event.data.chunkLength;
      onProgress?.(baixado, total);
    }
  });

  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
  return true;
}
