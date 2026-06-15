import type { FC } from 'react';
import type {
  CircleProps,
  ImageProps,
  TextProps,
  ViewProps,
} from './types';

/**
 * Host components map straight to the reconciler's host type tags. Casting the
 * tag string to a typed `FC` gives full prop type-checking in JSX while the
 * reconciler receives the raw tag (`cr-view`, `cr-text`, ...) at runtime.
 */
function host<P>(tag: string): FC<P> {
  return tag as unknown as FC<P>;
}

/** A rectangular flex container. The building block of every layout. */
export const View = host<ViewProps>('cr-view');

/** A run of text. Style font/colour via `style`; pass the string as children. */
export const Text = host<TextProps>('cr-text');

/** A bitmap image loaded from `src` and cached. */
export const Image = host<ImageProps>('cr-image');

/** A filled/stroked circle sized by `style.radius`. */
export const Circle = host<CircleProps>('cr-circle');
