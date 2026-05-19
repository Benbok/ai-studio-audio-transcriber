export interface TranscriptionState {
  isRecording: boolean;
  isProcessing: boolean;
  text: string;
  error: string | null;
  copied: boolean;
}

export enum RecorderStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}

export type TranscriptionMode = 'general' | 'corrector' | 'translator';
export type TranscriptionProvider = 'gemini';

export type UpdaterStatus =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdaterState {
  status: UpdaterStatus;
  message: string;
  progressPercent: number;
  availableVersion: string | null;
  currentVersion: string;
}

export interface ElectronAPI {
  toggleMiniMode: (enabled: boolean) => Promise<void>;
  setAlwaysOnTop?: (value: boolean) => Promise<void>;
  fetchApi?: (url: string, options: Record<string, unknown>) => Promise<unknown>;
  minimizeWindow?: () => Promise<void>;
  closeWindow?: () => Promise<void>;
  getUpdaterState?: () => Promise<UpdaterState>;
  checkForUpdates?: () => Promise<UpdaterState>;
  downloadUpdate?: () => Promise<UpdaterState>;
  quitAndInstallUpdate?: () => Promise<UpdaterState>;
  onUpdaterStateChange?: (callback: (state: UpdaterState) => void) => (() => void);
}

// Electron environment variables interface
declare global {
  interface Window {
    electronEnv?: {
      [key: string]: string;
    };
    electronAPI?: ElectronAPI;
  }
}
