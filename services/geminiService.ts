import { GoogleGenAI } from "@google/genai";
import { updateQuotaUsage } from './quotaService';

// Read env vars: Electron > Vite > process.env
const _env = typeof import.meta !== 'undefined' ? (import.meta as any).env : {};
const electronEnv = typeof window !== 'undefined' ? (window.electronEnv || {}) : {};

const readElectronEnv = (key: string): string => {
  const directValue = electronEnv?.[key];
  if (typeof directValue === 'string') return directValue;
  if (typeof electronEnv?.get === 'function') {
    const viaGetter = electronEnv.get(key);
    return typeof viaGetter === 'string' ? viaGetter : '';
  }
  return '';
};

const rawApiKey =
  readElectronEnv('GEMINI_API_KEY') ||
  readElectronEnv('VITE_GEMINI_API_KEY') ||
  _env.VITE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.API_KEY ||
  "";

export const GEMINI_MODEL_STORAGE_KEY = 'VITE_GEMINI_MODEL';
export const GEMINI_MODEL_PRESETS = [
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    description: 'Lowest-cost default for speech-to-text transcription.',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Cheap and more stable fallback if Lite is overloaded.',
  },
  {
    id: 'gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash 001',
    description: 'Stable legacy fallback for compatibility.',
  },
] as const;

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedAvailableModels: string[] | null = null;
let cachedAvailableModelsAt = 0;

const sanitizeModelName = (model: string): string =>
  (model || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

const rawModel =
  (typeof window !== 'undefined' ? localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) : '') ||
  readElectronEnv('GEMINI_MODEL') ||
  readElectronEnv('VITE_GEMINI_MODEL') ||
  _env.VITE_GEMINI_MODEL ||
  process.env.GEMINI_MODEL ||
  process.env.VITE_GEMINI_MODEL ||
  DEFAULT_GEMINI_MODEL;

let geminiModel = sanitizeModelName(rawModel) || DEFAULT_GEMINI_MODEL;

// Remove any non-ASCII characters which can break Headers.append
let apiKey = rawApiKey.replace(/[^ -\u007F]/g, "").trim();

if (rawApiKey && rawApiKey !== apiKey) {
  console.warn("GEMINI_API_KEY contained non-ASCII characters which were removed.");
}

if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. Transcriptions will fail until a valid key is provided.");
}

let ai = new GoogleGenAI({ apiKey: apiKey || 'dummy_key' });

type ListedModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

const normalizeModelId = (name: string): string => {
  const sanitized = sanitizeModelName(name);
  return sanitized.startsWith('models/') ? sanitized.replace(/^models\//, '') : sanitized;
};

const prettifyModelLabel = (id: string): string => {
  const known = GEMINI_MODEL_PRESETS.find((preset) => preset.id === id);
  if (known) return known.label;
  return id
    .split('-')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
};

const getPreferredFallbackOrder = () => {
  const presetIds = GEMINI_MODEL_PRESETS.map((preset) => preset.id);
  return [DEFAULT_GEMINI_MODEL, ...presetIds.filter((id) => id !== DEFAULT_GEMINI_MODEL)];
};

const isCheapTranscriptionModel = (modelId: string): boolean => {
  const id = normalizeModelId(modelId);
  if (!id.startsWith('gemini-')) return false;

  // Keep only low-cost text/audio-capable Flash family for transcription.
  const isFlashFamily = id.includes('flash');
  if (!isFlashFamily) return false;

  const excludedTokens = [
    'pro',
    'tts',
    'image',
    'imagen',
    'veo',
    'lyria',
    'embedding',
    'gemma',
    'robotics',
    'live',
    'computer-use',
    'deep-research',
    'antigravity',
  ];

  return !excludedTokens.some((token) => id.includes(token));
};

const classifyGeminiError = (error: any) => {
  const status = Number(error?.status || 0);
  const errStr = JSON.stringify(error || '').toLowerCase();
  const msg = (error?.message || '').toLowerCase();

  if (status === 401 || msg.includes('authentication') || msg.includes('api key')) return 'auth';
  if (status === 429 || errStr.includes('resource_exhausted') || msg.includes('rate limit')) return 'rate_limit';
  if (
    status === 404 ||
    msg.includes('is not found') ||
    msg.includes('not supported for generatecontent') ||
    msg.includes('unsupported model')
  ) {
    return 'model_unsupported';
  }

  // Some models return 400 when they do not support the provided audio modality.
  if (
    status === 400 && (
      msg.includes('invalid argument') ||
      msg.includes('unsupported') ||
      msg.includes('not support') ||
      msg.includes('audio') ||
      msg.includes('mime') ||
      msg.includes('inline_data') ||
      msg.includes('modality')
    )
  ) {
    return 'model_unsupported';
  }

  if (status === 503 || msg.includes('high demand') || msg.includes('unavailable')) return 'overloaded';
  if (status >= 500 || msg.includes('timeout') || msg.includes('network') || msg.includes('connect')) return 'degraded';
  if (status === 400 || msg.includes('invalid') || msg.includes('bad request')) return 'bad_request';
  return 'unknown';
};

export async function getAvailableGeminiModels(forceRefresh = false): Promise<string[]> {
  const now = Date.now();
  if (!forceRefresh && cachedAvailableModels && (now - cachedAvailableModelsAt) < MODELS_CACHE_TTL_MS) {
    return cachedAvailableModels;
  }

  const fallback = getPreferredFallbackOrder();
  if (!apiKey) {
    cachedAvailableModels = fallback;
    cachedAvailableModelsAt = now;
    return fallback;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      throw new Error(`ListModels failed with status ${response.status}`);
    }

    const payload = await response.json() as { models?: ListedModel[] };
    const listed = (payload.models || [])
      .filter((model) => {
        const methods = model.supportedGenerationMethods || [];
        return methods.length === 0 || methods.includes('generateContent');
      })
      .map((model) => normalizeModelId(model.name || ''))
      .filter((modelId) => modelId.length > 0)
      .filter((modelId) => isCheapTranscriptionModel(modelId));

    const preferred = getPreferredFallbackOrder().filter((id) => listed.includes(id));
    const remaining = listed.filter((id) => !preferred.includes(id));
    const merged = Array.from(new Set([...preferred, ...remaining]));

    cachedAvailableModels = merged.length > 0 ? merged : fallback;
    cachedAvailableModelsAt = now;
    return cachedAvailableModels;
  } catch (error) {
    console.warn('Unable to refresh Gemini model list, using fallback presets:', error);
    cachedAvailableModels = fallback;
    cachedAvailableModelsAt = now;
    return fallback;
  }
}

export async function getGeminiModelOptions(forceRefresh = false): Promise<Array<{ id: string; label: string }>> {
  const modelIds = await getAvailableGeminiModels(forceRefresh);
  return modelIds.map((id) => ({ id, label: prettifyModelLabel(id) }));
}

const buildCandidateModels = async (selectedModel: string): Promise<string[]> => {
  const selected = normalizeModelId(selectedModel) || DEFAULT_GEMINI_MODEL;
  const available = await getAvailableGeminiModels();
  const preferred = getPreferredFallbackOrder();

  const orderedPool = [
    ...available,
    ...preferred,
  ];

  return Array.from(new Set([selected, ...orderedPool]));
};

export const setGeminiApiKey = (key: string) => {
  apiKey = key.replace(/[^ -\u007F]/g, "").trim();
  ai = new GoogleGenAI({ apiKey: apiKey || 'dummy_key' });
  cachedAvailableModels = null;
  cachedAvailableModelsAt = 0;
  console.info('Gemini API Key updated at runtime.');
};

export const getGeminiModel = () => geminiModel;

export const setGeminiModel = (model: string) => {
  const sanitized = sanitizeModelName(model);
  geminiModel = sanitized || DEFAULT_GEMINI_MODEL;
  console.info(`Gemini model updated at runtime: ${geminiModel}`);
};

// -- Types -----------------------------------------------------------------------

export type TranscriptionMode = 'general' | 'corrector' | 'translator';
export type TranscriptionProvider = 'gemini';

// -- Prompts ---------------------------------------------------------------------
// Each prompt handles transcription AND formatting/correction in one single LLM call.
// Gemini 2.5-flash is multimodal — no separate post-processing pass needed.

const PROMPTS: Record<TranscriptionMode, string> = {
  general:
    `Transcribe the audio accurately into Russian or English (auto-detect the language).
Instructions:
1. Convert speech to grammatically correct text with proper punctuation and capitalization.
2. Fix obvious spelling errors and typos.
3. Remove filler words (umm, uh, ну, эм, etc.).
4. Preserve the full meaning. Do NOT add any new information.
5. Return ONLY the clean, ready-to-use text. No preamble, no comments.`,

  corrector:
    `Транскрибируй аудио и оформи результат в официально-деловом стиле на русском языке.
Инструкции:
1. Точно транскрибируй речь.
2. Исправь грамматику, пунктуацию и орфографию.
3. Замени разговорные, просторечные и неформальные выражения на нейтральные официальные аналоги.
4. Улучши структуру предложений: полные конструкции, без сокращений и сленга.
5. СОХРАНЯЙ исходный смысл и все ключевые факты — ничего не добавляй.
6. Верни ТОЛЬКО готовый текст. Без пояснений и комментариев.`,

  translator:
    `Транскрибируй аудио и переведи его с русского на английский.
Инструкции:
1. Транскрибируй речь (язык источника — русский).
2. Переведи текст на беглый, естественный английский язык.
3. Исправь пунктуацию в переводе.
4. Сохрани смысл и тон оригинала.
5. Верни ТОЛЬКО перевод. Без пояснений и примечаний.`,
};

// -- Internal helpers ------------------------------------------------------------

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result) { reject(new Error("Failed to convert audio file to base64.")); return; }
      resolve(result.split(',')[1]);
    };
    reader.onerror = (err) => reject(new Error(`FileReader error: ${err}`));
    reader.readAsDataURL(blob);
  });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const estimateTokens = (text: string) => Math.max(1, Math.ceil((text || '').length / 2.5));

function trackQuota(prompt: string, output: string) {
  try {
    updateQuotaUsage(estimateTokens(prompt), estimateTokens(output));
  } catch (err) {
    console.warn('Failed to track Gemini quota:', err);
  }
}

// -- Health check ----------------------------------------------------------------

export async function checkGeminiHealth(timeoutMs = 2000) {
  if (!apiKey) return { status: 'auth', detail: 'GEMINI_API_KEY not set or invalid' };

  const candidates = await buildCandidateModels(geminiModel);
  let lastErr: any = null;

  for (const model of candidates.slice(0, 4)) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: { parts: [{ text: 'ping' }] },
        // @ts-ignore
        signal: controller.signal,
      });
      clearTimeout(id);
      return resp ? { status: 'ok', model } : { status: 'unreachable', detail: `${model}: empty response` };
    } catch (err: any) {
      clearTimeout(id);
      lastErr = err;
      const kind = classifyGeminiError(err);
      if (kind === 'auth') return { status: 'auth' };
      if (kind === 'rate_limit') return { status: 'rate_limit' };
      if (kind === 'model_unsupported' || kind === 'overloaded' || kind === 'degraded') {
        continue;
      }
      return { status: 'unreachable', detail: err?.message || String(err) };
    }
  }

  const kind = classifyGeminiError(lastErr);
  if (kind === 'rate_limit') return { status: 'rate_limit' };
  if (kind === 'degraded' || kind === 'overloaded') return { status: 'degraded' };
  return { status: 'unreachable', detail: lastErr?.message || String(lastErr) };
}

const generateWithModel = async (model: string, mimeType: string, base64Audio: string, prompt: string) => {
  return ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Audio } },
        { text: prompt },
      ],
    },
  });
};

const isRetryableWithinModel = (error: any) => {
  const kind = classifyGeminiError(error);
  return kind === 'rate_limit' || kind === 'overloaded' || kind === 'degraded';
};

const shouldSwitchModel = (error: any) => {
  const kind = classifyGeminiError(error);
  return kind === 'model_unsupported' || kind === 'overloaded' || kind === 'degraded' || kind === 'rate_limit' || kind === 'bad_request';
};

const classifyFinalError = (lastError: any) => {
  const errMsg = (lastError?.message || '').toLowerCase();
  const errStr = JSON.stringify(lastError || '').toUpperCase();

  if (classifyGeminiError(lastError) === 'rate_limit' || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429')) {
    return new Error("Лимит запросов Gemini исчерпан (429). Попробуйте позже.");
  }

  if (classifyGeminiError(lastError) === 'auth' || errMsg.includes('api key') || errMsg.includes('authentication')) {
    return new Error("Неверный API ключ. Проверьте GEMINI_API_KEY в файле .env.local");
  }

  if (classifyGeminiError(lastError) === 'model_unsupported') {
    return new Error("Выбранная модель недоступна для вашего API/региона. Откройте Настройки и выберите доступную модель из списка.");
  }

  if (classifyGeminiError(lastError) === 'bad_request' || errMsg.includes('invalid') || errMsg.includes('bad request')) {
    return new Error("Неверный формат запроса. Проверьте формат аудио файла.");
  }

  if (
    errMsg.includes('iso-8859-1') ||
    errMsg.includes('non iso-8859-1') ||
    (errMsg.includes('append') && errMsg.includes('headers')) ||
    errMsg.includes('code point')
  ) {
    return new Error("Ошибка кодировки заголовков. Убедитесь, что GEMINI_API_KEY содержит только ASCII символы.");
  }
  return lastError instanceof Error
    ? lastError
    : new Error(`Transcription failed: ${JSON.stringify(lastError)}`);
};

// -- Main transcription function -------------------------------------------------

/**
 * Transcribes audio using selected Gemini model.
 * Transcription + punctuation/spelling/tone correction all happen in ONE LLM call.
 */
export const transcribeAudio = async (
  audioBlob: Blob,
  mode: TranscriptionMode = 'general',
  _provider: TranscriptionProvider = 'gemini',
): Promise<{ text: string; provider: string }> => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please set GEMINI_API_KEY in .env.local");
  }

  const prompt = PROMPTS[mode];
  let mimeType = (audioBlob.type || 'audio/webm').replace(/[^\x00-\x7F]/g, '');
  if (!mimeType) mimeType = 'audio/webm';

  const perModelRetries = 2;
  let lastError: any = null;
  let lastTriedModel = geminiModel;

  const base64Audio = await blobToBase64(audioBlob);
  const candidateModels = await buildCandidateModels(geminiModel);

  for (const model of candidateModels) {
    lastTriedModel = model;
    for (let attempt = 0; attempt < perModelRetries; attempt++) {
      try {
        const response = await generateWithModel(model, mimeType, base64Audio, prompt);

        if (response.text) {
          const text = response.text.trim();
          trackQuota(prompt, text);
          return { text, provider: `Gemini (${model})` };
        }

        throw new Error("Gemini returned an empty response.");
      } catch (error: any) {
        lastError = error;
        console.warn(`Model ${model}, attempt ${attempt + 1} failed:`, error);

        if (isRetryableWithinModel(error) && attempt < perModelRetries - 1) {
          await delay(1000 * Math.pow(2, attempt));
          continue;
        }

        if (shouldSwitchModel(error)) {
          break;
        }

        throw classifyFinalError(error);
      }
    }
  }

  if (!lastError) {
    throw new Error(`Не удалось выполнить транскрибацию: не найдена доступная модель (selected=${lastTriedModel}).`);
  }

  throw classifyFinalError(lastError);
};