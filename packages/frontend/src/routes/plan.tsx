/**
 * Mon Plan Page (plan.tsx)
 *
 * 6 tabs: Setup, Skills, Inventory, Lifestyle, Trade, Swipe
 * Now uses profileService for DuckDB persistence instead of localStorage.
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
import { profileService, type FullProfile } from '~/lib/profileService';

// Types for plan data - using 'any' style string types for JSON storage compatibility
// The component types use strict unions, but stored data may have any string values
type AcademicEventType =
  | 'exam_period'
  | 'class_intensive'
  | 'vacation'
  | 'internship'
  | 'project_deadline';
type CommitmentType = 'class' | 'sport' | 'club' | 'family' | 'health' | 'other';
type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
type ItemCategory = 'electronics' | 'clothing' | 'books' | 'furniture' | 'sports' | 'other';
type ItemCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
type LifestyleCategory = 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
type TradeType = 'trade' | 'borrow' | 'lend';
type TradeStatus = 'pending' | 'active' | 'completed';

interface SetupData {
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  academicEvents: Array<{
    id: string;
    type: AcademicEventType;
    name: string;
    startDate: string;
    endDate: string;
  }>;
  commitments: Array<{
    id: string;
    type: CommitmentType;
    name: string;
    hoursPerWeek: number;
  }>;
}

interface Skill {
  id: string;
  name: string;
  level: SkillLevel;
  hourlyRate: number;
  marketDemand: number;
  cognitiveEffort: number;
  restNeeded: number;
  score?: number;
}

interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  estimatedValue: number;
  condition: ItemCondition;
  platform?: string;
  sold?: boolean;
  soldPrice?: number;
}

interface LifestyleItem {
  id: string;
  category: LifestyleCategory;
  name: string;
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  applied?: boolean;
}

interface TradeItem {
  id: string;
  type: TradeType;
  name: string;
  description?: string;
  partner: string;
  value: number;
  status: TradeStatus;
  dueDate?: string;
}

interface SelectedScenario {
  id: string;
  title: string;
  description: string;
  category: string;
  weeklyHours: number;
  weeklyEarnings: number;
  effortLevel: number;
  flexibilityScore: number;
  hourlyRate: number;
}

interface PlanData {
  setup?: SetupData;
  skills: Skill[];
  inventory: Item[];
  lifestyle: LifestyleItem[];
  trades: TradeItem[];
  selectedScenarios: SelectedScenario[];
  completedTabs: TabId[];
}

export default function PlanPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = createSignal<TabId>('setup');
  const [hasProfile, setHasProfile] = createSignal(false);
  const [activeProfile, setActiveProfile] = createSignal<FullProfile | null>(null);
  const [planData, setPlanData] = createSignal<PlanData>({
    skills: [],
    inventory: [],
    lifestyle: [],
    trades: [],
    selectedScenarios: [],
    completedTabs: [],
  });
  const [isSaving] = createSignal(false);

  // Check for profile on mount - now using profileService
  onMount(async () => {
    // First, try to sync localStorage to DuckDB (migration)
    await profileService.syncLocalToDb();

    // Load active profile from DuckDB
    const profile = await profileService.loadActiveProfile();
    if (profile) {
      setActiveProfile(profile);
      setHasProfile(true);

      // Load plan data from profile (cast from stored JSON)
      if (profile.planData) {
        const stored = profile.planData as unknown as PlanData;
        setPlanData(stored);
      }
    } else {
      // Fallback to localStorage for backwards compatibility
      const storedProfile = localStorage.getItem('studentProfile');
      if (storedProfile) {
        setHasProfile(true);
        const storedPlan = localStorage.getItem('planData');
        if (storedPlan) {
          setPlanData(JSON.parse(storedPlan));
        }
      }
    }
  });

  // Save plan data whenever it changes - now using profileService with debounce
  createEffect(() => {
    const profile = activeProfile();
    const data = planData();
    if (hasProfile() && profile && !isSaving()) {
      // Debounced save to DuckDB (cast planData for storage)
      profileService.saveProfile(
        {
          ...profile,
          planData: data as unknown as Record<string, unknown>,
        },
        { setActive: false }
      );

      // Also save to localStorage for backwards compatibility
      localStorage.setItem('planData', JSON.stringify(data));
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

  const handleScenariosSelected = (scenarios: SelectedScenario[]) => {
    // Save selected scenarios to planData
    setPlanData({ ...planData(), selectedScenarios: scenarios });
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
            <TradeTab
              initialTrades={planData().trades}
              onTradesChange={handleTradesChange}
              goalName={planData().setup?.goalName}
              goalAmount={planData().setup?.goalAmount}
            />
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
