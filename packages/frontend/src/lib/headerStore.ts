import { createSignal, type JSX } from 'solid-js';

const [headerLeftExtra, setHeaderLeftExtra] = createSignal<JSX.Element | null>(null);

export { headerLeftExtra, setHeaderLeftExtra };
