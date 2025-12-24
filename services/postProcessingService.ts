import { GoogleGenAI } from '@google/genai';
import openaiService from './openaiService'; // Static import for fallback chain
import { checkSpelling, SpellingResult } from './yandexSpellerService';
import type { TranscriptionMode, TonePreset } from '../types';

// Типы постобработки
export type PostProcessingType = 'punctuation' | 'format' | 'style' | 'extract' | 'translate';

export interface KeyPoints {
    summary: string;
    actionItems: string[];
    dates: string[];
    keyTopics: string[];
}

export interface ProcessingResult {
    success: boolean;
    text?: string;
    keyPoints?: KeyPoints;
    error?: string;
    provider?: string;
}

export interface PipelineOptions {
    mode: TranscriptionMode;
    tone: TonePreset;
    enableSpelling?: boolean;    // default: true
    enableGrammar?: boolean;     // default: false (пока отключено)
    enablePunctuation?: boolean; // default: true
    lang?: string[];             // default: ['ru', 'en']
}

export interface PipelineResult {
    success: boolean;
    originalText: string;
    finalText: string;
    stages: {
        spelling?: ProcessingResult;
        grammar?: ProcessingResult;
        punctuation?: ProcessingResult;
    };
    error?: string;
}

// Глобальная переменная для API клиента
let ai: GoogleGenAI | null = null;

/**
 * Установить API ключ Gemini для постобработки
 */
export function setPostProcessingApiKey(apiKey: string) {
    if (apiKey) {
        ai = new GoogleGenAI({ apiKey });
    }
}

/**
 * Получить клиент Gemini
 * ОПТИМИЗАЦИЯ: Теперь требует предварительную инициализацию через setPostProcessingApiKey
 * Это убирает микрозадержки от повторного чтения localStorage/env на каждый вызов
 */
function getAI() {
    if (!ai) {
        throw new Error('Gemini API client not initialized. Call setPostProcessingApiKey() first.');
    }
    return ai;
}

/**
 * ЭТАП 1: Исправление орфографии через Яндекс.Спеллер
 */
export async function fixSpelling(text: string, lang: string[] = ['ru', 'en']): Promise<ProcessingResult> {
    try {
        const result = await checkSpelling(text, lang);

        if (result.success && result.text) {
            return {
                success: true,
                text: result.text,
                provider: 'Yandex.Speller'
            };
        } else {
            // Fallback на LLM при ошибке Яндекс.Спеллер
            console.warn('Yandex.Speller failed, using LLM fallback for spelling');
            return await fixSpellingWithLLM(text);
        }
    } catch (error) {
        console.error('Spelling correction error:', error);
        // Fallback на LLM
        return await fixSpellingWithLLM(text);
    }
}

/**
 * Fallback исправление орфографии через LLM
 */
async function fixSpellingWithLLM(text: string): Promise<ProcessingResult> {
    try {
        const client = getAI();

        const prompt = `Исправь только орфографические ошибки в следующем тексте. Не меняй грамматику, пунктуацию или стиль. Верни только исправленный текст без пояснений.

Текст:
${text}`;

        const result = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: { parts: [{ text: prompt }] }
        });

        const processedText = result.text?.trim() || text;

        return {
            success: true,
            text: processedText,
            provider: 'Gemini (Spelling Fallback)'
        };
    } catch (error) {
        console.error('LLM spelling fallback error:', error);
        return {
            success: false,
            text: text,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * ЭТАП 2: Исправление грамматики через LLM
 */
export async function fixGrammar(text: string, mode: TranscriptionMode = 'general'): Promise<ProcessingResult> {
    try {
        const client = getAI();

        const prompt = `Исправь грамматические ошибки в следующем тексте. Сохрани орфографию и пунктуацию без изменений. Исправь только грамматические конструкции, падежи, времена, согласования. Верни только исправленный текст без пояснений.

Текст:
${text}`;

        const result = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: { parts: [{ text: prompt }] }
        });

        const processedText = result.text?.trim() || text;

        return {
            success: true,
            text: processedText,
            provider: 'Gemini'
        };
    } catch (error) {
        console.error('Grammar fixing error:', error);
        return {
            success: false,
            text: text,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Последовательный pipeline обработки текста
 * Этапы: spelling → grammar → punctuation
 */
export async function processTextPipeline(
    text: string,
    options: PipelineOptions
): Promise<PipelineResult> {
    const {
        mode = 'general',
        tone = 'default',
        enableSpelling = true,
        enableGrammar = false, // По умолчанию отключен, так как Gemini хорошо справляется сразу
        enablePunctuation = true,
        lang = ['ru', 'en']
    } = options;

    const result: PipelineResult = {
        success: true,
        originalText: text,
        finalText: text,
        stages: {}
    };

    let currentText = text;

    try {
        // ЭТАП 1: Орфография (Яндекс.Спеллер)
        if (enableSpelling) {
            console.info('🔤 Pipeline Stage 1/3: Spelling correction...');
            const spellingResult = await fixSpelling(currentText, lang);
            result.stages.spelling = spellingResult;

            if (spellingResult.success && spellingResult.text) {
                currentText = spellingResult.text;
            }
        }

        // ЭТАП 2: Грамматика (опционально)
        if (enableGrammar) {
            console.info('📝 Pipeline Stage 2/3: Grammar correction...');
            const grammarResult = await fixGrammar(currentText, mode);
            result.stages.grammar = grammarResult;

            if (grammarResult.success && grammarResult.text) {
                currentText = grammarResult.text;
            }
        }

        // ЭТАП 3: Пунктуация
        if (enablePunctuation) {
            console.info('✏️ Pipeline Stage 3/3: Punctuation correction...');
            const punctuationResult = await fixPunctuation(currentText, mode, tone);
            result.stages.punctuation = punctuationResult;

            if (punctuationResult.success && punctuationResult.text) {
                currentText = punctuationResult.text;
            }
        }

        result.finalText = currentText;
        result.success = true;

        console.info('✅ Pipeline completed successfully');

    } catch (error) {
        console.error('Pipeline processing error:', error);
        result.success = false;
        result.error = error instanceof Error ? error.message : 'Unknown error';
        result.finalText = text; // Возвращаем оригинальный текст при ошибке
    }

    return result;
}

/**
 * АВТОМАТИЧЕСКАЯ: Исправление пунктуации (mode-aware)
 * - В режиме 'general': только пунктуация, никаких изменений стиля
 * - В режиме 'corrector': пунктуация + применение тональности для преобразования стиля
 * 
 * ПРОВАЙДЕРЫ (приоритет):
 * 1. Gemini (если настроен)
 * 2. Groq (Llama 3.3 70B)
 * 3. DeepSeek (если настроен)
 */
export async function fixPunctuation(text: string, mode: TranscriptionMode = 'general', tone: TonePreset = 'default'): Promise<ProcessingResult> {

    // Подготовка промпта для всех провайдеров
    const isGeneralMode = mode === 'general';

    let geminiPrompt: string;
    let llmSystemPrompt: string;

    if (isGeneralMode) {
        geminiPrompt = `Исправь пунктуацию в следующем тексте. Расставь запятые, точки, вопросительные и восклицательные знаки согласно правилам русского и английского языка. Сохрани весь контент без изменений, только добавь знаки препинания. Не добавляй никаких пояснений, верни только исправленный текст.

Текст:
${text}`;
        llmSystemPrompt = `Исправь пунктуацию в тексте. Расставь запятые, точки, вопросительные и восклицательные знаки. Сохрани весь контент без изменений, только добавь знаки препинания. Верни только исправленный текст без пояснений.`;
    } else {
        // Для 'corrector' и других режимов: применяем тональность
        const toneInstructions: Record<TonePreset, string> = {
            'default': '',
            'friendly': 'Используй теплый, разговорный и дружелюбный тон.',
            'serious': 'Используй строгий, формальный и серьезный тон.',
            'professional': 'Используй отполированный, деловой и профессиональный стиль.'
        };

        const toneInstruction = toneInstructions[tone] || '';

        geminiPrompt = `Исправь пунктуацию и улучши стиль следующего текста. ${toneInstruction} Расставь запятые, точки, вопросительные и восклицательные знаки. Сохрани ключевой смысл. Верни только исправленный текст без пояснений.

Текст:
${text}`;
        llmSystemPrompt = `Исправь пунктуацию и улучши стиль текста. ${toneInstruction} Расставь запятые, точки, вопросительные и восклицательные знаки. Сохрани ключевой смысл, но улучши формулировки. Верни только исправленный текст без пояснений.`;
    }

    // ПОПЫТКА 1: Gemini (если настроен)
    if (ai) {
        try {
            const result = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: { parts: [{ text: geminiPrompt }] }
            });

            const processedText = result.text?.trim() || text;

            return {
                success: true,
                text: processedText,
                provider: 'Gemini'
            };
        } catch (geminiError) {
            const errorMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
            console.warn('Gemini punctuation failed, trying fallback:', errorMsg);
            // Продолжаем к fallback провайдерам ниже
        }
    } else {
        console.info('Gemini not initialized for punctuation, using Groq directly');
    }

    // ПОПЫТКА 2: Groq (Llama 3.3 70B) - PRIMARY FALLBACK
    try {
        console.info('Using Groq for punctuation correction');

        const groqResult = await openaiService.chatCompletion(
            [
                { role: 'system', content: llmSystemPrompt },
                { role: 'user', content: text }
            ],
            'llama-3.3-70b-versatile'
        );

        if (groqResult?.choices?.[0]?.message?.content) {
            return {
                success: true,
                text: groqResult.choices[0].message.content.trim(),
                provider: 'Groq (Llama 3.3 70B)'
            };
        }
    } catch (groqErr) {
        console.warn('Groq punctuation failed, trying DeepSeek:', groqErr);
    }

    // ПОПЫТКА 3: DeepSeek (если настроен)
    const env = (import.meta as any).env || {};
    const dsKey = localStorage.getItem('VITE_DEEPSEEK_API_KEY') || env.VITE_DEEPSEEK_API_KEY || env.VITE_OPENAI_API_KEY;

    if (dsKey) {
        try {
            console.info('Using DeepSeek for punctuation correction');

            const dsModel = env.VITE_DEEPSEEK_MODEL || env.VITE_OPENAI_MODEL || 'deepseek-chat';
            const dsBaseUrl = env.VITE_DEEPSEEK_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.deepseek.com/v1';

            const dsResult = await openaiService.chatCompletion(
                [
                    { role: 'system', content: llmSystemPrompt },
                    { role: 'user', content: text }
                ],
                dsModel,
                dsBaseUrl,
                dsKey
            );

            if (dsResult?.choices?.[0]?.message?.content) {
                return {
                    success: true,
                    text: dsResult.choices[0].message.content.trim(),
                    provider: 'DeepSeek'
                };
            }
        } catch (dsErr) {
            console.warn('DeepSeek punctuation also failed:', dsErr);
        }
    }

    // Все провайдеры не сработали - возвращаем оригинальный текст
    console.warn('All punctuation providers failed, returning original text');
    return {
        success: false,
        text: text,
        error: 'All punctuation correction providers unavailable'
    };
}

/**
 * ОПЦИОНАЛЬНАЯ: Автоматическое форматирование с абзацами и заголовками
 */
export async function formatText(text: string): Promise<ProcessingResult> {
    try {
        const client = getAI();

        const prompt = `Отформатируй следующий текст для лучшей читаемости:
- Раздели на логические абзацы
- Добавь заголовки где уместно (используй ## для заголовков)
- Структурируй списки если есть перечисления
- Сохрани весь контент и смысл

Верни только отформатированный текст в формате Markdown, без пояснений.

Текст:
${text}`;

        const result = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: { parts: [{ text: prompt }] }
        });

        const processedText = result.text?.trim() || '';

        return {
            success: true,
            text: processedText
        };
    } catch (error) {
        console.error('Text formatting error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * ОПЦИОНАЛЬНАЯ: Улучшение стиля текста
 */
export async function improveStyle(text: string): Promise<ProcessingResult> {
    try {
        const client = getAI();

        const prompt = `Улучши стиль следующего текста:
- Сделай его более читаемым и профессиональным
- Устрани повторы и избыточность
- Улучши формулировки, сохраняя смысл
- Сделай текст более структурированным

Сохрани весь контент и ключевые идеи. Верни только улучшенный текст без пояснений.

Текст:
${text}`;

        const result = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: { parts: [{ text: prompt }] }
        });

        const processedText = result.text?.trim() || '';

        return {
            success: true,
            text: processedText
        };
    } catch (error) {
        console.error('Style improvement error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * ОПЦИОНАЛЬНАЯ: Извлечение ключевых пунктов
 */
export async function extractKeyPoints(text: string): Promise<ProcessingResult> {
    try {
        const client = getAI();

        const prompt = `Проанализируй следующий текст и извлеки ключевую информацию в формате JSON:
{
  "summary": "Краткое резюме текста в 2-3 предложениях",
  "actionItems": ["Список конкретных задач и действий"],
  "dates": ["Важные даты и дедлайны"],
  "keyTopics": ["Основные темы и ключевые слова"]
}

Если какой-то категории нет в тексте, верни пустой массив. Верни ТОЛЬКО валидный JSON без дополнительного текста.

Текст:
${text}`;

        const result = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: { parts: [{ text: prompt }] }
        });

        let responseText = result.text?.trim() || '{}';

        // Удаляем markdown code blocks если есть
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const keyPoints: KeyPoints = JSON.parse(responseText);

        return {
            success: true,
            keyPoints
        };
    } catch (error) {
        console.error('Key points extraction error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * ОПЦИОНАЛЬНАЯ: Перевод текста
 */
export async function translateText(text: string, targetLanguage: string): Promise<ProcessingResult> {
    try {
        const client = getAI();

        const languageNames: Record<string, string> = {
            'en': 'английский',
            'ru': 'русский',
            'es': 'испанский',
            'fr': 'французский',
            'de': 'немецкий',
            'it': 'итальянский',
            'pt': 'португальский',
            'zh': 'китайский',
            'ja': 'японский',
            'ko': 'корейский'
        };

        const langName = languageNames[targetLanguage] || targetLanguage;

        const prompt = `Переведи следующий текст на ${langName} язык. Сохрани форматирование и структуру. Верни только перевод без пояснений.

Текст:
${text}`;

        const result = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: { parts: [{ text: prompt }] }
        });

        const processedText = result.text?.trim() || '';

        return {
            success: true,
            text: processedText
        };
    } catch (error) {
        console.error('Translation error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Экспорт для использования в других модулях
export default {
    setPostProcessingApiKey,
    fixSpelling,
    fixGrammar,
    processTextPipeline,
    fixPunctuation,
    formatText,
    improveStyle,
    extractKeyPoints,
    translateText
};

