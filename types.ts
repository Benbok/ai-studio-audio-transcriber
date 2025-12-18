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

// Electron environment variables interface
declare global {
  interface Window {
    electronEnv?: {
      [key: string]: string;
    };
  }
}
