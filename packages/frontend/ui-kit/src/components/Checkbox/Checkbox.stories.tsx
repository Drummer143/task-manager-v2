import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComponentProps, CSSProperties, ReactNode, useState } from 'react';
import { Checkbox, type CheckboxChecked } from './Checkbox';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content repeat(3, max-content)',
  gap: `${cssVar('sp-3')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
};

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

/** A controlled owner for a single box. */
function Owned({ initial = false, ...props }: { initial?: CheckboxChecked } & Omit<ComponentProps<typeof Checkbox>, 'checked' | 'onCheckedChange'>) {
  const [checked, setChecked] = useState<CheckboxChecked>(initial);

  return <Checkbox {...(props as ComponentProps<typeof Checkbox>)} checked={checked} onCheckedChange={setChecked} />;
}

const VALUES: Array<[string, CheckboxChecked]> = [
  ['off', false],
  ['on', true],
  ['mixed', 'mixed'],
];

/** Values × states. Hover and pressed are live on the row — try them; Tab shows the ring. */
function StateGrid() {
  return (
    <>
      <span />
      {['default · live', 'disabled · reason', 'error'].map((state) => (
        <Caption key={state}>{state}</Caption>
      ))}
      {VALUES.map(([name, value]) => (
        <div key={name} style={{ display: 'contents' }}>
          <Caption>{name}</Caption>
          <Owned label={value === 'mixed' ? '3 of 7' : 'Done'} initial={value} />
          <Checkbox
            label={value === 'mixed' ? '3 of 7' : 'Done'}
            checked={value}
            onCheckedChange={() => undefined}
            disabled
            disabledReason="Only the board owner can change it"
          />
          {value === false ? <Owned label="I agree" error="Check this to continue" /> : <span />}
        </div>
      ))}
    </>
  );
}

const meta: Meta<typeof Checkbox> = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <StateGrid />
    </div>
  ),
};

/** Without a label (a table row), with a description, with an error. */
export const Variants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: cssVar('sp-2') }}>
        <Owned aria-label="Select TM-248" initial />
        <span>TM-248 · AppShell</span>
      </div>
      <Owned label="Notify me about assignments" description="Only when a task is assigned to you" initial />
      <Owned label="I understand this can’t be undone" error="Check this to continue" />
    </div>
  ),
};

const TASKS = ['Hotkey registry', 'Token layer', 'AppShell', 'Tooltip host', 'Button', 'Input', 'Checkbox'];

/**
 * "Select all" over a group: from mixed a click checks all (spec 05).
 * Shift+click on a row reports shiftKey — here it selects the range from the last click.
 */
export const SelectAll: Story = {
  render: () => {
    const [selected, setSelected] = useState<Set<number>>(() => new Set([0, 2, 5]));
    const [anchor, setAnchor] = useState<number | null>(null);
    const all: CheckboxChecked = selected.size === 0 ? false : selected.size === TASKS.length ? true : 'mixed';

    return (
      <div style={{ display: 'grid', justifyItems: 'start' }}>
        <Checkbox
          label={`All tasks · ${selected.size}`}
          checked={all}
          onCheckedChange={(next) => setSelected(next ? new Set(TASKS.map((_, index) => index)) : new Set())}
        />
        <div style={{ display: 'grid', paddingInlineStart: cssVar('sp-6') }}>
          {TASKS.map((task, index) => (
            <Checkbox
              key={task}
              label={task}
              checked={selected.has(index)}
              onCheckedChange={(next, { shiftKey }) => {
                setSelected((current) => {
                  const copy = new Set(current);
                  const [from, to] = shiftKey && anchor !== null ? [Math.min(anchor, index), Math.max(anchor, index)] : [index, index];

                  for (let row = from; row <= to; row++) {
                    if (next) copy.add(row);
                    else copy.delete(row);
                  }

                  return copy;
                });
                setAnchor(index);
              }}
            />
          ))}
        </div>
      </div>
    );
  },
};

/** On a dark surface (the selection bar's "select all"): light outline, accent-400 outline and accent-300 mark. */
export const OnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <StateGrid />
    </Surface>
  ),
};

/** The box stays 16 px; its hit zone — the row — follows the density. */
export const Densities: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ ...stand, gridTemplateColumns: 'max-content max-content' }}>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div key={density} data-density={density} style={{ display: 'contents' }}>
          <Caption>{density}</Caption>
          <div style={{ outline: `${cssVar('border-width')} dashed ${cssVar('border-hairline')}` }}>
            <Owned label="Show completed" initial />
          </div>
        </div>
      ))}
    </div>
  ),
};
