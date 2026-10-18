// Performance page (e2e/perf.spec.ts): 10 000 tasks over three years with about 5 000
// dependencies, Day view. The data comes from a seeded PRNG, so every run measures the same chart.
// `__GANTRY_PERF__` turns on the `gantry:flush` performance measure; it is set before the
// element's module loads.
import './perf.css';

(globalThis as { __GANTRY_PERF__?: boolean }).__GANTRY_PERF__ = true;

const TASKS = 10_000;
const YEARS = 3;

/** mulberry32: a small seeded PRNG (deterministic data). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function perfTasks() {
  const rand = prng(20_261_014);
  const first = new Date(2025, 0, 1);
  const span = YEARS * 365;
  return Array.from({ length: TASKS }, (_, i) => {
    // Sorted-ish starts (a plan flows left to right), with jitter
    const offset = Math.min(span - 31, Math.max(0, Math.floor((i / TASKS) * span + (rand() - 0.5) * 40)));
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1 + Math.floor(rand() * 30));
    // About half the tasks depend on one of the 20 tasks before them
    const dep = i > 0 && rand() < 0.5 ? `p${Math.max(0, i - 1 - Math.floor(rand() * 20))}` : undefined;
    return {
      id: `p${i}`,
      name: `Task ${i + 1}`,
      start,
      end,
      progress: Math.floor(rand() * 100),
      ...(dep ? { dependency: dep } : {}),
    };
  });
}

const tasks = perfTasks();
await import('@gantryjs/vanilla');
const gantt = document.querySelector('gantry-element')!;
gantt.options = { viewMode: 'Day', initialScroll: false };
gantt.tasks = tasks;
