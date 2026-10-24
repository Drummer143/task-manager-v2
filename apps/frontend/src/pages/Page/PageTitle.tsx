import React, { useState } from 'react';
import { UNTITLED } from '../../shared/pages';
import styles from './Page.module.scss';

export interface PageTitleProps {
  title: string;
  /** Right after the page was created: the cursor is in the title (creation spec §03). */
  autoFocus?: boolean;
  /** A trimmed, changed title. */
  onSave(title: string): void;
}

/**
 * The page's title, edited in place: saved on Enter and when the field is left, Esc puts back the
 * saved one. An empty title is allowed: the page is "Untitled". It shows in the tree once saved;
 * showing every keystroke there is the work of drafts over the cache (TODO → Pages).
 */
export const PageTitle: React.FC<PageTitleProps> = ({ title, autoFocus, onSave }) => {
  const [draft, setDraft] = useState(title);
  const [saved, setSaved] = useState(title);

  // Renamed elsewhere (the tree, another tab): the field follows unless it holds an edit
  if (title !== saved) {
    setSaved(title);
    if (draft === saved) setDraft(title);
  }

  const save = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== saved) onSave(next);
  };

  return (
    <input
      className={styles.title}
      aria-label="Page title"
      placeholder={UNTITLED}
      value={draft}
      maxLength={200}
      // The page opened by its creation: the title is the first thing to type
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setDraft(saved);
          event.currentTarget.blur();
        }
      }}
    />
  );
};
