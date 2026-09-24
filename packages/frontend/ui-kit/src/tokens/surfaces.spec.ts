import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the LIGHT / DARK sets in tokens.css. jsdom does not resolve custom
 * properties, so the contract is checked on the source itself.
 */
const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector.split(',').map((part) => part.trim().replace(/\s+/g, ' ')),
  tokens: new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])),
}));

const blockWith = (selector: string) => {
  const block = blocks.find((item) => item.selectors.includes(selector));

  if (!block) {
    throw new Error(`No block with selector ${selector}`);
  }

  return block;
};

const light = blockWith("[data-surface='default']");
const dark = blockWith("[data-surface='inverse']");

describe('semantic sets', () => {
  it('the light set is the base theme and the reset surface', () => {
    expect(light.selectors).toEqual(
      expect.arrayContaining([':root', "[data-theme='light']", "[data-surface='default']"]),
    );
  });

  it('surfaces are relative to the theme: under a dark theme they swap sets', () => {
    expect(light.selectors).toContain("[data-theme='dark'] [data-surface='inverse']");
    expect(dark.selectors).toContain("[data-theme='dark'] [data-surface='default']");
  });

  it('every token the dark set changes is also in the light set, so a default surface resets it', () => {
    const missing = [...dark.tokens.keys()].filter((name) => !light.tokens.has(name));

    expect(missing).toEqual([]);
  });

  it('a token referencing another token is declared in both sets', () => {
    // var() resolves where it is declared: without a redeclaration the dark set
    // would inherit a value already computed from the light one.
    const referencing = [...light.tokens]
      .filter(([, value]) => /var\(--(?!c-)/.test(value))
      .map(([name]) => name);

    expect(referencing.filter((name) => !dark.tokens.has(name))).toEqual([]);
  });

  it.each(['--kbd-bg', '--kbd-border', '--kbd-fg'])('only the sets define %s', (name) => {
    const owners = blocks.filter((block) => block.tokens.has(name));

    expect(owners).toEqual([light, dark]);
  });

  it('inverse keycaps are transparent', () => {
    expect(dark.tokens.get('--kbd-bg')).toBe('transparent');
  });
});
