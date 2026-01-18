import { type Component, For } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { cn } from '~/lib/cn';
import { LayoutDashboard, Map, GraduationCap } from 'lucide-solid';

export const BottomNav: Component = () => {
  const location = useLocation();

  const navItems = [
    { href: '/', label: 'Onboarding', icon: GraduationCap },
    { href: '/plan', label: 'My Plan', icon: LayoutDashboard },
    { href: '/suivi', label: 'Tracking', icon: Map },
  ];

  return (
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/80 backdrop-blur-xl pb-safe">
      <div class="flex items-center justify-around h-16">
        <For each={navItems}>
          {(item) => {
            const isActive = () => location.pathname === item.href;
            return (
              <A
                href={item.href}
                class={cn(
                  'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors',
                  isActive() ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon class="h-5 w-5" />
                <span class="text-[10px] font-medium">{item.label}</span>
              </A>
            );
          }}
        </For>
      </div>
    </nav>
  );
};
