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
  /** After a failed async menu item: how to try again. */
  menuRetryHint: string;
  /** Command palette: its name, the field, the empty result, the footer hints. */
  palette: string;
  paletteInput: string;
  palettePlaceholder: string;
  paletteScopedPlaceholder(scope: string): string;
  paletteNothingFound: string;
  paletteCreateGroup: string;
  paletteCancel: string;
  paletteHintMove: string;
  paletteHintRun: string;
  paletteEscClose: string;
  paletteEscClear: string;
  paletteEscBack: string;
  /** Screen states: a skeleton's name, refetching over data, what an error did to the data. */
  loading: string;
  refetching: string;
  dataSafe: string;
  dataUnchanged: string;
  copyErrorDetails: string;
  errorDetailsCopied: string;
  /** AppShell landmarks and resizers. */
  shellSidebar: string;
  shellPanel: string;
  resizeSidebar: string;
  resizePanel: string;
  /** The × of a popover, a dialog. */
  close: string;
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
  close: 'Close',
  loading: 'Loading',
  refetching: 'Updating',
  dataSafe: 'Your changes are safe.',
  dataUnchanged: 'Nothing was changed.',
  copyErrorDetails: 'Copy error details',
  errorDetailsCopied: 'Copied',
  shellSidebar: 'Sidebar',
  shellPanel: 'Task',
  resizeSidebar: 'Resize sidebar',
  resizePanel: 'Resize panel',
  palette: 'Command palette',
  paletteInput: 'Search commands, pages, tasks, people',
  palettePlaceholder: 'Type a command or search…',
  paletteScopedPlaceholder: (scope) => `Search ${scope.toLowerCase()}…`,
  paletteNothingFound: 'Nothing found',
  paletteCreateGroup: 'Create',
  paletteCancel: 'Cancel',
  paletteHintMove: 'move',
  paletteHintRun: 'run',
  paletteEscClose: 'close',
  paletteEscClear: 'clear',
  paletteEscBack: 'back',
  menuRetryHint: 'Enter to retry',
  more: (count) => `${count} more`,
};

export const MessagesContext = createContext<KitMessages>(DEFAULT_MESSAGES);

export const useMessages = () => useContext(MessagesContext);
