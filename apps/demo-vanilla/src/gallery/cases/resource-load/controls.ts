import type { GalleryChoice } from 'demo-kit/gallery';

/**
 * A segmented control: a labelled group of buttons, one per choice, the picked one pressed
 * (`aria-pressed`). `onPick` gets each new value; `press` shows a value picked elsewhere (the
 * chart's own toolbar).
 */
export function segmented<T extends string>(
  id: string,
  label: string,
  choices: readonly GalleryChoice<T>[],
  initial: string,
  onPick: (value: T) => void,
): { control: HTMLElement; press: (value: string) => void } {
  const caption = document.createElement('span');
  caption.id = `${id}-label`;
  caption.textContent = label;
  const group = document.createElement('div');
  group.id = id;
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', caption.id);
  const buttons = choices.map(choice => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = choice.label;
    button.addEventListener('click', () => {
      press(choice.value);
      onPick(choice.value);
    });
    return button;
  });
  const press = (value: string) =>
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(choices[i].value === value)));
  group.append(...buttons);
  press(initial);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(caption, group);
  return { control, press };
}

/** A switch: a labelled checkbox with `role="switch"`. */
export function toggle(id: string, label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const input = document.createElement('input');
  input.id = id;
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const text = document.createElement('span');
  text.textContent = label;
  const control = document.createElement('label');
  control.className = 'gs-switch gs-case-control';
  control.append(text, input);
  return control;
}
