import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from './layout';
import { type CanvasNode, type Style, TEXT_NODE } from './types';

/** Builds a CSS `font` shorthand from text style props. */
export function fontString(s: Style): string {
  const size = s.fontSize ?? DEFAULT_FONT_SIZE;
  const family = s.fontFamily ?? 'sans-serif';
  const weight = s.fontWeight ?? 'normal';
  const fstyle = s.fontStyle ?? 'normal';
  return `${fstyle} ${weight} ${size}px ${family}`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function textOf(node: CanvasNode): string {
  let out = '';
  for (const child of node.children) {
    if (child.type === TEXT_NODE) out += child.text ?? '';
  }
  return out;
}

/** Image cache keyed by URL. `null` means a load is in flight. */
type ImageGetter = (src: string) => CanvasImageSource | null;

function paintNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  getImage: ImageGetter,
): void {
  if (node.type === TEXT_NODE) return;

  const s = node.props.style ?? {};
  const { x, y, width, height } = node.layout;

  ctx.save();
  if (s.opacity != null) ctx.globalAlpha *= s.opacity;

  switch (node.type) {
    case 'cr-view': {
      if (s.backgroundColor) {
        ctx.fillStyle = s.backgroundColor;
        roundRectPath(ctx, x, y, width, height, s.borderRadius ?? 0);
        ctx.fill();
      }
      if (s.borderWidth && s.borderColor) {
        ctx.lineWidth = s.borderWidth;
        ctx.strokeStyle = s.borderColor;
        roundRectPath(ctx, x, y, width, height, s.borderRadius ?? 0);
        ctx.stroke();
      }
      break;
    }
    case 'cr-circle': {
      const r = Math.min(width, height) / 2;
      ctx.beginPath();
      ctx.arc(x + width / 2, y + height / 2, r, 0, Math.PI * 2);
      if (s.backgroundColor) {
        ctx.fillStyle = s.backgroundColor;
        ctx.fill();
      }
      if (s.borderWidth && s.borderColor) {
        ctx.lineWidth = s.borderWidth;
        ctx.strokeStyle = s.borderColor;
        ctx.stroke();
      }
      break;
    }
    case 'cr-image': {
      const img = node.props.src ? getImage(node.props.src) : null;
      if (img) {
        if (s.borderRadius) {
          roundRectPath(ctx, x, y, width, height, s.borderRadius);
          ctx.clip();
        }
        ctx.drawImage(img, x, y, width, height);
      } else if (s.backgroundColor) {
        ctx.fillStyle = s.backgroundColor;
        roundRectPath(ctx, x, y, width, height, s.borderRadius ?? 0);
        ctx.fill();
      }
      break;
    }
    case 'cr-text': {
      const text = textOf(node);
      ctx.fillStyle = s.color ?? '#000';
      ctx.font = fontString(s);
      ctx.textBaseline = 'middle';
      const align = s.textAlign ?? 'left';
      ctx.textAlign = align;
      const lineH = (s.fontSize ?? DEFAULT_FONT_SIZE) * (s.lineHeight ?? DEFAULT_LINE_HEIGHT);
      const tx = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
      ctx.fillText(text, tx, y + lineH / 2);
      break;
    }
  }

  for (const child of node.children) paintNode(ctx, child, getImage);

  ctx.restore();
}

/** Clears the viewport and repaints the whole tree. */
export function paintTree(
  ctx: CanvasRenderingContext2D,
  root: CanvasNode,
  viewportWidth: number,
  viewportHeight: number,
  getImage: ImageGetter,
): void {
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  paintNode(ctx, root, getImage);
}
