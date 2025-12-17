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
    
    analyser.fftSize = 256;
    source.connect(analyser);
    
    analyserRef.current = analyser;
    const bufferLength = analyser.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const draw = () => {
      if (!isRecording) return;
      
      const width = canvas.width;
      const height = canvas.height;
      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;

      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
      }

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / (dataArray?.length || 1)) * 2.5;
      let barHeight;
      let x = 0;

      if (dataArray) {
        for (let i = 0; i < dataArray.length; i++) {
          barHeight = dataArray[i] / 2;
          
          const r = barHeight + 25 * (i / dataArray.length);
          const g = 250 * (i / dataArray.length);
          const b = 50;

          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);

          x += barWidth + 1;
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
      width={300} 
      height={60} 
      className="w-full h-16 rounded-lg opacity-80"
    />
  );
};

export default Visualizer;