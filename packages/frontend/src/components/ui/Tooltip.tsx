import { Tooltip as TooltipPrimitive } from '@kobalte/core/tooltip';
import { type ParentComponent, type ComponentProps, splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

const Tooltip: ParentComponent<ComponentProps<typeof TooltipPrimitive>> = (props) => {
  return <TooltipPrimitive gutter={4} {...props} />;
};

const TooltipTrigger: ParentComponent<
  ComponentProps<typeof TooltipPrimitive.Trigger> & { class?: string }
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children']);
  return (
    <TooltipPrimitive.Trigger class={cn('cursor-help inline-flex', local.class)} {...others}>
      {local.children}
    </TooltipPrimitive.Trigger>
  );
};

const TooltipContent: ParentComponent<
  ComponentProps<typeof TooltipPrimitive.Content> & { class?: string }
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children']);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn(
          'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          local.class
        )}
        {...others}
      >
        <TooltipPrimitive.Arrow />
        {local.children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
};

export { Tooltip, TooltipTrigger, TooltipContent };
