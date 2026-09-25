import React from 'react';
import TooltipHost from '../Tooltip';
import { LayerHost } from '../../interaction/layers';
import { useListenEscape } from '../../interaction/escape';
import { useListenHotkey } from '../../interaction/hotkeys';
import { useSingleInstance } from '../../hooks/useSingleInstance';
import { RouterContext, type RouterAdapter } from '../../router';

export interface KitRootProps {
  children: React.ReactNode;
  /**
   * How kit links navigate without a reload. Without it they are plain links
   * (full page load), and the kit warns in development. Keep it stable for the
   * app's lifetime: its `useHref` is called as a hook.
   */
  router?: RouterAdapter;
}

/** Mounts all hosts, global context providers and listeners */
export const KitRoot: React.FC<KitRootProps> = ({ children, router }) => {
  // Only for the development warning: the hosts below guard themselves.
  useSingleInstance('KitRoot');

  useListenEscape();

  useListenHotkey();

  return (
    <RouterContext.Provider value={router ?? null}>
      {children}

      <TooltipHost />
      <LayerHost />
    </RouterContext.Provider>
  );
};
