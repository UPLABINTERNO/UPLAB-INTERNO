import { goto } from '$app/navigation';

/** True quando rodando dentro do Tauri (e não num browser puro de dev/teste). */
export function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Abre um módulo. Dentro do Tauri, cada módulo abre em SUA PRÓPRIA janela
 * (sem bordas, reutiliza se já estiver aberta). Fora do Tauri (browser/dev),
 * faz navegação na mesma aba — mantém o app testável sem Tauri.
 */
export async function openModule(id: string, label: string): Promise<void> {
  if (!inTauri()) {
    await goto(`/modulo/${id}`);
    return;
  }
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const winLabel = `modulo-${id}`;

  const existing = await WebviewWindow.getByLabel(winLabel);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const w = new WebviewWindow(winLabel, {
    url: `/modulo/${id}`,
    title: `UPLAB · ${label}`,
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    center: true,
    decorations: false,
    shadow: true
  });
  w.once('tauri://error', (e) => console.error('Erro ao abrir janela do módulo:', e));
}

/** Fecha a janela atual. Em browser, volta ao launcher. */
export async function closeSelf(): Promise<void> {
  if (!inTauri()) {
    await goto('/');
    return;
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
}

/** Minimiza a janela atual (no-op fora do Tauri). */
export async function minimizeSelf(): Promise<void> {
  if (!inTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().minimize();
}
