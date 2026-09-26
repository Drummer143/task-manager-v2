import { useEffect, useId } from 'react';
import * as menu from '@zag-js/menu';
import { normalizeProps, useMachine } from '@zag-js/react';
import { raw } from '../../tokens';
import { useExclusiveOverlay } from '../../overlay';
import type { MenuApi, MenuLevelContext } from './MenuContent';
import type { MenuActionItem, MenuItem } from './types';
import { useAsyncItems } from './useAsyncItems';

const findAction = (items: MenuItem[], id: string) =>
  items.find((item): item is MenuActionItem => item.type === 'action' && item.id === id);

interface MenuRootOptions {
  items: MenuItem[];
  open?: boolean;
  onOpenChange?(open: boolean): void;
  'aria-label'?: string;
  placement?: `${'bottom' | 'top' | 'right' | 'left'}-${'start' | 'end'}`;
}

interface MenuRoot {
  api: MenuApi;
  service: menu.Service;
  level: MenuLevelContext;
  close(): void;
}

/**
 * The root of a menu — a dropdown or a context menu: Zag's machine, the
 * choice of an item (closing in the same frame unless it is async), async
 * items and the one-overlay-at-a-time rule.
 */
export const useMenuRoot = ({
  items,
  open,
  onOpenChange,
  'aria-label': ariaLabel,
  placement = 'bottom-start',
}: MenuRootOptions): MenuRoot => {
  const service = useMachine(menu.machine, {
    id: useId(),
    open,
    'aria-label': ariaLabel,
    loopFocus: true,
    onOpenChange: (details) => onOpenChange?.(details.open),
    onSelect: ({ value }) => {
      const action = findAction(items, value);

      if (action) {
        runAction(action);
      }
    },
    positioning: {
      placement,
      gutter: raw['menu-offset'],
      overflowPadding: raw['overlay-margin'],
      flip: true,
      slide: true,
    },
  });
  const api = menu.connect(service, normalizeProps);
  const close = () => api.setOpen(false);
  const asyncItems = useAsyncItems(close);

  // A link item navigates by its own click; a disabled one does nothing.
  const runAction = (item: MenuActionItem) => {
    if (item.disabledReason !== undefined || item.href !== undefined) {
      return;
    }

    if (asyncItems.run(item.id, item.onSelect)) {
      close();
    }
  };

  const { setOpen: syncAsyncOpen } = asyncItems;

  useEffect(() => {
    syncAsyncOpen(api.open);
    // Only the open state matters; the setter is recreated every render.
  }, [api.open]);

  useExclusiveOverlay(api.open, close);

  const level: MenuLevelContext = {
    api,
    service,
    runAction,
    asyncState: asyncItems.stateOf,
    depth: 0,
  };

  return { api, service, level, close };
};
