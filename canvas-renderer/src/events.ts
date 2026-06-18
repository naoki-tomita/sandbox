import {
  type CanvasNode,
  type CanvasPointerEvent,
  type EventProps,
  type PointerHandler,
  TEXT_NODE,
} from './types';

function contains(node: CanvasNode, x: number, y: number): boolean {
  const { x: bx, y: by, width, height } = node.layout;
  return x >= bx && x <= bx + width && y >= by && y <= by + height;
}

/**
 * Returns the hit path from the root down to the topmost (last-painted) node
 * under the point. The last entry is the deepest/topmost node. Empty if the
 * point misses the root.
 */
export function hitPath(root: CanvasNode, x: number, y: number): CanvasNode[] {
  if (!contains(root, x, y)) return [];
  const path: CanvasNode[] = [root];

  let current = root;
  // Walk down, preferring later siblings (painted on top).
  for (;;) {
    let next: CanvasNode | null = null;
    for (const child of current.children) {
      if (child.type === TEXT_NODE) continue;
      if (contains(child, x, y)) next = child; // keep last match = topmost
    }
    if (!next) break;
    path.push(next);
    current = next;
  }
  return path;
}

const HANDLER_KEYS: Record<string, keyof EventProps> = {
  click: 'onClick',
  pointerdown: 'onPointerDown',
  pointerup: 'onPointerUp',
  pointermove: 'onPointerMove',
};

/**
 * Dispatches an event to the hit path, bubbling from the topmost node up to
 * the root. Returns the deepest node that was hit, or null.
 */
export function dispatch(
  root: CanvasNode,
  kind: keyof typeof HANDLER_KEYS,
  x: number,
  y: number,
): CanvasNode | null {
  const path = hitPath(root, x, y);
  if (path.length === 0) return null;
  const key = HANDLER_KEYS[kind];

  let stopped = false;
  // Bubble: deepest first.
  for (let i = path.length - 1; i >= 0; i--) {
    if (stopped) break;
    const node = path[i];
    const handler = node.props[key] as PointerHandler | undefined;
    if (!handler) continue;
    const event: CanvasPointerEvent = {
      x,
      y,
      target: node,
      stopPropagation() {
        stopped = true;
      },
    };
    handler(event);
  }
  return path[path.length - 1];
}

/**
 * Fires enter/leave handlers when the topmost hovered node changes between
 * two pointer positions. Returns the newly hovered node.
 */
export function updateHover(
  root: CanvasNode,
  prev: CanvasNode | null,
  x: number,
  y: number,
): CanvasNode | null {
  const path = hitPath(root, x, y);
  const next = path.length ? path[path.length - 1] : null;
  if (next === prev) return next;

  if (prev?.props.onPointerLeave) {
    prev.props.onPointerLeave({
      x,
      y,
      target: prev,
      stopPropagation() {},
    });
  }
  if (next?.props.onPointerEnter) {
    next.props.onPointerEnter({
      x,
      y,
      target: next,
      stopPropagation() {},
    });
  }
  return next;
}
