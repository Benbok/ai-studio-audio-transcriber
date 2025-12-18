import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2, Key, Palette, Keyboard } from 'lucide-react';
import { setGeminiApiKey, checkGeminiHealth } from '../services/geminiService';
import { setTranscriptionConfig } from '../services/openaiService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type TabType = 'api' | 'appearance' | 'shortcuts';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<TabType>('api');
    const [geminiKey, setGeminiKey] = useState('');
    const [groqKey, setGroqKey] = useState('');
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [msg, setMsg] = useState('');

    // Load from localStorage on open
    useEffect(() => {
        if (isOpen) {
            const gKey = localStorage.getItem('VITE_GEMINI_API_KEY') || '';
            const grKey = localStorage.getItem('VITE_GROQ_API_KEY') || '';
            setGeminiKey(gKey);
            setGroqKey(grKey);
            setStatus('idle');
            setMsg('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        setStatus('saving');
        setMsg('Проверка ключей и сохранение...');

        try {
            // Update Services
            if (geminiKey) setGeminiApiKey(geminiKey);
            if (groqKey) setTranscriptionConfig(groqKey);

            // Persist
            if (geminiKey) localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
            if (groqKey) localStorage.setItem('VITE_GROQ_API_KEY', groqKey);

            // Health check for Gemini
            if (geminiKey) {
                setMsg('Проверка ключа Gemini...');
                const health = await checkGeminiHealth();
                if (health.status !== 'ok') {
                    throw new Error(`Ошибка валидации ключа Gemini: ${health.detail || health.status}`);
                }
            }

            setStatus('success');
            setMsg('Настройки успешно сохранены!');
            setTimeout(onClose, 1500);

        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMsg(err.message || 'Не удалось сохранить настройки');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="glass-strong border border-gray-800/50 rounded-3xl w-full max-w-2xl shadow-2xl relative animate-scale-in">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white transition-all rounded-lg hover:bg-gray-800/50 interactive"
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
                <div className="p-6 min-h-[300px]">

                    {/* API Keys Tab */}
                    {activeTab === 'api' && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Gemini Key */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    Gemini API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        className="w-full glass border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-gray-700"
                                    />
                                    {geminiKey && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Check className="w-4 h-4 text-green-400" />
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Требуется для основной транскрибации
                                </p>
                            </div>

                            {/* Groq Key */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                    Groq API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={groqKey}
                                        onChange={(e) => setGroqKey(e.target.value)}
                                        placeholder="gsk_..."
                                        className="w-full glass border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all placeholder:text-gray-700"
                                    />
                                    {groqKey && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Check className="w-4 h-4 text-green-400" />
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Требуется для быстрого резервного варианта и коррекции Llama 3
                                </p>
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
                        disabled={status === 'saving' || activeTab !== 'api'}
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
