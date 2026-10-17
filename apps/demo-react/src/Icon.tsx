import { ICONS, type IconName, type SiteIcon } from 'demo-kit/icons';

/** A site icon (`demo-kit/icons`), decorative: label the control that holds it. */
export function Icon({ name }: { name: IconName }) {
  const icon: SiteIcon = ICONS[name];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={icon.viewBox}
      fill={icon.fill ? 'currentColor' : 'none'}
      stroke={icon.fill ? undefined : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon.paths.map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
