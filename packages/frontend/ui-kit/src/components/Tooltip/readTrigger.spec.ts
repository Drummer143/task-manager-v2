import { describe, expect, it } from 'vitest';
import { raw } from '../../tokens';
import { readTrigger } from './readTrigger';
import { tooltipProps, type TooltipInfo } from './tooltipProps';

/** An element carrying exactly what tooltipProps() would put on it in JSX. */
const element = (info: TooltipInfo, text = '') => {
  const node = document.createElement('button');
  node.textContent = text;

  for (const [name, value] of Object.entries(tooltipProps(info))) {
    if (value !== undefined) {
      node.setAttribute(name, String(value));
    }
  }

  return node;
};

/** jsdom has no layout: fake the overflow measurements. */
const withSize = (node: HTMLElement, sizes: { scrollWidth: number; clientWidth: number }) => {
  Object.defineProperties(node, {
    scrollWidth: { value: sizes.scrollWidth },
    clientWidth: { value: sizes.clientWidth },
    scrollHeight: { value: 0 },
    clientHeight: { value: 0 },
  });

  return node;
};

describe('readTrigger', () => {
  it('reads text, keys and placement', () => {
    expect(readTrigger(element({ text: 'Create task', keys: 'c', placement: 'right' }))).toEqual({
      text: 'Create task',
      keys: 'c',
      placement: 'right',
      delay: raw['tooltip-delay'],
    });
  });

  it('uses the token delay when none is set — a missing attribute is not 0', () => {
    expect(readTrigger(element({ text: 'Status' }))?.delay).toBe(raw['tooltip-delay']);
  });

  it('honors an explicit delay, including 0', () => {
    expect(readTrigger(element({ text: 'Status', delay: 800 }))?.delay).toBe(800);
    expect(readTrigger(element({ text: 'Status', delay: 0 }))?.delay).toBe(0);
  });

  it('falls back to the token delay for garbage', () => {
    const node = element({ text: 'Status' });
    node.setAttribute('data-tooltip-delay', 'soon');

    expect(readTrigger(node)?.delay).toBe(raw['tooltip-delay']);
  });

  it('defaults an unknown placement to top', () => {
    const node = element({ text: 'Status' });
    node.setAttribute('data-tooltip-placement', 'center');

    expect(readTrigger(node)?.placement).toBe('top');
  });

  it('shows the disabled reason instead of the text, without keys', () => {
    expect(readTrigger(element({ text: 'Archive', keys: 'e', reason: 'Unavailable: no access' }))).toEqual({
      text: 'Unavailable: no access',
      placement: 'top',
      delay: raw['tooltip-delay'],
    });
  });

  it('shows nothing for empty text', () => {
    expect(readTrigger(element({ text: '' }))).toBeNull();
  });

  describe('overflow', () => {
    it('shows the element text when it is truncated', () => {
      const node = withSize(element({ overflow: true }, '  A long task title  '), { scrollWidth: 400, clientWidth: 200 });

      expect(readTrigger(node)?.text).toBe('A long task title');
    });

    it('shows nothing when the text fits', () => {
      const node = withSize(element({ overflow: true }, 'Short'), { scrollWidth: 120, clientWidth: 200 });

      expect(readTrigger(node)).toBeNull();
    });

    it('prefers an explicit text over the element text', () => {
      const node = withSize(element({ overflow: true, text: 'Full title' }, 'Full…'), { scrollWidth: 400, clientWidth: 200 });

      expect(readTrigger(node)?.text).toBe('Full title');
    });
  });
});
