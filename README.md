# Voice Scribe

Electron-приложение для записи речи с микрофона, транскрибации через Gemini и автокопирования результата в буфер обмена.

## Что делает

- Записывает аудио с микрофона.
- Отправляет запись в Gemini 2.5 Flash одним запросом.
- Возвращает готовый текст и сразу копирует его в буфер.
- Сохраняет историю в IndexedDB.
- Поддерживает 3 режима: `general`, `corrector`, `translator`.

## Стек

- React 19 + TypeScript
- Vite 6
- Electron 39
- Tailwind CSS 3
- `@google/genai`

## Быстрый старт

Требования: Node.js 18+.

1. Установить зависимости.

```bash
npm install
```

2. Создать файл `.env` в корне.

```env
GEMINI_API_KEY=your_key_here
```

3. Запуск.

```bash
# frontend
npm run dev

# frontend + electron
npm run electron:dev
```

## Основные команды

```bash
npm run dev                    # Vite
npm run electron:dev           # dev-режим Electron + Vite
npm run build                  # сборка frontend
npm run dist                   # desktop-сборка через electron-builder
npm run electron:release:check # smoke-проверка релизного контура
```

## Переменные окружения

- `GEMINI_API_KEY` - основной ключ Gemini.
- `VITE_GEMINI_API_KEY` - fallback для renderer.

## Архитектура

- `electron/main.cjs` - окно, IPC, загрузка env.
- `electron/preload.cjs` - безопасный мост `window.electronAPI`.
- `App.tsx` - orchestration UI, запись, hotkeys, режимы.
- `services/geminiService.ts` - транскрибация и health-check Gemini.
- `services/storageService.ts` - история записей (IndexedDB).
- `services/quotaService.ts` - локальный учет дневной квоты.

Поток данных:

`Microphone -> MediaRecorder -> Blob -> Gemini -> Text -> Clipboard + IndexedDB`

## Структура проекта

```text
voicescribe-auto-copy/
  electron/
    main.cjs
    preload.cjs
  components/
  services/
  App.tsx
  types.ts
```
