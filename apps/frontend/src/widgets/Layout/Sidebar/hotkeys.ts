import { useMemo } from 'react';
import { toggleSidebar, useRegisterHotkey, type HotkeyHandlerConfig } from '@task-manager-v2/ui-kit';

export const SIDEBAR_TOGGLE_KEYS = 'mod+\\';

export const INBOX_KEYS = 'g i';

const TOGGLE_WITH_META: HotkeyHandlerConfig = {
  key: '\\',
  meta: true,
  callback: toggleSidebar,
  description: 'Toggle sidebar',
};

const TOGGLE_WITH_CTRL: HotkeyHandlerConfig = { ...TOGGLE_WITH_META, meta: false, ctrl: true };

export const useSidebarHotkeys = (openInbox: () => void) => {
  useRegisterHotkey(TOGGLE_WITH_META);
  useRegisterHotkey(TOGGLE_WITH_CTRL);

  const inbox = useMemo<HotkeyHandlerConfig>(
    () => ({ key: 'i', chord: { key: 'g' }, callback: openInbox, description: 'Go to Inbox' }),
    [openInbox],
  );

  useRegisterHotkey(inbox);
};
