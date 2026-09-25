import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';
import { KitRoot } from '../KitRoot';

const Owned = ({ initial = false, onChange = vi.fn() }: { initial?: boolean; onChange?: (v: boolean) => void }) => {
  const [checked, setChecked] = useState(initial);

  return (
    <Switch
      label="Show completed"
      checked={checked}
      onCheckedChange={(next) => {
        onChange(next);
        setChecked(next);
      }}
    />
  );
};

describe('Switch · semantics', () => {
  it('is a native control with role="switch", named by its label', () => {
    render(<Owned />);
    const control = screen.getByRole('switch', { name: 'Show completed' });

    expect(control.tagName).toBe('INPUT');
    expect(control.getAttribute('type')).toBe('checkbox');
  });

  it('reads as on and off', () => {
    const view = render(<Switch label="Compact" checked onCheckedChange={vi.fn()} />);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);

    view.rerender(<Switch label="Compact" checked={false} onCheckedChange={vi.fn()} />);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
  });

  it('puts the label first by default (a settings row) and the switch first at "end" (a toolbar)', () => {
    const view = render(<Switch label="Compact" checked={false} onCheckedChange={vi.fn()} />);
    const row = () => view.container.querySelector('label') as HTMLElement;

    expect(row().firstElementChild?.textContent).toBe('Compact');

    view.rerender(<Switch label="Compact" labelPosition="end" checked={false} onCheckedChange={vi.fn()} />);
    expect(row().lastElementChild?.textContent).toBe('Compact');
  });

  it('puts className on the root, the ref and other DOM props on the input', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <Switch ref={ref} className="custom" name="compact" label="Compact" checked={false} onCheckedChange={vi.fn()} />,
    );

    expect(ref.current).toBe(screen.getByRole('switch'));
    expect(ref.current?.getAttribute('name')).toBe('compact');
    expect(container.firstElementChild?.classList.contains('custom')).toBe(true);
  });
});

describe('Switch · change', () => {
  it('toggles through onCheckedChange — from the track or the label', () => {
    const onChange = vi.fn();
    render(<Owned onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('Show completed'));

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('shows a pending save as a dot and stays usable — the change is optimistic', () => {
    const onCheckedChange = vi.fn();
    const { container } = render(<Switch label="Compact" checked pending onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole('switch');

    expect(control.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('label [aria-hidden="true"]:not(input)')).not.toBeNull();

    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});

describe('Switch · description and error', () => {
  it('describes the control by its description', () => {
    render(<Switch label="Show completed" description="The “Done” column on the board" checked onCheckedChange={vi.fn()} />);

    screen.getByRole('switch', { description: 'The “Done” column on the board' });
  });

  it('shows a failed save with Retry, outside the label — Retry does not toggle it', () => {
    const onRetry = vi.fn();
    const onCheckedChange = vi.fn();
    render(
      <KitRoot>
        <Switch
          label="Email notifications"
          checked={false}
          error="Not saved: offline"
          onRetry={onRetry}
          onCheckedChange={onCheckedChange}
        />
      </KitRoot>,
    );
    const retry = screen.getByRole('button', { name: 'Retry' });

    fireEvent.click(retry);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(retry.closest('label')).toBeNull();
    screen.getByRole('switch', { description: 'Not saved: offline · Retry' });
  });

  it('takes the Retry label from KitRoot messages', () => {
    render(
      <KitRoot messages={{ retry: 'Повторить' }}>
        <Switch label="Уведомления" checked={false} error="Не сохранилось" onRetry={vi.fn()} onCheckedChange={vi.fn()} />
      </KitRoot>,
    );

    screen.getByRole('button', { name: 'Повторить' });
  });
});

describe('Switch · disabled', () => {
  it('keeps its value, stays focusable and does not change; the reason is on the row', () => {
    const onCheckedChange = vi.fn();
    const { container } = render(
      <Switch label="Unavailable" checked disabled disabledReason="Set by the workspace owner" onCheckedChange={onCheckedChange} />,
    );
    const control = screen.getByRole('switch') as HTMLInputElement;

    fireEvent.click(control);

    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(control.checked).toBe(true);
    expect(control.disabled).toBe(false);
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('label')?.getAttribute('data-tooltip-reason')).toBe('Set by the workspace owner');
  });
});
