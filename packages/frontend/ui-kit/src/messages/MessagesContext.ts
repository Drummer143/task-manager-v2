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
  /** Tag: the × button; the tag's own text describes what is removed. */
  removeTag: string;
  /** Empty avatar that assigns someone on click. */
  assign: string;
  /** "+N" of a tag list or an avatar stack: what readers hear. */
  more(count: number): string;
}

export const DEFAULT_MESSAGES: KitMessages = {
  retry: 'Retry',
  resolveConflict: 'Conflict · resolve',
  cellSaving: 'saving',
  cellNotSaved: 'not saved',
  cellConflict: 'conflict',
  removeTag: 'Remove',
  assign: 'Assign',
  more: (count) => `${count} more`,
};

export const MessagesContext = createContext<KitMessages>(DEFAULT_MESSAGES);

export const useMessages = () => useContext(MessagesContext);
