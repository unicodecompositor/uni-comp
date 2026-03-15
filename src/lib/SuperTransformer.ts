/**
 * SuperTransformer.ts (Ultimate Edition – WebGL2)
 * GPU-процессор с изоляцией слоёв, SDF-масками, градиентами, текстурными заливками,
 * векторными бордерами, динамическим порядком трансформаций, масками (CSG) и тенями.
 *
 * Режимы:
 *   renderFullScene       – 10 слоёв, изоляция, кэширование (для редактора)
 *   renderInstancedScene  – массовый рендеринг однотипных объектов (для плеера)
 *
 * Трансформации:
 *   - Динамический порядок через массив steps (flip, margin, skew, rotateSkew, warp,
 *     rotateWarp, rotateFinal, perspective, rotatePerspective)
 *   - Фиксированный порядок для обратной совместимости
 *
 * Маски:
 *   - Ссылка на другой объект по ID с операцией union/intersect/subtract
 *
 * Тени:
 *   - Внешние и внутренние; задаются углом, шириной, размытием, цветом, прозрачностью
 */

export const DEFAULT_GPU_EXPAND_FACTOR = 3;

// ==================== Интерфейсы ====================

export interface TransformerParams {
    mode?: number;
    angle?: number;
    force?: number;
    offset?: number;
    scale?: number;
    expandViewport?: boolean;
    expandFactor?: number;
    strokeWidth?: number;          // не используется
    strokeColor?: string;
    strokeOpacity?: number;
    backgroundColor?: string;
    b?: string;
}

export interface PatchRect { x: number; y: number; w: number; h: number; }

export type FillType = 'solid' | 'gradient' | 'texture';
export type TextureMode = 'repeat' | 'mirror' | 'clamp';

export interface GradientParams {
    startColor: string;   // hsla(...)
    endColor: string;     // hsla(...)
    angle: number;        // в градусах
}

export interface TextureParams {
    image: HTMLImageElement | HTMLCanvasElement; // источник (должен быть загружен)
    mode?: TextureMode;          // режим повтора (по умолчанию 'repeat')
    scaleX?: number;             // масштаб по X (1 = исходный размер)
    scaleY?: number;             // масштаб по Y
    offsetX?: number;            // смещение в долях от размера текстуры (0..1)
    offsetY?: number;
    rotation?: number;           // вращение текстуры в градусах
    mirrorX?: boolean;           // зеркальное отражение по X
    mirrorY?: boolean;           // зеркальное отражение по Y
}

// Типы шагов трансформации
export type TransformStepType =
    | 'flip'
    | 'margin'
    | 'skew'
    | 'rotateSkew'
    | 'warp'
    | 'rotateWarp'
    | 'rotateFinal'
    | 'perspective'
    | 'rotatePerspective';

export interface TransformStep {
    type: TransformStepType;      // тип операции
    enabled?: boolean;            // можно отключить шаг (если false, пропускается)
    // Параметры для каждого типа (перекрывают глобальные)
    flipX?: boolean;
    flipY?: boolean;
    marginScale?: number;
    skewAngle?: number;
    skewForce?: number;
    rotateSkewAngle?: number;
    warpMode?: number;            // 0 = taper, 1 = parallel
    warpAngle?: number;
    warpForce?: number;
    rotateWarpAngle?: number;
    rotateFinalAngle?: number;
    perspectiveAngle?: number;    // не используется, оставлен для совместимости
    perspectiveForce?: number;
    rotatePerspectiveAngle?: number;
}

export interface ShapeTransforms {
    steps?: TransformStep[];       // массив шагов в нужном порядке (если задан, используется он)
    // Для обратной совместимости оставляем старые поля (будут применены, если steps не задан)
    flip?: { x: boolean; y: boolean };
    margin?: number;
    skew?: { angle: number; force: number };
    rotateSkew?: number;
    warp?: { mode: number; angle: number; force: number };
    rotateWarp?: number;
    rotateFinal?: number;
    perspective?: { angle: number; force: number };
    rotatePerspective?: number;
}

// Параметры маски (ссылка на другой объект)
export interface MaskRef {
    ref: string;                 // ID другого объекта (должен быть передан в рендер)
    operation: 'union' | 'intersect' | 'subtract' | 'subtract-rev'; // булева операция
}

// Параметры тени
export interface ShadowParams {
    angle: number;               // угол направления в градусах (0 = вправо)
    distance: number;            // ширина (смещение)
    blur: number;                // радиус размытия (в пикселях или относительных единицах)
    color: string;               // цвет тени (hsla)
    inner?: boolean;             // внутренняя тень (по умолчанию false)
}

export interface ShapeParams {
    type: 'circle' | 'rect';
    radius?: number;               // радиус скругления для rect
    fillType?: FillType;
    fillColor?: string;            // для solid
    gradient?: GradientParams;      // для gradient
    texture?: TextureParams;        // для texture
    transforms?: ShapeTransforms;   // последовательность трансформаций
    mask?: MaskRef;                 // опциональная маска
    shadow?: ShadowParams;          // опциональная тень
}

export interface EffectParams {
    type: 'blur' | 'glow' | 'colorMatrix' | 'custom'; // тип эффекта
    intensity?: number;            // интенсивность (для размытия и свечения)
    color?: string;                // цвет свечения
    matrix?: number[];             // для цветовой матрицы
    kernel?: number[];             // для свёртки
}

export interface BorderParams {
    radius: number;
    color: string;
    opacity?: number;
    simplifyEpsilon?: number;
    smoothIterations?: number;
    step?: number;
    effect?: EffectParams;          // эффект для бордера
}

export interface GridParams {
    shape: ShapeParams;                // фон сетки (background)
    border?: BorderParams;              // обводка сетки
    lines?: {                           // параметры линий сетки
        cols: number;
        rows: number;
        color: string;
        width: number;
        effect?: EffectParams;
    };
    numbers?: {                          // параметры номеров ячеек
        font?: string;
        color?: string;
        startIndex?: number;
        effect?: EffectParams;
    };
    warp?: ShapeTransforms;              // трансформации для всей сетки
}

export interface LayerSymbol {
    shape: ShapeParams;                  // фон слоя (background)
    border?: BorderParams;                // обводка слоя
    symbol?: {                            // сам символ (face)
        shape: ShapeParams;
        border?: BorderParams;             // обводка символа
        effect?: EffectParams;              // спецэффект (9)
    };
    invertedMask?: boolean;                // добавлять ли инвертированную маску (10)
    warp?: ShapeTransforms;                // трансформации для этого слоя
}

// Для инстансинга (плеер)
export interface InstancedObject {
    color: [number, number, number, number]; // RGBA
    transforms: ShapeTransforms;
    radius?: number; // для rect
}

export interface InstancedGroup {
    type: 'circle' | 'rect';
    instances: InstancedObject[];
}

// Внутренний тип точки
interface Point { x: number; y: number; }

// ==================== Основной класс ====================

export class SuperTransformer {
    private gl: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;

    // Шейдерные программы
    private fixedProgram: WebGLProgram;   // для renderShapeFixed (фиксированный порядок)
    private dynamicProgram: WebGLProgram; // для renderShapeDynamic (динамический порядок)
    private blobProgram: WebGLProgram;    // для векторных бордеров
    private instancedProgram: WebGLProgram; // для инстансинга

    // Общие ресурсы
    private quadVAO: WebGLVertexArrayObject;
    private instanceBuffer: WebGLBuffer;

    // Кэш для текстур
    private textureCache: Map<string, WebGLTexture> = new Map();

    // Кэш для слоёв (редактор)
    private renderCache: Map<string, HTMLCanvasElement> = new Map();
    private maxCacheSize = 200;

    // Флаг отладки
    public static DEBUG = false;

    // Карта объектов по ID (для масок)
    private objectMap: Map<string, ShapeParams> = new Map();

    constructor(canvas?: HTMLCanvasElement) {
        this.canvas = canvas || document.createElement('canvas');
        const context = this.canvas.getContext('webgl2', {
            alpha: true,
            antialias: true,
            premultipliedAlpha: false
        });
        if (!context) throw new Error("WebGL2 context failed.");
        this.gl = context;

        // Инициализация программ
        this.fixedProgram = this._createProgram(this._vertexShaderSource(), this._fixedFragmentShader());
        this.dynamicProgram = this._createProgram(this._vertexShaderSource(), this._dynamicFragmentShader());
        this.blobProgram = this._createProgram(this._blobVertexShader(), this._blobFragmentShader());
        this.instancedProgram = this._createProgram(this._instancedVertexShader(), this._instancedFragmentShader());

        // Настройка геометрии квадрата (VAO)
        this.quadVAO = this._setupQuadVAO();

        // Буфер для инстансов
        this.instanceBuffer = this.gl.createBuffer()!;
    }

    // ========== Управление объектами по ID ==========
    public registerObject(id: string, shape: ShapeParams): void {
        this.objectMap.set(id, shape);
    }

    public unregisterObject(id: string): void {
        this.objectMap.delete(id);
    }

    // ========== Вспомогательные функции WebGL2 ==========

    private _createProgram(vs: string, fs: string): WebGLProgram {
        const gl = this.gl;
        const loadShader = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(s));
            }
            return s;
        };
        const prog = gl.createProgram()!;
        gl.attachShader(prog, loadShader(gl.VERTEX_SHADER, vs));
        gl.attachShader(prog, loadShader(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(prog);
        return prog;
    }

    private _vertexShaderSource(): string {
        return `#version 300 es
            layout(location = 0) in vec2 aPosition;
            out vec2 vUV;
            void main() {
                vUV = aPosition * 0.5 + 0.5;
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }`;
    }

    // ---------------- Фиксированный шейдер (без динамического порядка) ----------------
    private _fixedFragmentShader(): string {
        return `#version 300 es
            precision highp float;
            in vec2 vUV;
            out vec4 outColor;

            uniform sampler2D uTexture;
            uniform int uFillType;
            uniform vec4 uColor;
            uniform vec4 uGradientStart;
            uniform vec4 uGradientEnd;
            uniform float uGradientAngle;
            uniform int uTextureMode;
            uniform vec2 uTextureScale;
            uniform vec2 uTextureOffset;
            uniform float uTextureRotation;
            uniform int uTextureMirrorX;
            uniform int uTextureMirrorY;
            uniform int uShapeType;
            uniform vec2 uShapeSize;
            uniform float uCornerRadius;

            uniform int uFlipX;
            uniform int uFlipY;
            uniform float uMarginScale;
            uniform float uSkewAngle;
            uniform float uSkewForce;
            uniform float uRotateSkew;
            uniform int uWarpMode;
            uniform float uWarpAngle;
            uniform float uWarpForce;
            uniform float uRotateWarp;
            uniform float uRotateFinal;
            uniform float uPerspectiveForce;
            uniform float uRotatePerspective;

            // Параметры маски
            uniform int uMaskEnabled;
            uniform int uMaskType;        // 0=круг,1=прямоугольник
            uniform vec2 uMaskSize;
            uniform float uMaskCornerRadius;
            uniform int uMaskOperation;   // 0=union,1=intersect,2=subtract (main-mask),3=subtract (mask-main)

            // Параметры тени
            uniform int uShadowEnabled;
            uniform float uShadowAngle;
            uniform float uShadowDistance;
            uniform float uShadowBlur;
            uniform vec4 uShadowColor;
            uniform int uShadowInner;

            // SDF функции
            float sdfCircle(vec2 p, float r) { return length(p) - r; }
            float sdfRoundedBox(vec2 p, vec2 b, float r) {
                vec2 d = abs(p) - b + vec2(r);
                return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
            }

            // Основная SDF для текущей формы
            float sdfMain(vec2 p) {
                if (uShapeType == 0) return sdfCircle(p, 0.5);
                else return sdfRoundedBox(p, uShapeSize, uCornerRadius);
            }

            // SDF для маски
            float sdfMask(vec2 p) {
                if (uMaskType == 0) return sdfCircle(p, 0.5);
                else return sdfRoundedBox(p, uMaskSize, uMaskCornerRadius);
            }

            // Применение фиксированных трансформаций (как раньше)
            vec2 applyFixedTransforms(vec2 p) {
                if (uFlipX != 0) p.x = -p.x;
                if (uFlipY != 0) p.y = -p.y;
                if (uMarginScale != 0.0) p /= uMarginScale;
                if (uSkewForce != 0.0) {
                    float rad = radians(uSkewAngle);
                    vec2 dir = vec2(cos(rad), sin(rad));
                    vec2 perp = vec2(-dir.y, dir.x);
                    float dAlong = dot(p, dir);
                    float dSide = dot(p, perp);
                    p = dir * (dAlong + dSide * uSkewForce) + perp * dSide;
                }
                if (uRotateSkew != 0.0) {
                    float rad = radians(uRotateSkew);
                    mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                    p = rot * p;
                }
                if (uWarpForce != 0.0) {
                    float rad = radians(uWarpAngle);
                    vec2 dir = vec2(cos(rad), sin(rad));
                    vec2 perp = vec2(-dir.y, dir.x);
                    float dAlong = dot(p, dir);
                    float dSide = dot(p, perp);
                    if (uWarpMode == 0) {
                        float widthScale = clamp(1.0 + (dAlong / 0.5) * (uWarpForce * 0.01), 0.15, 8.0);
                        p = dir * dAlong + perp * (dSide / widthScale);
                    } else {
                        p = dir * (dAlong - dSide * (uWarpForce * 0.01)) + perp * dSide;
                    }
                }
                if (uRotateWarp != 0.0) {
                    float rad = radians(uRotateWarp);
                    mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                    p = rot * p;
                }
                if (uRotateFinal != 0.0) {
                    float rad = radians(uRotateFinal);
                    mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                    p = rot * p;
                }
                if (uPerspectiveForce != 0.0) {
                    float factor = 1.0 + p.x * uPerspectiveForce;
                    p.y *= factor;
                }
                if (uRotatePerspective != 0.0) {
                    float rad = radians(uRotatePerspective);
                    mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                    p = rot * p;
                }
                return p;
            }

            vec2 angleToVector(float deg) {
                float rad = radians(deg);
                return vec2(cos(rad), sin(rad));
            }

            vec4 linearGradient(vec2 uv, vec4 start, vec4 end, float angle) {
                vec2 dir = angleToVector(angle);
                float t = dot(uv - 0.5, dir) + 0.5;
                t = clamp(t, 0.0, 1.0);
                return mix(start, end, t);
            }

            vec2 transformTextureUV(vec2 uv) {
                uv -= 0.5;
                uv /= uTextureScale;
                if (uTextureRotation != 0.0) {
                    float cosR = cos(uTextureRotation);
                    float sinR = sin(uTextureRotation);
                    uv = vec2(uv.x * cosR - uv.y * sinR, uv.x * sinR + uv.y * cosR);
                }
                uv += 0.5;
                uv -= uTextureOffset;
                if (uTextureMode == 0) uv = fract(uv);
                else if (uTextureMode == 1) uv = abs(fract(uv * 0.5 + 0.5) * 2.0 - 1.0);
                else uv = clamp(uv, 0.0, 1.0);
                if (uTextureMirrorX == 1) uv.x = 1.0 - uv.x;
                if (uTextureMirrorY == 1) uv.y = 1.0 - uv.y;
                return uv;
            }

            void main() {
                vec2 p = vUV - 0.5;
                vec2 transformed = applyFixedTransforms(p);

                // Основная SDF после трансформаций
                float dMain = sdfMain(transformed);
                float dMask = 1e5;
                if (uMaskEnabled != 0) {
                    dMask = sdfMask(transformed);
                }

                // Булева операция
                float d;
                if (uMaskEnabled != 0) {
                    if (uMaskOperation == 0) d = min(dMain, dMask);
                    else if (uMaskOperation == 1) d = max(dMain, dMask);
                    else if (uMaskOperation == 2) d = max(dMain, -dMask);
                    else d = max(-dMain, dMask);
                } else {
                    d = dMain;
                }

                float mask = smoothstep(0.0, fwidth(d), -d);

                // Тень
                vec4 shadowColor = vec4(0.0);
                if (uShadowEnabled != 0) {
                    vec2 shadowDir = angleToVector(uShadowAngle);
                    vec2 pShadow = transformed + shadowDir * uShadowDistance;
                    float dShadow = sdfMain(pShadow);
                    // Размытие тени через smoothstep (чем больше blur, тем мягче)
                    float shadowAlpha = smoothstep(0.0, uShadowBlur, -dShadow);
                    shadowColor = uShadowColor;
                    shadowColor.a *= shadowAlpha;
                    if (uShadowInner != 0) {
                        shadowColor.a *= step(0.0, -d); // только внутри основной формы
                    }
                }

                // Основной цвет
                vec4 baseColor;
                if (uFillType == 1) {
                    baseColor = linearGradient(vUV, uGradientStart, uGradientEnd, uGradientAngle);
                } else if (uFillType == 2) {
                    vec2 texUV = transformTextureUV(transformed + 0.5);
                    baseColor = texture(uTexture, texUV);
                } else {
                    baseColor = uColor;
                }
                baseColor.a *= mask;

                // Композиция с тенью
                vec4 finalColor;
                if (uShadowEnabled != 0 && uShadowInner == 0) {
                    // Внешняя тень под основной формой
                    finalColor = mix(shadowColor, baseColor, baseColor.a);
                } else {
                    finalColor = baseColor;
                    if (uShadowEnabled != 0 && uShadowInner != 0) {
                        // Внутренняя тень поверх
                        finalColor = mix(finalColor, shadowColor, shadowColor.a);
                    }
                }

                outColor = finalColor;
            }`;
    }

    // ---------------- Динамический шейдер (с steps) ----------------
    private _dynamicFragmentShader(): string {
        return `#version 300 es
            precision highp float;
            in vec2 vUV;
            out vec4 outColor;

            uniform sampler2D uTexture;
            uniform int uFillType;
            uniform vec4 uColor;
            uniform vec4 uGradientStart;
            uniform vec4 uGradientEnd;
            uniform float uGradientAngle;
            uniform int uTextureMode;
            uniform vec2 uTextureScale;
            uniform vec2 uTextureOffset;
            uniform float uTextureRotation;
            uniform int uTextureMirrorX;
            uniform int uTextureMirrorY;
            uniform int uShapeType;
            uniform vec2 uShapeSize;
            uniform float uCornerRadius;

            uniform int uFlipX;
            uniform int uFlipY;
            uniform float uMarginScale;
            uniform float uSkewAngle;
            uniform float uSkewForce;
            uniform float uRotateSkew;
            uniform int uWarpMode;
            uniform float uWarpAngle;
            uniform float uWarpForce;
            uniform float uRotateWarp;
            uniform float uRotateFinal;
            uniform float uPerspectiveForce;
            uniform float uRotatePerspective;

            // Параметры маски (аналогично)
            uniform int uMaskEnabled;
            uniform int uMaskType;
            uniform vec2 uMaskSize;
            uniform float uMaskCornerRadius;
            uniform int uMaskOperation;

            // Параметры тени
            uniform int uShadowEnabled;
            uniform float uShadowAngle;
            uniform float uShadowDistance;
            uniform float uShadowBlur;
            uniform vec4 uShadowColor;
            uniform int uShadowInner;

            // Динамический порядок
            uniform int uStepCount;
            uniform int uStepTypes[20];

            // SDF функции (те же)
            float sdfCircle(vec2 p, float r) { return length(p) - r; }
            float sdfRoundedBox(vec2 p, vec2 b, float r) {
                vec2 d = abs(p) - b + vec2(r);
                return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
            }

            float sdfMain(vec2 p) {
                if (uShapeType == 0) return sdfCircle(p, 0.5);
                else return sdfRoundedBox(p, uShapeSize, uCornerRadius);
            }

            float sdfMask(vec2 p) {
                if (uMaskType == 0) return sdfCircle(p, 0.5);
                else return sdfRoundedBox(p, uMaskSize, uMaskCornerRadius);
            }

            vec2 angleToVector(float deg) {
                float rad = radians(deg);
                return vec2(cos(rad), sin(rad));
            }

            vec4 linearGradient(vec2 uv, vec4 start, vec4 end, float angle) {
                vec2 dir = angleToVector(angle);
                float t = dot(uv - 0.5, dir) + 0.5;
                t = clamp(t, 0.0, 1.0);
                return mix(start, end, t);
            }

            vec2 transformTextureUV(vec2 uv) {
                uv -= 0.5;
                uv /= uTextureScale;
                if (uTextureRotation != 0.0) {
                    float cosR = cos(uTextureRotation);
                    float sinR = sin(uTextureRotation);
                    uv = vec2(uv.x * cosR - uv.y * sinR, uv.x * sinR + uv.y * cosR);
                }
                uv += 0.5;
                uv -= uTextureOffset;
                if (uTextureMode == 0) uv = fract(uv);
                else if (uTextureMode == 1) uv = abs(fract(uv * 0.5 + 0.5) * 2.0 - 1.0);
                else uv = clamp(uv, 0.0, 1.0);
                if (uTextureMirrorX == 1) uv.x = 1.0 - uv.x;
                if (uTextureMirrorY == 1) uv.y = 1.0 - uv.y;
                return uv;
            }

            void main() {
                vec2 p = vUV - 0.5;
                // Применяем динамические трансформации
                for (int i = 0; i < 20; i++) {
                    if (i >= uStepCount) break;
                    int step = uStepTypes[i];
                    if (step == 0) { // flip
                        if (uFlipX != 0) p.x = -p.x;
                        if (uFlipY != 0) p.y = -p.y;
                    } else if (step == 1) { // margin
                        if (uMarginScale != 0.0) p /= uMarginScale;
                    } else if (step == 2) { // skew
                        if (uSkewForce != 0.0) {
                            float rad = radians(uSkewAngle);
                            vec2 dir = vec2(cos(rad), sin(rad));
                            vec2 perp = vec2(-dir.y, dir.x);
                            float dAlong = dot(p, dir);
                            float dSide = dot(p, perp);
                            p = dir * (dAlong + dSide * uSkewForce) + perp * dSide;
                        }
                    } else if (step == 3) { // rotateSkew
                        if (uRotateSkew != 0.0) {
                            float rad = radians(uRotateSkew);
                            mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                            p = rot * p;
                        }
                    } else if (step == 4) { // warp
                        if (uWarpForce != 0.0) {
                            float rad = radians(uWarpAngle);
                            vec2 dir = vec2(cos(rad), sin(rad));
                            vec2 perp = vec2(-dir.y, dir.x);
                            float dAlong = dot(p, dir);
                            float dSide = dot(p, perp);
                            if (uWarpMode == 0) {
                                float widthScale = clamp(1.0 + (dAlong / 0.5) * (uWarpForce * 0.01), 0.15, 8.0);
                                p = dir * dAlong + perp * (dSide / widthScale);
                            } else {
                                p = dir * (dAlong - dSide * (uWarpForce * 0.01)) + perp * dSide;
                            }
                        }
                    } else if (step == 5) { // rotateWarp
                        if (uRotateWarp != 0.0) {
                            float rad = radians(uRotateWarp);
                            mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                            p = rot * p;
                        }
                    } else if (step == 6) { // rotateFinal
                        if (uRotateFinal != 0.0) {
                            float rad = radians(uRotateFinal);
                            mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                            p = rot * p;
                        }
                    } else if (step == 7) { // perspective
                        if (uPerspectiveForce != 0.0) {
                            float factor = 1.0 + p.x * uPerspectiveForce;
                            p.y *= factor;
                        }
                    } else if (step == 8) { // rotatePerspective
                        if (uRotatePerspective != 0.0) {
                            float rad = radians(uRotatePerspective);
                            mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                            p = rot * p;
                        }
                    }
                }

                // Основная SDF после трансформаций
                float dMain = sdfMain(p);
                float dMask = 1e5;
                if (uMaskEnabled != 0) {
                    dMask = sdfMask(p);
                }

                float d;
                if (uMaskEnabled != 0) {
                    if (uMaskOperation == 0) d = min(dMain, dMask);
                    else if (uMaskOperation == 1) d = max(dMain, dMask);
                    else if (uMaskOperation == 2) d = max(dMain, -dMask);
                    else d = max(-dMain, dMask);
                } else {
                    d = dMain;
                }

                float mask = smoothstep(0.0, fwidth(d), -d);

                // Тень
                vec4 shadowColor = vec4(0.0);
                if (uShadowEnabled != 0) {
                    vec2 shadowDir = angleToVector(uShadowAngle);
                    vec2 pShadow = p + shadowDir * uShadowDistance;
                    float dShadow = sdfMain(pShadow);
                    float shadowAlpha = smoothstep(0.0, uShadowBlur, -dShadow);
                    shadowColor = uShadowColor;
                    shadowColor.a *= shadowAlpha;
                    if (uShadowInner != 0) {
                        shadowColor.a *= step(0.0, -d);
                    }
                }

                // Основной цвет
                vec4 baseColor;
                if (uFillType == 1) {
                    baseColor = linearGradient(vUV, uGradientStart, uGradientEnd, uGradientAngle);
                } else if (uFillType == 2) {
                    vec2 texUV = transformTextureUV(p + 0.5);
                    baseColor = texture(uTexture, texUV);
                } else {
                    baseColor = uColor;
                }
                baseColor.a *= mask;

                // Композиция
                vec4 finalColor;
                if (uShadowEnabled != 0 && uShadowInner == 0) {
                    finalColor = mix(shadowColor, baseColor, baseColor.a);
                } else {
                    finalColor = baseColor;
                    if (uShadowEnabled != 0 && uShadowInner != 0) {
                        finalColor = mix(finalColor, shadowColor, shadowColor.a);
                    }
                }

                outColor = finalColor;
            }`;
    }

    // ---------------- Шейдеры для бордеров ----------------
    private _blobVertexShader(): string {
        return `#version 300 es
            layout(location = 0) in vec2 aCenter;
            out vec2 vUv;
            uniform float uRadius;
            uniform vec2 uResolution;

            void main() {
                int id = gl_VertexID % 4;
                float x = float(id == 1 || id == 2 ? 1 : -1);
                float y = float(id == 2 || id == 3 ? 1 : -1);
                vec2 corner = vec2(x, y);
                vec2 pos = aCenter + corner * uRadius * 2.0 / uResolution;
                gl_Position = vec4(pos, 0.0, 1.0);
                vUv = corner * 0.5 + 0.5;
            }`;
    }

    private _blobFragmentShader(): string {
        return `#version 300 es
            precision highp float;
            in vec2 vUv;
            out vec4 outColor;
            uniform vec4 uColor;

            void main() {
                float d = length(vUv - 0.5) * 2.0;
                float alpha = 1.0 - smoothstep(0.0, fwidth(d), d - 1.0);
                outColor = vec4(uColor.rgb, uColor.a * alpha);
            }`;
    }

    // ---------------- Инстансный шейдер (упрощённый, без масок и теней) ----------------
    private _instancedVertexShader(): string {
        return `#version 300 es
            layout(location = 0) in vec2 aPosition;
            layout(location = 1) in vec4 aInstParams1; // st, sp, m, r
            layout(location = 2) in vec4 aInstParams2; // f, w, colorR, colorG
            out vec2 vUV;
            out vec4 vParams1;
            out vec4 vParams2;

            void main() {
                vUV = aPosition;
                vParams1 = aInstParams1;
                vParams2 = aInstParams2;
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }`;
    }

    private _instancedFragmentShader(): string {
        return `#version 300 es
            precision highp float;
            in vec2 vUV;
            in vec4 vParams1;
            in vec4 vParams2;
            out vec4 outColor;

            float sdfCircle(vec2 p, float r) { return length(p) - r; }

            void main() {
                float st = vParams1.x;
                float sp = vParams1.y;
                float m  = vParams1.z;
                float w  = vParams2.y;

                vec2 p = vUV;
                // Упрощённые трансформации
                p = p * (1.0 + w * length(p));
                p.x += p.y * sp;
                p.x /= (1.0 - p.y * st);

                float d = length(p) - (1.0 - m);
                float alpha = smoothstep(0.01, 0.0, d);
                if (alpha < 0.01) discard;

                vec3 color = vec3(vParams2.z, vParams2.w, 0.5);
                outColor = vec4(color, alpha);
            }`;
    }

    private _setupQuadVAO(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const vbo = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
        return vao;
    }

    private _checkGLError(operation: string): void {
        if (!SuperTransformer.DEBUG) return;
        const gl = this.gl;
        const err = gl.getError();
        if (err !== gl.NO_ERROR) {
            console.error(`WebGL error during ${operation}: 0x${err.toString(16)}`);
        }
    }

    // ========== Утилиты ==========

    static hslaToRgba(hsl: string): [number, number, number, number] {
        if (!hsl) return [1, 1, 1, 1];
        const clean = hsl.replace(/\s/g, '').toLowerCase();
        const match = clean.match(/^hsla?\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)%?,(\d+(?:\.\d+)?)%?(?:,(\d+(?:\.\d+)?))?\)$/);
        if (!match) return [1, 1, 1, 1];
        const h = parseFloat(match[1]) / 360;
        const s = parseFloat(match[2]) / 100;
        const l = parseFloat(match[3]) / 100;
        const a = match[4] ? parseFloat(match[4]) : 1.0;
        if (isNaN(h) || isNaN(s) || isNaN(l) || isNaN(a)) return [1, 1, 1, 1];
        if (s === 0) return [l, l, l, a];
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return [
            Math.max(0, Math.min(1, hue2rgb(p, q, h + 1/3))),
            Math.max(0, Math.min(1, hue2rgb(p, q, h))),
            Math.max(0, Math.min(1, hue2rgb(p, q, h - 1/3))),
            Math.max(0, Math.min(1, a))
        ];
    }

    private _getTexture(image: HTMLImageElement | HTMLCanvasElement): WebGLTexture {
        const gl = this.gl;
        const key = (image instanceof HTMLImageElement ? image.src : image.width + 'x' + image.height) || 'canvas';
        if (this.textureCache.has(key)) return this.textureCache.get(key)!;

        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.textureCache.set(key, tex);
        return tex;
    }

    private _createEmptyCanvas(width: number, height: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    private _getDummyTexture(): WebGLTexture {
        const gl = this.gl;
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return tex;
    }

    // ========== Рендер с фиксированным порядком ==========

    public renderShapeFixed(
        shape: ShapeParams,
        warp: ShapeTransforms | undefined,
        width: number,
        height: number,
        effect?: EffectParams
    ): HTMLCanvasElement {
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));

        const safeShape = {
            type: shape.type || 'rect',
            radius: shape.radius ?? 0,
            fillType: shape.fillType || 'solid',
            fillColor: shape.fillColor || 'hsla(0,0%,100%,1)',
            gradient: shape.gradient,
            texture: shape.texture,
            mask: shape.mask,
            shadow: shape.shadow
        };

        const gl = this.gl;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        gl.viewport(0, 0, width, height);
        gl.useProgram(this.fixedProgram);
        gl.bindVertexArray(this.quadVAO);

        // Заливка
        let fillType = 0;
        let useTexture = false;
        let textureToUse = this._getDummyTexture();
        if (safeShape.fillType === 'gradient' && safeShape.gradient) {
            fillType = 1;
        } else if (safeShape.fillType === 'texture' && safeShape.texture) {
            fillType = 2;
            useTexture = true;
            textureToUse = this._getTexture(safeShape.texture.image);
        }
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uFillType"), fillType);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textureToUse);
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uTexture"), 0);

        // Текстурные параметры
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uTextureMode"), 0);
        gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uTextureScale"), 1, 1);
        gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uTextureOffset"), 0, 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uTextureRotation"), 0);
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uTextureMirrorX"), 0);
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uTextureMirrorY"), 0);

        // Параметры трансформаций (значения по умолчанию)
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uFlipX"), 0);
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uFlipY"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uMarginScale"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uSkewAngle"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uSkewForce"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotateSkew"), 0);
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uWarpMode"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uWarpAngle"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uWarpForce"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotateWarp"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotateFinal"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uPerspectiveForce"), 0);
        gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotatePerspective"), 0);

        if (warp) {
            if (warp.flip) {
                gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uFlipX"), warp.flip.x ? 1 : 0);
                gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uFlipY"), warp.flip.y ? 1 : 0);
            }
            if (warp.margin !== undefined) gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uMarginScale"), warp.margin);
            if (warp.skew) {
                gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uSkewAngle"), warp.skew.angle);
                gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uSkewForce"), warp.skew.force);
            }
            if (warp.rotateSkew !== undefined) gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotateSkew"), warp.rotateSkew);
            if (warp.warp) {
                gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uWarpMode"), warp.warp.mode);
                gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uWarpAngle"), warp.warp.angle);
                gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uWarpForce"), warp.warp.force);
            }
            if (warp.rotateWarp !== undefined) gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotateWarp"), warp.rotateWarp);
            if (warp.rotateFinal !== undefined) gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotateFinal"), warp.rotateFinal);
            if (warp.perspective) {
                gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uPerspectiveForce"), warp.perspective.force);
            }
            if (warp.rotatePerspective !== undefined) gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uRotatePerspective"), warp.rotatePerspective);
        }

        // Обработка маски
        if (safeShape.mask) {
            const maskObj = this.objectMap.get(safeShape.mask.ref);
            if (maskObj) {
                gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uMaskEnabled"), 1);
                const maskType = maskObj.type === 'circle' ? 0 : 1;
                gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uMaskType"), maskType);
                if (maskObj.type === 'rect') {
                    const r = Math.min(maskObj.radius ?? 0, 0.5);
                    const halfSize = 0.5 - r;
                    gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uMaskSize"), halfSize, halfSize);
                    gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uMaskCornerRadius"), r);
                } else {
                    gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uMaskSize"), 0, 0);
                    gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uMaskCornerRadius"), 0);
                }
                let op = 0;
                switch (safeShape.mask.operation) {
                    case 'union': op = 0; break;
                    case 'intersect': op = 1; break;
                    case 'subtract': op = 2; break;
                    case 'subtract-rev': op = 3; break;
                }
                gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uMaskOperation"), op);
            } else {
                console.warn(`Mask object with id "${safeShape.mask.ref}" not found`);
                gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uMaskEnabled"), 0);
            }
        } else {
            gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uMaskEnabled"), 0);
        }

        // Обработка тени
        if (safeShape.shadow) {
            gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uShadowEnabled"), 1);
            gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uShadowAngle"), safeShape.shadow.angle);
            gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uShadowDistance"), safeShape.shadow.distance);
            gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uShadowBlur"), safeShape.shadow.blur);
            const rgba = SuperTransformer.hslaToRgba(safeShape.shadow.color);
            gl.uniform4fv(gl.getUniformLocation(this.fixedProgram, "uShadowColor"), new Float32Array(rgba));
            gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uShadowInner"), safeShape.shadow.inner ? 1 : 0);
        } else {
            gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uShadowEnabled"), 0);
        }

        // Цвет/градиент/текстура
        if (fillType === 1) {
            const start = SuperTransformer.hslaToRgba(safeShape.gradient!.startColor);
            const end = SuperTransformer.hslaToRgba(safeShape.gradient!.endColor);
            gl.uniform4fv(gl.getUniformLocation(this.fixedProgram, "uGradientStart"), new Float32Array(start));
            gl.uniform4fv(gl.getUniformLocation(this.fixedProgram, "uGradientEnd"), new Float32Array(end));
            gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uGradientAngle"), safeShape.gradient!.angle);
        } else if (fillType === 2) {
            const tex = safeShape.texture!;
            const mode = tex.mode === 'mirror' ? 1 : (tex.mode === 'clamp' ? 2 : 0);
            gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uTextureMode"), mode);
            gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uTextureScale"), tex.scaleX ?? 1, tex.scaleY ?? 1);
            gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uTextureOffset"), tex.offsetX ?? 0, tex.offsetY ?? 0);
            gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uTextureRotation"), (tex.rotation ?? 0) * Math.PI / 180);
            gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uTextureMirrorX"), tex.mirrorX ? 1 : 0);
            gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uTextureMirrorY"), tex.mirrorY ? 1 : 0);
            gl.uniform4f(gl.getUniformLocation(this.fixedProgram, "uColor"), 1,1,1,1);
        } else {
            const solidColor = SuperTransformer.hslaToRgba(safeShape.fillColor);
            gl.uniform4fv(gl.getUniformLocation(this.fixedProgram, "uColor"), new Float32Array(solidColor));
        }

        // SDF параметры основной формы
        const shapeType = safeShape.type === 'circle' ? 0 : 1;
        gl.uniform1i(gl.getUniformLocation(this.fixedProgram, "uShapeType"), shapeType);
        if (safeShape.type === 'rect') {
            const r = Math.min(safeShape.radius, 0.5);
            const halfSize = 0.5 - r;
            gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uShapeSize"), halfSize, halfSize);
            gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uCornerRadius"), r);
        } else {
            gl.uniform2f(gl.getUniformLocation(this.fixedProgram, "uShapeSize"), 0, 0);
            gl.uniform1f(gl.getUniformLocation(this.fixedProgram, "uCornerRadius"), 0);
        }

        // Рендеринг
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this._checkGLError('drawArrays (fixed)');

        // Копирование пикселей в новый canvas
        const outCanvas = document.createElement('canvas');
        outCanvas.width = width;
        outCanvas.height = height;
        const outCtx = outCanvas.getContext('2d')!;

        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        this._checkGLError('readPixels');

        const imageData = outCtx.createImageData(width, height);
        const rowBytes = width * 4;
        for (let y = 0; y < height; y++) {
            const srcOffset = (height - 1 - y) * rowBytes;
            const dstOffset = y * rowBytes;
            imageData.data.set(pixels.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
        }
        outCtx.putImageData(imageData, 0, 0);

        if (effect) return this._applyEffect(outCanvas, effect);
        return outCanvas;
    }

    // ========== Рендер с динамическим порядком (ПОЛНАЯ РЕАЛИЗАЦИЯ) ==========
    public renderShapeDynamic(
        shape: ShapeParams,
        warp: ShapeTransforms | undefined,
        width: number,
        height: number,
        effect?: EffectParams
    ): HTMLCanvasElement {
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));

        const safeShape = {
            type: shape.type || 'rect',
            radius: shape.radius ?? 0,
            fillType: shape.fillType || 'solid',
            fillColor: shape.fillColor || 'hsla(0,0%,100%,1)',
            gradient: shape.gradient,
            texture: shape.texture,
            mask: shape.mask,
            shadow: shape.shadow
        };

        const gl = this.gl;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        gl.viewport(0, 0, width, height);
        gl.useProgram(this.dynamicProgram);
        gl.bindVertexArray(this.quadVAO);

        // Заливка
        let fillType = 0;
        let useTexture = false;
        let textureToUse = this._getDummyTexture();
        if (safeShape.fillType === 'gradient' && safeShape.gradient) {
            fillType = 1;
        } else if (safeShape.fillType === 'texture' && safeShape.texture) {
            fillType = 2;
            useTexture = true;
            textureToUse = this._getTexture(safeShape.texture.image);
        }
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uFillType"), fillType);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textureToUse);
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uTexture"), 0);

        // Текстурные параметры
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uTextureMode"), 0);
        gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uTextureScale"), 1, 1);
        gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uTextureOffset"), 0, 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uTextureRotation"), 0);
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uTextureMirrorX"), 0);
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uTextureMirrorY"), 0);

        // Параметры трансформаций (значения по умолчанию)
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uFlipX"), 0);
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uFlipY"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uMarginScale"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uSkewAngle"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uSkewForce"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotateSkew"), 0);
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uWarpMode"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uWarpAngle"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uWarpForce"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotateWarp"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotateFinal"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uPerspectiveForce"), 0);
        gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotatePerspective"), 0);

        if (warp) {
            if (warp.flip) {
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uFlipX"), warp.flip.x ? 1 : 0);
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uFlipY"), warp.flip.y ? 1 : 0);
            }
            if (warp.margin !== undefined) gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uMarginScale"), warp.margin);
            if (warp.skew) {
                gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uSkewAngle"), warp.skew.angle);
                gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uSkewForce"), warp.skew.force);
            }
            if (warp.rotateSkew !== undefined) gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotateSkew"), warp.rotateSkew);
            if (warp.warp) {
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uWarpMode"), warp.warp.mode);
                gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uWarpAngle"), warp.warp.angle);
                gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uWarpForce"), warp.warp.force);
            }
            if (warp.rotateWarp !== undefined) gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotateWarp"), warp.rotateWarp);
            if (warp.rotateFinal !== undefined) gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotateFinal"), warp.rotateFinal);
            if (warp.perspective) {
                gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uPerspectiveForce"), warp.perspective.force);
            }
            if (warp.rotatePerspective !== undefined) gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uRotatePerspective"), warp.rotatePerspective);
        }

        // Обработка маски
        if (safeShape.mask) {
            const maskObj = this.objectMap.get(safeShape.mask.ref);
            if (maskObj) {
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uMaskEnabled"), 1);
                const maskType = maskObj.type === 'circle' ? 0 : 1;
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uMaskType"), maskType);
                if (maskObj.type === 'rect') {
                    const r = Math.min(maskObj.radius ?? 0, 0.5);
                    const halfSize = 0.5 - r;
                    gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uMaskSize"), halfSize, halfSize);
                    gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uMaskCornerRadius"), r);
                } else {
                    gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uMaskSize"), 0, 0);
                    gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uMaskCornerRadius"), 0);
                }
                let op = 0;
                switch (safeShape.mask.operation) {
                    case 'union': op = 0; break;
                    case 'intersect': op = 1; break;
                    case 'subtract': op = 2; break;
                    case 'subtract-rev': op = 3; break;
                }
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uMaskOperation"), op);
            } else {
                console.warn(`Mask object with id "${safeShape.mask.ref}" not found`);
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uMaskEnabled"), 0);
            }
        } else {
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uMaskEnabled"), 0);
        }

        // Обработка тени
        if (safeShape.shadow) {
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uShadowEnabled"), 1);
            gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uShadowAngle"), safeShape.shadow.angle);
            gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uShadowDistance"), safeShape.shadow.distance);
            gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uShadowBlur"), safeShape.shadow.blur);
            const rgba = SuperTransformer.hslaToRgba(safeShape.shadow.color);
            gl.uniform4fv(gl.getUniformLocation(this.dynamicProgram, "uShadowColor"), new Float32Array(rgba));
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uShadowInner"), safeShape.shadow.inner ? 1 : 0);
        } else {
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uShadowEnabled"), 0);
        }

        // Установка динамического порядка (steps)
        if (warp && warp.steps && warp.steps.length > 0) {
            const stepTypes: number[] = [];
            warp.steps.forEach(step => {
                if (step.enabled === false) return;
                switch (step.type) {
                    case 'flip': stepTypes.push(0); break;
                    case 'margin': stepTypes.push(1); break;
                    case 'skew': stepTypes.push(2); break;
                    case 'rotateSkew': stepTypes.push(3); break;
                    case 'warp': stepTypes.push(4); break;
                    case 'rotateWarp': stepTypes.push(5); break;
                    case 'rotateFinal': stepTypes.push(6); break;
                    case 'perspective': stepTypes.push(7); break;
                    case 'rotatePerspective': stepTypes.push(8); break;
                }
            });
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uStepCount"), stepTypes.length);
            for (let i = 0; i < stepTypes.length; i++) {
                gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, `uStepTypes[${i}]`), stepTypes[i]);
            }
        } else {
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uStepCount"), 0);
        }

        // Цвет/градиент/текстура
        if (fillType === 1) {
            const start = SuperTransformer.hslaToRgba(safeShape.gradient!.startColor);
            const end = SuperTransformer.hslaToRgba(safeShape.gradient!.endColor);
            gl.uniform4fv(gl.getUniformLocation(this.dynamicProgram, "uGradientStart"), new Float32Array(start));
            gl.uniform4fv(gl.getUniformLocation(this.dynamicProgram, "uGradientEnd"), new Float32Array(end));
            gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uGradientAngle"), safeShape.gradient!.angle);
        } else if (fillType === 2) {
            const tex = safeShape.texture!;
            const mode = tex.mode === 'mirror' ? 1 : (tex.mode === 'clamp' ? 2 : 0);
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uTextureMode"), mode);
            gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uTextureScale"), tex.scaleX ?? 1, tex.scaleY ?? 1);
            gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uTextureOffset"), tex.offsetX ?? 0, tex.offsetY ?? 0);
            gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uTextureRotation"), (tex.rotation ?? 0) * Math.PI / 180);
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uTextureMirrorX"), tex.mirrorX ? 1 : 0);
            gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uTextureMirrorY"), tex.mirrorY ? 1 : 0);
            gl.uniform4f(gl.getUniformLocation(this.dynamicProgram, "uColor"), 1,1,1,1);
        } else {
            const solidColor = SuperTransformer.hslaToRgba(safeShape.fillColor);
            gl.uniform4fv(gl.getUniformLocation(this.dynamicProgram, "uColor"), new Float32Array(solidColor));
        }

        // SDF параметры основной формы
        const shapeType = safeShape.type === 'circle' ? 0 : 1;
        gl.uniform1i(gl.getUniformLocation(this.dynamicProgram, "uShapeType"), shapeType);
        if (safeShape.type === 'rect') {
            const r = Math.min(safeShape.radius, 0.5);
            const halfSize = 0.5 - r;
            gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uShapeSize"), halfSize, halfSize);
            gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uCornerRadius"), r);
        } else {
            gl.uniform2f(gl.getUniformLocation(this.dynamicProgram, "uShapeSize"), 0, 0);
            gl.uniform1f(gl.getUniformLocation(this.dynamicProgram, "uCornerRadius"), 0);
        }

        // Рендеринг
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this._checkGLError('drawArrays (dynamic)');

        // Копирование пикселей в новый canvas
        const outCanvas = document.createElement('canvas');
        outCanvas.width = width;
        outCanvas.height = height;
        const outCtx = outCanvas.getContext('2d')!;

        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        this._checkGLError('readPixels');

        const imageData = outCtx.createImageData(width, height);
        const rowBytes = width * 4;
        for (let y = 0; y < height; y++) {
            const srcOffset = (height - 1 - y) * rowBytes;
            const dstOffset = y * rowBytes;
            imageData.data.set(pixels.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
        }
        outCtx.putImageData(imageData, 0, 0);

        if (effect) return this._applyEffect(outCanvas, effect);
        return outCanvas;
    }

    // ========== Рисование векторного бордера ==========

    public renderVectorBorder(
        contours: Point[][],
        borderParams: BorderParams,
        width: number,
        height: number
    ): HTMLCanvasElement {
        const allPoints: Point[] = [];
        const useFloat32 = borderParams.useFloat32 ?? false;

        for (let contour of contours) {
            let simplified = this._douglasPeucker(contour, borderParams.simplifyEpsilon ?? 2);
            if (borderParams.smoothIterations && borderParams.smoothIterations > 0) {
                if (useFloat32) {
                    let floatPoints = new Float32Array(simplified.length * 2);
                    for (let i = 0; i < simplified.length; i++) {
                        floatPoints[i * 2] = simplified[i].x;
                        floatPoints[i * 2 + 1] = simplified[i].y;
                    }
                    for (let i = 0; i < borderParams.smoothIterations; i++) {
                        floatPoints = this._chaikinFloat32(floatPoints, true);
                    }
                    simplified = [];
                    for (let i = 0; i < floatPoints.length / 2; i++) {
                        simplified.push({ x: floatPoints[i * 2], y: floatPoints[i * 2 + 1] });
                    }
                } else {
                    for (let i = 0; i < borderParams.smoothIterations; i++) {
                        simplified = this._chaikin(simplified, true);
                    }
                }
            }
            if (borderParams.step && borderParams.step > 0) {
                simplified = this._interpolateCurve(simplified, borderParams.step, true);
            }
            allPoints.push(...simplified);
        }

        if (allPoints.length === 0) {
            return this._createEmptyCanvas(width, height);
        }

        const blobCanvas = this._drawBlobsOnCanvasBase(width, height, allPoints, {
            blobRadius: borderParams.radius,
            blobColor: borderParams.color,
            blobOpacity: borderParams.opacity ?? 1
        });

        if (borderParams.effect) {
            return this._applyEffect(blobCanvas, borderParams.effect);
        }
        return blobCanvas;
    }

    private _drawBlobsOnCanvasBase(
        width: number,
        height: number,
        points: Point[],
        params: any
    ): HTMLCanvasElement {
        const blobCanvas = document.createElement('canvas');
        blobCanvas.width = width;
        blobCanvas.height = height;
        const blobGl = blobCanvas.getContext('webgl2', { alpha: true, antialias: true });
        if (!blobGl) {
            // fallback 2D
            const ctx2d = blobCanvas.getContext('2d')!;
            ctx2d.clearRect(0, 0, width, height);
            const radius = params.blobRadius ?? 5;
            const color = SuperTransformer.hslaToRgba(params.blobColor ?? 'hsla(0,0%,100%,1)');
            const opacity = params.blobOpacity ?? 1;
            ctx2d.fillStyle = `rgba(${color[0]*255},${color[1]*255},${color[2]*255},${color[3]*opacity})`;
            for (const p of points) {
                ctx2d.beginPath();
                ctx2d.arc(p.x, p.y, radius, 0, 2 * Math.PI);
                ctx2d.fill();
            }
            return blobCanvas;
        }

        if (!this.blobProgram) {
            this.blobProgram = this._createProgram(this._blobVertexShader(), this._blobFragmentShader());
        }

        blobGl.viewport(0, 0, width, height);
        blobGl.useProgram(this.blobProgram);

        const vao = blobGl.createVertexArray();
        blobGl.bindVertexArray(vao);

        const centers = new Float32Array(points.length * 2);
        for (let i = 0; i < points.length; i++) {
            centers[i * 2] = (points[i].x / (width - 1)) * 2 - 1;
            centers[i * 2 + 1] = (points[i].y / (height - 1)) * 2 - 1;
        }

        const centerBuffer = blobGl.createBuffer();
        blobGl.bindBuffer(blobGl.ARRAY_BUFFER, centerBuffer);
        blobGl.bufferData(blobGl.ARRAY_BUFFER, centers, blobGl.STATIC_DRAW);
        blobGl.enableVertexAttribArray(0);
        blobGl.vertexAttribPointer(0, 2, blobGl.FLOAT, false, 0, 0);
        blobGl.vertexAttribDivisor(0, 1);

        const radius = params.blobRadius ?? 5;
        const color = SuperTransformer.hslaToRgba(params.blobColor ?? 'hsla(0,0%,100%,1)');
        const opacity = params.blobOpacity ?? 1;

        blobGl.uniform1f(blobGl.getUniformLocation(this.blobProgram, "uRadius"), radius);
        blobGl.uniform2f(blobGl.getUniformLocation(this.blobProgram, "uResolution"), width, height);
        blobGl.uniform4f(blobGl.getUniformLocation(this.blobProgram, "uColor"), color[0], color[1], color[2], color[3] * opacity);

        blobGl.clearColor(0, 0, 0, 0);
        blobGl.clear(blobGl.COLOR_BUFFER_BIT);
        blobGl.drawArraysInstanced(blobGl.TRIANGLE_STRIP, 0, 4, points.length);

        blobGl.bindVertexArray(null);
        return blobCanvas;
    }

    // ========== Применение эффекта к canvas ==========
    private _applyEffect(canvas: HTMLCanvasElement, effect: EffectParams): HTMLCanvasElement {
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext('2d')!;
        ctx.drawImage(canvas, 0, 0);

        if (effect.type === 'blur') {
            ctx.filter = `blur(${effect.intensity ?? 2}px)`;
            ctx.drawImage(canvas, 0, 0);
            ctx.filter = 'none';
        } else if (effect.type === 'glow') {
            const color = effect.color ? SuperTransformer.hslaToRgba(effect.color) : [1,1,0,1];
            ctx.fillStyle = `rgba(${color[0]*255},${color[1]*255},${color[2]*255},${color[3]})`;
            ctx.filter = `blur(${effect.intensity ?? 4}px)`;
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'screen';
            ctx.drawImage(canvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }
        return out;
    }

    // ========== Методы для работы с контурами ==========

    private _getBinaryMask(ctx: CanvasRenderingContext2D, width: number, height: number, threshold = 128): boolean[][] {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const mask: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = data[(y * width + x) * 4 + 3];
                mask[y][x] = alpha > threshold;
            }
        }
        return mask;
    }

    private _findAllContours(mask: boolean[][]): Point[][] {
        const height = mask.length;
        const width = mask[0].length;
        const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
        const contours: Point[][] = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mask[y][x] && !visited[y][x]) {
                    const start = { x, y };
                    const contour = this._traceBoundary(mask, start, visited);
                    if (contour.length > 0) contours.push(contour);
                }
            }
        }
        return contours;
    }

    private _traceBoundary(mask: boolean[][], start: Point, visited: boolean[][]): Point[] {
        const height = mask.length;
        const width = mask[0].length;
        const directions = [
            { dx: 1, dy: 0 }, { dx: 1, dy: -1 }, { dx: 0, dy: -1 }, { dx: -1, dy: -1 },
            { dx: -1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }
        ];

        const contour: Point[] = [];
        let current = { ...start };
        let prevDir = 0;

        do {
            contour.push({ ...current });
            visited[current.y][current.x] = true;

            let found = false;
            for (let i = 0; i < 8; i++) {
                const nextDir = (prevDir + 5 + i) % 8;
                const nx = current.x + directions[nextDir].dx;
                const ny = current.y + directions[nextDir].dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny][nx]) {
                    current = { x: nx, y: ny };
                    prevDir = nextDir;
                    found = true;
                    break;
                }
            }
            if (!found) break;
        } while (current.x !== start.x || current.y !== start.y);

        return contour;
    }

    // ========== Упрощение и сглаживание ==========

    private _distancePointSegment(p: Point, a: Point, b: Point): number {
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const ap = { x: p.x - a.x, y: p.y - a.y };
        const abLenSq = ab.x * ab.x + ab.y * ab.y;
        if (abLenSq === 0) return Math.hypot(ap.x, ap.y);
        const t = (ap.x * ab.x + ap.y * ab.y) / abLenSq;
        const tClamped = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + ab.x * tClamped, y: a.y + ab.y * tClamped };
        return Math.hypot(p.x - proj.x, p.y - proj.y);
    }

    private _douglasPeucker(points: Point[], epsilon: number): Point[] {
        if (points.length <= 2) return points.slice();
        let maxDist = 0;
        let index = 0;
        const start = points[0];
        const end = points[points.length - 1];
        for (let i = 1; i < points.length - 1; i++) {
            const dist = this._distancePointSegment(points[i], start, end);
            if (dist > maxDist) {
                maxDist = dist;
                index = i;
            }
        }
        if (maxDist > epsilon) {
            const left = this._douglasPeucker(points.slice(0, index + 1), epsilon);
            const right = this._douglasPeucker(points.slice(index), epsilon);
            return left.slice(0, -1).concat(right);
        } else {
            return [start, end];
        }
    }

    private _chaikin(points: Point[], closed = true): Point[] {
        if (points.length < 3) return points;
        const newPoints: Point[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            newPoints.push(
                { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y },
                { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y }
            );
        }
        if (closed) {
            const pLast = points[points.length - 1];
            const pFirst = points[0];
            newPoints.push(
                { x: 0.75 * pLast.x + 0.25 * pFirst.x, y: 0.75 * pLast.y + 0.25 * pFirst.y },
                { x: 0.25 * pLast.x + 0.75 * pFirst.x, y: 0.25 * pLast.y + 0.75 * pFirst.y }
            );
        }
        return newPoints;
    }

    private _chaikinFloat32(points: Float32Array, closed = true): Float32Array {
        const n = points.length / 2;
        if (n < 3) return points;
        const result: number[] = [];
        for (let i = 0; i < n - 1; i++) {
            const x0 = points[i * 2];
            const y0 = points[i * 2 + 1];
            const x1 = points[(i + 1) * 2];
            const y1 = points[(i + 1) * 2 + 1];
            result.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1);
            result.push(0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
        }
        if (closed) {
            const x0 = points[(n - 1) * 2];
            const y0 = points[(n - 1) * 2 + 1];
            const x1 = points[0];
            const y1 = points[1];
            result.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1);
            result.push(0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
        }
        return new Float32Array(result);
    }

    private _interpolateCurve(points: Point[], step: number, closed = true): Point[] {
        if (points.length < 2) return points;
        const lengths: number[] = [0];
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
        }
        let totalLength = lengths[lengths.length - 1];
        if (closed) {
            const dx = points[0].x - points[points.length - 1].x;
            const dy = points[0].y - points[points.length - 1].y;
            totalLength += Math.hypot(dx, dy);
        }

        const result: Point[] = [];
        for (let d = 0; d < totalLength; d += step) {
            let seg = 0;
            while (seg < points.length - 1 && lengths[seg + 1] < d) seg++;
            const t = (d - lengths[seg]) / (lengths[seg + 1] - lengths[seg]);
            const p1 = points[seg];
            const p2 = points[seg + 1];
            result.push({ x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
        }
        return result;
    }

    // ========== Извлечение контуров из canvas ==========
    public extractContoursFromCanvas(canvas: HTMLCanvasElement, threshold = 128): Point[][] {
        const ctx = canvas.getContext('2d');
        if (!ctx) return [];
        const { width, height } = canvas;
        const mask = this._getBinaryMask(ctx, width, height, threshold);
        return this._findAllContours(mask);
    }

    // ========== Управление кэшем ==========
    public clearCache(): void {
        this.renderCache.clear();
    }

    private _pruneCache(): void {
        if (this.renderCache.size > this.maxCacheSize) {
            const keys = Array.from(this.renderCache.keys());
            for (let i = 0; i < keys.length - this.maxCacheSize; i++) {
                this.renderCache.delete(keys[i]);
            }
        }
    }

    // ========== Рендеринг линий сетки и чисел ==========
    private _renderGridLines(params: { cols: number; rows: number; color: string; width: number }, w: number, h: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.strokeStyle = params.color;
        ctx.lineWidth = params.width;
        const cellW = w / params.cols;
        const cellH = h / params.rows;
        ctx.beginPath();
        for (let i = 1; i < params.cols; i++) {
            const x = i * cellW;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let i = 1; i < params.rows; i++) {
            const y = i * cellH;
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
        return canvas;
    }

    private _renderCellNumbers(params: { font?: string; color?: string; startIndex?: number }, w: number, h: number, cols?: number, rows?: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        if (!cols || !rows) return canvas;
        const cellW = w / cols;
        const cellH = h / rows;
        ctx.font = params.font || '12px Arial';
        ctx.fillStyle = params.color || '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const start = params.startIndex ?? 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const num = start + row * cols + col;
                const x = col * cellW + cellW / 2;
                const y = row * cellH + cellH / 2;
                ctx.fillText(num.toString(), x, y);
            }
        }
        return canvas;
    }

    // ========== Полная композиция сцены (10 слоёв) ==========
    public renderFullScene(
        grid: GridParams,
        layers: LayerSymbol[],
        width: number,
        height: number,
        useCache: boolean = true
    ): HTMLCanvasElement {
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = width;
        resultCanvas.height = height;
        const ctx = resultCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, width, height);

        const getGridKey = (suffix: string) => `grid_${suffix}_${width}x${height}_` + JSON.stringify(grid, (k, v) => {
            if (k === 'image' && v instanceof HTMLImageElement) return v.src;
            return v;
        });
        const getLayerKey = (layer: LayerSymbol, idx: number, suffix: string) =>
            `layer_${idx}_${suffix}_${width}x${height}_` + JSON.stringify(layer, (k, v) => {
                if (k === 'image' && v instanceof HTMLImageElement) return v.src;
                return v;
            });

        // ===== Группа 1: Grid =====
        // 1. Grid background
        const bgGridKey = getGridKey('bg');
        let bgGridCanvas = useCache ? this.renderCache.get(bgGridKey) : undefined;
        if (!bgGridCanvas) {
            bgGridCanvas = this.renderShapeFixed(grid.shape, grid.warp, width, height);
            if (useCache) {
                this.renderCache.set(bgGridKey, bgGridCanvas);
                this._pruneCache();
            }
        }
        ctx.drawImage(bgGridCanvas, 0, 0);

        // 2. Grid border
        if (grid.border) {
            const gridBorderKey = getGridKey('border');
            let borderGridCanvas = useCache ? this.renderCache.get(gridBorderKey) : undefined;
            if (!borderGridCanvas) {
                const gridContours = this.extractContoursFromCanvas(bgGridCanvas, 1);
                borderGridCanvas = this.renderVectorBorder(gridContours, grid.border, width, height);
                if (useCache) {
                    this.renderCache.set(gridBorderKey, borderGridCanvas);
                    this._pruneCache();
                }
            }
            ctx.drawImage(borderGridCanvas, 0, 0);
        }

        // 3. Grid lines
        if (grid.lines) {
            const linesKey = getGridKey('lines');
            let linesCanvas = useCache ? this.renderCache.get(linesKey) : undefined;
            if (!linesCanvas) {
                linesCanvas = this._renderGridLines(grid.lines, width, height);
                if (grid.lines.effect) {
                    linesCanvas = this._applyEffect(linesCanvas, grid.lines.effect);
                }
                if (useCache) {
                    this.renderCache.set(linesKey, linesCanvas);
                    this._pruneCache();
                }
            }
            ctx.drawImage(linesCanvas, 0, 0);
        }

        // 4. Grid cell numbers
        if (grid.numbers) {
            const numbersKey = getGridKey('numbers');
            let numbersCanvas = useCache ? this.renderCache.get(numbersKey) : undefined;
            if (!numbersCanvas) {
                numbersCanvas = this._renderCellNumbers(grid.numbers, width, height, grid.lines?.cols, grid.lines?.rows);
                if (grid.numbers.effect) {
                    numbersCanvas = this._applyEffect(numbersCanvas, grid.numbers.effect);
                }
                if (useCache) {
                    this.renderCache.set(numbersKey, numbersCanvas);
                    this._pruneCache();
                }
            }
            ctx.drawImage(numbersCanvas, 0, 0);
        }

        // ===== Группы 2 и 3: Layer и Symbol =====
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];

            // --- Layer background (5) ---
            const layerBgKey = getLayerKey(layer, i, 'layerBg');
            let lBgCanvas = useCache ? this.renderCache.get(layerBgKey) : undefined;
            if (!lBgCanvas) {
                lBgCanvas = this.renderShapeFixed(layer.shape, layer.warp, width, height);
                if (useCache) {
                    this.renderCache.set(layerBgKey, lBgCanvas);
                    this._pruneCache();
                }
            }
            ctx.drawImage(lBgCanvas, 0, 0);

            // --- Layer border (6) ---
            if (layer.border) {
                const layerBorderKey = getLayerKey(layer, i, 'layerBorder');
                let borderLayerCanvas = useCache ? this.renderCache.get(layerBorderKey) : undefined;
                if (!borderLayerCanvas) {
                    const lContours = this.extractContoursFromCanvas(lBgCanvas, 1);
                    borderLayerCanvas = this.renderVectorBorder(lContours, layer.border, width, height);
                    if (useCache) {
                        this.renderCache.set(layerBorderKey, borderLayerCanvas);
                        this._pruneCache();
                    }
                }
                ctx.drawImage(borderLayerCanvas, 0, 0);
            }

            // --- Symbol face (7) ---
            if (layer.symbol) {
                const symFaceKey = getLayerKey(layer, i, 'symFace');
                let symCanvas = useCache ? this.renderCache.get(symFaceKey) : undefined;
                if (!symCanvas) {
                    symCanvas = this.renderShapeFixed(layer.symbol.shape, layer.warp, width, height);
                    if (useCache) {
                        this.renderCache.set(symFaceKey, symCanvas);
                        this._pruneCache();
                    }
                }
                ctx.drawImage(symCanvas, 0, 0);

                // --- Symbol border (8) ---
                if (layer.symbol.border) {
                    const symBorderKey = getLayerKey(layer, i, 'symBorder');
                    let borderSymCanvas = useCache ? this.renderCache.get(symBorderKey) : undefined;
                    if (!borderSymCanvas) {
                        const sContours = this.extractContoursFromCanvas(symCanvas, 128);
                        borderSymCanvas = this.renderVectorBorder(sContours, layer.symbol.border, width, height);
                        if (useCache) {
                            this.renderCache.set(symBorderKey, borderSymCanvas);
                            this._pruneCache();
                        }
                    }
                    ctx.drawImage(borderSymCanvas, 0, 0);
                }

                // --- Special effect (9) ---
                if (layer.symbol.effect) {
                    const effectKey = getLayerKey(layer, i, 'effect');
                    let effectCanvas = useCache ? this.renderCache.get(effectKey) : undefined;
                    if (!effectCanvas) {
                        effectCanvas = this._applyEffect(symCanvas, layer.symbol.effect);
                        if (useCache) {
                            this.renderCache.set(effectKey, effectCanvas);
                            this._pruneCache();
                        }
                    }
                    ctx.drawImage(effectCanvas, 0, 0);
                }

                // --- Inverted alpha mask (10) ---
                if (layer.invertedMask) {
                    const invertedKey = getLayerKey(layer, i, 'inverted');
                    let invertedCanvas = useCache ? this.renderCache.get(invertedKey) : undefined;
                    if (!invertedCanvas) {
                        // Пока заглушка – пустой canvas
                        invertedCanvas = this._createEmptyCanvas(width, height);
                        if (useCache) {
                            this.renderCache.set(invertedKey, invertedCanvas);
                            this._pruneCache();
                        }
                    }
                    ctx.drawImage(invertedCanvas, 0, 0);
                }
            }
        }

        return resultCanvas;
    }

    // ========== Инстансинг (плеер) ==========

    public updateInstances(groups: InstancedGroup[]): void {
        const gl = this.gl;
        let totalInstances = 0;
        groups.forEach(g => totalInstances += g.instances.length);

        const data = new Float32Array(totalInstances * 8);
        let offset = 0;
        for (const group of groups) {
            for (const inst of group.instances) {
                const t = inst.transforms;
                data[offset] = t.skew?.force || 0;          // st
                data[offset+1] = t.perspective?.force || 0; // sp
                data[offset+2] = t.margin || 0;             // m
                data[offset+3] = t.rotateFinal || 0;        // r
                data[offset+4] = (t.flip?.x ? 1 : 0);       // f (упрощённо)
                data[offset+5] = t.warp?.force || 0;        // w
                data[offset+6] = inst.color[0];              // colorR
                data[offset+7] = inst.color[1];              // colorG
                offset += 8;
            }
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

        gl.bindVertexArray(this.quadVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
        gl.vertexAttribDivisor(2, 1);

        gl.bindVertexArray(null);
    }

    public renderInstanced(groups: InstancedGroup[]): HTMLCanvasElement {
        const gl = this.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.instancedProgram);
        gl.bindVertexArray(this.quadVAO);

        let totalInstances = 0;
        groups.forEach(g => totalInstances += g.instances.length);
        if (totalInstances > 0) {
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, totalInstances);
        }

        return this.canvas;
    }

    // ========== Старые методы для обратной совместимости ==========
    public render(
        img: HTMLImageElement | HTMLCanvasElement,
        params: any,
        patch?: any,
        fullSize?: any,
        dpr?: number
    ): HTMLCanvasElement {
        console.warn('render() is deprecated. Use renderFullScene().');
        return this._createEmptyCanvas(1, 1);
    }

    public renderWithBlobs(
        img: any,
        params: any,
        patch?: any,
        fullSize?: any,
        dpr?: number
    ): HTMLCanvasElement {
        console.warn('renderWithBlobs() is deprecated. Use renderFullScene().');
        return this._createEmptyCanvas(1, 1);
    }

    public renderWithBlobsSmoothed(
        img: any,
        params: any,
        patch?: any,
        fullSize?: any,
        dpr?: number
    ): HTMLCanvasElement {
        console.warn('renderWithBlobsSmoothed() is deprecated. Use renderFullScene().');
        return this._createEmptyCanvas(1, 1);
    }
}