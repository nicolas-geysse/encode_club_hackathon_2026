import { type Component, For, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { cn } from '~/lib/cn';
import { LayoutDashboard, Map, GraduationCap, Wrench } from 'lucide-solid';

interface NavItem {
  href?: string;
  action?: string;
  label: string;
  icon: Component<{ class?: string }>;
}

interface BottomNavProps {
  onDebugOpen?: () => void;
}

export const BottomNav: Component<BottomNavProps> = (props) => {
  const location = useLocation();

  const navItems: NavItem[] = [
    { href: '/', label: 'Onboarding', icon: GraduationCap },
    { href: '/plan', label: 'My Plan', icon: LayoutDashboard },
    { href: '/suivi', label: 'Tracking', icon: Map },
    { action: 'debug', label: 'Debug', icon: Wrench },
  ];

  return (
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/80 backdrop-blur-xl pb-safe">
      <div class="flex items-center justify-around h-16">
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
                      'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors',
                      'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <item.icon class="h-5 w-5" />
                    <span class="text-[10px] font-medium">{item.label}</span>
                  </button>
                }
              >
                <A
                  href={item.href!}
                  class={cn(
                    'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors',
                    isActive() ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <item.icon class="h-5 w-5" />
                  <span class="text-[10px] font-medium">{item.label}</span>
                </A>
              </Show>
            );
          }}
        </For>
      </div>
    </nav>
  );
};
