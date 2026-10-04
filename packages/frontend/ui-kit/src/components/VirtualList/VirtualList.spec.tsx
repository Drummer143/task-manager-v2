import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualList, type VirtualListProps } from './VirtualList';

/*
 * jsdom has no layout. The virtualizer reads the scroll element's size from `offsetHeight`, its
 * offset from `scrollTop` on `scroll` events, the maximum offset from `scrollHeight`, and an
 * item's size from its `offsetHeight`; it scrolls with `scrollTo`. This stand gives it exactly
 * that: a viewport of VIEWPORT px, a scrollHeight from the size the list writes on itself, and a
 * `scrollTo` that, like a browser, reports the new offset with a `scroll` event a moment later.
 */
const VIEWPORT = 100;
const ROW = 20;
const SCROLLER = 'scroller';

const isScroller = (el: Element) => el.classList.contains(SCROLLER);

/** What the list wrote as its height, plus anything stacked above it in the scroller. */
const contentHeight = (scroller: Element) =>
  [...scroller.children].reduce((sum, child) => {
    const own = parseFloat((child as HTMLElement).style.height);
    const list = child.matches('ul') ? child : child.querySelector('ul');

    return (
      sum +
      (own || parseFloat((list as HTMLElement | null)?.style.height ?? '') || 0)
    );
  }, 0);

const offsets = new WeakMap<Element, number>();
const originalScrollTo = Element.prototype.scrollTo;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      if (isScroller(this)) return VIEWPORT;
      // A row is as tall as its content says (see `item` below)
      if (this.tagName === 'LI')
        return Number(
          (this.firstElementChild as HTMLElement | null)?.dataset.size ?? 0,
        );
      return 0;
    },
  );
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(
    function (this: Element) {
      return isScroller(this) ? VIEWPORT : 0;
    },
  );
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(
    function (this: Element) {
      return isScroller(this) ? contentHeight(this) : 0;
    },
  );
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (
    this: Element,
  ) {
    return offsets.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (
    this: Element,
    value: number,
  ) {
    const max = Math.max(0, this.scrollHeight - this.clientHeight);
    offsets.set(this, Math.min(Math.max(value, 0), max));
  });
  Element.prototype.scrollTo = function (
    this: Element,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options === 'object' && options.top !== undefined) {
      this.scrollTop = options.top;
      setTimeout(() => this.dispatchEvent(new Event('scroll')));
    }
  } as Element['scrollTo'];
});

afterEach(() => {
  vi.restoreAllMocks();
  Element.prototype.scrollTo = originalScrollTo;
});

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Lets the scroll events the list caused arrive, React commit what they changed, and the
 * virtualizer finish its scroll: it confirms a `scrollToIndex` on the next animation frame.
 */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await frame();
    await frame();
  });

/** The user scrolls the scroller to `top`. */
const scrollTo = async (scroller: Element, top: number) => {
  await act(async () => {
    scroller.scrollTop = top;
    scroller.dispatchEvent(new Event('scroll'));
  });
  await settle();
};

const ids = (count: number, prefix = 'r') =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`);

const item = (id: string | number, size?: number) => (
  <div data-size={size} data-id={id}>
    {id}
  </div>
);

const rows = (root: ParentNode = document) => [...root.querySelectorAll('li')];

/** The row's offset in the list, from the transform the virtualizer writes. */
const top = (li: Element) =>
  Number(
    /translate3d\(0(?:px)?, (-?[\d.]+)px/.exec(
      (li as HTMLElement).style.transform,
    )?.[1],
  );

const rowOf = (id: string) =>
  (document.querySelector(`[data-id="${id}"]`) as HTMLElement | null)?.closest(
    'li',
  );

/** The id of the first row whose top is at or below the scroll offset. */
const firstVisible = (scroller: Element) =>
  rows()
    .filter((li) => top(li) >= scroller.scrollTop)
    .sort((a, b) => top(a) - top(b))[0]?.textContent;

type StringList = Partial<VirtualListProps<string>>;

const renderList = async (props: StringList & { data?: string[] } = {}) => {
  const view = render(
    <VirtualList<string>
      className={SCROLLER}
      data={ids(1000)}
      getKey={(id) => id}
      fixedHeight={ROW}
      renderItem={(id) => item(id)}
      {...props}
    />,
  );
  await settle();
  const scroller = document.querySelector(`.${SCROLLER}`) as HTMLElement;

  return {
    ...view,
    scroller,
    update: async (next: StringList & { data?: string[] }) => {
      view.rerender(
        <VirtualList<string>
          className={SCROLLER}
          data={ids(1000)}
          getKey={(id) => id}
          fixedHeight={ROW}
          renderItem={(id) => item(id)}
          {...next}
        />,
      );
      await settle();
    },
  };
};

describe('VirtualList', () => {
  describe('rendering', () => {
    it('renders only the rows in view plus the overscan, not the whole list', async () => {
      await renderList({ overscan: 2 });

      // 100 px of viewport / 20 px rows = 5 in view, + 2 below
      expect(rows().map((li) => li.textContent)).toEqual([
        'r0',
        'r1',
        'r2',
        'r3',
        'r4',
        'r5',
        'r6',
      ]);
    });

    it('positions the rows and sizes the list itself, without a React render per scroll', async () => {
      const { scroller } = await renderList();
      const list = scroller.querySelector('ul') as HTMLElement;

      expect(list.style.height).toBe(`${1000 * ROW}px`);
      expect(rows().map(top)).toEqual(rows().map((_, index) => index * ROW));
    });

    it('shows the rows of the new offset when scrolled', async () => {
      const { scroller } = await renderList({ overscan: 0 });

      await scrollTo(scroller, 500);

      expect(rows().map((li) => li.textContent)).toEqual([
        'r25',
        'r26',
        'r27',
        'r28',
        'r29',
      ]);
      expect(top(rowOf('r25') as Element)).toBe(500);
    });

    it('keeps the declared row height when the DOM measures nothing (fixedHeight)', async () => {
      // `item` without a size measures 0 px here; a measured list would stack every row at 0
      await renderList();

      expect(top(rowOf('r3') as Element)).toBe(3 * ROW);
    });

    it('measures rows of different heights, like group headers and notifications', async () => {
      const sizes = (id: string) => (Number(id.slice(1)) % 5 === 0 ? 32 : 56);

      await renderList({
        fixedHeight: undefined,
        estimateSize: (index) => sizes(`r${index}`),
        renderItem: (id) => item(id, sizes(id)),
      });

      expect(top(rowOf('r1') as Element)).toBe(32);
      expect(top(rowOf('r2') as Element)).toBe(32 + 56);
    });

    it('puts the gap between rows', async () => {
      await renderList({ gap: 4 });

      expect(top(rowOf('r2') as Element)).toBe(2 * (ROW + 4));
    });

    it('applies the class names to their parts', async () => {
      await renderList({
        classNames: {
          root: 'root',
          listContainer: 'list',
          listItemWrapper: 'row',
        },
      });

      const scroller = document.querySelector(`.${SCROLLER}`) as HTMLElement;

      expect(scroller.classList.contains('root')).toBe(true);
      expect(scroller.querySelector('ul')?.classList.contains('list')).toBe(
        true,
      );
      expect(rows().every((li) => li.classList.contains('row'))).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('keeps the list a list and tells each row its place in the whole list', async () => {
      await renderList({ overscan: 0 });

      // role="list" survives `list-style: none` in Safari / VoiceOver
      expect(document.querySelector('ul')?.getAttribute('role')).toBe('list');
      expect(
        rows().map((li) => [
          li.getAttribute('aria-posinset'),
          li.getAttribute('aria-setsize'),
        ]),
      ).toEqual([
        ['1', '1000'],
        ['2', '1000'],
        ['3', '1000'],
        ['4', '1000'],
        ['5', '1000'],
      ]);
    });
  });

  describe('an outer scroll element (the AppShell canvas)', () => {
    const MARGIN = 40;

    const renderInCanvas = async () => {
      // The canvas exists before the list mounts, as in the app shell
      const canvas = document.createElement('div');
      canvas.className = SCROLLER;
      const header = document.createElement('div');
      header.style.height = `${MARGIN}px`;
      const mount = document.createElement('div');
      canvas.append(header, mount);
      document.body.append(canvas);

      render(
        <VirtualList<string>
          data={ids(1000)}
          getKey={(id) => id}
          fixedHeight={ROW}
          overscan={0}
          scrollMargin={MARGIN}
          getScrollElement={() => canvas}
          renderItem={(id) => item(id)}
        />,
        { container: mount },
      );
      await settle();

      return canvas;
    };

    afterEach(() => {
      document
        .querySelectorAll(`.${SCROLLER}`)
        .forEach((node) => node.remove());
    });

    it('renders no scroller of its own', async () => {
      const canvas = await renderInCanvas();

      expect(canvas.querySelectorAll(`.${SCROLLER}`)).toHaveLength(0);
      expect(canvas.querySelector('ul')?.parentElement?.parentElement).toBe(
        canvas,
      );
    });

    it('counts the content above it: fewer rows fit under the header, and they start at 0 in the list', async () => {
      const canvas = await renderInCanvas();

      // 100 px viewport - 40 px header = 60 px = 3 rows
      expect(rows(canvas).map((li) => li.textContent)).toEqual([
        'r0',
        'r1',
        'r2',
      ]);
      expect(top(rowOf('r0') as Element)).toBe(0);

      await scrollTo(canvas, MARGIN + 10 * ROW);

      expect(rows(canvas)[0]?.textContent).toBe('r10');
    });
  });

  describe('the keyboard cursor', () => {
    it('scrolls a cursor below the view in by the least shift: to the bottom edge', async () => {
      const { scroller, update } = await renderList({ cursorKey: 'r0' });

      await update({ cursorKey: 'r7' });

      // r7 ends at 160; the view ends there
      expect(scroller.scrollTop).toBe(8 * ROW - VIEWPORT);
    });

    it('does not scroll for a cursor already in view', async () => {
      const { scroller, update } = await renderList({ cursorKey: 'r0' });
      await update({ cursorKey: 'r7' });
      const before = scroller.scrollTop;

      await update({ cursorKey: 'r6' });

      expect(scroller.scrollTop).toBe(before);
    });

    it('scrolls a cursor above the view in to the top edge', async () => {
      const { scroller, update } = await renderList({ cursorKey: 'r0' });
      await scrollTo(scroller, 600);

      await update({ cursorKey: 'r20' });

      expect(scroller.scrollTop).toBe(20 * ROW);
    });

    it('scrolls to the cursor it starts with (a reload restoring the open notification)', async () => {
      const { scroller } = await renderList({ cursorKey: 'r300' });

      expect(rowOf('r300')).toBeTruthy();
      expect(scroller.scrollTop).toBe(301 * ROW - VIEWPORT);
    });

    it('keeps the cursor row mounted at its own place while scrolled away, so its focus stays', async () => {
      const { scroller } = await renderList({ cursorKey: 'r2', overscan: 0 });

      await scrollTo(scroller, 10_000);

      const cursorRow = rowOf('r2');
      expect(cursorRow).toBeTruthy();
      expect(top(cursorRow as Element)).toBe(2 * ROW);
      expect(cursorRow?.getAttribute('aria-posinset')).toBe('3');
      // Only the cursor is pinned: nothing between it and the view is rendered
      const others = rows().filter((li) => li !== cursorRow);
      expect(others.length).toBeLessThanOrEqual(VIEWPORT / ROW + 1);
      expect(others.every((li) => top(li) >= 10_000 - ROW)).toBe(true);
    });

    it('takes an index for the cursor when there is no getKey', async () => {
      render(
        <VirtualList<number>
          className={SCROLLER}
          data={Array.from({ length: 1000 }, (_, i) => i)}
          fixedHeight={ROW}
          cursorKey={7}
          renderItem={(value) => item(value)}
        />,
      );
      await settle();

      expect(
        (document.querySelector(`.${SCROLLER}`) as HTMLElement).scrollTop,
      ).toBe(8 * ROW - VIEWPORT);
    });

    it('ignores a cursor that is not loaded yet', async () => {
      const { scroller, update } = await renderList({ cursorKey: 'r0' });

      await update({ cursorKey: 'not-loaded' });

      expect(scroller.scrollTop).toBe(0);
    });
  });

  describe('rows arriving at the top', () => {
    it('keep what the user is looking at in place', async () => {
      const { scroller, update } = await renderList();
      await scrollTo(scroller, 10 * ROW);
      const row = rowOf('r10');

      await update({ data: ['new', ...ids(1000)] });

      expect(firstVisible(scroller)).toBe('r10');
      expect(scroller.scrollTop).toBe(11 * ROW);
      // The same DOM node: rows are keyed by id, not by position
      expect(rowOf('r10')).toBe(row);
    });

    it('do not pull the view back to a cursor the user scrolled away from', async () => {
      const { scroller, update } = await renderList({ cursorKey: 'r2' });
      await scrollTo(scroller, 20 * ROW);

      await update({ cursorKey: 'r2', data: ['new', ...ids(1000)] });

      expect(firstVisible(scroller)).toBe('r20');
    });

    it('report the new size of the list', async () => {
      const { update } = await renderList({ overscan: 0 });

      await update({ data: ['new', ...ids(1000)] });

      expect(rows()[0]?.getAttribute('aria-setsize')).toBe('1001');
    });
  });

  describe('onEndReached', () => {
    it('is called once when the last row comes into view, not on every scroll after it', async () => {
      const onEndReached = vi.fn();
      const { scroller } = await renderList({ data: ids(10), onEndReached });

      expect(onEndReached).not.toHaveBeenCalled();

      await scrollTo(scroller, 5 * ROW);
      await scrollTo(scroller, 4 * ROW);
      await scrollTo(scroller, 5 * ROW);

      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it('is called again only after the list grew and its new end comes into view', async () => {
      const onEndReached = vi.fn();
      const { scroller, update } = await renderList({
        data: ids(10),
        onEndReached,
      });
      await scrollTo(scroller, 5 * ROW);

      await update({ data: ids(20), onEndReached });
      expect(onEndReached).toHaveBeenCalledTimes(1);

      await scrollTo(scroller, 15 * ROW);
      expect(onEndReached).toHaveBeenCalledTimes(2);
    });

    it('is called ahead of the end by endThreshold rows', async () => {
      const onEndReached = vi.fn();
      const { scroller } = await renderList({
        data: ids(20),
        endThreshold: 5,
        onEndReached,
      });

      // The view ends on r9: 10 rows before the end
      await scrollTo(scroller, 5 * ROW);
      expect(onEndReached).not.toHaveBeenCalled();

      // The view ends on r14: 5 rows before the end
      await scrollTo(scroller, 10 * ROW);
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it('is called at once when a short first page does not fill the view', async () => {
      const onEndReached = vi.fn();

      await renderList({ data: ids(3), onEndReached });

      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it('is not called for an empty list', async () => {
      const onEndReached = vi.fn();

      await renderList({ data: [], onEndReached });

      expect(onEndReached).not.toHaveBeenCalled();
    });
  });

  describe('a known total (offset pagination)', () => {
    const placeholder = (index: number) => (
      <div data-placeholder={index}>…</div>
    );

    it('fills the rows past the loaded ones with placeholders, counted in the whole list', async () => {
      const { scroller } = await renderList({
        data: ids(10),
        count: 100,
        overscan: 0,
        renderPlaceholder: placeholder,
      });

      await scrollTo(scroller, 50 * ROW);

      expect(
        rows().map((li) =>
          li
            .querySelector('[data-placeholder]')
            ?.getAttribute('data-placeholder'),
        ),
      ).toEqual(['50', '51', '52', '53', '54']);
      expect(
        rows().every((li) => li.getAttribute('aria-busy') === 'true'),
      ).toBe(true);
      expect(rows()[0]?.getAttribute('aria-setsize')).toBe('100');
      expect((scroller.querySelector('ul') as HTMLElement).style.height).toBe(
        `${100 * ROW}px`,
      );
    });

    it('never asks getKey for a key of a row that is not loaded', async () => {
      type Task = { id: string };
      const getKey = vi.fn((task: Task) => task.id);

      render(
        <VirtualList<Task>
          className={SCROLLER}
          data={[{ id: 'a' }, { id: 'b' }]}
          count={50}
          fixedHeight={ROW}
          getKey={getKey}
          renderItem={(task) => item(task.id)}
          renderPlaceholder={placeholder}
        />,
      );
      await settle();

      expect(getKey.mock.calls.every(([task]) => task !== undefined)).toBe(
        true,
      );
      expect(rowOf('b')).toBeTruthy();
    });

    it('replaces a placeholder with its row once the page arrives', async () => {
      const { update } = await renderList({
        data: ids(2),
        count: 10,
        renderPlaceholder: placeholder,
      });
      expect(document.querySelector('[data-placeholder="3"]')).toBeTruthy();

      await update({
        data: ids(10),
        count: 10,
        renderPlaceholder: placeholder,
      });

      expect(document.querySelector('[data-placeholder]')).toBeNull();
      expect(rowOf('r3')?.getAttribute('aria-busy')).toBeNull();
    });

    it('puts a page that arrived out of order at its own place, holes around it as placeholders', async () => {
      // The user dragged the scrollbar to the middle: page 50 came before pages 1–49
      const data: (string | undefined)[] = ['r0', 'r1'];
      for (let i = 500; i < 510; i++) data[i] = `r${i}`;

      render(
        <VirtualList<string>
          className={SCROLLER}
          data={data}
          count={1000}
          overscan={0}
          fixedHeight={ROW}
          getKey={(id) => id}
          renderItem={(id) => item(id)}
          renderPlaceholder={placeholder}
        />,
      );
      await settle();
      const scroller = document.querySelector(`.${SCROLLER}`) as HTMLElement;

      expect(rows().map((li) => li.textContent)).toEqual([
        'r0',
        'r1',
        '…',
        '…',
        '…',
      ]);

      await scrollTo(scroller, 498 * ROW);

      expect(rows().map((li) => li.textContent)).toEqual([
        '…',
        '…',
        'r500',
        'r501',
        'r502',
      ]);
      expect(top(rowOf('r500') as Element)).toBe(500 * ROW);
    });

    it('reports the rows in view, to load them, and only when they change', async () => {
      const onRangeChange = vi.fn();
      const { scroller } = await renderList({
        data: ids(10),
        count: 1000,
        overscan: 0,
        onRangeChange,
        renderPlaceholder: placeholder,
      });

      expect(onRangeChange).toHaveBeenLastCalledWith({
        startIndex: 0,
        endIndex: 4,
      });
      const calls = onRangeChange.mock.calls.length;

      await scrollTo(scroller, 500 * ROW);
      expect(onRangeChange).toHaveBeenLastCalledWith({
        startIndex: 500,
        endIndex: 504,
      });
      expect(onRangeChange).toHaveBeenCalledTimes(calls + 1);

      // The same rows: nothing to report
      await scrollTo(scroller, 500 * ROW);
      expect(onRangeChange).toHaveBeenCalledTimes(calls + 1);
    });

    it('asks for more at the end of what is loaded, not of the total', async () => {
      const onEndReached = vi.fn();
      const { scroller } = await renderList({
        data: ids(10),
        count: 100,
        onEndReached,
        renderPlaceholder: placeholder,
      });

      await scrollTo(scroller, 6 * ROW);

      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it('does not put the cursor on a row that is not loaded', async () => {
      render(
        <VirtualList<number>
          className={SCROLLER}
          data={[0, 1, 2]}
          count={100}
          fixedHeight={ROW}
          cursorKey={50}
          renderItem={(value) => item(value)}
          renderPlaceholder={placeholder}
        />,
      );
      await settle();

      expect(
        (document.querySelector(`.${SCROLLER}`) as HTMLElement).scrollTop,
      ).toBe(0);
    });
  });

  describe('footer', () => {
    it('goes right after the list in its own scroller, so it scrolls in at the end', async () => {
      const { scroller } = await renderList({
        data: ids(10),
        footer: <div data-footer>Loading…</div>,
      });

      expect(
        scroller
          .querySelector('ul')
          ?.nextElementSibling?.hasAttribute('data-footer'),
      ).toBe(true);
    });

    it('goes right after the list in an outer scroll element too', async () => {
      const canvas = document.createElement('div');
      canvas.className = SCROLLER;
      document.body.append(canvas);

      render(
        <VirtualList<string>
          data={ids(10)}
          getKey={(id) => id}
          fixedHeight={ROW}
          getScrollElement={() => canvas}
          renderItem={(id) => item(id)}
          footer={<div data-footer>Couldn’t load more</div>}
        />,
        { container: canvas },
      );
      await settle();

      expect(
        canvas
          .querySelector('ul')
          ?.nextElementSibling?.hasAttribute('data-footer'),
      ).toBe(true);
      canvas.remove();
    });
  });
});
