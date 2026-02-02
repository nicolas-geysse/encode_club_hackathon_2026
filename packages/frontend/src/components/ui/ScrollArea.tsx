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

// Hide native scrollbar styles (required by Ark UI)
const viewportStyles = `
  scrollbar-width: none;
  -ms-overflow-style: none;
`;

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
          class={cn(
            'h-full w-full rounded-[inherit]',
            // Hide native scrollbar with Tailwind utilities
            '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
            local.viewportClass
          )}
          style={viewportStyles}
        >
          {local.children}
        </ArkScrollArea.Viewport>

        {/* Vertical Scrollbar */}
        <Show when={showVertical()}>
          <ArkScrollArea.Scrollbar
            orientation="vertical"
            class={cn(
              'absolute right-0 top-0 bottom-0',
              'flex select-none touch-none',
              'w-2 p-0.5',
              'transition-opacity duration-150',
              'data-[state=hidden]:opacity-0',
              'bg-transparent'
            )}
          >
            <ArkScrollArea.Thumb
              class={cn(
                'relative flex-1 rounded-full',
                'bg-border/60 hover:bg-border',
                'transition-colors duration-150'
              )}
            />
          </ArkScrollArea.Scrollbar>
        </Show>

        {/* Horizontal Scrollbar */}
        <Show when={showHorizontal()}>
          <ArkScrollArea.Scrollbar
            orientation="horizontal"
            class={cn(
              'absolute left-0 right-0 bottom-0',
              'flex select-none touch-none flex-col',
              'h-2 p-0.5',
              'transition-opacity duration-150',
              'data-[state=hidden]:opacity-0',
              'bg-transparent'
            )}
          >
            <ArkScrollArea.Thumb
              class={cn(
                'relative flex-1 rounded-full',
                'bg-border/60 hover:bg-border',
                'transition-colors duration-150'
              )}
            />
          </ArkScrollArea.Scrollbar>
        </Show>

        <ArkScrollArea.Corner class="bg-transparent" />
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
