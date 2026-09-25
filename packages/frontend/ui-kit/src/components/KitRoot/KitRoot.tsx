import React, { useMemo } from 'react';
import TooltipHost from '../Tooltip';
import { LayerHost } from '../../interaction/layers';
import { useListenEscape } from '../../interaction/escape';
import { useListenHotkey } from '../../interaction/hotkeys';
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
}

/** Mounts all hosts, global context providers and listeners */
export const KitRoot: React.FC<KitRootProps> = ({ children, router, messages }) => {
  // Only for the development warning: the hosts below guard themselves.
  useSingleInstance('KitRoot');

  useListenEscape();

  useListenHotkey();

  const kitMessages = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messages }), [messages]);

  return (
    <RouterContext.Provider value={router ?? null}>
      <MessagesContext.Provider value={kitMessages}>
        {children}

        <TooltipHost />
        <LayerHost />
      </MessagesContext.Provider>
    </RouterContext.Provider>
  );
};
