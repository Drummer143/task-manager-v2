import React from 'react';
import TooltipHost from '../Tooltip';
import { LayerHost } from '../../interaction/layers';
import { useListenEscape } from '../../interaction/escape';
import { useListenHotkey } from '../../interaction/hotkeys';
import { useSingleInstance } from '../../hooks/useSingleInstance';

export interface KitRootProps {
  children: React.ReactNode;
}

/** Mounts all hosts, global context providers and listeners */
export const KitRoot: React.FC<KitRootProps> = ({ children }) => {
  // Only for the development warning: the hosts below guard themselves.
  useSingleInstance('KitRoot');

  useListenEscape();

  useListenHotkey();

  return (
    <>
      {children}

      <TooltipHost />
      <LayerHost />
    </>
  );
};
