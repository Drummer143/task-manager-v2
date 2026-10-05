import type React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitRoot } from '../KitRoot';
import type { RouterAdapter } from '../../router';
import { Link } from './Link';
import { LinkBase } from './LinkBase';

let prevented: boolean | undefined;
const stopBrowser = (event: MouseEvent) => {
  prevented = event.defaultPrevented;
  event.preventDefault();
};

beforeEach(() => {
  prevented = undefined;
  window.addEventListener('click', stopBrowser);
});

afterEach(() => {
  window.removeEventListener('click', stopBrowser);
});

const setup = (element: React.ReactElement, adapter: Partial<RouterAdapter> = {}) => {
  const router = { navigate: vi.fn(), ...adapter };
  render(<KitRoot router={router}>{element}</KitRoot>);

  return { router, link: screen.getByRole('link') };
};

describe('LinkBase · the click: the router or the browser (spec 03)', () => {
  it('a plain click goes through the router, without a reload', () => {
    const { router, link } = setup(<LinkBase href="/w/acme/board">Board</LinkBase>);

    fireEvent.click(link);

    expect(router.navigate).toHaveBeenCalledWith('/w/acme/board', { replace: undefined });
    expect(prevented).toBe(true);
  });

  it('replace replaces the history entry', () => {
    const { router, link } = setup(
      <LinkBase href="/w/acme/board" replace>
        Board
      </LinkBase>,
    );

    fireEvent.click(link);

    expect(router.navigate).toHaveBeenCalledWith('/w/acme/board', { replace: true });
  });

  it.each([
    ['⌘', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['the middle button', { button: 1 }],
  ])('%s is left to the browser', (_, init) => {
    const { router, link } = setup(<LinkBase href="/w/acme/board">Board</LinkBase>);

    fireEvent.click(link, init);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it.each([
    ['another origin', { href: 'https://tiptap.dev' }],
    ['target="_blank"', { href: '/w/acme/board', target: '_blank' }],
    ['download', { href: '/api/files/1/download', download: true }],
    ['reloadDocument', { href: '/docs', reloadDocument: true }],
    ['an in-page anchor', { href: '#comments' }],
  ])('%s goes past the router', (_, props) => {
    const { router, link } = setup(<LinkBase {...props}>Go</LinkBase>);

    fireEvent.click(link);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it('the owner’s onClick runs first and may cancel the navigation', () => {
    const order: string[] = [];
    const router = {
      navigate: vi.fn(() => {
        order.push('navigate');
      }),
    };
    const { rerender } = render(
      <KitRoot router={router}>
        <LinkBase href="/a" onClick={() => order.push('onClick')}>
          A
        </LinkBase>
      </KitRoot>,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(order).toEqual(['onClick', 'navigate']);

    rerender(
      <KitRoot router={router}>
        <LinkBase href="/a" onClick={(event) => event.preventDefault()}>
          A
        </LinkBase>
      </KitRoot>,
    );
    router.navigate.mockClear();
    fireEvent.click(screen.getByRole('link'));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('without a router adapter the browser loads the page', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<LinkBase href="/w/acme/board">Board</LinkBase>);

    fireEvent.click(screen.getByRole('link'));

    expect(prevented).toBe(false);
  });
});

describe('LinkBase · two addresses: the DOM’s and the router’s', () => {
  const basename = { useHref: (href: string) => `/app${href}` };

  it('the <a> gets the real address, the router the app’s own', () => {
    const { router, link } = setup(<LinkBase href="/inbox">Inbox</LinkBase>, basename);

    expect(link.getAttribute('href')).toBe('/app/inbox');

    fireEvent.click(link);
    expect(router.navigate).toHaveBeenCalledWith('/inbox', { replace: undefined });
  });

  it('an address of another origin is never resolved as an app path', () => {
    const { link } = setup(<LinkBase href="https://tiptap.dev/docs">Docs</LinkBase>, basename);

    expect(link.getAttribute('href')).toBe('https://tiptap.dev/docs');
  });
});

describe('LinkBase · attributes it decides', () => {
  it('a new tab gets noopener noreferrer, keeping the owner’s rel', () => {
    const { link } = setup(
      <LinkBase href="https://tiptap.dev" target="_blank" rel="nofollow">
        Docs
      </LinkBase>,
    );

    expect(link.getAttribute('rel')?.split(' ').sort()).toEqual(['nofollow', 'noopener', 'noreferrer']);
  });

  it('disabled: no address, still a focusable link for readers, and the reason in a tooltip', () => {
    const onClick = vi.fn();
    const { router } = setup(
      <LinkBase href="/w/acme/board" target="_blank" onClick={onClick} disabled disabledReason="No access">
        Board
      </LinkBase>,
    );
    const link = screen.getByRole('link');

    expect(link.hasAttribute('href')).toBe(false);
    expect(link.hasAttribute('target')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.tabIndex).toBe(0);
    expect(link.getAttribute('data-tooltip-reason')).toBe('No access');

    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('Link', () => {
  const newTabNote = /opens in a new tab/;

  it('another origin opens in a new tab, with the arrow and a note for readers', () => {
    const { router, link } = setup(<Link href="https://tiptap.dev">Tiptap docs</Link>);

    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(link.textContent).toMatch(newTabNote);

    fireEvent.click(link);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('the arrow promises what will happen: it follows the target, not the origin', () => {
    const { link } = setup(
      <Link href="https://tiptap.dev" target="_self">
        Tiptap docs
      </Link>,
    );

    expect(link.getAttribute('target')).toBe('_self');
    expect(link.querySelector('svg')).toBeNull();
    expect(link.textContent).not.toMatch(newTabNote);
  });

  it('an internal link sent to a new tab gets the arrow too', () => {
    const { link } = setup(
      <Link href="/w/acme/board" target="_blank">
        Board
      </Link>,
    );

    expect(link.querySelector('svg')).not.toBeNull();
    expect(link.textContent).toMatch(newTabNote);
  });

  it('an internal link stays in the tab and has no arrow', () => {
    const { link } = setup(<Link href="/w/acme/board">Board</Link>);

    expect(link.hasAttribute('target')).toBe(false);
    expect(link.querySelector('svg')).toBeNull();
  });

  it('current marks the page the user is on', () => {
    const { link } = setup(
      <Link href="/w/acme/board" variant="subtle" current>
        Q3 board
      </Link>,
    );

    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('has no disabled state', () => {
    // @ts-expect-error — an unavailable link is text, not a Link (spec 05)
    const element = <Link href="/a" disabled />;

    expect(element).toBeTruthy();
  });
});
