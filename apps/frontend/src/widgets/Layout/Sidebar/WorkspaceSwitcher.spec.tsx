import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KitRoot } from '@task-manager-v2/ui-kit';
import { WorkspaceSwitcher, type WorkspaceSwitcherProps } from './WorkspaceSwitcher';

const verso = { id: 'w1', slug: 'verso', name: 'Verso team' };
const side = { id: 'w2', slug: 'side', name: 'Side project' };
const user = { id: 'u1', name: 'Alex Kim', email: 'alex@verso.dev' };

const setup = (props: Partial<WorkspaceSwitcherProps> = {}) => {
  const handlers = { onWorkspaceChange: vi.fn(), onSignOut: vi.fn() };
  render(
    <KitRoot>
      <WorkspaceSwitcher
        workspace={verso}
        workspaces={[verso, side]}
        user={user}
        canWorkspaceSettings={false}
        canInvite={false}
        {...handlers}
        {...props}
      />
    </KitRoot>,
  );

  return handlers;
};

const open = async (name = 'Verso team, workspace menu') => {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.findByRole('menu');
};

/** A real press: the menu takes a click on an item only after a pointerdown on it. */
const choose = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { pointerType: 'mouse', button: 0 });
  fireEvent.pointerUp(element, { pointerType: 'mouse', button: 0 });
  fireEvent.click(element);
};

/** The items' names, in order, whatever kind each is; the "keys" text left out. */
const itemNames = (menu: HTMLElement) =>
  [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map(
    (item) => item.getAttribute('aria-label') ?? item.querySelector('[class*="label"]')?.textContent ?? item.textContent,
  );

describe('WorkspaceSwitcher', () => {
  it('shows the workspace; its menu lists them all, the current one checked', async () => {
    setup();

    const menu = await open();

    expect(within(menu).getByRole('menuitemradio', { name: 'Verso team' }).getAttribute('aria-checked')).toBe('true');
    expect(within(menu).getByRole('menuitemradio', { name: 'Side project' }).getAttribute('aria-checked')).toBe('false');
  });

  it('a dot at another workspace with unread, none at the current one', async () => {
    setup({ unreadByWorkspace: { w1: 5, w2: 120 } });

    const menu = await open();

    expect(within(menu).getByRole('menuitemradio', { name: 'Side project, 99+ unread' })).toBeTruthy();
    expect(within(menu).getByRole('menuitemradio', { name: 'Verso team' })).toBeTruthy();
  });

  it('choosing another workspace switches to it', async () => {
    const { onWorkspaceChange } = setup();

    const menu = await open();
    choose(within(menu).getByRole('menuitemradio', { name: 'Side project' }));

    // The menu handles the press in a microtask
    await waitFor(() => expect(onWorkspaceChange).toHaveBeenCalledWith('w2'));
  });

  it('a guest gets the workspaces and their account, nothing of the workspace', async () => {
    setup({ onOpenSettings: vi.fn(), onInvite: vi.fn(), onNewWorkspace: vi.fn() });

    const menu = await open();

    expect(itemNames(menu)).toEqual(['Verso team', 'Side project', 'Profile', 'Preferences', 'Sign out']);
    // Who is signed in names the account's group; it is no item
    expect(within(menu).getByRole('group', { name: 'Alex Kim alex@verso.dev' })).toBeTruthy();
  });

  it('with a role: New workspace, Workspace settings; with members.invite: Invite members', async () => {
    const onOpenSettings = vi.fn();
    setup({ canWorkspaceSettings: true, canInvite: true, onOpenSettings, onInvite: vi.fn(), onNewWorkspace: vi.fn() });

    const menu = await open();

    expect(itemNames(menu)).toEqual([
      'Verso team',
      'Side project',
      'New workspace',
      'Workspace settings',
      'Invite members',
      'Profile',
      'Preferences',
      'Sign out',
    ]);

    choose(within(menu).getByRole('menuitem', { name: 'Workspace settings' }));
    await waitFor(() => expect(onOpenSettings).toHaveBeenCalledWith('workspace'));
  });

  it('an item with nowhere to go yet is not there', async () => {
    setup({ canWorkspaceSettings: true, canInvite: true });

    const menu = await open();

    expect(itemNames(menu)).toEqual(['Verso team', 'Side project', 'Sign out']);
  });

  it('signs out', async () => {
    const { onSignOut } = setup();

    const menu = await open();
    choose(within(menu).getByRole('menuitem', { name: /^Sign out/ }));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });

  it('while the workspace loads: a skeleton, no menu', () => {
    setup({ workspace: null });

    expect(screen.getByRole('status', { name: 'Loading workspace' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('on the rail: the mark alone opens the same menu', async () => {
    setup({ rail: true });

    const trigger = screen.getByRole('button', { name: 'Verso team, workspace menu' });
    expect(trigger.textContent).toBe('V');

    const menu = await open();
    expect(within(menu).getByRole('menuitemradio', { name: 'Side project' })).toBeTruthy();
  });
});
