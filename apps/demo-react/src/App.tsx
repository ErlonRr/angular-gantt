import { useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Gantry, ViewMode, type GantryElement, type GanttTask } from '@gantryjs/react';
import { createDemoData } from '@gantryjs/core/demo';
import { galleryHash } from 'demo-kit/gallery';
import { PACKAGES, SITE } from 'demo-kit/site';
import { getTheme, onThemeChange, toggleTheme } from 'demo-kit/theme';
import { Icon } from './Icon';
import './App.css';

const PKG = PACKAGES.react;
const VIEW_MODES = Object.values(ViewMode);

export default function App() {
  const gantt = useRef<GantryElement>(null);
  const main = useRef<HTMLElement>(null);
  // The demo plan is moved so today sits inside it (lazy initialiser: computed once)
  const [demo] = useState(() => createDemoData());
  const [tasks, setTasks] = useState<GanttTask[]>(demo.tasks);
  const [viewMode, setViewMode] = useState<string>(ViewMode.Month);
  const [baseline, setBaseline] = useState(false);
  const [criticalPath, setCriticalPath] = useState(false);
  const [status, setStatus] = useState('Drag or resize a bar, or select a row.');
  // The chart follows the site theme (initialised in main.tsx)
  const dark = useSyncExternalStore(onThemeChange, getTheme) === 'dark';

  const options = { viewMode, baseline, criticalPath };

  const applyDates = (taskId: string, start: Date, end: Date) =>
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, start, end } : t)));

  /** The skip link moves focus to the content without touching the URL. */
  const skip = (e: MouseEvent) => {
    e.preventDefault();
    main.current?.focus();
    main.current?.scrollIntoView();
  };

  return (
    <div className="gs-app">
      <a className="gs-skip" href="#main" onClick={skip}>
        Skip to content
      </a>
      <header className="gs-header">
        <div className="gs-container gs-header-inner">
          <div className="gs-brand">
            <span className="gs-logo" aria-hidden="true" />
            <span>{SITE.name}</span>
            <span className="gs-version">v{SITE.version}</span>
            <span className="gs-badge">React</span>
          </div>
          <nav className="gs-nav" aria-label="Primary">
            <ul className="gs-nav-list">
              <li>
                <a className="gs-nav-link" href="#/" aria-current="page">
                  <Icon name="home" />
                  <span>Home</span>
                </a>
              </li>
              <li>
                <a className="gs-nav-link" href={galleryHash()}>
                  <Icon name="examples" />
                  <span>Examples</span>
                </a>
              </li>
            </ul>
          </nav>
          <div className="gs-header-actions">
            <button
              type="button"
              className="gs-icon-btn"
              aria-label="Dark theme"
              aria-pressed={dark}
              onClick={() => toggleTheme()}
            >
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <a className="gs-icon-btn" href={SITE.repoUrl} aria-label="Source code on GitHub">
              <Icon name="github" />
            </a>
          </div>
        </div>
      </header>

      <main id="main" ref={main} className="gs-main fw-main" tabIndex={-1}>
        <div className="gs-container">
          <div className="gs-page-head fw-head">
            <div>
              <p className="gs-eyebrow">React · {PKG.name}</p>
              <h1 className="gs-title">Gantry in React</h1>
              <p className="gs-lead">Props are set before the first frame, and callbacks receive the event detail.</p>
            </div>
          </div>

          <div className="gs-card fw-controls">
            <div className="gs-card-body gs-toolbar">
              <div className="gs-seg" role="group" aria-label="Chart features">
                <button
                  type="button"
                  className="gs-seg-btn"
                  aria-pressed={baseline}
                  onClick={() => setBaseline(b => !b)}
                >
                  Baseline
                </button>
                <button
                  type="button"
                  className="gs-seg-btn"
                  aria-pressed={criticalPath}
                  onClick={() => setCriticalPath(c => !c)}
                >
                  Critical path
                </button>
              </div>
              <div className="fw-zoom">
                <label className="gs-label" htmlFor="zoom">
                  Zoom
                </label>
                <select id="zoom" className="gs-select" value={viewMode} onChange={e => setViewMode(e.target.value)}>
                  {VIEW_MODES.map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="gs-btn gs-btn--sm" onClick={() => gantt.current?.scrollToToday()}>
                <Icon name="today" />
                Today
              </button>
              <span className="gs-spacer" />
              <p className="gs-value fw-status" role="status" aria-live="polite">
                {status}
              </p>
            </div>
          </div>

          <div className="gs-card gs-app-chart">
            <Gantry
              ref={gantt}
              className="gs-chart"
              tasks={tasks}
              annotations={demo.annotations}
              options={options}
              darkMode={dark}
              showLegend
              onTaskDragged={e => {
                applyDates(e.taskId, e.newStart, e.newEnd);
                setStatus(`Moved ${e.taskId} by ${e.daysMoved} day(s)`);
              }}
              onTaskResized={e => {
                applyDates(e.taskId, e.newStart, e.newEnd);
                setStatus(`Resized ${e.taskId} (${e.handle}) by ${e.daysDelta} day(s)`);
              }}
              onSelectionChange={e => setStatus(`Selected: ${e.selectedIds.join(', ') || 'none'}`)}
              onViewModeChange={e => setViewMode(e.viewMode)}
            />
          </div>
        </div>
      </main>

      <footer className="gs-footer">
        <div className="gs-container">
          <p>
            <strong>{SITE.name}</strong> v{SITE.version} · {SITE.license} · <a href={SITE.repoUrl}>GitHub</a> ·{' '}
            <a href={PKG.npmUrl}>npm</a> · made by <a href={SITE.authorUrl}>{SITE.author}</a>
          </p>
          <p>{SITE.tagline}</p>
        </div>
      </footer>
    </div>
  );
}
