/**
 * Сервис для работы с Яндекс.Спеллер API
 * Документация: https://yandex.ru/dev/speller/doc/ru/concepts/api-overview
 */

export interface SpellingError {
    code: number;      // Код ошибки
    pos: number;       // Позиция начала ошибки в тексте
    row: number;       // Номер строки (с 0)
    col: number;       // Номер колонки (с 0)
    len: number;       // Длина ошибочного слова
    word: string;      // Ошибочное слово
    s: string[];       // Массив вариантов исправления
}

export interface SpellingResult {
    success: boolean;
    text?: string;
    errors?: SpellingError[];
    correctedCount?: number;
    error?: string;
}

// Опции для проверки орфографии
const SPELLER_OPTIONS = {
    IGNORE_URLS: 2,           // Игнорировать URL
    FIND_REPEAT_WORDS: 4,     // Находить повторы слов
    IGNORE_CAPITALIZATION: 512 // Игнорировать неправильную капитализацию (опционально)
};

/**
 * Проверка орфографии текста через Яндекс.Спеллер API
 */
export async function checkSpelling(
    text: string,
    lang: string[] = ['ru', 'en'],
    options: number = SPELLER_OPTIONS.IGNORE_URLS
): Promise<SpellingResult> {
    if (!text || text.trim().length === 0) {
        return {
            success: true,
            text: text,
            errors: [],
            correctedCount: 0
        };
    }

    // Ограничение API - максимум 10000 символов
    if (text.length > 10000) {
        console.warn('Text too long for Yandex.Speller (max 10000 chars), truncating...');
        text = text.substring(0, 10000);
    }

    try {
        const url = 'https://speller.yandex.net/services/spellservice.json/checkText';

        // Формируем параметры запроса
        const formData = new URLSearchParams();
        formData.append('text', text);
        formData.append('lang', lang.join(','));
        formData.append('options', options.toString());
        formData.append('format', 'plain'); // plain или html

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        });

        if (!response.ok) {
            throw new Error(`Yandex.Speller API error: ${response.status} ${response.statusText}`);
        }

        const errors: SpellingError[] = await response.json();

        // Применяем исправления
        const correctedText = applyCorrections(text, errors);

        return {
            success: true,
            text: correctedText,
            errors: errors,
            correctedCount: errors.length
        };

    } catch (error) {
        console.error('Yandex.Speller API error:', error);
        return {
            success: false,
            text: text, // Возвращаем оригинальный текст при ошибке
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Применение исправлений к тексту
 * Обрабатываем ошибки от конца к началу, чтобы не сбивать позиции
 */
function applyCorrections(text: string, errors: SpellingError[]): string {
    if (!errors || errors.length === 0) {
        return text;
    }

    // Сортируем ошибки по позиции в обратном порядке (от конца к началу)
    const sortedErrors = [...errors].sort((a, b) => b.pos - a.pos);

    let result = text;
    let correctedCount = 0;

    for (const error of sortedErrors) {
        // Берем первое предложенное исправление, если оно есть
        if (error.s && error.s.length > 0) {
            const correction = error.s[0];
            const before = result.substring(0, error.pos);
            const after = result.substring(error.pos + error.len);

            result = before + correction + after;
            correctedCount++;
        }
    }

    if (correctedCount > 0) {
        console.info(`✓ Yandex.Speller corrected ${correctedCount} spelling error(s)`);
    }

    return result;
}

/**
 * Пакетная проверка нескольких текстов
 * Используется метод checkTexts API
 */
export async function checkMultipleTexts(
    texts: string[],
    lang: string[] = ['ru', 'en'],
    options: number = SPELLER_OPTIONS.IGNORE_URLS
): Promise<SpellingResult[]> {
    if (!texts || texts.length === 0) {
        return [];
    }

    try {
        const url = 'https://speller.yandex.net/services/spellservice.json/checkTexts';

        const formData = new URLSearchParams();
        texts.forEach(text => formData.append('text', text));
        formData.append('lang', lang.join(','));
        formData.append('options', options.toString());
        formData.append('format', 'plain');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        });

        if (!response.ok) {
            throw new Error(`Yandex.Speller API error: ${response.status} ${response.statusText}`);
        }

        const errorsArray: SpellingError[][] = await response.json();

        return texts.map((text, index) => {
            const errors = errorsArray[index] || [];
            const correctedText = applyCorrections(text, errors);

            return {
                success: true,
                text: correctedText,
                errors: errors,
                correctedCount: errors.length
            };
        });

    } catch (error) {
        console.error('Yandex.Speller API error (multiple texts):', error);
        // При ошибке возвращаем оригинальные тексты
        return texts.map(text => ({
            success: false,
            text: text,
            error: error instanceof Error ? error.message : 'Unknown error'
        }));
    }
}

export default {
    checkSpelling,
    checkMultipleTexts
};
