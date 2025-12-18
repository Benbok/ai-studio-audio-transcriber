import { GoogleGenAI } from '@google/genai';

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
 */
function getAI() {
    if (!ai) {
        // Попытка получить ключ из переменных окружения
        const env = (import.meta as any).env || {};
        const electronEnv = typeof window !== 'undefined' ? ((window as any).electronEnv || {}) : {};
        const key = electronEnv.GEMINI_API_KEY || electronEnv.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;

        if (key) {
            setPostProcessingApiKey(key);
        } else {
            throw new Error('Gemini API key not configured for post-processing');
        }
    }
    return ai!;
}

/**
 * АВТОМАТИЧЕСКАЯ: Исправление пунктуации
 * Вызывается автоматически после каждой транскрибации
 */
export async function fixPunctuation(text: string): Promise<ProcessingResult> {
    try {
        const client = getAI();

        const prompt = `Исправь пунктуацию в следующем тексте. Расставь запятые, точки, вопросительные и восклицательные знаки согласно правилам русского и английского языка. Сохрани весь контент без изменений, только добавь знаки препинания. Не добавляй никаких пояснений, верни только исправленный текст.

Текст:
${text}`;

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
        console.error('Punctuation fixing error:', error);
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
