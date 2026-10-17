// ─────────────────────────────────────────────────────────────
//  gantry · render/contrast.ts
//  WCAG 2.x contrast helpers — readable labels on custom bar colours.
// ─────────────────────────────────────────────────────────────

/** WCAG AA minimum for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5;

/** Text colours tried, in order, when the preferred one is not readable. */
const FALLBACK_TEXT = ['#FFFFFF', '#0F172A'] as const;

/**
 * Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` (comma or space
 * separated) to 0–255 channels. Alpha is ignored. Returns null for anything else
 * (named colours, `var()`, `hsl()`…).
 */
export function parseColor(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(c)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      return [0, 1, 2].map(i => parseInt(hex.charAt(i).repeat(2), 16)) as [number, number, number];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    }
    return null;
  }
  const fn = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(c);
  if (!fn) return null;
  return [fn[1], fn[2], fn[3]].map((v = '0') =>
    Math.min(255, Math.max(0, v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v))),
  ) as [number, number, number];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

type Rgb = [number, number, number];

/** WCAG contrast ratio between two parsed colours (1–21). */
function ratioOf(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contrast ratio between two colours (1–21), or null when either cannot be parsed. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  return ratioOf(ca, cb);
}

/** A 0–255 integer channel as two hex digits. */
const hex2 = (v: number) => v.toString(16).padStart(2, '0');

/**
 * Text colour for a label in `fg` drawn on a tint of `fg` itself: `fg` at `alpha` (0–1) over
 * `bg`, as `color-mix(in srgb, fg <alpha·100>%, transparent)` paints it on `bg` (the
 * current-period header cell). Returns `fg` unchanged when it reaches `min` contrast on that tint
 * (or a colour can't be parsed); otherwise `fg` mixed towards `toward` in 10 % sRGB steps
 * (90/10, 80/20, …) until a step does, as `#RRGGBB`. The tint stays the one of `fg`: only the
 * label colour moves. When no step reaches `min`, the most readable step is returned.
 *
 * Light theme: `readableOnTint('#B45309', '#F8FAFC', 0.14, '#1E293B')` → `'#964B13'` (5.01:1,
 * the original is 3.97:1); dark theme: `'#FBBF24'` already reaches 6.47:1 and is kept.
 */
export function readableOnTint(fg: string, bg: string, alpha: number, toward: string, min = MIN_TEXT_CONTRAST): string {
  const f = parseColor(fg);
  const b = parseColor(bg);
  const t = parseColor(toward);
  if (!f || !b || !t) return fg;
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
  const tint: Rgb = [0, 1, 2].map(i => (f[i] ?? 0) * a + (b[i] ?? 0) * (1 - a)) as Rgb;
  let bestRatio = ratioOf(f, tint);
  if (bestRatio >= min) return fg;
  let best = fg;
  for (let step = 1; step <= 10; step++) {
    // Integer weights (out of 10): exact for integer channels; rounded, so each step is a hex colour
    const mixed = [0, 1, 2].map(i => Math.round(((f[i] ?? 0) * (10 - step) + (t[i] ?? 0) * step) / 10)) as Rgb;
    const r = ratioOf(mixed, tint);
    const css = `#${mixed.map(hex2).join('')}`.toUpperCase();
    if (r >= min) return css;
    if (r > bestRatio) {
      best = css;
      bestRatio = r;
    }
  }
  return best;
}

/**
 * Text colour for a label drawn on `background`: `preferred` when it reaches `min`
 * contrast (or the colours can't be parsed), otherwise white or near-black,
 * whichever contrasts more.
 */
export function readableOn(background: string, preferred: string, min = MIN_TEXT_CONTRAST): string {
  const ratio = contrastRatio(background, preferred);
  if (ratio === null || ratio >= min) return preferred;
  let best = preferred;
  let bestRatio = ratio;
  for (const candidate of FALLBACK_TEXT) {
    const r = contrastRatio(background, candidate) ?? 0;
    if (r > bestRatio) {
      best = candidate;
      bestRatio = r;
    }
  }
  return best;
}
