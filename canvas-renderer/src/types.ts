import type { ReactNode } from 'react';

/**
 * Host element type tags used internally by the reconciler.
 * They are prefixed with `cr-` so they never collide with the DOM/SVG
 * intrinsic elements already declared by `@types/react`.
 */
export type HostType = 'cr-view' | 'cr-text' | 'cr-image' | 'cr-circle';
export const TEXT_NODE = '#text' as const;

export type FlexDirection = 'row' | 'column';
export type Align = 'flex-start' | 'center' | 'flex-end' | 'stretch';
export type Justify =
  | 'flex-start'
  | 'center'
  | 'flex-end'
  | 'space-between'
  | 'space-around';
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Style applies to every node. Sizes are unitless logical pixels.
 * Layout follows a small flexbox subset; visual props mirror the 2D canvas API.
 */
export interface Style {
  // positioning
  position?: 'relative' | 'absolute';
  left?: number;
  top?: number;

  // box sizing
  width?: number;
  height?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;

  // flex layout (applies to `view` containers)
  flexDirection?: FlexDirection;
  gap?: number;
  alignItems?: Align;
  justifyContent?: Justify;

  // visual
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;

  // circle
  radius?: number;

  // text
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  fontStyle?: 'normal' | 'italic';
  lineHeight?: number;
  textAlign?: TextAlign;
}

/** Pointer events carry the canvas-local coordinates of the pointer. */
export interface CanvasPointerEvent {
  x: number;
  y: number;
  /** The node the handler is attached to. */
  target: CanvasNode;
  /** Call to stop the event from bubbling to ancestors. */
  stopPropagation(): void;
}

export type PointerHandler = (event: CanvasPointerEvent) => void;

export interface EventProps {
  onClick?: PointerHandler;
  onPointerDown?: PointerHandler;
  onPointerUp?: PointerHandler;
  onPointerMove?: PointerHandler;
  onPointerEnter?: PointerHandler;
  onPointerLeave?: PointerHandler;
}

export interface BaseProps extends EventProps {
  style?: Style;
  children?: ReactNode;
}

export interface ViewProps extends BaseProps {}

export interface TextProps extends BaseProps {
  children?: ReactNode;
}

export interface ImageProps extends BaseProps {
  /** Image URL. Loaded and cached; the tree repaints once it resolves. */
  src: string;
}

export interface CircleProps extends BaseProps {}

/** Resolved rectangle produced by the layout pass. */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The mutable node shared by the reconciler, layout engine and painter.
 * Text instances use type `#text` and store their string in `text`.
 */
export interface CanvasNode {
  type: HostType | typeof TEXT_NODE;
  props: BaseProps & { src?: string };
  text?: string;
  parent: CanvasNode | null;
  children: CanvasNode[];
  /** Filled in by the layout pass before painting. */
  layout: LayoutBox;
}

/** Measures a string for a given style. Injected so layout stays canvas-free. */
export type MeasureText = (
  text: string,
  style: Style,
) => { width: number; height: number };
