import React, { useRef, useEffect } from 'react';
import { UniCompSpec } from '@/lib/unicomp-parser';
import { renderSpecToOffscreen } from '@/lib/render-utils';
import { useKeyframeAnimation } from '@/hooks/useKeyframeAnimation';
import { Play, Square } from 'lucide-react';

interface ResultPreviewProps {
  spec: UniCompSpec | null;
  size?: number;
}

export const ResultPreview: React.FC<ResultPreviewProps> = ({ spec, size = 160 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isPlaying, specHasKeyframes, animatedSpec, togglePlay } = useKeyframeAnimation(spec);

  const renderSpec = isPlaying && animatedSpec ? animatedSpec : spec;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    let canvasW = size;
    let canvasH = size;

    if (renderSpec) {
      const ratio = renderSpec.gridWidth / renderSpec.gridHeight;
      if (ratio > 1) {
        canvasH = size / ratio;
      } else {
        canvasW = size * ratio;
      }
    }

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasW, canvasH);

    if (!renderSpec || renderSpec.symbols.length === 0) {
      ctx.fillStyle = 'hsl(210, 15%, 30%)';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('—', canvasW / 2, canvasH / 2);
      return;
    }

    // Use GPU-accelerated renderSpecToOffscreen for all symbols (handles st/sp via GPU)
    const cellSize = Math.min(canvasW / renderSpec.gridWidth, canvasH / renderSpec.gridHeight);
    const offscreen = renderSpecToOffscreen(renderSpec, Math.max(4, Math.round(cellSize)), 'hsl(210, 20%, 92%)');
    ctx.drawImage(offscreen, 0, 0, canvasW, canvasH);
  }, [renderSpec, size]);

  const aspectRatio = renderSpec ? renderSpec.gridWidth / renderSpec.gridHeight : 1;

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="panel-header">Result</div>
      <div
        className="rounded-lg bg-background border border-border p-4 glow-primary flex items-center justify-center relative"
        style={{ aspectRatio: String(aspectRatio), maxWidth: `${size}px`, width: '100%' }}
      >
        <canvas ref={canvasRef} />
        {specHasKeyframes && (
          <button
            onClick={togglePlay}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 border border-border backdrop-blur-sm flex items-center justify-center hover:bg-accent transition-colors"
            title={isPlaying ? 'Stop animation' : 'Play animation'}
          >
            {isPlaying ? <Square className="h-3 w-3 text-foreground" /> : <Play className="h-3 w-3 text-foreground ml-0.5" />}
          </button>
        )}
      </div>
      {spec && (
        <code className="text-[10px] text-muted-foreground font-mono max-w-[150px] truncate">
          {spec.raw}
        </code>
      )}
    </div>
  );
};
