// Strict CSP page (e2e/csp.spec.ts serves it with this header):
//
//   default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
//   connect-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'
//
// Nothing inline: csp.html has no inline script or style and this module imports no CSS (Vite
// would inject it as a style element during development). The chart is created with
// `document.createElement`; the page sizes it through the CSSOM (`style.height`), which a strict
// `style-src` allows — only style *text* (attributes, style elements) is refused.
import '@gantry/vanilla';
import { createDemoData } from '@gantry/core/demo';
import type { GanttTask } from '@gantry/vanilla';

/** Extra rows below the demo plan, so the chart scrolls vertically. */
function fillerTasks(count: number): GanttTask[] {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => ({
    id: `csp-${i}`,
    name: `Filler task ${i + 1}`,
    progress: (i * 13) % 100,
    start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20 + (i % 30)),
    end: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 12 + (i % 30)),
  }));
}

const demo = createDemoData();
document.body.style.margin = '0';

const gantt = document.createElement('gantry-element');
gantt.id = 'gantt';
gantt.style.height = '100vh';
gantt.tasks = [...demo.tasks, ...fillerTasks(60)];
gantt.annotations = demo.annotations;
gantt.showLegend = true;
gantt.options = {
  criticalPath: true,
  nonWorkingTime: { weekends: true, style: 'hatch' },
};
document.body.append(gantt);
