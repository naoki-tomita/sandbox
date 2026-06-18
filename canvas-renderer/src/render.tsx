import type { ReactNode } from 'react';
import { dispatch, updateHover } from './events';
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, layoutTree } from './layout';
import { fontString, paintTree } from './paint';
import { type Container, CanvasReconciler } from './reconciler';
import {
  type CanvasNode,
  type MeasureText,
  type Style,
  TEXT_NODE,
} from './types';

export interface RenderOptions {
  /** Background painted before the tree. Defaults to transparent. */
  background?: string;
  /** Device pixel ratio. Defaults to `window.devicePixelRatio || 1`. */
  pixelRatio?: number;
}

export interface CanvasRoot {
  /** Re-render with a new element tree. */
  render(element: ReactNode): void;
  /** Tear down the reconciler and detach event listeners. */
  unmount(): void;
}

/** Wraps the whole tree in a synthetic root `cr-view` filling the viewport. */
function makeRootNode(width: number, height: number): CanvasNode {
  return {
    type: 'cr-view',
    props: { style: { width, height } },
    parent: null,
    children: [],
    layout: { x: 0, y: 0, width, height },
  };
}

/**
 * Renders a React element tree onto a `<canvas>`, replacing react-dom.
 * Returns a handle to update or unmount the tree.
 */
export function render(
  element: ReactNode,
  canvas: HTMLCanvasElement,
  options: RenderOptions = {},
): CanvasRoot {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-renderer: 2D context unavailable');

  const dpr = options.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  let cssWidth = 0;
  let cssHeight = 0;

  const resize = () => {
    cssWidth = canvas.clientWidth || canvas.width || 0;
    cssHeight = canvas.clientHeight || canvas.height || 0;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  };
  resize();

  // Text measurement reuses the live 2D context.
  const measureText: MeasureText = (text, style: Style) => {
    ctx.font = fontString(style);
    const width = text ? ctx.measureText(text).width : 0;
    const height = (style.fontSize ?? DEFAULT_FONT_SIZE) * (style.lineHeight ?? DEFAULT_LINE_HEIGHT);
    return { width, height };
  };

  // Image cache. A miss kicks off a load and repaints on completion.
  const images = new Map<string, HTMLImageElement | null>();
  const getImage = (src: string): CanvasImageSource | null => {
    const cached = images.get(src);
    if (cached !== undefined) return cached && cached.complete ? cached : null;
    const img = new Image();
    images.set(src, null);
    img.onload = () => {
      images.set(src, img);
      schedule();
    };
    img.src = src;
    return null;
  };

  const rootNode = makeRootNode(cssWidth, cssHeight);

  let frame = 0;
  const draw = () => {
    frame = 0;
    rootNode.layout = { x: 0, y: 0, width: cssWidth, height: cssHeight };
    rootNode.props.style = { width: cssWidth, height: cssHeight };
    layoutTree(rootNode, cssWidth, cssHeight, measureText);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    } else {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
    }
    // Paint the synthetic root's children directly (root itself is invisible).
    for (const child of rootNode.children) {
      paintTree(ctx, child, cssWidth, cssHeight, getImage);
    }
    ctx.restore();
  };

  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;

  const schedule = () => {
    if (frame) return;
    frame = raf(draw);
  };

  // The reconciler container shares `rootNode.children`.
  const container: Container = {
    children: rootNode.children,
    onCommit: schedule,
  };

  // ---- Pointer events -------------------------------------------------------
  const toLocal = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * cssWidth,
      y: ((e.clientY - rect.top) / rect.height) * cssHeight,
    };
  };

  let hovered: CanvasNode | null = null;
  const onClick = (e: MouseEvent) => {
    const { x, y } = toLocal(e);
    dispatch(rootNode, 'click', x, y);
  };
  const onDown = (e: MouseEvent) => {
    const { x, y } = toLocal(e);
    dispatch(rootNode, 'pointerdown', x, y);
  };
  const onUp = (e: MouseEvent) => {
    const { x, y } = toLocal(e);
    dispatch(rootNode, 'pointerup', x, y);
  };
  const onMove = (e: MouseEvent) => {
    const { x, y } = toLocal(e);
    dispatch(rootNode, 'pointermove', x, y);
    hovered = updateHover(rootNode, hovered, x, y);
  };

  canvas.addEventListener('click', onClick);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);

  const onResize = () => {
    resize();
    schedule();
  };
  if (typeof window !== 'undefined') window.addEventListener('resize', onResize);

  const fiberRoot = CanvasReconciler.createContainer(
    container,
    0, // LegacyRoot for predictable synchronous updates
    null,
    false,
    null,
    'cr',
    (err: unknown) => console.error(err),
    null,
  );

  CanvasReconciler.updateContainer(element, fiberRoot, null, () => {});

  return {
    render(next: ReactNode) {
      CanvasReconciler.updateContainer(next, fiberRoot, null, () => {});
    },
    unmount() {
      CanvasReconciler.updateContainer(null, fiberRoot, null, () => {});
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onMove);
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
      if (frame) {
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
        frame = 0;
      }
    },
  };
}

// Re-export so `#text` consumers and tests can reference the marker.
export { TEXT_NODE };
