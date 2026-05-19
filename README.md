<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Voice Scribe - автотранскрибация с автокопированием

Настольное Electron-приложение для транскрибации речи в текст через Gemini 2.5 Flash.
Аудио с микрофона отправляется в один LLM-вызов, результат автоматически копируется в буфер и сохраняется в историю.

Статус документации: актуально на 19.05.2026.

---

## Что умеет приложение

- Транскрибация RU/EN с автоисправлением пунктуации и орфографии
- Три режима обработки: общий, официальный стиль, перевод RU -> EN
- Автокопирование результата в буфер обмена
- История записей в IndexedDB с возможностью перетранскрибации
- Мини-режим окна (100x100) с анимацией перехода
- Отображение статуса доступности Gemini и использования дневной квоты

---

## Актуальная архитектура

```text
Electron Main (electron/main.cjs)
  - Frameless + transparent BrowserWindow
  - Размер normal-режима: 1040x720 (min: 900x600)
  - IPC: mini-mode, window controls, fetch-api, always-on-top
  - Чтение .env.local и передача env в renderer

Preload (electron/preload.cjs)
  - contextBridge: window.electronEnv
  - contextBridge: window.electronAPI

Renderer (React + Vite)
  - App.tsx: запись, UI-режимы окна, hotkeys, health/quota
  - services/geminiService.ts: единый LLM-клиент и промпты
  - services/storageService.ts: история записей (IndexedDB)
  - services/quotaService.ts: дневная квота (localStorage)
```

Поток транскрибации:

```text
Microphone -> MediaRecorder -> Blob -> base64 -> Gemini 2.5 Flash
-> text -> copyToClipboard -> saveRecording(IndexedDB)
```

---

## Режимы транскрибации

| Режим | Код | Поведение |
|---|---|---|
| Общий | `general` | Точная транскрипция RU/EN, чистка слов-паразитов, пунктуация |
| Официальный | `corrector` | Транскрипция с приведением к официально-деловому стилю на русском |
| Перевод | `translator` | Транскрипция и перевод с русского на английский |

---

## Окно и управление

- Normal-режим: 1040x720, минимальный размер 900x600
- Mini-режим: фиксированный квадрат 100x100
- Переход между режимами анимирован
- В normal-режиме доступны кнопки свернуть и закрыть
- Поддержан always-on-top через IPC

IPC-каналы:

| Канал | Направление | Назначение |
|---|---|---|
| `env-vars` | main -> renderer | Передача env из `.env.local` |
| `toggle-mini-mode` | renderer -> main | Переключение mini-режима |
| `minimize-window` | renderer -> main | Свернуть окно |
| `close-window` | renderer -> main | Закрыть окно |
| `set-always-on-top` | renderer -> main | Режим поверх всех окон |
| `fetch-api` | renderer -> main | HTTP-запросы из main-процесса (обход CORS) |

---

## Сервисы

### services/geminiService.ts
- `transcribeAudio(blob, mode)` - основная транскрибация
- `checkGeminiHealth()` - быстрый health-check модели
- `setGeminiApiKey(key)` - runtime-обновление API-ключа
- Retry до 3 попыток с backoff для 429/503

### services/storageService.ts
- Хранилище истории в IndexedDB
- Сохранение аудио, текста, режима, длительности и времени

### services/quotaService.ts
- Локальный учет дневной квоты токенов
- Подписка UI на обновления квоты

---

## Технологический стек

| Слой | Технология |
|---|---|
| UI | React 19 + TypeScript |
| Сборка frontend | Vite 6 |
| Desktop | Electron 39 |
| Стили | Tailwind CSS 3 |
| LLM SDK | `@google/genai` |
| Упаковка | electron-builder |
| Хранилище | IndexedDB + localStorage |

---

## Установка и запуск

Требования: Node.js 18+

1) Установить зависимости:

```bash
npm install
```

2) Создать `.env.local` в корне проекта:

```env
GEMINI_API_KEY=your_key_here
```

3) Запустить проект:

```bash
# только frontend
npm run dev

# frontend + electron
npm run electron:dev
```

---

## Сборка

```bash
npm run dist
```

Артефакты сборки попадают в папку `release/`.

Для запуска собранного приложения положите `.env.local` рядом с `.exe`, чтобы ключи были доступны main-процессу при старте.

---

## Горячая клавиша

| Клавиша | Действие |
|---|---|
| Пробел | Старт/стоп записи (когда фокус не в input/textarea) |

---

## Переменные окружения

| Переменная | Обязательна | Где читается |
|---|---|---|
| `GEMINI_API_KEY` | Да | Electron env + fallback в runtime |
| `VITE_GEMINI_API_KEY` | Нет | Vite env fallback |

Ключ также можно установить через настройки приложения, он сохраняется в localStorage и применяется без перезапуска.

---

## Структура проекта

```text
voicescribe-auto-copy/
  electron/
    main.cjs
    preload.cjs
  components/
    RecordButton.tsx
    Visualizer.tsx
    TranscriptionResult.tsx
    SettingsModal.tsx
    RecordingsList.tsx
    ConfirmDialog.tsx
    DevTools.tsx
  services/
    geminiService.ts
    storageService.ts
    quotaService.ts
    postProcessingService.ts
  App.tsx
  types.ts
  package.json
```

## Changelog

### 19.05.2026 - TASK-001
- Обновлено окно Electron: базовый размер уменьшен до 1040x720, минимальный размер до 900x600.
- Усилено скругление внешней рамки основного окна.
- Кнопки top-меню перестроены в 2 ряда:
  - 1-й ряд: свернуть, закрыть.
  - 2-й ряд: мини-режим, история, настройки.
- Исправлена кнопка закрытия в окне настроек.
- Добавлена одноразовая зеленая анимация в mini-mode после завершения транскрипции (примерно 2.2 секунды).
