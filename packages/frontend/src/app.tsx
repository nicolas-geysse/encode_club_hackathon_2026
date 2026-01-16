import { Router, useLocation } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense, createMemo, For } from 'solid-js';
import './app.css';

export default function App() {
  return (
    <Router
      root={(props) => {
        const location = useLocation();
        const currentPath = createMemo(() => location.pathname);

        const navItems = [
          { href: '/', label: 'Onboarding', icon: '👋' },
          { href: '/plan', label: 'Mon Plan', icon: '📋' },
          { href: '/suivi', label: 'Suivi', icon: '📊' },
        ];

        return (
          <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
            <header class="bg-white shadow-sm border-b border-slate-200">
              <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between">
                  <a href="/" class="flex items-center space-x-3">
                    <span class="text-2xl">🚀</span>
                    <h1 class="text-xl font-bold text-slate-900">Stride</h1>
                    <span class="text-xs text-slate-500 hidden sm:inline">
                      Navigate student life
                    </span>
                  </a>
                  <nav class="flex space-x-1">
                    <For each={navItems}>
                      {(item) => (
                        <a
                          href={item.href}
                          class={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            currentPath() === item.href
                              ? 'bg-primary-100 text-primary-700'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span>{item.icon}</span>
                          <span class="hidden sm:inline">{item.label}</span>
                        </a>
                      )}
                    </For>
                  </nav>
                </div>
              </div>
            </header>
            <main class="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
              <Suspense
                fallback={
                  <div class="flex items-center justify-center py-12">
                    <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                  </div>
                }
              >
                {props.children}
              </Suspense>
            </main>
            <footer class="bg-white border-t border-slate-200">
              <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                <p class="text-center text-slate-500 text-sm">
                  Stride - Encode Club Hackathon 2026 | Powered by Groq GPT-OSS 120B | Traced by
                  Opik
                </p>
              </div>
            </footer>
          </div>
        );
      }}
    >
      <FileRoutes />
    </Router>
  );
}
