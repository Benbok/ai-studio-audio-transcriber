import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ stream, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!stream || !isRecording || !canvasRef.current) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    // Увеличиваем fftSize для более детальной визуализации
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    analyserRef.current = analyser;
    const bufferLength = analyser.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Устанавливаем размеры canvas с учетом DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      if (!isRecording) return;

      const width = rect.width;
      const height = rect.height;
      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;

      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
      }

      // Градиентный фон с легким blur эффектом
      ctx.fillStyle = 'rgba(10, 10, 15, 0.3)';
      ctx.fillRect(0, 0, width, height);

      if (!dataArray) return;

      // Количество баров для отображения
      const barCount = 64;
      const barWidth = width / barCount * 0.8;
      const barGap = width / barCount * 0.2;

      for (let i = 0; i < barCount; i++) {
        // Используем логарифмическое распределение для более естественного вида
        const dataIndex = Math.floor(Math.pow(i / barCount, 1.5) * dataArray.length);
        const value = dataArray[dataIndex] || 0;

        // Нормализуем значение
        const barHeight = (value / 255) * height * 0.9;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;

        // Создаем градиент для каждого бара
        const gradient = ctx.createLinearGradient(x, y, x, height);

        // Цвета от синего к фиолетовому с учетом интенсивности
        const intensity = value / 255;
        gradient.addColorStop(0, `rgba(102, 126, 234, ${intensity})`);
        gradient.addColorStop(0.5, `rgba(118, 75, 162, ${intensity})`);
        gradient.addColorStop(1, `rgba(79, 172, 254, ${intensity * 0.8})`);

        ctx.fillStyle = gradient;

        // Рисуем бар с закругленными углами
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 0, 0]);
        ctx.fill();

        // Добавляем glow эффект для высоких значений
        if (intensity > 0.6) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = `rgba(102, 126, 234, ${intensity})`;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContext.close();
    };
  }, [stream, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-xl"
      style={{
        width: '100%',
        height: '100%',
        imageRendering: 'crisp-edges'
      }}
    />
  );
};

export default Visualizer;