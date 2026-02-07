/**
 * Me Page (me.tsx)
 *
 * 5 tabs: Profile, Goals, Budget, Trade, Jobs
 * Swipe is now a standalone page at /swipe
 * Uses profileService for DuckDB persistence instead of localStorage.
 */

import { createSignal, createEffect, onMount, Show, For, untrack, lazy, Suspense } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { Dynamic } from 'solid-js/web';
import { ProfileTab } from '~/components/tabs/ProfileTab';
import { GoalsTab } from '~/components/tabs/GoalsTab';

import { BudgetTab } from '~/components/tabs/BudgetTab';
// v4.2: Lazy load heavy tabs for faster initial page load
const TradeTab = lazy(() =>
  import('~/components/tabs/TradeTab').then((m) => ({ default: m.TradeTab }))
);
const ProspectionTab = lazy(() =>
  import('~/components/tabs/ProspectionTab').then((m) => ({ default: m.ProspectionTab }))
);
import { profileService } from '~/lib/profileService';
import { inventoryService } from '~/lib/inventoryService';
import { goalService } from '~/lib/goalService';
import { setGoalAchieved } from '~/lib/goalAchievementStore';
import { tradeService } from '~/lib/tradeService';
import { useProfile } from '~/lib/profileContext';
import { useSimulation } from '~/lib/simulationContext';
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
import { createLogger } from '~/lib/logger';
import { eventBus } from '~/lib/eventBus';
import { Check, User, Target, PiggyBank, Handshake, Menu, Compass } from 'lucide-solid';
import { UnsavedChangesDialog } from '~/components/ui/UnsavedChangesDialog';
import { useTipsWarmup, type TabType } from '~/hooks/useTipsWarmup';

const logger = createLogger('MePage');

// Types for plan data - local types for plan-specific structures
type AcademicEventType =
  | 'exam_period'
  | 'class_intensive'
  | 'vacation'
  | 'vacation_rest'
  | 'vacation_available'
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

// Currency type - used in local storage structure
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Currency = 'USD' | 'EUR' | 'GBP';

// v4.2: Skeleton fallback for lazy-loaded tabs
function TabSkeleton() {
  return (
    <div class="space-y-4 p-6 animate-in fade-in duration-200">
      <div class="h-8 w-48 bg-muted rounded animate-pulse" />
      <div class="h-32 bg-muted rounded animate-pulse" />
      <div class="h-32 bg-muted rounded animate-pulse" />
      <div class="grid grid-cols-2 gap-4">
        <div class="h-24 bg-muted rounded animate-pulse" />
        <div class="h-24 bg-muted rounded animate-pulse" />
      </div>
    </div>
  );
}

const TABS = [
  { id: 'profile', label: 'Profile', icon: 'User' },
  { id: 'goals', label: 'Goals', icon: 'Target' },
  { id: 'budget', label: 'Budget', icon: 'PiggyBank' },
  { id: 'trade', label: 'Trade', icon: 'Handshake' },
  { id: 'jobs', label: 'Jobs', icon: 'Compass' },
] as const;

// Helper to map string icon names to components for Dynamic
const ICON_MAP = {
  User,
  Target,
  PiggyBank,
  Handshake,
  Compass,
};

export default function MePage() {
  const [searchParams] = useSearchParams();

  // Get inventory, lifestyle, and trades from profile context (DB-backed data)
  const {
    profile: activeProfile, // Use global profile state
    skills: contextSkills,
    inventory: contextInventory,
    lifestyle: contextLifestyle,
    trades: contextTrades,
    leads: contextLeads, // Phase 3: Use leads from context for Jobs tab
    setLeads,
    refreshInventory,
    refreshTrades,
    refreshProfile,
  } = useProfile();

  // Initialize activeTab from URL param (e.g., /me?tab=goals) or default to 'profile'
  const validTabIds = TABS.map((t) => t.id) as readonly string[];
  const tabParam = () => {
    const raw = searchParams.tab;
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const initialTab = tabParam() && validTabIds.includes(tabParam()!) ? tabParam()! : 'profile';
  // Reactive category param for deep-linking into Jobs tab (e.g., /me?tab=jobs&category=digital)
  const categoryParam = () => {
    const raw = searchParams.category;
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const [activeTab, setActiveTab] = createSignal<string>(initialTab);

  // Sync activeTab when URL search params change (e.g., notification deep links on same page)
  createEffect(() => {
    const newTab = tabParam();
    if (newTab && validTabIds.includes(newTab) && newTab !== untrack(() => activeTab())) {
      setActiveTab(newTab);
    }
  });
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

  // Memoize userLocation to avoid recreating object on every render/access
  const userLocation = () => {
    const p = activeProfile();
    return p?.latitude && p?.longitude ? { lat: p.latitude!, lng: p.longitude! } : undefined;
  };

  // Sprint 13.8 Fix: Use SimulationContext for reactive date updates
  // This replaces the local signal + createEffect that never updated when simulation changed
  const { currentDate } = useSimulation();

  // Dirty state tracking for unsaved changes warning when switching tabs
  const [isCurrentTabDirty, setIsCurrentTabDirty] = createSignal(false);
  const [pendingTabChange, setPendingTabChange] = createSignal<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);

  // Tips warmup hook - prefetch tips for current and predicted next tabs
  // Use 'profile' as initial tab (the hook handles re-warmup when tab changes via warmupTabs)
  const profileIdAccessor = () => activeProfile()?.id;
  const { warmupTabs, warmupStatus, isTabWarmedUp } = useTipsWarmup(
    profileIdAccessor,
    'profile', // Initial tab
    { skipAutoWarmup: true, skipPrefetch: true } // We handle all warmup manually via createEffect
  );

  // Trigger warmup when tab changes - warm current tab + predicted next tabs
  // IMPORTANT: Use untrack for isTabWarmedUp to prevent infinite loop
  // (warmupStatus changes → effect re-runs → warmupTabs → warmupStatus changes → ...)
  createEffect(() => {
    const tab = activeTab() as TabType;
    const pid = profileIdAccessor();
    if (pid && tab) {
      // Use untrack to read warmup status without creating dependency
      const alreadyWarmed = untrack(() => isTabWarmedUp(tab));
      if (!alreadyWarmed) {
        warmupTabs([tab]);
      }
      // Prefetch predicted tabs in background after a short delay
      const predictions: Record<TabType, TabType[]> = {
        profile: ['goals', 'jobs'],
        goals: ['budget', 'swipe'],
        budget: ['jobs', 'trade'],
        trade: ['budget'],
        jobs: ['swipe', 'budget'],
        swipe: ['goals', 'jobs'],
      };
      const predictedTabs = predictions[tab] || [];
      if (predictedTabs.length > 0) {
        setTimeout(() => {
          // Also untrack for predicted tabs check
          const tabsToWarmup = predictedTabs.filter((t) => !untrack(() => isTabWarmedUp(t)));
          if (tabsToWarmup.length > 0) {
            warmupTabs(tabsToWarmup);
          }
        }, 500);
      }
    }
  });

  // Log warmup status for debugging (only in dev)
  if (import.meta.env.DEV) {
    createEffect(() => {
      const status = warmupStatus();
      const loading = Object.entries(status).filter(([, s]) => s.loading);
      if (loading.length > 0) {
        logger.debug('Tips warmup in progress', { loading: loading.map(([t]) => t) });
      }
    });
  }

  // Handler for tab change that checks for dirty state
  const handleTabChange = (newTab: string) => {
    if (isCurrentTabDirty()) {
      // Store the pending tab and show confirmation dialog
      setPendingTabChange(newTab);
      setShowUnsavedDialog(true);
    } else {
      setActiveTab(newTab);
    }
  };

  // Confirm discard and switch to pending tab
  const handleDiscardAndSwitch = () => {
    const pending = pendingTabChange();
    setShowUnsavedDialog(false);
    setPendingTabChange(null);
    setIsCurrentTabDirty(false); // Reset dirty state
    if (pending) {
      setActiveTab(pending);
    }
  };

  // Cancel the tab switch
  const handleKeepEditing = () => {
    setShowUnsavedDialog(false);
    setPendingTabChange(null);
  };

  // Load plan data when activeProfile changes
  // FIX: Compare before setting to break the infinite loop:
  // setPlanData → Effect 2 (save) → DATA_CHANGED → ProfileContext refresh → Effect 1 → setPlanData...
  // eslint-disable-next-line solid/reactivity
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

    // Check if active goal is achieved (hides BrunoHintV2 + editing across all tabs)
    if (profile) {
      try {
        const activeGoals = await goalService.listGoals(profile.id, { status: 'active' });
        const currentAmount = Number(profile.followupData?.currentAmount || 0);
        const achievedGoal = activeGoals.find(
          (g) => g.progress >= 100 || (g.amount > 0 && currentAmount >= g.amount)
        );
        if (achievedGoal) {
          let days: number | null = null;
          if (achievedGoal.createdAt) {
            const start = new Date(achievedGoal.createdAt);
            days = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
          }
          setGoalAchieved(true, days);
        } else {
          setGoalAchieved(false);
        }
      } catch {
        // Non-critical — leave default (false)
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
      profileService.patchProfile(profile.id, {
        planData: data as unknown as Record<string, unknown>,
      });
    }
  });

  // Automatically validate Profile tab if Profile exists AND Skills exist
  createEffect(() => {
    const profile = activeProfile();
    const skills = contextSkills();
    const currentCompleted = planData().completedTabs || [];

    // Profile is complete if we have a name/id and at least one skill
    const isComplete = !!(profile?.id && profile?.name && skills.length > 0);
    const isMarked = currentCompleted.includes('profile');

    if (isComplete && !isMarked) {
      const newCompleted = [...currentCompleted, 'profile'];
      setPlanData({ ...planData(), completedTabs: newCompleted });
    } else if (!isComplete && isMarked) {
      // Optional: uncheck if requirements are no longer met
      const newCompleted = currentCompleted.filter((t) => t !== 'profile');
      setPlanData({ ...planData(), completedTabs: newCompleted });
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
    // Stay on the same tab after saving (don't auto-navigate to skills)
  };

  const handleProfileChange = () => {
    markTabComplete('profile');
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
        // Emit DATA_CHANGED to trigger goal data refresh in Goals tab
        // This ensures Goals tab shows trade sales immediately
        eventBus.emit('DATA_CHANGED');
      } catch (err) {
        logger.error('Failed to persist trades', { error: err });
      }
    }
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
          <Tabs value={activeTab()} onChange={handleTabChange} class="w-full">
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
                                handleTabChange(tab.id);
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
                  onNavigateToBudget={() => setActiveTab('budget')}
                  onDirtyChange={setIsCurrentTabDirty}
                />
              </TabsContent>

              <TabsContent value="goals" class="mt-0">
                <GoalsTab
                  onComplete={handleSetupComplete}
                  initialData={planData().setup}
                  currency={activeProfile()?.currency}
                  onDirtyChange={setIsCurrentTabDirty}
                  simulatedDate={currentDate()}
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
                  onDirtyChange={setIsCurrentTabDirty}
                />
              </TabsContent>

              <TabsContent value="trade" class="mt-0">
                <Suspense fallback={<TabSkeleton />}>
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
                    onDirtyChange={setIsCurrentTabDirty}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="jobs" class="mt-0">
                <Suspense fallback={<TabSkeleton />}>
                  <ProspectionTab
                    profileId={activeProfile()?.id}
                    userLocation={userLocation()}
                    city={activeProfile()?.city}
                    currency={activeProfile()?.currency}
                    userSkills={activeProfile()?.skills}
                    userCertifications={activeProfile()?.certifications}
                    minHourlyRate={activeProfile()?.minHourlyRate}
                    skippedSteps={activeProfile()?.skippedSteps}
                    initialCategory={categoryParam() || undefined}
                    onLeadsChange={setLeads}
                    onLeadSaved={(lead) => {
                      if (lead.status === 'interested') {
                        // Optional: Navigate to /swipe or show notification
                      }
                    }}
                  />
                </Suspense>
              </TabsContent>
            </div>
          </Tabs>

          {/* Unsaved changes dialog for tab navigation */}
          <UnsavedChangesDialog
            isOpen={showUnsavedDialog()}
            onDiscard={handleDiscardAndSwitch}
            onKeepEditing={handleKeepEditing}
            message="You have unsaved changes in this tab. Discard changes and switch tabs?"
          />
        </div>
      </Show>
    </Show>
  );
}
