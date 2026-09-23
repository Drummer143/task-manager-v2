export type HotkeyCallback = (event: KeyboardEvent) => void;

export interface HotkeyConfigConfig {
    key: string;

    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    meta?: boolean;
}

export interface HotkeyConfig extends HotkeyConfigConfig {
  callback: HotkeyCallback;
  description: string;

  chord?: HotkeyConfigConfig;
}
