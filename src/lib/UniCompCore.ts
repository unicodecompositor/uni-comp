// UniCompCore.ts
import { SuperTransformer } from './SuperTransformer';
import { Tokenizer, Parser } from './unicomp-parser';

// ---------- Baking Logic ----------
export function bakeD(initial: [number, number, number, number], ops: {
  o?: [number, number];
  s?: [number, number];
  me?: [number, number];
  se?: [number, number];
}): [[number, number], [number, number]] {
  let [x1, y1, x2, y2] = initial;

  if (ops.o) { x1 += ops.o[0]; y1 += ops.o[1]; x2 += ops.o[0]; y2 += ops.o[1]; }
  if (ops.s) { x2 += ops.s[0]; y2 += ops.s[1]; }
  if (ops.me) { x1 -= ops.me[0]; y1 -= ops.me[1]; x2 += ops.me[0]; y2 += ops.me[1]; }
  if (ops.se) { x1 -= ops.se[0]; y1 -= ops.se[1]; x2 += ops.se[0]; y2 += ops.se[1]; }

  return [[x1, y1], [x2, y2]];
}

// ---------- Collapse History ----------
export function collapseHistory(history: any[]): any {
  if (!history || history.length === 0) return {};
  return history[history.length - 1];
}

// ---------- Play State Interpreter ----------
export function interpretPlayState(code: string): string {
  switch (code) {
    case '0': return 'Static Start';
    case '1': return 'Static End';
    case '01': return 'Forward';
    case '10': return 'Reverse';
    case '010': return 'Ping-Pong';
    case '101': return 'Reverse Ping-Pong';
    case '00': return 'Clear/Drop';
    default: return 'Unknown';
  }
}

// ---------- Render UniComp Scene ----------
export function renderUniComp(raw: string, width: number, height: number): HTMLCanvasElement {
  const tokenizer = new Tokenizer(raw);
  const tokens = tokenizer.tokenize();
  const parser = new Parser(tokens);
  const result = parser.parse();

  if (!result.success) throw new Error(result.error.message);

  const spec = result.spec;
  const transformer = new SuperTransformer();

  // Создаём общий canvas для всей сцены
  const sceneCanvas = document.createElement('canvas');
  sceneCanvas.width = width;
  sceneCanvas.height = height;
  const ctx = sceneCanvas.getContext('2d')!;

  // Рендерим grid background
  if (spec.background) {
    ctx.fillStyle = spec.background;
    ctx.globalAlpha = spec.backgroundOpacity ?? 1;
    ctx.fillRect(0, 0, width, height);
  }

  // Рендерим все символы слоями
  for (const symbol of spec.symbols) {
    const canvas = transformer.renderPure(
      symbol.img ?? null,
      symbol.color ?? 'hsl(0,0%,50%)',
      symbol.sp ?? {},
      width,
      height
    );
    ctx.globalAlpha = symbol.opacity ?? 1;
    ctx.drawImage(canvas, 0, 0);
  }

  return sceneCanvas;
}
