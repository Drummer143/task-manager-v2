import type { ComponentPropsWithRef, ReactNode, Ref } from 'react';
import { cloneElement, createContext, isValidElement, useContext, useMemo } from 'react';
import { composeRefs, cx } from '../../utils';

/**
 * The color environment of a subtree. `default` — the theme's own values,
 * `inverse` — the opposite set. What each means lives in tokens.css; the
 * component only marks the place.
 */
export type SurfaceTone = 'default' | 'inverse';

const SurfaceContext = createContext<SurfaceTone>('default');

/**
 * The nearest surface. Overlays render in a portal at <body>, out of reach of
 * CSS inheritance — they read this on the trigger side and set their own tone.
 */
export const useSurface = () => useContext(SurfaceContext);

/** Tooltip rule: the surface opposite to the one it hangs over. */
export const oppositeSurface = (tone: SurfaceTone): SurfaceTone =>
  tone === 'inverse' ? 'default' : 'inverse';

export interface SurfaceProps extends ComponentPropsWithRef<'div'> {
  tone: SurfaceTone;
  /** Put the surface on the single child element instead of wrapping it in a div. */
  asChild?: boolean;
  children?: ReactNode;
}

type ChildProps = { className?: string; ref?: Ref<unknown> } & Record<string, unknown>;

/**
 * Sets `data-surface` on the DOM and the tone in context. Written by a few kit
 * places (Tooltip, UndoToast, SelectionBar), almost never by hand.
 */
export function Surface({ tone, asChild = false, className, children, ref, ...rest }: SurfaceProps) {
  const parent = useSurface();
  const slotChild = asChild && isValidElement<ChildProps>(children) ? children : null;
  const childRef = slotChild?.props.ref;
  const slotRef = useMemo(() => composeRefs(ref, childRef), [ref, childRef]);

  if (import.meta.env.DEV && tone === 'inverse' && parent === 'inverse') {
    console.warn('Surface: inverse inside inverse — the place for this surface is chosen wrong.');
  }

  let content: ReactNode;

  if (slotChild) {
    content = cloneElement(slotChild, {
      ...rest,
      ...slotChild.props,
      className: cx(className, slotChild.props.className),
      ref: slotRef,
      'data-surface': tone,
    });
  } else {
    content = (
      <div {...rest} ref={ref} className={className} data-surface={tone}>
        {children}
      </div>
    );
  }

  return <SurfaceContext.Provider value={tone}>{content}</SurfaceContext.Provider>;
}

export default Surface;
