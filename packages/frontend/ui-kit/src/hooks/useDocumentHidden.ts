import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);

  return () => document.removeEventListener('visibilitychange', onChange);
};

const isHidden = () => document.visibilityState === 'hidden';

/** Whether the tab is hidden: timers that people are meant to see stand still meanwhile. */
export const useDocumentHidden = () => useSyncExternalStore(subscribe, isHidden, () => false);
