import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Подтвердить',
    cancelLabel = 'Отмена',
    onConfirm,
    onCancel,
    variant = 'danger'
}) => {
    if (!isOpen) return null;

    const variantStyles = {
        danger: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20',
        warning: 'bg-yellow-500 hover:bg-yellow-600 text-black shadow-yellow-500/20',
        info: 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20',
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="glass-strong border border-gray-800/50 rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-scale-in relative overflow-hidden">
                {/* Background Glow */}
                <div className={`absolute -top-10 -right-10 w-32 h-32 blur-[80px] opacity-20 ${variant === 'danger' ? 'bg-red-500' : 'bg-blue-500'}`} />

                <div className="flex flex-col items-center text-center">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${variant === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        <AlertCircle className="w-8 h-8" />
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                        {message}
                    </p>

                    <div className="grid grid-cols-2 gap-3 w-full">
                        <button
                            onClick={onCancel}
                            className="py-3 rounded-xl glass border border-gray-700/50 text-gray-300 hover:text-white hover:bg-white/5 transition-all text-sm font-medium interactive"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`py-3 rounded-xl transition-all text-sm font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] interactive ${variantStyles[variant]}`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>

                <button
                    onClick={onCancel}
                    className="absolute top-4 right-4 p-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default ConfirmDialog;
