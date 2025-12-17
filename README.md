<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Запуск и развертывание приложения AI Studio

Здесь содержится всё необходимое для локального запуска приложения.

Просмотр приложения в AI Studio: https://ai.studio/apps/drive/1MO1wMAqVGFIYlI23gK3UZoo7cF7Iq7_s

## Локальный запуск

**Требования:** Node.js

1. Установите зависимости:
   `npm install`

2. Установите `GEMINI_API_KEY` в файле [.env.local](.env.local) — ваш API ключ Gemini

Опционально: настройте OpenAI как резервный провайдер (полезно при достижении лимитов Gemini):

- `OPENAI_API_KEY` (или `VITE_OPENAI_API_KEY` для клиентского использования) — ваш API ключ OpenAI (требуется при использовании резервного провайдера)
- `OPENAI_BASE_URL` (или `VITE_OPENAI_BASE_URL`) — опциональный пользовательский базовый URL для OpenAI (по умолчанию: `https://api.openai.com`)
- `OPENAI_MODEL` (или `VITE_OPENAI_MODEL`) — опциональная модель чата для завершения чата (по умолчанию: `gpt-4o-mini`)
- `OPENAI_TRANSCRIBE_MODEL` (или `VITE_OPENAI_TRANSCRIBE_MODEL`) — опциональная модель для транскрипции аудио (по умолчанию: `whisper-1`)
- `USE_OPENAI_FALLBACK=1` или `FALLBACK_PROVIDER=openai` (или `VITE_USE_OPENAI_FALLBACK` / `VITE_FALLBACK_PROVIDER` в клиенте) — включить автоматический переход на OpenAI при ошибках квоты Gemini (429)
- `OPENAI_FALLBACK_ON_ERRORS=1` (или `VITE_OPENAI_FALLBACK_ON_ERRORS=1` на клиенте) — если установлено, приложение попытается резервацию OpenAI при более широких классах ошибок (5xx, сетевые/таймауты), а не только 429.

Health checks

- Приложение выполняет лёгкие health-checks при старте, чтобы проверить доступность провайдеров. Статусы отображаются в UI:
  - **зелёный**: ok
  - **жёлтый**: degraded (rate-limited / server errors)
  - **красный**: auth / unreachable

Вы можете обновить статусы вручную — либо перезагрузив страницу, либо нажать кнопку **Refresh status** в приложении (она находится под информацией о моделях).
Примечание: Если вы добавляете или изменяете переменные окружения в `.env.local`, Vite требует перезапуска сервера для применения изменений. Для доступа на стороне клиента добавьте префикс `VITE_` к переменным окружения (например, `VITE_OPENAI_API_KEY` и `VITE_GEMINI_API_KEY`).

Пример использования в коде:

```ts
import OpenAIService from './services/openaiService';

const res = await OpenAIService.chatCompletion([{ role: 'user', content: 'Hello!' }]);
console.log(res.choices?.[0]?.message?.content ?? res);
```

Ручное тестирование

- Тест OpenAI чата: в node/repl с переменными окружения проекта запустите небольшой скрипт, который импортирует `./services/openaiService` и вызывает `chatCompletion` (см. пример выше).
- Тест транскрипции OpenAI: вызовите `transcribeAudioOpenAI` с аудио `Blob` (например, из файлового ввода) и убедитесь, что возвращается текст.
- Тест поведения резервного провайдера:
  1. Установите `USE_OPENAI_FALLBACK=1` и убедитесь, что `OPENAI_API_KEY` установлен.
  2. Временно уменьшите квоту Gemini (или симулируйте 429 в разработке) и сделайте запрос транскрипции — приложение должно использовать OpenAI как резервный вариант и вернуть результат.

3. Запустите приложение:
   `npm run dev`
