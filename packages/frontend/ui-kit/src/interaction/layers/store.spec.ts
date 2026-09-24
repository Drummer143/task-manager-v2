import { beforeEach, describe, expect, it } from 'vitest';
import { useLayerStore } from './store';

beforeEach(() => {
  useLayerStore.setState({ layer: null, openedBy: null });
});

describe('layer store', () => {
  it('holds a single layer; a second open replaces the first', () => {
    useLayerStore.getState().openLayer('palette');
    expect(useLayerStore.getState().layer).toBe('palette');

    useLayerStore.getState().openLayer('cheatsheet');
    expect(useLayerStore.getState().layer).toBe('cheatsheet');
  });

  it('returns focus to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    useLayerStore.getState().openLayer('palette');
    (document.activeElement as HTMLElement | null)?.blur?.();

    useLayerStore.getState().closeLayer();
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  it('keeps the original opener when one layer replaces another', () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    document.body.append(first, second);

    first.focus();
    useLayerStore.getState().openLayer('a'); // opener = first

    second.focus();
    useLayerStore.getState().openLayer('b'); // replace; opener stays = first

    useLayerStore.getState().closeLayer();
    expect(document.activeElement).toBe(first);

    first.remove();
    second.remove();
  });
});
