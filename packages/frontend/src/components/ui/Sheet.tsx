import { Dialog as SheetPrimitive } from '@kobalte/core/dialog';
import { type ParentComponent, splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';
import { X } from 'lucide-solid';

export const Sheet = SheetPrimitive;
export const SheetTrigger = SheetPrimitive.Trigger;

export const SheetOverlay: ParentComponent<
  ComponentProps<typeof SheetPrimitive.Overlay> & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <SheetPrimitive.Overlay
      class={cn(
        'fixed inset-0 z-50 bg-black/80 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0',
        local.class
      )}
      {...rest}
    />
  );
};

export const SheetContent: ParentComponent<
  ComponentProps<typeof SheetPrimitive.Content> & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <SheetPrimitive.Portal>
      <SheetOverlay />
      <SheetPrimitive.Content
        class={cn(
          'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:duration-300 data-[expanded]:duration-500 inset-y-0 left-0 h-full w-3/4 border-r data-[closed]:slide-out-to-left data-[expanded]:slide-in-from-left sm:max-w-sm',
          local.class
        )}
        {...rest}
      >
        {local.children}
        <SheetPrimitive.CloseButton class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </SheetPrimitive.CloseButton>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
};

export const SheetHeader: ParentComponent<ComponentProps<'div'> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div class={cn('flex flex-col space-y-2 text-center sm:text-left', local.class)} {...rest}>
      {local.children}
    </div>
  );
};

export const SheetTitle: ParentComponent<
  ComponentProps<typeof SheetPrimitive.Title> & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <SheetPrimitive.Title
      class={cn('text-lg font-semibold text-foreground', local.class)}
      {...rest}
    >
      {local.children}
    </SheetPrimitive.Title>
  );
};

export const SheetDescription: ParentComponent<
  ComponentProps<typeof SheetPrimitive.Description> & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <SheetPrimitive.Description class={cn('text-sm text-muted-foreground', local.class)} {...rest}>
      {local.children}
    </SheetPrimitive.Description>
  );
};
