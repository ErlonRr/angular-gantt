// ─────────────────────────────────────────────────────────────
//  Tests — Phase 12 step 2.5: the PNG plan (D10). The largest scale
//  up to the asked one (in 0.01 steps) whose rounded image fits the
//  side and pixel limits, and a RangeError below actual size.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { PNG_DEFAULT_SCALE, PNG_MAX_PIXELS, PNG_MAX_SIDE, planRaster } from '../index';

const LIMITS = { scale: PNG_DEFAULT_SCALE, maxSide: PNG_MAX_SIDE, maxPixels: PNG_MAX_PIXELS };

describe('planRaster', () => {
  it('keeps the asked scale when the image fits', () => {
    expect(planRaster(800, 600, LIMITS)).toEqual({ scale: 2, width: 1600, height: 1200 });
    expect(planRaster(800, 600, { ...LIMITS, scale: 1 })).toEqual({ scale: 1, width: 800, height: 600 });
  });

  it('rounds the image size to whole pixels', () => {
    expect(planRaster(100.4, 50.6, { ...LIMITS, scale: 1.5 })).toEqual({ scale: 1.5, width: 151, height: 76 });
    expect(planRaster(0.2, 0.2, { ...LIMITS, scale: 1 })).toEqual({ scale: 1, width: 1, height: 1 });
  });

  it('rounds the asked scale down to 0.01', () => {
    expect(planRaster(100, 100, { ...LIMITS, scale: 1.239 }).scale).toBe(1.23);
    expect(planRaster(100, 100, { ...LIMITS, scale: 2.999 }).scale).toBe(2.99);
    expect(planRaster(1000, 100, { ...LIMITS, scale: 0.001 })).toEqual({ scale: 0.01, width: 10, height: 1 });
  });

  it('lowers the scale to the largest side', () => {
    // 16 384 / 10 000 = 1.6384
    expect(planRaster(10_000, 100, LIMITS)).toEqual({ scale: 1.63, width: 16_300, height: 163 });
    expect(planRaster(100, 10_000, LIMITS)).toEqual({ scale: 1.63, width: 163, height: 16_300 });
  });

  it('lowers the scale to the pixel count', () => {
    // √(16 777 216 / 9 000 000) = 1.365…; 1.37 gives 4110² > the limit
    expect(planRaster(3000, 3000, LIMITS)).toEqual({ scale: 1.36, width: 4080, height: 4080 });
    // Exactly at both limits
    expect(planRaster(8192, 2048, LIMITS)).toEqual({ scale: 1, width: 8192, height: 2048 });
    expect(planRaster(16_384, 1024, LIMITS)).toEqual({ scale: 1, width: 16_384, height: 1024 });
  });

  it('steps down past sizes that round up over a limit', () => {
    // The bound gives 1.99 (199.9 px a side), which rounds to 200² = 40 000 > 39 999
    expect(planRaster(100.45, 100.45, { scale: 2, maxSide: 1000, maxPixels: 39_999 })).toEqual({
      scale: 1.98,
      width: 199,
      height: 199,
    });
    // 50.25 at 2.00 is 100.5, which rounds to 101 > maxSide 100.5
    expect(planRaster(50.25, 10, { scale: 3, maxSide: 100.5, maxPixels: 1e9 })).toEqual({
      scale: 1.99,
      width: 100,
      height: 20,
    });
    // …and at actual size that is a RangeError, not a 101 px side
    expect(() => planRaster(100.5, 10, { scale: 1.5, maxSide: 100.5, maxPixels: 1e9 })).toThrow(RangeError);
  });

  it('gives scales with at most 2 decimals', () => {
    for (const w of [333, 777.7, 1234.5, 9999]) {
      const { scale } = planRaster(w, 1000, LIMITS);
      expect(Math.round(scale * 100) / 100).toBe(scale);
    }
  });

  it('throws a RangeError when the image only fits below actual size', () => {
    expect(() => planRaster(20_000, 20_000, LIMITS)).toThrow(RangeError);
    expect(() => planRaster(5000, 5000, LIMITS)).toThrow(/exportSvg\(\), print\(\) or a range/);
    expect(() => planRaster(16_385, 10, LIMITS)).toThrow(RangeError);
    expect(() => planRaster(4097, 4096, LIMITS)).toThrow(RangeError);
  });

  it('takes an asked scale under 1 as the floor', () => {
    expect(planRaster(800, 600, { ...LIMITS, scale: 0.5 })).toEqual({ scale: 0.5, width: 400, height: 300 });
    expect(planRaster(30_000, 100, { ...LIMITS, scale: 0.5 })).toEqual({ scale: 0.5, width: 15_000, height: 50 });
    // 16 384 / 40 000 = 0.41 < 0.5
    expect(() => planRaster(40_000, 100, { ...LIMITS, scale: 0.5 })).toThrow(RangeError);
  });

  it.each([
    [0, 100],
    [100, 0],
    [-5, 100],
    [NaN, 100],
    [100, Infinity],
  ])('throws a RangeError for a %s × %s drawing', (w, h) => {
    expect(() => planRaster(w, h, LIMITS)).toThrow(RangeError);
  });

  it('falls back to the default limits for values that are not positive numbers', () => {
    expect(planRaster(100, 100, { scale: NaN, maxSide: 0, maxPixels: -1 })).toEqual({
      scale: 2,
      width: 200,
      height: 200,
    });
    expect(planRaster(10_000, 100, { scale: 2, maxSide: Infinity, maxPixels: PNG_MAX_PIXELS }).scale).toBe(1.63);
  });
});
