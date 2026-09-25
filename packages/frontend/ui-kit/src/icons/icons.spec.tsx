import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckIcon, MinusIcon, createIcon } from './index';

describe('icons', () => {
  it.each([
    ['CheckIcon', CheckIcon],
    ['MinusIcon', MinusIcon],
  ])('%s is a decorative currentColor stroke icon, 1em by default', (name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg') as SVGSVGElement;

    expect(Icon.displayName).toBe(name);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('width')).toBe('1em');
    expect(svg.querySelector('path')).not.toBeNull();
  });

  it('takes SVG props and a ref — a meaningful icon can drop aria-hidden', () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(<CheckIcon ref={ref} width={16} aria-hidden={false} aria-label="Done" role="img" />);
    const svg = container.querySelector('svg');

    expect(ref.current).toBe(svg);
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('aria-label')).toBe('Done');
  });

  it('builds new icons on the same grid', () => {
    const Dot = createIcon('DotIcon', <circle cx="12" cy="12" r="4" />, 1.5);
    const { container } = render(<Dot />);

    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.5');
  });
});
