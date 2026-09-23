import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { raw } from '../../tokens';
import Spinner from './Spinner';
import styles from './Spinner.module.scss';

const circles = (container: HTMLElement) => Array.from(container.querySelectorAll('circle'));

describe('Spinner', () => {
  it('is a status with a default label', () => {
    render(<Spinner />);

    screen.getByRole('status', { name: 'Loading' });
  });

  it('uses a specific label when given', () => {
    render(<Spinner label="Uploading attachment" />);

    screen.getByRole('status', { name: 'Uploading attachment' });
  });

  it('hides the drawing from screen readers', () => {
    const { container } = render(<Spinner />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to the neutral tone and the sm size', () => {
    render(<Spinner />);
    const root = screen.getByRole('status');

    expect(root.classList.contains(styles.neutral)).toBe(true);
    expect(root.classList.contains(styles.sm)).toBe(true);
  });

  it('applies the tone and size classes', () => {
    render(<Spinner variant="danger" size="lg" />);
    const root = screen.getByRole('status');

    expect(root.classList.contains(styles.danger)).toBe(true);
    expect(root.classList.contains(styles.lg)).toBe(true);
    expect(root.classList.contains(styles.neutral)).toBe(false);
  });

  it.each([
    ['xs', raw['spinner-size-xs'], raw['spinner-stroke-thin']],
    ['sm', raw['spinner-size-sm'], raw['spinner-stroke-thick']],
    ['md', raw['spinner-size-md'], raw['spinner-stroke-thick']],
    ['lg', raw['spinner-size-lg'], raw['spinner-stroke-thick']],
  ] as const)('draws %s in screen pixels: box %i, stroke %f', (size, box, stroke) => {
    const { container } = render(<Spinner size={size} />);

    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(`0 0 ${box} ${box}`);

    for (const circle of circles(container)) {
      expect(circle.getAttribute('stroke-width')).toBe(String(stroke));
      // The ring fits the box: radius + half the stroke = half the box.
      expect(Number(circle.getAttribute('r')) + stroke / 2).toBe(box / 2);
    }
  });

  it('measures the arc in fractions of the ring, not in pixels', () => {
    const { container } = render(<Spinner size="lg" />);
    const [track, arc] = circles(container);

    expect(arc.getAttribute('pathLength')).toBe('100');
    expect(track.getAttribute('pathLength')).toBeNull();
  });

  it('forwards className, ref and other DOM props to the root', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Spinner ref={ref} className="custom" data-testid="spinner" id="busy" />);
    const root = screen.getByTestId('spinner');

    expect(ref.current).toBe(root);
    expect(root.classList.contains('custom')).toBe(true);
    expect(root.classList.contains(styles.root)).toBe(true);
    expect(root.id).toBe('busy');
  });
});
