import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AppShell, cssVar, raw } from '@task-manager-v2/ui-kit';
import {
  parseViewState,
  serializeViewState,
  type GroupBy,
  type ViewKind,
  type ViewState,
} from '../shared/utils/view-state';

const hairline = `${cssVar('border-width')} solid ${cssVar('border-hairline')}`;

const DEMO_TASKS = [
  { id: 'TM-1', title: 'Extract the token layer into a package' },
  { id: 'TM-248', title: 'AppShell: focus regions and resize' },
  { id: 'TM-3', title: 'View-state contract in the URL' },
];

const GROUPS: GroupBy[] = ['status', 'assignee', 'priority', 'none'];
const SORTS = [null, '-due', 'title', '-updated'] as const;

function Control({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    height: cssVar('control-height-sm'),
    padding: `0 ${cssVar('sp-3')}`,
    border: active ? `${cssVar('border-width')} solid ${cssVar('border-accent')}` : hairline,
    borderRadius: cssVar('radius-sm'),
    background: active ? cssVar('bg-accent-soft') : cssVar('bg-raised'),
    color: active ? cssVar('text-accent') : cssVar('text-secondary'),
    fontSize: cssVar('type-meta'),
    cursor: 'pointer',
  };
  return (
    <button type="button" style={style} onClick={onClick}>
      {children}
    </button>
  );
}

export function WorkspacePage() {
  // The URL is the single source of view state — read it straight from the
  // router hooks, parse/serialize with the pure contract. No bespoke wrapper.
  const { workspace, page } = useParams();
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => parseViewState(params), [params]);

  // task open = push (a history entry, spec 05); everything else = replace.
  const commit = (patch: Partial<ViewState>, push = false) =>
    setParams(serializeViewState({ ...view, ...patch }, params), { replace: !push });
  const setView = (patch: Partial<ViewState>) => commit(patch);
  const openTask = (id: string) => commit({ task: id }, true);
  const closeTask = () => commit({ task: null });

  const [sidebarWidth, setSidebarWidth] = useState<number>(raw['sidebar-width']);
  const [panelWidth, setPanelWidth] = useState<number>(raw['panel-width']);

  const assigneeFilter = view.filters['assignee']?.includes('me') ?? false;
  const cycleGroup = () => {
    const next = GROUPS[(GROUPS.indexOf(view.group) + 1) % GROUPS.length];
    setView({ group: next });
  };
  const cycleSort = () => {
    const next = SORTS[(SORTS.indexOf(view.sort as (typeof SORTS)[number]) + 1) % SORTS.length];
    setView({ sort: next });
  };
  const toggleAssignee = () => {
    const filters = { ...view.filters };
    if (assigneeFilter) delete filters['assignee'];
    else filters['assignee'] = ['me'];
    setView({ filters });
  };
  const setViewKind = (kind: ViewKind) => setView({ view: kind });

  const openTaskData = DEMO_TASKS.find((t) => t.id === view.task) ?? null;

  const sidebar = (
    <nav style={{ padding: cssVar('sp-3'), display: 'flex', flexDirection: 'column', gap: cssVar('sp-1') }}>
      <div style={{ fontSize: cssVar('type-meta'), color: cssVar('text-muted'), marginBottom: cssVar('sp-2') }}>
        {workspace} / {page}
      </div>
      <PageLink to="/w/product/p/board-q3" label="Board Q3" active={page === 'board-q3'} />
      <PageLink to="/w/product/p/mobile" label="Mobile" active={page === 'mobile'} />
    </nav>
  );

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: cssVar('sp-3'), padding: `0 ${cssVar('sp-4')}`, height: '100%' }}>
      <div style={{ fontSize: cssVar('type-meta'), color: cssVar('text-muted') }}>
        {workspace} / {page}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: cssVar('sp-2'), alignItems: 'center' }}>
        <Control active={view.view === 'board'} onClick={() => setViewKind('board')}>
          Board
        </Control>
        <Control active={view.view === 'table'} onClick={() => setViewKind('table')}>
          Table
        </Control>
        <Control onClick={cycleGroup}>group: {view.group}</Control>
        <Control onClick={cycleSort}>sort: {view.sort ?? 'default'}</Control>
        <Control active={assigneeFilter} onClick={toggleAssignee}>
          assignee: me
        </Control>
      </div>
    </div>
  );

  const canvas = (
    <div style={{ padding: cssVar('sp-5'), display: 'flex', flexDirection: 'column', gap: cssVar('sp-4') }}>
      <section>
        <Heading>Live view state (mirror of the URL)</Heading>
        <pre
          style={{
            margin: 0,
            padding: cssVar('sp-4'),
            background: cssVar('bg-sunken'),
            border: hairline,
            borderRadius: cssVar('radius-md'),
            fontSize: cssVar('type-meta'),
            color: cssVar('text-secondary'),
            overflowX: 'auto',
          }}
        >
          {JSON.stringify(view, null, 2)}
        </pre>
      </section>
      <section>
        <Heading>Tasks — click to open (pushes ?task to history)</Heading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: cssVar('card-gap') }}>
          {DEMO_TASKS.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => openTask(task.id)}
              style={{
                textAlign: 'left',
                padding: cssVar('card-padding'),
                background: view.task === task.id ? cssVar('bg-selected') : cssVar('bg-raised'),
                border: hairline,
                borderRadius: cssVar('radius-sm'),
                fontSize: cssVar('type-body'),
                color: cssVar('text-primary'),
                cursor: 'pointer',
              }}
            >
              <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{task.id}</span>{' '}
              {task.title}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  const panel = openTaskData && (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: cssVar('canvas-header-height'),
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: cssVar('sp-3'),
          padding: `0 ${cssVar('sp-5')}`,
          borderBottom: hairline,
        }}
      >
        <span style={{ fontSize: cssVar('type-meta'), color: cssVar('text-muted') }}>{openTaskData.id}</span>
        <div style={{ marginLeft: 'auto' }}>
          <Control onClick={closeTask}>Close</Control>
        </div>
      </div>
      <div style={{ padding: cssVar('sp-5'), fontSize: cssVar('type-h1'), fontWeight: cssVar('weight-strong') }}>
        {openTaskData.title}
      </div>
    </div>
  );

  const status = (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', padding: `0 ${cssVar('sp-4')}`, fontSize: cssVar('type-meta'), color: cssVar('text-muted') }}>
      Synced
    </div>
  );

  return (
    <AppShell
      sidebar={sidebar}
      header={header}
      status={status}
      panel={panel}
      sidebarWidth={sidebarWidth}
      onSidebarWidthChange={setSidebarWidth}
      panelWidth={panelWidth}
      onPanelWidthChange={setPanelWidth}
    >
      {canvas}
    </AppShell>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: cssVar('type-h3'), fontWeight: cssVar('weight-strong'), marginBottom: cssVar('sp-3') }}>
      {children}
    </div>
  );
}

function PageLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      style={{
        height: cssVar('row-height'),
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${cssVar('sp-3')}`,
        borderRadius: cssVar('radius-sm'),
        fontSize: cssVar('type-body'),
        textDecoration: 'none',
        background: active ? cssVar('bg-selected') : 'transparent',
        color: active ? cssVar('text-primary') : cssVar('text-secondary'),
      }}
    >
      {label}
    </Link>
  );
}

export default WorkspacePage;
