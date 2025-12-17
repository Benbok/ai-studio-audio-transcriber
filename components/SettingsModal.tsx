import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { setGeminiApiKey, checkGeminiHealth } from '../services/geminiService';
import { setTranscriptionConfig } from '../services/openaiService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
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
        setMsg('Validating keys and saving...');

        try {
            // 1. Update Services
            if (geminiKey) setGeminiApiKey(geminiKey);
            if (groqKey) setTranscriptionConfig(groqKey); // Assuming URL/Model defaults are fine

            // 2. Persist
            if (geminiKey) localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
            if (groqKey) localStorage.setItem('VITE_GROQ_API_KEY', groqKey);

            // 3. Simple Check (Optional: Could try to ping with new keys)
            // For now, just trust and save, validation happens on use or health check refresh.
            // But let's try a quick health check for Gemini at least since we have the function.
            if (geminiKey) {
                setMsg('Checking Gemini Key...');
                const health = await checkGeminiHealth();
                if (health.status !== 'ok') {
                    throw new Error(`Gemini Key Validation Failed: ${health.detail || health.status}`);
                }
            }

            setStatus('success');
            setMsg('Settings saved successfully!');
            setTimeout(onClose, 1500);

        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMsg(err.message || 'Failed to save settings');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    Settings ⚙️
                </h2>

                <div className="space-y-4">
                    {/* Gemini Key */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                            Gemini API Key
                        </label>
                        <input
                            type="password"
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-700"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Required for primary transcription.</p>
                    </div>

                    {/* Groq Key */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                            Groq API Key
                        </label>
                        <input
                            type="password"
                            value={groqKey}
                            onChange={(e) => setGroqKey(e.target.value)}
                            placeholder="gsk_..."
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-gray-700"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Required for fast fallback & Llama 3 correction.</p>
                    </div>

                    {/* Status Message */}
                    {status !== 'idle' && (
                        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${status === 'error' ? 'bg-red-500/10 text-red-400' :
                                status === 'success' ? 'bg-green-500/10 text-green-400' :
                                    'bg-blue-500/10 text-blue-400'
                            }`}>
                            {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
                            {status === 'success' && <Check className="w-4 h-4" />}
                            {status === 'error' && <AlertCircle className="w-4 h-4" />}
                            <span>{msg}</span>
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            onClick={handleSave}
                            disabled={status === 'saving'}
                            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status === 'saving' ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
