import { type Component, For, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { cn } from '~/lib/cn';
import { LayoutDashboard, Map, GraduationCap, Wrench } from 'lucide-solid';
import { Logo } from '~/components/Logo';

interface NavItem {
  href?: string;
  action?: string;
  label: string;
  icon: Component<{ class?: string }>;
}

interface SidebarProps {
  class?: string;
  onDebugOpen?: () => void;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const location = useLocation();

  const navItems: NavItem[] = [
    { href: '/', label: 'Onboarding', icon: GraduationCap },
    { href: '/plan', label: 'My Plan', icon: LayoutDashboard },
    { href: '/suivi', label: 'Tracking', icon: Map },
    { action: 'debug', label: 'Debug', icon: Wrench },
  ];

  return (
    <aside
      class={cn(
        'fixed inset-y-0 left-0 z-50 w-64 border-r border-border/50 bg-background/80 backdrop-blur-xl transition-transform',
        props.class
      )}
    >
      <div class="flex h-16 items-center border-b border-border/50 px-6">
        <Logo height={42} />
      </div>
      <div class="px-3 py-4">
        <nav class="space-y-1">
          <For each={navItems}>
            {(item) => {
              const isActive = () => item.href && location.pathname === item.href;
              return (
                <Show
                  when={item.href}
                  fallback={
                    <button
                      onClick={() => item.action === 'debug' && props.onDebugOpen?.()}
                      class={cn(
                        'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50',
                        'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <item.icon class="h-4 w-4" />
                      {item.label}
                    </button>
                  }
                >
                  <A
                    href={item.href!}
                    class={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50',
                      isActive()
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <item.icon class="h-4 w-4" />
                    {item.label}
                  </A>
                </Show>
              );
            }}
          </For>
        </nav>
      </div>
      <div class="absolute bottom-4 left-0 right-0 px-3">{/* Footer area if needed */}</div>
    </aside>
  );
};
