import type React from 'react';
import { forwardRef } from 'react';

import type { MarkTone } from './auth-errors';
import styles from './AuthScreen.module.scss';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export interface AuthFrameProps {
  /** Centre the content (waiting) instead of aligning it to the start (errors). */
  centered?: boolean;
  /** Fade the column in (the first appearance of something to see). */
  fade?: boolean;
  role?: 'status' | 'alert';
  children?: React.ReactNode;
}

/** The page of a sign-in screen: the theme's background and one column in the middle. */
export const AuthFrame: React.FC<AuthFrameProps> = ({ centered, fade, role, children }) => (
  <main className={styles.frame}>
    <div className={cx(styles.column, centered && styles.center, fade && styles.fade)} role={role}>
      {children}
    </div>
  </main>
);

export const Wordmark: React.FC = () => <div className={styles.wordmark}>Verso</div>;

/** The small square with a symbol that says what kind of outcome this is. Not an illustration. */
export const Mark: React.FC<{ tone: MarkTone; children: string }> = ({ tone, children }) => (
  <span className={cx(styles.mark, styles[tone])} aria-hidden>
    {children}
  </span>
);

export const AuthTitle = forwardRef<HTMLHeadingElement, { children: React.ReactNode }>(({ children }, ref) => (
  // Focused when an error appears, so screen readers start with it
  <h1 ref={ref} className={styles.title} tabIndex={-1}>
    {children}
  </h1>
));
AuthTitle.displayName = 'AuthTitle';

export const AuthText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className={styles.text}>{children}</p>
);

export const AuthStatus: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.status}>{children}</div>
);

export const AuthActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.actions}>{children}</div>
);

export interface AuthDetailsProps {
  code: string;
  requestId: string;
  copyLabel: string;
  onCopy: () => void;
}

/** The error code and request id people can forward to an administrator. */
export const AuthDetails: React.FC<AuthDetailsProps> = ({ code, requestId, copyLabel, onCopy }) => (
  <div className={styles.details}>
    <span>{code}</span>
    <span aria-hidden>·</span>
    <span>req {requestId}</span>
    <span className={styles.spacer} />
    <button type="button" className={styles.copy} onClick={onCopy}>
      {copyLabel}
    </button>
  </div>
);
