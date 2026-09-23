import { DEFAULT_VIEW_STATE, parseViewState, serializeViewState, type ViewState } from './viewState';

const roundTrip = (state: ViewState): ViewState => parseViewState(serializeViewState(state));

describe('viewState', () => {
  it('parses a full query into a ViewState', () => {
    const state = parseViewState('view=table&group=assignee&sort=-due&f.assignee=me&f.due=overdue&task=TM-248');
    expect(state).toEqual({
      view: 'table',
      group: 'assignee',
      sort: '-due',
      filters: { assignee: ['me'], due: ['overdue'] },
      task: 'TM-248',
    });
  });

  it('applies defaults for missing/invalid params', () => {
    expect(parseViewState('')).toEqual(DEFAULT_VIEW_STATE);
    // Invalid values fall back to defaults.
    expect(parseViewState('view=grid&group=nonsense')).toEqual(DEFAULT_VIEW_STATE);
  });

  it('does not write defaults (a clean board has no query)', () => {
    expect(serializeViewState(DEFAULT_VIEW_STATE).toString()).toBe('');
    const boardWithFilter = serializeViewState({ ...DEFAULT_VIEW_STATE, filters: { assignee: ['me'] } });
    expect(boardWithFilter.toString()).toBe('f.assignee=me');
    // view=board and group=status are defaults, so they are omitted.
    expect(boardWithFilter.has('view')).toBe(false);
    expect(boardWithFilter.has('group')).toBe(false);
  });

  it('splits and joins multi-value filters on commas', () => {
    const state = parseViewState('f.label=kit,infra');
    expect(state.filters.label).toEqual(['kit', 'infra']);
    expect(serializeViewState(state).get('f.label')).toBe('kit,infra');
  });

  it('round-trips representative states', () => {
    const states: ViewState[] = [
      DEFAULT_VIEW_STATE,
      { view: 'table', group: 'none', sort: 'title', filters: {}, task: null },
      { view: 'board', group: 'priority', sort: '-updated', filters: { label: ['a', 'b'], q: ['x'] }, task: 'TM-1' },
    ];
    for (const state of states) {
      expect(roundTrip(state)).toEqual(state);
    }
  });

  it('ignores unknown params on read and preserves them on write', () => {
    const state = parseViewState('ref=email&view=table');
    // Unknown `ref` is not part of the schema.
    expect(state).toEqual({ ...DEFAULT_VIEW_STATE, view: 'table' });

    const out = serializeViewState(state, 'ref=email&stale=1');
    expect(out.get('ref')).toBe('email');
    expect(out.get('stale')).toBe('1');
    expect(out.get('view')).toBe('table');
  });
});
