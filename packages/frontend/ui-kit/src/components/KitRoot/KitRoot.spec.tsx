import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitRoot } from './KitRoot';
import { tooltipProps } from '../Tooltip';
import tooltipStyles from '../Tooltip/TooltipHost.module.scss';
import { useLayerStore } from '../../interaction/layers';
import { useEscapeStack } from '../../interaction/escape';
import { useRegisterHotkey } from '../../interaction/hotkeys';
import { isKeyboardFocus } from '../Tooltip/isKeyboardFocus';

vi.mock('../Tooltip/isKeyboardFocus', () => ({ isKeyboardFocus: vi.fn(() => true) }));

const tooltip = () => document.body.querySelector(`.${tooltipStyles.root}`);

const pressEscape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

beforeEach(() => {
  vi.mocked(isKeyboardFocus).mockReturnValue(true);
  useLayerStore.setState({ layer: null, openedBy: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * KitRoot is the contract "mount me once and everything global works".
 * Each test checks one piece through its public behavior, so removing a host
 * or a listener from KitRoot fails here — not somewhere in an app screen.
 */
describe('KitRoot', () => {
  it('renders its children', () => {
    render(
      <KitRoot>
        <p>Board</p>
      </KitRoot>,
    );

    screen.getByText('Board');
  });

  it('mounts the tooltip host', () => {
    render(
      <KitRoot>
        <button type="button" {...tooltipProps({ text: 'Create task' })}>
          +
        </button>
      </KitRoot>,
    );

    act(() => screen.getByRole('button').focus());

    expect(tooltip()?.textContent).toBe('Create task');
  });

  it('mounts the layer host', () => {
    render(
      <KitRoot>
        <p>Board</p>
      </KitRoot>,
    );

    act(() => useLayerStore.getState().openLayer(<div role="dialog" aria-label="Palette" />));

    screen.getByRole('dialog', { name: 'Palette' });
  });

  it('drives the Esc ladder', () => {
    const close = vi.fn(() => true);
    const Panel = () => {
      useEscapeStack(close);
      return null;
    };

    render(
      <KitRoot>
        <Panel />
      </KitRoot>,
    );
    pressEscape();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('listens for hotkeys', () => {
    const callback = vi.fn();
    const config = { key: 'c', description: 'Create task', callback };
    const Board = () => {
      useRegisterHotkey(config);
      return null;
    };

    render(
      <KitRoot>
        <Board />
      </KitRoot>,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('keeps hosts single when nested by mistake — one tooltip, one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <KitRoot>
        <KitRoot>
          <button type="button" {...tooltipProps({ text: 'Status' })}>
            S
          </button>
        </KitRoot>
      </KitRoot>,
    );

    act(() => screen.getByRole('button').focus());

    expect(document.body.querySelectorAll(`.${tooltipStyles.root}`)).toHaveLength(1);
    expect(warn.mock.calls.map(([message]) => String(message).split(' ')[0])).toEqual(
      expect.arrayContaining(['KitRoot', 'TooltipHost', 'LayerHost']),
    );
  });
});
