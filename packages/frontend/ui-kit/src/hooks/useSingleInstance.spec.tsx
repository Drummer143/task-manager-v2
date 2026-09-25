import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSingleInstance } from './useSingleInstance';

const Probe = ({ name, id }: { name: string; id: string }) => {
  const primary = useSingleInstance(name);

  return <span data-testid={id}>{primary ? 'primary' : 'inert'}</span>;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSingleInstance', () => {
  it('makes the only instance the working one', () => {
    render(<Probe name="Host" id="a" />);

    expect(screen.getByTestId('a').textContent).toBe('primary');
  });

  it('keeps a second instance inert and warns about it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <>
        <Probe name="Host" id="a" />
        <Probe name="Host" id="b" />
      </>,
    );

    expect(screen.getByTestId('a').textContent).toBe('primary');
    expect(screen.getByTestId('b').textContent).toBe('inert');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Host is mounted 2 times');
  });

  it('hands over to the next instance when the working one unmounts', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const view = render(
      <>
        <Probe name="Host" id="a" />
        <Probe name="Host" id="b" />
      </>,
    );

    view.rerender(<Probe name="Host" id="b" />);

    expect(screen.getByTestId('b').textContent).toBe('primary');
  });

  it('counts each name separately', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <>
        <Probe name="TooltipHost" id="tooltip" />
        <Probe name="LayerHost" id="layer" />
      </>,
    );

    expect(screen.getByTestId('tooltip').textContent).toBe('primary');
    expect(screen.getByTestId('layer').textContent).toBe('primary');
    expect(warn).not.toHaveBeenCalled();
  });

  it('forgets unmounted instances, so a remount works again', () => {
    const first = render(<Probe name="Host" id="a" />);
    first.unmount();

    render(<Probe name="Host" id="again" />);

    expect(screen.getByTestId('again').textContent).toBe('primary');
  });
});
