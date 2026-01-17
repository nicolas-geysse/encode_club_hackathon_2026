/**
 * Tab Navigation Component
 *
 * Horizontal tab navigation for My Plan page.
 * 6 tabs: Setup, Skills, Inventory, Lifestyle, Trade, Swipe
 */

import { For } from 'solid-js';

export type TabId = 'setup' | 'skills' | 'inventory' | 'lifestyle' | 'trade' | 'swipe';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'setup', label: 'Setup', icon: '🎯' },
  { id: 'skills', label: 'Skills', icon: '💼' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'lifestyle', label: 'Lifestyle', icon: '🏠' },
  { id: 'trade', label: 'Trade', icon: '🤝' },
  { id: 'swipe', label: 'Swipe', icon: '🎲' },
];

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  completedTabs?: TabId[];
}

export function TabNavigation(props: TabNavigationProps) {
  return (
    <div class="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky top-0 z-10">
      <div class="flex overflow-x-auto scrollbar-hide">
        <For each={TABS}>
          {(tab) => {
            const isActive = () => props.activeTab === tab.id;
            const isCompleted = () => props.completedTabs?.includes(tab.id);

            return (
              <button
                class={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive()
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
                onClick={() => props.onTabChange(tab.id)}
              >
                <span class="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
                {isCompleted() && !isActive() && (
                  <span class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex items-center justify-center text-xs">
                    ✓
                  </span>
                )}
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}
