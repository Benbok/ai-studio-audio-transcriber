@echo off
chcp 65001 >nul

REM Проверка наличия node_modules
if not exist "node_modules" (
    call npm install >nul 2>&1
)

REM Проверка наличия .env.local
if not exist ".env.local" (
    echo [ВНИМАНИЕ] Файл .env.local не найден!
    echo Создайте файл .env.local и добавьте ваш GEMINI_API_KEY
    pause
    exit /b
)

REM Настройка целевого порта и URL (используем порт 8081)
set TARGET_PORT=8081
set TARGET_URL=http://localhost:%TARGET_PORT%

REM Открытие браузера сразу (один раз) — URL будет http://localhost:8081
set WINDOW_WIDTH=550
set WINDOW_HEIGHT=750

REM Небольшая задержка перед открытием браузера, чтобы сервер начал слушать
timeout /t 3 /nobreak >nul

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --new-window --window-size=%WINDOW_WIDTH%,%WINDOW_HEIGHT% --app=%TARGET_URL%
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --new-window --window-size=%WINDOW_WIDTH%,%WINDOW_HEIGHT% --app=%TARGET_URL%
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --new-window --window-size=%WINDOW_WIDTH%,%WINDOW_HEIGHT% --app=%TARGET_URL%
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --new-window --window-size=%WINDOW_WIDTH%,%WINDOW_HEIGHT% --app=%TARGET_URL%
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --new-window --window-size=%WINDOW_WIDTH%,%WINDOW_HEIGHT% --app=%TARGET_URL%
) else (
    REM Если Chrome/Edge не найден, используем стандартный браузер
    start %TARGET_URL%
)

REM Запуск dev-сервера в текущем терминале, чтобы видеть логи (браузер открылся уже)
echo Запускаю dev-сервер на %TARGET_URL% ...
npm run dev -- --port %TARGET_PORT%

:end

