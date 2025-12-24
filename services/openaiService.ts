// Lightweight OpenAI helper using fetch so it can be used in browser or Node (if fetch exists)
// Supports simple chat completions and optional audio transcription (Whisper) fallback.

// Read env vars: Electron > Vite > process.env
const _env = typeof import.meta !== 'undefined' ? (import.meta as any).env : {};
const electronEnv = typeof window !== 'undefined' ? (window.electronEnv || {}) : {};
const OPENAI_API_KEY = electronEnv.OPENAI_API_KEY || electronEnv.VITE_OPENAI_API_KEY || _env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = electronEnv.OPENAI_BASE_URL || electronEnv.VITE_OPENAI_BASE_URL || _env.VITE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com";
const OPENAI_CHAT_MODEL = electronEnv.OPENAI_MODEL || electronEnv.VITE_OPENAI_MODEL || _env.VITE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TRANSCRIBE_MODEL = electronEnv.OPENAI_TRANSCRIBE_MODEL || electronEnv.VITE_OPENAI_TRANSCRIBE_MODEL || _env.VITE_OPENAI_TRANSCRIBE_MODEL || process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

// Dedicated Transcription Configuration (allows using Groq for Voice while keeping Theia/DeepSeek for Chat)
export let TRANSCRIPTION_API_KEY = electronEnv.TRANSCRIPTION_API_KEY || electronEnv.VITE_TRANSCRIPTION_API_KEY || electronEnv.GROQ_API_KEY || electronEnv.VITE_GROQ_API_KEY || _env.VITE_TRANSCRIPTION_API_KEY || _env.VITE_GROQ_API_KEY || OPENAI_API_KEY;
export let TRANSCRIPTION_BASE_URL = electronEnv.TRANSCRIPTION_BASE_URL || electronEnv.VITE_TRANSCRIPTION_BASE_URL || _env.VITE_TRANSCRIPTION_BASE_URL || ( // if user set specific groq key but no url, auto-set groq url
  (electronEnv.GROQ_API_KEY || electronEnv.VITE_GROQ_API_KEY || _env.VITE_GROQ_API_KEY) ? "https://api.groq.com/openai/v1" : OPENAI_BASE_URL
);
export let TRANSCRIPTION_MODEL = electronEnv.TRANSCRIPTION_MODEL || electronEnv.VITE_TRANSCRIPTION_MODEL || _env.VITE_TRANSCRIPTION_MODEL || "whisper-large-v3"; // Default to a good model if using dedicated config

export const setTranscriptionConfig = (key: string, url?: string, model?: string) => {
  if (key) TRANSCRIPTION_API_KEY = key;
  if (url) TRANSCRIPTION_BASE_URL = url;
  if (model) TRANSCRIPTION_MODEL = model;
};

// Normalize base URL: remove trailing slashes and any trailing '/v1' to avoid duplicating path segments
function normalizeBaseURL(url: string) {
  if (!url) return 'https://api.openai.com';
  let u = url.trim();
  // Remove trailing slashes
  u = u.replace(/\/+$/, '');
  // If user provided a base that already ends with /v1, strip it to avoid /v1/v1
  if (/\/v1$/i.test(u)) {
    console.warn("OPENAI_BASE_URL contains '/v1' — normalizing to avoid duplicated '/v1' in requests.");
    u = u.replace(/\/v1$/i, '');
  }
  return u;
}

if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY (or VITE_OPENAI_API_KEY) is not set. OpenAI functions will fail until a key is provided. For client usage, add VITE_OPENAI_API_KEY to .env.local and restart the dev server.");
}

async function fetchJson(url: string, options: RequestInit) {
  // STRATEGY 1: Use Electron IPC if available (bypasses CORS)
  if (typeof window !== 'undefined' && (window as any).electronAPI?.fetchApi) {
    try {
      const result = await (window as any).electronAPI.fetchApi(url, options);

      if (!result.ok) {
        const errorMsg = result.error || result.text || `HTTP ${result.status}`;
        throw new Error(`API error: ${errorMsg}`);
      }

      // Try to parse as JSON
      try {
        const json = JSON.parse(result.text);
        return json;
      } catch (e) {
        // Not JSON, return as text
        return result.text;
      }
    } catch (err) {
      console.warn('Electron IPC fetch failed, falling back to browser fetch:', err);
      // Continue to browser fetch below
    }
  }

  // STRATEGY 2: Fallback to browser fetch (for dev server / web mode)
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok) throw json;
    return json;
  } catch (e) {
    // Not JSON or JSON error
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${text}`);
    return text;
  }
}

// Small helper to perform a fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const merged = { ...options, signal: controller.signal } as RequestInit;
    const res = await fetch(url, merged);
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Lightweight health check for OpenAI-like API.
 * Returns: { status: 'ok'|'auth'|'rate_limit'|'degraded'|'unreachable', code?: number, detail?: string }
 */
export async function checkOpenAIHealth(baseURL: string = OPENAI_BASE_URL, timeoutMs = 2000) {
  if (!OPENAI_API_KEY) {
    return { status: 'auth', detail: 'OPENAI_API_KEY not set' };
  }
  const base = normalizeBaseURL(baseURL);
  const url = `${base}/v1/models`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }, timeoutMs);
    if (res.status === 200) return { status: 'ok' };
    if (res.status === 401) return { status: 'auth', code: 401 };
    if (res.status === 429) return { status: 'rate_limit', code: 429 };
    if (res.status >= 500) return { status: 'degraded', code: res.status };
    return { status: 'unreachable', code: res.status };
  } catch (err: any) {
    if (err && err.name === 'AbortError') return { status: 'unreachable', detail: 'timeout' };
    return { status: 'unreachable', detail: String(err?.message || err) };
  }
}
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  model: string = OPENAI_CHAT_MODEL,
  baseURL: string = OPENAI_BASE_URL,
  apiKey: string = OPENAI_API_KEY
) {
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const base = normalizeBaseURL(baseURL);
  const url = `${base}/v1/chat/completions`;
  const body = JSON.stringify({ model, messages });
  const json = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });
  return json;
}

export async function transcribeAudioOpenAI(audioBlob: Blob, model: string = TRANSCRIPTION_MODEL, baseURL: string = TRANSCRIPTION_BASE_URL) {
  if (!TRANSCRIPTION_API_KEY) throw new Error("OPENAI/GROQ API_KEY missing (checked TRANSCRIPTION_API_KEY, VITE_GROQ_API_KEY, VITE_OPENAI_API_KEY)");
  const base = normalizeBaseURL(baseURL);
  const url = `${base}/v1/audio/transcriptions`;
  const form = new FormData();
  form.append('file', audioBlob, 'audio.webm');
  form.append('model', model);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TRANSCRIPTION_API_KEY}`,
    } as any,
    body: form as any,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI transcription error: ${res.status} ${text}`);
  }

  const data = await res.json();
  // OpenAI returns { text: "..." } for whisper-style endpoint
  if (data?.text) return data.text;
  // Some clients may return different structure
  if (data?.result) return data.result;
  return JSON.stringify(data);
}

export default {
  chatCompletion,
  transcribeAudioOpenAI,
};
