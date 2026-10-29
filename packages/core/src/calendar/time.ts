// ─────────────────────────────────────────────────────────────
//  gantt-core · calendar/time.ts
//  Small time helpers shared by the calendar, the drags and the
//  cells. Internal: not exported from the package.
// ─────────────────────────────────────────────────────────────

export const HOUR_MS = 3_600_000;

/** `d` plus `hours` of elapsed time (not wall-clock hours: a DST change shifts the wall time). */
export const addHours = (d: Date, hours: number): Date => new Date(d.getTime() + hours * HOUR_MS);

/** Wall-clock milliseconds of `d` since its local midnight (09:30 → 34 200 000). */
export const msOfDay = (d: Date): number =>
  ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();

/** `n` rounded to 2 decimals, without `-0`. */
export const round2 = (n: number): number => Math.round(n * 100) / 100 || 0;

/** `n` rounded to 1 decimal, without `-0` (the tooltip's float). */
export const round1 = (n: number): number => Math.round(n * 10) / 10 || 0;
