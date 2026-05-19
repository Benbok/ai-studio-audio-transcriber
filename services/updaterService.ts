import type { UpdaterState } from '../types';

const FALLBACK_UPDATER_STATE: UpdaterState = {
  status: 'disabled',
  message: 'Updater API is not available in this environment.',
  progressPercent: 0,
  availableVersion: null,
  currentVersion: 'unknown',
};

function getElectronAPI() {
  return window.electronAPI;
}

export async function getUpdaterState(): Promise<UpdaterState> {
  const api = getElectronAPI();
  if (!api?.getUpdaterState) {
    return FALLBACK_UPDATER_STATE;
  }

  try {
    return await api.getUpdaterState();
  } catch (error) {
    return {
      ...FALLBACK_UPDATER_STATE,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to read updater state.',
    };
  }
}

export async function checkForUpdates(): Promise<UpdaterState> {
  const api = getElectronAPI();
  if (!api?.checkForUpdates) {
    return FALLBACK_UPDATER_STATE;
  }

  try {
    return await api.checkForUpdates();
  } catch (error) {
    return {
      ...FALLBACK_UPDATER_STATE,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to check for updates.',
    };
  }
}

export async function downloadUpdate(): Promise<UpdaterState> {
  const api = getElectronAPI();
  if (!api?.downloadUpdate) {
    return FALLBACK_UPDATER_STATE;
  }

  try {
    return await api.downloadUpdate();
  } catch (error) {
    return {
      ...FALLBACK_UPDATER_STATE,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to download update.',
    };
  }
}

export async function quitAndInstallUpdate(): Promise<void> {
  const api = getElectronAPI();
  if (!api?.quitAndInstallUpdate) {
    return;
  }

  await api.quitAndInstallUpdate();
}

export function subscribeUpdaterState(
  callback: (state: UpdaterState) => void,
): () => void {
  const api = getElectronAPI();
  if (!api?.onUpdaterStateChange) {
    callback(FALLBACK_UPDATER_STATE);
    return () => {};
  }

  return api.onUpdaterStateChange(callback);
}
