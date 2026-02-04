import { type Component, For } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { cn } from '~/lib/cn';
import { MessageCircle, User, Dices, TrendingUp } from 'lucide-solid';
import { onboardingIsComplete } from '~/lib/onboardingStateStore';
import { Logo } from '~/components/Logo';

interface NavItem {
  href: string;
  label: string;
  icon: Component<{ class?: string }>;
}

interface SidebarProps {
  class?: string;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const location = useLocation();

  const navItems: NavItem[] = [
    { href: '/', label: 'Chat', icon: MessageCircle },
    { href: '/me', label: 'Me', icon: User },
    { href: '/swipe', label: 'Swipe', icon: Dices },
    { href: '/progress', label: 'Progress', icon: TrendingUp },
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
          <For each={visibleNavItems()}>
            {(item, i) => {
              const isActive = () => location.pathname === item.href;
              // Only apply animation delay after onboarding completes (for newly revealed items)
              const animStyle = () =>
                onboardingIsComplete()
                  ? {
                      'animation-delay': `${i() * 75}ms`,
                      'animation-fill-mode': 'both',
                    }
                  : {};
              return (
                <A
                  href={item.href}
                  class={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50',
                    isActive()
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                    onboardingIsComplete() && 'animate-fade-in'
                  )}
                  style={animStyle()}
                >
                  <item.icon class="h-4 w-4" />
                  {item.label}
                </A>
              );
            }}
          </For>
        </nav>
      </div>
      <div class="absolute bottom-4 left-0 right-0 px-3">{/* Footer area if needed */}</div>
    </aside>
  );
};
