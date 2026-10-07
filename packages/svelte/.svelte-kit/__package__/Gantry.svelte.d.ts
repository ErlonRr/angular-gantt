import '@gantry/vanilla';
import type { GantryElement, GantryProperties, GantryEventCallbacks } from '@gantry/vanilla';
import type { HTMLAttributes } from 'svelte/elements';
type Props = GantryProperties & GantryEventCallbacks & Omit<HTMLAttributes<HTMLElement>, keyof GantryProperties | keyof GantryEventCallbacks> & {
    element?: GantryElement;
};
declare const Gantry: import("svelte").Component<Props, {}, "element">;
type Gantry = ReturnType<typeof Gantry>;
export default Gantry;
