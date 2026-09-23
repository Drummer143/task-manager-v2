import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { oppositeSurface, Surface, useSurface } from './Surface';

function ToneProbe() {
  return <span data-testid="probe">{useSurface()}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Surface', () => {
  it('wraps children in a div marked with data-surface', () => {
    render(
      <Surface tone="inverse" data-testid="surface">
        <span>content</span>
      </Surface>,
    );
    const surface = screen.getByTestId('surface');

    expect(surface.tagName).toBe('DIV');
    expect(surface.getAttribute('data-surface')).toBe('inverse');
    expect(surface.textContent).toBe('content');
  });

  it('forwards className, ref and rest props to the div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Surface tone="inverse" ref={ref} className="bar" role="toolbar" aria-label="Selection" />);
    const surface = screen.getByRole('toolbar', { name: 'Selection' });

    expect(ref.current).toBe(surface);
    expect(surface.className).toBe('bar');
  });

  it('puts the tone in context for the subtree', () => {
    render(
      <Surface tone="inverse">
        <ToneProbe />
      </Surface>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('inverse');
  });

  it('defaults to the default tone outside any surface', () => {
    render(<ToneProbe />);

    expect(screen.getByTestId('probe').textContent).toBe('default');
  });

  it('lets a nested default surface reset an inverse ancestor', () => {
    render(
      <Surface tone="inverse">
        <Surface tone="default" data-testid="menu">
          <ToneProbe />
        </Surface>
      </Surface>,
    );

    expect(screen.getByTestId('menu').getAttribute('data-surface')).toBe('default');
    expect(screen.getByTestId('probe').textContent).toBe('default');
  });

  it('warns about inverse inside inverse', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Surface tone="inverse">
        <Surface tone="inverse" />
      </Surface>,
    );

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn for a single inverse level', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Surface tone="inverse">
        <Surface tone="default">
          <Surface tone="inverse" />
        </Surface>
      </Surface>,
    );

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('Surface · asChild', () => {
  it('marks the child instead of adding a wrapper', () => {
    const { container } = render(
      <Surface tone="inverse" asChild>
        <section data-testid="bar">content</section>
      </Surface>,
    );

    expect(container.firstElementChild).toBe(screen.getByTestId('bar'));
    expect(screen.getByTestId('bar').getAttribute('data-surface')).toBe('inverse');
  });

  it('merges classNames and keeps the child’s own props', () => {
    render(
      <Surface tone="inverse" asChild className="outer" title="outer">
        <section data-testid="bar" className="inner" title="inner" />
      </Surface>,
    );
    const bar = screen.getByTestId('bar');

    expect(bar.className).toBe('outer inner');
    expect(bar.getAttribute('title')).toBe('inner');
  });

  it('feeds both its own ref and the child’s ref', () => {
    const outer = createRef<HTMLDivElement>();
    const inner = createRef<HTMLElement>();
    render(
      <Surface tone="inverse" asChild ref={outer}>
        <section data-testid="bar" ref={inner} />
      </Surface>,
    );
    const bar = screen.getByTestId('bar');

    expect(outer.current).toBe(bar);
    expect(inner.current).toBe(bar);
  });

  it('keeps the surface tone even if the child sets data-surface', () => {
    render(
      <Surface tone="inverse" asChild>
        <section data-testid="bar" data-surface="default" />
      </Surface>,
    );

    expect(screen.getByTestId('bar').getAttribute('data-surface')).toBe('inverse');
  });
});

describe('oppositeSurface', () => {
  it('flips the tone', () => {
    expect(oppositeSurface('default')).toBe('inverse');
    expect(oppositeSurface('inverse')).toBe('default');
  });
});
