import { describe, expect, it } from 'vitest';
import { shouldNotify, type NotifyContext } from './shouldNotify';

const GAP = 30_000;

const context = (overrides: Partial<NotifyContext> = {}): NotifyContext => ({
  allowed: true,
  tabVisible: true,
  showing: false,
  duplicate: false,
  now: 100_000,
  lastShownAt: null,
  gap: GAP,
  ...overrides,
});

describe('shouldNotify', () => {
  it('shows the first suitable notification', () => {
    expect(shouldNotify(context())).toBe('show');
  });

  it('never interrupts against the app’s policy: kind, inbox or subject open, quiet hours', () => {
    expect(shouldNotify(context({ allowed: false }))).toBe('skip');
    expect(shouldNotify(context({ allowed: false, showing: true }))).toBe('skip');
  });

  it('a hidden tab gets nothing — not even later, when it is back', () => {
    expect(shouldNotify(context({ tabVisible: false }))).toBe('skip');
  });

  it('at most one in 30 s', () => {
    expect(shouldNotify(context({ lastShownAt: 100_000 - GAP + 1 }))).toBe('skip');
    expect(shouldNotify(context({ lastShownAt: 100_000 - GAP }))).toBe('show');
  });

  it('while one is on screen, a suitable one adds "+1 more" instead', () => {
    expect(shouldNotify(context({ showing: true, lastShownAt: 99_000 }))).toBe('more');
  });

  it('the same notification sent again is not counted twice', () => {
    expect(shouldNotify(context({ showing: true, duplicate: true }))).toBe('skip');
  });
});
