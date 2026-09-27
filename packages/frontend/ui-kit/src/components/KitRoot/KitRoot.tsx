import React, { useMemo } from 'react';
import TooltipHost from '../Tooltip';
import { LayerHost } from '../../interaction/layers';
import { useListenEscape } from '../../interaction/escape';
import { useListenHotkey } from '../../interaction/hotkeys';
import { useListenPalette } from '../CommandPalette/hooks';
import { ToastHost } from '../Toast/ToastHost';
import type { NotifyPolicy } from '../Toast/types';
import { useSingleInstance } from '../../hooks/useSingleInstance';
import { RouterContext, type RouterAdapter } from '../../router';
import { DEFAULT_MESSAGES, MessagesContext, type KitMessages } from '../../messages';

export interface KitRootProps {
  children: React.ReactNode;
  /**
   * How kit links navigate without a reload. Without it they are plain links
   * (full page load), and the kit warns in development. Keep it stable for the
   * app's lifetime: its `useHref` is called as a hook.
   */
  router?: RouterAdapter;
  /** The kit's own strings (a translation); missing ones fall back to English. */
  messages?: Partial<KitMessages>;
  /**
   * Which notifications may interrupt as a toast: the app's rules (kinds, the
   * inbox or the subject already open, quiet hours, bots). The lane's own rules
   * — a visible tab, one in --notify-gap, "+N more" — are the kit's.
   */
  notifyPolicy?: NotifyPolicy;
}

/** Mounts all hosts, global context providers and listeners */
export const KitRoot: React.FC<KitRootProps> = ({ children, router, messages, notifyPolicy }) => {
  // Only for the development warning: the hosts below guard themselves.
  useSingleInstance('KitRoot');

  useListenEscape();

  useListenHotkey();

  // ⌘K on any screen: the palette opens as the app's layer (in LayerHost below).
  useListenPalette();

  const kitMessages = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messages }), [messages]);

  return (
    <RouterContext.Provider value={router ?? null}>
      <MessagesContext.Provider value={kitMessages}>
        {children}

        <TooltipHost />
        {/* Undo, progress, error, note and notifications; mod+Z and F8 live here too. */}
        <ToastHost notifyPolicy={notifyPolicy} />
        {/* The app's single layer — the command palette renders here too:
            ⌘K (useListenPalette above) opens it as a layer, not as a host of its own. */}
        <LayerHost />
      </MessagesContext.Provider>
    </RouterContext.Provider>
  );
};
