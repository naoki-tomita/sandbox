import Reconciler from 'react-reconciler';
import { DefaultEventPriority } from 'react-reconciler/constants';
import { type BaseProps, type CanvasNode, type HostType, TEXT_NODE } from './types';

/** Root container the reconciler mutates; owns the on-screen node tree. */
export interface Container {
  children: CanvasNode[];
  /** Called after every commit so the host can repaint. */
  onCommit(): void;
}

function createNode(type: HostType, props: BaseProps): CanvasNode {
  return {
    type,
    props,
    parent: null,
    children: [],
    layout: { x: 0, y: 0, width: 0, height: 0 },
  };
}

function append(parent: { children: CanvasNode[] }, child: CanvasNode): void {
  remove(parent, child); // guard against duplicates on move
  child.parent = (parent as CanvasNode).type ? (parent as CanvasNode) : null;
  parent.children.push(child);
}

function insert(
  parent: { children: CanvasNode[] },
  child: CanvasNode,
  before: CanvasNode,
): void {
  remove(parent, child);
  child.parent = (parent as CanvasNode).type ? (parent as CanvasNode) : null;
  const idx = parent.children.indexOf(before);
  if (idx === -1) parent.children.push(child);
  else parent.children.splice(idx, 0, child);
}

function remove(parent: { children: CanvasNode[] }, child: CanvasNode): void {
  const idx = parent.children.indexOf(child);
  if (idx !== -1) {
    parent.children.splice(idx, 1);
    child.parent = null;
  }
}

// react-reconciler's HostConfig has dozens of fields whose exact types vary
// across minor versions; we type it loosely and keep the behaviour correct.
const hostConfig: any = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,

  now: typeof performance !== 'undefined' ? () => performance.now() : Date.now,
  getCurrentEventPriority: () => DefaultEventPriority,

  getRootHostContext: () => ({}),
  getChildHostContext: (parent: unknown) => parent,
  getPublicInstance: (instance: CanvasNode) => instance,

  // Text lives in dedicated `#text` instances, never inlined into a host node.
  shouldSetTextContent: () => false,

  createInstance(type: HostType, props: BaseProps): CanvasNode {
    return createNode(type, props);
  },

  createTextInstance(text: string): CanvasNode {
    return {
      type: TEXT_NODE,
      props: {},
      text,
      parent: null,
      children: [],
      layout: { x: 0, y: 0, width: 0, height: 0 },
    };
  },

  appendInitialChild: append,
  appendChild: append,
  appendChildToContainer: (container: Container, child: CanvasNode) =>
    append(container, child),

  insertBefore: insert,
  insertInContainerBefore: (
    container: Container,
    child: CanvasNode,
    before: CanvasNode,
  ) => insert(container, child, before),

  removeChild: remove,
  removeChildFromContainer: (container: Container, child: CanvasNode) =>
    remove(container, child),

  finalizeInitialChildren: () => false,

  prepareUpdate: () => true,
  commitUpdate(instance: CanvasNode, _payload: unknown, _type: unknown, _old: unknown, nextProps: BaseProps) {
    instance.props = nextProps;
  },
  commitTextUpdate(instance: CanvasNode, _old: string, next: string) {
    instance.text = next;
  },

  clearContainer(container: Container) {
    container.children.length = 0;
  },

  prepareForCommit: () => null,
  resetAfterCommit(container: Container) {
    container.onCommit();
  },

  // No-ops required by recent reconciler versions.
  preparePortalMount: () => {},
  detachDeletedInstance: () => {},
  getInstanceFromNode: () => null,
  getInstanceFromScope: () => null,
  prepareScopeUpdate: () => {},
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  maySuspendCommit: () => false,
};

export const CanvasReconciler = Reconciler(hostConfig);
