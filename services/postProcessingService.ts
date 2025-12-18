import { GoogleGenAI } from '@google/genai';
import openaiService from './openaiService'; // Static import for fallback chain
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
 * АВТОМАТИЧЕСКАЯ: Исправление пунктуации (mode-aware)
 * - В режиме 'general': только пунктуация, никаких изменений стиля
 * - В режиме 'corrector': пунктуация + применение тональности для преобразования стиля
 */
export async function fixPunctuation(text: string, mode: TranscriptionMode = 'general', tone: TonePreset = 'default'): Promise<ProcessingResult> {
    try {
        const client = getAI();

        // Для режима 'general' — только пунктуация без изменения стиля
        const isGeneralMode = mode === 'general';

        let prompt: string;
        if (isGeneralMode) {
            prompt = `Исправь пунктуацию в следующем тексте. Расставь запятые, точки, вопросительные и восклицательные знаки согласно правилам русского и английского языка. Сохрани весь контент без изменений, только добавь знаки препинания. Не добавляй никаких пояснений, верни только исправленный текст.

Текст:
${text}`;
        } else {
            // Для 'corrector' и других режимов: применяем тональность
            const toneInstructions: Record<TonePreset, string> = {
                'default': '',
                'friendly': 'Используй теплый, разговорный и дружелюбный тон.',
                'serious': 'Используй строгий, формальный и серьезный тон.',
                'professional': 'Используй отполированный, деловой и профессиональный стиль.'
            };

            const toneInstruction = toneInstructions[tone] || '';

            prompt = `Исправь пунктуацию и улучши стиль следующего текста. ${toneInstruction} Расставь запятые, точки, вопросительные и восклицательные знаки. Сохрани ключевой смысл. Верни только исправленный текст без пояснений.

Текст:
${text}`;
        }

        const result = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: { parts: [{ text: prompt }] }
        });

        const processedText = result.text?.trim() || text;

        return {
            success: true,
            text: processedText
        };
    } catch (error) {
        console.warn('Punctuation fixing error:', error);

        // Fallback to Groq/OpenAI if Gemini fails (e.g., quota exceeded)
        const errorMsg = error instanceof Error ? error.message : String(error);
        const PUNCTUATION_PROMPT = mode === 'general'
            ? `Исправь пунктуацию в тексте. Расставь запятые, точки, вопросительные и восклицательные знаки. Сохрани весь контент без изменений, только добавь знаки препинания. Верни только исправленный текст без пояснений.`
            : `Исправь пунктуацию и улучши стиль текста. Расставь запятые, точки, вопросительные и восклицательные знаки. Сохрани ключевой смысл, но улучши формулировки. Верни только исправленный текст без пояснений.`;

        if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
            try {
                console.info('Gemini quota exceeded for punctuation — attempting Groq fallback');

                const fallbackResult = await openaiService.chatCompletion(
                    [
                        { role: 'system', content: PUNCTUATION_PROMPT },
                        { role: 'user', content: text }
                    ],
                    'llama-3.3-70b-versatile'
                );

                if (fallbackResult?.choices?.[0]?.message?.content) {
                    return {
                        success: true,
                        text: fallbackResult.choices[0].message.content.trim(),
                        provider: 'Groq (Llama 3)'
                    };
                }
            } catch (fallbackErr) {
                console.warn('Groq fallback also failed, trying DeepSeek:', fallbackErr);

                // DeepSeek Fallback (Tier 3)
                const env = (import.meta as any).env || {};
                const dsKey = localStorage.getItem('VITE_DEEPSEEK_API_KEY') || env.VITE_DEEPSEEK_API_KEY || env.VITE_OPENAI_API_KEY;

                if (dsKey) {
                    try {
                        console.info('Attempting DeepSeek fallback for punctuation');

                        const dsModel = env.VITE_DEEPSEEK_MODEL || env.VITE_OPENAI_MODEL || 'deepseek-chat';
                        const dsBaseUrl = env.VITE_DEEPSEEK_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.deepseek.com/v1';

                        const dsResult = await openaiService.chatCompletion(
                            [
                                { role: 'system', content: PUNCTUATION_PROMPT },
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
                        console.warn('DeepSeek fallback also failed:', dsErr);
                    }
                }
            }
        }

        return {
            success: false,
            text: text, // Возвращаем оригинал при ошибке
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
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
    fixPunctuation,
    formatText,
    improveStyle,
    extractKeyPoints,
    translateText
};
