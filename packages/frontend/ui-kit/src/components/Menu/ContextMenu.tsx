import React, { cloneElement, isValidElement, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MenuPanel } from './MenuContent';
import type { MenuItem } from './types';
import { useMenuRoot } from './useMenuRoot';

export interface ContextMenuProps {
  /** The same actions as the element's menu and the selection bar. */
  items: MenuItem[];
  /** One element: a card, a row, a tree node. It gets two handlers, nothing else. */
  children: React.ReactElement;
  'aria-label'?: string;
  /** Opening from code — a composite widget whose focus is not on the row. */
  ref?: React.Ref<ContextMenuHandle>;
}

export interface ContextMenuHandle {
  /**
   * Opens the menu at an element's bottom-left corner, as from the keyboard:
   * closing brings focus back to `returnFocusTo` (default: the anchor). For
   * widgets that keep focus on themselves and point at the active item (a tree
   * with aria-activedescendant): Shift+F10 and the row's ⋯ both go here.
   */
  openAt(anchor: HTMLElement, returnFocusTo?: HTMLElement): void;
}

interface OpenRequest {
  x: number;
  y: number;
  /** Opened from the keyboard: closing brings focus back to the element. */
  keyboard: boolean;
  element: HTMLElement;
}

interface LiveMenuHandle {
  open(request: OpenRequest): void;
}

type ChildProps = {
  onContextMenu?: React.MouseEventHandler<HTMLElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
};

/** Shift+F10 or the context menu key (spec 09). */
const isMenuKey = (event: React.KeyboardEvent) =>
  event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

/** From the keyboard the menu opens at the element's bottom-left corner, not at the mouse (spec 09). */
const cornerOf = (element: HTMLElement): OpenRequest => {
  const rect = element.getBoundingClientRect();

  return { x: rect.left, y: rect.bottom, keyboard: true, element };
};

/** The menu machine, mounted on the first request and kept for the next ones. */
const LiveMenu: React.FC<{
  items: MenuItem[];
  first: OpenRequest;
  'aria-label'?: string;
  ref: React.Ref<LiveMenuHandle>;
}> = ({ items, first, 'aria-label': ariaLabel, ref }) => {
  const openedFrom = useRef<OpenRequest>(first);
  const { api, level } = useMenuRoot({
    items,
    'aria-label': ariaLabel,
    onOpenChange: (open) => {
      // Zag returns focus only to a button trigger; from the keyboard it
      // must go back to the element the menu was opened on (spec 09).
      if (!open && openedFrom.current.keyboard) {
        const { element } = openedFrom.current;

        queueMicrotask(() => element.focus({ preventScroll: true }));
      }
    },
  });

  const open = (request: OpenRequest) => {
    openedFrom.current = request;
    // Zag's own context-menu path — it takes the point and positions the menu there.
    api.getContextTriggerProps().onContextMenu?.({
      clientX: request.x,
      clientY: request.y,
      preventDefault: () => undefined,
    } as unknown as React.MouseEvent<HTMLElement>);
  };

  useImperativeHandle(ref, () => ({ open }));

  const served = useRef(false);

  useEffect(() => {
    // The request that brought this menu to life is served once it exists.
    if (!served.current) {
      served.current = true;
      open(first);
    }
  });

  return <MenuPanel level={level} items={items} />;
};

/**
 * The context menu of an element (spec 09): right click, or Shift+F10 / the
 * menu key — then at the element's corner. Lazy: until the first request
 * there is no menu machine at all, so hundreds of cards each wrapped in one
 * cost two handlers. The element itself is never re-created.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ children, items, 'aria-label': ariaLabel, ref }) => {
  const [first, setFirst] = useState<OpenRequest | null>(null);
  const live = useRef<LiveMenuHandle>(null);

  const ask = (request: OpenRequest) => {
    if (live.current) {
      live.current.open(request);
    } else {
      setFirst(request);
    }
  };

  useImperativeHandle(ref, () => ({
    openAt: (anchor, returnFocusTo = anchor) => ask({ ...cornerOf(anchor), element: returnFocusTo }),
  }));

  if (!isValidElement<ChildProps>(children)) {
    return children;
  }

  return (
    <>
      {cloneElement(children, {
        onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
          children.props.onContextMenu?.(event);

          if (!event.defaultPrevented) {
            // Ours instead of the browser's.
            event.preventDefault();
            ask({ x: event.clientX, y: event.clientY, keyboard: false, element: event.currentTarget });
          }
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
          children.props.onKeyDown?.(event);

          if (!event.defaultPrevented && isMenuKey(event)) {
            event.preventDefault();
            ask(cornerOf(event.currentTarget));
          }
        },
      })}
      {first && <LiveMenu ref={live} items={items} first={first} aria-label={ariaLabel} />}
    </>
  );
};
