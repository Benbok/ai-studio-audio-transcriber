import React from 'react';
import { Copy, Check, Loader2, Download, FileText } from 'lucide-react';
import { RecorderStatus } from '../types';

interface TranscriptionResultProps {
  text: string;
  status: RecorderStatus;
  copied: boolean;
  onManualCopy: () => void;
  compact?: boolean;
}

const TranscriptionResult: React.FC<TranscriptionResultProps> = ({
  text,
  status,
  copied,
  onManualCopy,
  compact = false
}) => {
  // Подсчет слов и символов
  const wordCount = text ? text.trim().split(/\s+/).length : 0;
  const charCount = text ? text.length : 0;

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (status === RecorderStatus.IDLE && !text) {
    if (compact) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-1 p-4 animate-fade-in opacity-50">
          <FileText className="w-8 h-8 text-gray-700" />
          <p className="text-xs text-center">Готов к записи</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500 space-y-3 p-8 border-2 border-dashed border-gray-800 rounded-2xl glass animate-fade-in">
        <FileText className="w-12 h-12 text-gray-700" />
        <p className="text-lg font-medium text-gray-400">Готов к записи</p>
        <p className="text-sm text-gray-600">Нажмите на микрофон или пробел для начала</p>
      </div>
    );
  }

  if (status === RecorderStatus.PROCESSING) {
    if (compact) return null; // В компактном режиме статус показывается снаружи
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4 glass rounded-2xl p-8 animate-scale-in">
        <div className="relative">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
          <div className="absolute inset-0 w-16 h-16 bg-blue-500/20 rounded-full animate-ping"></div>
        </div>
        <p className="text-xl font-semibold animate-pulse gradient-text">Транскрибирую аудио...</p>
        <p className="text-sm text-gray-400">Обработка русской и английской речи</p>
        <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden mt-4">
          <div className="h-full bg-gradient-primary animate-shimmer"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${compact ? '' : 'space-y-4'} animate-slide-up`}>
      {/* Header с кнопками - скрываем в компактном режиме */}
      {!compact && (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-200">Результат</h2>
            <div className="flex gap-2 text-xs text-gray-500">
              <span className="px-2 py-1 bg-gray-800/50 rounded-md">
                {wordCount} {wordCount === 1 ? 'слово' : wordCount < 5 ? 'слова' : 'слов'}
              </span>
              <span className="px-2 py-1 bg-gray-800/50 rounded-md">
                {charCount} симв.
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onManualCopy}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${copied
                ? 'bg-green-500/20 text-green-400 border border-green-500/50 glow'
                : 'glass text-gray-300 hover:border-blue-500/50 hover:text-blue-400'
                }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Скопировано!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Копировать
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium glass text-gray-300 hover:border-purple-500/50 hover:text-purple-400 transition-all"
            >
              <Download className="w-4 h-4" />
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* Текстовая область с улучшенной типографикой */}
      <div className={`${compact ? 'p-2 max-h-[180px] overflow-y-auto custom-scrollbar' : 'glass-strong rounded-2xl p-6 shadow-xl border border-gray-800/50 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar'}`}>
        <p className={`${compact ? 'text-sm' : 'text-lg'} leading-relaxed text-gray-100 whitespace-pre-wrap font-sans selection:bg-blue-500/30 break-words`}>
          {text}
        </p>
      </div>

      {/* Индикатор успешного копирования */}
      {copied && (
        <div className="flex justify-center animate-bounce">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full">
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400 font-medium">
              Автоматически скопировано в буфер обмена
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscriptionResult;
