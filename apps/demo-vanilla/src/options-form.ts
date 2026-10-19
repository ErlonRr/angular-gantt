// The Options card: one group per playground section, one labelled control per option. Each
// control is described by a hint that names the option it sets (`nonWorkingTime.weekends`).
import {
  PLAYGROUND_SECTIONS,
  valueText,
  type PlaygroundControl,
  type PlaygroundKey,
  type PlaygroundState,
} from 'demo-kit/playground';
import { h } from './dom';

export interface OptionsForm {
  /** Shows `state` in every control. */
  sync(state: PlaygroundState): void;
}

interface BuiltControl {
  node: HTMLElement;
  sync(state: PlaygroundState): void;
}

type OnChange = (key: PlaygroundKey, value: unknown) => void;

/** Builds the controls of `PLAYGROUND_SECTIONS` into `root`; `onChange` receives every edit. */
export function buildOptionsForm(root: HTMLElement, onChange: OnChange): OptionsForm {
  const controls: BuiltControl[] = [];
  PLAYGROUND_SECTIONS.forEach((section, i) => {
    const titleId = `pg-section-${i}`;
    const group = h(
      'div',
      { class: 'gs-form-section', role: 'group', 'aria-labelledby': titleId },
      h('h3', { class: 'gs-form-title', id: titleId }, section.title),
    );
    for (const c of section.controls) {
      const built = buildControl(c, onChange);
      group.append(built.node);
      controls.push(built);
    }
    root.append(group);
  });
  return { sync: state => controls.forEach(c => c.sync(state)) };
}

function buildControl(c: PlaygroundControl, onChange: OnChange): BuiltControl {
  const id = `pg-${c.key}`;
  const hintId = `${id}-hint`;
  const hint = h(
    'p',
    { class: 'gs-hint', id: hintId },
    h('code', { class: 'gs-code-inline' }, c.option),
    ...(c.hint ? [` ${c.hint}`] : []),
  );

  switch (c.kind) {
    case 'select': {
      const select = h('select', { class: 'gs-select', id, 'aria-describedby': hintId });
      for (const [value, text] of c.choices) select.add(new Option(text, String(value)));
      select.addEventListener('change', () => {
        // Choices may be numbers (`weekStart`): hand back the typed value, not the option text
        const choice = c.choices.find(([value]) => String(value) === select.value);
        if (choice) onChange(c.key, choice[0]);
      });
      return {
        node: h('div', { class: 'gs-field' }, h('label', { class: 'gs-label', for: id }, c.label), select, hint),
        sync: state => {
          select.value = String(state[c.key]);
        },
      };
    }
    case 'range': {
      const input = h('input', {
        type: 'range',
        class: 'gs-range',
        id,
        min: c.min,
        max: c.max,
        step: c.step ?? 1,
        'aria-describedby': hintId,
      });
      // The input carries the value with its unit (aria-valuetext): the visible output is not read twice
      const output = h('output', { class: 'gs-value', for: id, 'aria-hidden': 'true' });
      const show = (value: number) => {
        // `36 px`, `60%`: the same text as the site's playground
        const text = valueText(value, c.unit);
        output.textContent = text;
        input.setAttribute('aria-valuetext', text);
      };
      input.addEventListener('input', () => {
        show(input.valueAsNumber);
        onChange(c.key, input.valueAsNumber);
      });
      return {
        node: h(
          'div',
          { class: 'gs-field' },
          h('div', { class: 'gs-field-row' }, h('label', { class: 'gs-label', for: id }, c.label), output),
          input,
          hint,
        ),
        sync: state => {
          const value = Number(state[c.key]);
          input.value = String(value);
          show(value);
        },
      };
    }
    case 'check': {
      const input = h('input', { type: 'checkbox', role: 'switch', id, 'aria-describedby': hintId });
      input.addEventListener('change', () => onChange(c.key, input.checked));
      return {
        node: h('div', { class: 'gs-field' }, h('label', { class: 'gs-switch' }, h('span', {}, c.label), input), hint),
        sync: state => {
          input.checked = state[c.key] === true;
        },
      };
    }
  }
}
