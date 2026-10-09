import { ListNotificationsView } from '@task-manager-v2/api/main/schemas';
import { oneOf } from '../../shared/hooks/useSearchParam';
import { SegmentedOption } from '@task-manager-v2/ui-kit';

export const VIEW_OPTIONS: ListNotificationsView[] = [
  'all',
  'unread',
  'archived',
] as const;

export const viewValidation = oneOf(VIEW_OPTIONS);

export const segmentedOptions: SegmentedOption<ListNotificationsView>[] =
  VIEW_OPTIONS.map((option) => ({
    value: option,
    label: option.charAt(0).toUpperCase() + option.slice(1),
  }));
