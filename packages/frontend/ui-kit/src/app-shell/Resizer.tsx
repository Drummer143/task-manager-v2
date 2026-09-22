import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import styles from './AppShell.module.css';

export interface ResizerProps {
  /** Current width in px. */
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** When true, dragging left increases the value (a panel on the right edge). */
  invert?: boolean;
  'aria-label'?: string;
}

/**
 * A vertical drag handle between two regions. Mouse/pointer only for now;
 * keyboard resize (arrow keys on the separator) belongs to the keyboard layer.
 */
export function Resizer({
  value,
  min,
  max,
  onChange,
  invert = false,
  'aria-label': ariaLabel,
}: ResizerProps) {
  const start = useRef<{ x: number; base: number } | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, base: value };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (s === null) return;
    const dx = (e.clientX - s.x) * (invert ? -1 : 1);
    onChange(clamp(s.base + dx));
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className={styles.resizer}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

export default Resizer;
