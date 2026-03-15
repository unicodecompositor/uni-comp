import React, { useState, useRef, useCallback } from 'react';
import { UniCompSpec, stringifySpec } from '@/lib/unicomp-parser';
import { UniCompRenderer } from '@/components/UniCompRenderer';
import { Button } from '@/components/ui/button';
import { Grid, Hash, Maximize2, Eye, Download, Play, Square, Palette, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSpecToOffscreen } from '@/lib/render-utils';
import { useKeyframeAnimation } from '@/hooks/useKeyframeAnimation';
import { ColorStrokePanel } from '@/components/ColorStrokePanel';

function drawSpecOnCanvas(
  ctx: CanvasRenderingContext2D,
  spec: UniCompSpec,
  canvasW: number,
  canvasH: number,
) {
  const pixelsPerCell = Math.max(
    24,
    Math.min(96, Math.round((Math.min(canvasW / spec.gridWidth, canvasH / spec.gridHeight) || 1) * 2)),
  );

  const rendered = renderSpecToOffscreen(spec, pixelsPerCell, 'hsl(210, 20%, 92%)');
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(rendered, 0, 0, rendered.width, rendered.height, 0, 0, canvasW, canvasH);
  ctx.restore();
}

// Background grid component that extends beyond the editor canvas
const BackgroundGrid: React.FC<{
  spec: UniCompSpec | null;
  containerSize: number;
}> = ({ spec, containerSize }) => {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas || !spec) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridWidth = spec.gridWidth;
    const gridHeight = spec.gridHeight;
    const cellSize = Math.min(containerSize / gridWidth, containerSize / gridHeight);
    
    // Fill the entire viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, vw, vh);

    // Calculate where the editor canvas is centered
    const editorW = cellSize * gridWidth;
    const editorH = cellSize * gridHeight;
    const offsetX = (vw - editorW) / 2;
    const offsetY = (vh - editorH) / 2;

    // Draw grid lines extending across the whole viewport using the same cell size
    ctx.strokeStyle = 'hsl(220, 15%, 15%)';
    ctx.lineWidth = 0.5;

    // Vertical lines
    const startGridX = offsetX % cellSize;
    for (let x = startGridX; x < vw; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vh);
      ctx.stroke();
    }

    // Horizontal lines
    const startGridY = offsetY % cellSize;
    for (let y = startGridY; y < vh; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(vw, y);
      ctx.stroke();
    }
  }, [spec, containerSize]);

  if (!spec) return null;

  return (
    <canvas
      ref={bgCanvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ top: 0, left: 0 }}
    />
  );
};

interface GridVisualizationPanelProps {
  spec: UniCompSpec | null;
  deferredSpec: UniCompSpec | null;
  showGrid: boolean;
  showIndices: boolean;
  containerSize: number;
  selectionSet: number[];
  lockedSet: number[];
  hiddenSet: number[];
  onToggleGrid: () => void;
  onToggleIndices: () => void;
  onCycleLayoutMode: () => void;
  onCellDoubleClick: (idx: number) => void;
  onUpdateCode: (code: string, isFinal: boolean) => void;
  onTripleTapEmpty: () => void;
  angleStep: number;
  extraToolbar?: React.ReactNode;
  canvasContainerRef?: React.RefObject<HTMLDivElement>;
  layoutMode?: 'normal' | 'split' | 'fullscreen';
  fullscreenViewMode?: 'edit' | 'preview';
}

export const GridVisualizationPanel: React.FC<GridVisualizationPanelProps> = ({
  spec,
  deferredSpec,
  showGrid,
  showIndices,
  containerSize,
  selectionSet,
  lockedSet,
  hiddenSet,
  onToggleGrid,
  onToggleIndices,
  onCycleLayoutMode,
  onCellDoubleClick,
  onUpdateCode,
  onTripleTapEmpty,
  angleStep,
  extraToolbar,
  canvasContainerRef,
  layoutMode = 'normal',
  fullscreenViewMode,
}) => {
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showGridPalette, setShowGridPalette] = useState(false);
  const [gridColorHistory, setGridColorHistory] = useState<UniCompSpec[]>([]);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  // Grid palette: Symbol tab updates grid content color (not per-layer)
  const handleGridSymbolChange = useCallback((data: {
    color: string; opacity: number; strokeWidth: number; strokeColor: string; strokeOpacity: number;
  }, isFinal: boolean) => {
    if (!spec) return;
    if (isFinal) setGridColorHistory(h => [...h, JSON.parse(JSON.stringify(spec))]);
    // Grid-level opacity
    const newSpec = {
      ...spec,
      opacity: data.opacity < 1 ? data.opacity : undefined,
    };
    onUpdateCode(stringifySpec(newSpec), isFinal);
  }, [spec, onUpdateCode]);

  // Grid palette: Layer tab → gc= (background) and gb= (border)
  const handleGridLayerChange = useCallback((data: {
    background: string; backgroundOpacity: number; borderRadius: string;
    layerBorderWidth: number; layerBorderColor: string; layerBorderOpacity: number;
  }, isFinal: boolean) => {
    if (!spec) return;
    if (isFinal) setGridColorHistory(h => [...h, JSON.parse(JSON.stringify(spec))]);
    const newSpec = {
      ...spec,
      background: data.background,
      backgroundOpacity: data.backgroundOpacity,
      borderRadius: data.borderRadius || undefined,
      strokeWidth: data.layerBorderWidth > 0 ? data.layerBorderWidth : undefined,
      strokeColor: data.layerBorderWidth > 0 ? data.layerBorderColor : undefined,
      strokeOpacity: data.layerBorderOpacity < 1 ? data.layerBorderOpacity : undefined,
    };
    onUpdateCode(stringifySpec(newSpec), isFinal);
  }, [spec, onUpdateCode]);

  const handleGridColorUndo = useCallback(() => {
    if (gridColorHistory.length === 0) return;
    const prev = gridColorHistory[gridColorHistory.length - 1];
    setGridColorHistory(h => h.slice(0, -1));
    onUpdateCode(stringifySpec(prev), true);
  }, [gridColorHistory, onUpdateCode]);

  // Keyframe animation
  const { isPlaying, specHasKeyframes, animatedSpec, togglePlay } = useKeyframeAnimation(deferredSpec);

  // In fullscreen mode, use the externally controlled view mode
  const effectiveViewMode = layoutMode === 'fullscreen' ? (fullscreenViewMode || 'edit') : viewMode;
  const isFullscreen = layoutMode === 'fullscreen';

  // Choose which spec to render: animated if playing, otherwise deferred
  const previewSpec = isPlaying && animatedSpec ? animatedSpec : deferredSpec;

  // Draw result preview into canvas
  React.useEffect(() => {
    if (effectiveViewMode !== 'preview') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const specToRender = previewSpec;

    let canvasW = containerSize;
    let canvasH = containerSize;
    if (specToRender) {
      const ratio = specToRender.gridWidth / specToRender.gridHeight;
      if (ratio > 1) canvasH = containerSize / ratio;
      else canvasW = containerSize * ratio;
    }

    // In fullscreen, use larger canvas
    if (isFullscreen) {
      const maxW = window.innerWidth * 0.85;
      const maxH = (window.innerHeight - 80) * 0.85;
      if (specToRender) {
        const ratio = specToRender.gridWidth / specToRender.gridHeight;
        if (ratio > 1) {
          canvasW = Math.min(maxW, maxH * ratio);
          canvasH = canvasW / ratio;
        } else {
          canvasH = Math.min(maxH, maxW / ratio);
          canvasW = canvasH * ratio;
        }
      } else {
        canvasW = Math.min(maxW, maxH);
        canvasH = canvasW;
      }
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasW, canvasH);

    if (!specToRender || specToRender.symbols.length === 0) {
      ctx.fillStyle = 'hsl(210, 15%, 30%)';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('—', canvasW / 2, canvasH / 2);
      return;
    }

    drawSpecOnCanvas(ctx, specToRender, canvasW, canvasH);
  }, [effectiveViewMode, previewSpec, containerSize, isFullscreen]);

  const handleExport = () => {
    const specToExport = deferredSpec;
    if (!specToExport) return;

    const W = 600;
    const H = Math.round(W * specToExport.gridHeight / specToExport.gridWidth);
    const exportCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    exportCanvas.width = W * dpr;
    exportCanvas.height = H * dpr;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    drawSpecOnCanvas(ctx, specToExport, W, H);

    const raw = specToExport.raw || '';
    const pngDataUrl = exportCanvas.toDataURL('image/png');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>UniComp Export</title>
<style>
  body { margin: 0; background: #0d1117; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  canvas { max-width: 100%; height: auto; }
</style>
</head>
<body>
<canvas id="uc" aria-label="UniComp rendered result"></canvas>
<script>
// UniComp Rule: ${raw}
(function() {
  const canvas = document.getElementById('uc');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const displayW = ${W};
  const displayH = ${H};
  const dpr = window.devicePixelRatio || 1;

  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width = displayW + 'px';
  canvas.style.height = displayH + 'px';

  const img = new Image();
  img.onload = function() {
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayW, displayH);
    ctx.drawImage(img, 0, 0, displayW, displayH);
  };
  img.src = '${pngDataUrl}';
})();
<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unicomp-export.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  // In fullscreen, don't show internal header/controls — they're in the floating toolbar
  if (isFullscreen) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full relative" ref={canvasContainerRef}>
        {/* Background grid extending beyond the editor */}
        <BackgroundGrid spec={spec} containerSize={containerSize} />
        
        {/* Hidden export button for fullscreen toolbar */}
        <button
          ref={exportButtonRef}
          data-grid-viz-export
          className="hidden"
          onClick={handleExport}
        />

        {effectiveViewMode === 'edit' ? (
          <div className="relative z-10">
            <UniCompRenderer
              spec={spec}
              showGrid={showGrid}
              showIndices={showIndices}
              size={containerSize}
              selectionSet={selectionSet}
              lockedSet={lockedSet}
              hiddenSet={hiddenSet}
              onCellDoubleClick={onCellDoubleClick}
              onUpdateCode={onUpdateCode}
              onTripleTapEmpty={onTripleTapEmpty}
              angleStep={angleStep}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center relative z-10">
            {deferredSpec && deferredSpec.symbols.length > 0 ? (
              <div className="relative">
                <canvas ref={previewCanvasRef} className="rounded-lg" />
                {specHasKeyframes && (
                  <button
                    onClick={togglePlay}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-background/80 border border-border backdrop-blur-sm flex items-center justify-center hover:bg-accent transition-colors"
                    title={isPlaying ? 'Stop animation' : 'Play animation'}
                  >
                    {isPlaying ? <Square className="h-4 w-4 text-foreground" /> : <Play className="h-4 w-4 text-foreground ml-0.5" />}
                  </button>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">No result to preview</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Normal/Split mode — original UI with header
  const displayToggles = (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", showGrid && "text-primary")}
        onClick={onToggleGrid}
        title="Toggle Grid"
      >
        <Grid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", showIndices && "text-primary")}
        onClick={onToggleIndices}
        title="Toggle Indices"
      >
        <Hash className="h-4 w-4" />
      </Button>
    </>
  );

  const headerControls = (
    <div className="flex items-center gap-1">
      {displayToggles}
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", viewMode === 'preview' && "text-primary")}
        onClick={() => setViewMode(v => v === 'edit' ? 'preview' : 'edit')}
        title={viewMode === 'edit' ? 'Switch to Result Preview' : 'Switch to Edit Mode'}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleExport}
        title="Export as HTML Canvas"
        disabled={!deferredSpec}
      >
        <Download className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", showGridPalette && "text-primary")}
        onClick={() => setShowGridPalette(v => !v)}
        title="Grid Colors"
      >
        <Palette className="h-4 w-4" />
      </Button>
      {extraToolbar}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onCycleLayoutMode}
        title="Expand view"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col items-center relative min-h-[400px] w-full h-full" ref={canvasContainerRef}>
      <div className="panel-header w-full flex items-center justify-between mb-4">
        <span>GRID VISUALIZATION {viewMode === 'preview' ? '— RESULT' : ''}</span>
        {headerControls}
      </div>

      {showGridPalette && (
        <div className="w-full mb-3 relative z-20">
          <ColorStrokePanel
            color={spec?.background || 'hsl(220, 18%, 10%)'}
            opacity={spec?.opacity ?? 1}
            background={spec?.background || ''}
            backgroundOpacity={spec?.backgroundOpacity ?? 1}
            borderRadius={spec?.borderRadius || ''}
            strokeWidth={spec?.strokeWidth ?? 0}
            strokeColor={spec?.strokeColor || 'hsl(0, 0%, 100%)'}
            strokeOpacity={spec?.strokeOpacity ?? 1}
            onSymbolChange={handleGridSymbolChange}
            onLayerChange={handleGridLayerChange}
            style={{ width: '100%' }}
          />
          {gridColorHistory.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 left-1 h-7 w-7 p-0"
              onClick={handleGridColorUndo}
              title="Undo grid color change"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {viewMode === 'edit' ? (
        <UniCompRenderer
          spec={spec}
          showGrid={showGrid}
          showIndices={showIndices}
          size={containerSize}
          selectionSet={selectionSet}
          lockedSet={lockedSet}
          hiddenSet={hiddenSet}
          onCellDoubleClick={onCellDoubleClick}
          onUpdateCode={onUpdateCode}
          onTripleTapEmpty={onTripleTapEmpty}
          angleStep={angleStep}
        />
      ) : (
        <div className="flex flex-col items-center justify-center w-full flex-1">
          <div
            className="rounded-lg bg-background border border-border p-4 glow-primary flex items-center justify-center relative"
            style={{
              width: containerSize,
              height: containerSize,
              maxWidth: '100%',
            }}
          >
            {deferredSpec && deferredSpec.symbols.length > 0 ? (
              <>
                <canvas ref={previewCanvasRef} />
                {specHasKeyframes && (
                  <button
                    onClick={togglePlay}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-background/80 border border-border backdrop-blur-sm flex items-center justify-center hover:bg-accent transition-colors"
                    title={isPlaying ? 'Stop animation' : 'Play animation'}
                  >
                    {isPlaying ? <Square className="h-4 w-4 text-foreground" /> : <Play className="h-4 w-4 text-foreground ml-0.5" />}
                  </button>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-sm">No result to preview</span>
            )}
          </div>
          {deferredSpec && (
            <code className="mt-2 text-[10px] text-muted-foreground font-mono max-w-[300px] truncate">
              {deferredSpec.raw}
            </code>
          )}
        </div>
      )}
    </div>
  );
};
