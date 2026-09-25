import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../../utils';
import { tooltipProps } from '../Tooltip';
import { useEscapeStack } from '../../interaction/escape';
import { getChordPrefixes, getEventHotkeyString, useHotkeysStore } from '../../interaction/hotkeys';
import { useAutoGrow } from './useAutoGrow';
import { useMessages } from '../../messages';
import styles from './InlineInput.module.scss';

/** How an edit starts: caret at the end, the whole value selected, or replaced by a typed character. */
export type InlineEditStart = 'caret' | 'selectAll' | 'type';
export type InlineSaveStatus = 'idle' | 'pending' | 'error' | 'conflict';
export type InlineInputSize = 'body' | 'title' | 'label';

export interface InlineInputProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'children' | 'defaultValue'> {
  /** The saved value. While editing, a new one does not replace what is being typed. */
  value: string;
  /** Controlled by the parent: the table knows where its cursor is (spec 04). */
  editing: boolean;
  /** The cell asks to enter (`true`, with how) or to leave (`false`) the edit. */
  onEditingChange(editing: boolean, how?: InlineEditStart, char?: string): void;
  /**
   * The edit is saved: Enter or blur (`move` undefined — then the cell also asks
   * to leave the edit), Tab / Shift+Tab (`move` 1 / -1 — the parent moves the
   * edit to the neighbour, so the cell does not ask to leave).
   */
  onCommit(value: string, move?: 1 | -1): void;
  /** Esc, or an empty required value: nothing is saved. */
  onCancel?(): void;
  /** The save in flight or its outcome. Optimistic: `value` is already the new one. */
  status?: InlineSaveStatus;
  /** With status `error`: what did not save. Shown in the tooltip; an edit starts from it. */
  unsavedValue?: string;
  onRetry?(): void;
  onResolveConflict?(): void;
  /** A message, or null when the value is fine. Only while editing; blocks saving. */
  validate?(value: string): string | null;
  /** Longer is allowed to type but not to save — a counter shows how much over. */
  maxLength?: number;
  /** An empty value is not saved: the previous one comes back. */
  required?: boolean;
  /** Read-only, and why: no hover, no edit, the reason in a tooltip. */
  readOnlyReason?: string;
  /** Wraps instead of truncating — the task title in the panel. */
  multiline?: boolean;
  /** body — a table cell; title — the panel heading; label — a column name. */
  size?: InlineInputSize;
  /**
   * The table's keyboard cursor is on this cell (application state, spec 05):
   * an accent frame. The mouse gets a thin one on hover by itself.
   */
  cursor?: boolean;
  /** Shown while the value is empty. */
  placeholder?: string;
  /**
   * Someone else changed the value. A new `key` (per remote edit) tints the
   * cell for --highlight-remote; `by` — the author's avatar, drawn by the app
   * (the kit knows no users) — is shown for as long as the app passes it.
   * During an edit the cell is not tinted: the parent reports a conflict.
   */
  remoteEdit?: { key: string | number; by?: React.ReactNode };
  ref?: React.Ref<HTMLDivElement>;
}

const isTextKey = (event: React.KeyboardEvent) =>
  event.key.length === 1 && event.key.trim() !== '' && !event.metaKey && !event.ctrlKey && !event.altKey;

/**
 * A letter the app uses as a hotkey (J, K, S…) or as the first step of a
 * sequence (G in "g b") does not start an edit (spec 04) — the registry says which.
 */
const isAppHotkey = (event: React.KeyboardEvent) => {
  const { hotkeys, getHotkeyHandler } = useHotkeysStore.getState();
  const step = getEventHotkeyString(event.nativeEvent);

  return getHotkeyHandler(step) !== undefined || getChordPrefixes(Object.keys(hotkeys)).has(step);
};

/**
 * In-place editing (spec 04, mode "inline"). At rest it is just the text of its
 * context — a cell, a heading, a column name; the frame appears only as an
 * answer: thin on hover, accent on the keyboard cursor, 2 px accent in the edit.
 * The geometry is the same at rest and in the edit: frames are inset shadows.
 */
export const InlineInput: React.FC<InlineInputProps> = ({
  value,
  editing,
  onEditingChange,
  onCommit,
  onCancel,
  status = 'idle',
  unsavedValue,
  onRetry,
  onResolveConflict,
  validate,
  maxLength,
  required = false,
  readOnlyReason,
  multiline = false,
  size = 'body',
  cursor = false,
  placeholder,
  remoteEdit,
  tabIndex = 0,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ref,
  ...props
}) => {
  const displayRef = useRef<HTMLSpanElement | null>(null);
  /** How the edit the cell asked for should start; read once by the editor. */
  const startRef = useRef<{ how: InlineEditStart; char?: string }>({ how: 'caret' });
  const wasEditing = useRef(editing);
  const [problem, setProblem] = useState<string | null>(null);
  const readOnly = readOnlyReason !== undefined;
  const messages = useMessages();
  // The key the cell was born with is not an edit: only a change lights it up.
  const [firstRemoteKey] = useState(remoteEdit?.key);
  const remoteKey = remoteEdit && remoteEdit.key !== firstRemoteKey ? remoteEdit.key : undefined;

  const requestEdit = (how: InlineEditStart, char?: string) => {
    startRef.current = { how, char };
    onEditingChange(true, how, char);
  };

  // After the edit, focus comes back to the cell — never to the body (spec 04).
  // If the user moved it elsewhere themselves, it stays there.
  useLayoutEffect(() => {
    if (wasEditing.current && !editing) {
      const active = document.activeElement;

      if (!active || active === document.body) {
        displayRef.current?.focus({ preventScroll: true });
      }

      startRef.current = { how: 'caret' };
      setProblem(null);
    }

    wasEditing.current = editing;
  }, [editing]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    // ⌘/Ctrl+Enter is not the cell's: it bubbles to the app, which opens the task (spec 10).
    if (readOnly || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    // A failed save: Enter retries instead of opening the edit (spec 04).
    if (event.key === 'Enter' && status === 'error' && onRetry) {
      event.preventDefault();
      onRetry();
      return;
    }

    if (event.key === 'Enter' && status === 'conflict' && onResolveConflict) {
      event.preventDefault();
      onResolveConflict();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      requestEdit('caret');
      return;
    }

    if (!isTextKey(event)) {
      return;
    }

    // E means "edit, everything selected" here — the same meaning as the app's E.
    if (event.key.toLowerCase() === 'e' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      requestEdit('selectAll');
      return;
    }

    if (isAppHotkey(event)) {
      return;
    }

    // Typing replaces the value with that character, as in spreadsheets.
    event.preventDefault();
    event.stopPropagation();
    requestEdit('type', event.key);
  };

  // The name says what the cell holds and how its save stands — "Title: Fix
  // login, conflict" — or a screen reader hears just "button".
  const spokenState =
    status === 'pending'
      ? messages.cellSaving
      : status === 'error'
        ? messages.cellNotSaved
        : status === 'conflict'
          ? messages.cellConflict
          : undefined;
  const shown = value || placeholder || '';
  const cellName = [ariaLabel ? `${ariaLabel}: ${shown}` : shown, spokenState].filter(Boolean).join(', ');

  const tooltip =
    readOnlyReason !== undefined
      ? tooltipProps({ reason: readOnlyReason })
      : status === 'error' && unsavedValue !== undefined
        ? tooltipProps({ text: unsavedValue })
        : multiline
          ? undefined
          : tooltipProps({ overflow: true }); // a long value: its full text

  return (
    <div
      {...props}
      ref={ref}
      className={cx(styles.root, styles[size], multiline && styles.multiline, className)}
      data-editing={editing ? '' : undefined}
      data-cursor={cursor && !readOnly ? '' : undefined}
      data-status={status === 'idle' ? undefined : status}
      data-readonly={readOnly ? '' : undefined}
      data-invalid={editing && problem ? '' : undefined}
    >
      {remoteKey !== undefined && !editing && (
        // Remounted by its key: every remote edit restarts the fade.
        <span key={remoteKey} className={styles.remoteFlash} aria-hidden="true" />
      )}

      {editing && !readOnly ? (
        <InlineEditor
          start={startRef.current}
          value={value}
          status={status}
          unsavedValue={unsavedValue}
          validate={validate}
          maxLength={maxLength}
          required={required}
          multiline={multiline}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          ariaLabelledBy={ariaLabelledBy}
          onProblem={setProblem}
          onCommit={onCommit}
          onCancel={onCancel}
          onEditingChange={onEditingChange}
        />
      ) : (
        <span
          ref={displayRef}
          role="button"
          tabIndex={tabIndex}
          className={cx(styles.display, !value && styles.placeholder)}
          aria-label={cellName || undefined}
          aria-disabled={readOnly || undefined}
          {...tooltip}
          // The root's own onKeyDown / onDoubleClick (rest props) still get these by bubbling.
          onKeyDown={handleKeyDown}
          onDoubleClick={() => {
            if (!readOnly) {
              requestEdit('caret');
            }
          }}
        >
          {value || placeholder}
        </span>
      )}

      {!editing && remoteEdit?.by && <span className={styles.author}>{remoteEdit.by}</span>}

      {!editing && status === 'pending' && <span className={styles.dot} aria-hidden="true" />}

      {!editing && status === 'error' && onRetry && (
        // Mouse affordance; from the keyboard Enter on the cell does the same.
        <button type="button" tabIndex={-1} className={styles.action} onClick={onRetry}>
          {messages.retry}
        </button>
      )}

      {!editing && status === 'conflict' && onResolveConflict && (
        <button type="button" tabIndex={-1} className={styles.action} onClick={onResolveConflict}>
          {messages.resolveConflict}
        </button>
      )}
    </div>
  );
};

interface InlineEditorProps
  extends Pick<
    InlineInputProps,
    | 'value'
    | 'status'
    | 'unsavedValue'
    | 'validate'
    | 'maxLength'
    | 'required'
    | 'multiline'
    | 'placeholder'
    | 'onCommit'
    | 'onCancel'
    | 'onEditingChange'
  > {
  start: { how: InlineEditStart; char?: string };
  ariaLabel?: string;
  ariaLabelledBy?: string;
  onProblem(problem: string | null): void;
}

/** Lives only while editing: its draft starts fresh with every edit. */
const InlineEditor: React.FC<InlineEditorProps> = ({
  start,
  value,
  status,
  unsavedValue,
  validate,
  maxLength,
  required,
  multiline,
  placeholder,
  ariaLabel,
  ariaLabelledBy,
  onProblem,
  onCommit,
  onCancel,
  onEditingChange,
}) => {
  const problemId = useId();
  const editorRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Over a failed save the edit starts from what did not save — typing is never lost.
  const [draft, setDraft] = useState(() =>
    start.how === 'type'
      ? (start.char ?? '')
      : status === 'error' && unsavedValue !== undefined
        ? unsavedValue
        : value,
  );

  const tooLong = maxLength !== undefined && draft.length > maxLength;
  const message = validate?.(draft) ?? null;
  const problem = message ?? (tooLong ? `${draft.length} / ${maxLength}` : null);

  // The latest draft for handlers that outlive a render (Esc ladder, blur).
  const latest = useRef({ draft, problem, settled: false });
  latest.current.draft = draft;
  latest.current.problem = problem;

  useLayoutEffect(() => {
    onProblem(problem);
  }, [problem, onProblem]);

  useAutoGrow(editorRef, draft, { enabled: Boolean(multiline) });

  useLayoutEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.focus({ preventScroll: true });

    if (start.how === 'selectAll') {
      editor.select();
    } else {
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
    // Once, when the edit starts: `start` is read at mount on purpose.
  }, []);

  const cancel = useCallback(() => {
    latest.current.settled = true;
    onCancel?.();
    onEditingChange(false);
  }, [onCancel, onEditingChange]);

  const save = (move?: 1 | -1) => {
    const { draft: next, problem: blocking, settled } = latest.current;

    // With a problem nothing is saved; Esc still cancels (spec 04).
    if (settled || blocking) {
      return;
    }

    if (required && next.trim() === '') {
      cancel();
      return;
    }

    latest.current.settled = true;
    onCommit(next, move);

    if (move === undefined) {
      onEditingChange(false);
    }
  };

  // Esc is a level of the ladder (spec 05): the edit is the first thing it undoes.
  const handleEscape = useCallback(() => {
    if (!latest.current.settled) {
      cancel();
    }

    return true;
  }, [cancel]);

  useEscapeStack(handleEscape);

  const editorProps = {
    ref: editorRef,
    className: styles.editor,
    value: draft,
    placeholder,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': problem ? problemId : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(event.target.value),
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      // Enter saves, also in a multiline title: it wraps, it has no line breaks.
      if (event.key === 'Enter') {
        event.preventDefault();
        save();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        save(event.shiftKey ? -1 : 1);
      }
    },
    // Leaving the cell saves; with a problem the edit stays open, nothing is lost.
    onBlur: () => save(),
  };

  return (
    <>
      {multiline ? <textarea {...editorProps} rows={1} /> : <input {...editorProps} type="text" />}

      {problem && (
        <span id={problemId} className={styles.problem}>
          {problem}
        </span>
      )}
    </>
  );
};
