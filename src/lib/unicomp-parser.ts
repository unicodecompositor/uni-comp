/**
 * UniComp Secure Parser v4.1
 *
 * Security features:
 * - DoS protection (input length, symbol count, timeout limits)
 * - Deterministic parsing without regex where possible
 * - Strict validation of all inputs
 * - Proper escaping and quoting
 * - Multi-line file parsing with comments support
 */

// ============================================================================
// SECURITY LIMITS
// ============================================================================

export const SECURITY_LIMITS = {
  MAX_INPUT_LENGTH: 10000,
  MAX_SYMBOLS: 1000,
  MAX_PARAMS_PER_SYMBOL: 20,
  MIN_GRID_SIZE: 2,
  MAX_GRID_SIZE: 100,
  TIMEOUT_MS: 100,
  MAX_LINES: 500,
} as const;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// Delta operator for incremental transformations
export type DeltaOp = '=' | '+=' | '-=';

export interface DeltaAngleForce {
  op: DeltaOp;
  angle: number;
  force: number;
}

export interface DeltaNumber {
  op: DeltaOp;
  value: number;
}

export interface DeltaScale {
  op: DeltaOp;
  x: number;
  y: number;
  // For offset (move): store grid expansion info for proper undo
  expandLeft?: number;
  expandTop?: number;
}

/** Move Expand: grid expansion caused by move beyond grid boundary */
export interface MoveExpand {
  el: number; // expand left (columns added)
  et: number; // expand top (rows added)
}

/** Scale Expand: grid expansion caused by scale beyond grid boundary */
export interface ScaleExpand {
  sl: number; // scale expand left
  st: number; // scale expand top
}

export interface DeltaColor {
  op: DeltaOp;
  /** c= symbol foreground color */
  color?: string;
  /** b= symbol border: width, color, opacity */
  symbolBorderWidth?: number;
  symbolBorderColor?: string;
  symbolBorderOpacity?: number;
  /** bc= layer background: color, opacity, radius */
  layerBackground?: string;
  layerBackgroundOpacity?: number;
  layerBorderRadius?: string; // "50%" or "10px"
  /** bb= layer border: width, color, opacity */
  layerBorderWidth?: number;
  layerBorderColor?: string;
  layerBorderOpacity?: number;
  opacity?: number;
  // Legacy compat aliases (mapped on parse)
  background?: string;
  backgroundOpacity?: number;
  borderRadius?: string;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export interface HistoryStep {
  index: number;
  st?: DeltaAngleForce;
  sp?: DeltaAngleForce;
  rotate?: DeltaNumber;
  scale?: DeltaScale;
  offset?: DeltaScale;
  d?: DeltaScale; // bounds dimensions (w, h) in grid cells
  me?: MoveExpand;  // move expand: grid expansion from move
  se?: ScaleExpand; // scale expand: grid expansion from scale
  opacity?: DeltaNumber;
  colorGroup?: DeltaColor; // All color params: c, b, bc, bb
}

export interface KeyframeStep extends HistoryStep {
  duration: number;
}

export interface SymbolSpec {
  char: string;
  start: number;
  end: number;
  opacity?: number;
  /** c= Symbol foreground color */
  color?: string;
  /** bc= Layer background fill color */
  background?: string;
  /** bc= Layer background opacity (0..1) */
  backgroundOpacity?: number;
  /** bc= Layer border radius: "50%" or "10px" */
  borderRadius?: string;
  rotate?: number;
  flip?: 'h' | 'v' | 'hv';
  fontFamily?: string;
  id?: string;
  className?: string;
  name?: string;
  scale?: { x: number; y: number };
  /** Offset / move [dx, dy] relative to origin */
  offset?: { x: number; y: number };
  /** Bounds dimensions [w, h] in grid cells (from d= history) */
  bounds?: { w: number; h: number };
  /** Parallelogram deformation: angle (degrees) + force (intensity) */
  sp?: { angle: number; force: number };
  /** Trapezoid deformation: angle (degrees) + force (intensity) */
  st?: { angle: number; force: number };
  margin?: { top: number; right: number; bottom: number; left: number };
  position?: { top: number; right: number; bottom: number; left: number };
  transition?: number;
  /** Reference to another block by ID (#id syntax) */
  refId?: string;
  /** Reference to another block by name (@name syntax) */
  refName?: string;
  /** Reference to a class definition (.class syntax) */
  refClass?: string;
  /** Accumulated transformation history (h= blocks) */
  history?: HistoryStep[];
  /** Animation keyframes (k= blocks with t= timing) */
  keyframes?: KeyframeStep[];
  /** b= Symbol border width in grid cell fractions (0..1) */
  strokeWidth?: number;
  /** b= Symbol border color (CSS color string) */
  strokeColor?: string;
  /** b= Symbol border opacity (0..1) */
  strokeOpacity?: number;
  /** bb= Layer border width */
  layerBorderWidth?: number;
  /** bb= Layer border color */
  layerBorderColor?: string;
  /** bb= Layer border opacity (0..1) */
  layerBorderOpacity?: number;
}

export interface GridDimensions {
  width: number;
  height: number;
}

export interface UniCompSpec {
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  symbols: SymbolSpec[];
  raw: string;
  encoding?: string;
  name?: string;
  id?: string;
  className?: string;
  /** gc= Grid background color */
  background?: string;
  /** gc= Grid background opacity */
  backgroundOpacity?: number;
  /** gc= Grid border radius */
  borderRadius?: string;
  /** gb= Grid border color */
  strokeColor?: string;
  /** gb= Grid border width */
  strokeWidth?: number;
  /** gb= Grid border opacity */
  strokeOpacity?: number;
  /** Grid-level opacity */
  opacity?: number;
}

export interface ParseError {
  message: string;
  position?: number;
  line?: number;
  column?: number;
  context?: string;
}

export type ParseResult =
  | { success: true; spec: UniCompSpec }
  | { success: false; error: ParseError };

export interface MultiLineParseResult {
  blocks: ParsedBlock[];
  totalLines: number;
  validCount: number;
  errorCount: number;
  errorLines: ErrorLine[];
}

export interface ParsedBlock {
  lineNumber: number;
  raw: string;
  result: ParseResult;
  name?: string;
}

export interface ErrorLine {
  lineNumber: number;
  column?: number;
  message: string;
  raw: string;
}

// ============================================================================
// SECURITY HELPERS
// ============================================================================

function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isWhitespace(char: string): boolean {
  const code = char.charCodeAt(0);
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isIdentifierChar(char: string): boolean {
  return isLetter(char) || char === '_' || isDigit(char);
}

function isIdentifierStartChar(char: string): boolean {
  return isLetter(char) || char === '_';
}

const SPECIAL_CHARS = new Set([
  '(', ')', '[', ']', '{', '}',
  ':', ';', ',', '-', '=',
  '"', "'", '`', '\\',
  '<', '>', '^', '№',
  '!', '?', '*', '×', '÷',
  '+', '_', '~', '/', '|',
  '&', '%', '$', ' '
]);

function needsQuoting(char: string): boolean {
  return isDigit(char) || SPECIAL_CHARS.has(char);
}

// ============================================================================
// TOKEN TYPES & TOKENIZER
// ============================================================================

enum TokenType {
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COLON = 'COLON',
  SEMICOLON = 'SEMICOLON',
  COMMA = 'COMMA',
  DASH = 'DASH',
  PLUS = 'PLUS',
  EQUALS = 'EQUALS',
  NUMBER = 'NUMBER',
  SYMBOL = 'SYMBOL',
  QUOTED_STRING = 'QUOTED_STRING',
  IDENTIFIER = 'IDENTIFIER',
  TIMES = 'TIMES',
  HASH_REF = 'HASH_REF',
  AT_REF = 'AT_REF',
  DOT_REF = 'DOT_REF',
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}

interface Token {
  type: TokenType;
  value: string;
  position: number;
  line: number;
  column: number;
}

class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

class Tokenizer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private startTime: number;
  private inGridSpec: boolean = false;

  constructor(input: string) {
    if (input.length > SECURITY_LIMITS.MAX_INPUT_LENGTH) {
      throw new SecurityError(`Input too long: ${input.length} chars (max: ${SECURITY_LIMITS.MAX_INPUT_LENGTH})`);
    }
    this.input = input;
    this.startTime = Date.now();
  }

  private checkTimeout(): void {
    if (Date.now() - this.startTime > SECURITY_LIMITS.TIMEOUT_MS) {
      throw new SecurityError('Parsing timeout exceeded');
    }
  }

  private currentChar(): string | null {
    return this.position < this.input.length ? this.input[this.position] : null;
  }

  private advance(): void {
    if (this.position < this.input.length) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
  }

  private skipWhitespace(): void {
    while (this.currentChar() && isWhitespace(this.currentChar()!)) {
      this.advance();
    }
  }

  private readNumber(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    while (this.currentChar() && isDigit(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    if (this.currentChar() === '.') {
      value += this.currentChar();
      this.advance();
      while (this.currentChar() && isDigit(this.currentChar()!)) {
        value += this.currentChar();
        this.advance();
      }
    }

    return { type: TokenType.NUMBER, value, position: startPos, line: startLine, column: startCol };
  }

  private readQuotedString(quoteChar: string): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    this.advance();

    while (this.currentChar() && this.currentChar() !== quoteChar) {
      if (this.currentChar() === '\\') {
        this.advance();
        const escaped = this.currentChar();
        if (escaped) {
          switch (escaped) {
            case 'n': value += '\n'; break;
            case 't': value += '\t'; break;
            case 'r': value += '\r'; break;
            default: value += escaped;
          }
          this.advance();
        }
      } else {
        value += this.currentChar();
        this.advance();
      }
    }

    if (this.currentChar() === quoteChar) {
      this.advance();
    } else {
      throw new Error(`Unclosed quote starting at line ${startLine}, column ${startCol}`);
    }

    return { type: TokenType.QUOTED_STRING, value, position: startPos, line: startLine, column: startCol };
  }

  private readIdentifier(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    // First char must be letter or underscore
    if (this.currentChar() && isIdentifierStartChar(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    while (this.currentChar() && isIdentifierChar(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    return { type: TokenType.IDENTIFIER, value, position: startPos, line: startLine, column: startCol };
  }

  private readRefToken(prefix: string, tokenType: TokenType): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip # or @ or .
    let value = '';
    while (this.currentChar() && isIdentifierChar(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }
    if (value.length === 0) {
      throw new Error(`Expected identifier after '${prefix}' at line ${startLine}, column ${startCol}`);
    }
    return { type: tokenType, value, position: startPos, line: startLine, column: startCol };
  }

  private readSymbol(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;

    if (this.currentChar() === '\\') {
      this.advance();
      const escaped = this.currentChar();
      if (escaped) {
        this.advance();
        return { type: TokenType.SYMBOL, value: escaped, position: startPos, line: startLine, column: startCol };
      }
      throw new Error(`Invalid escape at end of input`);
    }

    const char = this.currentChar();
    if (char) {
      const code = char.charCodeAt(0);
      if (code >= 0xD800 && code <= 0xDBFF) {
        this.advance();
        const low = this.currentChar();
        if (low) {
          this.advance();
          return { type: TokenType.SYMBOL, value: char + low, position: startPos, line: startLine, column: startCol };
        }
      }

      this.advance();
      return { type: TokenType.SYMBOL, value: char, position: startPos, line: startLine, column: startCol };
    }

    throw new Error(`Unexpected character at position ${startPos}`);
  }

  tokenize(): Token[] {
    this.tokens = [];
    this.inGridSpec = false;

    while (this.position < this.input.length) {
      this.checkTimeout();
      this.skipWhitespace();

      if (this.position >= this.input.length) break;

      const char = this.currentChar()!;

      switch (char) {
        case '(':
          this.inGridSpec = true;
          this.tokens.push({ type: TokenType.LPAREN, value: '(', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case ')':
          this.inGridSpec = false;
          this.tokens.push({ type: TokenType.RPAREN, value: ')', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case '[':
          this.tokens.push({ type: TokenType.LBRACKET, value: '[', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case ']':
          this.tokens.push({ type: TokenType.RBRACKET, value: ']', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case ':':
          this.tokens.push({ type: TokenType.COLON, value: ':', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case ';':
          this.tokens.push({ type: TokenType.SEMICOLON, value: ';', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case ',':
          this.tokens.push({ type: TokenType.COMMA, value: ',', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case '-':
          this.tokens.push({ type: TokenType.DASH, value: '-', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case '+':
          this.tokens.push({ type: TokenType.PLUS, value: '+', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case '×':
          this.tokens.push({ type: TokenType.TIMES, value: char, position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case 'x':
        case 'X':
          if (this.inGridSpec) {
            this.tokens.push({ type: TokenType.TIMES, value: char, position: this.position, line: this.line, column: this.column });
            this.advance();
          } else {
            this.tokens.push(this.readIdentifier());
          }
          break;
        case '=':
          this.tokens.push({ type: TokenType.EQUALS, value: '=', position: this.position, line: this.line, column: this.column });
          this.advance();
          break;
        case '"':
        case "'":
        case '`':
          this.tokens.push(this.readQuotedString(char));
          break;
        case '#': {
          // Check if followed by identifier (reference) or just a symbol
          const nextPos = this.position + 1;
          if (nextPos < this.input.length && isIdentifierStartChar(this.input[nextPos])) {
            this.tokens.push(this.readRefToken('#', TokenType.HASH_REF));
          } else {
            this.tokens.push({ type: TokenType.UNKNOWN, value: char, position: this.position, line: this.line, column: this.column });
            this.advance();
          }
          break;
        }
        case '@': {
          const nextPos = this.position + 1;
          if (nextPos < this.input.length && isIdentifierStartChar(this.input[nextPos])) {
            this.tokens.push(this.readRefToken('@', TokenType.AT_REF));
          } else {
            this.tokens.push({ type: TokenType.UNKNOWN, value: char, position: this.position, line: this.line, column: this.column });
            this.advance();
          }
          break;
        }
        case '.': {
          // Only treat as DOT_REF if not inside grid spec and followed by identifier
          const nextPos2 = this.position + 1;
          if (!this.inGridSpec && nextPos2 < this.input.length && isIdentifierStartChar(this.input[nextPos2])) {
            this.tokens.push(this.readRefToken('.', TokenType.DOT_REF));
          } else {
            // Could be decimal point in number — handled by readNumber
            this.tokens.push({ type: TokenType.UNKNOWN, value: char, position: this.position, line: this.line, column: this.column });
            this.advance();
          }
          break;
        }
        default:
          if (isDigit(char)) {
            this.tokens.push(this.readNumber());
          } else if (isIdentifierStartChar(char)) {
            this.tokens.push(this.readIdentifier());
          } else {
            // Check if it's a special character we should tokenized separately or as a symbol
            if (SPECIAL_CHARS.has(char)) {
                this.tokens.push({ type: TokenType.UNKNOWN, value: char, position: this.position, line: this.line, column: this.column });
                this.advance();
            } else {
                this.tokens.push(this.readSymbol());
            }
          }
      }
    }

    this.tokens.push({ type: TokenType.EOF, value: '', position: this.position, line: this.line, column: this.column });
    return this.tokens;
  }
}

// ============================================================================
// COLOR VALIDATION
// ============================================================================

const VALID_COLORS = new Set([
  'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'cyan',
  'magenta', 'lime', 'teal', 'indigo', 'violet', 'brown', 'gray', 'grey',
  'black', 'white', 'gold', 'silver', 'coral', 'salmon', 'crimson',
  'navy', 'olive', 'maroon', 'aqua', 'fuchsia', 'tomato', 'plum'
]);

function isValidColor(value: string): boolean {
  if (VALID_COLORS.has(value.toLowerCase())) return true;
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length !== 3 && hex.length !== 6 && hex.length !== 8) return false;
    for (let i = 0; i < hex.length; i++) {
      const code = hex.charCodeAt(i);
      const isHexDigit = isDigit(hex[i]) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
      if (!isHexDigit) return false;
    }
    return true;
  }
  // Support hsl(...) and hsla(...) formats
  if (/^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+)?\s*\)$/.test(value)) return true;
  // Support rgb(...) and rgba(...) formats
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+)?\s*\)$/.test(value)) return true;
  // Support raw HSL: "H, S%, L%" (e.g. "161, 80%, 50%")
  if (/^\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*$/.test(value)) return true;
  return false;
}

/** Parse raw HSL "H, S%, L%" to hsl() string, or return value as-is */
function normalizeColor(value: string): string {
  const m = value.match(/^\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*$/);
  if (m) return `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)`;
  return value;
}

// ============================================================================
// BOX VALUE PARSER (for margin / position)
// ============================================================================

function parseBoxValue(value: string): { top: number; right: number; bottom: number; left: number } {
  const dirMap: Record<string, string> = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
  const result = { top: 0, right: 0, bottom: 0, left: 0 };

  const dirParts = value.split(/\s+/);
  let usedDir = false;
  for (const part of dirParts) {
    const match = part.match(/^(-?\d*\.?\d+)(t|r|b|l)$/i);
    if (match) {
      const val = parseFloat(match[1]);
      const dir = match[2].toLowerCase();
      (result as any)[dirMap[dir]] = val;
      usedDir = true;
    }
  }

  if (!usedDir) {
    const nums = value.split(/\s+/).map(v => parseFloat(v)).filter(n => !isNaN(n));
    if (nums.length === 1) {
      result.top = result.right = result.bottom = result.left = nums[0];
    } else if (nums.length === 2) {
      result.top = result.bottom = nums[0];
      result.left = result.right = nums[1];
    } else if (nums.length === 3) {
      result.top = nums[0];
      result.left = result.right = nums[1];
      result.bottom = nums[2];
    } else if (nums.length >= 4) {
      result.top = nums[0];
      result.right = nums[1];
      result.bottom = nums[2];
      result.left = nums[3];
    }
  }

  return result;
}

function parseAngleForce(value: string, key: 'sp' | 'st'): { angle: number; force: number } {
  const normalized = value
    .replace(/[–—]/g, '-')
    .replace(/,/g, ' ')
    .replace(/[°]/g, ' ')
    .trim();

  const values = normalized.match(/-?\d*\.?\d+/g)?.map(v => parseFloat(v)) ?? [];
  if (values.length < 2 || values.some(Number.isNaN)) {
    throw new Error(`Invalid ${key}: "${value}" (expected "angle force")`);
  }

  return {
    angle: values[0],
    force: Math.abs(values[1]),
  };
}

function parseAngleForceDelta(value: string): { angle: number; force: number } {
  const normalized = value
    .replace(/[–—]/g, '-')
    .replace(/,/g, ' ')
    .replace(/[°]/g, ' ')
    .trim();

  const values = normalized.match(/[+-]?\d*\.?\d+/g)?.map(v => parseFloat(v)) ?? [];
  if (values.length < 2 || values.some(Number.isNaN)) {
    throw new Error(`Invalid delta value: "${value}" (expected "angle,force")`);
  }

  return { angle: values[0], force: values[1] };
}

// ============================================================================
// PARSER ENGINE
// ============================================================================

class Parser {
  private tokens: Token[];
  private position: number = 0;
  private symbolCount: number = 0;
  private startTime: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.startTime = Date.now();
  }

  private checkTimeout(): void {
    if (Date.now() - this.startTime > SECURITY_LIMITS.TIMEOUT_MS) {
      throw new SecurityError('Parsing timeout exceeded');
    }
  }

  private checkSymbolLimit(): void {
    if (this.symbolCount > SECURITY_LIMITS.MAX_SYMBOLS) {
      throw new SecurityError(`Too many symbols: max ${SECURITY_LIMITS.MAX_SYMBOLS}`);
    }
  }

  private currentToken(): Token {
    return this.tokens[this.position];
  }

  private advance(): void {
    if (this.position < this.tokens.length - 1) {
      this.position++;
    }
  }

  private expect(type: TokenType): Token {
    const token = this.currentToken();
    if (token.type !== type) {
      throw new Error(
        `Expected ${type} but got ${token.type} "${token.value}" at line ${token.line}, column ${token.column}`
      );
    }
    const result = token;
    this.advance();
    return result;
  }

  private parseGridSpec(): GridDimensions {
    let width: number;
    let height: number;

    if (this.currentToken().type === TokenType.LPAREN) {
      this.advance();
      const firstNum = this.expect(TokenType.NUMBER);
      width = parseInt(firstNum.value, 10);

      if (this.currentToken().type === TokenType.TIMES) {
        this.advance();
        const secondNum = this.expect(TokenType.NUMBER);
        height = parseInt(secondNum.value, 10);
      } else {
        height = width;
      }

      this.expect(TokenType.RPAREN);
    } else {
      const numToken = this.expect(TokenType.NUMBER);
      width = parseInt(numToken.value, 10);
      height = width;
    }

    return { width, height };
  }

  private parseSymbolChar(): string {
    const token = this.currentToken();

    if (token.type === TokenType.SYMBOL) {
      this.advance();
      return token.value;
    } else if (token.type === TokenType.QUOTED_STRING) {
      this.advance();
      return token.value;
    } else if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      const firstChar = token.value.charAt(0);

      if (token.value.length > 1) {
        const remaining = token.value.slice(1);
        let allDigits = true;
        for (let i = 0; i < remaining.length; i++) {
          if (!isDigit(remaining[i])) {
            allDigits = false;
            break;
          }
        }

        if (allDigits) {
          const numToken: Token = {
            type: TokenType.NUMBER,
            value: remaining,
            position: token.position + 1,
            line: token.line,
            column: token.column + 1,
          };
          this.tokens.splice(this.position, 0, numToken);
        } else {
          return token.value;
        }
      }

      return firstChar;
    } else {
      throw new Error(
        `Expected symbol but got ${token.type} "${token.value}" at line ${token.line}, column ${token.column}`
      );
    }
  }

  private parseIndexRange(): { start: number; end: number } {
    const startToken = this.expect(TokenType.NUMBER);
    
    const dashToken = this.currentToken();
    if (dashToken.type !== TokenType.DASH) {
      throw new Error(`Expected '-' after index but got ${dashToken.type} "${dashToken.value}" at line ${dashToken.line}, column ${dashToken.column}`);
    }
    this.advance();
    
    // STRICT CHECK: The next token MUST be a NUMBER. 
    const nextToken = this.currentToken();
    if (nextToken.type !== TokenType.NUMBER) {
        throw new Error(
            `Expected number after '-' but got ${nextToken.type} "${nextToken.value}" at line ${nextToken.line}, column ${nextToken.column}. Invalid index range.`
        );
    }
    
    const endToken = this.expect(TokenType.NUMBER);

    return {
      start: parseInt(startToken.value, 10),
      end: parseInt(endToken.value, 10),
    };
  }

  private parseParameters(): Partial<SymbolSpec> {
    const params: Partial<SymbolSpec> = {};

    if (this.currentToken().type !== TokenType.LBRACKET) {
      return params;
    }

    this.advance();

    let paramCount = 0;

    while (this.currentToken().type !== TokenType.RBRACKET && this.currentToken().type !== TokenType.EOF) {
      paramCount++;
      if (paramCount > SECURITY_LIMITS.MAX_PARAMS_PER_SYMBOL) {
        throw new SecurityError(`Too many parameters: max ${SECURITY_LIMITS.MAX_PARAMS_PER_SYMBOL}`);
      }

      // Handle #id and .class references inside params (streaming syntax)
      const curToken = this.currentToken();
      if (curToken.type === TokenType.HASH_REF) {
        params.refId = curToken.value;
        this.advance();
        if (this.currentToken().type === TokenType.SEMICOLON) this.advance();
        continue;
      }
      if (curToken.type === TokenType.AT_REF) {
        params.refName = curToken.value;
        this.advance();
        if (this.currentToken().type === TokenType.SEMICOLON) this.advance();
        continue;
      }
      if (curToken.type === TokenType.DOT_REF) {
        params.refClass = curToken.value;
        this.advance();
        if (this.currentToken().type === TokenType.SEMICOLON) this.advance();
        continue;
      }

      const keyToken = this.currentToken();
      if (keyToken.type !== TokenType.IDENTIFIER) {
        throw new Error(`Expected parameter key at line ${keyToken.line}, column ${keyToken.column}`);
      }
      this.advance();

      const key = keyToken.value.toLowerCase();
      this.expect(TokenType.EQUALS);

      // sp/st may be unquoted token sequences: 45-20, 360° 20px, 90,20, etc.
      if (key === 'sp' || key === 'st') {
        const valueTokens: Token[] = [];
        while (
          this.currentToken().type !== TokenType.SEMICOLON &&
          this.currentToken().type !== TokenType.RBRACKET &&
          this.currentToken().type !== TokenType.EOF
        ) {
          valueTokens.push(this.currentToken());
          this.advance();
        }

        const rawValue = valueTokens.map((t) => t.value).join(' ');
        const parsed = parseAngleForce(rawValue, key);
        if (key === 'sp') params.sp = parsed;
        else params.st = parsed;

        if (this.currentToken().type === TokenType.SEMICOLON) {
          this.advance();
        }
        continue;
      }

      const valueToken = this.currentToken();

      let value: string;

      // Check if this is an unquoted CSS function like hsl(...), rgb(...), hsla(...), rgba(...)
      const colorKeys = ['c', 'color', 'b', 'bc', 'bb', 'gc', 'gb'];
      if (
        colorKeys.includes(key) &&
        valueToken.type === TokenType.IDENTIFIER &&
        /^(hsl|hsla|rgb|rgba)$/i.test(valueToken.value) &&
        this.position + 1 < this.tokens.length &&
        this.tokens[this.position + 1].type === TokenType.LPAREN
      ) {
        // Consume: funcName ( ... )
        let funcStr = valueToken.value;
        this.advance(); // skip identifier (hsl/rgb)
        let depth = 0;
        while (this.currentToken().type !== TokenType.EOF) {
          const t = this.currentToken();
          if (t.type === TokenType.LPAREN) depth++;
          else if (t.type === TokenType.RPAREN) {
            depth--;
            if (depth === 0) {
              funcStr += t.value;
              this.advance();
              break;
            }
          }
          // Skip whitespace tokens but join values tightly
          if (t.type === TokenType.COMMA) {
            funcStr += ', ';
          } else {
            funcStr += t.value;
          }
          this.advance();
        }
        value = funcStr;
      } else if (valueToken.type === TokenType.DASH) {
        // Handle negative numbers (DASH followed by NUMBER)
        this.advance();
        const numToken = this.currentToken();
        if (numToken.type === TokenType.NUMBER) {
          value = '-' + numToken.value;
          this.advance();
        } else {
          value = '-';
        }
      } else if (valueToken.type === TokenType.NUMBER) {
        value = valueToken.value;
        this.advance();
      } else if (valueToken.type === TokenType.SYMBOL) {
        value = valueToken.value;
        this.advance();
      } else if (valueToken.type === TokenType.QUOTED_STRING) {
        value = valueToken.value;
        this.advance();
      } else if (valueToken.type === TokenType.IDENTIFIER) {
        value = valueToken.value;
        this.advance();
      } else {
        throw new Error(
          `Expected parameter value at line ${valueToken.line}, column ${valueToken.column}`
        );
      }

      switch (key) {
        case 'c':
        case 'color':
          if (!isValidColor(value)) {
            throw new Error(`Invalid color: "${value}"`);
          }
          params.color = normalizeColor(value);
          break;
        case 'a':
        case 'alpha':
        case 'opacity': {
          const opacity = parseFloat(value);
          if (isNaN(opacity) || opacity < 0 || opacity > 1) {
            throw new Error(`Invalid opacity: "${value}" (must be 0-1)`);
          }
          params.opacity = opacity;
          break;
        }
        case 'r':
        case 'rotate': {
          const rotate = parseFloat(value);
          if (isNaN(rotate)) {
            throw new Error(`Invalid rotation: "${value}" (must be a number)`);
          }
          params.rotate = ((rotate % 360) + 360) % 360;
          break;
        }
        case 'f':
        case 'flip':
          if (value !== 'h' && value !== 'v' && value !== 'hv') {
            throw new Error(`Invalid flip: "${value}" (must be h, v, or hv)`);
          }
          params.flip = value;
          break;
        case 'font':
        case 'fontfamily':
          params.fontFamily = value;
          break;
        case 'n':
        case 'name':
          params.name = value;
          break;
        case 'id':
          params.id = value;
          break;
        case 'class':
        case 'classname':
          params.className = value;
          break;
        case 's':
        case 'scale': {
          const parts = value.split(',').map(v => v.trim());
          const sx = parseFloat(parts[0]);
          const sy = parts.length > 1 ? parseFloat(parts[1]) : sx;
          if (isNaN(sx) || isNaN(sy) || sx <= 0 || sy <= 0) {
            throw new Error(`Invalid scale: "${value}" (must be positive numbers)`);
          }
          params.scale = { x: sx, y: sy };
          break;
        }
        case 't':
        case 'transition': {
          const t = parseFloat(value);
          if (isNaN(t) || t < 0) {
            throw new Error(`Invalid transition: "${value}" (must be >= 0)`);
          }
          params.transition = t;
          break;
        }
        case 'm':
        case 'margin': {
          params.margin = parseBoxValue(value);
          break;
        }
        case 'p':
        case 'position': {
          params.position = parseBoxValue(value);
          break;
        }
        case 'o':
        case 'offset': {
          const parts = value.split(',').map(v => v.trim());
          const ox = parseFloat(parts[0]);
          const oy = parts.length > 1 ? parseFloat(parts[1]) : ox;
          if (!isNaN(ox) && !isNaN(oy)) {
            params.offset = { x: ox, y: oy };
          }
          break;
        }
        // === NEW PARAM SCHEME ===
        // b= Symbol Border: "width, H, S%, L%, alpha" or "width, color, alpha"
        case 'b': {
          const bMatch = value.match(/^\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*$/);
          if (bMatch) {
            params.strokeWidth = parseFloat(bMatch[1]);
            params.strokeColor = `hsl(${bMatch[2]}, ${bMatch[3]}%, ${bMatch[4]}%)`;
            if (bMatch[5]) params.strokeOpacity = parseFloat(bMatch[5]);
          } else {
            // Legacy: b= was background color — detect if it's a plain color
            if (isValidColor(value)) {
              params.background = normalizeColor(value);
            }
          }
          break;
        }
        // bc= Layer Background: "H, S%, L%, alpha, radius" or plain color
        case 'bc': {
          const bcCompound = value.match(/^\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*(?:,\s*(.+))?\s*$/);
          if (bcCompound) {
            params.background = `hsl(${bcCompound[1]}, ${bcCompound[2]}%, ${bcCompound[3]}%)`;
            if (bcCompound[4]) params.backgroundOpacity = parseFloat(bcCompound[4]);
            if (bcCompound[5]) params.borderRadius = bcCompound[5].trim();
          } else {
            // Legacy: bc= was stroke color — detect compound "Wpx, H, S%, L%"
            const legacyBc = value.match(/^\s*([\d.]+)px\s*,\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*$/);
            if (legacyBc) {
              params.strokeWidth = parseFloat(legacyBc[1]);
              params.strokeColor = `hsl(${legacyBc[2]}, ${legacyBc[3]}%, ${legacyBc[4]}%)`;
            } else if (isValidColor(value)) {
              params.background = normalizeColor(value);
            }
          }
          break;
        }
        // bb= Layer Border: "width, H, S%, L%, alpha"
        case 'bb': {
          const bbMatch = value.match(/^\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*$/);
          if (bbMatch) {
            params.layerBorderWidth = parseFloat(bbMatch[1]);
            params.layerBorderColor = `hsl(${bbMatch[2]}, ${bbMatch[3]}%, ${bbMatch[4]}%)`;
            if (bbMatch[5]) params.layerBorderOpacity = parseFloat(bbMatch[5]);
          }
          break;
        }
        // gc= Grid Background: "H, S%, L%, alpha, radius" or plain color
        case 'gc': {
          const gcCompound = value.match(/^\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*(?:,\s*(.+))?\s*$/);
          if (gcCompound) {
            params.background = `hsl(${gcCompound[1]}, ${gcCompound[2]}%, ${gcCompound[3]}%)`;
            if (gcCompound[4]) params.backgroundOpacity = parseFloat(gcCompound[4]);
            if (gcCompound[5]) params.borderRadius = gcCompound[5].trim();
          } else if (isValidColor(value)) {
            params.background = normalizeColor(value);
          }
          break;
        }
        // gb= Grid Border: "width, H, S%, L%, alpha"
        case 'gb': {
          const gbMatch = value.match(/^\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*$/);
          if (gbMatch) {
            params.strokeWidth = parseFloat(gbMatch[1]);
            params.strokeColor = `hsl(${gbMatch[2]}, ${gbMatch[3]}%, ${gbMatch[4]}%)`;
            if (gbMatch[5]) params.strokeOpacity = parseFloat(gbMatch[5]);
          }
          break;
        }
        // Legacy compat: keep old param names working
        case 'background':
          if (isValidColor(value)) params.background = normalizeColor(value);
          break;
        case 'bw':
        case 'strokewidth': {
          const bw = parseFloat(value);
          if (!isNaN(bw) && bw >= 0) params.strokeWidth = bw;
          break;
        }
        case 'strokecolor': {
          params.strokeColor = normalizeColor(value);
          break;
        }
        case 'bo':
        case 'strokeopacity': {
          const bo = parseFloat(value);
          if (!isNaN(bo) && bo >= 0 && bo <= 1) params.strokeOpacity = bo;
          break;
        }
        case 'ba':
        case 'backgroundopacity': {
          const ba = parseFloat(value);
          if (!isNaN(ba) && ba >= 0 && ba <= 1) params.backgroundOpacity = ba;
          break;
        }
        case 'br':
        case 'borderradius':
          params.borderRadius = value.trim();
          break;
        default:
          break;
      }

      if (this.currentToken().type === TokenType.SEMICOLON) {
        this.advance();
      }
    }

    this.expect(TokenType.RBRACKET);
    return params;
  }

  private peekForStepBlock(): boolean {
    let pos = this.position;
    if (this.tokens[pos].type !== TokenType.LBRACKET) return false;
    pos++;
    while (pos < this.tokens.length && this.tokens[pos].type !== TokenType.RBRACKET) {
      if (this.tokens[pos].type === TokenType.IDENTIFIER) {
        const key = this.tokens[pos].value.toLowerCase();
        if ((key === 'h' || key === 'k') &&
            pos + 1 < this.tokens.length &&
            this.tokens[pos + 1].type === TokenType.EQUALS) {
          return true;
        }
      }
      pos++;
    }
    return false;
  }

  private parseStepBlocks(): { type: 'history' | 'keyframe'; steps: (HistoryStep | KeyframeStep)[]; baseParams: Partial<SymbolSpec> } {
    const steps: (HistoryStep | KeyframeStep)[] = [];
    let type: 'history' | 'keyframe' = 'history';
    const baseParams: Partial<SymbolSpec> = {};
    let hasAnyK = false;

    while (this.currentToken().type === TokenType.LBRACKET) {
      this.advance(); // skip [

      const step: any = { index: 0 };
      let stepHasK = false;

      while (this.currentToken().type !== TokenType.RBRACKET && this.currentToken().type !== TokenType.EOF) {
        const keyToken = this.currentToken();
        if (keyToken.type !== TokenType.IDENTIFIER) {
          throw new Error(`Expected parameter key at line ${keyToken.line}, column ${keyToken.column}`);
        }
        this.advance();

        const key = keyToken.value.toLowerCase();

        // Detect compound operator: -=, +=, or plain =
        let op: DeltaOp = '=';
        if (this.currentToken().type === TokenType.DASH &&
            this.position + 1 < this.tokens.length &&
            this.tokens[this.position + 1].type === TokenType.EQUALS) {
          op = '-=';
          this.advance(); // skip -
        } else if (this.currentToken().type === TokenType.PLUS &&
                   this.position + 1 < this.tokens.length &&
                   this.tokens[this.position + 1].type === TokenType.EQUALS) {
          op = '+=';
          this.advance(); // skip +
        }

        this.expect(TokenType.EQUALS);

        if (key === 'h') {
          step.index = this._readNum();
          // h= block — don't set type to keyframe
        } else if (key === 'k') {
          step.index = this._readNum();
          stepHasK = true;
          hasAnyK = true;
          type = 'keyframe';
        } else if (key === 't') {
          step.duration = this._readDuration();
        } else if (key === 'st' || key === 'sp') {
          const valueTokens: Token[] = [];
          while (
            this.currentToken().type !== TokenType.SEMICOLON &&
            this.currentToken().type !== TokenType.RBRACKET &&
            this.currentToken().type !== TokenType.EOF
          ) {
            valueTokens.push(this.currentToken());
            this.advance();
          }
          const rawValue = valueTokens.map(tk => tk.value).join('');
          const parsed = parseAngleForceDelta(rawValue);
          step[key] = { op, angle: parsed.angle, force: parsed.force };
        } else if (key === 'r' || key === 'rotate') {
          step.rotate = { op, value: this._readNum() };
        } else if (key === 's' || key === 'scale') {
          const { x, y } = this._readScalePair();
          step.scale = { op, x, y };
        } else if (key === 'o' || key === 'offset') {
          const { x, y } = this._readScalePair();
          step.offset = { op, x, y };
        } else if (key === 'me' || key === 'moveexpand') {
          // me= Move Expand: "el, et" — grid expansion from move
          const { x, y } = this._readScalePair();
          step.me = { el: x, et: y };
        } else if (key === 'el' || key === 'expandleft') {
          // Legacy: el= standalone (map to me)
          if (!step.me) step.me = { el: 0, et: 0 };
          step.me.el = this._readNum();
        } else if (key === 'et' || key === 'expandtop') {
          // Legacy: et= standalone (map to me)
          if (!step.me) step.me = { el: 0, et: 0 };
          step.me.et = this._readNum();
        } else if (key === 'se' || key === 'scaleexpand') {
          // se= Scale Expand: "sl, st" — grid expansion from scale
          const { x, y } = this._readScalePair();
          step.se = { sl: x, st: y };
        } else if (key === 'd' || key === 'bounds') {
          const { x, y } = this._readScalePair();
          step.d = { op, x, y }; // x=w, y=h
        } else if (key === 'a' || key === 'opacity') {
          const val = this._readNum();
          step.opacity = { op, value: val };
        } else if (key === 'c' || key === 'color') {
          const val = this._readColorValue();
          const normalized = normalizeColor(val);
          baseParams.color = normalized;
          if (!step.colorGroup) step.colorGroup = { op: '=' };
          step.colorGroup.color = normalized;
        } else if (key === 'b') {
          // NEW: b= Symbol Border in h= block: "width, H, S%, L%, alpha"
          const val = this._readColorValue();
          const bMatch = val.match(/^\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*$/);
          if (bMatch) {
            const sw = parseFloat(bMatch[1]);
            const sc = `hsl(${bMatch[2]}, ${bMatch[3]}%, ${bMatch[4]}%)`;
            baseParams.strokeWidth = sw;
            baseParams.strokeColor = sc;
            if (!step.colorGroup) step.colorGroup = { op: '=' };
            step.colorGroup.symbolBorderWidth = sw;
            step.colorGroup.symbolBorderColor = sc;
            if (bMatch[5]) {
              baseParams.strokeOpacity = parseFloat(bMatch[5]);
              step.colorGroup.symbolBorderOpacity = parseFloat(bMatch[5]);
            }
          } else {
            // Legacy: b= as background color
            const normalized = normalizeColor(val);
            baseParams.background = normalized;
            if (!step.colorGroup) step.colorGroup = { op: '=' };
            step.colorGroup.background = normalized;
          }
        } else if (key === 'bc') {
          // NEW: bc= Layer Background in h= block: "H, S%, L%, alpha, radius"
          const val = this._readColorValue();
          const bcCompound = val.match(/^\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*(?:,\s*(.+))?\s*$/);
          if (bcCompound) {
            const bg = `hsl(${bcCompound[1]}, ${bcCompound[2]}%, ${bcCompound[3]}%)`;
            baseParams.background = bg;
            if (!step.colorGroup) step.colorGroup = { op: '=' };
            step.colorGroup.background = bg;
            if (bcCompound[4]) {
              baseParams.backgroundOpacity = parseFloat(bcCompound[4]);
              step.colorGroup.backgroundOpacity = parseFloat(bcCompound[4]);
            }
            if (bcCompound[5]) {
              baseParams.borderRadius = bcCompound[5].trim();
              step.colorGroup.borderRadius = bcCompound[5].trim();
            }
          } else {
            // Legacy: bc= as stroke color with "Wpx, H, S%, L%"
            const legacyBc = val.match(/^\s*([\d.]+)px\s*,\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*$/);
            if (legacyBc) {
              baseParams.strokeWidth = parseFloat(legacyBc[1]);
              baseParams.strokeColor = `hsl(${legacyBc[2]}, ${legacyBc[3]}%, ${legacyBc[4]}%)`;
              if (!step.colorGroup) step.colorGroup = { op: '=' };
              step.colorGroup.strokeWidth = parseFloat(legacyBc[1]);
              step.colorGroup.strokeColor = `hsl(${legacyBc[2]}, ${legacyBc[3]}%, ${legacyBc[4]}%)`;
            } else {
              const normalized = normalizeColor(val);
              baseParams.background = normalized;
              if (!step.colorGroup) step.colorGroup = { op: '=' };
              step.colorGroup.background = normalized;
            }
          }
        } else if (key === 'bb') {
          // NEW: bb= Layer Border in h= block
          const val = this._readColorValue();
          const bbMatch = val.match(/^\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*$/);
          if (bbMatch) {
            baseParams.layerBorderWidth = parseFloat(bbMatch[1]);
            baseParams.layerBorderColor = `hsl(${bbMatch[2]}, ${bbMatch[3]}%, ${bbMatch[4]}%)`;
            if (!step.colorGroup) step.colorGroup = { op: '=' };
            step.colorGroup.layerBorderWidth = parseFloat(bbMatch[1]);
            step.colorGroup.layerBorderColor = `hsl(${bbMatch[2]}, ${bbMatch[3]}%, ${bbMatch[4]}%)`;
            if (bbMatch[5]) {
              baseParams.layerBorderOpacity = parseFloat(bbMatch[5]);
              step.colorGroup.layerBorderOpacity = parseFloat(bbMatch[5]);
            }
          }
        } else if (key === 'background') {
          // Legacy compat
          const val = this._readColorValue();
          const normalized = normalizeColor(val);
          baseParams.background = normalized;
          if (!step.colorGroup) step.colorGroup = { op: '=' };
          step.colorGroup.background = normalized;
        } else if (key === 'strokecolor') {
          const val = this._readColorValue();
          const normalized = normalizeColor(val);
          baseParams.strokeColor = normalized;
          if (!step.colorGroup) step.colorGroup = { op: '=' };
          step.colorGroup.strokeColor = normalized;
        } else if (key === 'bw' || key === 'strokewidth') {
          const bw = this._readNum();
          baseParams.strokeWidth = bw;
          if (!step.colorGroup) step.colorGroup = { op: '=' };
          step.colorGroup.strokeWidth = bw;
        } else if (key === 'bo' || key === 'strokeopacity') {
          const bo = this._readNum();
          baseParams.strokeOpacity = bo;
          if (!step.colorGroup) step.colorGroup = { op: '=' };
          step.colorGroup.strokeOpacity = bo;
        } else if (key === 'ba' || key === 'backgroundopacity') {
          const ba = this._readNum();
          baseParams.backgroundOpacity = ba;
          if (!step.colorGroup) step.colorGroup = { op: '=' };
          step.colorGroup.backgroundOpacity = ba;
        } else if (key === 'br' || key === 'borderradius') {
          let brVal: string;
          if (this.currentToken().type === TokenType.QUOTED_STRING) {
            brVal = this.currentToken().value.trim();
            this.advance();
          } else {
            let raw = '';
            while (this.currentToken().type !== TokenType.SEMICOLON &&
                   this.currentToken().type !== TokenType.RBRACKET &&
                   this.currentToken().type !== TokenType.EOF) {
              raw += this.currentToken().value;
              this.advance();
            }
            brVal = raw.trim();
          }
          baseParams.borderRadius = brVal;
          if (!step.colorGroup) step.colorGroup = { op: '=' };
          step.colorGroup.borderRadius = brVal;
        } else if (key === 'f' || key === 'flip') {
          if (this.currentToken().type === TokenType.QUOTED_STRING || this.currentToken().type === TokenType.IDENTIFIER) {
            baseParams.flip = this.currentToken().value as any;
            this.advance();
          }
        } else if (key === 'font') {
          if (this.currentToken().type === TokenType.QUOTED_STRING) {
            baseParams.fontFamily = this.currentToken().value;
            this.advance();
          } else {
            baseParams.fontFamily = this.currentToken().value;
            this.advance();
          }
        } else if (key === 'id') {
          baseParams.id = this.currentToken().type === TokenType.QUOTED_STRING ? this.currentToken().value : this.currentToken().value;
          this.advance();
        } else if (key === 'class') {
          baseParams.className = this.currentToken().type === TokenType.QUOTED_STRING ? this.currentToken().value : this.currentToken().value;
          this.advance();
        } else if (key === 'n' || key === 'name') {
          baseParams.name = this.currentToken().type === TokenType.QUOTED_STRING ? this.currentToken().value : this.currentToken().value;
          this.advance();
        } else {
          // Unknown param — skip value tokens until ; or ]
          while (this.currentToken().type !== TokenType.SEMICOLON &&
                  this.currentToken().type !== TokenType.RBRACKET &&
                  this.currentToken().type !== TokenType.EOF) {
            this.advance();
          }
        }

        if (this.currentToken().type === TokenType.SEMICOLON) {
          this.advance();
        }
      }

      this.expect(TokenType.RBRACKET);

      // Post-process: merge opacity into colorGroup if both exist
      if (step.colorGroup && step.opacity) {
        step.colorGroup.opacity = step.opacity.value;
        step.opacity = undefined;
      }

      // Only set duration on actual k= blocks (default 1 second)
      if (stepHasK && step.duration === undefined) {
        step.duration = 1;
      }

      steps.push(step);
    }

    // If any k= found, auto-assign k=0 to first block if it wasn't a k= block
    if (hasAnyK && steps.length > 0 && !('duration' in steps[0])) {
      (steps[0] as any).duration = 0; // starting state — no transition needed
      type = 'keyframe';
    }

    // Re-index: deduplicate k= and h= indices within their respective groups
    if (hasAnyK) {
      let kIdx = 0;
      for (const step of steps) {
        if ((step as any).duration !== undefined) {
          (step as any).index = kIdx++;
        }
      }
    }

    return { type, steps, baseParams };
  }

  private _readNum(): number {
    let sign = 1;
    if (this.currentToken().type === TokenType.DASH) {
      sign = -1;
      this.advance();
    } else if (this.currentToken().type === TokenType.PLUS) {
      this.advance();
    }
    const token = this.expect(TokenType.NUMBER);
    return parseFloat(token.value) * sign;
  }

  private _readDuration(): number {
    const first = this.expect(TokenType.NUMBER);
    let val = first.value;
    if (this.currentToken().type === TokenType.COMMA) {
      this.advance();
      if (this.currentToken().type === TokenType.NUMBER) {
        val += '.' + this.currentToken().value;
        this.advance();
      }
    }
    return parseFloat(val);
  }

  private _readScalePair(): { x: number; y: number } {
    const x = this._readNum();
    let y = x;
    if (this.currentToken().type === TokenType.COMMA) {
      this.advance();
      y = this._readNum();
    }
    return { x, y };
  }

  /** Read a color value: quoted string, CSS function (hsl/rgb), or plain identifier */
  private _readColorValue(): string {
    const token = this.currentToken();
    if (token.type === TokenType.QUOTED_STRING) {
      this.advance();
      return token.value;
    }
    // Check for CSS function: hsl(...), rgb(...), etc.
    if (token.type === TokenType.IDENTIFIER && /^(hsl|hsla|rgb|rgba)$/i.test(token.value) &&
        this.position + 1 < this.tokens.length && this.tokens[this.position + 1].type === TokenType.LPAREN) {
      let funcStr = token.value;
      this.advance(); // skip identifier
      let depth = 0;
      while (this.currentToken().type !== TokenType.EOF) {
        const t = this.currentToken();
        if (t.type === TokenType.LPAREN) depth++;
        else if (t.type === TokenType.RPAREN) {
          depth--;
          if (depth === 0) { funcStr += t.value; this.advance(); break; }
        }
        if (t.type === TokenType.COMMA) funcStr += ', ';
        else funcStr += t.value;
        this.advance();
      }
      return funcStr;
    }
    // Read until ; or ]
    let val = '';
    while (this.currentToken().type !== TokenType.SEMICOLON &&
           this.currentToken().type !== TokenType.RBRACKET &&
           this.currentToken().type !== TokenType.EOF) {
      val += this.currentToken().value;
      this.advance();
    }
    return val;
  }

  private parseSymbol(gridWidth: number, gridHeight: number): SymbolSpec {
    this.checkTimeout();
    this.checkSymbolLimit();
    this.symbolCount++;

    const token = this.currentToken();
    let char = '';
    let refId: string | undefined;
    let refName: string | undefined;
    let refClass: string | undefined;

    if (token.type === TokenType.HASH_REF) {
      refId = token.value;
      char = '#' + token.value;
      this.advance();
    } else if (token.type === TokenType.AT_REF) {
      refName = token.value;
      char = '@' + token.value;
      this.advance();
    } else if (token.type === TokenType.DOT_REF) {
      refClass = token.value;
      char = '.' + token.value;
      this.advance();
    } else {
      char = this.parseSymbolChar();
    }

    let params: Partial<SymbolSpec> = {};

    if (this.currentToken().type === TokenType.LBRACKET) {
      if (this.peekForStepBlock()) {
        const result = this.parseStepBlocks();
        // Merge base params (color, flip, etc.) from step blocks
        Object.assign(params, result.baseParams);
        if (result.type === 'history') {
          params.history = result.steps as HistoryStep[];
          // Resolve accumulated values from all history steps
          const resolved = resolveHistory(result.steps as HistoryStep[]);
          if (resolved.st) params.st = resolved.st;
          if (resolved.sp) params.sp = resolved.sp;
          if (resolved.rotate !== undefined) params.rotate = resolved.rotate;
          if (resolved.scale) params.scale = resolved.scale;
          if (resolved.offset) params.offset = resolved.offset;
          if (resolved.d) params.bounds = { w: resolved.d.x, h: resolved.d.y };
          if (resolved.colorGroup) {
            if (resolved.colorGroup.color !== undefined) params.color = resolved.colorGroup.color;
            if (resolved.colorGroup.background !== undefined) params.background = resolved.colorGroup.background;
            if (resolved.colorGroup.backgroundOpacity !== undefined) params.backgroundOpacity = resolved.colorGroup.backgroundOpacity;
            if (resolved.colorGroup.borderRadius !== undefined) params.borderRadius = resolved.colorGroup.borderRadius;
            if (resolved.colorGroup.strokeColor !== undefined) params.strokeColor = resolved.colorGroup.strokeColor;
            if (resolved.colorGroup.strokeWidth !== undefined) params.strokeWidth = resolved.colorGroup.strokeWidth;
            if (resolved.colorGroup.strokeOpacity !== undefined) params.strokeOpacity = resolved.colorGroup.strokeOpacity;
            if (resolved.colorGroup.opacity !== undefined) params.opacity = resolved.colorGroup.opacity;
          }
        } else {
          params.keyframes = result.steps as KeyframeStep[];
          // For static rendering, resolve only the first keyframe group (k=0)
          const firstGroupSteps: HistoryStep[] = [];
          for (let i = 0; i < result.steps.length; i++) {
            if (i > 0 && 'duration' in result.steps[i]) break; // hit next k= block
            firstGroupSteps.push(result.steps[i] as HistoryStep);
          }
          const resolved = resolveHistory(firstGroupSteps);
          if (resolved.st) params.st = resolved.st;
          if (resolved.sp) params.sp = resolved.sp;
          if (resolved.rotate !== undefined) params.rotate = resolved.rotate;
          if (resolved.scale) params.scale = resolved.scale;
          if (resolved.offset) params.offset = resolved.offset;
          if (resolved.d) params.bounds = { w: resolved.d.x, h: resolved.d.y };
          if (resolved.colorGroup) {
            if (resolved.colorGroup.color !== undefined) params.color = resolved.colorGroup.color;
            // Map new and legacy field names
            if (resolved.colorGroup.layerBackground !== undefined) params.background = resolved.colorGroup.layerBackground;
            else if (resolved.colorGroup.background !== undefined) params.background = resolved.colorGroup.background;
            if (resolved.colorGroup.layerBackgroundOpacity !== undefined) params.backgroundOpacity = resolved.colorGroup.layerBackgroundOpacity;
            else if (resolved.colorGroup.backgroundOpacity !== undefined) params.backgroundOpacity = resolved.colorGroup.backgroundOpacity;
            if (resolved.colorGroup.layerBorderRadius !== undefined) params.borderRadius = resolved.colorGroup.layerBorderRadius;
            else if (resolved.colorGroup.borderRadius !== undefined) params.borderRadius = resolved.colorGroup.borderRadius;
            if (resolved.colorGroup.symbolBorderColor !== undefined) params.strokeColor = resolved.colorGroup.symbolBorderColor;
            else if (resolved.colorGroup.strokeColor !== undefined) params.strokeColor = resolved.colorGroup.strokeColor;
            if (resolved.colorGroup.symbolBorderWidth !== undefined) params.strokeWidth = resolved.colorGroup.symbolBorderWidth;
            else if (resolved.colorGroup.strokeWidth !== undefined) params.strokeWidth = resolved.colorGroup.strokeWidth;
            if (resolved.colorGroup.symbolBorderOpacity !== undefined) params.strokeOpacity = resolved.colorGroup.symbolBorderOpacity;
            else if (resolved.colorGroup.strokeOpacity !== undefined) params.strokeOpacity = resolved.colorGroup.strokeOpacity;
            if (resolved.colorGroup.layerBorderWidth !== undefined) params.layerBorderWidth = resolved.colorGroup.layerBorderWidth;
            if (resolved.colorGroup.layerBorderColor !== undefined) params.layerBorderColor = resolved.colorGroup.layerBorderColor;
            if (resolved.colorGroup.layerBorderOpacity !== undefined) params.layerBorderOpacity = resolved.colorGroup.layerBorderOpacity;
            if (resolved.colorGroup.opacity !== undefined) params.opacity = resolved.colorGroup.opacity;
          }
        }
      } else {
        params = this.parseParameters();
      }
    }

    if (refId) params.refId = refId;
    if (refName) params.refName = refName;
    if (refClass) params.refClass = refClass;

    if (this.currentToken().type === TokenType.COMMA) {
      this.advance();
    }

    const { start, end } = this.parseIndexRange();

    const maxIndex = gridWidth * gridHeight - 1;
    if (start > maxIndex || end > maxIndex || start < 0 || end < 0) {
      throw new Error(
        `Index out of bounds. Valid range for ${gridWidth}×${gridHeight} grid is 0-${maxIndex}`
      );
    }

    return { char, start, end, ...params } as SymbolSpec;
  }

  parse(): ParseResult {
    try {
      const grid = this.parseGridSpec();
      const { width: gridWidth, height: gridHeight } = grid;

      if (gridWidth < SECURITY_LIMITS.MIN_GRID_SIZE || gridWidth > SECURITY_LIMITS.MAX_GRID_SIZE) {
        throw new Error(`Grid width must be between ${SECURITY_LIMITS.MIN_GRID_SIZE} and ${SECURITY_LIMITS.MAX_GRID_SIZE}`);
      }
      if (gridHeight < SECURITY_LIMITS.MIN_GRID_SIZE || gridHeight > SECURITY_LIMITS.MAX_GRID_SIZE) {
        throw new Error(`Grid height must be between ${SECURITY_LIMITS.MIN_GRID_SIZE} and ${SECURITY_LIMITS.MAX_GRID_SIZE}`);
      }

      // Parse optional grid-level parameters: (W×H)[id="...";class="...";b="...";bc="..."]:
      let gridId: string | undefined;
      let gridClassName: string | undefined;
      let gridName: string | undefined;
      let gridBackground: string | undefined;
      let gridBackgroundOpacity: number | undefined;
      let gridBorderRadius: string | undefined;
      let gridStrokeColor: string | undefined;
      let gridStrokeWidth: number | undefined;
      let gridStrokeOpacity: number | undefined;
      let gridOpacity: number | undefined;
      if (this.currentToken().type === TokenType.LBRACKET) {
        const gridParams = this.parseParameters();
        gridId = gridParams.id;
        gridClassName = gridParams.className;
        gridName = gridParams.name;
        gridBackground = gridParams.background;
        gridBackgroundOpacity = gridParams.backgroundOpacity;
        gridBorderRadius = gridParams.borderRadius;
        gridStrokeColor = gridParams.strokeColor;
        gridStrokeWidth = gridParams.strokeWidth;
        gridStrokeOpacity = gridParams.strokeOpacity;
        gridOpacity = gridParams.opacity;
      }

      this.expect(TokenType.COLON);

      const symbols: SymbolSpec[] = [];

      while (this.currentToken().type !== TokenType.EOF) {
        symbols.push(this.parseSymbol(gridWidth, gridHeight));

        if (this.currentToken().type === TokenType.SEMICOLON) {
          this.advance();
        } else if (this.currentToken().type !== TokenType.EOF) {
          const token = this.currentToken();
          throw new Error(`Unexpected token ${token.type} "${token.value}" at line ${token.line}, column ${token.column}. Expected semicolon or end of input.`);
        }
      }

      return {
        success: true,
        spec: {
          gridSize: gridWidth,
          gridWidth,
          gridHeight,
          symbols,
          raw: this.tokens
            .filter((t) => t.type !== TokenType.EOF)
            .map((t) => t.value)
            .join(''),
          id: gridId,
          className: gridClassName,
          name: gridName,
          background: gridBackground,
          backgroundOpacity: gridBackgroundOpacity,
          borderRadius: gridBorderRadius,
          strokeColor: gridStrokeColor,
          strokeWidth: gridStrokeWidth,
          strokeOpacity: gridStrokeOpacity,
          opacity: gridOpacity,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: {
          message: e instanceof Error ? e.message : 'Unknown parse error',
          position: this.currentToken().position,
          line: this.currentToken().line,
          column: this.currentToken().column,
        },
      };
    }
  }
}

// ============================================================================
// REGISTRY — stores composed blocks by id, name, class
// ============================================================================

export interface RegistryEntry {
  id?: string;
  name?: string;
  className?: string;
  raw: string;
  spec: UniCompSpec;
}

export class UniCompRegistry {
  private byId: Map<string, RegistryEntry> = new Map();
  private byName: Map<string, RegistryEntry> = new Map();
  private byClass: Map<string, RegistryEntry> = new Map();

  clear() {
    this.byId.clear();
    this.byName.clear();
    this.byClass.clear();
  }

  register(entry: RegistryEntry) {
    if (entry.id) this.byId.set(entry.id, entry);
    if (entry.name) this.byName.set(entry.name, entry);
    if (entry.className) this.byClass.set(entry.className, entry);
  }

  getById(id: string): RegistryEntry | undefined {
    return this.byId.get(id);
  }

  getByName(name: string): RegistryEntry | undefined {
    return this.byName.get(name);
  }

  getByClass(className: string): RegistryEntry | undefined {
    return this.byClass.get(className);
  }

  /** Resolve a symbol's reference (refId, refName, refClass) to a registry entry */
  resolve(symbol: SymbolSpec): RegistryEntry | undefined {
    if (symbol.refId) return this.getById(symbol.refId);
    if (symbol.refName) return this.getByName(symbol.refName);
    if (symbol.refClass) return this.getByClass(symbol.refClass);
    return undefined;
  }

  get entries(): RegistryEntry[] {
    return Array.from(this.byId.values());
  }

  get size(): number {
    return this.byId.size + this.byName.size + this.byClass.size;
  }
}

// Global registry instance
let globalRegistry = new UniCompRegistry();

export function getRegistry(): UniCompRegistry {
  return globalRegistry;
}

export function resetRegistry(): UniCompRegistry {
  globalRegistry = new UniCompRegistry();
  return globalRegistry;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function parseUniComp(input: string): ParseResult {
  try {
    const tokenizer = new Tokenizer(input);
    const tokens = tokenizer.tokenize();
    const parser = new Parser(tokens);
    return parser.parse();
  } catch (e) {
    return {
      success: false,
      error: {
        message: e instanceof Error ? e.message : 'Tokenization error',
      },
    };
  }
}

export function parseMultiLine(input: string): MultiLineParseResult {
  const lines = input.split('\n');
  const blocks: ParsedBlock[] = [];
  const errorLines: ErrorLine[] = [];
  let validCount = 0;
  let errorCount = 0;

  // Reset and rebuild registry from all valid blocks
  const registry = resetRegistry();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    // Skip empty lines and all comment formats
    if (!trimmed || isCommentLine(trimmed)) {
      return;
    }

    const result = parseUniComp(trimmed);
    
    if (result.success) {
      validCount++;
      blocks.push({
        lineNumber,
        raw: line,
        result,
        name: result.spec.name || result.spec.id || `Line ${lineNumber}`,
      });

      // Register blocks that have id, name, or className
      if (result.spec.id || result.spec.name || result.spec.className) {
        registry.register({
          id: result.spec.id,
          name: result.spec.name,
          className: result.spec.className,
          raw: trimmed,
          spec: result.spec,
        });
      }
    } else {
      const failResult = result as { success: false; error: ParseError };
      errorCount++;
      errorLines.push({
        lineNumber,
        column: failResult.error.column,
        message: failResult.error.message,
        raw: line,
      });
      blocks.push({
        lineNumber,
        raw: line,
        result,
      });
    }
  });

  return {
    blocks,
    totalLines: lines.length,
    validCount,
    errorCount,
    errorLines,
  };
}

export function resizeGrid(rule: string, newWidth: number, newHeight: number): string {
  const result = parseUniComp(rule);
  if (!result.success) return rule;

  const { spec } = result;
  const oldWidth = spec.gridWidth;
  const oldHeight = spec.gridHeight;

  const newSymbols = spec.symbols.map(sym => {
    const startX = sym.start % oldWidth;
    const startY = Math.floor(sym.start / oldWidth);
    const endX = sym.end % oldWidth;
    const endY = Math.floor(sym.end / oldWidth);

    const clampedStartX = Math.min(startX, newWidth - 1);
    const clampedStartY = Math.min(startY, newHeight - 1);
    const clampedEndX = Math.min(endX, newWidth - 1);
    const clampedEndY = Math.min(endY, newHeight - 1);

    const newStart = clampedStartY * newWidth + clampedStartX;
    const newEnd = clampedEndY * newWidth + clampedEndX;

    return { ...sym, start: newStart, end: newEnd };
  });

  return stringifySpec({
    ...spec,
    gridWidth: newWidth,
    gridHeight: newHeight,
    symbols: newSymbols,
  });
}

function serializeStep(step: HistoryStep | KeyframeStep, type: 'h' | 'k', skipColorGroup = false): string {
  const parts: string[] = [];
  parts.push(`${type}=${step.index}`);
  if ('duration' in step && step.duration !== undefined) {
    parts.push(`t=${step.duration}`);
  }
  if (step.st) parts.push(`st${step.st.op}"${step.st.angle},${step.st.force}"`);
  if (step.sp) parts.push(`sp${step.sp.op}"${step.sp.angle},${step.sp.force}"`);
  if (step.rotate) parts.push(`r${step.rotate.op}${step.rotate.value}`);
  if (step.scale) parts.push(`s${step.scale.op}${step.scale.x},${step.scale.y}`);
  if (step.offset) {
    parts.push(`o${step.offset.op}${step.offset.x},${step.offset.y}`);
  }
  if (step.me && (step.me.el || step.me.et)) {
    parts.push(`me=${step.me.el},${step.me.et}`);
  }
  if (step.se && (step.se.sl || step.se.st)) {
    parts.push(`se=${step.se.sl},${step.se.st}`);
  }
  if (step.d) parts.push(`d${step.d.op}${step.d.x},${step.d.y}`);
  if (step.opacity) parts.push(`a${step.opacity.op}${step.opacity.value}`);
  if (step.colorGroup && !skipColorGroup) {
    if (step.colorGroup.color !== undefined) parts.push(`c="${step.colorGroup.color}"`);
    if (step.colorGroup.opacity !== undefined) parts.push(`a=${step.colorGroup.opacity}`);
    // b= Symbol Border
    const sw = step.colorGroup.symbolBorderWidth ?? step.colorGroup.strokeWidth;
    const sc = step.colorGroup.symbolBorderColor ?? step.colorGroup.strokeColor;
    const so = step.colorGroup.symbolBorderOpacity ?? step.colorGroup.strokeOpacity;
    if (sw !== undefined && sw > 0 && sc) {
      const hslM = sc.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bVal = `${sw}, ${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (so !== undefined && so < 1) bVal += `, ${so}`;
        parts.push(`b="${bVal}"`);
      }
    }
    // bc= Layer Background
    const bg = step.colorGroup.layerBackground ?? step.colorGroup.background;
    const bgO = step.colorGroup.layerBackgroundOpacity ?? step.colorGroup.backgroundOpacity;
    const bgR = step.colorGroup.layerBorderRadius ?? step.colorGroup.borderRadius;
    if (bg !== undefined) {
      const hslM = bg.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bcVal = `${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (bgO !== undefined && bgO < 1) bcVal += `, ${bgO}`;
        if (bgR) bcVal += `, ${bgR}`;
        parts.push(`bc="${bcVal}"`);
      } else {
        parts.push(`bc="${bg}"`);
      }
    }
    // bb= Layer Border
    const lbw = step.colorGroup.layerBorderWidth;
    const lbc = step.colorGroup.layerBorderColor;
    const lbo = step.colorGroup.layerBorderOpacity;
    if (lbw !== undefined && lbw > 0 && lbc) {
      const hslM = lbc.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bbVal = `${lbw}, ${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (lbo !== undefined && lbo < 1) bbVal += `, ${lbo}`;
        parts.push(`bb="${bbVal}"`);
      }
    }
  }
  return `[${parts.join(';')}]`;
}

export function stringifySpec(spec: UniCompSpec): string {
  const gridPart = spec.gridWidth === spec.gridHeight 
    ? `(${spec.gridWidth})` 
    : `(${spec.gridWidth}×${spec.gridHeight})`;
  
  // Grid-level params
  const gridParams: string[] = [];
  const STRING_PARAMS = new Set(['n', 'name', 'id', 'class', 'font', 'v']);
  
  function serializeParam(key: string, value: string | number): string {
    if (STRING_PARAMS.has(key) || (typeof value === 'string' && value.length > 1)) {
      return `${key}="${value}"`;
    }
    return `${key}=${value}`;
  }

  if (spec.id) gridParams.push(serializeParam('id', spec.id));
  if (spec.className) gridParams.push(serializeParam('class', spec.className));
  if (spec.name) gridParams.push(serializeParam('n', spec.name));
  // gc= Grid Background: "H, S%, L%, alpha, radius"
  if (spec.background) {
    const hslM = spec.background.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
    if (hslM) {
      let gcVal = `${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
      if (spec.backgroundOpacity !== undefined && spec.backgroundOpacity < 1) gcVal += `, ${spec.backgroundOpacity}`;
      if (spec.borderRadius) gcVal += `, ${spec.borderRadius}`;
      gridParams.push(`gc="${gcVal}"`);
    } else {
      gridParams.push(serializeParam('gc', spec.background));
    }
  }
  if (spec.opacity !== undefined && spec.opacity < 1) gridParams.push(`a=${spec.opacity}`);
  // gb= Grid Border: "width, H, S%, L%, alpha"
  if (spec.strokeWidth !== undefined && spec.strokeWidth > 0) {
    const hslM = spec.strokeColor?.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
    if (hslM) {
      let gbVal = `${spec.strokeWidth}, ${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
      if (spec.strokeOpacity !== undefined && spec.strokeOpacity < 1) gbVal += `, ${spec.strokeOpacity}`;
      gridParams.push(`gb="${gbVal}"`);
    } else if (spec.strokeColor) {
      gridParams.push(`gb="${spec.strokeWidth}, ${spec.strokeColor}"`);
    }
  }
  const gridParamsPart = gridParams.length > 0 ? `[${gridParams.join(';')}]` : '';

  // Build non-transform base param entries (color, opacity, flip, font, id, etc.)
  // Returns array of serialized param strings (without brackets)
  function buildBaseParamEntries(sym: SymbolSpec): string[] {
    const p: string[] = [];
    // Check if history already contains a specific param type
    const historyHas = (param: string) => sym.history?.some(step => (step as any)[param] !== undefined) ?? false;

    if (sym.color) p.push(serializeParam('c', sym.color));
    if (sym.opacity !== undefined) p.push(serializeParam('a', sym.opacity));
    if (sym.flip) p.push(serializeParam('f', sym.flip));
    if (sym.fontFamily) p.push(serializeParam('font', sym.fontFamily));
    if (sym.id) p.push(serializeParam('id', sym.id));
    if (sym.className) p.push(serializeParam('class', sym.className));
    if (sym.name) p.push(serializeParam('n', sym.name));
    // Transform params NOT already in history steps
    if (sym.rotate !== undefined && !historyHas('rotate')) p.push(serializeParam('r', sym.rotate));
    if (sym.sp && !historyHas('sp')) p.push(`sp="${sym.sp.angle},${sym.sp.force}"`);
    if (sym.st && !historyHas('st')) p.push(`st="${sym.st.angle},${sym.st.force}"`);
    if (sym.scale && !historyHas('scale')) p.push(`s=${sym.scale.x}${sym.scale.y !== sym.scale.x ? `,${sym.scale.y}` : ''}`);
    // b= Symbol Border: "width, H, S%, L%, alpha"
    if (sym.strokeWidth !== undefined && sym.strokeWidth > 0) {
      const hslM = sym.strokeColor?.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bVal = `${sym.strokeWidth}, ${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (sym.strokeOpacity !== undefined && sym.strokeOpacity < 1) bVal += `, ${sym.strokeOpacity}`;
        p.push(`b="${bVal}"`);
      } else if (sym.strokeColor) {
        p.push(`b="${sym.strokeWidth}, ${sym.strokeColor}"`);
      }
    }
    // bc= Layer Background: "H, S%, L%, alpha, radius"
    if (sym.background) {
      const hslM = sym.background.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bcVal = `${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (sym.backgroundOpacity !== undefined && sym.backgroundOpacity < 1) bcVal += `, ${sym.backgroundOpacity}`;
        if (sym.borderRadius) bcVal += `, ${sym.borderRadius}`;
        p.push(`bc="${bcVal}"`);
      } else {
        p.push(serializeParam('bc', sym.background));
      }
    }
    // bb= Layer Border: "width, H, S%, L%, alpha"
    if (sym.layerBorderWidth !== undefined && sym.layerBorderWidth > 0) {
      const hslM = sym.layerBorderColor?.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bbVal = `${sym.layerBorderWidth}, ${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (sym.layerBorderOpacity !== undefined && sym.layerBorderOpacity < 1) bbVal += `, ${sym.layerBorderOpacity}`;
        p.push(`bb="${bbVal}"`);
      } else if (sym.layerBorderColor) {
        p.push(`bb="${sym.layerBorderWidth}, ${sym.layerBorderColor}"`);
      }
    }
    return p;
  }

  const symbolsPart = spec.symbols.map(sym => {
    // If symbol has history or keyframes, serialize step blocks with base params merged into first block
    if (sym.history && sym.history.length > 0) {
      const charPart = (needsQuoting(sym.char) || sym.char.length > 1) ? `"${sym.char}"` : sym.char;
      const baseEntries = buildBaseParamEntries(sym);
      const blocks = sym.history.map((step, i) => {
        const stepStr = serializeStep(step, 'h', i === 0 && baseEntries.length > 0);
        if (i === 0 && baseEntries.length > 0) {
          // Merge base params into first h-block: [c="red";h=0;st=...]
          const inner = stepStr.slice(1, -1); // remove [ and ]
          return `[${baseEntries.join(';')};${inner}]`;
        }
        return stepStr;
      }).join('');
      if (sym.refId) return `#${sym.refId}${blocks}${sym.start}-${sym.end}`;
      if (sym.refName) return `@${sym.refName}${blocks}${sym.start}-${sym.end}`;
      if (sym.refClass) return `.${sym.refClass}${blocks}${sym.start}-${sym.end}`;
      return `${charPart}${blocks}${sym.start}-${sym.end}`;
    }
    if (sym.keyframes && sym.keyframes.length > 0) {
      const charPart = (needsQuoting(sym.char) || sym.char.length > 1) ? `"${sym.char}"` : sym.char;
      const baseEntries = buildBaseParamEntries(sym);
      const blocks = sym.keyframes.map((step, i) => {
        const stepStr = serializeStep(step, 'k', i === 0 && baseEntries.length > 0);
        if (i === 0 && baseEntries.length > 0) {
          const inner = stepStr.slice(1, -1);
          return `[${baseEntries.join(';')};${inner}]`;
        }
        return stepStr;
      }).join('');
      if (sym.refId) return `#${sym.refId}${blocks}${sym.start}-${sym.end}`;
      if (sym.refName) return `@${sym.refName}${blocks}${sym.start}-${sym.end}`;
      if (sym.refClass) return `.${sym.refClass}${blocks}${sym.start}-${sym.end}`;
      return `${charPart}${blocks}${sym.start}-${sym.end}`;
    }

    // Regular params (no history) — use new param scheme
    let params = '';
    const p: string[] = [];
    if (sym.color) p.push(serializeParam('c', sym.color));
    if (sym.opacity !== undefined) p.push(serializeParam('a', sym.opacity));
    if (sym.rotate !== undefined) p.push(serializeParam('r', sym.rotate));
    if (sym.flip) p.push(serializeParam('f', sym.flip));
    if (sym.fontFamily) p.push(serializeParam('font', sym.fontFamily));
    if (sym.id) p.push(serializeParam('id', sym.id));
    if (sym.className) p.push(serializeParam('class', sym.className));
    if (sym.name) p.push(serializeParam('n', sym.name));
    if (sym.scale) p.push(`s=${sym.scale.x}${sym.scale.y !== sym.scale.x ? `,${sym.scale.y}` : ''}`);
    if (sym.sp) p.push(`sp="${sym.sp.angle},${sym.sp.force}"`);
    if (sym.st) p.push(`st="${sym.st.angle},${sym.st.force}"`);
    if (sym.offset) p.push(`o=${sym.offset.x},${sym.offset.y}`);
    // b= Symbol Border: "width, H, S%, L%, alpha"
    if (sym.strokeWidth !== undefined && sym.strokeWidth > 0) {
      const hslM = sym.strokeColor?.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bVal = `${sym.strokeWidth}, ${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (sym.strokeOpacity !== undefined && sym.strokeOpacity < 1) bVal += `, ${sym.strokeOpacity}`;
        p.push(`b="${bVal}"`);
      } else if (sym.strokeColor) {
        p.push(`b="${sym.strokeWidth}, ${sym.strokeColor}"`);
      }
    }
    // bc= Layer Background: "H, S%, L%, alpha, radius"
    if (sym.background) {
      const hslM = sym.background.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bcVal = `${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (sym.backgroundOpacity !== undefined && sym.backgroundOpacity < 1) bcVal += `, ${sym.backgroundOpacity}`;
        if (sym.borderRadius) bcVal += `, ${sym.borderRadius}`;
        p.push(`bc="${bcVal}"`);
      } else {
        p.push(serializeParam('bc', sym.background));
      }
    }
    // bb= Layer Border: "width, H, S%, L%, alpha"
    if (sym.layerBorderWidth !== undefined && sym.layerBorderWidth > 0) {
      const hslM = sym.layerBorderColor?.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
      if (hslM) {
        let bbVal = `${sym.layerBorderWidth}, ${hslM[1]}, ${hslM[2]}%, ${hslM[3]}%`;
        if (sym.layerBorderOpacity !== undefined && sym.layerBorderOpacity < 1) bbVal += `, ${sym.layerBorderOpacity}`;
        p.push(`bb="${bbVal}"`);
      } else if (sym.layerBorderColor) {
        p.push(`bb="${sym.layerBorderWidth}, ${sym.layerBorderColor}"`);
      }
    }
    
    if (p.length > 0) params = `[${p.join(';')}]`;
    
    if (sym.refId) return `#${sym.refId}${params}${sym.start}-${sym.end}`;
    if (sym.refName) return `@${sym.refName}${params}${sym.start}-${sym.end}`;
    if (sym.refClass) return `.${sym.refClass}${params}${sym.start}-${sym.end}`;
    
    const charPart = (needsQuoting(sym.char) || sym.char.length > 1) ? `"${sym.char}"` : sym.char;
    return `${charPart}${params}${sym.start}-${sym.end}`;
  }).join(';');

  return `${gridPart}${gridParamsPart}:${symbolsPart}`;
}

export function getRect(start: number, end: number, gridWidth: number) {
  const x1 = start % gridWidth;
  const y1 = Math.floor(start / gridWidth);
  const x2 = end % gridWidth;
  const y2 = Math.floor(end / gridWidth);

  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
    width: Math.abs(x2 - x1) + 1,
    height: Math.abs(y2 - y1) + 1,
  };
}

export function linearToCoords(index: number, gridWidth: number) {
  return {
    x: index % gridWidth,
    y: Math.floor(index / gridWidth),
  };
}

export function symbolToCoords(sym: { char: string; start: number; end: number }, gridWidth: number) {
  const x = sym.start % gridWidth;
  const y = Math.floor(sym.start / gridWidth);
  const ex = sym.end % gridWidth;
  const ey = Math.floor(sym.end / gridWidth);
  return { x, y, w: ex - x + 1, h: ey - y + 1 };
}

export function coordsToSymbolIndices(coords: { x: number; y: number; w: number; h: number }, gridWidth: number) {
  const start = coords.y * gridWidth + coords.x;
  const end = (coords.y + coords.h - 1) * gridWidth + (coords.x + coords.w - 1);
  return { start, end };
}

/**
 * Compute accumulated (resolved) values from history steps.
 * Applies deltas sequentially: = sets, += adds, -= subtracts.
 */
export function resolveHistory(steps: HistoryStep[]): {
  st?: { angle: number; force: number };
  sp?: { angle: number; force: number };
  rotate?: number;
  scale?: { x: number; y: number };
  offset?: { x: number; y: number };
  d?: { x: number; y: number }; // bounds: x=w, y=h
  me?: MoveExpand;
  se?: ScaleExpand;
  colorGroup?: DeltaColor;
} {
  let st: { angle: number; force: number } | undefined;
  let sp: { angle: number; force: number } | undefined;
  let rotate: number | undefined;
  let scale: { x: number; y: number } | undefined;
  let offset: { x: number; y: number } | undefined;
  let d: { x: number; y: number } | undefined;
  let me: MoveExpand | undefined;
  let se: ScaleExpand | undefined;
  let colorGroup: DeltaColor | undefined;

  for (const step of steps) {
    if (step.st) {
      if (step.st.op === '=' || !st) {
        st = { angle: step.st.angle, force: step.st.force };
      } else if (step.st.op === '+=') {
        st = { angle: st.angle + step.st.angle, force: st.force + step.st.force };
      } else if (step.st.op === '-=') {
        st = { angle: st.angle - step.st.angle, force: st.force - step.st.force };
      }
    }
    if (step.sp) {
      if (step.sp.op === '=' || !sp) {
        sp = { angle: step.sp.angle, force: step.sp.force };
      } else if (step.sp.op === '+=') {
        sp = { angle: sp.angle + step.sp.angle, force: sp.force + step.sp.force };
      } else if (step.sp.op === '-=') {
        sp = { angle: sp.angle - step.sp.angle, force: sp.force - step.sp.force };
      }
    }
    if (step.rotate) {
      if (step.rotate.op === '=' || rotate === undefined) {
        rotate = step.rotate.value;
      } else if (step.rotate.op === '+=') {
        rotate = rotate + step.rotate.value;
      } else if (step.rotate.op === '-=') {
        rotate = rotate - step.rotate.value;
      }
    }
    if (step.scale) {
      if (step.scale.op === '=' || !scale) {
        scale = { x: step.scale.x, y: step.scale.y };
      } else if (step.scale.op === '+=') {
        scale = { x: (scale?.x ?? 1) + step.scale.x, y: (scale?.y ?? 1) + step.scale.y };
      } else if (step.scale.op === '-=') {
        scale = { x: (scale?.x ?? 1) - step.scale.x, y: (scale?.y ?? 1) - step.scale.y };
      }
    }
    if (step.offset) {
      if (step.offset.op === '=' || !offset) {
        offset = { x: step.offset.x, y: step.offset.y };
      } else if (step.offset.op === '+=') {
        offset = { x: (offset?.x ?? 0) + step.offset.x, y: (offset?.y ?? 0) + step.offset.y };
      } else if (step.offset.op === '-=') {
        offset = { x: (offset?.x ?? 0) - step.offset.x, y: (offset?.y ?? 0) - step.offset.y };
      }
    }
    if (step.d) {
      if (step.d.op === '=' || !d) {
        d = { x: step.d.x, y: step.d.y };
      } else if (step.d.op === '+=') {
        d = { x: (d?.x ?? 0) + step.d.x, y: (d?.y ?? 0) + step.d.y };
      } else if (step.d.op === '-=') {
        d = { x: (d?.x ?? 0) - step.d.x, y: (d?.y ?? 0) - step.d.y };
      }
    }
    if (step.colorGroup) {
      // Color is always absolute replace (op='='), no deltas
      colorGroup = { ...step.colorGroup };
    }
    // me/se are additive (accumulate expansions)
    if (step.me) {
      if (!me) me = { el: step.me.el, et: step.me.et };
      else { me = { el: me.el + step.me.el, et: me.et + step.me.et }; }
    }
    if (step.se) {
      if (!se) se = { sl: step.se.sl, st: step.se.st };
      else { se = { sl: se.sl + step.se.sl, st: se.st + step.se.st }; }
    }
  }
  return { st, sp, rotate, scale, offset, d, me, se, colorGroup };
}

/**
 * Append a transformation to a symbol's history.
 * If no history exists, creates h=0 with absolute values.
 * If history exists, appends h=N+1 with delta relative to accumulated.
 */
export function appendTransformToHistory(
  sym: SymbolSpec,
  paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup',
  newValue: { angle: number; force: number } | number | { x: number; y: number } | DeltaColor,
): void {
  if (!sym.history) sym.history = [];

  const nextIndex = sym.history.length > 0 ? Math.max(...sym.history.map(s => s.index)) + 1 : 0;

  if (paramType === 'colorGroup') {
    // Color group is always stored as absolute snapshot (op='=')
    const colorVal = newValue as DeltaColor;
    const step: HistoryStep = { index: nextIndex, colorGroup: { ...colorVal, op: '=' } };
    sym.history.push(step);
    // Apply to sym — map new field names to SymbolSpec fields
    if (colorVal.color !== undefined) sym.color = colorVal.color;
    // b= symbol border
    if (colorVal.symbolBorderColor !== undefined) sym.strokeColor = colorVal.symbolBorderColor;
    if (colorVal.symbolBorderWidth !== undefined) sym.strokeWidth = colorVal.symbolBorderWidth;
    if (colorVal.symbolBorderOpacity !== undefined) sym.strokeOpacity = colorVal.symbolBorderOpacity;
    // Legacy compat
    if (colorVal.strokeColor !== undefined) sym.strokeColor = colorVal.strokeColor;
    if (colorVal.strokeWidth !== undefined) sym.strokeWidth = colorVal.strokeWidth;
    if (colorVal.strokeOpacity !== undefined) sym.strokeOpacity = colorVal.strokeOpacity;
    // bc= layer background
    if (colorVal.layerBackground !== undefined) sym.background = colorVal.layerBackground;
    if (colorVal.layerBackgroundOpacity !== undefined) sym.backgroundOpacity = colorVal.layerBackgroundOpacity;
    if (colorVal.layerBorderRadius !== undefined) sym.borderRadius = colorVal.layerBorderRadius;
    // Legacy compat
    if (colorVal.background !== undefined) sym.background = colorVal.background;
    if (colorVal.backgroundOpacity !== undefined) sym.backgroundOpacity = colorVal.backgroundOpacity;
    if (colorVal.borderRadius !== undefined) sym.borderRadius = colorVal.borderRadius;
    // bb= layer border
    if (colorVal.layerBorderWidth !== undefined) sym.layerBorderWidth = colorVal.layerBorderWidth;
    if (colorVal.layerBorderColor !== undefined) sym.layerBorderColor = colorVal.layerBorderColor;
    if (colorVal.layerBorderOpacity !== undefined) sym.layerBorderOpacity = colorVal.layerBorderOpacity;
    if (colorVal.opacity !== undefined) sym.opacity = colorVal.opacity;
    return;
  }

  if (nextIndex === 0) {
    const step: HistoryStep = { index: 0 };
    if (paramType === 'st' && typeof newValue === 'object' && 'angle' in newValue) {
      step.st = { op: '=', angle: (newValue as any).angle, force: (newValue as any).force };
      sym.st = { angle: (newValue as any).angle, force: (newValue as any).force };
    } else if (paramType === 'sp' && typeof newValue === 'object' && 'angle' in newValue) {
      step.sp = { op: '=', angle: (newValue as any).angle, force: (newValue as any).force };
      sym.sp = { angle: (newValue as any).angle, force: (newValue as any).force };
    } else if (paramType === 'rotate' && typeof newValue === 'number') {
      step.rotate = { op: '=', value: newValue };
      sym.rotate = newValue;
    } else if (paramType === 'scale' && typeof newValue === 'object' && 'x' in newValue) {
      step.scale = { op: '=', x: (newValue as any).x, y: (newValue as any).y };
      sym.scale = { x: (newValue as any).x, y: (newValue as any).y };
    } else if (paramType === 'offset' && typeof newValue === 'object' && 'x' in newValue) {
      step.offset = { op: '=', x: (newValue as any).x, y: (newValue as any).y };
      sym.offset = { x: (newValue as any).x, y: (newValue as any).y };
    } else if (paramType === 'd' && typeof newValue === 'object' && 'x' in newValue) {
      step.d = { op: '=', x: (newValue as any).x, y: (newValue as any).y };
      sym.bounds = { w: (newValue as any).x, h: (newValue as any).y };
    }
    sym.history.push(step);
  } else {
    const accumulated = resolveHistory(sym.history);
    const step: HistoryStep = { index: nextIndex };
    if (paramType === 'st' && typeof newValue === 'object' && 'angle' in newValue) {
      const prev = accumulated.st || { angle: 0, force: 0 };
      step.st = { op: '+=', angle: (newValue as any).angle - prev.angle, force: (newValue as any).force - prev.force };
      sym.st = { angle: (newValue as any).angle, force: (newValue as any).force };
    } else if (paramType === 'sp' && typeof newValue === 'object' && 'angle' in newValue) {
      const prev = accumulated.sp || { angle: 0, force: 0 };
      step.sp = { op: '+=', angle: (newValue as any).angle - prev.angle, force: (newValue as any).force - prev.force };
      sym.sp = { angle: (newValue as any).angle, force: (newValue as any).force };
    } else if (paramType === 'rotate' && typeof newValue === 'number') {
      const prev = accumulated.rotate ?? 0;
      step.rotate = { op: '+=', value: newValue - prev };
      sym.rotate = newValue;
    } else if (paramType === 'scale' && typeof newValue === 'object' && 'x' in newValue) {
      const prev = accumulated.scale || { x: 1, y: 1 };
      step.scale = { op: '+=', x: (newValue as any).x - prev.x, y: (newValue as any).y - prev.y };
      sym.scale = { x: (newValue as any).x, y: (newValue as any).y };
    } else if (paramType === 'offset' && typeof newValue === 'object' && 'x' in newValue) {
      const prev = accumulated.offset || { x: 0, y: 0 };
      step.offset = { op: '+=', x: (newValue as any).x - prev.x, y: (newValue as any).y - prev.y };
      sym.offset = { x: (newValue as any).x, y: (newValue as any).y };
    } else if (paramType === 'd' && typeof newValue === 'object' && 'x' in newValue) {
      const prev = accumulated.d || { x: 0, y: 0 };
      step.d = { op: '+=', x: (newValue as any).x - prev.x, y: (newValue as any).y - prev.y };
      sym.bounds = { w: (newValue as any).x, h: (newValue as any).y };
    }
    sym.history.push(step);
  }
}

/**
 * Remove a specific parameter from the last history block where it appears.
 * If the block becomes empty (no params), remove the block entirely.
 * Returns true if something was removed.
 */
export function undoLastHistoryParam(
  sym: SymbolSpec,
  paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup',
): boolean {
  if (!sym.history || sym.history.length === 0) {
    if (paramType === 'st') { if (sym.st) { sym.st = undefined; return true; } }
    if (paramType === 'sp') { if (sym.sp) { sym.sp = undefined; return true; } }
    if (paramType === 'rotate') { if (sym.rotate !== undefined) { sym.rotate = undefined; return true; } }
    if (paramType === 'scale') { if (sym.scale) { sym.scale = undefined; return true; } }
    if (paramType === 'offset') { if (sym.offset) { sym.offset = undefined; return true; } }
    if (paramType === 'd') { if (sym.bounds) { sym.bounds = undefined; return true; } }
    if (paramType === 'colorGroup') {
      let changed = false;
      if (sym.color) { sym.color = undefined; changed = true; }
      if (sym.background) { sym.background = undefined; changed = true; }
      if (sym.strokeColor) { sym.strokeColor = undefined; changed = true; }
      if (sym.strokeWidth) { sym.strokeWidth = undefined; changed = true; }
      if (sym.strokeOpacity !== undefined) { sym.strokeOpacity = undefined; changed = true; }
      return changed;
    }
    return false;
  }

  for (let i = sym.history.length - 1; i >= 0; i--) {
    const step = sym.history[i];
    const hasParam = (paramType === 'st' && step.st) ||
                     (paramType === 'sp' && step.sp) ||
                     (paramType === 'rotate' && step.rotate) ||
                     (paramType === 'scale' && step.scale) ||
                     (paramType === 'offset' && step.offset) ||
                     (paramType === 'd' && step.d) ||
                     (paramType === 'colorGroup' && step.colorGroup);
    if (!hasParam) continue;

    if (paramType === 'st') step.st = undefined;
    if (paramType === 'sp') step.sp = undefined;
    if (paramType === 'rotate') step.rotate = undefined;
    if (paramType === 'scale') step.scale = undefined;
    if (paramType === 'offset') step.offset = undefined;
    if (paramType === 'd') step.d = undefined;
    if (paramType === 'colorGroup') step.colorGroup = undefined;

    if (!step.st && !step.sp && !step.rotate && !step.scale && !step.offset && !step.d && !step.me && !step.se && !step.opacity && !step.colorGroup) {
      sym.history.splice(i, 1);
    }

    sym.history.forEach((s, idx) => s.index = idx);

    if (sym.history.length === 0) {
      sym.history = undefined;
      sym.st = undefined; sym.sp = undefined; sym.rotate = undefined; sym.scale = undefined; sym.offset = undefined; sym.bounds = undefined;
      sym.color = undefined; sym.background = undefined; sym.strokeColor = undefined; sym.strokeWidth = undefined; sym.strokeOpacity = undefined;
      sym.layerBorderWidth = undefined; sym.layerBorderColor = undefined; sym.layerBorderOpacity = undefined;
      sym.backgroundOpacity = undefined; sym.borderRadius = undefined;
    } else {
      const resolved = resolveHistory(sym.history);
      sym.st = resolved.st;
      sym.sp = resolved.sp;
      sym.rotate = resolved.rotate;
      sym.scale = resolved.scale;
      sym.offset = resolved.offset;
      sym.bounds = resolved.d ? { w: resolved.d.x, h: resolved.d.y } : undefined;
      if (resolved.colorGroup) {
        sym.color = resolved.colorGroup.color;
        sym.background = resolved.colorGroup.background ?? resolved.colorGroup.layerBackground;
        sym.backgroundOpacity = resolved.colorGroup.backgroundOpacity ?? resolved.colorGroup.layerBackgroundOpacity;
        sym.borderRadius = resolved.colorGroup.borderRadius ?? resolved.colorGroup.layerBorderRadius;
        sym.strokeColor = resolved.colorGroup.strokeColor ?? resolved.colorGroup.symbolBorderColor;
        sym.strokeWidth = resolved.colorGroup.strokeWidth ?? resolved.colorGroup.symbolBorderWidth;
        sym.strokeOpacity = resolved.colorGroup.strokeOpacity ?? resolved.colorGroup.symbolBorderOpacity;
        sym.layerBorderWidth = resolved.colorGroup.layerBorderWidth;
        sym.layerBorderColor = resolved.colorGroup.layerBorderColor;
        sym.layerBorderOpacity = resolved.colorGroup.layerBorderOpacity;
        if (resolved.colorGroup.opacity !== undefined) sym.opacity = resolved.colorGroup.opacity;
      } else if (paramType === 'colorGroup') {
        sym.color = undefined; sym.background = undefined;
        sym.backgroundOpacity = undefined; sym.borderRadius = undefined;
        sym.strokeColor = undefined; sym.strokeWidth = undefined; sym.strokeOpacity = undefined;
        sym.layerBorderWidth = undefined; sym.layerBorderColor = undefined; sym.layerBorderOpacity = undefined;
      }
    }
    return true;
  }
  return false;
}

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('#') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('--') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--') ||
    trimmed.startsWith("'''") ||
    trimmed.startsWith('"""')
  );
}
