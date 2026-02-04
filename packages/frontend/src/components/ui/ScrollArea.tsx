import { type Component, splitProps, JSX } from 'solid-js';
import { cn } from '~/lib/cn';

export interface ScrollAreaProps extends JSX.HTMLAttributes<HTMLDivElement> {
  class?: string;
  viewportClass?: string;
  viewportRef?: (el: HTMLDivElement) => void;
  /** Show horizontal scrollbar */
  horizontal?: boolean;
  /** Show vertical scrollbar (default: true) */
  vertical?: boolean;
  children?: JSX.Element;
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

  return (
    <div class={cn('relative overflow-hidden', local.class)} {...rest}>
      <div
        ref={local.viewportRef}
        class={cn(
          'h-full w-full',
          // Overflow handling
          local.horizontal
            ? 'overflow-x-auto overflow-y-hidden'
            : 'overflow-y-auto overflow-x-hidden',
          // Custom Scrollbar - Webkit
          '[&::-webkit-scrollbar]:w-2',
          '[&::-webkit-scrollbar]:h-2',
          '[&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:bg-border/40',
          '[&::-webkit-scrollbar-thumb]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:hover:bg-border/60',
          '[&::-webkit-scrollbar-corner]:bg-transparent',
          // Custom Scrollbar - Firefox
          '[scrollbar-width:thin]',
          // Ensure smooth scrolling
          'scroll-smooth',
          local.viewportClass
        )}
      >
        {local.children}
      </div>
    </div>
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
