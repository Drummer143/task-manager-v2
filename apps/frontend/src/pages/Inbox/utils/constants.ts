import { ListNotificationsView } from '@task-manager-v2/api/main/schemas';
import { oneOf } from '../../../shared/hooks/useSearchParam';
import { SegmentedOption } from '@task-manager-v2/ui-kit';

export const VIEW_OPTIONS: ListNotificationsView[] = [
  'all',
  'unread',
  'archived',
] as const;

const VIEW_KEYS: Record<ListNotificationsView, string> = {
  all: 'g>a',
  unread: 'g>u',
  archived: 'g>e',
};

export const viewValidation = oneOf(VIEW_OPTIONS);

export const segmentedOptions: SegmentedOption<ListNotificationsView>[] =
  VIEW_OPTIONS.map((option) => ({
    value: option,
    keys: VIEW_KEYS[option],
    label: option.charAt(0).toUpperCase() + option.slice(1),
  }));
