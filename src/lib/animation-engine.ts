/**
 * Animation engine for UniComp keyframe animations (k= parameter).
 * 
 * All layers (symbols) play simultaneously in parallel.
 * Each layer loops independently within the global animation cycle.
 * Global cycle duration = max of all layer durations.
 * Shorter layers repeat from the beginning while longer layers continue.
 */

import { UniCompSpec, SymbolSpec, KeyframeStep, HistoryStep, resolveHistory } from './unicomp-parser';

// ============================================================================
// TYPES
// ============================================================================

export interface KeyframeGroup {
  keyframeIndex: number;
  duration: number; // seconds for transition TO this state (0 for first keyframe)
  steps: HistoryStep[]; // all steps (k= block + h= sub-steps) for this group
}

export interface ResolvedKeyframe {
  duration: number;
  st?: { angle: number; force: number };
  sp?: { angle: number; force: number };
  rotate?: number;
  scale?: { x: number; y: number };
  offset?: { x: number; y: number };
  d?: { w: number; h: number };
  opacity?: number;
}

// ============================================================================
// GROUPING
// ============================================================================

/**
 * Group keyframe steps into keyframe groups.
 * A new group starts when a step has `duration` defined (k= block).
 * Steps without duration (h= blocks) belong to the preceding k= group.
 */
export function groupKeyframes(steps: KeyframeStep[]): KeyframeGroup[] {
  const groups: KeyframeGroup[] = [];
  let currentGroup: KeyframeGroup | null = null;

  for (const step of steps) {
    const isKBlock = 'duration' in step && step.duration !== undefined;

    if (isKBlock || !currentGroup) {
      currentGroup = {
        keyframeIndex: groups.length,
        duration: isKBlock ? step.duration : 0,
        steps: [step],
      };
      groups.push(currentGroup);
    } else {
      currentGroup.steps.push(step);
    }
  }

  return groups;
}

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolve each keyframe group's accumulated state.
 * Each keyframe's state is cumulative from ALL steps from the beginning up to
 * and including that group's steps.
 */
export function resolveKeyframeGroups(groups: KeyframeGroup[]): ResolvedKeyframe[] {
  const allSteps: HistoryStep[] = [];
  return groups.map(group => {
    allSteps.push(...group.steps);
    const resolved = resolveHistory(allSteps);
    return {
      duration: group.duration,
      st: resolved.st,
      sp: resolved.sp,
      rotate: resolved.rotate,
      scale: resolved.scale,
      offset: resolved.offset,
      d: resolved.d ? { w: resolved.d.x, h: resolved.d.y } : undefined,
    };
  });
}

// ============================================================================
// INTERPOLATION
// ============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Linearly interpolate between two resolved keyframe states.
 */
export function interpolateKeyframeState(
  from: ResolvedKeyframe,
  to: ResolvedKeyframe,
  t: number,
): Partial<SymbolSpec> {
  const result: Partial<SymbolSpec> = {};

  // Interpolate st (trapezoid)
  if (from.st || to.st) {
    const fst = from.st || { angle: 0, force: 0 };
    const tst = to.st || { angle: 0, force: 0 };
    result.st = {
      angle: lerp(fst.angle, tst.angle, t),
      force: lerp(fst.force, tst.force, t),
    };
  }

  // Interpolate sp (parallelogram)
  if (from.sp || to.sp) {
    const fsp = from.sp || { angle: 0, force: 0 };
    const tsp = to.sp || { angle: 0, force: 0 };
    result.sp = {
      angle: lerp(fsp.angle, tsp.angle, t),
      force: lerp(fsp.force, tsp.force, t),
    };
  }

  // Interpolate rotation
  if (from.rotate !== undefined || to.rotate !== undefined) {
    result.rotate = lerp(from.rotate ?? 0, to.rotate ?? 0, t);
  }

  // Interpolate scale
  if (from.scale || to.scale) {
    const fs = from.scale || { x: 1, y: 1 };
    const ts = to.scale || { x: 1, y: 1 };
    result.scale = {
      x: lerp(fs.x, ts.x, t),
      y: lerp(fs.y, ts.y, t),
    };
  }

  // Interpolate offset (o=)
  if (from.offset || to.offset) {
    const fo = from.offset || { x: 0, y: 0 };
    const to_ = to.offset || { x: 0, y: 0 };
    result.offset = {
      x: lerp(fo.x, to_.x, t),
      y: lerp(fo.y, to_.y, t),
    };
  }

  // Interpolate bounds (d=)
  if (from.d || to.d) {
    const fd = from.d || { w: 1, h: 1 };
    const td = to.d || { w: 1, h: 1 };
    result.bounds = {
      w: lerp(fd.w, td.w, t),
      h: lerp(fd.h, td.h, t),
    };
  }

  // Interpolate opacity
  if (from.opacity !== undefined || to.opacity !== undefined) {
    result.opacity = lerp(from.opacity ?? 1, to.opacity ?? 1, t);
  }

  return result;
}

// ============================================================================
// HELPER: animate a single symbol at a given time, looping independently
// ============================================================================

function animateSymbol(sym: SymbolSpec, elapsedSeconds: number): SymbolSpec {
  if (!sym.keyframes || sym.keyframes.length < 2) return sym;

  const groups = groupKeyframes(sym.keyframes);
  if (groups.length < 2) return sym;

  const resolved = resolveKeyframeGroups(groups);

  // Calculate total animation duration (sum of all transitions except first)
  let totalDuration = 0;
  for (let i = 1; i < resolved.length; i++) {
    totalDuration += resolved[i].duration;
  }

  if (totalDuration <= 0) return sym;

  // Loop the animation independently
  const loopedTime = elapsedSeconds % totalDuration;

  // Find which transition segment we're in
  let accumulated = 0;
  for (let i = 1; i < resolved.length; i++) {
    const segDuration = resolved[i].duration;
    if (loopedTime <= accumulated + segDuration) {
      const segProgress = segDuration > 0 ? (loopedTime - accumulated) / segDuration : 1;
      const interpolated = interpolateKeyframeState(resolved[i - 1], resolved[i], segProgress);
      return { ...sym, ...interpolated };
    }
    accumulated += segDuration;
  }

  // At the end, return last keyframe state
  const last = resolved[resolved.length - 1];
  return {
    ...sym,
    st: last.st,
    sp: last.sp,
    rotate: last.rotate,
    scale: last.scale,
    offset: last.offset,
    bounds: last.d ? { w: last.d.w, h: last.d.h } : undefined,
    opacity: last.opacity,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a spec contains any keyframe animations.
 */
export function hasKeyframes(spec: UniCompSpec | null): boolean {
  if (!spec) return false;
  return spec.symbols.some(sym => sym.keyframes && sym.keyframes.length >= 2);
}

/**
 * Compute the total duration of a single symbol's keyframe animation.
 */
function getSymbolDuration(sym: SymbolSpec): number {
  if (!sym.keyframes || sym.keyframes.length < 2) return 0;
  const groups = groupKeyframes(sym.keyframes);
  if (groups.length < 2) return 0;
  const resolved = resolveKeyframeGroups(groups);
  let total = 0;
  for (let i = 1; i < resolved.length; i++) {
    total += resolved[i].duration;
  }
  return total;
}

/**
 * Produce an animated UniCompSpec at a given elapsed time.
 * 
 * ALL layers play simultaneously in parallel.
 * Each layer loops its own keyframes independently.
 * Global loop = max duration across all layers.
 * Shorter layers repeat within the global cycle.
 */
export function getAnimatedSpec(
  spec: UniCompSpec,
  elapsedSeconds: number,
): UniCompSpec {
  // Compute global duration = max of all symbol durations
  let globalDuration = 0;
  for (const sym of spec.symbols) {
    const d = getSymbolDuration(sym);
    if (d > globalDuration) globalDuration = d;
  }

  if (globalDuration <= 0) return spec;

  // Global loop time — all layers restart together at this boundary
  const globalLoopedTime = elapsedSeconds % globalDuration;

  // Each symbol animates independently using the same globalLoopedTime
  // Symbols with shorter durations will loop within the global cycle
  const newSymbols = spec.symbols.map(sym => animateSymbol(sym, globalLoopedTime));

  return { ...spec, symbols: newSymbols };
}
