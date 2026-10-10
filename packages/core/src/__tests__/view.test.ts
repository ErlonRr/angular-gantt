// ─────────────────────────────────────────────────────────────
//  Tests — initial view and panel width per view
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  availablePanelWidth,
  clampPanelWidth,
  resolveInitialView,
  resolvePanelWidth,
  viewFromOptions,
  viewFromState,
  type PanelWidthConfig,
  type PanelWidthInput,
} from '../state/view';
import { resolveConfig } from '../render/config';
import { LightTheme } from '../render/theme';

type SplitPatch = Partial<Omit<PanelWidthInput, 'panel'>> & { panel?: Partial<PanelWidthConfig> };

const split = ({ panel, ...patch }: SplitPatch = {}): number =>
  resolvePanelWidth({
    view: 'split',
    hostWidth: 1000,
    splitterWidth: 6,
    ...patch,
    panel: { width: '30%', minWidth: 120, ...panel },
  });

describe('clampPanelWidth', () => {
  it('keeps 40px of timeline and rounds', () => {
    expect(clampPanelWidth(2000, { minWidth: 120 }, 994)).toBe(954);
    expect(clampPanelWidth(300.4, { minWidth: 120 }, 994)).toBe(300);
  });

  it('honours minWidth, which wins over a crossing max', () => {
    expect(clampPanelWidth(50, { minWidth: 120 }, 994)).toBe(120);
    expect(clampPanelWidth(500, { minWidth: 120 }, 100)).toBe(120);
  });

  it('honours maxWidth in px or % of the available width', () => {
    expect(clampPanelWidth(800, { minWidth: 120, maxWidth: 400 }, 994)).toBe(400);
    expect(clampPanelWidth(800, { minWidth: 120, maxWidth: '50%' }, 1000)).toBe(500);
  });
});

describe('resolvePanelWidth', () => {
  it('table view fills the host; chart view hides the panel', () => {
    expect(split({ view: 'table' })).toBe(1000);
    expect(split({ view: 'chart' })).toBe(0);
    expect(split({ view: 'table', hostWidth: 0 })).toBe(1000);
  });

  it('split view resolves the configured width against the host', () => {
    expect(split()).toBe(300);
    expect(split({ panel: { width: 420 } })).toBe(420);
    expect(split({ panel: { width: 'abc%' as `${number}%` } })).toBe(320);
    expect(split({ panel: { width: 800, maxWidth: 400 } })).toBe(400);
    expect(split({ panel: { width: 50, minWidth: 200 } })).toBe(200);
  });

  it("split view prefers the user's width, clamped", () => {
    expect(split({ userWidth: 500 })).toBe(500);
    expect(split({ userWidth: 5000 })).toBe(954);
    expect(split({ userWidth: 10 })).toBe(120);
    expect(split({ userWidth: null })).toBe(300);
  });

  it('falls back to a 1000px host and a 6px splitter when unmeasured', () => {
    expect(split({ hostWidth: 0, splitterWidth: 0, userWidth: 5000 })).toBe(954);
    expect(split({ splitterWidth: undefined, userWidth: 5000 })).toBe(954);
    expect(split({ splitterWidth: 20, userWidth: 5000 })).toBe(940);
    expect(availablePanelWidth(0)).toBe(994);
    expect(availablePanelWidth(800, 10)).toBe(790);
  });

  it('reads its bounds and width from the resolved config', () => {
    const { panel } = resolveConfig({ panel: { width: 250, minWidth: 200, maxWidth: '25%' } }, LightTheme);
    expect(resolvePanelWidth({ view: 'split', panel, hostWidth: 1206 })).toBe(250);
    expect(resolvePanelWidth({ view: 'split', panel, hostWidth: 1206, userWidth: 900 })).toBe(300);
    expect(resolvePanelWidth({ view: 'table', panel, hostWidth: 1206 })).toBe(1206);
  });
});

describe('viewFromOptions / viewFromState', () => {
  it('reads view, else a hidden panel as chart', () => {
    expect(viewFromOptions({})).toBeUndefined();
    expect(viewFromOptions({ view: 'table' })).toBe('table');
    expect(viewFromOptions({ panel: { collapsed: true } })).toBe('chart');
    expect(viewFromOptions({ panelVisible: false })).toBe('chart');
    expect(viewFromOptions({ panelVisible: true, panel: { collapsed: false } })).toBeUndefined();
    expect(viewFromOptions({ view: 'split', panel: { collapsed: true } })).toBe('split');
  });

  it('lets an explicit panel.collapsed override the legacy panelVisible, as resolveConfig does', () => {
    const options = { panel: { collapsed: false }, panelVisible: false };
    expect(viewFromOptions(options)).toBeUndefined();
    expect(resolveConfig(options, LightTheme).panel.collapsed).toBe(false);
    expect(viewFromOptions({ panel: {}, panelVisible: false })).toBe('chart');
    expect(viewFromOptions({ panel: { collapsed: true }, panelVisible: true })).toBe('chart');
  });

  it('reads view, else panelCollapsed', () => {
    expect(viewFromState({})).toBeUndefined();
    expect(viewFromState({ view: 'table', panelCollapsed: true })).toBe('table');
    expect(viewFromState({ panelCollapsed: true })).toBe('chart');
    expect(viewFromState({ panelCollapsed: false })).toBe('split');
  });
});

describe('resolveInitialView', () => {
  it('defaults to split', () => {
    expect(resolveInitialView({})).toBe('split');
    expect(resolveInitialView({}, null)).toBe('split');
    expect(resolveInitialView({}, {})).toBe('split');
  });

  it('uses the options when nothing was saved', () => {
    expect(resolveInitialView({ view: 'table' })).toBe('table');
    expect(resolveInitialView({ panel: { collapsed: true } })).toBe('chart');
    expect(resolveInitialView({ panelVisible: false }, { panelWidth: 200 })).toBe('chart');
  });

  it('lets the saved state win over the options', () => {
    expect(resolveInitialView({ view: 'table' }, { view: 'chart' })).toBe('chart');
    expect(resolveInitialView({ panel: { collapsed: true } }, { panelCollapsed: false })).toBe('split');
    expect(resolveInitialView({ view: 'split' }, { panelCollapsed: true })).toBe('chart');
    expect(resolveInitialView({ view: 'chart' }, { view: 'table', panelCollapsed: true })).toBe('table');
  });
});
