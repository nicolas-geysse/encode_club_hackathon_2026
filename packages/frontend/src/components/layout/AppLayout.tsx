import { type ParentComponent, type JSX } from 'solid-js';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { RouteProgress } from '~/components/RouteProgress';

interface AppLayoutProps {
  headerContent?: JSX.Element;
  /** Callback when Debug button is clicked in navigation */
  onDebugOpen?: () => void;
}

export const AppLayout: ParentComponent<AppLayoutProps> = (props) => {
  return (
    <div class="min-h-screen bg-background text-foreground transition-colors font-sans">
      <RouteProgress />
      <Sidebar class="hidden md:block" onDebugOpen={props.onDebugOpen} />

      <div class="pl-0 md:pl-64 flex flex-col min-h-screen">
        <header class="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div class="flex h-16 items-center justify-between w-full max-w-7xl px-4 md:px-6">
            <div class="flex items-center gap-4">
              {/* Breadcrumbs or Page Title could go here */}
            </div>
            <div class="flex items-center gap-4">{props.headerContent}</div>
          </div>
        </header>

        <main class="w-full max-w-7xl p-4 md:p-6 pb-24 md:pb-6 flex-1">
          <div class="animate-fade-in h-full">{props.children}</div>
        </main>
      </div>

      <BottomNav onDebugOpen={props.onDebugOpen} />
    </div>
  );
};
