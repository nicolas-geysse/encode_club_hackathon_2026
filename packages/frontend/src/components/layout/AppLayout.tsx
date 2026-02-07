import { type ParentComponent, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { RouteProgress } from '~/components/RouteProgress';
import { ProactiveAlerts } from '~/components/ProactiveAlerts';
import { headerLeftExtra } from '~/lib/headerStore';

interface AppLayoutProps {
  headerContent?: JSX.Element;
}

export const AppLayout: ParentComponent<AppLayoutProps> = (props) => {
  return (
    <div class="min-h-screen bg-background text-foreground transition-colors font-sans">
      <RouteProgress />
      <Sidebar class="hidden md:block" />

      <div class="pl-0 md:pl-64 flex flex-col min-h-screen">
        <header class="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div class="flex h-16 items-center justify-between w-full max-w-7xl px-4 md:px-6">
            <div class="flex items-center gap-2 md:hidden">
              <A
                href="/"
                class="text-xl font-extrabold tracking-tight select-none hover:opacity-80 transition-opacity"
              >
                Stri<span class="text-primary">d</span>e
              </A>
              {headerLeftExtra()}
            </div>
            <div class="flex items-center gap-4 md:ml-auto">{props.headerContent}</div>
          </div>
        </header>

        <main class="w-full max-w-7xl p-4 md:p-6 pb-24 md:pb-6 flex-1">
          <div class="animate-fade-in h-full">{props.children}</div>
        </main>
      </div>

      <BottomNav />

      {/* v4.2: Global proactive alerts from Bruno */}
      <ProactiveAlerts />
    </div>
  );
};
