import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, initialsOf, toneOf } from './Avatar';
import { AvatarStack } from './AvatarStack';
import { KitRoot } from '../KitRoot';
import styles from './Avatar.module.scss';

describe('initialsOf', () => {
  it('takes the first and the last word', () => {
    expect(initialsOf('anna maria kim', 'sm')).toBe('AK');
  });

  it('takes one letter from one word, and one letter at 16 px', () => {
    expect(initialsOf('Ivan', 'md')).toBe('I');
    expect(initialsOf('Anna Kim', 'xs')).toBe('A');
  });

  it('survives extra spaces and an empty name', () => {
    expect(initialsOf('  Anna   Kim ', 'sm')).toBe('AK');
    expect(initialsOf('', 'sm')).toBe('');
  });
});

describe('toneOf', () => {
  it('is stable and within 1…4 — the same person, the same color', () => {
    const tones = ['u1', 'u2', 'u3', 42, 'a very long id '.repeat(40)].map(toneOf);

    expect(tones.every((tone) => tone >= 1 && tone <= 4)).toBe(true);
    expect(toneOf('u1')).toBe(toneOf('u1'));
  });

  it('spreads ids over the four tones', () => {
    const used = new Set(Array.from({ length: 40 }, (_, index) => toneOf(`user-${index}`)));

    expect(used.size).toBe(4);
  });
});

describe('Avatar', () => {
  it('is an image named by the person, showing initials', () => {
    const { container } = render(<Avatar name="Anna Kim" id="u1" />);

    screen.getByRole('img', { name: 'Anna Kim' });
    expect(container.textContent).toBe('AK');
    expect(container.firstElementChild?.classList.contains(styles.sm)).toBe(true);
    expect(container.firstElementChild?.getAttribute('data-tone')).toBe(String(toneOf('u1')));
  });

  it('keeps the initials until the photo loads, then shows it at once', () => {
    const { container } = render(<Avatar name="Anna Kim" src="/a.png" />);
    const photo = container.querySelector('img') as HTMLImageElement;

    expect(photo.hasAttribute('data-loaded')).toBe(false);
    expect(photo.getAttribute('alt')).toBe('');

    fireEvent.load(photo);

    expect(photo.hasAttribute('data-loaded')).toBe(true);
  });

  it('falls back to the initials when the photo fails', () => {
    const { container } = render(<Avatar name="Anna Kim" src="/missing.png" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('AK');
  });

  it('is a dashed, decorative ring for nobody', () => {
    const { container } = render(<Avatar />);
    const empty = container.firstElementChild as HTMLElement;

    expect(empty.classList.contains(styles.empty)).toBe(true);
    expect(empty.getAttribute('aria-hidden')).toBe('true');
  });

  it('assigns someone when the empty one is clickable', () => {
    const onClick = vi.fn();
    render(
      <KitRoot messages={{ assign: 'Назначить' }}>
        <Avatar onClick={onClick} />
      </KitRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Назначить' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('AvatarStack', () => {
  const PEOPLE = ['Anna Kim', 'Ivan Petrov', 'Maria Sokolova', 'Oleg Ivanov', 'Pavel Orlov'].map((name, id) => ({ id, name }));

  it('shows at most three faces and a counter that names the rest', () => {
    render(<AvatarStack people={PEOPLE} aria-label="Watching" />);

    screen.getByRole('group', { name: 'Watching' });
    expect(screen.getAllByRole('img').map((face) => face.getAttribute('aria-label'))).toEqual([
      'Anna Kim',
      'Ivan Petrov',
      'Maria Sokolova',
      '2 more',
    ]);
    expect(screen.getByRole('img', { name: '2 more' }).getAttribute('data-tooltip')).toBe('Oleg Ivanov, Pavel Orlov');
  });

  it('gives every face its name in a tooltip', () => {
    render(<AvatarStack people={PEOPLE.slice(0, 2)} />);

    expect(screen.getByRole('img', { name: 'Anna Kim' }).getAttribute('data-tooltip')).toBe('Anna Kim');
    expect(screen.queryByRole('img', { name: /more/ })).toBeNull();
  });
});
