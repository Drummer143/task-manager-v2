import React from 'react';
import { cx } from '@task-manager-v2/ui-kit';
import styles from './WorkspaceMark.module.scss';

export interface WorkspaceMarkProps {
  name: string;
  /** Its icon; without one, the first letter of the name. */
  src?: string;
  className?: string;
}

/** The first character of the name, a whole one (an emoji, a letter with a mark), capitalised. */
export const markLetterOf = (name: string) => (Array.from(name.trim())[0] ?? '').toLocaleUpperCase();

/**
 * The workspace's sign (spec: Sidebar · 01): its icon in a frame, else the first letter of its
 * name. Decorative: the name is always next to it, or in the label of what holds it.
 */
export const WorkspaceMark: React.FC<WorkspaceMarkProps> = ({ name, src, className }) => (
  <span className={cx(styles.mark, className)} aria-hidden="true">
    {src ? <img className={styles.image} src={src} alt="" /> : markLetterOf(name)}
  </span>
);
