/**
 * The view-state contract (spec 05: "the view lives in the URL").
 *
 * One place owns the schema, parser, serializer, defaults and types. Kit
 * components never touch the URL — they receive a plain `ViewState` and emit
 * changes. That is what makes them controlled and the view shareable by link.
 *
 * Query shape:
 *   ?view=board&group=status&sort=-due&f.assignee=me&f.due=overdue&task=TM-248
 *
 * Rules encoded here:
 *   • defaults are not written (a clean board link has no query at all);
 *   • filters use the `f.` prefix, multiple values comma-separated;
 *   • unknown params are ignored on read and preserved on write.
 */

export type ViewKind = 'board' | 'table';
export type GroupBy = 'status' | 'assignee' | 'priority' | 'none';

export interface ViewState {
  /** Board (default) or table. */
  view: ViewKind;
  /** Grouping — columns on the board, sections in the table. */
  group: GroupBy;
  /** Single sort field, `-` prefix = descending. null = default order. */
  sort: string | null;
  /** Filters keyed without the `f.` prefix, e.g. { assignee: ['me'] }. */
  filters: Record<string, string[]>;
  /** Open task id (drives the panel). null = panel closed. */
  task: string | null;
}

export const DEFAULT_VIEW_STATE: ViewState = {
  view: 'board',
  group: 'status',
  sort: null,
  filters: {},
  task: null,
};

export const VIEW_KINDS: readonly ViewKind[] = ['board', 'table'];
export const GROUP_BYS: readonly GroupBy[] = ['status', 'assignee', 'priority', 'none'];

export const FILTER_PREFIX = 'f.';
export const KNOWN_KEYS = new Set(['view', 'group', 'sort', 'task']);

const isViewKind = (v: string | null): v is ViewKind => v != null && (VIEW_KINDS as string[]).includes(v);
const isGroupBy = (v: string | null): v is GroupBy => v != null && (GROUP_BYS as string[]).includes(v);
const isFilterKey = (key: string): boolean => key.startsWith(FILTER_PREFIX);

function toParams(input: URLSearchParams | string): URLSearchParams {
  return typeof input === 'string' ? new URLSearchParams(input) : input;
}

/** Read a query string / URLSearchParams into a ViewState. Unknown params are ignored. */
export function parseViewState(input: URLSearchParams | string): ViewState {
  const params = toParams(input);

  const view = isViewKind(params.get('view')) ? (params.get('view') as ViewKind) : DEFAULT_VIEW_STATE.view;
  const group = isGroupBy(params.get('group')) ? (params.get('group') as GroupBy) : DEFAULT_VIEW_STATE.group;

  const sortRaw = params.get('sort');
  const sort = sortRaw != null && sortRaw !== '' ? sortRaw : null;

  const filters: Record<string, string[]> = {};
  for (const [key, value] of params.entries()) {
    if (!isFilterKey(key) || value === '') continue;
    const name = key.slice(FILTER_PREFIX.length);
    const values = value.split(',').filter((v) => v !== '');
    if (values.length > 0) filters[name] = values;
  }

  const task = params.get('task');

  return { view, group, sort, filters, task: task != null && task !== '' ? task : null };
}

/**
 * Write a ViewState back to URLSearchParams, omitting defaults. Pass `base` to
 * preserve unknown params already in the URL (schema-forward compatibility).
 */
export function serializeViewState(state: ViewState, base?: URLSearchParams | string): URLSearchParams {
  const params = base != null ? new URLSearchParams(toParams(base)) : new URLSearchParams();

  // Drop every key we own, keep the rest (unknown params survive).
  for (const key of [...params.keys()]) {
    if (KNOWN_KEYS.has(key) || isFilterKey(key)) params.delete(key);
  }

  if (state.view !== DEFAULT_VIEW_STATE.view) params.set('view', state.view);
  if (state.group !== DEFAULT_VIEW_STATE.group) params.set('group', state.group);
  if (state.sort != null && state.sort !== '') params.set('sort', state.sort);

  for (const [name, values] of Object.entries(state.filters)) {
    if (values.length > 0) params.set(`${FILTER_PREFIX}${name}`, values.join(','));
  }

  if (state.task != null && state.task !== '') params.set('task', state.task);

  return params;
}
