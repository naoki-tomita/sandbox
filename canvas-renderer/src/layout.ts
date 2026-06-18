import {
  type Align,
  type CanvasNode,
  type Justify,
  type MeasureText,
  type Style,
  TEXT_NODE,
} from './types';

export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_LINE_HEIGHT = 1.2;

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function resolvePadding(s: Style): Padding {
  const base = s.padding ?? 0;
  const x = s.paddingX ?? base;
  const y = s.paddingY ?? base;
  return {
    top: s.paddingTop ?? y,
    right: s.paddingRight ?? x,
    bottom: s.paddingBottom ?? y,
    left: s.paddingLeft ?? x,
  };
}

/** Concatenated text of a `cr-text` node's text-instance children. */
function textOf(node: CanvasNode): string {
  let out = '';
  for (const child of node.children) {
    if (child.type === TEXT_NODE) out += child.text ?? '';
  }
  return out;
}

function isAbsolute(node: CanvasNode): boolean {
  return node.props.style?.position === 'absolute';
}

function flowChildren(node: CanvasNode): CanvasNode[] {
  return node.children.filter(
    (c) => c.type !== TEXT_NODE && !isAbsolute(c),
  );
}

interface Size {
  width: number;
  height: number;
}

/**
 * Bottom-up intrinsic size of a node, ignoring stretch from ancestors.
 * `width`/`height` in the style act as hard overrides.
 */
function measure(node: CanvasNode, measureText: MeasureText): Size {
  const s = node.props.style ?? {};

  if (node.type === 'cr-text') {
    const m = measureText(textOf(node), s);
    return {
      width: s.width ?? m.width,
      height: s.height ?? m.height,
    };
  }

  if (node.type === 'cr-circle') {
    const d = (s.radius ?? 0) * 2;
    return { width: s.width ?? d, height: s.height ?? d };
  }

  if (node.type === 'cr-image') {
    return { width: s.width ?? 0, height: s.height ?? 0 };
  }

  // cr-view: size derived from children along the main axis.
  const pad = resolvePadding(s);
  const dir = s.flexDirection ?? 'column';
  const gap = s.gap ?? 0;
  const kids = flowChildren(node);

  let main = 0;
  let cross = 0;
  for (const child of kids) {
    const cs = measure(child, measureText);
    if (dir === 'row') {
      main += cs.width;
      cross = Math.max(cross, cs.height);
    } else {
      main += cs.height;
      cross = Math.max(cross, cs.width);
    }
  }
  if (kids.length > 1) main += gap * (kids.length - 1);

  const contentW = dir === 'row' ? main : cross;
  const contentH = dir === 'row' ? cross : main;

  return {
    width: s.width ?? contentW + pad.left + pad.right,
    height: s.height ?? contentH + pad.top + pad.bottom,
  };
}

function mainStartOffset(justify: Justify, free: number, count: number): {
  start: number;
  between: number;
} {
  if (free <= 0 || count === 0) return { start: 0, between: 0 };
  switch (justify) {
    case 'center':
      return { start: free / 2, between: 0 };
    case 'flex-end':
      return { start: free, between: 0 };
    case 'space-between':
      return { start: 0, between: count > 1 ? free / (count - 1) : 0 };
    case 'space-around': {
      const unit = free / count;
      return { start: unit / 2, between: unit };
    }
    default:
      return { start: 0, between: 0 };
  }
}

function crossOffset(align: Align, available: number, size: number): number {
  switch (align) {
    case 'center':
      return Math.max(0, (available - size) / 2);
    case 'flex-end':
      return Math.max(0, available - size);
    default:
      return 0;
  }
}

/**
 * Top-down placement. Assigns the final box to `node` and recurses into
 * children, honouring flex direction, gap, justify and align.
 */
function arrange(
  node: CanvasNode,
  x: number,
  y: number,
  width: number,
  height: number,
  measureText: MeasureText,
): void {
  node.layout = { x, y, width, height };

  if (node.type !== 'cr-view') return;

  const s = node.props.style ?? {};
  const pad = resolvePadding(s);
  const dir = s.flexDirection ?? 'column';
  const gap = s.gap ?? 0;
  const align: Align = s.alignItems ?? 'flex-start';
  const justify: Justify = s.justifyContent ?? 'flex-start';

  const contentX = x + pad.left;
  const contentY = y + pad.top;
  const contentW = width - pad.left - pad.right;
  const contentH = height - pad.top - pad.bottom;

  const kids = flowChildren(node);
  const sizes = kids.map((c) => measure(c, measureText));

  const mainAvail = dir === 'row' ? contentW : contentH;
  const crossAvail = dir === 'row' ? contentH : contentW;

  let used = 0;
  for (const cs of sizes) used += dir === 'row' ? cs.width : cs.height;
  if (kids.length > 1) used += gap * (kids.length - 1);

  const { start, between } = mainStartOffset(
    justify,
    mainAvail - used,
    kids.length,
  );

  let cursor = (dir === 'row' ? contentX : contentY) + start;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const cs = sizes[i];
    const childMain = dir === 'row' ? cs.width : cs.height;
    let childCross = dir === 'row' ? cs.height : cs.width;
    if (align === 'stretch' && child.props.style?.[dir === 'row' ? 'height' : 'width'] == null) {
      childCross = crossAvail;
    }
    const crossPos =
      (dir === 'row' ? contentY : contentX) +
      crossOffset(align, crossAvail, childCross);

    if (dir === 'row') {
      arrange(child, cursor, crossPos, childMain, childCross, measureText);
    } else {
      arrange(child, crossPos, cursor, childCross, childMain, measureText);
    }
    cursor += childMain + gap + between;
  }

  // Absolutely positioned children are placed relative to the padding box.
  for (const child of node.children) {
    if (child.type === TEXT_NODE || !isAbsolute(child)) continue;
    const cs = measure(child, measureText);
    const cstyle = child.props.style ?? {};
    arrange(
      child,
      contentX + (cstyle.left ?? 0),
      contentY + (cstyle.top ?? 0),
      cs.width,
      cs.height,
      measureText,
    );
  }
}

/**
 * Lays out a root node inside the given viewport. Mutates `node.layout`
 * (and descendants) in place and returns the root for convenience.
 */
export function layoutTree(
  node: CanvasNode,
  viewportWidth: number,
  viewportHeight: number,
  measureText: MeasureText,
): CanvasNode {
  const s = node.props.style ?? {};
  const size = measure(node, measureText);
  arrange(
    node,
    0,
    0,
    s.width ?? viewportWidth ?? size.width,
    s.height ?? viewportHeight ?? size.height,
    measureText,
  );
  return node;
}
