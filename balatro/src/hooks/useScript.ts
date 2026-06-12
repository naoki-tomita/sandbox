import { useEffect, useRef } from 'react';

export type Wait = (ms: number) => Promise<void>;

/**
 * Runs a presentation script once on mount. The script expresses the order
 * of its beats as plain sequential code, pausing with `wait(ms)` between
 * them. Unmounting stops the script: the pending wait never resolves, so
 * no later beat can fire.
 */
export function useScript(script: (wait: Wait) => Promise<void>): void {
  const scriptRef = useRef(script);
  scriptRef.current = script;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const wait: Wait = ms => new Promise(resolve => {
      timer = setTimeout(() => { if (alive) resolve(); }, ms);
    });

    void scriptRef.current(wait);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
}
