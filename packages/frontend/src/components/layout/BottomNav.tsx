import { type Component, For, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { cn } from '~/lib/cn';
import { LayoutDashboard, Map, GraduationCap } from 'lucide-solid';
import { onboardingIsComplete } from '~/lib/onboardingStateStore';

interface NavItem {
  href?: string;
  action?: string;
  label: string;
  icon: Component<{ class?: string }>;
}

export const BottomNav: Component = () => {
  const location = useLocation();

  const navItems: NavItem[] = [
    { href: '/', label: 'Onboarding', icon: GraduationCap },
    { href: '/plan', label: 'My Plan', icon: LayoutDashboard },
    { href: '/suivi', label: 'Tracking', icon: Map },
  ];

  // Conditionally show nav items based on onboarding state
  const visibleNavItems = () => {
    if (!onboardingIsComplete()) {
      // During onboarding: only show Onboarding link
      return navItems.filter((item) => item.href === '/');
    }
    // After onboarding: show all items
    return navItems;
  };

  return (
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/80 backdrop-blur-xl pb-safe">
      <div class="flex items-center justify-around h-16">
        <For each={visibleNavItems()}>
          {(item, i) => {
            const isActive = () => item.href && location.pathname === item.href;
            // Only apply animation delay after onboarding completes (for newly revealed items)
            const animStyle = () =>
              onboardingIsComplete()
                ? {
                    'animation-delay': `${i() * 50}ms`,
                    'animation-fill-mode': 'both',
                  }
                : {};
            return (
              <Show
                when={item.href}
                fallback={
                  <button
                    class={cn(
                      'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors',
                      'text-muted-foreground hover:text-foreground',
                      onboardingIsComplete() && 'animate-fade-in'
                    )}
                    style={animStyle()}
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
                    isActive() ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                    onboardingIsComplete() && 'animate-fade-in'
                  )}
                  style={animStyle()}
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
