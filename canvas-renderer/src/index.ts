// Public entry point for the canvas-renderer library.
export { render } from './render';
export type { CanvasRoot, RenderOptions } from './render';
export { View, Text, Image, Circle } from './components';
export type {
  Style,
  ViewProps,
  TextProps,
  ImageProps,
  CircleProps,
  CanvasNode,
  CanvasPointerEvent,
  PointerHandler,
  FlexDirection,
  Align,
  Justify,
  TextAlign,
} from './types';

// Lower-level pieces, exposed for advanced use and testing.
export { layoutTree } from './layout';
export { paintTree, fontString } from './paint';
export { hitPath, dispatch, updateHover } from './events';
