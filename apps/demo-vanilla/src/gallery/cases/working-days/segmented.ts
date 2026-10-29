import type { GalleryChoice } from 'demo-kit/gallery';

/**
 * A segmented control: a labelled group of buttons, one per choice, the picked one pressed
 * (`aria-pressed`). `onPick` gets each new value.
 */
export function segmented<T extends string>(
  id: string,
  label: string,
  choices: readonly GalleryChoice<T>[],
  initial: T,
  onPick: (value: T) => void,
): HTMLElement {
  const caption = document.createElement('span');
  caption.id = `${id}-label`;
  caption.textContent = label;
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', caption.id);
  const press = (value: T) =>
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(choices[i].value === value)));
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
  group.append(...buttons);
  press(initial);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(caption, group);
  return control;
}
