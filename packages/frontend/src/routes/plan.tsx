/**
 * Mon Plan Page (plan.tsx)
 *
 * 6 tabs: Setup, Skills, Inventory, Lifestyle, Trade, Swipe
 */

import { createSignal, Show, createEffect, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { TabNavigation, type TabId } from '~/components/tabs/TabNavigation';
import { SetupTab } from '~/components/tabs/SetupTab';
import { SkillsTab } from '~/components/tabs/SkillsTab';
import { InventoryTab } from '~/components/tabs/InventoryTab';
import { LifestyleTab } from '~/components/tabs/LifestyleTab';
import { TradeTab } from '~/components/tabs/TradeTab';
import { SwipeTab } from '~/components/tabs/SwipeTab';

// Types for plan data
interface SetupData {
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  academicEvents: Array<{
    id: string;
    type: string;
    name: string;
    startDate: string;
    endDate: string;
  }>;
  commitments: Array<{
    id: string;
    type: string;
    name: string;
    hoursPerWeek: number;
  }>;
}

interface Skill {
  id: string;
  name: string;
  level: string;
  hourlyRate: number;
  marketDemand: number;
  cognitiveEffort: number;
  restNeeded: number;
  score?: number;
}

interface Item {
  id: string;
  name: string;
  category: string;
  estimatedValue: number;
  condition: string;
  platform?: string;
  sold?: boolean;
  soldPrice?: number;
}

interface LifestyleItem {
  id: string;
  category: string;
  name: string;
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  applied?: boolean;
}

interface TradeItem {
  id: string;
  type: string;
  name: string;
  description?: string;
  partner: string;
  value: number;
  status: string;
  dueDate?: string;
}

interface PlanData {
  setup?: SetupData;
  skills: Skill[];
  inventory: Item[];
  lifestyle: LifestyleItem[];
  trades: TradeItem[];
  completedTabs: TabId[];
}

export default function PlanPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = createSignal<TabId>('setup');
  const [hasProfile, setHasProfile] = createSignal(false);
  const [planData, setPlanData] = createSignal<PlanData>({
    skills: [],
    inventory: [],
    lifestyle: [],
    trades: [],
    completedTabs: [],
  });

  // Check for profile on mount
  onMount(() => {
    const storedProfile = localStorage.getItem('studentProfile');
    if (storedProfile) {
      setHasProfile(true);

      // Load any existing plan data
      const storedPlan = localStorage.getItem('planData');
      if (storedPlan) {
        setPlanData(JSON.parse(storedPlan));
      }
    }
  });

  // Save plan data whenever it changes
  createEffect(() => {
    if (hasProfile()) {
      localStorage.setItem('planData', JSON.stringify(planData()));
    }
  });

  const markTabComplete = (tab: TabId) => {
    const current = planData();
    if (!current.completedTabs.includes(tab)) {
      setPlanData({
        ...current,
        completedTabs: [...current.completedTabs, tab],
      });
    }
  };

  const handleSetupComplete = (data: SetupData) => {
    setPlanData({ ...planData(), setup: data });
    markTabComplete('setup');
    setActiveTab('skills');
  };

  const handleSkillsChange = (skills: Skill[]) => {
    setPlanData({ ...planData(), skills });
    if (skills.length > 0) {
      markTabComplete('skills');
    }
  };

  const handleInventoryChange = (inventory: Item[]) => {
    setPlanData({ ...planData(), inventory });
    if (inventory.length > 0) {
      markTabComplete('inventory');
    }
  };

  const handleLifestyleChange = (lifestyle: LifestyleItem[]) => {
    setPlanData({ ...planData(), lifestyle });
    if (lifestyle.length > 0) {
      markTabComplete('lifestyle');
    }
  };

  const handleTradesChange = (trades: TradeItem[]) => {
    setPlanData({ ...planData(), trades });
    if (trades.length > 0) {
      markTabComplete('trade');
    }
  };

  const handleSwipePreferencesChange = () => {
    markTabComplete('swipe');
  };

  const handleScenariosSelected = () => {
    // Navigate to suivi after completing swipe
    navigate('/suivi');
  };

  // No profile fallback component
  const NoProfileView = () => (
    <div class="card text-center py-12 max-w-md mx-auto">
      <div class="text-4xl mb-4">👋</div>
      <h2 class="text-xl font-bold text-slate-900 mb-2">Pas encore de profil</h2>
      <p class="text-slate-500 mb-6">Complete d'abord l'onboarding pour creer ton profil</p>
      <a href="/" class="btn-primary">
        Commencer l'onboarding
      </a>
    </div>
  );

  return (
    <Show when={hasProfile()} fallback={<NoProfileView />}>
      <div class="flex flex-col h-full -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">
        {/* Tab Navigation */}
        <TabNavigation
          activeTab={activeTab()}
          onTabChange={setActiveTab}
          completedTabs={planData().completedTabs}
        />

        {/* Tab Content */}
        <div class="flex-1 overflow-y-auto">
          <Show when={activeTab() === 'setup'}>
            <SetupTab onComplete={handleSetupComplete} initialData={planData().setup} />
          </Show>

          <Show when={activeTab() === 'skills'}>
            <SkillsTab initialSkills={planData().skills} onSkillsChange={handleSkillsChange} />
          </Show>

          <Show when={activeTab() === 'inventory'}>
            <InventoryTab
              initialItems={planData().inventory}
              onItemsChange={handleInventoryChange}
            />
          </Show>

          <Show when={activeTab() === 'lifestyle'}>
            <LifestyleTab
              initialItems={planData().lifestyle}
              onItemsChange={handleLifestyleChange}
            />
          </Show>

          <Show when={activeTab() === 'trade'}>
            <TradeTab initialTrades={planData().trades} onTradesChange={handleTradesChange} />
          </Show>

          <Show when={activeTab() === 'swipe'}>
            <SwipeTab
              skills={planData().skills.map((s) => ({
                name: s.name,
                hourlyRate: s.hourlyRate,
              }))}
              items={planData()
                .inventory.filter((i) => !i.sold)
                .map((i) => ({
                  name: i.name,
                  estimatedValue: i.estimatedValue,
                }))}
              lifestyle={planData().lifestyle.map((l) => ({
                name: l.name,
                currentCost: l.currentCost,
                optimizedCost: l.optimizedCost,
              }))}
              trades={planData().trades.map((t) => ({
                name: t.name,
                value: t.value,
              }))}
              onPreferencesChange={handleSwipePreferencesChange}
              onScenariosSelected={handleScenariosSelected}
            />
          </Show>
        </div>
      </div>
    </Show>
  );
}
