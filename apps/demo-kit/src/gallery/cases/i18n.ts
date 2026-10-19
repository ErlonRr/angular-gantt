/**
 * Case `i18n`: one chart in four languages. `locale` gives the month and day names (through
 * `Intl`, nothing to import), `formats.dateFormat` the dates of the task list and the tooltip,
 * and `labels` every UI string (the toolbar, the columns, the tooltip, the durations and states).
 */

import type { GanttFormats, GanttLabels, GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData } from '../types';

export interface I18nLocale {
  value: string;
  label: string;
  labels: Partial<GanttLabels>;
  formats: Partial<GanttFormats>;
}

export const I18N_LOCALES: readonly I18nLocale[] = [
  { value: 'en-US', label: 'English', labels: {}, formats: { dateFormat: 'MMM D, YYYY' } },
  {
    value: 'it-IT',
    label: 'Italiano',
    labels: {
      loading: 'Caricamento…',
      retry: 'Riprova',
      emptyState: 'Nessuna attività da mostrare',
      errorTitle: 'Impossibile mostrare il grafico',
      zoomIn: 'Ingrandisci',
      zoomOut: 'Riduci',
      fitToScreen: 'Adatta allo schermo',
      todayButton: 'Oggi',
      more: 'Altro',
      viewModes: { Hour: 'Ora', Day: 'Giorno', Week: 'Settimana', Month: 'Mese', Quarter: 'Trimestre', Year: 'Anno' },
      today: 'Oggi',
      ttStart: 'Inizio',
      ttEnd: 'Fine',
      ttDuration: 'Durata',
      ttProgress: 'Avanzamento',
      ttMilestone: 'Traguardo',
      weekPrefix: 'S',
      quarterPrefix: 'T',
      durationLessThanDay: '< 1 giorno',
      durationDay: '1 giorno',
      durationDays: n => `${n} giorni`,
      durationWeeks: w => `${w} sett.`,
      durationWeeksDays: (w, d) => `${w} sett. ${d} g`,
      colName: 'Attività',
      colStart: 'Inizio',
      colEnd: 'Fine',
      colDuration: 'Durata',
      colProgress: '%',
      ariaChart: 'Piano di lancio',
    },
    formats: { dateFormat: 'D MMM YYYY' },
  },
  {
    value: 'de-DE',
    label: 'Deutsch',
    labels: {
      loading: 'Wird geladen…',
      retry: 'Erneut versuchen',
      emptyState: 'Keine Aufgaben vorhanden',
      errorTitle: 'Das Diagramm kann nicht angezeigt werden',
      zoomIn: 'Vergrößern',
      zoomOut: 'Verkleinern',
      fitToScreen: 'An Bildschirm anpassen',
      todayButton: 'Heute',
      more: 'Mehr',
      viewModes: { Hour: 'Stunde', Day: 'Tag', Week: 'Woche', Month: 'Monat', Quarter: 'Quartal', Year: 'Jahr' },
      today: 'Heute',
      ttStart: 'Beginn',
      ttEnd: 'Ende',
      ttDuration: 'Dauer',
      ttProgress: 'Fortschritt',
      ttMilestone: 'Meilenstein',
      weekPrefix: 'KW',
      quarterPrefix: 'Q',
      durationLessThanDay: '< 1 Tag',
      durationDay: '1 Tag',
      durationDays: n => `${n} Tage`,
      durationWeeks: w => `${w} Wo.`,
      durationWeeksDays: (w, d) => `${w} Wo. ${d} T.`,
      colName: 'Aufgabe',
      colStart: 'Beginn',
      colEnd: 'Ende',
      colDuration: 'Dauer',
      colProgress: '%',
      ariaChart: 'Einführungsplan',
    },
    formats: { dateFormat: 'DD.MM.YYYY' },
  },
  {
    value: 'ja-JP',
    label: '日本語',
    labels: {
      loading: '読み込み中…',
      retry: '再試行',
      emptyState: '表示するタスクはありません',
      errorTitle: 'チャートを表示できません',
      zoomIn: '拡大',
      zoomOut: '縮小',
      fitToScreen: '画面に合わせる',
      todayButton: '今日',
      more: 'その他',
      viewModes: { Hour: '時間', Day: '日', Week: '週', Month: '月', Quarter: '四半期', Year: '年' },
      today: '今日',
      ttStart: '開始',
      ttEnd: '終了',
      ttDuration: '期間',
      ttProgress: '進捗',
      ttMilestone: 'マイルストーン',
      durationLessThanDay: '1日未満',
      durationDay: '1日',
      durationDays: n => `${n}日`,
      durationWeeks: w => `${w}週間`,
      durationWeeksDays: (w, d) => `${w}週間${d}日`,
      colName: 'タスク',
      colStart: '開始',
      colEnd: '終了',
      colDuration: '期間',
      colProgress: '進捗',
      ariaChart: 'リリース計画',
    },
    formats: { dateFormat: 'YYYY/MM/DD' },
  },
];

/** The options of a locale (unknown values fall back to English). */
export function i18nOptions(locale: string): GanttOptions {
  const l = I18N_LOCALES.find(x => x.value === locale) ?? I18N_LOCALES[0];
  return {
    viewMode: 'Week',
    locale: l.value,
    labels: { ariaChart: 'Launch plan', ...l.labels },
    formats: l.formats,
    panel: { columns: ['name', 'start', 'end', 'duration'] },
  };
}

/** The control's first value: a language other than the page's, so the change shows at once */
export const I18N_INITIAL: string = 'it-IT';

export const I18N_OPTIONS = i18nOptions(I18N_INITIAL);

/** Task names stay as they are: only the chart's own strings change. */
export function i18nTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const i18nCase: GalleryCaseData = {
  charts: now => [{ tasks: i18nTasks(now), options: I18N_OPTIONS }],
};
