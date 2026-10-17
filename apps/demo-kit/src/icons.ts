/**
 * Icons of the site, as SVG path data: every app draws them with its own template
 * (`<svg viewBox fill stroke><path [d]/></svg>`) and marks them `aria-hidden`.
 * Stroke icons use a 24 × 24 box, `fill="none"`, `stroke="currentColor"`, width 1.8,
 * round caps and joins; `fill: true` icons are filled with `currentColor` instead.
 */

export interface SiteIcon {
  viewBox: string;
  paths: readonly string[];
  fill?: boolean;
}

const stroke = (...paths: string[]): SiteIcon => ({ viewBox: '0 0 24 24', paths });

export const ICONS = {
  home: stroke('M3.5 10.5 12 3.5l8.5 7', 'M5.5 9v11h13V9', 'M10 20v-5.5h4V20'),
  playground: stroke(
    'M4 6.5h9',
    'M17 6.5h3',
    'M13 6.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M4 12h3',
    'M11 12h9',
    'M7 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M4 17.5h11',
    'M19 17.5h1',
    'M15 17.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  ),
  examples: stroke('M4 4.5h7v7H4z', 'M13 4.5h7v7h-7z', 'M4 13.5h7v6H4z', 'M13 13.5h7v6h-7z'),
  theming: stroke('M12 3.5c3.2 3.8 6 7.1 6 10.5a6 6 0 0 1-12 0c0-3.4 2.8-6.7 6-10.5z', 'M9.5 15a2.5 2.5 0 0 0 2.5 2.5'),
  frameworks: stroke('M12 3.5 3.5 8 12 12.5 20.5 8z', 'M3.5 12 12 16.5 20.5 12', 'M3.5 16 12 20.5 20.5 16'),
  api: stroke(
    'M6 3.5h10.5A2.5 2.5 0 0 1 19 6v14.5H8.5A2.5 2.5 0 0 1 6 18z',
    'M6 18a2.5 2.5 0 0 1 2.5-2.5H19',
    'M10 8h5',
  ),
  moon: stroke('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'),
  sun: stroke(
    'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
    'M12 2.5v2',
    'M12 19.5v2',
    'M5.3 5.3l1.4 1.4',
    'M17.3 17.3l1.4 1.4',
    'M2.5 12h2',
    'M19.5 12h2',
    'M5.3 18.7l1.4-1.4',
    'M17.3 6.7l1.4-1.4',
  ),
  copy: stroke('M9 9h10.5v10.5H9z', 'M15 9V4.5H4.5V15H9'),
  check: stroke('M5 12.5l4.5 4.5L19 7'),
  arrowRight: stroke('M5 12h14', 'M13 6l6 6-6 6'),
  external: stroke('M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'),
  link: stroke(
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ),
  reset: stroke('M4 12a8 8 0 1 0 2.4-5.7', 'M4 4.5V9h4.5'),
  shuffle: stroke('M16 4h4v4', 'M4 20 20 4', 'M20 16v4h-4', 'M14.5 14.5 20 20', 'M4 4l5 5'),
  today: stroke('M12 3v18', 'M8 3h8', 'M5 8h4v4H5z', 'M15 12h4v4h-4z'),
  search: stroke('M5 11a6 6 0 1 0 12 0a6 6 0 1 0-12 0', 'M19.5 19.5 15.5 15.5'),
  github: {
    viewBox: '0 0 16 16',
    fill: true,
    paths: [
      'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z',
    ],
  },
} satisfies Record<string, SiteIcon>;

export type IconName = keyof typeof ICONS;
