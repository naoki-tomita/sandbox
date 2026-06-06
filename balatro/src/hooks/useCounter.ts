import { useState, useEffect, useRef } from 'react';

export function useCounter(target: number, duration = 700): number {
  const prevRef = useRef(target);
  const [value, setValue] = useState(target);

  useEffect(() => {
    const start = prevRef.current;
    if (start === target) return;

    const startTime = performance.now();
    let rafId: number;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + eased * (target - start)));
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return value;
}
