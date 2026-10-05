import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as menu from '@zag-js/menu';
import { mergeProps, normalizeProps, useMachine, type PropTypes } from '@zag-js/react';
import { cx } from '../../utils';
import { raw } from '../../tokens';
import { CheckIcon, ChevronRightIcon } from '../../icons';
import { useDelayedFlag } from '../../hooks';
import { useMessages } from '../../messages';
import { LinkBase } from '../Link';
import { positionerStyle, usePresence } from '../../overlay';
import { filterByLabel } from '../CommandPalette/matchLabel';
import { Kbd, matchKeys } from '../Kbd';
import { Spinner } from '../Spinner';
import { Surface } from '../Surface';
import { tooltipProps } from '../Tooltip';
import type {
  MenuActionItem,
  MenuCheckboxItem,
  MenuItem,
  MenuLabelItem,
  MenuRadioGroupItem,
  MenuSubmenuItem,
} from './types';
import type { AsyncItemState } from './useAsyncItems';
import styles from './Menu.module.scss';

export type MenuApi = menu.Api<PropTypes>;

/** What a level of the menu needs to run its items. */
export interface MenuLevelContext {
  api: MenuApi;
  service: menu.Service;
  /** Runs an action item; closes the menu unless it is async. */
  runAction(item: MenuActionItem): void;
  asyncState(id: string): AsyncItemState;
  /** Submenus only one level deep (spec 09). */
  depth: number;
}

/** A section between separators; a leading label makes it a named group. */
interface Section {
  label?: MenuLabelItem;
  items: MenuItem[];
}

const sectionsOf = (items: MenuItem[]): Section[] => {
  const sections: Section[] = [{ items: [] }];

  for (const item of items) {
    const current = sections[sections.length - 1];

    if (item.type === 'separator') {
      sections.push({ items: [] });
    } else if (item.type === 'label') {
      if (current.items.length > 0 || current.label) {
        sections.push({ label: item, items: [] });
      } else {
        current.label = item;
      }
    } else {
      current.items.push(item);
    }
  }

  return sections.filter((section) => section.items.length > 0 || section.label);
};

/**
 * The 16 px slot on the left is one for the whole menu, so the texts line up
 * on one vertical (spec 09). It is there when anything uses it.
 */
const needsSlot = (items: MenuItem[]) =>
  items.some(
    (item) =>
      item.type === 'checkbox' ||
      ((item.type === 'action' || item.type === 'submenu') && item.icon !== undefined) ||
      // A radio group always uses it: for its dot, or for its options' own signs.
      item.type === 'radio-group',
  );

/** A radio option with a sign of its own moves the choice to a check at the right. */
const hasOwnSigns = (group: MenuRadioGroupItem) => group.options.some((option) => option.icon !== undefined);

const isEditable = (target: EventTarget) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));

/** A key that types a character: it goes into a menu's filter field. */
const isTyping = (event: React.KeyboardEvent) =>
  event.key.length === 1 && event.key !== ' ' && !event.metaKey && !event.ctrlKey && !event.altKey;

/** Hotkeys of this level's items, while it is open (spec 09); not while typing into a filter. */
const itemForKeys = (items: MenuItem[], event: React.KeyboardEvent) =>
  isEditable(event.target) ? undefined : items.find(
    (item): item is MenuActionItem | MenuCheckboxItem =>
      (item.type === 'action' || item.type === 'checkbox') &&
      item.keys !== undefined &&
      item.disabledReason === undefined &&
      matchKeys(item.keys, event.nativeEvent),
  );

const Slot: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span className={styles.slot} aria-hidden="true">
    {children}
  </span>
);

const ActionRow: React.FC<{ item: MenuActionItem; level: MenuLevelContext; slot: boolean }> = ({ item, level, slot }) => {
  const messages = useMessages();
  const { busy, error } = level.asyncState(item.id);
  // The press is ignored at once; the spinner waits its delay (spec 02).
  const showSpinner = useDelayedFlag(busy);
  const disabled = item.disabledReason !== undefined;

  const props = mergeProps(
    // Never closed by Zag: the item decides once it knows whether it is async.
    level.api.getItemProps({ value: item.id, disabled, valueText: item.label, closeOnSelect: false }),
    {
      className: cx(styles.item, item.danger && styles.danger),
      'aria-busy': busy || undefined,
      ...(disabled ? tooltipProps({ reason: item.disabledReason as string }) : undefined),
    },
  );

  const content = (
    <>
      {slot && <Slot>{showSpinner ? <Spinner size="sm" variant="neutral" /> : item.icon}</Slot>}
      <span className={styles.text}>
        <span className={styles.label}>{item.label}</span>
        {item.description && <span className={styles.description}>{item.description}</span>}
        {error && (
          <span className={styles.error}>
            {error} · {messages.menuRetryHint}
          </span>
        )}
      </span>
      {item.keys && <Kbd className={styles.trailing} keys={item.keys} variant="inline" />}
    </>
  );

  if (item.href !== undefined && !disabled) {
    return (
      // Zag clicks the link on Enter; LinkBase sends the click through the router adapter.
      <LinkBase {...props} href={item.href}>
        {content}
      </LinkBase>
    );
  }

  return <div {...props}>{content}</div>;
};

const CheckboxRow: React.FC<{ item: MenuCheckboxItem; level: MenuLevelContext }> = ({ item, level }) => {
  const disabled = item.disabledReason !== undefined;
  const props = level.api.getOptionItemProps({
    type: 'checkbox',
    value: item.id,
    checked: item.checked,
    disabled,
    valueText: item.label,
    // Several are often toggled in a row (spec 09).
    closeOnSelect: false,
    onCheckedChange: item.onCheckedChange,
  });

  return (
    <div {...props} className={styles.item} {...(disabled ? tooltipProps({ reason: item.disabledReason as string }) : undefined)}>
      <Slot>{item.checked && <CheckIcon className={styles.check} />}</Slot>
      <span className={styles.text}>
        <span className={styles.label}>{item.label}</span>
      </span>
      {item.keys && <Kbd className={styles.trailing} keys={item.keys} variant="inline" />}
    </div>
  );
};

/** The keys an input needs for itself: Zag would take them for the list (Space chooses, Home/End jump). */
const FIELD_KEYS = new Set([' ', 'Home', 'End', 'ArrowLeft', 'ArrowRight']);

const RadioGroup: React.FC<{ item: MenuRadioGroupItem; level: MenuLevelContext; slot: boolean }> = ({ item, level, slot }) => {
  const messages = useMessages();
  const groupId = `${useId()}-group`;
  const trailing = hasOwnSigns(item);
  const [filter, setFilter] = useState('');
  const filtering = item.filterable === true && item.options.length > raw['menu-filter-after'];
  const options = filtering && filter ? filterByLabel(item.options, filter) : item.options;
  const valueOf = (value: string) => `${item.id}:${value}`;

  const rows = options.map((option) => {
    const checked = option.value === item.value;
    const disabled = option.disabledReason !== undefined;

    return (
      <div
        key={option.value}
        {...level.api.getOptionItemProps({
          type: 'radio',
          value: valueOf(option.value),
          checked,
          disabled,
          valueText: option.label,
          // One value finishes the task (spec 09).
          closeOnSelect: true,
          onCheckedChange: () => item.onValueChange(option.value),
        })}
        aria-label={option.dot ? `${option.label}, ${option.dot}` : undefined}
        className={styles.item}
        {...(disabled ? tooltipProps({ reason: option.disabledReason as string }) : undefined)}
      >
        {slot && <Slot>{trailing ? option.icon : checked && <span className={styles.radioDot} />}</Slot>}
        <span className={styles.text}>
          <span className={styles.label}>{option.label}</span>
        </span>
        {option.dot && <span className={cx(styles.trailing, styles.dot)} {...tooltipProps({ text: option.dot })} />}
        {trailing && checked && <CheckIcon className={cx(styles.trailing, styles.check)} aria-hidden="true" />}
      </div>
    );
  });

  return (
    <div {...level.api.getItemGroupProps({ id: groupId })} className={styles.group}>
      {item.label && (
        <div {...level.api.getItemGroupLabelProps({ htmlFor: groupId })} className={styles.groupLabel}>
          {item.label}
        </div>
      )}
      {filtering ? (
        <>
          <input
            className={styles.filter}
            data-menu-filter=""
            type="text"
            value={filter}
            placeholder={messages.menuFilter}
            aria-label={messages.menuFilter}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value;
              const first = (next ? filterByLabel(item.options, next) : item.options).find(
                (option) => option.disabledReason === undefined,
              );

              setFilter(next);
              // The cursor stays on what is left: Enter takes the best match.
              if (first) {
                level.api.setHighlightedValue(valueOf(first.value));
              }
            }}
            onKeyDown={(event) => {
              if (FIELD_KEYS.has(event.key)) {
                event.stopPropagation();
              }
            }}
          />
          <div className={styles.scroll}>
            {rows.length > 0 ? rows : <div className={styles.empty}>{messages.menuFilterEmpty}</div>}
          </div>
        </>
      ) : (
        rows
      )}
    </div>
  );
};

const SubmenuRow: React.FC<{ item: MenuSubmenuItem; level: MenuLevelContext; slot: boolean }> = ({ item, level, slot }) => {
  const service = useMachine(menu.machine, {
    id: useId(),
    positioning: { placement: 'right-start', gutter: 0, overflowPadding: raw['overlay-margin'], flip: true, slide: true },
    onSelect: ({ value }) => {
      const action = item.items.find((child): child is MenuActionItem => child.type === 'action' && child.id === value);

      if (action) {
        level.runAction(action);
      }
    },
  });
  const api = menu.connect(service, normalizeProps);
  const disabled = item.disabledReason !== undefined;

  // Registered once: the parent and this child live and go together. The
  // services are stable; `api` and `level` are new objects every render.
  const { setChild } = level.api;
  const { setParent } = api;
  const parentService = level.service;

  useEffect(() => {
    setChild(service);
    setParent(parentService);
    // The setters come from `api` objects that are new every render (see above)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, parentService]);

  const childLevel = childLevelOf(api, service, level);
  const triggerProps = mergeProps(level.api.getTriggerItemProps(api), {
    className: styles.item,
    ...(disabled ? tooltipProps({ reason: item.disabledReason as string }) : undefined),
  });

  return (
    <>
      <div {...triggerProps} aria-disabled={disabled || undefined} data-disabled={disabled ? '' : undefined}>
        {slot && <Slot>{item.icon}</Slot>}
        <span className={styles.text}>
          <span className={styles.label}>{item.label}</span>
        </span>
        {/* A submenu has no hotkey: the chevron takes its place (spec 09). */}
        <ChevronRightIcon className={cx(styles.trailing, styles.chevron)} />
      </div>
      {!disabled && <MenuPanel level={childLevel} items={item.items} />}
    </>
  );
};

/** A submenu runs its actions like its parent, one level deeper. */
const childLevelOf = (api: MenuApi, service: menu.Service, parent: MenuLevelContext): MenuLevelContext => ({
  api,
  service,
  runAction: parent.runAction,
  asyncState: parent.asyncState,
  depth: parent.depth + 1,
});

const Rows: React.FC<{ items: MenuItem[]; level: MenuLevelContext; slot: boolean }> = ({ items, level, slot }) => (
  <>
    {items.map((item) => {
      switch (item.type) {
        case 'action':
          return <ActionRow key={item.id} item={item} level={level} slot={slot} />;
        case 'checkbox':
          return <CheckboxRow key={item.id} item={item} level={level} />;
        case 'radio-group':
          return <RadioGroup key={item.id} item={item} level={level} slot={slot} />;
        case 'submenu':
          return level.depth === 0 ? <SubmenuRow key={item.id} item={item} level={level} slot={slot} /> : null;
        default:
          return null;
      }
    })}
  </>
);

const Group: React.FC<{ section: Section; level: MenuLevelContext; slot: boolean }> = ({ section, level, slot }) => {
  const groupId = `${useId()}-group`;

  if (!section.label) {
    return <Rows items={section.items} level={level} slot={slot} />;
  }

  return (
    <div {...level.api.getItemGroupProps({ id: groupId })} className={styles.group}>
      <div
        {...level.api.getItemGroupLabelProps({ htmlFor: groupId })}
        className={cx(styles.groupLabel, section.label.content !== undefined && styles.groupLabelContent)}
      >
        {section.label.content ?? section.label.label}
      </div>
      <Rows items={section.items} level={level} slot={slot} />
    </div>
  );
};

/** One level of the menu in its portal: positioned, on the default surface, marked as a layer. */
export const MenuPanel: React.FC<{ level: MenuLevelContext; items: MenuItem[]; className?: string }> = ({
  level,
  items,
  className,
}) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const mounted = usePresence(level.api.open, contentRef);
  const positioner = level.api.getPositionerProps();
  const slot = needsSlot(items);
  const sections = sectionsOf(items);

  if (!mounted) {
    return null;
  }

  const contentProps = mergeProps(level.api.getContentProps(), {
    // Before Zag's own keys: an item's hotkey runs it, even a letter that
    // typeahead would otherwise take (spec 09).
    onKeyDown: (event: React.KeyboardEvent) => {
      const item = itemForKeys(items, event);

      if (!item) {
        // Typing in a menu with a filter goes into the field. Focus moves before the
        // character lands, so the browser puts it there; Zag's typeahead never sees it.
        const field = contentRef.current?.querySelector<HTMLInputElement>('[data-menu-filter]');

        if (field && isTyping(event) && !isEditable(event.target)) {
          field.focus();
          event.stopPropagation();
        }

        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (item.type === 'checkbox') {
        item.onCheckedChange(!item.checked);
      } else {
        level.runAction(item);
      }
    },
  });

  return createPortal(
    <div {...positioner} style={positionerStyle(positioner.style)} data-layer="">
      <Surface tone="default" asChild>
        <div {...contentProps} ref={contentRef} hidden={!mounted} className={cx(styles.content, className)}>
          {sections.map((section, index) => (
            <React.Fragment key={index}>
              {index > 0 && <div {...level.api.getSeparatorProps()} className={styles.separator} />}
              <Group section={section} level={level} slot={slot} />
            </React.Fragment>
          ))}
        </div>
      </Surface>
    </div>,
    document.body,
  );
};
