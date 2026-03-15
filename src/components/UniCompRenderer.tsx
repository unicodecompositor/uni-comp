import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { UniCompSpec, SymbolSpec, getRect, stringifySpec, resolveHistory, appendTransformToHistory, undoLastHistoryParam, DeltaColor } from '@/lib/unicomp-parser';

/** During drag: clone original history and append a temp step with the gesture's absolute value.
 *  After appending, re-resolve ALL accumulated params from history so that no existing
 *  params (r=, st=, sp=, color, etc.) are lost when a different tool writes to history. */
function appendTempHistoryStep(
  sym: SymbolSpec,
  origSym: SymbolSpec | undefined,
  paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup',
  newValue: { angle: number; force: number } | number | { x: number; y: number } | DeltaColor,
) {
  const origHistory = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
  sym.history = origHistory;
  appendTransformToHistory(sym, paramType, newValue);
  // Re-resolve ALL accumulated params from full history to prevent any from being lost
  reResolveAllFromHistory(sym);
}

/** Re-apply all accumulated history values onto the symbol's live properties.
 *  This ensures that applying one transform (e.g. sp) doesn't wipe another (e.g. r, st, color). */
function reResolveAllFromHistory(sym: SymbolSpec) {
  if (!sym.history || sym.history.length === 0) return;
  const resolved = resolveHistory(sym.history);
  if (resolved.st) sym.st = resolved.st;
  if (resolved.sp) sym.sp = resolved.sp;
  if (resolved.rotate !== undefined) sym.rotate = resolved.rotate;
  if (resolved.scale) sym.scale = resolved.scale;
  if (resolved.offset) sym.offset = resolved.offset;
  if (resolved.d) sym.bounds = { w: resolved.d.x, h: resolved.d.y };
  if (resolved.colorGroup) {
    const cg = resolved.colorGroup;
    if (cg.color !== undefined) sym.color = cg.color;
    if (cg.opacity !== undefined) sym.opacity = cg.opacity;
    // Symbol border (b=) — new fields take priority, fallback to legacy
    if (cg.symbolBorderColor !== undefined) sym.strokeColor = cg.symbolBorderColor;
    else if (cg.strokeColor !== undefined) sym.strokeColor = cg.strokeColor;
    if (cg.symbolBorderWidth !== undefined) sym.strokeWidth = cg.symbolBorderWidth;
    else if (cg.strokeWidth !== undefined) sym.strokeWidth = cg.strokeWidth;
    if (cg.symbolBorderOpacity !== undefined) sym.strokeOpacity = cg.symbolBorderOpacity;
    else if (cg.strokeOpacity !== undefined) sym.strokeOpacity = cg.strokeOpacity;
    // Layer background (bc=)
    if (cg.layerBackground !== undefined) sym.background = cg.layerBackground;
    else if (cg.background !== undefined) sym.background = cg.background;
    if (cg.layerBackgroundOpacity !== undefined) sym.backgroundOpacity = cg.layerBackgroundOpacity;
    else if (cg.backgroundOpacity !== undefined) sym.backgroundOpacity = cg.backgroundOpacity;
    if (cg.layerBorderRadius !== undefined) sym.borderRadius = cg.layerBorderRadius;
    else if (cg.borderRadius !== undefined) sym.borderRadius = cg.borderRadius;
    // Layer border (bb=)
    if (cg.layerBorderWidth !== undefined) sym.layerBorderWidth = cg.layerBorderWidth;
    if (cg.layerBorderColor !== undefined) sym.layerBorderColor = cg.layerBorderColor;
    if (cg.layerBorderOpacity !== undefined) sym.layerBorderOpacity = cg.layerBorderOpacity;
  }
}
import { Move, RotateCw, Maximize2, Diamond, Hexagon, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSpecToOffscreen } from '@/lib/render-utils';
import { DEFAULT_GPU_EXPAND_FACTOR, SuperTransformer } from '@/lib/SuperTransformer';
import { computeTaper, computeShear, normalizeDegrees } from '@/lib/transform-tools';
import { ColorStrokePanel } from '@/components/ColorStrokePanel';

interface UniCompRendererProps {
  spec: UniCompSpec | null;
  showGrid?: boolean;
  showIndices?: boolean;
  highlightedCell?: number | null;
  onCellHover?: (index: number | null) => void;
  onCellClick?: (index: number) => void;
  onCellDoubleClick?: (index: number) => void;
  onUpdateCode?: (newCode: string, isFinal: boolean) => void;
  onTripleTapEmpty?: () => void;
  size?: number;
  selectionSet?: number[];
  lockedSet?: number[];
  hiddenSet?: number[];
  angleStep?: number;
}

const COLORS = [
  'hsl(185, 80%, 50%)', 'hsl(260, 70%, 60%)', 'hsl(150, 70%, 45%)',
  'hsl(40, 90%, 50%)', 'hsl(340, 75%, 55%)', 'hsl(200, 80%, 55%)',
];

const shortestAngleDeltaDeg = (currentRad: number, startRad: number): number => {
  const delta = Math.atan2(Math.sin(currentRad - startRad), Math.cos(currentRad - startRad));
  return (delta * 180) / Math.PI;
};

export const UniCompRenderer: React.FC<UniCompRendererProps> = ({
  spec,
  showGrid = true,
  showIndices = false,
  highlightedCell = null,
  onCellHover,
  onCellClick,
  onCellDoubleClick,
  onUpdateCode,
  onTripleTapEmpty,
  size = 400,
  selectionSet = [],
  lockedSet = [],
  hiddenSet = [],
  angleStep = 10,
}) => {

  // 1. Инициализация трансформера (GPU ядро)
  const transformer = useMemo(() => new SuperTransformer(), []);


  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const lastClickTime = useRef<number>(0);
  
  // Editing state
  const [isEditing, setIsEditing] = useState<'move' | 'scale' | 'rotate' | 'skew' | 'taper' | null>(null);
  const [editStartPos, setEditStartPos] = useState<{ x: number, y: number } | null>(null);
  const [initialSpec, setInitialSpec] = useState<UniCompSpec | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const initialAngleRef = useRef<number | null>(null);
  const initialRadiusRef = useRef<number | null>(null);
  const rotationCenterRef = useRef<{ x: number, y: number } | null>(null);
  const initialCellSizeRef = useRef<number>(0);
  const tapTimesRef = useRef<number[]>([]);
  const taperDirectionRef = useRef<{ angle: number; force: number; cx: number; cy: number; clientX: number; clientY: number } | null>(null);
  const lastGestureAngleRef = useRef<number | null>(null);
  // No more snapshot stacks — move/scale undo uses h= history (o= and d=)
  const gridWidth = spec?.gridWidth || spec?.gridSize || 10;
  const gridHeight = spec?.gridHeight || spec?.gridSize || 10;

  const cellSize = Math.min(size / gridWidth, size / gridHeight);
  const canvasWidth = cellSize * gridWidth;
  const canvasHeight = cellSize * gridHeight;

  const selectionBounds = useMemo(() => {
    if (selectionSet.length === 0 || !spec) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectionSet.forEach(idx => {
      const symbol = spec.symbols[idx];
      if (!symbol) return;
      const rect = getRect(symbol.start, symbol.end, gridWidth);
      minX = Math.min(minX, rect.x1);
      minY = Math.min(minY, rect.y1);
      maxX = Math.max(maxX, rect.x2);
      maxY = Math.max(maxY, rect.y2);
    });
    if (minX === Infinity) return null;
    return {
      gridX: minX, gridY: minY, gridW: maxX - minX + 1, gridH: maxY - minY + 1,
      x: minX * cellSize, y: minY * cellSize, width: (maxX - minX + 1) * cellSize, height: (maxY - minY + 1) * cellSize
    };
  }, [selectionSet, spec, gridWidth, cellSize]);
  // Count h-blocks with a specific param for selected symbols (excluding h=0 base)
  const selectionParamCount = useCallback((paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup'): number => {
    if (!spec) return 0;
    let maxCount = 0;
    selectionSet.forEach(idx => {
      const sym = spec.symbols[idx];
      if (!sym) return;
      if (sym.history && sym.history.length > 0) {
        const count = sym.history.filter((step, i) => {
          if (i === 0) return false;
          if (paramType === 'st') return !!step.st;
          if (paramType === 'sp') return !!step.sp;
          if (paramType === 'rotate') return !!step.rotate;
          if (paramType === 'scale') return !!step.scale;
          if (paramType === 'offset') return !!step.offset;
          if (paramType === 'd') return !!step.d;
          if (paramType === 'colorGroup') return !!step.colorGroup;
          return false;
        }).length;
        maxCount = Math.max(maxCount, count);
      }
    });
    return maxCount;
  }, [spec, selectionSet]);

  // Check if any selected symbol has a specific transform param (for showing undo arrows)
  const selectionHasParam = useCallback((paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup'): boolean => {
    return selectionParamCount(paramType) > 0 || (() => {
      if (!spec) return false;
      return selectionSet.some(idx => {
        const sym = spec.symbols[idx];
        if (!sym) return false;
        if (!sym.history || sym.history.length === 0) {
          if (paramType === 'st') return !!sym.st;
          if (paramType === 'sp') return !!sym.sp;
          if (paramType === 'rotate') return sym.rotate !== undefined;
          if (paramType === 'scale') return !!sym.scale;
          if (paramType === 'offset') return !!sym.offset;
          if (paramType === 'd') return !!sym.bounds;
          if (paramType === 'colorGroup') return !!(sym.color || sym.background || sym.strokeColor || sym.strokeWidth);
        }
        if (sym.history && sym.history.length > 0) {
          const base = sym.history[0];
          if (paramType === 'st') return !!base.st;
          if (paramType === 'sp') return !!base.sp;
          if (paramType === 'rotate') return !!base.rotate;
          if (paramType === 'scale') return !!base.scale;
          if (paramType === 'offset') return !!base.offset;
          if (paramType === 'd') return !!base.d;
          if (paramType === 'colorGroup') return !!base.colorGroup;
        }
        return false;
      });
    })();
  }, [spec, selectionSet, selectionParamCount]);

  const handleUndoTransform = useCallback((paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!spec || !onUpdateCode) return;

    const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
    let changed = false;

    if (paramType === 'offset') {
      // For move undo: get current offset, undo, compute reverse delta, apply to positions
      // Also restore grid size by removing me= (move expand)
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        if (!sym) return;
        
        // Find the last history step with offset to get me= expand info
        let expandLeft = 0, expandTop = 0;
        if (sym.history) {
          for (let i = sym.history.length - 1; i >= 0; i--) {
            if (sym.history[i].offset) {
              const me = sym.history[i].me;
              if (me) {
                expandLeft = me.el || 0;
                expandTop = me.et || 0;
              }
              break;
            }
          }
        }
        
        const prevOffset = sym.offset ? { ...sym.offset } : { x: 0, y: 0 };
        if (undoLastHistoryParam(sym, 'offset')) {
          changed = true;
          const newOffset = sym.offset || { x: 0, y: 0 };
          const reverseDx = newOffset.x - prevOffset.x;
          const reverseDy = newOffset.y - prevOffset.y;
          
          // Apply reverse move to start-end
          const rect = getRect(sym.start, sym.end, newSpec.gridWidth);
          const newX = rect.x1 + reverseDx;
          const newY = rect.y1 + reverseDy;
          sym.start = Math.max(0, newY) * newSpec.gridWidth + Math.max(0, newX);
          sym.end = (Math.max(0, newY) + rect.height - 1) * newSpec.gridWidth + (Math.max(0, newX) + rect.width - 1);
          
          // Shrink grid by expandLeft/expandTop and shift all layers back
          if (expandLeft > 0 || expandTop > 0) {
            const oldW = newSpec.gridWidth;
            const newW = Math.max(2, oldW - expandLeft);
            const newH = Math.max(2, newSpec.gridHeight - expandTop);
            
            newSpec.symbols = newSpec.symbols.map(s => {
              const r = getRect(s.start, s.end, oldW);
              const shiftedX = Math.max(0, r.x1 - expandLeft);
              const shiftedY = Math.max(0, r.y1 - expandTop);
              return {
                ...s,
                start: shiftedY * newW + shiftedX,
                end: (shiftedY + r.height - 1) * newW + (shiftedX + r.width - 1)
              };
            });
            newSpec.gridWidth = newW;
            newSpec.gridHeight = newH;
          }
        }
      });
    } else if (paramType === 'd') {
      // For scale undo: restore dimensions + contract grid via se= (scale expand)
      let expandLeft = 0, expandTop = 0;
      
      // Find se= from the step being undone
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        if (!sym?.history) return;
        for (let i = sym.history.length - 1; i >= 0; i--) {
          if (sym.history[i].d) {
            const se = sym.history[i].se;
            if (se) {
              expandLeft = Math.max(expandLeft, se.sl || 0);
              expandTop = Math.max(expandTop, se.st || 0);
            }
            break;
          }
        }
      });
      
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        if (!sym) return;
        const rect = getRect(sym.start, sym.end, newSpec.gridWidth);
        if (undoLastHistoryParam(sym, 'd')) {
          changed = true;
          const newBounds = sym.bounds || { w: rect.width, h: rect.height };
          // Resize symbol to previous dimensions, keeping top-left corner
          const newEnd = (rect.y1 + newBounds.h - 1) * newSpec.gridWidth + (rect.x1 + newBounds.w - 1);
          sym.end = newEnd;
        }
      });
      
      // Contract grid if it was expanded during scaling
      if (changed && (expandLeft > 0 || expandTop > 0)) {
        const oldW = newSpec.gridWidth;
        const newW = Math.max(2, oldW - expandLeft);
        const newH = Math.max(2, newSpec.gridHeight - expandTop);
        
        newSpec.symbols = newSpec.symbols.map(s => {
          const r = getRect(s.start, s.end, oldW);
          const shiftedX = Math.max(0, r.x1 - expandLeft);
          const shiftedY = Math.max(0, r.y1 - expandTop);
          const w = Math.min(r.width, newW - shiftedX);
          const h = Math.min(r.height, newH - shiftedY);
          return {
            ...s,
            start: shiftedY * newW + shiftedX,
            end: (shiftedY + Math.max(1, h) - 1) * newW + (shiftedX + Math.max(1, w) - 1)
          };
        });
        newSpec.gridWidth = newW;
        newSpec.gridHeight = newH;
      }
    } else {
      // History-based undo for st/sp/rotate/scale
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        if (!sym) return;
        if (undoLastHistoryParam(sym, paramType)) changed = true;
      });
    }

    if (changed) onUpdateCode(stringifySpec(newSpec), true);
  }, [spec, onUpdateCode, selectionSet]);

  const handleEditStart = (type: 'move' | 'scale' | 'rotate' | 'skew' | 'taper', e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // All handles activate immediately — no long-press delay
    const activate = () => {
      setIsLongPressActive(true);
      setIsEditing(type);
      setEditStartPos({ x: clientX, y: clientY });
      setInitialSpec(JSON.parse(JSON.stringify(spec)));
      initialCellSizeRef.current = cellSize;
      
      // Scale: Pre-record original bounds in h=0 if no history exists
      if (type === 'scale' && spec && onUpdateCode) {
        const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
        let hasChanges = false;
        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          // Only add h=0 if no history exists yet
          if (!sym.history || sym.history.length === 0) {
            const rect = getRect(sym.start, sym.end, newSpec.gridWidth);
            appendTransformToHistory(sym, 'd', { x: rect.width, y: rect.height });
            hasChanges = true;
          }
        });
        if (hasChanges) {
          onUpdateCode(stringifySpec(newSpec), false);
          setInitialSpec(newSpec); // Update initial spec to include the h=0 blocks
        }
      }
      if ((type === 'rotate' || type === 'skew' || type === 'taper') && selectionBounds && canvasRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const cx = canvasRect.left + selectionBounds.x + selectionBounds.width / 2;
        const cy = canvasRect.top + selectionBounds.y + selectionBounds.height / 2;
        rotationCenterRef.current = { x: cx, y: cy };
        initialAngleRef.current = Math.atan2(clientY - cy, clientX - cx);
        initialRadiusRef.current = null; // force starts from 0 at press point

        lastGestureAngleRef.current = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      } else {
        lastGestureAngleRef.current = null;
      }
      document.body.classList.add('dragging-active');
    };

    activate();
  };

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if ('touches' in e && e.cancelable) e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if (!isEditing || !editStartPos || !initialSpec || !onUpdateCode) return;

    const dx = clientX - editStartPos.x;
    const dy = clientY - editStartPos.y;
    
    const initCellSize = initialCellSizeRef.current;
    const gridDx = Math.round(dx / initCellSize);
    const gridDy = Math.round(dy / initCellSize);

    const now = Date.now();
    if (now - lastUpdateRef.current < 50) return;
    lastUpdateRef.current = now;

    let newSpec = JSON.parse(JSON.stringify(initialSpec)) as UniCompSpec;

    if (isEditing === 'move') {
      const oldW = newSpec.gridWidth;
      const oldH = newSpec.gridHeight;

      type LayerPos = { x: number; y: number; w: number; h: number };
      const positions: LayerPos[] = newSpec.symbols.map((s) => {
        const rect = getRect(s.start, s.end, oldW);
        return { x: rect.x1, y: rect.y1, w: rect.width, h: rect.height };
      });

      let groupMinX = Infinity, groupMinY = Infinity;
      selectionSet.forEach(idx => {
        const p = positions[idx];
        if (!p) return;
        if (p.x < groupMinX) groupMinX = p.x;
        if (p.y < groupMinY) groupMinY = p.y;
      });

      const effectiveDx = Math.max(gridDx, -groupMinX);
      const effectiveDy = Math.max(gridDy, -groupMinY);
      const expandLeft = Math.max(0, -(groupMinX + gridDx));
      const expandTop = Math.max(0, -(groupMinY + gridDy));

      positions.forEach((p, idx) => {
        if (selectionSet.includes(idx)) {
          p.x += effectiveDx;
          p.y += effectiveDy;
        } else {
          p.x += expandLeft;
          p.y += expandTop;
        }
      });

      let finalW = oldW + expandLeft;
      let finalH = oldH + expandTop;
      positions.forEach(p => {
        finalW = Math.max(finalW, p.x + p.w);
        finalH = Math.max(finalH, p.y + p.h);
      });
      finalW = Math.min(100, finalW);
      finalH = Math.min(100, finalH);

      newSpec.symbols = newSpec.symbols.map((s, idx) => {
        const p = positions[idx];
        return { ...s, start: p.y * finalW + p.x, end: (p.y + p.h - 1) * finalW + (p.x + p.w - 1) };
      });
      newSpec.gridWidth = finalW;
      newSpec.gridHeight = finalH;

      // Record o= (offset) in history for undo — track cumulative grid delta AND grid expansion
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        const origSym = initialSpec.symbols[idx];
        if (!sym || !origSym) return;
        // Compute total offset from original position
        const origRect = getRect(origSym.start, origSym.end, initialSpec.gridWidth);
        const newRect = getRect(sym.start, sym.end, finalW);
        const totalDx = newRect.x1 - origRect.x1;
        const totalDy = newRect.y1 - origRect.y1;
        
        // Store grid expansion info as me= (move expand) for undo
        const totalExpandLeft = Math.max(0, finalW - initialSpec.gridWidth - (totalDx >= 0 ? totalDx : 0));
        const totalExpandTop = Math.max(0, finalH - initialSpec.gridHeight - (totalDy >= 0 ? totalDy : 0));
        
        if (!sym.history) sym.history = [];
        const origHistory = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
        sym.history = origHistory;
        
        const nextIndex = sym.history.length > 0 ? Math.max(...sym.history.map(s => s.index)) + 1 : 0;
        const step: any = { index: nextIndex };
        
        if (nextIndex === 0) {
          step.offset = { op: '=', x: totalDx, y: totalDy };
          sym.offset = { x: totalDx, y: totalDy };
        } else {
          const resolved = resolveHistory(sym.history);
          const prevOffset = resolved.offset || { x: 0, y: 0 };
          step.offset = { op: '+=', x: totalDx - prevOffset.x, y: totalDy - prevOffset.y };
          sym.offset = { x: totalDx, y: totalDy };
        }
        // Attach me= (move expand) if grid was expanded
        if (totalExpandLeft > 0 || totalExpandTop > 0) {
          step.me = { el: totalExpandLeft, et: totalExpandTop };
        }
        sym.history.push(step);
      });


    } else if (isEditing === 'scale') {
      const oldW = newSpec.gridWidth;
      const oldH = newSpec.gridHeight;

      type ScalePos = { x: number; y: number; w: number; h: number; flip?: 'h' | 'v' | 'hv' };
      const positions: ScalePos[] = newSpec.symbols.map((s) => {
        const rect = getRect(s.start, s.end, oldW);
        return { x: rect.x1, y: rect.y1, w: rect.width, h: rect.height, flip: s.flip };
      });

      let groupMinX = Infinity, groupMinY = Infinity;
      let groupMaxX = -Infinity, groupMaxY = -Infinity;
      selectionSet.forEach(idx => {
        const p = positions[idx];
        if (!p) return;
        groupMinX = Math.min(groupMinX, p.x);
        groupMinY = Math.min(groupMinY, p.y);
        groupMaxX = Math.max(groupMaxX, p.x + p.w);
        groupMaxY = Math.max(groupMaxY, p.y + p.h);
      });
      const groupW = groupMaxX - groupMinX;
      const groupH = groupMaxY - groupMinY;

      const processAxis = (axis: 'x' | 'y', wKey: 'w' | 'h', groupMin: number, groupSize: number, delta: number) => {
        let rawNewSize = groupSize + delta;
        let expandGrid = 0;
        let finalSize = rawNewSize;
        let finalPivot = groupMin;

        if (rawNewSize < 0) {
          const flippedEdge = groupMin + rawNewSize;
          if (flippedEdge < 0) {
            expandGrid = Math.abs(flippedEdge);
            finalSize = -groupMin;
          }
        }

        const scaleFactor = groupSize > 0 ? finalSize / groupSize : 1;

        selectionSet.forEach(idx => {
          const p = positions[idx];
          if (!p) return;
          const origPos = p[axis];
          const origSize = p[wKey];
          p[wKey] = origSize * scaleFactor;
          if (expandGrid > 0) {
            p[wKey] += (origSize > 0 ? expandGrid : -expandGrid);
          }
          p[axis] = finalPivot + (origPos - groupMin) * scaleFactor;
        });

        if (expandGrid > 0) {
          positions.forEach((p, idx) => {
            if (!selectionSet.includes(idx)) p[axis] += expandGrid;
          });
        }
        return expandGrid;
      };

      const expandRight = processAxis('x', 'w', groupMinX, groupW, gridDx);
      const expandDown = processAxis('y', 'h', groupMinY, groupH, gridDy);

      positions.forEach((p, idx) => {
        if (!selectionSet.includes(idx)) return;
        let flipH = p.flip === 'h' || p.flip === 'hv';
        let flipV = p.flip === 'v' || p.flip === 'hv';
        if (p.w < 0) { flipH = !flipH; p.x += p.w; p.w = Math.abs(p.w); }
        if (p.h < 0) { flipV = !flipV; p.y += p.h; p.h = Math.abs(p.h); }
        p.w = Math.max(1, Math.round(p.w));
        p.h = Math.max(1, Math.round(p.h));
        p.x = Math.max(0, Math.round(p.x));
        p.y = Math.max(0, Math.round(p.y));
        p.flip = flipH && flipV ? 'hv' : flipH ? 'h' : flipV ? 'v' : undefined;
      });

      let finalW = oldW + expandRight;
      let finalH = oldH + expandDown;
      positions.forEach(p => {
        finalW = Math.max(finalW, p.x + p.w);
        finalH = Math.max(finalH, p.y + p.h);
      });
      finalW = Math.min(100, finalW);
      finalH = Math.min(100, finalH);

      newSpec.symbols = newSpec.symbols.map((s, idx) => {
        const p = positions[idx];
        return { ...s, flip: p.flip, start: p.y * finalW + p.x, end: (p.y + p.h - 1) * finalW + (p.x + p.w - 1) };
      });
      newSpec.gridWidth = finalW;
      newSpec.gridHeight = finalH;

      // Record d= (bounds) in history for undo — track new dimensions + se= (scale expand) + flip
      const totalExpandLeft = Math.max(0, finalW - initialSpec.gridWidth);
      const totalExpandTop = Math.max(0, finalH - initialSpec.gridHeight);
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        const origSym = initialSpec.symbols[idx];
        if (!sym || !origSym) return;
        const newRect = getRect(sym.start, sym.end, finalW);
        
        // Clone original history and append
        const origHistory = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
        sym.history = origHistory;
        
        const nextIndex = sym.history.length > 0 ? Math.max(...sym.history.map((s: any) => s.index)) + 1 : 0;
        const step: any = { index: nextIndex };
        
        if (nextIndex === 0) {
          step.d = { op: '=', x: newRect.width, y: newRect.height };
        } else {
          const resolved = resolveHistory(sym.history);
          const prevD = resolved.d || { x: 0, y: 0 };
          step.d = { op: '+=', x: newRect.width - prevD.x, y: newRect.height - prevD.y };
        }
        
        // Attach se= (scale expand) if grid was expanded
        if (totalExpandLeft > 0 || totalExpandTop > 0) {
          step.se = { sl: totalExpandLeft, st: totalExpandTop };
        }
        
        sym.history.push(step);
        sym.bounds = { w: newRect.width, h: newRect.height };
        reResolveAllFromHistory(sym);
      });

    } else if (isEditing === 'rotate') {
      if (rotationCenterRef.current && initialAngleRef.current !== null) {
        const { x: cx, y: cy } = rotationCenterRef.current;
        const currentAngle = Math.atan2(clientY - cy, clientX - cx);
        const deltaAngleDeg = shortestAngleDeltaDeg(currentAngle, initialAngleRef.current);
        const snappedDelta = Math.round(deltaAngleDeg / angleStep) * angleStep;

        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          const origSym = initialSpec.symbols[idx];
          const baseRotate = origSym?.rotate || 0;
          const newRotate = normalizeDegrees(baseRotate + snappedDelta);
          sym.rotate = newRotate;
          // Preserve history with temp step
          appendTempHistoryStep(sym, origSym, 'rotate', newRotate);
        });
      }
    } else if (isEditing === 'skew') {
      if (rotationCenterRef.current) {
        const moveFromStart = Math.hypot(clientX - editStartPos.x, clientY - editStartPos.y);
        if (moveFromStart < 2) return;

        const { x: cx, y: cy } = rotationCenterRef.current;
        const selRadius = selectionBounds ? Math.max(selectionBounds.width, selectionBounds.height) / 2 : 50;

        const result = computeShear({
          clientX, clientY, centerX: cx, centerY: cy,
          selRadius, previousScreenAngle: lastGestureAngleRef.current,
        });

        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          const origSym = initialSpec.symbols[idx];
          // Don't blindly clear st — let history preserve it
          if (result.force <= 0) {
            sym.sp = undefined;
            sym.history = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : undefined;
            // Re-resolve to restore any st/r/color that existed in history
            if (sym.history) reResolveAllFromHistory(sym);
            return;
          }
          sym.sp = { angle: result.angle, force: result.force };
          appendTempHistoryStep(sym, origSym, 'sp', { angle: result.angle, force: result.force });
        });

        lastGestureAngleRef.current = result.screenAngle;
      }
    } else if (isEditing === 'taper') {
      if (rotationCenterRef.current) {
        const moveFromStart = Math.hypot(clientX - editStartPos.x, clientY - editStartPos.y);
        if (moveFromStart < 2) return;

        const { x: cx, y: cy } = rotationCenterRef.current;
        const selRadius = selectionBounds ? Math.max(selectionBounds.width, selectionBounds.height) / 2 : 50;

        const result = computeTaper({
          clientX, clientY, centerX: cx, centerY: cy,
          selRadius, previousScreenAngle: lastGestureAngleRef.current,
        });

        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          const origSym = initialSpec.symbols[idx];
          // Don't blindly clear sp — let history preserve it
          if (result.force <= 0) {
            sym.st = undefined;
            sym.history = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : undefined;
            // Re-resolve to restore any sp/r/color that existed in history
            if (sym.history) reResolveAllFromHistory(sym);
            return;
          }
          sym.st = { angle: result.angle, force: result.force };
          appendTempHistoryStep(sym, origSym, 'st', { angle: result.angle, force: result.force });
        });

        taperDirectionRef.current = result.force > 0
          ? { angle: Math.round(result.screenAngle), force: result.force, cx, cy, clientX, clientY }
          : null;

        lastGestureAngleRef.current = result.screenAngle;
      }
    }

    onUpdateCode(stringifySpec(newSpec), false);
  }, [isEditing, editStartPos, initialSpec, selectionSet, selectionBounds, cellSize, onUpdateCode, isLongPressActive, angleStep]);

   const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (isEditing && spec && onUpdateCode) {
      // History-based undo: move/scale already have h= blocks from appendTempHistoryStep
      onUpdateCode(stringifySpec(spec), true);
    }
    setIsEditing(null);
    setEditStartPos(null);
    setInitialSpec(null);
    setIsLongPressActive(false);
    initialAngleRef.current = null;
    initialRadiusRef.current = null;
    rotationCenterRef.current = null;
    taperDirectionRef.current = null;
    lastGestureAngleRef.current = null;
    document.body.classList.remove('dragging-active');
  }, [isEditing, spec, onUpdateCode, initialSpec]);

  useEffect(() => {
    if (isEditing || longPressTimer.current) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isEditing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    // Grid-level background
    if (spec?.background) {
      ctx.save();
      ctx.globalAlpha = spec.backgroundOpacity ?? 1;
      ctx.fillStyle = spec.background;
      if (spec.borderRadius) {
        const brStr = spec.borderRadius;
        const shortSide = Math.min(canvasWidth, canvasHeight);
        let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr) * cellSize;
        radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
        ctx.beginPath();
        ctx.roundRect(0, 0, canvasWidth, canvasHeight, radiusPx);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = 'hsl(220, 18%, 10%)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (showGrid) {
      ctx.strokeStyle = 'hsl(220, 15%, 25%)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridWidth; i++) {
        const pos = i * cellSize;
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, canvasHeight); ctx.stroke();
      }
      for (let i = 0; i <= gridHeight; i++) {
        const pos = i * cellSize;
        ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(canvasWidth, pos); ctx.stroke();
      }
    }

    if (showIndices) {
      ctx.font = `${Math.max(8, cellSize * 0.25)}px JetBrains Mono`;
      ctx.fillStyle = 'hsl(210, 15%, 40%)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const index = y * gridWidth + x;
          ctx.fillText(index.toString(), x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        }
      }
    }

    if (spec?.symbols) {
      // --- Per-symbol GPU pipeline: render each symbol individually ---
      // For symbols with st/sp, use SuperTransformer (GPU) instead of CPU grid
      // This fixes: barrel distortion, lost colors, jagged edges, st+sp mutual exclusion

      spec.symbols.forEach((symbol, idx) => {
        if (hiddenSet.includes(idx)) return;

        const rect = getRect(symbol.start, symbol.end, gridWidth);
        const x1 = rect.x1 * cellSize;
        const y1 = rect.y1 * cellSize;
        const sw = (rect.x2 - rect.x1 + 1) * cellSize;
        const sh = (rect.y2 - rect.y1 + 1) * cellSize;

        // Draw layer background fill (bc=) behind the glyph area — opacity isolated
        if (symbol.background) {
          ctx.save();
          ctx.globalAlpha = symbol.backgroundOpacity ?? 1;
          ctx.fillStyle = symbol.background;
          
          if (symbol.borderRadius) {
            const brStr = symbol.borderRadius;
            const shortSide = Math.min(sw, sh);
            let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr);
            radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
            ctx.beginPath();
            ctx.roundRect(x1, y1, sw, sh, radiusPx);
            ctx.fill();
          } else {
            ctx.fillRect(x1, y1, sw, sh);
          }
          ctx.restore();
        }

        // NOTE: Layer border (bb=) is drawn AFTER the symbol content (below)

        const hasSt = symbol.st && Math.abs(symbol.st.force) > 0;
        const hasSp = symbol.sp && Math.abs(symbol.sp.force) > 0;

        // Create isolated single-symbol spec (without st/sp — those go through GPU)
        const symW = rect.x2 - rect.x1 + 1;
        const symH = rect.y2 - rect.y1 + 1;
        const cleanSymbol = { ...symbol, st: undefined, sp: undefined, start: 0, end: (symH - 1) * symW + (symW - 1) };
        const symSpec: UniCompSpec = {
          ...spec,
          gridWidth: symW,
          gridHeight: symH,
          symbols: [cleanSymbol],
        };

        // Use layer color as the default glyph color in edit mode
        const layerColor = COLORS[idx % COLORS.length];
        const offscreen = renderSpecToOffscreen(symSpec, cellSize, layerColor);

        const hasStroke = symbol.strokeWidth && symbol.strokeWidth > 0;
        const strokePx = hasStroke ? Math.max(1, Math.round(symbol.strokeWidth! * cellSize)) : 0;
        const strokeRgb = hasStroke ? SuperTransformer.hslToRgb01(symbol.strokeColor || 'hsl(0, 0%, 100%)') : [1,1,1] as [number,number,number];
        const strokeOp = symbol.strokeOpacity ?? 1;

        // Helper: apply stroke post-process via GPU mode 3
        const applyStroke = (input: HTMLCanvasElement, drawX: number, drawY: number, drawW: number, drawH: number) => {
          if (!hasStroke) { ctx.drawImage(input, drawX, drawY, drawW, drawH); return; }
          const padPx = strokePx + 2;
          const padCanvas = document.createElement('canvas');
          padCanvas.width = input.width + padPx * 2;
          padCanvas.height = input.height + padPx * 2;
          const padCtx = padCanvas.getContext('2d');
          if (!padCtx) { ctx.drawImage(input, drawX, drawY, drawW, drawH); return; }
          padCtx.drawImage(input, padPx, padPx);
          const result = transformer.render(padCanvas, {
            mode: 3, strokeWidth: strokePx, strokeColor: strokeRgb, strokeOpacity: strokeOp,
          }, null, null, 1);
          const padFrac = padPx / input.width * drawW;
          const padFracY = padPx / input.height * drawH;
          ctx.drawImage(result, drawX - padFrac, drawY - padFracY, drawW + padFrac * 2, drawH + padFracY * 2);
        };

        if (hasSt || hasSp) {
          // Convert OffscreenCanvas → HTMLCanvasElement for WebGL texImage2D
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = offscreen.width;
          srcCanvas.height = offscreen.height;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) return;
          srcCtx.drawImage(offscreen, 0, 0);

          let gpuInput: HTMLCanvasElement = srcCanvas;
          const gpuExpand = DEFAULT_GPU_EXPAND_FACTOR;

          // Apply trapezoid (st) via GPU — mode 0 (no stroke — applied separately after)
          if (hasSt) {
            const stResult = transformer.render(gpuInput, {
              mode: 0, angle: symbol.st!.angle, force: symbol.st!.force, offset: 0, scale: 1.0,
              expandViewport: true, expandFactor: gpuExpand,
            }, null, null, 1);

            if (hasSp) {
              const copy = document.createElement('canvas');
              copy.width = stResult.width; copy.height = stResult.height;
              const copyCtx = copy.getContext('2d');
              if (copyCtx) copyCtx.drawImage(stResult, 0, 0);
              gpuInput = copy;
            } else {
              // Apply stroke as separate pass on deformed result
              if (hasStroke) {
                const deformedCopy = document.createElement('canvas');
                deformedCopy.width = stResult.width; deformedCopy.height = stResult.height;
                const dcCtx = deformedCopy.getContext('2d');
                if (dcCtx) dcCtx.drawImage(stResult, 0, 0);
                applyStroke(
                  deformedCopy,
                  x1 - (deformedCopy.width - sw) / 2,
                  y1 - (deformedCopy.height - sh) / 2,
                  deformedCopy.width,
                  deformedCopy.height,
                );
              } else {
                ctx.drawImage(
                  stResult,
                  x1 - (stResult.width - sw) / 2,
                  y1 - (stResult.height - sh) / 2,
                  stResult.width,
                  stResult.height,
                );
              }
              return;
            }
          }

          if (hasSp) {
            const spResult = transformer.render(gpuInput, {
              mode: 1, angle: symbol.sp!.angle, force: symbol.sp!.force, offset: 0, scale: 1.0,
              expandViewport: !hasSt, expandFactor: gpuExpand,
            }, null, null, 1);
            // Apply stroke as separate pass on deformed result
            if (hasStroke) {
              const deformedCopy = document.createElement('canvas');
              deformedCopy.width = spResult.width; deformedCopy.height = spResult.height;
              const dcCtx = deformedCopy.getContext('2d');
              if (dcCtx) dcCtx.drawImage(spResult, 0, 0);
              applyStroke(
                deformedCopy,
                x1 - (deformedCopy.width - sw) / 2,
                y1 - (deformedCopy.height - sh) / 2,
                deformedCopy.width,
                deformedCopy.height,
              );
            } else {
              ctx.drawImage(
                spResult,
                x1 - (spResult.width - sw) / 2,
                y1 - (spResult.height - sh) / 2,
                spResult.width,
                spResult.height,
              );
            }
          }
        } else if (hasStroke) {
          // No deformation but has stroke — run through GPU for stroke
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = offscreen.width; srcCanvas.height = offscreen.height;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) return;
          srcCtx.drawImage(offscreen, 0, 0);
          applyStroke(srcCanvas, x1, y1, sw, sh);
        } else {
          // No deformation, no stroke — draw directly
          ctx.drawImage(offscreen, x1, y1, sw, sh);
        }
      });

      // Draw layer borders (bb=) AFTER all symbols — on top of symbol content, below grid border
      spec.symbols.forEach((symbol, idx) => {
        if (hiddenSet.includes(idx)) return;
        if (!symbol.layerBorderWidth || symbol.layerBorderWidth <= 0 || !symbol.layerBorderColor) return;
        
        const rect = getRect(symbol.start, symbol.end, gridWidth);
        const x1 = rect.x1 * cellSize;
        const y1 = rect.y1 * cellSize;
        const sw = (rect.x2 - rect.x1 + 1) * cellSize;
        const sh = (rect.y2 - rect.y1 + 1) * cellSize;
        
        ctx.save();
        const lbPx = Math.max(1, symbol.layerBorderWidth * cellSize);
        ctx.globalAlpha = symbol.layerBorderOpacity ?? 1;
        ctx.strokeStyle = symbol.layerBorderColor;
        ctx.lineWidth = lbPx;
        const halfLb = lbPx / 2;
        
        if (symbol.borderRadius) {
          const brStr = symbol.borderRadius;
          const shortSide = Math.min(sw, sh);
          let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr);
          radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
          ctx.beginPath();
          ctx.roundRect(x1 + halfLb, y1 + halfLb, sw - lbPx, sh - lbPx, Math.max(0, radiusPx - halfLb));
          ctx.stroke();
        } else {
          ctx.strokeRect(x1 + halfLb, y1 + halfLb, sw - lbPx, sh - lbPx);
        }
        ctx.restore();
      });
      if (spec.strokeWidth && spec.strokeWidth > 0 && spec.strokeColor) {
        ctx.save();
        const borderPx = Math.max(1, spec.strokeWidth * cellSize);
        ctx.globalAlpha = spec.strokeOpacity ?? 1;
        ctx.strokeStyle = spec.strokeColor;
        ctx.lineWidth = borderPx;
        const halfBorder = borderPx / 2;
        if (spec.borderRadius) {
          const brStr = spec.borderRadius;
          const shortSide = Math.min(canvasWidth, canvasHeight);
          let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr) * cellSize;
          radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
          ctx.beginPath();
          ctx.roundRect(halfBorder, halfBorder, canvasWidth - borderPx, canvasHeight - borderPx, Math.max(0, radiusPx - halfBorder));
          ctx.stroke();
        } else {
          ctx.strokeRect(halfBorder, halfBorder, canvasWidth - borderPx, canvasHeight - borderPx);
        }
        ctx.restore();
      }

      // Draw selection/lock overlays on top
      spec.symbols.forEach((symbol, idx) => {
        if (hiddenSet.includes(idx)) return;
        const isSelected = selectionSet.includes(idx);
        const isLocked = lockedSet.includes(idx);
        const rect = getRect(symbol.start, symbol.end, gridWidth);
        let color = COLORS[idx % COLORS.length];
        if (isLocked) color = 'hsl(0, 0%, 50%)';
        const ox = rect.x1 * cellSize;
        const oy = rect.y1 * cellSize;
        const ow = (rect.x2 - rect.x1 + 1) * cellSize;
        const oh = (rect.y2 - rect.y1 + 1) * cellSize;

        ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.2)' : color.replace(')', ', 0.1)').replace('hsl', 'hsla');
        ctx.fillRect(ox, oy, ow, oh);
        ctx.strokeStyle = isSelected ? 'white' : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        if (!isSelected) ctx.setLineDash([4, 4]);
        ctx.strokeRect(ox + 1, oy + 1, ow - 2, oh - 2);
        ctx.setLineDash([]);
      });
    }
  }, [spec, showGrid, showIndices, highlightedCell, hoveredCell, size, gridWidth, gridHeight, cellSize, canvasWidth, canvasHeight, selectionSet, lockedSet, hiddenSet, transformer]);

  return (
    <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
      <canvas
        ref={canvasRef}
        className="rounded-lg cursor-crosshair"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = Math.floor((e.clientX - rect.left) / cellSize);
          const y = Math.floor((e.clientY - rect.top) / cellSize);
          const index = y * gridWidth + x;
          setHoveredCell(index);
          onCellHover?.(index);
        }}
        onMouseLeave={() => { setHoveredCell(null); onCellHover?.(null); }}
        onClick={(e) => {
          const now = Date.now();
          const canvasRect = canvasRef.current?.getBoundingClientRect();
          if (!canvasRect) return;
          const x = Math.floor((e.clientX - canvasRect.left) / cellSize);
          const y = Math.floor((e.clientY - canvasRect.top) / cellSize);
          const cellIndex = y * gridWidth + x;
          
          tapTimesRef.current.push(now);
          if (tapTimesRef.current.length > 3) tapTimesRef.current.shift();
          if (tapTimesRef.current.length >= 3 && tapTimesRef.current[tapTimesRef.current.length - 1] - tapTimesRef.current[tapTimesRef.current.length - 3] < 600) {
            const hasSymbol = spec?.symbols.some(s => {
              const r = getRect(s.start, s.end, gridWidth);
              return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
            });
            if (!hasSymbol) {
              onTripleTapEmpty?.();
              tapTimesRef.current = [];
              return;
            }
          }
          
          if (now - lastClickTime.current < 300) onCellDoubleClick?.(cellIndex);
          else onCellClick?.(cellIndex);
          lastClickTime.current = now;
        }}
      />
      
      {selectionBounds && (
        <>
          {/* Color undo + palette grouped */}
           <div
            className="absolute z-30 flex items-center gap-3 pointer-events-auto"
            style={{
              left: selectionBounds.x + selectionBounds.width / 2,
              top: selectionBounds.y - 42,
              transform: 'translateX(-50%)',
            }}
          >
            {/* Color undo button - positioned clearly left of palette */}
            {selectionHasParam('colorGroup') && (
              <button
                type="button"
                className="selection-handle selection-undo-btn relative mr-2"
                onClick={(e) => handleUndoTransform('colorGroup', e)}
                title="Undo color changes"
              >
                <Undo2 className="w-3 h-3" />
                {selectionParamCount('colorGroup') > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {selectionParamCount('colorGroup')}
                  </span>
                )}
              </button>
            )}
            {/* Color & Stroke Panel */}
            <ColorStrokePanel
              color={spec?.symbols[selectionSet[0]]?.color}
              opacity={spec?.symbols[selectionSet[0]]?.opacity}
              strokeWidth={spec?.symbols[selectionSet[0]]?.strokeWidth}
              strokeColor={spec?.symbols[selectionSet[0]]?.strokeColor}
              strokeOpacity={spec?.symbols[selectionSet[0]]?.strokeOpacity}
              background={spec?.symbols[selectionSet[0]]?.background}
              backgroundOpacity={spec?.symbols[selectionSet[0]]?.backgroundOpacity ?? 1}
              borderRadius={spec?.symbols[selectionSet[0]]?.borderRadius ?? ''}
              layerBorderWidth={spec?.symbols[selectionSet[0]]?.layerBorderWidth}
              layerBorderColor={spec?.symbols[selectionSet[0]]?.layerBorderColor}
              layerBorderOpacity={spec?.symbols[selectionSet[0]]?.layerBorderOpacity}
              onSymbolChange={(data, isFinal) => {
                if (!spec || !onUpdateCode) return;
                const newSpec = JSON.parse(JSON.stringify(spec));
                selectionSet.forEach(idx => {
                  const sym = newSpec.symbols[idx];
                  if (!sym) return;
                  sym.color = data.color;
                  sym.opacity = data.opacity;
                  sym.strokeWidth = data.strokeWidth;
                  sym.strokeColor = data.strokeColor;
                  sym.strokeOpacity = data.strokeOpacity;
                  if (isFinal) {
                    appendTransformToHistory(sym, 'colorGroup', {
                      op: '=',
                      color: data.color,
                      opacity: data.opacity,
                      symbolBorderWidth: data.strokeWidth,
                      symbolBorderColor: data.strokeColor,
                      symbolBorderOpacity: data.strokeOpacity,
                      background: sym.background,
                      backgroundOpacity: sym.backgroundOpacity,
                      borderRadius: sym.borderRadius,
                      layerBorderWidth: sym.layerBorderWidth,
                      layerBorderColor: sym.layerBorderColor,
                      layerBorderOpacity: sym.layerBorderOpacity,
                    } as DeltaColor);
                  }
                });
                onUpdateCode(stringifySpec(newSpec), isFinal);
              }}
              onLayerChange={(data, isFinal) => {
                if (!spec || !onUpdateCode) return;
                const newSpec = JSON.parse(JSON.stringify(spec));
                selectionSet.forEach(idx => {
                  const sym = newSpec.symbols[idx];
                  if (!sym) return;
                  sym.background = data.background;
                  sym.backgroundOpacity = data.backgroundOpacity;
                  sym.borderRadius = data.borderRadius || undefined;
                  sym.layerBorderWidth = data.layerBorderWidth;
                  sym.layerBorderColor = data.layerBorderColor;
                  sym.layerBorderOpacity = data.layerBorderOpacity;
                  if (isFinal) {
                    appendTransformToHistory(sym, 'colorGroup', {
                      op: '=',
                      color: sym.color,
                      opacity: sym.opacity,
                      symbolBorderWidth: sym.strokeWidth,
                      symbolBorderColor: sym.strokeColor,
                      symbolBorderOpacity: sym.strokeOpacity,
                      background: data.background,
                      backgroundOpacity: data.backgroundOpacity,
                      borderRadius: data.borderRadius || undefined,
                      layerBorderWidth: data.layerBorderWidth,
                      layerBorderColor: data.layerBorderColor,
                      layerBorderOpacity: data.layerBorderOpacity,
                    } as DeltaColor);
                  }
                });
                onUpdateCode(stringifySpec(newSpec), isFinal);
              }}
              style={{}}
            />
          </div>
          <div 
            className={cn("selection-outline", isLongPressActive && "selection-active")}
            style={{
              left: selectionBounds.x - 1.5,
              top: selectionBounds.y - 1.5,
              width: selectionBounds.width + 3,
              height: selectionBounds.height + 3,
            }}
          >
          {/* Rotate handle */}
          <div 
            className="selection-handle selection-handle-tr"
            onMouseDown={(e) => handleEditStart('rotate', e)} 
            onTouchStart={(e) => handleEditStart('rotate', e)}
          >
            <RotateCw className="w-4 h-4" />
          </div>
          {/* Rotate undo */}
          {selectionHasParam('rotate') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', top: -14, right: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('rotate', e)}
              title="Undo rotate"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('rotate') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('rotate')}
                </span>
              )}
            </button>
          )}

          {/* Scale handle */}
          <div 
            className="selection-handle selection-handle-br"
            onMouseDown={(e) => handleEditStart('scale', e)} 
            onTouchStart={(e) => handleEditStart('scale', e)}
          >
            <Maximize2 className="w-4 h-4" />
          </div>
          {/* Scale undo (uses d= in history) */}
          {selectionHasParam('d') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', bottom: -14, right: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('d', e)}
              title="Undo scale"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('d') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('d')}
                </span>
              )}
            </button>
          )}

          {/* Skew (sp) handle */}
          <div 
            className="selection-handle selection-handle-tl" 
            title="Parallelogram (sp)"
            onMouseDown={(e) => handleEditStart('skew', e)} 
            onTouchStart={(e) => handleEditStart('skew', e)}
          >
            <Diamond className="w-4 h-4" />
          </div>
          {/* Skew undo */}
          {selectionHasParam('sp') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', top: -14, left: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('sp', e)}
              title="Undo parallelogram"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('sp') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('sp')}
                </span>
              )}
            </button>
          )}

          {/* Taper (st) handle */}
          <div 
            className="selection-handle selection-handle-bl" 
            title="Trapezoid (st)"
            onMouseDown={(e) => handleEditStart('taper', e)} 
            onTouchStart={(e) => handleEditStart('taper', e)}
          >
            <Hexagon className="w-4 h-4" />
          </div>
          {/* Taper undo */}
          {selectionHasParam('st') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', bottom: -14, left: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('st', e)}
              title="Undo trapezoid"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('st') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('st')}
                </span>
              )}
            </button>
          )}

          {/* Move handle */}
          <div 
            className="selection-handle selection-handle-center" 
            onMouseDown={(e) => handleEditStart('move', e)}
            onTouchStart={(e) => handleEditStart('move', e)}
          >
            <Move className="w-5 h-5" />
          </div>
          {/* Move (offset) undo */}
          {selectionHasParam('offset') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', top: '50%', right: -40, transform: 'translateY(-50%)', zIndex: 12 }}
              onClick={(e) => handleUndoTransform('offset', e)}
              title="Undo move (offset)"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('offset') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('offset')}
                </span>
              )}
            </button>
          )}
        </div>
        </>
      )}

      {/* Taper direction visual indicator */}
      {isEditing === 'taper' && taperDirectionRef.current && selectionBounds && canvasRef.current && (() => {
        const canvasRect = canvasRef.current!.getBoundingClientRect();
        const centerX = selectionBounds.x + selectionBounds.width / 2;
        const centerY = selectionBounds.y + selectionBounds.height / 2;
        const td = taperDirectionRef.current!;
        const rad = td.angle * Math.PI / 180;
        const lineLen = Math.min(td.force * 0.8, Math.max(selectionBounds.width, selectionBounds.height));
        const endX = centerX + Math.cos(rad) * lineLen;
        const endY = centerY + Math.sin(rad) * lineLen;
        // Perpendicular direction for trapezoid shape indicator
        const perpRad = rad + Math.PI / 2;
        const halfW = selectionBounds.width / 2;
        const halfH = selectionBounds.height / 2;
        const expansion = Math.min(1, td.force / 100);
        // Wide side (toward finger)
        const wideHalf = Math.max(halfW, halfH) * (1 + expansion * 0.5);
        // Narrow side (opposite)
        const narrowHalf = Math.max(halfW, halfH) * (1 - expansion * 0.3);
        return (
          <svg className="absolute inset-0 pointer-events-none z-20" width={canvasWidth} height={canvasHeight}>
            {/* Direction line from center to finger */}
            <line
              x1={centerX} y1={centerY} x2={endX} y2={endY}
              stroke="hsl(280, 70%, 55%)" strokeWidth="2" strokeDasharray="4 3" opacity="0.8"
            />
            {/* Center dot */}
            <circle cx={centerX} cy={centerY} r="4" fill="hsl(280, 70%, 55%)" opacity="0.9" />
            {/* Arrow tip */}
            <circle cx={endX} cy={endY} r="3" fill="hsl(50, 90%, 50%)" opacity="0.9" />
            {/* Force label */}
            <text x={endX + 10} y={endY - 10} fill="white" fontSize="11" fontFamily="monospace" opacity="0.8">
              st: {td.angle}° f={td.force}
            </text>
          </svg>
        );
      })()}

      {hoveredCell !== null && !isEditing && (
        <div className="absolute bottom-2 right-2 bg-card/90 backdrop-blur px-2 py-1 rounded text-xs font-mono text-primary pointer-events-none">
          [{hoveredCell}] → ({hoveredCell % gridWidth}, {Math.floor(hoveredCell / gridWidth)})
        </div>
      )}
    </div>
  );
};
