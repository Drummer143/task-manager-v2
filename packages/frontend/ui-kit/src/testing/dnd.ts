/*
 * Native drag and drop in jsdom, for the specs of the kit's draggable components (Tree,
 * VirtualList). pragmatic-drag-and-drop listens to the browser's drag events: jsdom fires them,
 * but has no DragEvent (testing-library then drops clientX/Y) and no DataTransfer.
 */
import { act, fireEvent } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

/** What the native drag events carry, one object for the whole drag. */
export class FakeDataTransfer {
  dropEffect = 'none';
  effectAllowed = 'all';
  files = [] as File[];
  items = [] as DataTransferItem[];
  private store = new Map<string, string>();

  get types() {
    return [...this.store.keys()];
  }

  setData(type: string, value: string) {
    this.store.set(type, value);
  }

  getData(type: string) {
    return this.store.get(type) ?? '';
  }

  clearData() {
    this.store.clear();
  }

  setDragImage() {
    // The browser's
  }
}

/** Drag events with a pointer position, as the browser's have. */
class FakeDragEvent extends MouseEvent {
  dataTransfer: DataTransfer | null;

  constructor(type: string, init: MouseEventInit & { dataTransfer?: DataTransfer } = {}) {
    super(type, init);
    this.dataTransfer = init.dataTransfer ?? null;
  }
}

/** For a describe block that drags: the missing globals, and no drag left hanging into the next test. */
export const installFakeDrag = () => {
  const elementsFromPoint = document.elementsFromPoint;

  beforeAll(() => {
    vi.stubGlobal('DragEvent', FakeDragEvent);
    // The library looks under the pointer when a drag ends (its fix for a stuck hover)
    document.elementsFromPoint = () => [];
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    document.elementsFromPoint = elementsFromPoint;
  });

  afterEach(() => {
    fireEvent.dragEnd(window);
  });
};

/** The library starts a drag, and reports where it is, in the next frame. */
export const dragFrame = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

/** Lifts `from`, moves over `to` at `y` px down it (and `x` across), lets go if asked. */
export const dragOver = async (from: Element, to: Element, { y = 14, x = 60, drop = false } = {}) => {
  const dataTransfer = new FakeDataTransfer();
  const top = to.getBoundingClientRect().top;
  const at = { dataTransfer, clientX: x, clientY: top + y };

  fireEvent.dragStart(from, { dataTransfer, clientX: 10, clientY: 10 });
  await dragFrame();
  fireEvent.dragEnter(to, at);
  fireEvent.dragOver(to, at);
  await dragFrame();

  if (drop) {
    fireEvent.drop(to, at);
    await dragFrame();
  }

  return { dataTransfer, at };
};
