import { defineConfig } from 'vitest/config';

// Unit tests for the framework-free core of the Gantry library
// (gantt-math / gantt-data / gantt-cpm + i18n formatters). These run in
// plain Node — no Angular TestBed, no browser — so they're fast and cheap.
export default defineConfig({
  test: {
    include: ['projects/gantry/src/**/*.test.ts'],
    environment: 'node',
  },
});
