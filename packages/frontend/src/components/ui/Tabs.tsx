import { type ParentComponent, splitProps } from 'solid-js';
import { Tabs as KobalteTabs } from '@kobalte/core';
import { cn } from '~/lib/cn';

const Tabs = KobalteTabs.Root;

const TabsList: ParentComponent<KobalteTabs.TabsListProps & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteTabs.List
      class={cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
        local.class
      )}
      {...rest}
    >
      {local.children}
    </KobalteTabs.List>
  );
};

const TabsTrigger: ParentComponent<KobalteTabs.TabsTriggerProps & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteTabs.Trigger
      class={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm',
        local.class
      )}
      {...rest}
    >
      {local.children}
    </KobalteTabs.Trigger>
  );
};

const TabsContent: ParentComponent<KobalteTabs.TabsContentProps & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteTabs.Content
      class={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        local.class
      )}
      {...rest}
    >
      {local.children}
    </KobalteTabs.Content>
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent };
