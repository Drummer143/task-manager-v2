import { createIcon } from './createIcon';

/* Checkbox marks: a heavier stroke, drawn at 12 px inside a 16 px box. */
export const CheckIcon = createIcon('CheckIcon', <path d="M20 6 9 17l-5-5" />, 3);
export const MinusIcon = createIcon('MinusIcon', <path d="M5 12h14" />, 3);

/* A removable tag's ×. */
export const XIcon = createIcon('XIcon', <path d="M18 6 6 18M6 6l12 12" />, 2.5);

/* A submenu's chevron. */
export const ChevronRightIcon = createIcon('ChevronRightIcon', <path d="m9 18 6-6-6-6" />);

/* The palette's and a filter's magnifier. */
export const SearchIcon = createIcon('SearchIcon', <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14" />);
