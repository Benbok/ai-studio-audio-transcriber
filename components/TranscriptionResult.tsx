import React from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';
import { RecorderStatus } from '../types';

interface TranscriptionResultProps {
  text: string;
  status: RecorderStatus;
  copied: boolean;
  onManualCopy: () => void;
}

const TranscriptionResult: React.FC<TranscriptionResultProps> = ({ 
  text, 
  status, 
  copied,
  onManualCopy 
}) => {
  if (status === RecorderStatus.IDLE && !text) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4 p-8 border-2 border-dashed border-gray-700 rounded-xl">
        <p className="text-lg">Ready to capture</p>
        <p className="text-sm text-gray-600">Press the microphone to start</p>
      </div>
    );
  }

  if (status === RecorderStatus.PROCESSING) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-xl font-medium animate-pulse text-blue-400">Transcribing audio...</p>
        <p className="text-sm text-gray-400">Processing Russian & English speech</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-gray-300">Transcription</h2>
        <button
          onClick={onManualCopy}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            copied 
              ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Text
            </>
          )}
        </button>
      </div>
      
      <div className="bg-gray-800 rounded-xl p-6 shadow-inner border border-gray-700 min-h-[160px]">
        <p className="text-xl leading-relaxed text-gray-100 whitespace-pre-wrap font-sans">
          {text}
        </p>
      </div>

      {copied && (
        <div className="flex justify-center">
           <span className="text-sm text-green-500/80 animate-bounce">
             Auto-copied to clipboard
           </span>
        </div>
      )}
    </div>
  );
};

export default TranscriptionResult;
