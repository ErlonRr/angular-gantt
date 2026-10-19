import { h, type FunctionalComponent, type PropType } from 'vue';

/** Text with Markdown code spans: `like this` becomes a `<code>` (split on backticks, no HTML parsing). */
export const InlineCode: FunctionalComponent<{ text: string }> = props =>
  props.text
    .split('`')
    .flatMap((part, i) => (part === '' ? [] : [i % 2 ? h('code', { class: 'gs-code-inline' }, part) : part]));
InlineCode.props = { text: { type: String as PropType<string>, required: true } };
