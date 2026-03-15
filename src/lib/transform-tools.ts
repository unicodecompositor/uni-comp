/**
 * transform-tools.ts
 * 
 * Pure functions for computing st (trapezoid) and sp (parallelogram)
 * deformation parameters from user gestures.
 * 
 * ARCHITECTURE:
 * 1. User drags from selection center → screenAngleDeg, distance
 * 2. This module converts to shader-space angle (Y-flip only)
 * 3. SuperTransformer.ts receives angle/force and deforms the ALREADY-RENDERED
 *    pixel data (which already has rotate/flip applied via renderSpecToOffscreen)
 * 
 * CRITICAL: Do NOT add rotate/flip compensation here!
 * The GPU shader operates on pre-rendered pixels that already include
 * the symbol's rotate and flip transforms.
 * 
 * COORDINATE SYSTEMS:
 * - Screen: Y-down, angle 0° = right, 90° = down (atan2 convention)
 * - Shader: Y-up (p.y = -p.y in shader), angle 0° = right, 90° = up
 * - Conversion: shaderAngle = -screenAngle
 */

// ─── Shared utilities ────────────────────────────────────────────

/** Normalize angle to [0, 360) */
export function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Clamp force to non-negative integer */
export function clampForce(value: number): number {
  return Math.max(0, Math.round(value));
}

/**
 * Stable screen angle with smoothing to prevent jitter.
 * Returns degrees in screen space (Y-down).
 */
export function resolveScreenAngle(
  clientX: number,
  clientY: number,
  centerX: number,
  centerY: number,
  previousAngle: number | null,
): number {
  const raw = (Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI;
  if (previousAngle === null) return raw;

  const delta = ((raw - previousAngle + 540) % 360) - 180;
  return previousAngle + delta * 0.35;
}

// ─── Trapezoid (st) ─────────────────────────────────────────────

export interface TaperGestureInput {
  clientX: number;
  clientY: number;
  centerX: number;
  centerY: number;
  selRadius: number;
  previousScreenAngle: number | null;
}

export interface TaperResult {
  /** Angle in shader space (Y-up), degrees */
  angle: number;
  /** Deformation intensity, 0+ */
  force: number;
  /** Raw screen angle for storing as previousAngle */
  screenAngle: number;
}

/**
 * Compute trapezoid (st) parameters from a drag gesture.
 * The narrowing/widening axis follows the drag direction.
 */
export function computeTaper(input: TaperGestureInput): TaperResult {
  const screenAngle = resolveScreenAngle(
    input.clientX, input.clientY,
    input.centerX, input.centerY,
    input.previousScreenAngle,
  );

  // Screen angle maps directly to shader taper axis.
  // No negation needed: horizontal (0°/180°) is symmetric, 
  // and vertical must NOT be flipped (confirmed by user testing).
  const shaderAngle = normalizeDegrees(screenAngle);

  const dist = Math.hypot(input.clientX - input.centerX, input.clientY - input.centerY);
  const force = clampForce((dist / input.selRadius) * 100);

  return { angle: Math.round(shaderAngle), force, screenAngle };
}

// ─── Parallelogram (sp) ─────────────────────────────────────────

export interface ShearGestureInput {
  clientX: number;
  clientY: number;
  centerX: number;
  centerY: number;
  selRadius: number;
  previousScreenAngle: number | null;
}

export interface ShearResult {
  /** Angle in shader space (Y-up), degrees */
  angle: number;
  /** Deformation intensity, 0+ */
  force: number;
  /** Raw screen angle for storing as previousAngle */
  screenAngle: number;
}

/**
 * Compute parallelogram (sp) parameters from a drag gesture.
 * The shear axis follows the drag direction.
 */
export function computeShear(input: ShearGestureInput): ShearResult {
  const screenAngle = resolveScreenAngle(
    input.clientX, input.clientY,
    input.centerX, input.centerY,
    input.previousScreenAngle,
  );

  // Same as taper: no Y-negation, screen angle maps directly to shader.
  const shaderAngle = normalizeDegrees(screenAngle);

  const dist = Math.hypot(input.clientX - input.centerX, input.clientY - input.centerY);
  const force = clampForce((dist / input.selRadius) * 100);

  return { angle: Math.round(shaderAngle), force, screenAngle };
}
