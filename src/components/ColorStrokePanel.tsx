import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Palette } from 'lucide-react';

// Parse hsl string to components
function parseHsl(color?: string): [number, number, number] {
  if (!color) return [185, 80, 50];
  const m = color.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  const NAMED: Record<string, [number, number, number]> = {
    red: [0, 80, 55], green: [120, 70, 45], blue: [210, 80, 55],
    yellow: [50, 90, 50], orange: [30, 90, 55], purple: [280, 70, 55],
    pink: [340, 80, 60], cyan: [185, 80, 50], white: [0, 0, 100],
    black: [0, 0, 10], gray: [0, 0, 50], grey: [0, 0, 50],
  };
  return NAMED[color.toLowerCase()] || [185, 80, 50];
}

function hslToString(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/**
 * New param scheme:
 * - c= Symbol Color (+ opacity via a=)
 * - b= Symbol Border (width, color, opacity)
 * - bc= Layer Background (color, opacity, radius)
 * - bb= Layer Border (width, color, opacity)
 */
export interface ColorStrokePanelProps {
  // Symbol color (c=)
  color?: string;
  opacity?: number;
  // Symbol border (b=)
  strokeWidth?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  // Layer background (bc=)
  background?: string;
  backgroundOpacity?: number;
  borderRadius?: string;
  // Layer border (bb=)
  layerBorderWidth?: number;
  layerBorderColor?: string;
  layerBorderOpacity?: number;
  // Callbacks
  onSymbolChange: (data: {
    color: string;
    opacity: number;
    strokeWidth: number;
    strokeColor: string;
    strokeOpacity: number;
  }, isFinal: boolean) => void;
  onLayerChange: (data: {
    background: string;
    backgroundOpacity: number;
    borderRadius: string;
    layerBorderWidth: number;
    layerBorderColor: string;
    layerBorderOpacity: number;
  }, isFinal: boolean) => void;
  style?: React.CSSProperties;
}

const RING_SIZE = 116;
const CX = RING_SIZE / 2;
const CY = RING_SIZE / 2;
const OUTER_R = 50;
const INNER_R = 32;
const SEGMENTS = 72;

function arcPath(i: number, total: number, outerR: number, innerR: number, cx: number, cy: number): string {
  const a0 = ((i / total) * 2 - 0.5) * Math.PI;
  const a1 = (((i + 1) / total) * 2 - 0.5) * Math.PI;
  const x1 = cx + outerR * Math.cos(a0);
  const y1 = cy + outerR * Math.sin(a0);
  const x2 = cx + outerR * Math.cos(a1);
  const y2 = cy + outerR * Math.sin(a1);
  const x3 = cx + innerR * Math.cos(a1);
  const y3 = cy + innerR * Math.sin(a1);
  const x4 = cx + innerR * Math.cos(a0);
  const y4 = cy + innerR * Math.sin(a0);
  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`;
}

const ColorWheel: React.FC<{
  hue: number;
  saturation: number;
  lightness: number;
  onHueChange: (h: number, final: boolean) => void;
}> = ({ hue, saturation, lightness, onHueChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const getHueFromEvent = useCallback((clientX: number, clientY: number): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left - CX;
    const y = clientY - rect.top - CY;
    const angle = Math.atan2(y, x) + Math.PI / 2;
    return ((angle / (2 * Math.PI)) * 360 + 360) % 360;
  }, []);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragging.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    onHueChange(getHueFromEvent(clientX, clientY), false);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      onHueChange(getHueFromEvent(clientX, clientY), false);
    };
    const onEnd = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const clientX = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      onHueChange(getHueFromEvent(clientX, clientY), true);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [onHueChange, getHueFromEvent]);

  const indicatorAngle = (hue / 360) * 2 * Math.PI - Math.PI / 2;
  const indicatorR = (OUTER_R + INNER_R) / 2;
  const indicatorX = CX + indicatorR * Math.cos(indicatorAngle);
  const indicatorY = CY + indicatorR * Math.sin(indicatorAngle);

  return (
    <svg
      ref={svgRef}
      width={RING_SIZE}
      height={RING_SIZE}
      style={{ cursor: 'crosshair', touchAction: 'none' }}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <path
          key={i}
          d={arcPath(i, SEGMENTS, OUTER_R, INNER_R, CX, CY)}
          fill={`hsl(${(i / SEGMENTS) * 360}, ${saturation}%, ${lightness}%)`}
        />
      ))}
      <circle cx={CX} cy={CY} r={INNER_R - 3} fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`} />
      <circle cx={indicatorX} cy={indicatorY} r={6} fill="none" stroke="white" strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))' }} />
      <circle cx={indicatorX} cy={indicatorY} r={4}
        fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`} stroke="white" strokeWidth={1.5} />
    </svg>
  );
};

/** Reusable HSL color editor block: wheel + saturation + lightness + optional opacity + optional width */
const ColorBlock: React.FC<{
  label: string;
  hsl: [number, number, number];
  alpha?: number;
  width?: number;
  showAlpha?: boolean;
  showWidth?: boolean;
  widthMax?: number;
  onHslChange: (hsl: [number, number, number], final: boolean) => void;
  onAlphaChange?: (a: number, final: boolean) => void;
  onWidthChange?: (w: number, final: boolean) => void;
}> = ({ label, hsl, alpha = 1, width = 0, showAlpha = false, showWidth = false, widthMax = 0.5, onHslChange, onAlphaChange, onWidthChange }) => {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>

      {showWidth && onWidthChange && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Width: {(width * 100).toFixed(1)}%</div>
          <Slider min={0} max={widthMax} step={0.005} value={[width]}
            onValueChange={([w]) => onWidthChange(w, false)}
            onValueCommit={([w]) => onWidthChange(w, true)}
          />
        </div>
      )}

      {(!showWidth || width > 0) && (
        <>
          <div className="flex justify-center">
            <ColorWheel hue={hsl[0]} saturation={hsl[1]} lightness={hsl[2]}
              onHueChange={(h, final) => onHslChange([h, hsl[1], hsl[2]], final)} />
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Saturation {Math.round(hsl[1])}%</div>
            <input type="range" min={0} max={100} step={1} value={hsl[1]}
              onChange={(e) => onHslChange([hsl[0], parseInt(e.target.value), hsl[2]], false)}
              onMouseUp={() => onHslChange(hsl, true)}
              onTouchEnd={() => onHslChange(hsl, true)}
              className="color-slider w-full"
              style={{ background: `linear-gradient(to right, hsl(${hsl[0]}, 0%, ${hsl[2]}%), hsl(${hsl[0]}, 100%, ${hsl[2]}%))` }}
            />
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Lightness {Math.round(hsl[2])}%</div>
            <input type="range" min={10} max={90} step={1} value={hsl[2]}
              onChange={(e) => onHslChange([hsl[0], hsl[1], parseInt(e.target.value)], false)}
              onMouseUp={() => onHslChange(hsl, true)}
              onTouchEnd={() => onHslChange(hsl, true)}
              className="color-slider w-full"
              style={{ background: `linear-gradient(to right, hsl(${hsl[0]}, ${hsl[1]}%, 10%), hsl(${hsl[0]}, ${hsl[1]}%, 50%), hsl(${hsl[0]}, ${hsl[1]}%, 90%))` }}
            />
          </div>

          {showAlpha && onAlphaChange && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Opacity {Math.round(alpha * 100)}%</div>
              <Slider min={0} max={1} step={0.01} value={[alpha]}
                onValueChange={([a]) => onAlphaChange(a, false)}
                onValueCommit={([a]) => onAlphaChange(a, true)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const ColorStrokePanel: React.FC<ColorStrokePanelProps> = ({
  color, opacity = 1,
  strokeWidth = 0, strokeColor, strokeOpacity = 1,
  background, backgroundOpacity = 1, borderRadius = '',
  layerBorderWidth = 0, layerBorderColor, layerBorderOpacity = 1,
  onSymbolChange, onLayerChange,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'symbol' | 'layer'>('symbol');

  // Symbol color state (c=)
  const [symHsl, setSymHsl] = useState<[number, number, number]>(() => parseHsl(color));
  const [symAlpha, setSymAlpha] = useState(opacity);
  // Symbol border state (b=)
  const [symBorderHsl, setSymBorderHsl] = useState<[number, number, number]>(() => parseHsl(strokeColor));
  const [symBorderW, setSymBorderW] = useState(strokeWidth);
  const [symBorderAlpha, setSymBorderAlpha] = useState(strokeOpacity);

  // Layer background state (bc=)
  const [layerBgHsl, setLayerBgHsl] = useState<[number, number, number]>(() => parseHsl(background));
  const [layerBgAlpha, setLayerBgAlpha] = useState(backgroundOpacity);
  const [layerRadius, setLayerRadius] = useState(borderRadius);
  // Layer border state (bb=)
  const [layerBorderHsl, setLayerBorderHsl] = useState<[number, number, number]>(() => parseHsl(layerBorderColor));
  const [layerBorderW, setLayerBorderW] = useState(layerBorderWidth);
  const [layerBorderAlphaState, setLayerBorderAlphaState] = useState(layerBorderOpacity);

  // Sync from props
  useEffect(() => { setSymHsl(parseHsl(color)); setSymAlpha(opacity); }, [color, opacity]);
  useEffect(() => { setSymBorderHsl(parseHsl(strokeColor)); setSymBorderW(strokeWidth); setSymBorderAlpha(strokeOpacity); }, [strokeColor, strokeWidth, strokeOpacity]);
  useEffect(() => { setLayerBgHsl(parseHsl(background)); setLayerBgAlpha(backgroundOpacity); setLayerRadius(borderRadius); }, [background, backgroundOpacity, borderRadius]);
  useEffect(() => { setLayerBorderHsl(parseHsl(layerBorderColor)); setLayerBorderW(layerBorderWidth); setLayerBorderAlphaState(layerBorderOpacity); }, [layerBorderColor, layerBorderWidth, layerBorderOpacity]);

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Emit helpers
  const emitSymbol = useCallback((
    cHsl: [number, number, number], cAlpha: number,
    bHsl: [number, number, number], bW: number, bAlpha: number,
    isFinal: boolean
  ) => {
    onSymbolChange({
      color: hslToString(...cHsl),
      opacity: cAlpha,
      strokeWidth: bW,
      strokeColor: hslToString(...bHsl),
      strokeOpacity: bAlpha,
    }, isFinal);
  }, [onSymbolChange]);

  const emitLayer = useCallback((
    bgHsl: [number, number, number], bgAlpha: number, radius: string,
    bbHsl: [number, number, number], bbW: number, bbAlpha: number,
    isFinal: boolean
  ) => {
    onLayerChange({
      background: hslToString(...bgHsl),
      backgroundOpacity: bgAlpha,
      borderRadius: radius,
      layerBorderWidth: bbW,
      layerBorderColor: hslToString(...bbHsl),
      layerBorderOpacity: bbAlpha,
    }, isFinal);
  }, [onLayerChange]);

  const currentSymColor = hslToString(...symHsl);
  const currentSymBorderColor = hslToString(...symBorderHsl);

  return (
    <div ref={panelRef} style={style} className="absolute z-30 pointer-events-auto">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card/90 border border-border backdrop-blur-sm hover:border-primary/50 transition-colors shadow-lg"
        title="Color & Border"
      >
        <div className="w-4 h-4 rounded-full border border-border"
          style={{ background: currentSymColor }} />
        <Palette className="w-3.5 h-3.5 text-muted-foreground" />
        {symBorderW > 0 && (
          <div className="w-4 h-4 rounded-full border-2"
            style={{ borderColor: currentSymBorderColor, background: 'transparent' }} />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 w-[210px] bg-card border border-border rounded-xl shadow-2xl p-3 space-y-3 z-40 max-h-[70vh] overflow-y-auto">
          {/* Tabs: Symbol | Layer */}
          <div className="flex rounded-md overflow-hidden border border-border text-[11px] font-medium">
            <button type="button"
              className={cn("flex-1 py-1 transition-colors", activeTab === 'symbol' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              onClick={() => setActiveTab('symbol')}>Symbol</button>
            <button type="button"
              className={cn("flex-1 py-1 transition-colors", activeTab === 'layer' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              onClick={() => setActiveTab('layer')}>Layer</button>
          </div>

          {activeTab === 'symbol' ? (
            <div className="space-y-4">
              {/* c= Symbol Color */}
              <ColorBlock
                label="Color (c=)"
                hsl={symHsl}
                alpha={symAlpha}
                showAlpha
                onHslChange={(newHsl, final) => {
                  setSymHsl(newHsl);
                  emitSymbol(newHsl, symAlpha, symBorderHsl, symBorderW, symBorderAlpha, final);
                }}
                onAlphaChange={(a, final) => {
                  setSymAlpha(a);
                  emitSymbol(symHsl, a, symBorderHsl, symBorderW, symBorderAlpha, final);
                }}
              />
              <div className="border-t border-border" />
              {/* b= Symbol Border */}
              <ColorBlock
                label="Border (b=)"
                hsl={symBorderHsl}
                alpha={symBorderAlpha}
                width={symBorderW}
                showAlpha
                showWidth
                onHslChange={(newHsl, final) => {
                  setSymBorderHsl(newHsl);
                  emitSymbol(symHsl, symAlpha, newHsl, symBorderW, symBorderAlpha, final);
                }}
                onAlphaChange={(a, final) => {
                  setSymBorderAlpha(a);
                  emitSymbol(symHsl, symAlpha, symBorderHsl, symBorderW, a, final);
                }}
                onWidthChange={(w, final) => {
                  setSymBorderW(w);
                  emitSymbol(symHsl, symAlpha, symBorderHsl, w, symBorderAlpha, final);
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* bc= Layer Background */}
              <ColorBlock
                label="Background (bc=)"
                hsl={layerBgHsl}
                alpha={layerBgAlpha}
                showAlpha
                onHslChange={(newHsl, final) => {
                  setLayerBgHsl(newHsl);
                  emitLayer(newHsl, layerBgAlpha, layerRadius, layerBorderHsl, layerBorderW, layerBorderAlphaState, final);
                }}
                onAlphaChange={(a, final) => {
                  setLayerBgAlpha(a);
                  emitLayer(layerBgHsl, a, layerRadius, layerBorderHsl, layerBorderW, layerBorderAlphaState, final);
                }}
              />
              {/* Radius slider */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Radius: {layerRadius || '0'}</div>
                <Slider min={0} max={50} step={1} value={[parseFloat(layerRadius) || 0]}
                  onValueChange={([v]) => {
                    const r = v > 0 ? `${v}%` : '';
                    setLayerRadius(r);
                    emitLayer(layerBgHsl, layerBgAlpha, r, layerBorderHsl, layerBorderW, layerBorderAlphaState, false);
                  }}
                  onValueCommit={([v]) => {
                    const r = v > 0 ? `${v}%` : '';
                    setLayerRadius(r);
                    emitLayer(layerBgHsl, layerBgAlpha, r, layerBorderHsl, layerBorderW, layerBorderAlphaState, true);
                  }}
                />
              </div>
              <div className="border-t border-border" />
              {/* bb= Layer Border */}
              <ColorBlock
                label="Border (bb=)"
                hsl={layerBorderHsl}
                alpha={layerBorderAlphaState}
                width={layerBorderW}
                showAlpha
                showWidth
                onHslChange={(newHsl, final) => {
                  setLayerBorderHsl(newHsl);
                  emitLayer(layerBgHsl, layerBgAlpha, layerRadius, newHsl, layerBorderW, layerBorderAlphaState, final);
                }}
                onAlphaChange={(a, final) => {
                  setLayerBorderAlphaState(a);
                  emitLayer(layerBgHsl, layerBgAlpha, layerRadius, layerBorderHsl, layerBorderW, a, final);
                }}
                onWidthChange={(w, final) => {
                  setLayerBorderW(w);
                  emitLayer(layerBgHsl, layerBgAlpha, layerRadius, layerBorderHsl, w, layerBorderAlphaState, final);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
