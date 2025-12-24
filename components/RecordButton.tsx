import React, { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { RecorderStatus } from '../types';

interface RecordButtonProps {
    status: RecorderStatus;
    onClick: () => void;
    size?: 'small' | 'normal' | 'large';
    className?: string;
}

const RecordButton: React.FC<RecordButtonProps> = ({
    status,
    onClick,
    size = 'normal',
    className = ''
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [gradientPos, setGradientPos] = useState({ x: 50, y: 50 });
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; // x position within the element.
        const y = e.clientY - rect.top;  // y position within the element.

        // Calculate percentage
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;

        // We want the light on the OPPOSITE side.
        // If mouse is at 0% (left), light should be at 100% (right).
        // If mouse is at 100% (right), light should be at 0% (left).
        const xOpposite = 100 - xPercent;
        const yOpposite = 100 - yPercent;

        setGradientPos({ x: xOpposite, y: yOpposite });
    };

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => {
        setIsHovered(false);
        // Reset to center on leave
        setGradientPos({ x: 50, y: 50 });
    };

    const sizeClasses = size === 'large' ? 'w-24 h-24' : size === 'small' ? 'w-12 h-12' : 'w-20 h-20';
    const iconSize = size === 'large' ? 'w-10 h-10' : size === 'small' ? 'w-5 h-5' : 'w-9 h-9';

    const isRecording = status === RecorderStatus.RECORDING;
    const isProcessing = status === RecorderStatus.PROCESSING;

    // Dynamic style for the reactive background
    const reactiveStyle = isHovered && !isRecording && !isProcessing ? {
        background: `radial-gradient(circle at ${gradientPos.x}% ${gradientPos.y}%, rgba(59, 130, 246, 1) 0%, rgba(37, 99, 235, 1) 40%, rgba(29, 78, 216, 1) 100%)`,
        boxShadow: `
      inset 0 0 20px rgba(255, 255, 255, 0.3),
      0 10px 25px -5px rgba(59, 130, 246, 0.5)
    `
    } : {};

    if (isRecording) {
        return (
            <button
                ref={buttonRef}
                onClick={onClick}
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`${sizeClasses} rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-2xl shadow-red-500/50 flex items-center justify-center transform hover:scale-110 active:scale-95 transition-all duration-300 ${className}`}
            >
                <Square className={`${size === 'large' ? 'w-10 h-10' : 'w-8 h-8'} text-white fill-current animate-pulse`} />
            </button>
        );
    }

    return (
        <button
            ref={buttonRef}
            onClick={onClick}
            disabled={isProcessing}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={!isProcessing ? reactiveStyle : undefined}
            className={`
        ${sizeClasses} rounded-full flex items-center justify-center shadow-2xl transition-all duration-700 ease-in-out transform group
        ${isProcessing
                    ? 'bg-gray-700 cursor-not-allowed opacity-50'
                    : 'bg-gradient-primary shadow-blue-500/50 hover:scale-105'
                }
        ${className}
      `}
        >
            <Mic
                className={`${iconSize} text-white transition-transform duration-300 ${!isProcessing && isHovered ? 'scale-110' : ''}`}
            />
        </button>
    );
};

export default RecordButton;
