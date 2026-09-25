import React, { useState } from 'react';
import { cx } from '../../utils';
import { useMessages } from '../../messages';
import styles from './Avatar.module.scss';

export type AvatarSize = 'xs' | 'sm' | 'md';

type AvatarOwnProps = {
  /** xs — a menu (16); sm — a card, a table row (20); md — the panel, presence (28). */
  size?: AvatarSize;
};

/** A person: the kit knows nothing about users — only a name, a stable id and a photo URL. */
type PersonProps = {
  name: string;
  /** Picks the initials' tone: the same person always gets the same one. Default: the name. */
  id?: string | number;
  src?: string;
  onClick?: undefined;
};

/** Nobody (no assignee): a dashed ring. With `onClick` it is the button that assigns someone. */
type EmptyProps = {
  name?: undefined;
  id?: undefined;
  src?: undefined;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
};

export type AvatarProps = AvatarOwnProps &
  (PersonProps | EmptyProps) &
  Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'onClick' | 'id'> & { ref?: React.Ref<HTMLElement> };

/** Two letters — first and last word; one letter at 16 px, where two are unreadable (spec 08). */
export const initialsOf = (name: string, size: AvatarSize) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [words[0]?.[0] ?? ''];

  return (size === 'xs' ? letters.slice(0, 1) : letters).join('').toUpperCase();
};

/** A stable tone 1…4 for an id (djb2): the same person, the same color, on every screen. */
export const toneOf = (key: string | number) => {
  let hash = 5381;

  for (const char of String(key)) {
    // `| 0` keeps it a 32-bit integer however long the id is.
    hash = (((hash << 5) + hash) ^ char.charCodeAt(0)) | 0;
  }

  return (Math.abs(hash) % 4) + 1;
};

const Photo: React.FC<{ src: string }> = ({ src }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    // Initials until it loads, then the photo at once — no fade (spec 08).
    <img
      className={styles.photo}
      src={src}
      alt=""
      data-loaded={loaded ? '' : undefined}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
};

/** A person as a circle (spec 08): the photo, or initials on a neutral tone. */
export const Avatar: React.FC<AvatarProps> = ({ name, id, src, size = 'sm', onClick, className, ref, ...props }) => {
  const messages = useMessages();

  if (name === undefined) {
    const emptyClass = cx(styles.avatar, styles[size], styles.empty, className);

    return onClick ? (
      <button
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        className={cx(emptyClass, styles.assign)}
        aria-label={props['aria-label'] ?? messages.assign}
        onClick={onClick}
      />
    ) : (
      <span {...props} ref={ref as React.Ref<HTMLSpanElement>} className={emptyClass} aria-hidden={props['aria-hidden'] ?? true} />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      {...props}
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cx(styles.avatar, styles[size], className)}
      data-tone={toneOf(id ?? name)}
    >
      <span className={styles.initials} aria-hidden="true">
        {initialsOf(name, size)}
      </span>
      {/* Keyed by src: a new photo starts over from the initials. */}
      {src && <Photo key={src} src={src} />}
    </span>
  );
};
