import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, AlertCircle, Check, Copy, RotateCw } from 'lucide-react';
import { RecorderStatus } from './types';
import { transcribeAudio, TranscriptionMode } from './services/geminiService';
import Visualizer from './components/Visualizer';
import TranscriptionResult from './components/TranscriptionResult';

const App: React.FC = () => {
  const [status, setStatus] = useState<RecorderStatus>(RecorderStatus.IDLE);
  // Compute model/provider availability for UI
  const env = (import.meta as any).env || {};
  const hasGemini = !!(env.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY === '' ? false : env.VITE_GEMINI_API_KEY) || false;
  const geminiModel = env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
  const hasOpenAI = !!(env.VITE_OPENAI_API_KEY || process.env?.OPENAI_API_KEY);
  const openaiModel = env.VITE_OPENAI_MODEL || env.VITE_OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
  const fallbackEnabled = ((env.VITE_USE_OPENAI_FALLBACK || '') + '').toLowerCase() === '1' || ((env.VITE_FALLBACK_PROVIDER || '') + '').toLowerCase() === 'openai';

  // Detect distinct transcription config (Groq)
  const txKey = env.VITE_TRANSCRIPTION_API_KEY || env.VITE_GROQ_API_KEY;
  const txModel = env.VITE_TRANSCRIPTION_MODEL || 'whisper-large-v3';
  const isGroq = !!(txKey && (txKey.startsWith('gsk_') || env.VITE_TRANSCRIPTION_BASE_URL?.includes('groq')));

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

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
  }, []);

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
        // Continue to fallback
      }
    }

    // Method 2: Fallback using execCommand
    try {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;

      // Ensure textarea is part of DOM but not visually disruptive
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

      // Check supported mime types and set options for voice optimization
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'; // Safari
      }

      // 64kbps is sufficient for high quality speech and allows for longer recordings (30m+)
      // without hitting API payload size limits for inline data.
      const options: MediaRecorderOptions = {
        mimeType,
        audioBitsPerSecond: 64000
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
        handleTranscription(audioBlob);

        // Stop all tracks to release microphone
        audioStream.getTracks().forEach(track => track.stop());
        setStream(null);
      };

      mediaRecorder.start();
      setStatus(RecorderStatus.RECORDING);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access denied. Please allow microphone permissions.");
      setStatus(RecorderStatus.IDLE);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && status === RecorderStatus.RECORDING) {
      mediaRecorderRef.current.stop();
      // Status update to PROCESSING happens in onstop handler via handleTranscription call 
      // but purely specifically, we set it here to update UI immediately
      setStatus(RecorderStatus.PROCESSING);
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    try {
      setStatus(RecorderStatus.PROCESSING);
      const result = await transcribeAudio(audioBlob, mode);
      setText(result.text);
      setLastProvider(result.provider); // Store who did the work
      setStatus(RecorderStatus.COMPLETED);

      // Auto-copy logic
      if (result.text) {
        await copyToClipboard(result.text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setStatus(RecorderStatus.IDLE);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-950 rounded-3xl shadow-2xl overflow-hidden border border-gray-800">

        {/* Header */}
        <div className="p-6 bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 text-center">
            Voice Scribe
          </h1>
          <p className="text-center text-gray-500 text-sm mt-1">
            RU/EN Dictation & Auto-Copy
          </p>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-8">

          {/* Main Visualizer Area */}
          <div className="h-24 flex items-center justify-center w-full bg-gray-900/50 rounded-xl overflow-hidden border border-gray-800/50 relative">
            {status === RecorderStatus.RECORDING ? (
              <Visualizer stream={stream} isRecording={true} />
            ) : (
              <div className="flex gap-1 items-end h-8">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-2 bg-gray-700 rounded-full" style={{ height: `${Math.random() * 20 + 10}px` }}></div>
                ))}
              </div>
            )}

            {/* Timer Overlay */}
            {status === RecorderStatus.RECORDING && (
              <div className="absolute bottom-2 right-2 bg-gray-900/80 px-2 py-0.5 rounded text-xs font-mono text-red-400 border border-red-500/30">
                {formatTime(elapsedTime)}
              </div>
            )}

            {/* Model in-use badge (visible while recording) */}
            {status === RecorderStatus.RECORDING && (
              <div className="absolute bottom-2 left-2 bg-gray-900/70 px-2 py-0.5 rounded text-xs text-gray-200">
                Использует: <span className="font-semibold">{hasGemini ? `Gemini (${geminiModel})` : (hasOpenAI ? `OpenAI (${openaiModel})` : '—')}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4 justify-center items-center">

            {/* Mode Selector */}
            <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
              {(['general', 'corrector', 'coder', 'translator'] as TranscriptionMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode === m
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {status === RecorderStatus.RECORDING ? (
              <button
                onClick={stopRecording}
                className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 transition-all duration-300 transform hover:scale-105"
              >
                <span className="absolute w-full h-full rounded-full bg-red-500 animate-ping opacity-75"></span>
                <Square className="w-8 h-8 text-white fill-current relative z-10" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={status === RecorderStatus.PROCESSING}
                className={`flex items-center justify-center w-20 h-20 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 ${status === RecorderStatus.PROCESSING
                  ? 'bg-gray-700 cursor-not-allowed opacity-50'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30'
                  }`}
              >
                <Mic className="w-10 h-10 text-white" />
              </button>
            )}
          </div>

          {/* Status Text */}
          <div className="text-center min-h-[1.5rem]">
            {status === RecorderStatus.RECORDING && (
              <span className="text-red-400 font-medium text-sm animate-pulse flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Recording...
              </span>
            )}
            {status === RecorderStatus.IDLE && !error && (
              <span className="text-gray-500 text-sm">Tap mic to speak</span>
            )}
            {error && (
              <div className="text-red-400 text-sm flex items-center justify-center gap-2 bg-red-900/20 py-2 px-4 rounded-xl mx-auto max-w-full">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-center break-words">{error}</span>
              </div>
            )}
            {copyError && (
              <div className="text-amber-400 text-sm flex items-center justify-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4" />
                Auto-copy failed. Please copy manually.
              </div>
            )}
          </div>

          <div className="border-t border-gray-800 pt-6">
            <TranscriptionResult
              text={text}
              status={status}
              copied={copied}
              onManualCopy={() => text && copyToClipboard(text)}
            />
            {lastProvider && (
              <div className="mt-2 text-center text-xs text-gray-500">
                Transcribed by: <span className="text-blue-300 font-semibold">{lastProvider}</span>
              </div>
            )}
          </div>

          {/* Model availability (shows which models are configured and which will be used) */}
          <div className="px-6 pt-4 pb-6 text-center text-xs text-gray-400">
            <div>
              <div className="flex items-center justify-center gap-2">
                Primary: <span className="font-semibold text-gray-200">{hasGemini ? `Gemini (${geminiModel})` : 'Gemini (not configured)'}</span>
                <span className="ml-2 inline-flex items-center gap-2">
                  <HealthDot status={geminiHealth?.status} />
                </span>
              </div>
              {geminiHealth?.detail && (
                <div className="text-xs text-gray-500 mt-1">{geminiHealth.detail}</div>
              )}
              <div className="mt-1 flex items-center justify-center gap-2">
                Fallback: <span className="font-semibold text-gray-200">{isGroq ? `Groq (${txModel})` : (hasOpenAI ? `OpenAI (${openaiModel})` : 'OpenAI (not configured)')}</span>
                <span className="ml-2 inline-flex items-center gap-2">
                  <HealthDot status={openaiHealth?.status} />
                  {hasOpenAI && (
                    <span className="ml-2 text-xs text-gray-400">{fallbackEnabled ? '(enabled)' : '(disabled)'}</span>
                  )}
                </span>
              </div>

              <div className="mt-3">
                <button onClick={refreshHealth} disabled={refreshingHealth} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs">
                  {refreshingHealth ? (<span className="flex items-center gap-2"><RotateCw className="w-4 h-4 animate-spin" /> Refreshing...</span>) : (<span className="flex items-center gap-2"><RotateCw className="w-4 h-4" /> Refresh status</span>)}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      <p className="mt-8 text-gray-600 text-xs">
        Powered by Gemini 2.5 Flash {isGroq ? '& Groq' : '& OpenAI'}
      </p>
    </div>
  );
};

// Small health indicator dot component
const HealthDot: React.FC<{ status?: string | null }> = ({ status }) => {
  const s = (status || '').toLowerCase();
  if (s === 'ok') return <span className="w-3 h-3 inline-block rounded-full bg-green-400" title="OK"></span>;
  if (s === 'rate_limit' || s === 'degraded') return <span className="w-3 h-3 inline-block rounded-full bg-yellow-400" title={status}></span>;
  if (s === 'auth' || s === 'unreachable') return <span className="w-3 h-3 inline-block rounded-full bg-red-500" title={status}></span>;
  return <span className="w-3 h-3 inline-block rounded-full bg-gray-600" title="unknown"></span>;
};

export default App;