# UI kit — deferred work

Things specified in the design docs but not built yet, because nothing needs
them so far. Each entry says where it goes and what "done" means.

## ConflictPopover

**File:** `src/components/Popover/ConflictPopover.tsx` (+ `.module.scss`, `.spec.tsx`, `.stories.tsx`; export from `src/components/Popover/index.ts`)

**Spec:** "Компоненты Verso — Popover", sections 04 (edit conflict) and 07 (API).

**When it is needed:** with in-place editing in the task table and the task
panel — the server rejected an edit because the object's `version` changed
meanwhile (philosophy §04, §14).

**API:**

```ts
type ConflictPopoverProps<V> = {
  mine:   { value: V; at: string };
  server: { value: V; at: string; by: ReactNode };   // the author, drawn by the app (Avatar + name)
  render(value: V): ReactNode;                        // how a value looks: status dot, avatar, text
  onResolve(pick: 'mine' | 'server'): void;
  trigger: ReactElement;                              // "Conflict · resolve" of the cell
};
```

**What it must do:**

1. Built on `Popover` (non-modal, default surface, one overlay at a time, Esc ladder).
   Title "Status changed while you edited" (from `KitRoot messages`).
2. Two option cards: yours on top (value + when you set it), the server's below
   (value + who and when). Neither is chosen in advance; the cursor starts on yours.
   Cursor look: `--border-accent` inset 1 px + 1 px, instant.
3. Keys: `1` / `2` choose at once; `↑` / `↓` move the cursor; `Enter` chooses;
   `Esc` postpones — the conflict stays, the cell keeps its stripe.
4. After the choice: `onResolve('mine' | 'server')` — "mine" is sent over the new
   version, "server" drops yours. The cell then highlights for 400 ms like a remote
   edit (`InlineInput` `remoteEdit`, `--highlight-remote`).
5. For text values (title, description): the cards show the start of both, plus a
   third row "Copy mine" that puts your text on the clipboard, so it is not lost
   when the server's is chosen.
6. Nothing is saved on close by Esc or a click outside — only an explicit choice.
7. Wire-up: `InlineInput` already has `status="conflict"` and `onResolveConflict`;
   the owner opens the popover from there.
8. Tests: the keys above, no pre-selection, Esc keeps the conflict, "Copy mine"
   for text. Stories: in a table cell (status, assignee) and for a title, light
   and dark surfaces.
