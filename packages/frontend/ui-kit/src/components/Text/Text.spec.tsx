import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Heading } from './Heading';
import { Text } from './Text';
import styles from './Text.module.scss';

const has = (element: Element, ...classes: string[]) => classes.every((name) => element.classList.contains(name));

describe('Text', () => {
  it('is body text in a span by default, in the color around it', () => {
    render(<Text>Move task</Text>);
    const text = screen.getByText('Move task');

    expect(text.tagName).toBe('SPAN');
    expect(has(text, styles.text, styles.body)).toBe(true);
    expect(['primary', 'secondary', 'muted', 'accent', 'danger'].some((tone) => has(text, styles[tone]))).toBe(false);
  });

  it.each(['display', 'h1', 'h2', 'h3', 'body', 'meta'] as const)('takes the %s step', (size) => {
    render(<Text size={size}>step</Text>);

    expect(has(screen.getByText('step'), styles[size])).toBe(true);
  });

  it('takes its tag, role, weight, digits and family', () => {
    render(
      <Text as="label" htmlFor="title" tone="danger" weight="strong" numeric mono>
        TM-248
      </Text>,
    );
    const text = screen.getByText('TM-248');

    expect(text.tagName).toBe('LABEL');
    expect(text.getAttribute('for')).toBe('title');
    expect(has(text, styles.danger, styles.strong, styles.numeric, styles.mono)).toBe(true);
  });

  it('cuts one line with a tooltip that shows only when the text is actually cut', () => {
    render(<Text truncate>Move the token layer into a separate package</Text>);
    const text = screen.getByText(/Move the token layer/);

    expect(has(text, styles.truncate)).toBe(true);
    expect(text.hasAttribute('data-tooltip-overflow')).toBe(true);
  });

  it('clamps to N lines', () => {
    render(<Text truncate={2}>A long card title</Text>);
    const text = screen.getByText('A long card title');

    expect(has(text, styles.clamp)).toBe(true);
    expect(text.style.getPropertyValue('--_lines')).toBe('2');
    expect(text.hasAttribute('data-tooltip-overflow')).toBe(true);
  });

  it('wraps without a tooltip unless asked to truncate', () => {
    render(<Text as="p">Only project admins can block tasks.</Text>);
    const text = screen.getByText(/Only project admins/);

    expect(text.hasAttribute('data-tooltip-overflow')).toBe(false);
    expect(text.hasAttribute('data-tooltip')).toBe(false);
  });
});

describe('Heading', () => {
  it.each([
    ['display', 'H1', 'display'],
    [1, 'H1', 'h1'],
    [2, 'H2', 'h2'],
    [3, 'H3', 'h3'],
  ] as const)('level %s is the tag %s and the step %s', (level, tag, step) => {
    render(<Heading level={level}>Title</Heading>);
    const heading = screen.getByRole('heading', { name: 'Title' });

    expect(heading.tagName).toBe(tag);
    expect(has(heading, styles[step])).toBe(true);
  });

  it('takes the text props too', () => {
    render(
      <Heading level={2} tone="muted" truncate id="section">
        Activity
      </Heading>,
    );
    const heading = screen.getByRole('heading', { name: 'Activity' });

    expect(heading.id).toBe('section');
    expect(has(heading, styles.muted, styles.truncate)).toBe(true);
  });
});
