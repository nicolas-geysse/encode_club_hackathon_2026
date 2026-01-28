import { ScrollArea as ArkScrollArea } from '@ark-ui/solid';
import { type Component, splitProps, createSignal, onMount, Show } from 'solid-js';
import { cn } from '~/lib/cn';

export interface ScrollAreaProps extends ArkScrollArea.RootProps {
  class?: string;
  viewportClass?: string;
  viewportRef?: (el: HTMLDivElement) => void;
  /** Show horizontal scrollbar */
  horizontal?: boolean;
  /** Show vertical scrollbar (default: true) */
  vertical?: boolean;
}

export const ScrollArea: Component<ScrollAreaProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'viewportClass',
    'viewportRef',
    'horizontal',
    'vertical',
  ]);
  const [mounted, setMounted] = createSignal(false);

  // Default to vertical only if not specified
  const showVertical = () => local.vertical !== false && !local.horizontal;
  const showHorizontal = () => local.horizontal === true;

  onMount(() => {
    setMounted(true);
  });

  return (
    <Show
      when={mounted()}
      fallback={
        <div
          ref={local.viewportRef}
          class={cn('h-full w-full overflow-auto', local.class, local.viewportClass)}
          {...rest}
        >
          {local.children}
        </div>
      }
    >
      <ArkScrollArea.Root class={cn('relative overflow-hidden', local.class)} {...rest}>
        <ArkScrollArea.Viewport
          ref={local.viewportRef}
          class={cn('h-full w-full rounded-[inherit]', local.viewportClass)}
        >
          {local.children}
        </ArkScrollArea.Viewport>

        {/* Vertical Scrollbar - minimal style */}
        <Show when={showVertical()}>
          <ArkScrollArea.Scrollbar
            orientation="vertical"
            class="flex select-none touch-none w-1.5 p-px transition-opacity data-[state=hidden]:opacity-0"
          >
            <ArkScrollArea.Thumb class="flex-1 rounded-full bg-[#27272A] dark:bg-[#52525B]" />
          </ArkScrollArea.Scrollbar>
        </Show>

        {/* Horizontal Scrollbar - minimal style */}
        <Show when={showHorizontal()}>
          <ArkScrollArea.Scrollbar
            orientation="horizontal"
            class="flex select-none touch-none flex-col h-1.5 p-px transition-opacity data-[state=hidden]:opacity-0"
          >
            <ArkScrollArea.Thumb class="flex-1 rounded-full bg-[#27272A] dark:bg-[#52525B]" />
          </ArkScrollArea.Scrollbar>
        </Show>

        <ArkScrollArea.Corner />
      </ArkScrollArea.Root>
    </Show>
  );
};

/**
 * Horizontal-only ScrollArea variant for convenience
 */
export const HorizontalScrollArea: Component<Omit<ScrollAreaProps, 'horizontal' | 'vertical'>> = (
  props
) => {
  return <ScrollArea {...props} horizontal vertical={false} />;
};
