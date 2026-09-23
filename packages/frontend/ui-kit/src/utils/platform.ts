export type KeyPlatform = 'mac' | 'other';

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

/** Apple platforms show ⌘-style glyphs; everything else shows Ctrl/Alt/Shift words. */
export const detectPlatform = (): KeyPlatform => {
  if (typeof navigator === 'undefined') {
    return 'other';
  }

  const nav = navigator as NavigatorWithUAData;
  const platform = nav.userAgentData?.platform || nav.platform || '';

  return /mac|iphone|ipad|ipod/i.test(platform) ? 'mac' : 'other';
};
