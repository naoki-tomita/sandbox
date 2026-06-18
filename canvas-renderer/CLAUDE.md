# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`canvas-renderer` is a custom React renderer that draws components to a 2D `<canvas>` instead of the DOM, built on `react-reconciler` (the same machinery as react-three-fiber / react-pixi). React's hooks, state and re-rendering all behave normally; only the host environment differs.

Unit tests use vitest (`npm test`). They cover the **Canvas-independent** modules only — `src/layout.test.ts` exercises `layout.ts` (flex layout) and `events.ts` (hit testing / bubbling) with a stub `MeasureText`, so no real canvas is needed. TypeScript strict mode (`tsc` during `npm run build` / `npm run typecheck`) is the check for the rest.

When you change layout rules or event dispatch, update or add tests in the same PR.

## Architecture

The data structure shared across every layer is `CanvasNode` (`src/types.ts`): a mutable tree node with `type`, `props`, `children`, and a `layout` box filled in before painting. Text lives in dedicated `#text` instances (`TEXT_NODE`) so a `cr-text` element measures the concatenation of its text children.

Flow of one update:

```
React element
  └─ reconciler.ts  react-reconciler HostConfig → builds/mutates the CanvasNode tree
       └─ render.tsx  public render(); schedules a paint on every commit (rAF),
            │          handles DPR scaling, wires pointer events, caches images
            ├─ layout.ts  pure flex layout (no canvas) → writes node.layout
            ├─ paint.ts   draws a laid-out tree into a CanvasRenderingContext2D
            └─ events.ts  hit testing + deepest-first event bubbling
```

- **`types.ts`** — `Style`, per-element props, `CanvasNode`, and the `MeasureText` injection point. Host tags are prefixed `cr-` (`cr-view`/`cr-text`/`cr-image`/`cr-circle`) so they never collide with the SVG `text`/`image`/`circle` intrinsics in `@types/react`.
- **`components.ts`** — `View`/`Text`/`Image`/`Circle`. Each is a host tag string cast to a typed `FC`, giving JSX prop checking while the reconciler receives the raw tag at runtime. This avoids augmenting `JSX.IntrinsicElements` (which would conflict with the SVG intrinsics).
- **`layout.ts`** — two-pass flex subset: `measure` (bottom-up intrinsic size, `style.width`/`height` are hard overrides) then `arrange` (top-down placement with gap/justify/align). Absolute children are placed relative to the parent's padding box. Pure: takes a `MeasureText` so it can be unit-tested without a canvas.
- **`paint.ts`** — per-node drawing (rounded rects, circles, text baseline `middle`, clipped images), recursing into children. `fontString` builds the CSS `font` shorthand; the same function is used by `render.tsx` to measure text so metrics and drawing agree.
- **`events.ts`** — `hitPath` walks down preferring later siblings (painted on top) to find the topmost node; `dispatch` bubbles deepest-first and honours `stopPropagation`; `updateHover` fires enter/leave on hover changes.
- **`reconciler.ts`** — the `HostConfig`. `supportsMutation`, text never inlined (`shouldSetTextContent: () => false`), `resetAfterCommit` calls `container.onCommit()` to schedule a repaint. The config is typed `any` because react-reconciler's field types drift across minor versions; behaviour is what matters.
- **`render.tsx`** — owns the live context, a synthetic root `cr-view` filling the viewport, the rAF paint scheduler, DPR-aware sizing (`setTransform(dpr,...)`), pointer→canvas coordinate mapping, the image cache, and the `LegacyRoot` container. Returns `{ render, unmount }`.

### Demo — `src/demo.tsx`, `src/main.tsx`

`Demo` is an interactive scene (counter buttons + an orbiting-dots animation driven by `useState` in an effect) proving hooks, events and per-frame re-rendering all flow through to the canvas. `main.tsx` mounts it onto `canvas#app`. Vite `base` is `/sandbox/canvas-renderer/` to match the other projects in this repo.
