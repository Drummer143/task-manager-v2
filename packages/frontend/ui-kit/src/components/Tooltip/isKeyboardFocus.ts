/**
 * Keyboard focus = the element shows the focus ring. The same rule as the ring
 * itself (`:focus-visible` in tokens.css), so a tooltip from focus appears
 * exactly when the ring does. A click focuses without it.
 */
export const isKeyboardFocus = (element: Element) => {
  try {
    return element.matches(':focus-visible');
  } catch {
    // Environments without the pseudo-class (older jsdom) — treat as pointer focus.
    return false;
  }
};
