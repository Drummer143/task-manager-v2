import type { ReactNode } from 'react';

/** A row of the palette: a command, a page, a task, a person — whatever the product passes. */
export interface PaletteItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Shown at the right: the palette teaches the hotkey (spec 06). */
  keys?: string;
  /** Muted, before the label in mono: a task id. */
  meta?: string;
  /** Muted, at the right: where it lives — "Product / Web". */
  path?: string;
  danger?: boolean;
  disabledReason?: string;
  /** Enter opens it through the router; ⌘Enter — in a new tab. */
  href?: string;
  /** Irreversible: a second step inside the palette, never a dialog (spec 06). */
  confirm?: { title: string; body?: string; label: string };
  /** A command with a second step ("Move 2 tasks to…"): its variants replace the list. */
  next?: PaletteSource;
  /** Runs after the palette closes — focus is already back where it was. */
  onSelect?(): void;
}

export interface PaletteSearchContext {
  /** Aborted as soon as the query changes: a late answer never lands. */
  signal: AbortSignal;
  /** The user narrowed the search to this source with its prefix. */
  scoped: boolean;
}

/**
 * A group of the palette, provided by the product. Its search gets the query
 * without the prefix and answers from its cache at once (an array), or later
 * (a Promise) — then its rows are added when they arrive.
 */
export interface PaletteSource {
  id: string;
  /** The group title, and the scope chip when narrowed to it. */
  title: string;
  /** `>` commands, `#` tasks, `@` people, `?` help — typed first, it narrows the search to this source. */
  prefix?: string;
  search(query: string, context: PaletteSearchContext): PaletteItem[] | Promise<PaletteItem[]>;
}

/** Rows offered when the query is not empty: "Create task “…”" — the input is never lost (spec 06). */
export type PaletteCreate = (query: string) => PaletteItem[];
