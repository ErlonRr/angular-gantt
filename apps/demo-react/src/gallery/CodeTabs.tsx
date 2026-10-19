import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CaseId } from 'demo-kit/gallery';
import { CASE_SOURCES, type SourceFile } from 'demo-kit/gallery/sources';
import { Icon } from '../Icon';
import { ownSources } from './cases';
import { FRAMEWORK, FRAMEWORK_LABEL } from './links';

type Tab = typeof FRAMEWORK | 'shared';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: FRAMEWORK, label: FRAMEWORK_LABEL },
  { id: 'shared', label: 'Shared data' },
];

type Loaded = { own: SourceFile[]; shared: SourceFile[] } | 'error' | null;

/** "Copy" on a code block: says "Copied" for a moment and announces it. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    const done = (ok: boolean) => {
      setCopied(ok);
      setStatus(ok ? 'Copied to the clipboard' : 'Copy failed: select the text and copy it');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        setStatus('');
      }, 1600);
    };
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(text).then(
      () => done(true),
      () => done(false),
    );
  };

  return (
    <>
      <button type="button" className="gs-copy" aria-label={label} onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} />
        <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <span className="gs-sr-only" role="status">
        {status}
      </span>
    </>
  );
}

function CodeBlock({ file }: { file: SourceFile }) {
  return (
    <div className="gs-code gs-code--scroll">
      <div className="gs-code-head">
        <span>{file.file}</span>
        <CopyButton text={file.code} label={`Copy ${file.file}`} />
      </div>
      <pre tabIndex={0} aria-label={`${file.file} code`}>
        <code>{file.code}</code>
      </pre>
    </div>
  );
}

/**
 * The code of a case: this app's own files of the case (read with `?raw`) and the shared data and
 * options (`demo-kit/gallery/cases/<id>.ts`, from the generated sources). A tab list with
 * automatic activation: one tab stop, ←/→ and Home/End move and select.
 */
export function CodeTabs({ id }: { id: CaseId }) {
  const [tab, setTab] = useState<Tab>(FRAMEWORK);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([ownSources(id), CASE_SOURCES[id]()]).then(
      ([own, sources]) => live && setLoaded({ own, shared: sources.shared }),
      () => live && setLoaded('error'),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const onKey = (e: KeyboardEvent) => {
    const from = TABS.findIndex(t => t.id === tab);
    const to = new Map([
      ['ArrowRight', from + 1],
      ['ArrowLeft', from - 1],
      ['Home', 0],
      ['End', TABS.length - 1],
    ]).get(e.key);
    if (to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const i = (to + TABS.length) % TABS.length;
    setTab(TABS[i].id);
    tabs.current[i]?.focus();
  };

  const files = loaded && loaded !== 'error' ? (tab === 'shared' ? loaded.shared : loaded.own) : [];
  const label = TABS.find(t => t.id === tab)!.label;

  return (
    <>
      <div className="gs-tabs" role="tablist" aria-label="Code" onKeyDown={onKey}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={el => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            className="gs-tab"
            id={`case-tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls={t.id === tab ? 'case-code-panel' : undefined}
            tabIndex={t.id === tab ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id="case-code-panel"
        className="gs-stack"
        role="tabpanel"
        aria-labelledby={`case-tab-${tab}`}
        // Without a code block (each one a tab stop) the panel itself is one
        tabIndex={files.length ? undefined : 0}
      >
        {loaded === 'error' ? (
          <p className="gs-case-hint">The code could not be loaded. Reload the page to try again.</p>
        ) : !loaded ? (
          <p className="gs-case-hint">Loading the code…</p>
        ) : files.length ? (
          files.map(f => <CodeBlock key={f.file} file={f} />)
        ) : (
          <p className="gs-case-hint">
            This example has no {label} file yet: this page draws the shared data and options of the Shared data tab.
          </p>
        )}
      </div>
    </>
  );
}
