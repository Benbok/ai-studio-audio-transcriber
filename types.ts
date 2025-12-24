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

export type TonePreset = 'default' | 'friendly' | 'serious' | 'professional';
export type TranscriptionMode = 'general' | 'corrector' | 'coder' | 'translator';
export type TranscriptionProvider = 'gemini' | 'groq';

export interface ToneConfig {
  temperature: number;
  promptSuffix: string;
}

// Electron environment variables interface
declare global {
  interface Window {
    electronEnv?: {
      [key: string]: string;
    };
    electronAPI?: {
      toggleMiniMode: (enabled: boolean) => Promise<void>;
    };
  }
}
