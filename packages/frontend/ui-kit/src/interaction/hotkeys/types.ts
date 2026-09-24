export type HotkeyCallback = (event: KeyboardEvent) => void;

export interface HotkeyConfig {
    key: string;

    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    meta?: boolean;
}

export interface HotkeyHandlerConfig extends HotkeyConfig {
  callback: HotkeyCallback;
  description: string;

  chord?: HotkeyConfig;
}
