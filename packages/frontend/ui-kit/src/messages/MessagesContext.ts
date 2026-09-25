import { createContext, useContext } from 'react';

/**
 * Every string the kit itself shows or speaks. English defaults; the app
 * passes its own (a translation) to `KitRoot messages={…}` — no string is
 * hardcoded in a component.
 */
export interface KitMessages {
  /** Inline cell: repeat a failed save. */
  retry: string;
  /** Inline cell: open the conflict resolution. */
  resolveConflict: string;
  /** Spoken state of an inline cell, after its value. */
  cellSaving: string;
  cellNotSaved: string;
  cellConflict: string;
}

export const DEFAULT_MESSAGES: KitMessages = {
  retry: 'Retry',
  resolveConflict: 'Conflict · resolve',
  cellSaving: 'saving',
  cellNotSaved: 'not saved',
  cellConflict: 'conflict',
};

export const MessagesContext = createContext<KitMessages>(DEFAULT_MESSAGES);

export const useMessages = () => useContext(MessagesContext);
