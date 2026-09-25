import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tag } from './Tag';
import { TagList } from './TagList';
import { KitRoot } from '../KitRoot';
import styles from './Tag.module.scss';

describe('Tag', () => {
  it.each(['neutral', 'accent', 'outline', 'danger'] as const)('takes the %s tone', (tone) => {
    render(<Tag tone={tone}>kit</Tag>);

    expect(screen.getByText('kit').parentElement?.classList.contains(styles[tone])).toBe(true);
  });

  it('is neutral and static by default: a span, no button', () => {
    const { container } = render(<Tag>infra</Tag>);

    expect(container.firstElementChild?.tagName).toBe('SPAN');
    expect(container.firstElementChild?.classList.contains(styles.neutral)).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a status: outline + a dot of the data color + the name — never color alone', () => {
    const { container } = render(
      <Tag dot color="#3b82f6">
        In progress
      </Tag>,
    );
    const tag = container.firstElementChild as HTMLElement;

    expect(tag.classList.contains(styles.outline)).toBe(true);
    expect(tag.style.getPropertyValue('--tag-color')).toBe('#3b82f6');
    expect(tag.querySelector(`.${styles.dot}`)?.getAttribute('aria-hidden')).toBe('true');
    expect(tag.textContent).toBe('In progress');
  });

  it('colors a user label through tint(), not as is', () => {
    const { container } = render(<Tag color="#e11d48">urgent</Tag>);
    const tag = container.firstElementChild as HTMLElement;

    expect(tag.classList.contains(styles.colored)).toBe(true);
    // The raw color is only an input for the CSS: no inline background.
    expect(tag.style.backgroundColor).toBe('');
  });

  it('is a button when clickable', () => {
    const onClick = vi.fn();
    render(<Tag onClick={onClick}>kit</Tag>);

    fireEvent.click(screen.getByRole('button', { name: 'kit' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
    expect(screen.getByRole('button').classList.contains(styles.clickable)).toBe(true);
  });

  it('is removable with an × that says what it removes', () => {
    const onRemove = vi.fn();
    render(
      <KitRoot messages={{ removeTag: 'Убрать' }}>
        <Tag onRemove={onRemove}>kit</Tag>
      </KitRoot>,
    );
    const remove = screen.getByRole('button', { name: 'Убрать', description: 'kit' });

    fireEvent.click(remove);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('forwards className, style and DOM props', () => {
    const { container } = render(
      <Tag className="custom" style={{ maxWidth: '1px' }} data-testid="tag" color="#000">
        kit
      </Tag>,
    );
    const tag = container.firstElementChild as HTMLElement;

    expect(tag.classList.contains('custom')).toBe(true);
    expect(tag.style.maxWidth).toBe('1px');
    expect(tag.style.getPropertyValue('--tag-color')).toBe('#000');
    expect(tag.getAttribute('data-testid')).toBe('tag');
  });
});

describe('TagList', () => {
  const TAGS = ['infra', 'kit', 'data', 'design', 'docs'].map((label, id) => ({ id, label }));

  it('shows at most three and collapses the rest into "+N" (spec 09 — a card)', () => {
    render(<TagList tags={TAGS} />);

    expect(screen.getByText('data')).toBeTruthy();
    expect(screen.queryByText('design')).toBeNull();
    const more = screen.getByText('+2');

    expect(more.parentElement?.getAttribute('data-tooltip')).toBe('design, docs');
    expect(more.parentElement?.tabIndex).toBe(0);
  });

  it('shows all without a counter when they fit', () => {
    render(<TagList tags={TAGS.slice(0, 3)} />);

    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('takes its own limit', () => {
    render(<TagList tags={TAGS} max={1} />);

    expect(screen.getByText('+4')).toBeTruthy();
  });
});
