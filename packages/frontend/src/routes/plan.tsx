/**
 * My Plan Page (plan.tsx)
 *
 * 6 tabs: Profile, Goals, Skills, Lifestyle, Trade, Swipe
 * Now uses profileService for DuckDB persistence instead of localStorage.
 */

import { createSignal, createEffect, onMount, Show, For, untrack } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Dynamic } from 'solid-js/web';
import { ProfileTab } from '~/components/tabs/ProfileTab';
import { GoalsTab } from '~/components/tabs/GoalsTab';
import { SkillsTab } from '~/components/tabs/SkillsTab';
import { BudgetTab } from '~/components/tabs/BudgetTab';
import { TradeTab } from '~/components/tabs/TradeTab';
import { SwipeTab, type UserPreferences } from '~/components/tabs/SwipeTab';
import { profileService, type FullProfile } from '~/lib/profileService';
import { inventoryService } from '~/lib/inventoryService';
import { goalService } from '~/lib/goalService';
import { tradeService } from '~/lib/tradeService';
import { useProfile } from '~/lib/profileContext';
import type {
  LegacySkill,
  LegacyLifestyleItem,
  InventoryCategory,
  ItemCondition,
} from '~/types/entities';
import { PageLoader } from '~/components/PageLoader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { Card } from '~/components/ui/Card';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '~/components/ui/Sheet';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/cn';
import { Check, User, Target, Briefcase, PiggyBank, Handshake, Dices, Menu } from 'lucide-solid';

// Types for plan data - local types for plan-specific structures
type AcademicEventType =
  | 'exam_period'
  | 'class_intensive'
  | 'vacation'
  | 'internship'
  | 'project_deadline';
type CommitmentType = 'class' | 'sport' | 'club' | 'family' | 'health' | 'other';
type TradeType = 'trade' | 'borrow' | 'lend' | 'sell';
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

// Use LegacySkill from entities.ts (same structure as local Skill)
type Skill = LegacySkill;

// Use LegacyLifestyleItem from entities.ts (same structure as local LifestyleItem)
type LifestyleItem = LegacyLifestyleItem;

interface Item {
  id: string;
  name: string;
  category: InventoryCategory;
  estimatedValue: number;
  condition: ItemCondition;
  platform?: string;
  sold?: boolean;
  soldPrice?: number;
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
  inventoryItemId?: string;
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
  completedTabs: string[];
}

// Currency type
type Currency = 'USD' | 'EUR' | 'GBP';

// Helper to get currency symbol
function getCurrencySymbol(currency?: Currency): string {
  switch (currency) {
    case 'EUR':
      return '\u20AC'; // €
    case 'GBP':
      return '\u00A3'; // £
    default:
      return '$';
  }
}

const TABS = [
  { id: 'profile', label: 'Profile', icon: 'User' },
  { id: 'goals', label: 'Goals', icon: 'Target' },
  { id: 'skills', label: 'Skills', icon: 'Briefcase' },
  { id: 'budget', label: 'Budget', icon: 'PiggyBank' },
  { id: 'trade', label: 'Trade', icon: 'Handshake' },
  { id: 'swipe', label: 'Swipe', icon: 'Dices' },
] as const;

// Helper to map string icon names to components for Dynamic
const ICON_MAP = {
  User,
  Target,
  Briefcase,
  PiggyBank,
  Handshake,
  Dices,
};

export default function PlanPage() {
  const navigate = useNavigate();
  // Get inventory, lifestyle, and trades from profile context (DB-backed data)
  // Get inventory, lifestyle, and trades from profile context (DB-backed data)
  const {
    profile: activeProfile, // Use global profile state
    inventory: contextInventory,
    lifestyle: contextLifestyle,
    trades: contextTrades,
    refreshInventory,
    refreshTrades,
    refreshProfile,
  } = useProfile();

  const [activeTab, setActiveTab] = createSignal<string>('profile');
  const [isLoading, setIsLoading] = createSignal(true); // Keep loading to show spinner while context loads
  // Derived state for profile existence
  const hasProfile = () => !!activeProfile();

  const [planData, setPlanData] = createSignal<PlanData>({
    skills: [],
    inventory: [],
    lifestyle: [],
    trades: [],
    selectedScenarios: [],
    completedTabs: [],
  });
  const [isSaving] = createSignal(false);
  const [isSheetOpen, setIsSheetOpen] = createSignal(false);

  // Load plan data when activeProfile changes
  // FIX: Compare before setting to break the infinite loop:
  // setPlanData → Effect 2 (save) → DATA_CHANGED → ProfileContext refresh → Effect 1 → setPlanData...
  createEffect(async () => {
    const profile = activeProfile();
    if (profile) {
      // Load plan data from profile (cast from stored JSON)
      if (profile.planData) {
        const stored = profile.planData as unknown as PlanData;
        const newData = {
          ...stored,
          completedTabs: stored.completedTabs || [],
          skills: stored.skills || [],
          inventory: stored.inventory || [],
          lifestyle: stored.lifestyle || [],
          trades: stored.trades || [],
          selectedScenarios: stored.selectedScenarios || [],
        };

        // Only update if data actually changed (breaks the infinite loop)
        const current = untrack(() => planData());
        if (JSON.stringify(current) !== JSON.stringify(newData)) {
          setPlanData(newData);
        }
      }

      // Load primary goal to populate setup.goalDeadline if not already set
      const currentPlanData = untrack(() => planData());
      if (!currentPlanData.setup?.goalDeadline) {
        const primaryGoal = await goalService.getPrimaryGoal(profile.id);
        if (primaryGoal?.deadline) {
          const newSetupData = {
            ...currentPlanData,
            setup: {
              ...currentPlanData.setup,
              goalName: primaryGoal.name,
              goalAmount: primaryGoal.amount,
              goalDeadline: primaryGoal.deadline,
              academicEvents: currentPlanData.setup?.academicEvents || [],
              commitments: currentPlanData.setup?.commitments || [],
            },
          };
          // Only update if setup data actually changed
          if (JSON.stringify(currentPlanData) !== JSON.stringify(newSetupData)) {
            setPlanData(newSetupData);
          }
        }
      }
    }

    // Stop loading once we've attempted to load data (even if profile is null)
    setIsLoading(false);
  });

  // Save plan data whenever it changes - now using profileService with debounce
  // IMPORTANT: Use untrack() for activeProfile/hasProfile/isSaving to avoid infinite loop.
  // We only want this effect to trigger when planData() changes, not when profile refreshes.
  createEffect(() => {
    const data = planData(); // Track only planData changes

    // Read these without tracking to break the refresh cycle:
    // saveProfile → DATA_CHANGED → refreshProfile → setProfile → effect re-trigger → loop!
    const profile = untrack(() => activeProfile());
    const hasProf = untrack(() => hasProfile());
    const saving = untrack(() => isSaving());

    if (hasProf && profile && !saving) {
      // Debounced save to DuckDB only (no localStorage to prevent cross-profile contamination)
      profileService.saveProfile(
        {
          ...profile,
          planData: data as unknown as Record<string, unknown>,
        },
        { setActive: false }
      );
    }
  });

  const markTabComplete = (tab: string) => {
    const current = planData();
    const completedTabs = current.completedTabs || [];
    if (!completedTabs.includes(tab)) {
      setPlanData({
        ...current,
        completedTabs: [...completedTabs, tab],
      });
    }
  };

  const handleSetupComplete = (data: SetupData) => {
    setPlanData({ ...planData(), setup: data });
    markTabComplete('goals');
    setActiveTab('skills');
  };

  const handleProfileChange = () => {
    markTabComplete('profile');
  };

  const handleSkillsChange = (skills: Skill[]) => {
    setPlanData({ ...planData(), skills });
    if (skills.length > 0) {
      markTabComplete('skills');
    }
  };

  const handleBudgetChange = (lifestyle: LifestyleItem[]) => {
    setPlanData({ ...planData(), lifestyle });
    if (lifestyle.length > 0) {
      markTabComplete('budget');
    }
  };

  const handleTradesChange = async (trades: TradeItem[]) => {
    setPlanData({ ...planData(), trades });
    if (trades.length > 0) {
      markTabComplete('trade');
    }

    // Persist trades to DB (clear and recreate)
    const profile = activeProfile();
    if (profile?.id) {
      try {
        await tradeService.bulkCreateTrades(
          profile.id,
          trades.map((t) => ({
            type: t.type,
            name: t.name,
            description: t.description,
            partner: t.partner,
            value: t.value,
            status: t.status,
            dueDate: t.dueDate,
            inventoryItemId: t.inventoryItemId,
          })),
          true // clearFirst = true
        );
        await refreshTrades();
      } catch (err) {
        console.error('Failed to persist trades', err);
      }
    }
  };

  // BUG 2 FIX: Actually save swipe preferences to profile
  const handleSwipePreferencesChange = async (prefs: UserPreferences) => {
    markTabComplete('swipe');

    // Save preferences to profile via API
    const profile = activeProfile();
    if (profile?.id) {
      try {
        // Convert SwipeTab's UserPreferences to DB format
        const swipePreferences = {
          effort_sensitivity: prefs.effortSensitivity,
          hourly_rate_priority: prefs.hourlyRatePriority,
          time_flexibility: prefs.timeFlexibility,
          income_stability: prefs.incomeStability,
        };
        await profileService.saveProfile(
          {
            id: profile.id,
            name: profile.name,
            swipePreferences,
          },
          { immediate: true, setActive: false }
        );
        // Refresh profile to update context
        await refreshProfile();
      } catch (err) {
        console.error('Failed to save swipe preferences', err);
      }
    }
  };

  const handleScenariosSelected = (scenarios: SelectedScenario[]) => {
    // Save selected scenarios to planData
    setPlanData({ ...planData(), selectedScenarios: scenarios });
    // Navigate to suivi after completing swipe
    navigate('/suivi');
  };

  // No profile fallback component
  const NoProfileView = () => (
    <div class="h-[60vh] flex items-center justify-center">
      <Card class="text-center py-12 px-8 max-w-md mx-auto">
        <div class="text-4xl mb-4">👋</div>
        <h2 class="text-xl font-bold text-foreground mb-2">No profile yet</h2>
        <p class="text-muted-foreground mb-6">
          Complete the onboarding first to create your profile
        </p>
        <a
          href="/"
          class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Start onboarding
        </a>
      </Card>
    </div>
  );

  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));

  return (
    <Show when={!isLoading()} fallback={mounted() ? <PageLoader /> : null}>
      <Show when={hasProfile()} fallback={<NoProfileView />}>
        <div class="flex flex-col h-full space-y-6">
          <Tabs value={activeTab()} onChange={setActiveTab} class="w-full">
            <div class="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 bg-background/80 backdrop-blur-xl border-b border-border/50">
              {/* Desktop Tabs */}
              <div class="hidden md:block py-3">
                <TabsList class="w-full justify-start h-auto bg-transparent p-0 pl-2 md:pl-4 gap-6 overflow-x-auto">
                  <For each={TABS}>
                    {(tab) => (
                      <TabsTrigger
                        value={tab.id}
                        class="data-[selected]:bg-transparent data-[selected]:shadow-none data-[selected]:border-primary data-[selected]:text-primary border-b-2 border-transparent rounded-none px-2 pb-3 pt-2 text-muted-foreground hover:text-foreground transition-all flex items-center gap-2"
                      >
                        <Dynamic
                          component={ICON_MAP[tab.icon as keyof typeof ICON_MAP]}
                          class="h-4 w-4"
                        />
                        {tab.label}
                        {planData().completedTabs?.includes(tab.id) && (
                          <span class="ml-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] text-primary">
                            <Check class="h-3 w-3" />
                          </span>
                        )}
                      </TabsTrigger>
                    )}
                  </For>
                </TabsList>
              </div>

              {/* Mobile Header with Burger Menu */}
              <div class="md:hidden flex items-center justify-between py-2">
                <Sheet open={isSheetOpen()} onOpenChange={setIsSheetOpen}>
                  <SheetTrigger as={Button} variant="ghost" size="icon" class="-ml-2">
                    <Menu class="h-6 w-6" />
                  </SheetTrigger>
                  <SheetContent side="left" class="w-[80vw] sm:w-[350px]">
                    <SheetHeader class="mb-6">
                      <SheetTitle>Navigation</SheetTitle>
                    </SheetHeader>
                    <div class="flex flex-col space-y-2">
                      <For each={TABS}>
                        {(tab) => {
                          const isActive = () => activeTab() === tab.id;
                          return (
                            <button
                              onClick={() => {
                                setActiveTab(tab.id);
                                setIsSheetOpen(false);
                              }}
                              class={cn(
                                'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                                isActive()
                                  ? 'bg-primary text-primary-foreground'
                                  : 'hover:bg-muted text-foreground'
                              )}
                            >
                              <Dynamic
                                component={ICON_MAP[tab.icon as keyof typeof ICON_MAP]}
                                class="h-5 w-5"
                              />
                              <span class="flex-1 text-left">{tab.label}</span>
                              {planData().completedTabs?.includes(tab.id) && (
                                <span
                                  class={cn(
                                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                                    isActive()
                                      ? 'bg-primary-foreground/20 text-primary-foreground'
                                      : 'bg-primary/10 text-primary'
                                  )}
                                >
                                  <Check class="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </SheetContent>
                </Sheet>
                <div class="font-bold text-lg">Stride</div>
                <div class="w-8" /> {/* Spacer to balance burger icon */}
              </div>
            </div>

            <div class="mt-6 min-h-[500px]">
              <TabsContent value="profile" class="mt-0">
                <ProfileTab
                  onProfileChange={handleProfileChange}
                  currencySymbol={getCurrencySymbol(activeProfile()?.currency)}
                />
              </TabsContent>

              <TabsContent value="goals" class="mt-0">
                <GoalsTab
                  onComplete={handleSetupComplete}
                  initialData={planData().setup}
                  currency={activeProfile()?.currency}
                />
              </TabsContent>

              <TabsContent value="skills" class="mt-0">
                <SkillsTab
                  initialSkills={planData().skills}
                  onSkillsChange={handleSkillsChange}
                  currency={activeProfile()?.currency}
                />
              </TabsContent>

              <TabsContent value="budget" class="mt-0">
                <BudgetTab
                  initialItems={planData().lifestyle}
                  onItemsChange={handleBudgetChange}
                  currency={activeProfile()?.currency}
                  profileMonthlyExpenses={activeProfile()?.monthlyExpenses}
                  profileExpenses={activeProfile()?.expenses}
                  profileIncomeSources={activeProfile()?.incomeSources}
                  goalDeadline={planData().setup?.goalDeadline}
                />
              </TabsContent>

              <TabsContent value="trade" class="mt-0">
                <TradeTab
                  initialTrades={contextTrades().map((t) => ({
                    id: t.id,
                    type: t.type,
                    name: t.name,
                    description: t.description,
                    partner: t.partner,
                    value: t.value,
                    status: t.status,
                    dueDate: t.dueDate,
                    inventoryItemId: t.inventoryItemId,
                  }))}
                  onTradesChange={handleTradesChange}
                  goalName={planData().setup?.goalName}
                  goalAmount={planData().setup?.goalAmount}
                  currency={activeProfile()?.currency}
                  inventoryItems={contextInventory()
                    .filter((i) => i.status === 'available')
                    .map((i) => ({
                      id: i.id,
                      name: i.name,
                      estimatedValue: i.estimatedValue,
                      category: i.category,
                    }))}
                  lifestyleItems={contextLifestyle().map((l) => ({
                    name: l.name,
                    currentCost: l.currentCost,
                    pausedMonths: l.pausedMonths,
                  }))}
                  onInventorySold={(inventoryItemId, soldPrice) => {
                    void (async () => {
                      await inventoryService.markAsSold(inventoryItemId, soldPrice);
                      await refreshInventory();
                    })();
                    return Promise.resolve();
                  }}
                />
              </TabsContent>

              <TabsContent value="swipe" class="mt-0">
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
                    pausedMonths: l.pausedMonths,
                  }))}
                  trades={planData().trades.map((t) => ({
                    name: t.name,
                    value: t.value,
                  }))}
                  currency={activeProfile()?.currency}
                  profileId={activeProfile()?.id}
                  // BUG 3 FIX: Pass saved preferences from profile
                  initialPreferences={
                    activeProfile()?.swipePreferences
                      ? {
                          effortSensitivity:
                            activeProfile()?.swipePreferences?.effort_sensitivity ?? 0.5,
                          hourlyRatePriority:
                            activeProfile()?.swipePreferences?.hourly_rate_priority ?? 0.5,
                          timeFlexibility:
                            activeProfile()?.swipePreferences?.time_flexibility ?? 0.5,
                          incomeStability:
                            activeProfile()?.swipePreferences?.income_stability ?? 0.5,
                        }
                      : undefined
                  }
                  onPreferencesChange={handleSwipePreferencesChange}
                  onScenariosSelected={handleScenariosSelected}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </Show>
    </Show>
  );
}
