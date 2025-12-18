import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, AlertCircle, Check, Copy, RotateCw, Settings as SettingsIcon, Monitor, History } from 'lucide-react';
import { RecorderStatus, TonePreset } from './types';
import { transcribeAudio, TranscriptionMode, TranscriptionProvider, setGeminiApiKey } from './services/geminiService';
import { setTranscriptionConfig } from './services/openaiService';
import { fixPunctuation, setPostProcessingApiKey } from './services/postProcessingService';
import { saveRecording } from './services/storageService';
import Visualizer from './components/Visualizer';
import TranscriptionResult from './components/TranscriptionResult';
import RecordButton from './components/RecordButton';
import SettingsModal from './components/SettingsModal';
import RecordingsList from './components/RecordingsList';

const App: React.FC = () => {
  const [status, setStatus] = useState<RecorderStatus>(RecorderStatus.IDLE);
  const [isProcessingPunctuation, setIsProcessingPunctuation] = useState<boolean>(false);
  const [isMiniMode, setIsMiniMode] = useState<boolean>(false);

  const toggleMiniMode = async () => {
    const newMode = !isMiniMode;
    setIsMiniMode(newMode);
    if ((window as any).electronAPI?.toggleMiniMode) {
      await (window as any).electronAPI.toggleMiniMode(newMode);
    }
  };

  // Compute model/provider availability for UI
  const env = (import.meta as any).env || {};
  const hasGemini = !!(env.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY === '' ? false : env.VITE_GEMINI_API_KEY) || false;
  const geminiModel = env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
  const hasOpenAI = !!(env.VITE_OPENAI_API_KEY || process.env?.OPENAI_API_KEY);

  // Detect distinct transcription config (Groq)
  const txKey = env.VITE_TRANSCRIPTION_API_KEY || env.VITE_GROQ_API_KEY;
  const txModel = env.VITE_TRANSCRIPTION_MODEL || 'whisper-large-v3';
  const isGroq = !!(txKey && (txKey.startsWith('gsk_') || env.VITE_TRANSCRIPTION_BASE_URL?.includes('groq')));

  const openaiModel = env.VITE_OPENAI_MODEL || env.VITE_OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
  const fallbackEnabled = ((env.VITE_USE_OPENAI_FALLBACK || '') + '').toLowerCase() === '1' || ((env.VITE_FALLBACK_PROVIDER || '') + '').toLowerCase() === 'openai';

  const [geminiHealth, setGeminiHealth] = useState<{ status: string, detail?: string } | null>(null);
  const [openaiHealth, setOpenaiHealth] = useState<{ status: string, detail?: string } | null>(null);
  const [refreshingHealth, setRefreshingHealth] = useState<boolean>(false);
  const [text, setText] = useState<string>("");
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [copyError, setCopyError] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [mode, setMode] = useState<TranscriptionMode>('general');
  const [provider, setProvider] = useState<TranscriptionProvider>('groq');
  const [tone, setTone] = useState<TonePreset>('default');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const currentAudioBlobRef = useRef<Blob | null>(null);

  // Cleanup stream on unmount or change
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Timer logic
  useEffect(() => {
    let intervalId: number;
    if (status === RecorderStatus.RECORDING) {
      intervalId = window.setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [status]);

  // Load keys and tone from storage on mount
  useEffect(() => {
    const gKey = localStorage.getItem('VITE_GEMINI_API_KEY');
    if (gKey) {
      setGeminiApiKey(gKey);
      setPostProcessingApiKey(gKey); // Используем тот же ключ для постобработки
    }

    const grKey = localStorage.getItem('VITE_GROQ_API_KEY');
    if (grKey) setTranscriptionConfig(grKey);

    const savedTone = (localStorage.getItem('TONE_PRESET') || 'default') as TonePreset;
    setTone(savedTone);
  }, []);

  // Health checks on mount
  useEffect(() => {
    let mounted = true;
    async function runChecks() {
      try {
        const mod = await import('./services/geminiService');
        const res = await mod.checkGeminiHealth();
        if (mounted) setGeminiHealth(res as any);
      } catch (e) {
        if (mounted) setGeminiHealth({ status: 'unreachable', detail: String(e) });
      }

      try {
        const mod = await import('./services/openaiService');
        const res = await mod.checkOpenAIHealth();
        if (mounted) setOpenaiHealth(res as any);
      } catch (e) {
        if (mounted) setOpenaiHealth({ status: 'unreachable', detail: String(e) });
      }
    }

    runChecks();

    return () => { mounted = false };
  }, [isSettingsOpen]);

  const refreshHealth = async () => {
    setRefreshingHealth(true);
    try {
      const g = await import('./services/geminiService');
      const o = await import('./services/openaiService');
      const [gRes, oRes] = await Promise.all([
        g.checkGeminiHealth(),
        o.checkOpenAIHealth(),
      ]);
      setGeminiHealth(gRes as any);
      setOpenaiHealth(oRes as any);
    } catch (e) {
      console.warn('Health refresh error', e);
    } finally {
      setRefreshingHealth(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyToClipboard = useCallback(async (textToCopy: string) => {
    setCopyError(false);

    // Method 1: Async Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
        return;
      } catch (err) {
        console.warn('Clipboard API failed, attempting fallback:', err);
      }
    }

    // Method 2: Fallback using execCommand
    try {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      textArea.style.position = "fixed";
      textArea.style.left = "0";
      textArea.style.top = "0";
      textArea.style.opacity = "0";
      textArea.style.pointerEvents = "none";

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } else {
        throw new Error("execCommand returned false");
      }
    } catch (err) {
      console.error('All copy methods failed:', err);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 5000);
    }
  }, []);

  const startRecording = async () => {
    setError(null);
    setText("");
    setCopied(false);
    setCopyError(false);
    setElapsedTime(0);
    setLastProvider(null);

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(audioStream);

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const options: MediaRecorderOptions = {
        mimeType,
        audioBitsPerSecond: 24000 // Optimized for voice (was 64000)
      };

      const mediaRecorder = new MediaRecorder(audioStream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        currentAudioBlobRef.current = audioBlob;
        handleTranscription(audioBlob);

        audioStream.getTracks().forEach(track => track.stop());
        setStream(null);
      };

      mediaRecorder.start();
      setStatus(RecorderStatus.RECORDING);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Доступ к микрофону запрещен. Пожалуйста, разрешите доступ к микрофону.");
      setStatus(RecorderStatus.IDLE);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && status === RecorderStatus.RECORDING) {
      mediaRecorderRef.current.stop();
      setStatus(RecorderStatus.PROCESSING);
    }
  };

  // Hotkeys: Space to toggle recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();

        if (status === RecorderStatus.IDLE || status === RecorderStatus.COMPLETED) {
          startRecording();
        } else if (status === RecorderStatus.RECORDING) {
          stopRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  const handleTranscription = async (audioBlob: Blob, recordingIdToUpdate?: number, toneOverride?: TonePreset) => {
    try {
      setStatus(RecorderStatus.PROCESSING);
      const activeTone = toneOverride || tone;
      const result = await transcribeAudio(audioBlob, mode, provider, activeTone);

      // Показываем сырой результат СРАЗУ (ключевая оптимизация)
      setText(result.text);
      setLastProvider(result.provider);
      setStatus(RecorderStatus.COMPLETED);

      // Копируем сырой текст немедленно, чтобы пользователь мог работать
      await copyToClipboard(result.text);

      // Фоновая обработка пунктуации (не блокирует UI)
      setIsProcessingPunctuation(true);

      fixPunctuation(result.text, mode, activeTone)
        .then(async (punctuationResult) => {
          if (punctuationResult.success && punctuationResult.text) {
            // Обновляем текст с улучшенной пунктуацией
            setText(punctuationResult.text);
            await copyToClipboard(punctuationResult.text);

            // Сохраняем финальную версию с пунктуацией
            try {
              await saveRecording(audioBlob, punctuationResult.text, {
                mode,
                provider: result.provider,
                tone: activeTone,
                duration: elapsedTime,
              });
              console.info('Recording saved to IndexedDB with punctuation');
            } catch (saveErr) {
              console.error('Failed to save recording:', saveErr);
            }
          } else {
            // Если пунктуация не удалась, сохраняем оригинал
            try {
              await saveRecording(audioBlob, result.text, {
                mode,
                provider: result.provider,
                tone: activeTone,
                duration: elapsedTime,
              });
              console.info('Recording saved to IndexedDB (original text)');
            } catch (saveErr) {
              console.error('Failed to save recording:', saveErr);
            }
          }
        })
        .catch((punctErr) => {
          console.warn('Punctuation processing failed:', punctErr);
          // Сохраняем оригинал при ошибке
          saveRecording(audioBlob, result.text, {
            mode,
            provider: result.provider,
            tone: activeTone,
            duration: elapsedTime,
          }).catch(saveErr => console.error('Failed to save recording:', saveErr));
        })
        .finally(() => {
          setIsProcessingPunctuation(false);
        });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла неизвестная ошибка");
      setStatus(RecorderStatus.IDLE);
      setIsProcessingPunctuation(false);
    }
  };

  const handleRetranscribe = (audioBlob: Blob, recordingId: number, toneOverride?: TonePreset) => {
    // Reset state and re-transcribe with current settings (or overridden tone)
    setText("");
    setError(null);
    setCopied(false);
    setLastProvider(null);
    currentAudioBlobRef.current = audioBlob;
    handleTranscription(audioBlob, recordingId, toneOverride);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900/20 text-white flex items-center justify-center ${isMiniMode ? 'p-2' : 'p-6'}`}>
      <div className={`w-full ${isMiniMode ? 'max-w-sm h-[580px] flex flex-col' : 'max-w-4xl space-y-6'} animate-fade-in`}>

        {isMiniMode ? (
          /* ================= MINI MODE UI ================= */
          <div className="flex-1 flex flex-col space-y-4">
            {/* Mini Header */}
            <div className="glass rounded-2xl p-3 flex items-center justify-between border border-gray-800/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-sm">Scribe Mini</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={toggleMiniMode}
                  className="p-2 glass rounded-lg hover:border-blue-500/50 transition-all interactive"
                  title="Выход из мини-режима"
                >
                  <Monitor className="w-4 h-4 text-blue-400" />
                </button>
                <button
                  onClick={() => setIsHistoryOpen(true)}
                  className="p-2 glass rounded-lg hover:border-purple-500/50 transition-all interactive"
                  title="История записей"
                >
                  <History className="w-4 h-4 text-purple-400" />
                </button>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 glass rounded-lg hover:border-blue-500/50 transition-all interactive"
                >
                  <SettingsIcon className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Record & Control Center */}
            <div className="glass rounded-3xl p-6 flex flex-col items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5 relative overflow-hidden">
              {/* Simple Visualizer Bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gray-800/50">
                {status === RecorderStatus.RECORDING && <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }}></div>}
              </div>

              <div className="relative mb-4">
                <RecordButton
                  status={status}
                  onClick={status === RecorderStatus.RECORDING ? stopRecording : startRecording}
                  size="large"
                />

                {status === RecorderStatus.RECORDING && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 glass-strong px-2 py-0.5 rounded-full text-[10px] font-mono text-red-400 border border-red-500/30">
                    {formatTime(elapsedTime)}
                  </div>
                )}
              </div>

              {/* Status Message */}
              <div className="text-center h-4">
                {status === RecorderStatus.RECORDING && <span className="text-[10px] text-red-400 animate-pulse font-medium uppercase tracking-tighter">Recording...</span>}
                {isProcessingPunctuation && <span className="text-[10px] text-blue-400 flex items-center gap-1"><RotateCw className="w-2 h-2 animate-spin" /> Fixing Punctuation...</span>}
                {status === RecorderStatus.IDLE && !isProcessingPunctuation && <span className="text-[10px] text-gray-500 uppercase tracking-widest">Ready</span>}
              </div>
            </div>

            {/* Mini Result Area */}
            <div className="flex-1 glass rounded-3xl p-4 border border-gray-800/50 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto mb-2 custom-scrollbar">
                <TranscriptionResult
                  text={text}
                  status={status}
                  copied={copied}
                  onManualCopy={() => text && copyToClipboard(text)}
                  compact={true}
                />
              </div>

              {text && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-800/20 text-[10px] text-gray-500 font-mono">
                  <span>{text.length} chars</span>
                  <button
                    onClick={() => copyToClipboard(text)}
                    className="p-1.5 hover:bg-white/5 rounded-md transition-colors"
                    title="Копировать"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= NORMAL MODE UI ================= */
          <>
            {/* Header Card */}
            <div className="glass rounded-3xl p-6 shadow-2xl border border-gray-800/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-primary"></div>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold gradient-text mb-1">Voice Scribe</h1>
                  <p className="text-gray-400 text-sm">Профессиональная транскрибация RU/EN с автокопированием</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={toggleMiniMode}
                    className="p-3 glass rounded-xl hover:border-blue-500/50 transition-all interactive"
                    title="Мини-режим"
                  >
                    <Monitor className="w-5 h-5 text-gray-400" />
                  </button>
                  <button
                    onClick={() => setIsHistoryOpen(true)}
                    className="p-3 glass rounded-xl hover:border-purple-500/50 transition-all interactive"
                    title="История записей"
                  >
                    <History className="w-5 h-5 text-purple-400" />
                  </button>
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-3 glass rounded-xl hover:border-blue-500/50 transition-all interactive"
                  >
                    <SettingsIcon className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column */}
              <div className="lg:col-span-1 space-y-4">
                <div className="glass rounded-2xl p-4 shadow-xl border border-gray-800/50 h-32 relative overflow-hidden">
                  {status === RecorderStatus.RECORDING ? (
                    <Visualizer stream={stream} isRecording={true} />
                  ) : (
                    <div className="flex items-center justify-center h-full opacity-30">
                      <div className="flex gap-2 items-end">
                        {[20, 35, 25, 40, 30, 45, 25, 35].map((h, i) => (
                          <div key={i} className="w-2 bg-gray-600 rounded-full" style={{ height: `${h}px` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  {status === RecorderStatus.RECORDING && (
                    <div className="absolute bottom-3 right-3 glass-strong px-3 py-1 rounded-full text-xs font-mono text-red-400 border border-red-500/30">
                      ⏺ {formatTime(elapsedTime)}
                    </div>
                  )}
                </div>

                <div className="glass rounded-2xl p-4 shadow-xl border border-gray-800/50">
                  <label className="text-xs font-semibold text-gray-400 mb-3 block uppercase flex items-center justify-between">
                    <span>Провайдер</span>
                    {provider && <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">● АКТИВЕН</span>}
                  </label>
                  <div className="flex gap-2">
                    {(['gemini', 'groq'] as TranscriptionProvider[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setProvider(p)}
                        className={`relative flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${provider === p ? 'bg-gradient-primary text-white scale-105 border-2 border-blue-400' : 'bg-gray-800/50 text-gray-400'}`}
                      >
                        {p === 'gemini' ? '✨ Gemini' : '⚡ Groq'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode Selector */}
                <div className="glass rounded-2xl p-4 shadow-xl border border-gray-800/50">
                  <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">
                    Режим (Промпт)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['general', 'corrector', 'coder', 'translator'] as TranscriptionMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${mode === m
                          ? 'bg-blue-600 text-white shadow-lg glow'
                          : 'bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                          }`}
                      >
                        {m === 'general' ? 'Общий' : m === 'corrector' ? 'Корректор' : m === 'coder' ? 'Код' : 'Перевод'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-center py-2">
                  <div className="flex justify-center py-2">
                    <RecordButton
                      status={status}
                      onClick={status === RecorderStatus.RECORDING ? stopRecording : startRecording}
                      size="normal"
                    />
                  </div>
                </div>

                <div className="text-center min-h-[1.5rem]">
                  {status === RecorderStatus.RECORDING && <span className="text-red-400 text-sm animate-pulse">● Идет запись...</span>}
                  {isProcessingPunctuation && <span className="text-blue-400 text-sm animate-pulse">● Исправление пунктуации...</span>}
                  {error && <span className="text-red-400 text-xs">{error}</span>}
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-2">
                <div className="glass rounded-2xl p-6 shadow-xl border border-gray-800/50 min-h-[400px] flex flex-col">
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <TranscriptionResult text={text} status={status} copied={copied} onManualCopy={() => text && copyToClipboard(text)} />
                  </div>
                  {lastProvider && (
                    <div className="mt-4 pt-4 border-t border-gray-800/50 text-center text-[10px] text-gray-500">
                      Обработано: <span className="text-blue-400">{lastProvider}</span>
                      {text && !isProcessingPunctuation && <span className="ml-3 text-green-400">✓ Пунктуация исправлена</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="glass rounded-2xl p-4 shadow-xl border border-gray-800/50">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Основной:</span>
                    <span className="font-semibold text-gray-200">
                      {hasGemini ? `Gemini (${geminiModel})` : 'Не настроен'}
                    </span>
                    <HealthDot status={geminiHealth?.status} />
                  </div>

                  <div className="h-4 w-px bg-gray-700"></div>

                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Резервный:</span>
                    <span className="font-semibold text-gray-200">
                      {isGroq ? `Groq (${txModel})` : hasOpenAI ? `OpenAI (${openaiModel})` : 'Не настроен'}
                    </span>
                    <HealthDot status={openaiHealth?.status} />
                    {hasOpenAI && (
                      <span className="text-gray-500">
                        ({fallbackEnabled ? 'вкл' : 'выкл'})
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={refreshHealth}
                  disabled={refreshingHealth}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg transition-all interactive text-gray-400 hover:text-gray-200"
                >
                  <RotateCw className={`w-4 h-4 ${refreshingHealth ? 'animate-spin' : ''}`} />
                  {refreshingHealth ? 'Обновление...' : 'Обновить статус'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <RecordingsList
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onRetranscribe={handleRetranscribe}
      />
    </div>
  );
};

// Health indicator dot component
const HealthDot: React.FC<{ status?: string | null }> = ({ status }) => {
  const s = (status || '').toLowerCase();
  if (s === 'ok') return <span className="w-2 h-2 inline-block rounded-full bg-green-400 shadow-lg shadow-green-400/50" title="OK"></span>;
  if (s === 'rate_limit' || s === 'degraded') return <span className="w-2 h-2 inline-block rounded-full bg-yellow-400 shadow-lg shadow-yellow-400/50" title={status}></span>;
  if (s === 'auth' || s === 'unreachable') return <span className="w-2 h-2 inline-block rounded-full bg-red-500 shadow-lg shadow-red-500/50" title={status}></span>;
  return <span className="w-2 h-2 inline-block rounded-full bg-gray-600" title="unknown"></span>;
};

export default App;