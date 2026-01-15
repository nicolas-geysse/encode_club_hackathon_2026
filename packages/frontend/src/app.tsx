import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
          <header class="bg-white shadow-sm border-b border-slate-200">
            <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <span class="text-2xl">🚀</span>
                  <h1 class="text-xl font-bold text-slate-900">
                    Stride
                  </h1>
                  <span class="text-xs text-slate-500 hidden sm:inline">Navigate student life</span>
                </div>
                <nav class="flex space-x-4">
                  <a
                    href="/"
                    class="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium"
                  >
                    Accueil
                  </a>
                  <a
                    href="/dashboard"
                    class="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium"
                  >
                    Dashboard
                  </a>
                  <a
                    href="/goal-mode/setup"
                    class="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium"
                  >
                    Objectif
                  </a>
                  <a
                    href="/chat"
                    class="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium"
                  >
                    Chat
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main class="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <Suspense fallback={<div class="text-center">Chargement...</div>}>
              {props.children}
            </Suspense>
          </main>
          <footer class="bg-white border-t border-slate-200 mt-auto">
            <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
              <p class="text-center text-slate-500 text-sm">
                Stride - Encode Club Hackathon 2026 - Powered by Opik
              </p>
            </div>
          </footer>
        </div>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
