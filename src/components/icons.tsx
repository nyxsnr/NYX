/**
 * Icon set.
 *
 * Inline 24px stroke icons on a shared grid, drawn in `currentColor` so they
 * take the colour of whatever they sit in and need no dark-mode handling.
 *
 * These replace the emoji that previously stood in for navigation icons.
 * Emoji render as a different typeface on every platform, carry their own
 * colour, and are read aloud by screen readers as their unicode name — so a
 * nav item announced as "briefcase Jobs" was both inconsistent and noisy.
 * Every icon here is `aria-hidden`; the adjacent text is the accessible name.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'briefcase'
  | 'bolt'
  | 'badge-check'
  | 'wallet'
  | 'document'
  | 'user'
  | 'folder'
  | 'mic'
  | 'sparkles'
  | 'search'
  | 'building'
  | 'shield'
  | 'scales'
  | 'warning'
  | 'users'
  | 'chart'
  | 'bell'
  | 'arrow-right'
  | 'compass'
  | 'lock'
  | 'chat'
  | 'clipboard'
  | 'rocket';

/** Path geometry only; every icon shares the same canvas and stroke setup. */
const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.75',
  briefcase:
    'M3.75 8.25h16.5a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1ZM9 8.25V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.75M2.75 13.5h18.5',
  bolt: 'M13.5 2.75 4.75 13.5h6L10.5 21.25l8.75-10.75h-6l.25-7.75Z',
  'badge-check':
    'M12 2.75l2.2 1.6 2.7-.15 1 2.55 2.35 1.4-.85 2.6.85 2.6-2.35 1.4-1 2.55-2.7-.15L12 21.25l-2.2-1.6-2.7.15-1-2.55-2.35-1.4.85-2.6-.85-2.6 2.35-1.4 1-2.55 2.7.15L12 2.75ZM9 12l2.25 2.25L15.25 10',
  wallet:
    'M3.75 7.5h14.5a2 2 0 0 1 2 2v8.75a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2V6.25a2 2 0 0 1 2-2h11.5M16.5 13.75h.01',
  document:
    'M13.5 2.75H7a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.25l-5.5-5.5ZM13.25 3v5.25h5.25M8.5 13h7M8.5 16.75h4.5',
  user: 'M12 12.25a4.125 4.125 0 1 0 0-8.25 4.125 4.125 0 0 0 0 8.25ZM4.5 20.75a7.5 7.5 0 0 1 15 0',
  folder:
    'M3 7.25a2 2 0 0 1 2-2h3.9a1 1 0 0 1 .8.4l1.1 1.45a1 1 0 0 0 .8.4H19a2 2 0 0 1 2 2v8.75a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.25Z',
  mic: 'M12 3.25a2.75 2.75 0 0 1 2.75 2.75v5.5a2.75 2.75 0 0 1-5.5 0V6A2.75 2.75 0 0 1 12 3.25ZM5.75 11a6.25 6.25 0 0 0 12.5 0M12 17.5v3.25M8.75 20.75h6.5',
  sparkles:
    'M12 3.25 13.6 8l4.75 1.6L13.6 11.2 12 15.95 10.4 11.2 5.65 9.6 10.4 8 12 3.25ZM18.5 15.5l.7 2.05 2.05.7-2.05.7-.7 2.05-.7-2.05-2.05-.7 2.05-.7.7-2.05Z',
  search: 'M10.75 18a7.25 7.25 0 1 0 0-14.5 7.25 7.25 0 0 0 0 14.5ZM16.25 16.25 21 21',
  building:
    'M4 21.25V4.75a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16.5M16 10.25h2.5a2 2 0 0 1 2 2v9M2.75 21.25h18.5M8 7.25h4M8 11.25h4M8 15.25h4',
  shield:
    'M12 2.75 4.75 5.5v6.1c0 4.35 3 8.06 7.25 9.65 4.25-1.59 7.25-5.3 7.25-9.65V5.5L12 2.75ZM9.25 11.75 11.5 14l3.5-4',
  scales:
    'M12 3.25v17.5M7.5 20.75h9M4.5 6.25l15-1.5M4.5 6.25 2 13.25h5L4.5 6.25ZM19.5 4.75 17 11.75h5l-2.5-7ZM2 13.25a2.5 2.5 0 0 0 5 0M17 11.75a2.5 2.5 0 0 0 5 0',
  warning:
    'M10.7 3.75 2.6 17.75a1.5 1.5 0 0 0 1.3 2.25h16.2a1.5 1.5 0 0 0 1.3-2.25l-8.1-14a1.5 1.5 0 0 0-2.6 0ZM12 9.25v4.5M12 17h.01',
  users:
    'M9 11.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM2.25 20.25a6.75 6.75 0 0 1 13.5 0M16 4.6a3.75 3.75 0 0 1 0 7.15M17.5 14.4a6.76 6.76 0 0 1 4.25 5.85',
  chart: 'M3.75 3.75v15.5a1 1 0 0 0 1 1h15.5M7.75 16.25V11M12 16.25V7.5M16.25 16.25v-3.5',
  bell: 'M12 3.25a5.75 5.75 0 0 0-5.75 5.75c0 4.1-1.25 5.6-1.25 5.6h14s-1.25-1.5-1.25-5.6A5.75 5.75 0 0 0 12 3.25ZM10.25 18.25a1.9 1.9 0 0 0 3.5 0',
  'arrow-right': 'M4.75 12h14.5M13.5 6.25 19.25 12l-5.75 5.75',
  compass:
    'M12 21.25a9.25 9.25 0 1 0 0-18.5 9.25 9.25 0 0 0 0 18.5ZM15.5 8.5l-2 5-5 2 2-5 5-2Z',
  lock: 'M6.75 10.25V7.5a5.25 5.25 0 0 1 10.5 0v2.75M5.75 10.25h12.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5.75a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM12 14.5v3',
  chat: 'M4.75 4.75h14.5a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H9.5l-4.75 4v-4h-.75a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1Z',
  clipboard:
    'M9 4.75H7a2 2 0 0 0-2 2v12.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.75a2 2 0 0 0-2-2h-2M9 4.75a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5H9v-1.5ZM8.75 12h6.5M8.75 15.75h4',
  rocket:
    'M13.5 3.5c3.5 1 6 4.5 7 8l-4.25 4.25-5-5L15.5 6.5M13.5 3.5 6.75 6.25l-1 4.5 4.5-1M9.25 14.75c-1.5 1.5-1.5 4.5-1.5 4.5s3 0 4.5-1.5M5.5 18.5c-.75.75-1 3-1 3s2.25-.25 3-1',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Edge length in pixels. The stroke scales with it. */
  size?: number;
}

export function Icon({ name, size = 20, className = '', ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
