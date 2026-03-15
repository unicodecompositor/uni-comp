import { useState, useCallback, useRef, useEffect } from 'react';
import { UniCompSpec } from '@/lib/unicomp-parser';
import { hasKeyframes, getAnimatedSpec } from '@/lib/animation-engine';

export function useKeyframeAnimation(spec: UniCompSpec | null) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [animatedSpec, setAnimatedSpec] = useState<UniCompSpec | null>(null);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const specRef = useRef(spec);
  specRef.current = spec;

  const specHasKeyframes = hasKeyframes(spec);

  // Stop when keyframes removed
  useEffect(() => {
    if (!specHasKeyframes) {
      setIsPlaying(false);
      setAnimatedSpec(null);
    }
  }, [specHasKeyframes]);

  useEffect(() => {
    if (!isPlaying || !specRef.current) {
      setAnimatedSpec(null);
      return;
    }

    startTimeRef.current = performance.now();

    const animate = () => {
      const current = specRef.current;
      if (!current) return;
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      const newSpec = getAnimatedSpec(current, elapsed);
      setAnimatedSpec(newSpec);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    setIsPlaying(p => !p);
  }, []);

  return {
    isPlaying,
    specHasKeyframes,
    animatedSpec,
    togglePlay,
  };
}
