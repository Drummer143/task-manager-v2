import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../../utils';
import { SearchIcon } from '../../icons';
import { useMessages } from '../../messages';
import { useRouter } from '../../router';
import { useExclusiveOverlay } from '../../overlay';
import { useLayerStore } from '../../interaction/layers';
import { Kbd } from '../Kbd';
import { Surface } from '../Surface';
import { matchLabel } from './matchLabel';
import { usePaletteStore } from './store';
import type { PaletteItem, PaletteSource } from './types';
import { useSearch, type SearchGroup } from './useSearch';
import styles from './CommandPalette.module.scss';

/** Mixed search shows a few per group; narrowed — up to fifty, scrolling (spec 06). */
const MIXED_LIMIT = 5;
const SCOPED_LIMIT = 50;

const CREATE_SOURCE_ID = '\u0000create';

interface Row {
  item: PaletteItem;
  domId: string;
}

const Highlighted: React.FC<{ label: string; query: string }> = ({ label, query }) => (
  <>
    {matchLabel(label, query).segments.map((segment, index) =>
      segment.match ? <b key={index}>{segment.text}</b> : <React.Fragment key={index}>{segment.text}</React.Fragment>,
    )}
  </>
);

/**
 * The command palette (spec: CommandPalette; philosophy 06) — the menu of the
 * whole app. One field; groups from the sources the screens registered; a
 * prefix narrows to one source; a command can ask for a second step or for a
 * confirmation — inside the palette, never a dialog. It lives in the app's
 * single layer: opened with ⌘K, Esc steps back, focus returns where it was.
 */
export const CommandPalette: React.FC = () => {
  const messages = useMessages();
  const router = useRouter();
  const registered = usePaletteStore((state) => state.sources);
  const create = usePaletteStore((state) => state.create);
  const listId = useId();
  const rowIdBase = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  /** A prefix typed first narrows the search to that source. */
  const [scope, setScope] = useState<PaletteSource | null>(null);
  /** Second steps: "Move 2 tasks to…" replaces the list with its variants. */
  const [steps, setSteps] = useState<PaletteSource[]>([]);
  const [confirming, setConfirming] = useState<PaletteItem | null>(null);
  const [confirmCursor, setConfirmCursor] = useState(0);
  const [cursor, setCursor] = useState(0);

  const close = () => useLayerStore.getState().closeLayer();

  // Opening the palette closes an open menu or popover: one overlay at a time.
  useExclusiveOverlay(true, close);

  const step = steps[steps.length - 1];
  const narrowed = step ?? scope;
  const active = narrowed ? [narrowed] : registered.map((entry) => entry.current);
  const groups: SearchGroup[] = useSearch(active, query, narrowed !== null, narrowed ? SCOPED_LIMIT : MIXED_LIMIT);

  // Nothing found is not a dead end: the query can become a new task (spec 06).
  const createItems = !narrowed && query.trim() && create ? create.current(query.trim()) : [];
  const allGroups: SearchGroup[] =
    createItems.length > 0
      ? [...groups, { source: { id: CREATE_SOURCE_ID, title: messages.paletteCreateGroup, search: () => [] }, items: createItems }]
      : groups;

  const rows: Row[] = allGroups.flatMap((group) =>
    group.items.map((item) => ({ item, domId: `${rowIdBase}-${group.source.id}-${item.id}` })),
  );
  const selectable = rows.filter((row) => row.item.disabledReason === undefined);
  const current = selectable.length > 0 ? selectable[Math.min(cursor, selectable.length - 1)] : undefined;

  useLayoutEffect(() => {
    // The field is focused in the first frame: typing never waits (spec 06).
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (current) {
      document.getElementById(current.domId)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [current]);

  const changeQuery = (value: string) => {
    // A prefix typed first narrows the search — only at the top, not inside a step.
    const prefixed = narrowed
      ? undefined
      : registered.map((entry) => entry.current).find((source) => source.prefix && value.startsWith(source.prefix));

    if (prefixed) {
      setScope(prefixed);
      setQuery(value.slice(prefixed.prefix?.length ?? 0));
    } else {
      setQuery(value);
    }

    setCursor(0);
  };

  const run = (item: PaletteItem, newTab = false) => {
    if (item.disabledReason !== undefined) {
      return;
    }

    if (item.confirm && !confirming) {
      setConfirming(item);
      setConfirmCursor(0);
      return;
    }

    if (item.next) {
      setSteps((current) => [...current, item.next as PaletteSource]);
      setScope(null);
      setQuery('');
      setCursor(0);
      return;
    }

    // Close first: focus goes back where it was, then the action runs (spec 06).
    close();

    if (item.href) {
      if (newTab) {
        window.open(item.href, '_blank', 'noopener,noreferrer');
      } else if (router) {
        router.navigate(item.href);
      } else {
        window.location.assign(item.href);
      }
    }

    item.onSelect?.();
  };

  const back = () => {
    setConfirming(null);
    inputRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (confirming) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setConfirmCursor((value) => (value === 0 ? 1 : 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();

        if (confirmCursor === 1) {
          run(confirming);
        } else {
          back();
        }
      } else if (event.key === 'Escape') {
        // A step back, not a close: the Esc ladder does not see this press.
        event.preventDefault();
        back();
      } else if (event.key === 'Tab') {
        event.preventDefault();
      }

      return;
    }

    const count = selectable.length;
    const index = current ? selectable.indexOf(current) : 0;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();

        if (count > 0) {
          setCursor((index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
        }
        break;
      case 'Home':
        event.preventDefault();
        setCursor(0);
        break;
      case 'End':
        event.preventDefault();
        setCursor(Math.max(0, count - 1));
        break;
      case 'Enter':
        event.preventDefault();

        if (current) {
          run(current.item, event.metaKey || event.ctrlKey);
        }
        break;
      case 'Escape':
        // Esc steps back (spec 06): clear the field first; with nothing to
        // clear the press goes on to the Esc ladder, which closes the layer.
        if (query || scope) {
          event.preventDefault();
          setQuery('');
          setScope(null);
          setCursor(0);
        }
        break;
      case 'Backspace':
        if (!query && (scope || steps.length > 0)) {
          event.preventDefault();

          if (scope) {
            setScope(null);
          } else {
            setSteps((current) => current.slice(0, -1));
          }

          setCursor(0);
        }
        break;
      case 'Tab':
        // A layer: focus stays in the field.
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  const escHint = confirming ? messages.paletteEscBack : query || scope ? messages.paletteEscClear : messages.paletteEscClose;
  const prefixed = registered.map((entry) => entry.current).filter((source) => source.prefix);

  return (
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        // A click on the dimmed page closes it; inside the window it does not.
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <Surface tone="default" asChild>
        <div className={styles.window} role="dialog" aria-modal="true" aria-label={messages.palette}>
          <div className={styles.inputRow}>
            <SearchIcon className={styles.searchIcon} />
            {narrowed && <span className={styles.scope}>{narrowed.title}</span>}
            <input
              ref={inputRef}
              className={styles.input}
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={confirming ? undefined : current?.domId}
              aria-label={messages.paletteInput}
              placeholder={narrowed ? messages.paletteScopedPlaceholder(narrowed.title) : messages.palettePlaceholder}
              value={query}
              readOnly={confirming !== null}
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {confirming ? (
            <div className={styles.confirm}>
              <p className={styles.confirmText}>
                <strong>{confirming.confirm?.title}</strong>
                {confirming.confirm?.body && <> {confirming.confirm.body}</>}
              </p>
              <div role="listbox" id={listId} aria-label={confirming.confirm?.title}>
                {[
                  { label: messages.paletteCancel, keys: 'esc', danger: false },
                  { label: confirming.confirm?.label ?? '', keys: 'enter', danger: true },
                ].map((option, index) => (
                  <div
                    key={option.label}
                    role="option"
                    aria-selected={confirmCursor === index}
                    className={cx(styles.row, option.danger && styles.danger)}
                    data-cursor={confirmCursor === index ? '' : undefined}
                    onMouseMove={() => setConfirmCursor(index)}
                    onClick={() => (index === 1 ? run(confirming) : back())}
                  >
                    <span className={styles.label}>{option.label}</span>
                    <Kbd className={styles.keys} keys={option.keys} variant="inline" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div ref={listRef} className={styles.list} id={listId} role="listbox" aria-label={messages.palette}>
              {allGroups.map((group) => {
                const labelId = `${rowIdBase}-${group.source.id}-label`;

                return (
                  <div key={group.source.id} role="group" aria-labelledby={labelId}>
                    <div id={labelId} className={styles.groupLabel} role="presentation">
                      {group.source.title}
                    </div>
                    {group.items.map((item) => {
                      const row = rows.find((candidate) => candidate.item === item) as Row;
                      const isCurrent = current?.item === item;
                      const disabled = item.disabledReason !== undefined;

                      return (
                        <div
                          key={item.id}
                          id={row.domId}
                          role="option"
                          aria-selected={isCurrent}
                          aria-disabled={disabled || undefined}
                          className={cx(
                            styles.row,
                            item.danger && styles.danger,
                            group.source.id === CREATE_SOURCE_ID && styles.create,
                          )}
                          data-cursor={isCurrent ? '' : undefined}
                          onMouseMove={() => {
                            if (!disabled && !isCurrent) {
                              setCursor(selectable.indexOf(row));
                            }
                          }}
                          onClick={(event) => run(item, event.metaKey || event.ctrlKey)}
                        >
                          {item.icon && (
                            <span className={styles.icon} aria-hidden="true">
                              {item.icon}
                            </span>
                          )}
                          {item.meta && <span className={styles.meta}>{item.meta}</span>}
                          <span className={styles.label}>
                            <Highlighted label={item.label} query={query} />
                          </span>
                          {item.path && <span className={styles.path}>{item.path}</span>}
                          {item.keys && <Kbd className={styles.keys} keys={item.keys} variant="inline" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {allGroups.length === 0 && <div className={styles.empty}>{messages.paletteNothingFound}</div>}
            </div>
          )}

          <div className={styles.footer} aria-hidden="true">
            <span>
              <span className={styles.hintKey}>↑↓</span> {messages.paletteHintMove}
            </span>
            <span>
              <span className={styles.hintKey}>↵</span> {messages.paletteHintRun}
            </span>
            {prefixed.length > 0 && (
              <span>
                {prefixed.map((source, index) => (
                  <React.Fragment key={source.id}>
                    {index > 0 && ' · '}
                    <span className={styles.hintKey}>{source.prefix}</span> {source.title.toLowerCase()}
                  </React.Fragment>
                ))}
              </span>
            )}
            <span className={styles.escHint}>
              <span className={styles.hintKey}>esc</span> {escHint}
            </span>
          </div>
        </div>
      </Surface>
    </div>
  );
};
