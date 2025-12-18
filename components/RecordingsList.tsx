import React, { useState, useEffect } from 'react';
import { Play, Pause, Trash2, RotateCw, Copy, X } from 'lucide-react';
import { RecordingMetadata, getAllRecordings, deleteRecording, getRecordingAudio, clearAllRecordings } from '../services/storageService';
import { TonePreset } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface RecordingsListProps {
    isOpen: boolean;
    onClose: () => void;
    onRetranscribe: (audioBlob: Blob, recordingId: number, toneOverride?: TonePreset) => void;
}

const RecordingsList: React.FC<RecordingsListProps> = ({ isOpen, onClose, onRetranscribe }) => {
    const [recordings, setRecordings] = useState<RecordingMetadata[]>([]);
    const [playingId, setPlayingId] = useState<number | null>(null);
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
    const [retranscribeTarget, setRetranscribeTarget] = useState<RecordingMetadata | null>(null);

    // Confirmation Dialog State
    const [confirmTarget, setConfirmTarget] = useState<{ id: number | 'all'; type: 'delete' | 'clear' } | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadRecordings();
        }
    }, [isOpen]);

    const loadRecordings = async () => {
        try {
            const data = await getAllRecordings();
            setRecordings(data);
        } catch (err) {
            console.error('Failed to load recordings:', err);
        }
    };

    const handlePlay = async (recording: RecordingMetadata) => {
        if (playingId === recording.id) {
            // Pause
            audioElement?.pause();
            setPlayingId(null);
            return;
        }

        // Stop previous audio
        if (audioElement) {
            audioElement.pause();
            audioElement.src = '';
        }

        // Play new audio
        const blob = recording.audioBlob;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
            setPlayingId(null);
            URL.revokeObjectURL(url);
        };

        audio.play();
        setAudioElement(audio);
        setPlayingId(recording.id!);
    };

    const handleDelete = (id: number) => {
        setConfirmTarget({ id, type: 'delete' });
    };

    const handleClearAll = () => {
        setConfirmTarget({ id: 'all', type: 'clear' });
    };

    const executeDelete = async () => {
        if (!confirmTarget) return;

        try {
            if (confirmTarget.id === 'all') {
                await clearAllRecordings();
                if (audioElement) {
                    audioElement.pause();
                    setPlayingId(null);
                }
            } else {
                const id = confirmTarget.id;
                await deleteRecording(id);
                if (playingId === id) {
                    audioElement?.pause();
                    setPlayingId(null);
                }
            }
            await loadRecordings();
        } catch (err) {
            console.error('Action failed:', err);
        } finally {
            setConfirmTarget(null);
        }
    };

    const initiateRetranscribe = (recording: RecordingMetadata) => {
        setRetranscribeTarget(recording);
    };

    const confirmRetranscribe = async (tone: TonePreset) => {
        if (!retranscribeTarget || !retranscribeTarget.id) return;

        const blob = await getRecordingAudio(retranscribeTarget.id);
        if (blob) {
            onRetranscribe(blob, retranscribeTarget.id, tone);
            setRetranscribeTarget(null);
            onClose();
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '—';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="glass-strong border border-gray-800/50 rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl relative animate-scale-in flex flex-col">

                {/* Header */}
                <div className="p-6 border-b border-gray-800/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold gradient-text">История записей</h2>
                        <p className="text-gray-400 text-sm mt-1">Сохраненные транскрибации</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-white transition-all rounded-lg hover:bg-gray-800/50 interactive"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                    {recordings.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-lg">Нет сохраненных записей</p>
                            <p className="text-sm mt-2">Записи будут появляться здесь автоматически</p>
                        </div>
                    ) : (
                        recordings.map((recording) => (
                            <div
                                key={recording.id}
                                className="glass rounded-2xl p-4 border border-gray-800/50 hover:border-blue-500/30 transition-all"
                            >
                                <div className="flex gap-4">
                                    {/* Play Button */}
                                    <button
                                        onClick={() => handlePlay(recording)}
                                        className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center hover:shadow-lg hover:shadow-blue-500/30 transition-all interactive"
                                    >
                                        {playingId === recording.id ? (
                                            <Pause className="w-5 h-5 text-white" />
                                        ) : (
                                            <Play className="w-5 h-5 text-white ml-0.5" />
                                        )}
                                    </button>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                                                    <span>{formatDate(recording.timestamp)}</span>
                                                    <span>•</span>
                                                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                                        {recording.mode}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                                        {recording.provider}
                                                    </span>
                                                    {recording.tone && recording.tone !== 'default' && (
                                                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                                                            {recording.tone}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-300 line-clamp-2">
                                                    {recording.text}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 mt-3">
                                            <button
                                                onClick={() => initiateRetranscribe(recording)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs glass rounded-lg hover:border-purple-500/50 hover:text-purple-400 transition-all interactive"
                                            >
                                                <RotateCw className="w-3.5 h-3.5" />
                                                Повторить
                                            </button>
                                            <button
                                                onClick={() => handleCopy(recording.text)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs glass rounded-lg hover:border-green-500/50 hover:text-green-400 transition-all interactive"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Копировать
                                            </button>
                                            <button
                                                onClick={() => handleDelete(recording.id!)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs glass rounded-lg hover:border-red-500/50 hover:text-red-400 transition-all interactive ml-auto"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800/50 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                        Всего записей: {recordings.length}
                    </div>
                    {recordings.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors interactive"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Очистить историю
                        </button>
                    )}
                </div>
            </div>

            {/* Retranscribe Tone Selection Modal */}
            {retranscribeTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur animate-fade-in">
                    <div className="glass-strong border border-gray-800/50 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scale-in">
                        <h3 className="text-xl font-bold text-white mb-2">Выберите тон</h3>
                        <p className="text-gray-400 text-sm mb-6">С каким настроением переписать эту запись?</p>

                        <div className="space-y-3">
                            {([
                                { value: 'default', label: 'По умолчанию', desc: 'Нейтральный' },
                                { value: 'friendly', label: 'Дружелюбный', desc: 'Теплый' },
                                { value: 'serious', label: 'Серьезный', desc: 'Строгий' },
                                { value: 'professional', label: 'Профессиональный', desc: 'Деловой' },
                            ] as { value: TonePreset; label: string; desc: string }[]).map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => confirmRetranscribe(t.value)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl glass border border-gray-700/50 hover:bg-white/5 hover:border-purple-500/50 transition-all group"
                                >
                                    <div className="text-left">
                                        <div className="font-medium text-gray-200 group-hover:text-purple-300 transition-colors">
                                            {t.label}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {t.desc}
                                        </div>
                                    </div>
                                    <RotateCw className="w-4 h-4 text-gray-600 group-hover:text-purple-400 transition-colors opacity-0 group-hover:opacity-100" />
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setRetranscribeTarget(null)}
                            className="w-full mt-6 py-3 text-sm text-gray-500 hover:text-white transition-colors"
                        >
                            Отмена
                        </button>
                    </div>
                </div>
            )}
            {/* Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!confirmTarget}
                title={confirmTarget?.type === 'clear' ? 'Очистить историю?' : 'Удалить запись?'}
                message={confirmTarget?.type === 'clear'
                    ? 'Это действие безвозвратно удалит все сохраненные записи из базы данных.'
                    : 'Вы уверены, что хотите удалить эту запись и связанный с ней аудиофайл?'}
                confirmLabel={confirmTarget?.type === 'clear' ? 'Очистить всё' : 'Удалить'}
                onConfirm={executeDelete}
                onCancel={() => setConfirmTarget(null)}
                variant="danger"
            />
        </div>
    );
};

export default RecordingsList;
