import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kbd } from './Kbd';

const mockPlatform = (platform: string) => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
};

/** The drawn keycaps — nested <kbd> elements inside the root. */
const caps = (root: HTMLElement) =>
  Array.from(root.querySelectorAll(':scope kbd')).map((cap) => cap.textContent);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Kbd · key variant', () => {
  it('draws one keycap per key of a combo, without separators', () => {
    mockPlatform('MacIntel');
    const { container } = render(<Kbd keys="mod+k" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.tagName).toBe('KBD');
    expect(caps(root)).toEqual(['⌘', 'K']);
    expect(root.textContent).not.toContain('+⌘');
  });

  it('puts "then" between the steps of a sequence', () => {
    const { container } = render(<Kbd keys="g b" />);
    const root = container.firstElementChild as HTMLElement;

    expect(caps(root)).toEqual(['G', 'B']);
    expect(root.querySelector('[aria-hidden="true"]:not(kbd)')?.textContent).toBe('then');
  });

  it('shows Ctrl instead of ⌘ outside Apple platforms', () => {
    mockPlatform('Win32');
    const { container } = render(<Kbd keys="mod+shift+c" />);

    expect(caps(container.firstElementChild as HTMLElement)).toEqual(['Ctrl', 'Shift', 'C']);
  });

  it('defaults to the key variant', () => {
    const { container } = render(<Kbd keys="c" />);

    expect(container.firstElementChild?.getAttribute('data-variant')).toBe('key');
  });
});

describe('Kbd · inline variant', () => {
  it('renders plain text with no keycaps', () => {
    mockPlatform('MacIntel');
    const { container } = render(<Kbd keys="mod+shift+c" variant="inline" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.getAttribute('data-variant')).toBe('inline');
    expect(caps(root)).toEqual([]);
    expect(root.querySelector('[aria-hidden="true"]')?.textContent).toBe('⌘⇧C');
  });

  it('writes a sequence with a narrow › between the steps', () => {
    const { container } = render(<Kbd keys="g b" variant="inline" />);

    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('G › B');
  });

  it('joins combo keys without a separator on every platform', () => {
    mockPlatform('Win32');
    const { container } = render(<Kbd keys="mod+k" variant="inline" />);

    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('CtrlK');
  });
});

describe('Kbd · accessibility', () => {
  it('announces spelled-out keys and hides the glyphs from screen readers', () => {
    mockPlatform('MacIntel');
    const { container } = render(<Kbd keys="mod+shift+c" />);

    screen.getByText('Command+Shift+C');
    container.querySelectorAll(':scope > kbd kbd').forEach((cap) => {
      expect(cap.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('announces a sequence with "then"', () => {
    render(<Kbd keys="g b" variant="inline" />);

    screen.getByText('G then B');
  });
});

describe('Kbd · DOM contract', () => {
  it('forwards className, ref and rest props to the root', () => {
    const ref = createRef<HTMLElement>();
    const { container } = render(
      <Kbd keys="c" className="custom" ref={ref} data-testid="kbd" title="Create task" />,
    );
    const root = container.firstElementChild as HTMLElement;

    expect(ref.current).toBe(root);
    expect(root.classList.contains('custom')).toBe(true);
    expect(root.getAttribute('title')).toBe('Create task');
    screen.getByTestId('kbd');
  });

  it('keeps its own variant marker even if a data-variant is passed', () => {
    const { container } = render(<Kbd keys="c" variant="inline" {...{ 'data-variant': 'key' }} />);

    expect(container.firstElementChild?.getAttribute('data-variant')).toBe('inline');
  });
});
