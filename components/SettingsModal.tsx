import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2, Key, Palette, Keyboard, Zap, Download, RefreshCw } from 'lucide-react';
import { setGeminiApiKey, setGeminiModel, getGeminiModel, getGeminiModelOptions, checkGeminiHealth } from '../services/geminiService';
import { DEFAULT_QUOTA_CONFIG, getQuotaConfig, setQuotaConfig, getQuotaPercentage, getQuotaWarning, subscribeToQuotaUpdates } from '../services/quotaService';
import type { UpdaterState } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    updaterState: UpdaterState;
    isCheckingUpdates: boolean;
    isInstallingUpdate: boolean;
    onCheckUpdates: () => Promise<void>;
    onDownloadUpdate: () => Promise<void>;
    onInstallUpdate: () => Promise<void>;
}

type TabType = 'api' | 'appearance' | 'shortcuts';

const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    updaterState,
    isCheckingUpdates,
    isInstallingUpdate,
    onCheckUpdates,
    onDownloadUpdate,
    onInstallUpdate,
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('api');
    const [geminiKey, setGeminiKey] = useState('');
    const [geminiModel, setGeminiModelState] = useState(getGeminiModel());
    const [geminiModelOptions, setGeminiModelOptions] = useState<Array<{ id: string; label: string }>>([
        { id: getGeminiModel(), label: getGeminiModel() },
    ]);
    const [hasStoredGeminiKey, setHasStoredGeminiKey] = useState(false);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [msg, setMsg] = useState('');
    const [quotaConfig, setQuotaState] = useState(() => getQuotaConfig() || DEFAULT_QUOTA_CONFIG);
    const [dailyLimit, setDailyLimit] = useState(quotaConfig?.dailyLimit?.toString() || '1500');

    // Load from localStorage on open
    useEffect(() => {
        if (isOpen) {
            const readElectronEnv = (key: string): string => {
                const env = window.electronEnv as any;
                if (typeof env?.[key] === 'string') return env[key];
                if (typeof env?.get === 'function') {
                    const value = env.get(key);
                    return typeof value === 'string' ? value : '';
                }
                return '';
            };

            const storedKey = (localStorage.getItem('VITE_GEMINI_API_KEY') || '').trim();
            const envKey = (
                readElectronEnv('GEMINI_API_KEY')
                || readElectronEnv('VITE_GEMINI_API_KEY')
                || ''
            ).trim();

            const storedModel = (localStorage.getItem('VITE_GEMINI_MODEL') || '').trim();
            const envModel = (
                readElectronEnv('GEMINI_MODEL')
                || readElectronEnv('VITE_GEMINI_MODEL')
                || ''
            ).trim();

            const hasKey = Boolean(storedKey || envKey);
            const quota = getQuotaConfig();
            const modelToUse = storedModel || envModel || getGeminiModel();

            // Security UX: never prefill API key input with stored value.
            setGeminiKey('');
            setGeminiModelState(modelToUse);
            setHasStoredGeminiKey(hasKey);

            void getGeminiModelOptions(true)
                .then((options) => {
                    const normalizedOptions = options.length > 0
                        ? options
                        : [{ id: modelToUse, label: modelToUse }];

                    if (!normalizedOptions.some((opt) => opt.id === modelToUse)) {
                        normalizedOptions.unshift({ id: modelToUse, label: modelToUse });
                    }

                    setGeminiModelOptions(normalizedOptions);
                })
                .catch(() => {
                    setGeminiModelOptions([{ id: modelToUse, label: modelToUse }]);
                });

            if (quota) {
                setQuotaState(quota);
                setDailyLimit(quota.dailyLimit.toString());
            }
            setStatus('idle');
            setMsg('');
        }
    }, [isOpen]);

    useEffect(() => {
        return subscribeToQuotaUpdates((updated) => {
            setQuotaState(updated);
        });
    }, []);

    const handleSave = async () => {
        setStatus('saving');
        setMsg('Проверка ключей и сохранение...');

        try {
            const sanitizedGeminiKey = geminiKey.trim();
            const sanitizedGeminiModel = geminiModel.trim();

            // Update Services
            if (sanitizedGeminiKey) {
                setGeminiApiKey(sanitizedGeminiKey);
            }
            setGeminiModel(sanitizedGeminiModel);

            // Persist
            if (sanitizedGeminiKey) {
                localStorage.setItem('VITE_GEMINI_API_KEY', sanitizedGeminiKey);
                setHasStoredGeminiKey(true);
            }
            localStorage.setItem('VITE_GEMINI_MODEL', sanitizedGeminiModel);
            
            // Save quota config
            const limit = parseInt(dailyLimit) || 1500;
            const updatedQuota = setQuotaConfig({ dailyLimit: limit });
            setQuotaState(updatedQuota);
            setDailyLimit(updatedQuota.dailyLimit.toString());

            // Health check for Gemini
            if (sanitizedGeminiKey) {
                setMsg('Проверка ключа Gemini...');
                try {
                    const health = await checkGeminiHealth();
                    if (health.status !== 'ok') {
                        console.warn('Gemini validation warning:', health.detail || health.status);
                    }
                } catch (err) {
                    console.warn('Gemini health check failed (non-critical):', err);
                }
            }

            setStatus('success');
            setMsg(sanitizedGeminiKey ? 'Настройки успешно сохранены!' : 'Лимит квоты сохранен. API ключ не изменен.');
            setTimeout(onClose, 1500);

        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMsg(err.message || 'Не удалось сохранить настройки');
        }
    };

    const handleClearGeminiKey = () => {
        localStorage.removeItem('VITE_GEMINI_API_KEY');
        setGeminiKey('');
        setHasStoredGeminiKey(false);
        setStatus('success');
        setMsg('Сохраненный Gemini API ключ удален.');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="glass-strong border border-gray-800/50 rounded-3xl w-full max-w-2xl max-h-[calc(100vh-2rem)] shadow-2xl relative animate-scale-in flex flex-col">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    type="button"
                    aria-label="Закрыть настройки"
                    className="absolute top-6 right-6 z-20 no-drag p-2 text-gray-500 hover:text-white transition-all rounded-lg hover:bg-gray-800/50 interactive"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="p-6 border-b border-gray-800/50">
                    <h2 className="text-2xl font-bold gradient-text flex items-center gap-3">
                        Настройки
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">Конфигурация приложения Voice Scribe</p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800/50 px-6">
                    {[
                        { id: 'api' as TabType, label: 'API Ключи', icon: Key },
                        { id: 'appearance' as TabType, label: 'Внешний вид', icon: Palette },
                        { id: 'shortcuts' as TabType, label: 'Горячие клавиши', icon: Keyboard },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative ${activeTab === tab.id
                                ? 'text-blue-400'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-primary"></div>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-6 min-h-0 overflow-y-auto custom-scrollbar flex-1">

                    {/* API Keys Tab */}
                    {activeTab === 'api' && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Gemini Key - PRIMARY PROVIDER */}
                            <div className="border-2 border-blue-500/30 rounded-xl p-4 bg-blue-500/5">
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                    Gemini API Key ✨ (Основной провайдер)
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        className="w-full glass border border-blue-500/50 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-gray-700"
                                    />
                                    {geminiKey && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Check className="w-4 h-4 text-green-400" />
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-blue-300 mt-2 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Поле всегда пустое при открытии. Ключ сохраняется только после ручного ввода и кнопки "Сохранить изменения".
                                </p>

                                {hasStoredGeminiKey && (
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <p className="text-xs text-gray-400">В приложении уже есть сохраненный Gemini API ключ.</p>
                                        <button
                                            type="button"
                                            onClick={handleClearGeminiKey}
                                            className="px-2 py-1 rounded-md text-xs bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20"
                                        >
                                            Удалить ключ
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Gemini Model */}
                            <div className="border border-blue-500/30 rounded-xl p-4 bg-blue-500/5">
                                <label className="block text-sm font-semibold text-gray-200 mb-2">
                                    Модель Gemini для транскрибации
                                </label>
                                <select
                                    value={geminiModel}
                                    onChange={(e) => setGeminiModelState(e.target.value)}
                                    className="w-full glass border border-blue-500/50 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-900/60"
                                >
                                    {geminiModelOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-blue-300 mt-2">
                                    Список загружается из Gemini ListModels и показывает только недорогие Flash/Lite модели для транскрибации.
                                </p>
                            </div>

                            {/* Gemini Quota Settings */}
                            <div className="border-2 border-blue-500/30 rounded-xl p-4 bg-blue-500/5">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                                        <Zap className="w-4 h-4 text-blue-400" />
                                        Gemini - Лимиты квоты
                                    </label>
                                </div>

                                {/* Quota Display */}
                                <div className="space-y-3 mb-4">
                                    <div className="bg-gray-900/50 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-gray-400">Использовано сегодня</span>
                                            <span className="text-sm font-semibold text-blue-400">
                                                {quotaConfig?.usedToday || 0} / {quotaConfig?.dailyLimit || 1500} токенов
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-300 ${
                                                    ((quotaConfig?.usedToday || 0) / (quotaConfig?.dailyLimit || 1500)) > 0.9
                                                        ? 'bg-red-500'
                                                        : (quotaConfig?.usedToday || 0) / (quotaConfig?.dailyLimit || 1500) > 0.75
                                                            ? 'bg-yellow-500'
                                                            : 'bg-blue-500'
                                                }`}
                                                style={{
                                                    width: `${Math.min(100, ((quotaConfig?.usedToday || 0) / (quotaConfig?.dailyLimit || 1500)) * 100)}%`
                                                }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-2 text-xs text-gray-500">
                                            <span>Осталось: {Math.max(0, (quotaConfig?.dailyLimit || 1500) - (quotaConfig?.usedToday || 0))} токенов</span>
                                            <span>{Math.round(getQuotaPercentage(quotaConfig))}%</span>
                                        </div>
                                    </div>

                                    {/* Breakdown */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-gray-900/30 p-2 rounded">
                                            <div className="text-gray-500">Input токены</div>
                                            <div className="font-semibold text-blue-300">{quotaConfig?.categories?.input || 0}</div>
                                        </div>
                                        <div className="bg-gray-900/30 p-2 rounded">
                                            <div className="text-gray-500">Output токены</div>
                                            <div className="font-semibold text-green-300">{quotaConfig?.categories?.output || 0}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Daily Limit Editor */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 mb-2">
                                        Установить дневной лимит токенов
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            value={dailyLimit}
                                            onChange={(e) => setDailyLimit(e.target.value)}
                                            placeholder="1500"
                                            min="100"
                                            max="10000"
                                            className="flex-1 glass border border-blue-500/50 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-400 outline-none transition-all"
                                        />
                                        <span className="text-xs text-gray-500 flex items-center px-2 py-2 bg-gray-900/50 rounded-lg">
                                            токен/день
                                        </span>
                                    </div>
                                </div>

                                {/* Warning if needed */}
                                {quotaConfig && getQuotaWarning(quotaConfig) && (
                                    <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                        <p className="text-xs text-yellow-400 flex items-center gap-1.5">
                                            <AlertCircle className="w-3 h-3" />
                                            {getQuotaWarning(quotaConfig)}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Status Message */}
                            {status !== 'idle' && (
                                <div className={`flex items-center gap-3 text-sm p-4 rounded-xl border animate-slide-down ${status === 'error'
                                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                    : status === 'success'
                                        ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                        : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                    }`}>
                                    {status === 'saving' && <Loader2 className="w-5 h-5 animate-spin" />}
                                    {status === 'success' && <Check className="w-5 h-5" />}
                                    {status === 'error' && <AlertCircle className="w-5 h-5" />}
                                    <span className="font-medium">{msg}</span>
                                </div>
                            )}

                            <div className="border border-white/10 rounded-xl p-4 bg-white/5">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-200">Обновления приложения</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Статус: <span className="text-gray-300">{updaterState.status}</span>
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => void onCheckUpdates()}
                                        disabled={isCheckingUpdates}
                                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            {isCheckingUpdates ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            Проверить
                                        </span>
                                    </button>
                                </div>

                                <p className="text-xs text-gray-400 min-h-4">{updaterState.message || 'Нет новых сообщений.'}</p>

                                {updaterState.status === 'downloading' && (
                                    <div className="mt-3">
                                        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 transition-all duration-300"
                                                style={{ width: `${Math.max(0, Math.min(100, updaterState.progressPercent))}%` }}
                                            />
                                        </div>
                                        <p className="text-[11px] text-blue-300 mt-1">{Math.round(updaterState.progressPercent)}%</p>
                                    </div>
                                )}

                                {updaterState.status === 'available' && (
                                    <button
                                        onClick={() => void onDownloadUpdate()}
                                        className="mt-3 px-3 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-xs text-white"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <Download className="w-3 h-3" />
                                            Скачать обновление
                                        </span>
                                    </button>
                                )}

                                {updaterState.status === 'downloaded' && (
                                    <button
                                        onClick={() => void onInstallUpdate()}
                                        disabled={isInstallingUpdate}
                                        className="mt-3 px-3 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            {isInstallingUpdate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                            Перезапустить и установить
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Appearance Tab */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-5 animate-fade-in">
                            <div className="text-center py-12">
                                <Palette className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                <p className="text-gray-400">Настройки внешнего вида скоро появятся</p>
                                <p className="text-gray-600 text-sm mt-2">Темная/светлая тема, размер шрифта и др.</p>
                            </div>
                        </div>
                    )}

                    {/* Shortcuts Tab */}
                    {activeTab === 'shortcuts' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 glass rounded-xl border border-gray-800/50">
                                    <span className="text-sm text-gray-300">Начать/остановить запись</span>
                                    <kbd className="px-3 py-1 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-400">
                                        Пробел
                                    </kbd>
                                </div>
                                <div className="flex items-center justify-between p-3 glass rounded-xl border border-gray-800/50">
                                    <span className="text-sm text-gray-300">Открыть настройки</span>
                                    <kbd className="px-3 py-1 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-400">
                                        Ctrl + ,
                                    </kbd>
                                </div>
                                <div className="flex items-center justify-between p-3 glass rounded-xl border border-gray-800/50">
                                    <span className="text-sm text-gray-300">Копировать результат</span>
                                    <kbd className="px-3 py-1 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-400">
                                        Ctrl + C
                                    </kbd>
                                </div>
                            </div>

                            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                                <p className="text-xs text-blue-400 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Настройка пользовательских горячих клавиш будет доступна в следующей версии
                                </p>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 glass border border-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-800/50 transition-all interactive"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={status === 'saving'}
                        className="flex-1 py-3 bg-gradient-primary text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all interactive disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {status === 'saving' ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Сохранение...
                            </span>
                        ) : (
                            'Сохранить изменения'
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default SettingsModal;
