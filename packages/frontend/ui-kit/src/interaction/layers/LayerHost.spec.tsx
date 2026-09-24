import { act, render } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { LayerHost } from './LayerHost';
import { useLayerStore } from './store';
import { useEscapeStore, useListenEscape } from '../escape';

function Harness() {
  useListenEscape();
  return <LayerHost />;
}

beforeEach(() => {
  useLayerStore.setState({ layer: null, openedBy: null });
  useEscapeStore.setState({ stack: [] });
});

it('renders the layer, then Escape closes it and returns focus to the opener', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();

  render(<Harness />);

  act(() => {
    useLayerStore.getState().openLayer(<div>Palette</div>);
  });
  expect(document.body.textContent).toContain('Palette');

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  expect(useLayerStore.getState().layer).toBeNull();
  expect(document.activeElement).toBe(opener);

  opener.remove();
});
