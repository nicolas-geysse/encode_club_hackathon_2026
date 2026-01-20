import { ScrollArea as ArkScrollArea } from '@ark-ui/solid';
import { type Component, splitProps, createSignal, onMount, Show } from 'solid-js';
import { cn } from '~/lib/cn';

export interface ScrollAreaProps extends ArkScrollArea.RootProps {
  class?: string;
  viewportClass?: string;
  viewportRef?: (el: HTMLDivElement) => void;
}

export const ScrollArea: Component<ScrollAreaProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children', 'viewportClass', 'viewportRef']);
  const [mounted, setMounted] = createSignal(false);

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
      <ArkScrollArea.Root class={cn('relative overflow-hidden group', local.class)} {...rest}>
        <ArkScrollArea.Viewport
          ref={local.viewportRef}
          class={cn('h-full w-full rounded-[inherit] scroll-smooth', local.viewportClass)}
        >
          {local.children}
        </ArkScrollArea.Viewport>
        <ArkScrollArea.Scrollbar
          class="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-150 ease-out hover:bg-black/5 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5 sm:data-[orientation=vertical]:w-3"
          orientation="vertical"
        >
          <ArkScrollArea.Thumb class="flex-1 bg-muted-foreground/30 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
        </ArkScrollArea.Scrollbar>
        <ArkScrollArea.Corner />
      </ArkScrollArea.Root>
    </Show>
  );
};
