import React from 'react';

export type IconProps = React.SVGProps<SVGSVGElement> & { ref?: React.Ref<SVGSVGElement> };

/**
 * A stroke icon on the 24 × 24 grid. Decorative by default (aria-hidden): the
 * meaning is carried by the text or the label next to it. The size is the
 * text's (1em) unless a kit slot sets it; the color is always currentColor.
 */
export const createIcon = (name: string, path: React.ReactNode, strokeWidth = 2) => {
  const Icon: React.FC<IconProps> = ({ ref, ...props }) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {path}
    </svg>
  );

  Icon.displayName = name;

  return Icon;
};
