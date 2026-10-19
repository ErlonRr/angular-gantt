// ─────────────────────────────────────────────────────────────
//  gantry · export/raster.ts
//  The PNG plan (Phase 12, D10): the largest scale at most the asked
//  one at which the image fits the canvas limits browsers keep (a side
//  of `maxSide`, `maxPixels` in all). The bindings render the SVG at
//  that size and draw it on a canvas; below actual size (or below the
//  asked scale, when that is under 1) the export fails.
// ─────────────────────────────────────────────────────────────

/** Pixels per CSS px of a PNG by default (`png.scale`). */
export const PNG_DEFAULT_SCALE = 2;

/** Largest side of a PNG in pixels by default (`png.maxSide`). */
export const PNG_MAX_SIDE = 16_384;

/** Largest pixel count of a PNG by default (`png.maxPixels`): 4096², safe on iOS. */
export const PNG_MAX_PIXELS = 16_777_216;

/** The size a PNG is rendered at. */
export interface RasterPlan {
  /** The scale used: at most the asked one, rounded down to 0.01 */
  scale: number;
  /** Size of the image in pixels (the drawing's size times `scale`, rounded) */
  width: number;
  height: number;
}

/** The scale steps (0.01) of a plan. */
const STEPS = 100;

/** `n` when a positive finite number, else `fallback`. */
const positive = (n: number, fallback: number): number => (Number.isFinite(n) && n > 0 ? n : fallback);

/** A side in whole pixels (at least 1). */
const side = (px: number, scale: number): number => Math.max(1, Math.round(px * scale));

/**
 * The PNG size for a drawing of `width` × `height` CSS px: the largest scale ≤ `limits.scale`
 * (rounded down to 0.01, at least 0.01) whose image, each side rounded to whole pixels, fits
 * `maxSide` on both sides and `maxPixels` in all. Limits that are not positive numbers fall back to
 * `PNG_DEFAULT_SCALE`, `PNG_MAX_SIDE` and `PNG_MAX_PIXELS`.
 *
 * Throws a `RangeError` when the drawing has no size, or when the image only fits below actual
 * size (scale 1) — below the asked scale when that is under 1 — so the export would lose detail:
 * use `exportSvg()`, `print()` or a `range` instead. Pure.
 */
export function planRaster(
  width: number,
  height: number,
  limits: { scale: number; maxSide: number; maxPixels: number },
): RasterPlan {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new RangeError(`Gantry: a ${width} × ${height} px drawing can't become a PNG`);
  }
  const maxSide = positive(limits.maxSide, PNG_MAX_SIDE);
  const maxPixels = positive(limits.maxPixels, PNG_MAX_PIXELS);
  // The asked scale in whole steps (never 0)
  const asked = Math.max(1, Math.floor(positive(limits.scale, PNG_DEFAULT_SCALE) * STEPS + 1e-9));
  const fits = (steps: number): boolean => {
    const w = side(width, steps / STEPS);
    const h = side(height, steps / STEPS);
    return w <= maxSide && h <= maxSide && w * h <= maxPixels;
  };
  // Start from the bound the limits give, then step down past rounding up
  const bound = Math.min(maxSide / width, maxSide / height, Math.sqrt(maxPixels / (width * height)));
  let steps = Math.min(asked, Math.floor(bound * STEPS + 1e-9));
  while (steps > 0 && !fits(steps)) steps--;
  const floor = Math.min(STEPS, asked);
  if (steps < floor) {
    throw new RangeError(
      `Gantry: a ${width} × ${height} px drawing is too large for a PNG at scale ${floor / STEPS} ` +
        `(at most ${maxSide} px a side and ${maxPixels} px in all): use exportSvg(), print() or a range`,
    );
  }
  const scale = steps / STEPS;
  return { scale, width: side(width, scale), height: side(height, scale) };
}
