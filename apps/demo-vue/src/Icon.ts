import { h, type FunctionalComponent, type PropType } from 'vue';
import { ICONS, type IconName, type SiteIcon } from 'demo-kit/icons';

/** A site icon (`demo-kit/icons`), decorative: label the control that holds it. */
export const Icon: FunctionalComponent<{ name: IconName }> = props => {
  const icon: SiteIcon = ICONS[props.name];
  return h(
    'svg',
    {
      'aria-hidden': 'true',
      focusable: 'false',
      viewBox: icon.viewBox,
      fill: icon.fill ? 'currentColor' : 'none',
      stroke: icon.fill ? undefined : 'currentColor',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    icon.paths.map(d => h('path', { d })),
  );
};
Icon.props = { name: { type: String as PropType<IconName>, required: true } };
