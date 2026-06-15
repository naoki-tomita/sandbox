import { describe, expect, it } from 'vitest';
import { layoutTree } from './layout';
import { hitPath, dispatch } from './events';
import {
  type BaseProps,
  type CanvasNode,
  type HostType,
  type MeasureText,
  TEXT_NODE,
} from './types';

// Deterministic measurer: each char is half the font size wide.
const measure: MeasureText = (text, style) => {
  const size = style.fontSize ?? 16;
  return { width: text.length * size * 0.5, height: size };
};

function node(
  type: HostType,
  props: BaseProps,
  children: CanvasNode[] = [],
): CanvasNode {
  const n: CanvasNode = {
    type,
    props,
    parent: null,
    children,
    layout: { x: 0, y: 0, width: 0, height: 0 },
  };
  for (const c of children) c.parent = n;
  return n;
}

function text(value: string, props: BaseProps = {}): CanvasNode {
  const t: CanvasNode = {
    type: TEXT_NODE,
    props: {},
    text: value,
    parent: null,
    children: [],
    layout: { x: 0, y: 0, width: 0, height: 0 },
  };
  return node('cr-text', props, [t]);
}

describe('layoutTree', () => {
  it('fills the viewport for a root without explicit size', () => {
    const root = node('cr-view', {});
    layoutTree(root, 800, 600, measure);
    expect(root.layout).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('stacks children vertically with gap and padding', () => {
    const a = node('cr-view', { style: { width: 100, height: 40 } });
    const b = node('cr-view', { style: { width: 100, height: 40 } });
    const root = node(
      'cr-view',
      { style: { width: 200, height: 200, padding: 10, gap: 8 } },
      [a, b],
    );
    layoutTree(root, 200, 200, measure);

    expect(a.layout).toMatchObject({ x: 10, y: 10, width: 100, height: 40 });
    expect(b.layout).toMatchObject({ x: 10, y: 58, width: 100, height: 40 }); // 10 + 40 + 8
  });

  it('lays children out in a row when flexDirection is row', () => {
    const a = node('cr-view', { style: { width: 30, height: 30 } });
    const b = node('cr-view', { style: { width: 30, height: 30 } });
    const root = node(
      'cr-view',
      { style: { width: 200, height: 100, flexDirection: 'row', gap: 10 } },
      [a, b],
    );
    layoutTree(root, 200, 100, measure);

    expect(a.layout.x).toBe(0);
    expect(b.layout.x).toBe(40); // 30 + 10 gap
  });

  it('centers a child on both axes', () => {
    const child = node('cr-view', { style: { width: 40, height: 20 } });
    const root = node(
      'cr-view',
      {
        style: {
          width: 200,
          height: 100,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
        },
      },
      [child],
    );
    layoutTree(root, 200, 100, measure);

    expect(child.layout.x).toBe((200 - 40) / 2);
    expect(child.layout.y).toBe((100 - 20) / 2);
  });

  it('stretches a child along the cross axis', () => {
    const child = node('cr-view', { style: { height: 20 } });
    const root = node(
      'cr-view',
      { style: { width: 200, height: 100, alignItems: 'stretch' } },
      [child],
    );
    layoutTree(root, 200, 100, measure);
    expect(child.layout.width).toBe(200);
  });

  it('sizes a view to its text content when no size is given', () => {
    const label = text('hello', { style: { fontSize: 20 } });
    // Auto-sizing applies to non-root views; the root always fills the viewport.
    const box = node('cr-view', { style: { padding: 5 } }, [label]);
    const root = node('cr-view', {}, [box]);
    layoutTree(root, 500, 500, measure);

    // "hello" = 5 chars * 20 * 0.5 = 50 wide, 20 tall, + padding 5 each side.
    expect(label.layout.width).toBe(50);
    expect(box.layout.width).toBe(60);
    expect(box.layout.height).toBe(30);
  });

  it('positions absolute children relative to the padding box', () => {
    const badge = node('cr-view', {
      style: { position: 'absolute', left: 8, top: 4, width: 10, height: 10 },
    });
    const root = node(
      'cr-view',
      { style: { width: 100, height: 100, padding: 5 } },
      [badge],
    );
    layoutTree(root, 100, 100, measure);
    expect(badge.layout).toMatchObject({ x: 13, y: 9 });
  });

  it('space-between distributes free space between children', () => {
    const a = node('cr-view', { style: { width: 20, height: 20 } });
    const b = node('cr-view', { style: { width: 20, height: 20 } });
    const root = node(
      'cr-view',
      {
        style: {
          width: 100,
          height: 40,
          flexDirection: 'row',
          justifyContent: 'space-between',
        },
      },
      [a, b],
    );
    layoutTree(root, 100, 40, measure);
    expect(a.layout.x).toBe(0);
    expect(b.layout.x).toBe(80); // pushed to the far edge
  });
});

describe('hit testing & events', () => {
  it('returns the topmost node under a point', () => {
    const inner = node('cr-view', {
      style: { position: 'absolute', left: 10, top: 10, width: 20, height: 20 },
    });
    const root = node('cr-view', { style: { width: 100, height: 100 } }, [
      inner,
    ]);
    layoutTree(root, 100, 100, measure);

    const path = hitPath(root, 15, 15);
    expect(path[path.length - 1]).toBe(inner);
    expect(hitPath(root, 90, 90)[0]).toBe(root); // misses inner, hits root
  });

  it('dispatches click and bubbles to ancestors', () => {
    const calls: string[] = [];
    const inner = node('cr-view', {
      style: { position: 'absolute', left: 10, top: 10, width: 20, height: 20 },
      onClick: () => calls.push('inner'),
    });
    const root = node(
      'cr-view',
      { style: { width: 100, height: 100 }, onClick: () => calls.push('root') },
      [inner],
    );
    layoutTree(root, 100, 100, measure);

    dispatch(root, 'click', 15, 15);
    expect(calls).toEqual(['inner', 'root']); // bubbles deepest-first
  });

  it('stopPropagation halts bubbling', () => {
    const calls: string[] = [];
    const inner = node('cr-view', {
      style: { position: 'absolute', left: 10, top: 10, width: 20, height: 20 },
      onClick: (e) => {
        calls.push('inner');
        e.stopPropagation();
      },
    });
    const root = node(
      'cr-view',
      { style: { width: 100, height: 100 }, onClick: () => calls.push('root') },
      [inner],
    );
    layoutTree(root, 100, 100, measure);

    dispatch(root, 'click', 15, 15);
    expect(calls).toEqual(['inner']);
  });
});
