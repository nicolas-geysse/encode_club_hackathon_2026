# Navigation Restructuring Plan - Detailed Implementation Guide

> **Status:** Planning Phase
> **Created:** 2026-02-04
> **Authors:** Senior Dev Team
> **Reference:** Follow patterns in `CLAUDE.md`

---

## 1. Overview

### Current Structure
```
/              → Onboarding (Bruno chat)
/plan          → "My Plan" (6 tabs: Profile, Goals, Budget, Trade, Jobs, Swipe)
/suivi         → "Tracking" (dashboard)
```

### Target Structure
```
/chat          → Onboarding → Chat assistant (renamed from /)
/me            → "Me" (5 tabs: Profile, Goals, Budget, Trade, Jobs)
/swipe         → "Swipe" (standalone page, elevated from tab)
/progress      → "Progress" (renamed from suivi)
```

---

## 2. Pre-Implementation Checklist

### 2.1 Before Starting
```bash
# 1. Ensure clean working directory
git status  # Should show no uncommitted changes

# 2. Create a feature branch
git checkout -b feat/navigation-restructure

# 3. Tag current state for rollback
git tag pre-restructure-backup

# 4. Run full test suite to establish baseline
pnpm typecheck
pnpm lint
pnpm --filter @stride/mcp-server test
```

### 2.2 Files to Read First
Before any modification, read these files to understand current state:
- `src/routes/plan.tsx` (760 lines - main orchestration)
- `src/routes/suivi.tsx` (1050 lines - tracking page)
- `src/lib/profileContext.tsx` (context structure)
- `src/components/layout/Sidebar.tsx` (navigation)
- `src/components/layout/BottomNav.tsx` (mobile navigation)

---

## 3. Phase 1: ProfileContext Extension (Leads)

### 3.1 Problem
Currently, `leads` are stored locally in `plan.tsx`:
```tsx
// src/routes/plan.tsx:218
const [leads, setLeads] = createSignal<Lead[]>([]);
```

The new `/swipe` page needs access to leads, but they're not in ProfileContext.

### 3.2 Solution: Add Leads to ProfileContext

**File:** `src/lib/profileContext.tsx`

**Step 1:** Add Lead type import
```tsx
// At top of file, add:
import type { Lead } from '~/lib/prospectionTypes';
```

**Step 2:** Extend ProfileContextValue interface
```tsx
// Find the interface (around line 30-50) and add:
interface ProfileContextValue {
  // ... existing properties ...

  // NEW: Leads from prospection (for Swipe integration)
  leads: () => Lead[];
  setLeads: (leads: Lead[]) => void;
  addLead: (lead: Lead) => void;
  updateLeadStatus: (leadId: string, status: Lead['status']) => void;
  refreshLeads: () => Promise<void>;  // ← Autonomie: recharge depuis l'API
}
```

**Step 3:** Initialize leads signal in provider
```tsx
// Inside ProfileProvider function, add:
const [leads, setLeads] = createSignal<Lead[]>([]);

const addLead = (lead: Lead) => {
  setLeads(prev => {
    // Avoid duplicates by checking place_id
    if (prev.some(l => l.place_id === lead.place_id)) {
      return prev;
    }
    return [...prev, lead];
  });
};

const updateLeadStatus = (leadId: string, status: Lead['status']) => {
  setLeads(prev => prev.map(l =>
    l.id === leadId ? { ...l, status } : l
  ));
};

// ⚠️ VIGILANCE: refreshLeads() pour autonomie - évite les données stale
const refreshLeads = async () => {
  const p = profile();
  if (!p?.id) return;

  try {
    const { leadsService } = await import('~/lib/leadsService');
    const freshLeads = await leadsService.getByProfileId(p.id);
    setLeads(freshLeads);
  } catch (error) {
    console.error('Failed to refresh leads', error);
  }
};
```

**Step 4:** Add to context value
```tsx
// In the value object returned by ProfileProvider:
const value: ProfileContextValue = {
  // ... existing properties ...
  leads,
  setLeads,
  addLead,
  updateLeadStatus,
  refreshLeads,
};
```

**⚠️ SolidJS Pattern:** Pass `leads` as accessor function, not `leads()` value.

### 3.4 Performance Consideration

> **⚠️ VIGILANCE:** Le ProfileContext grandit avec leads, inventory, etc. Pour éviter des re-renders inutiles, les composants doivent déstructurer **uniquement** ce dont ils ont besoin.

```tsx
// ❌ ANTI-PATTERN: Déstructure tout → re-render à chaque changement
const ctx = useProfile();  // Tout le contexte
return <div>{ctx.leads().length}</div>;

// ✅ CORRECT: Déstructure sélectivement → re-render uniquement si leads change
const { leads } = useProfile();  // Seulement leads
return <div>{leads().length}</div>;
```

**Impact:** Si un composant utilise seulement `leads`, il ne doit pas re-render quand `profile` ou `skills` changent.

### 3.3 Verification
```bash
pnpm typecheck  # Should pass with new context properties
```

---

## 4. Phase 2: Create Swipe Standalone Page

### 4.1 Create New Route File

**File:** `src/routes/swipe.tsx` (NEW)

```tsx
/**
 * Swipe Page (swipe.tsx)
 *
 * Standalone page for Swipe Scenarios - the key decision-making feature.
 * Elevated from a tab in /plan to its own route for better visibility.
 */

import { Show, Suspense, lazy } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useProfile } from '~/lib/profileContext';
import { PageLoader } from '~/components/PageLoader';
import { Card } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { createLogger } from '~/lib/logger';

const logger = createLogger('SwipePage');

// Lazy load SwipeTab component (already optimized for this)
const SwipeTab = lazy(() =>
  import('~/components/tabs/SwipeTab').then((m) => ({ default: m.SwipeTab }))
);

// Skeleton for lazy loading
function SwipeSkeleton() {
  return (
    <div class="space-y-4 p-6 animate-in fade-in duration-200">
      <div class="h-8 w-48 bg-muted rounded animate-pulse" />
      <div class="h-64 bg-muted rounded animate-pulse" />
      <div class="h-32 bg-muted rounded animate-pulse" />
    </div>
  );
}

export default function SwipePage() {
  const navigate = useNavigate();
  const {
    profile,
    skills,
    loading: profileLoading,
    leads,
  } = useProfile();

  // Derived state for SwipeTab props
  const activeProfile = () => profile();
  const isLoading = () => profileLoading();
  const hasProfile = () => !!activeProfile()?.id;

  // Build props for SwipeTab from context
  // ⚠️ SolidJS Pattern: Use accessors, not raw values
  const swipeProps = () => {
    const p = activeProfile();
    if (!p) return null;

    return {
      skills: skills().map((s) => ({
        name: s.name,
        hourlyRate: s.hourlyRate,
      })),
      // Items from inventory (if available in context, otherwise empty)
      items: [], // TODO: Add inventory to context if needed
      lifestyle: [], // TODO: Add lifestyle to context if needed
      trades: [], // TODO: Add trades to context if needed
      leads: leads().filter(l => l.status === 'interested'),
      currency: p.currency,
      profileId: p.id,
      initialPreferences: p.swipePreferences
        ? {
            effortSensitivity: p.swipePreferences.effort_sensitivity ?? 0.5,
            hourlyRatePriority: p.swipePreferences.hourly_rate_priority ?? 0.5,
            timeFlexibility: p.swipePreferences.time_flexibility ?? 0.5,
            incomeStability: p.swipePreferences.income_stability ?? 0.5,
          }
        : undefined,
    };
  };

  // Handlers
  const handlePreferencesChange = async (prefs: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  }) => {
    // Save preferences via profileService
    const p = activeProfile();
    if (!p?.id) return;

    try {
      const { profileService } = await import('~/lib/profileService');
      await profileService.updateProfile(p.id, {
        swipePreferences: {
          effort_sensitivity: prefs.effortSensitivity,
          hourly_rate_priority: prefs.hourlyRatePriority,
          time_flexibility: prefs.timeFlexibility,
          income_stability: prefs.incomeStability,
        },
      });
      logger.info('Swipe preferences saved');
    } catch (error) {
      logger.error('Failed to save swipe preferences', error);
    }
  };

  const handleScenariosSelected = (scenarios: unknown[]) => {
    logger.info('Scenarios selected', { count: scenarios.length });
    // Navigate to progress page after completing swipe session
    if (scenarios.length > 0) {
      navigate('/progress');
    }
  };

  // No profile view
  const NoProfileView = () => (
    <div class="flex items-center justify-center min-h-[60vh]">
      <Card class="p-8 text-center max-w-md">
        <div class="text-4xl mb-4">🎲</div>
        <h2 class="text-xl font-bold text-foreground mb-2">Set up your profile first</h2>
        <p class="text-muted-foreground mb-6">
          Complete your profile to unlock personalized swipe scenarios
        </p>
        <Button as="a" href="/me">
          Go to Profile
        </Button>
      </Card>
    </div>
  );

  return (
    <div class="container mx-auto px-4 py-6 max-w-4xl">
      <Show when={!isLoading()} fallback={<PageLoader />}>
        <Show when={hasProfile()} fallback={<NoProfileView />}>
          <Show when={swipeProps()}>
            {(props) => (
              <Suspense fallback={<SwipeSkeleton />}>
                <SwipeTab
                  {...props()}
                  onPreferencesChange={handlePreferencesChange}
                  onScenariosSelected={handleScenariosSelected}
                />
              </Suspense>
            )}
          </Show>
        </Show>
      </Show>
    </div>
  );
}
```

### 4.2 Missing Data: Inventory, Lifestyle, Trades

The SwipeTab also needs `items`, `lifestyle`, and `trades`. Options:

**Option A (Recommended):** Add to ProfileContext
```tsx
// In profileContext.tsx, add signals:
const [inventory, setInventory] = createSignal<InventoryItem[]>([]);
const [lifestyle, setLifestyle] = createSignal<LifestyleItem[]>([]);
const [trades, setTrades] = createSignal<Trade[]>([]);
```

**Option B (Quick):** Fetch on mount in swipe.tsx
```tsx
onMount(async () => {
  const p = activeProfile();
  if (!p?.id) return;

  const [inv, life, trd] = await Promise.all([
    inventoryService.getByProfileId(p.id),
    lifestyleService.getByProfileId(p.id),
    tradeService.getByProfileId(p.id),
  ]);

  setLocalInventory(inv);
  setLocalLifestyle(life);
  setLocalTrades(trd);
});
```

**Decision:** Use Option B for Phase 1 to minimize context changes. Refactor to Option A in Phase 2 if needed.

### 4.3 Verification
```bash
pnpm typecheck
# Navigate to http://localhost:3006/swipe and verify it loads
```

---

## 5. Phase 3: Rename Routes

### 5.1 Rename plan.tsx → me.tsx

**Step 1:** Git rename (preserves history)
```bash
git mv src/routes/plan.tsx src/routes/me.tsx
```

**Step 2:** Update file header comment
```tsx
// OLD:
/**
 * My Plan Page (plan.tsx)
 *
 * 7 tabs: Profile, Goals, Skills, Budget, Trade, Jobs (Prospection), Swipe
 * ...
 */

// NEW:
/**
 * Me Page (me.tsx)
 *
 * 5 tabs: Profile, Goals, Budget, Trade, Jobs
 * Swipe is now a standalone page at /swipe
 */
```

**Step 3:** Update TABS array (remove swipe, rename prospection)
```tsx
// OLD:
const TABS = [
  { id: 'profile', label: 'Profile', icon: 'User' },
  { id: 'goals', label: 'Goals', icon: 'Target' },
  { id: 'budget', label: 'Budget', icon: 'PiggyBank' },
  { id: 'trade', label: 'Trade', icon: 'Handshake' },
  { id: 'prospection', label: 'Jobs', icon: 'Compass' },
  { id: 'swipe', label: 'Swipe', icon: 'Dices' },
] as const;

// NEW:
const TABS = [
  { id: 'profile', label: 'Profile', icon: 'User' },
  { id: 'goals', label: 'Goals', icon: 'Target' },
  { id: 'budget', label: 'Budget', icon: 'PiggyBank' },
  { id: 'trade', label: 'Trade', icon: 'Handshake' },
  { id: 'jobs', label: 'Jobs', icon: 'Compass' },  // ← renamed from prospection
] as const;
```

**Step 4:** Remove SwipeTab import and TabsContent
```tsx
// REMOVE these lines:
const SwipeTab = lazy(() =>
  import('~/components/tabs/SwipeTab').then((m) => ({ default: m.SwipeTab }))
);

// REMOVE the TabsContent for swipe (around line 694-738)
<TabsContent value="swipe" class="mt-0">
  ...
</TabsContent>
```

**Step 5:** Update TabsContent value for jobs
```tsx
// OLD:
<TabsContent value="prospection" class="mt-0">

// NEW:
<TabsContent value="jobs" class="mt-0">
```

**Step 6:** Remove Dices from ICON_MAP (if not used elsewhere)
```tsx
const ICON_MAP = {
  User,
  Target,
  Briefcase,
  PiggyBank,
  Handshake,
  // Dices,  ← REMOVE (moved to /swipe)
  Compass,
};
```

**Step 7:** Update leads handling
Since leads are now in ProfileContext, update the ProspectionTab callback:
```tsx
// OLD:
onLeadsChange={setLeads}

// NEW:
onLeadsChange={(newLeads) => {
  // Use context setter
  const { setLeads } = useProfile();  // Get from context at component level
  setLeads(newLeads);
}}
```

**⚠️ Better approach:** Get `setLeads` from context at component level:
```tsx
export default function MePage() {
  const { setLeads } = useProfile();

  // ... later in JSX:
  <ProspectionTab
    onLeadsChange={setLeads}
    // ...
  />
}
```

### 5.2 Rename suivi.tsx → progress.tsx

**Step 1:** Git rename
```bash
git mv src/routes/suivi.tsx src/routes/progress.tsx
```

**Step 2:** Update file header
```tsx
// OLD:
/**
 * Suivi Page (suivi.tsx)
 *
 * Compact dashboard: Goal Hero + Missions + Energy + Financial Breakdown
 */

// NEW:
/**
 * Progress Page (progress.tsx)
 *
 * Compact dashboard: Goal Hero + Missions + Energy + Financial Breakdown
 * Renamed from suivi.tsx for clearer English naming.
 */
```

**Step 3:** Update internal references
Search for "suivi" in the file and update any self-references.

### 5.3 Rename index.tsx → chat.tsx (if applicable)

**Note:** The root `/` route might need special handling. Check `app.config.ts` and router setup.

**Option A:** Keep index.tsx but change the content/name
**Option B:** Create chat.tsx and make index.tsx redirect

For now, **keep index.tsx as-is** since `/` is the entry point. The nav will link to `/` with label "Chat".

### 5.4 Verification
```bash
pnpm typecheck
# Verify routes work:
# - /me loads (was /plan)
# - /progress loads (was /suivi)
# - /swipe loads (new)
```

---

## 6. Phase 4: Create Redirect Files

### 6.1 Create /plan redirect

**File:** `src/routes/plan.tsx` (recreate as redirect)

```tsx
/**
 * Redirect: /plan → /me
 *
 * Preserves backward compatibility for bookmarks and external links.
 * Handles tab parameter mapping (prospection → jobs, swipe → /swipe).
 */

import { Navigate, useSearchParams } from '@solidjs/router';

export default function PlanRedirect() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.tab;
  const action = searchParams.action;

  // Special case: swipe tab goes to standalone page
  if (tab === 'swipe') {
    return <Navigate href="/swipe" />;
  }

  // Map old tab names to new
  const tabMapping: Record<string, string> = {
    prospection: 'jobs',
    // Add others if needed
  };

  const newTab = tab ? (tabMapping[tab] || tab) : undefined;

  // Build new URL
  let newUrl = '/me';
  const params = new URLSearchParams();
  if (newTab) params.set('tab', newTab);
  if (action) params.set('action', action);

  const queryString = params.toString();
  if (queryString) {
    newUrl += `?${queryString}`;
  }

  // Preserve hash (e.g., #add-trade)
  if (typeof window !== 'undefined' && window.location.hash) {
    newUrl += window.location.hash;
  }

  return <Navigate href={newUrl} />;
}
```

### 6.2 Create /suivi redirect

**File:** `src/routes/suivi.tsx` (recreate as redirect)

```tsx
/**
 * Redirect: /suivi → /progress
 *
 * Preserves backward compatibility for bookmarks and external links.
 */

import { Navigate } from '@solidjs/router';

export default function SuiviRedirect() {
  return <Navigate href="/progress" />;
}
```

### 6.3 Verification
```bash
# Test redirects in browser:
# /plan → should go to /me
# /plan?tab=goals → should go to /me?tab=goals
# /plan?tab=swipe → should go to /swipe
# /plan?tab=prospection → should go to /me?tab=jobs
# /suivi → should go to /progress
```

---

## 7. Phase 5: Update Navigation Components

### 7.1 Update Sidebar.tsx

**File:** `src/components/layout/Sidebar.tsx`

```tsx
// OLD:
import { LayoutDashboard, Map, GraduationCap, Wrench } from 'lucide-solid';

const navItems = [
  { href: '/plan', label: 'My Plan', icon: LayoutDashboard },
  { href: '/suivi', label: 'Tracking', icon: Map },
];

// NEW:
import { MessageCircle, User, Dices, TrendingUp } from 'lucide-solid';

const navItems = [
  { href: '/', label: 'Chat', icon: MessageCircle },
  { href: '/me', label: 'Me', icon: User },
  { href: '/swipe', label: 'Swipe', icon: Dices },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
];
```

### 7.2 Update BottomNav.tsx

**File:** `src/components/layout/BottomNav.tsx`

Same changes as Sidebar.tsx.

### 7.3 Verification
```bash
# Visual check: navigation should show 4 items
# Click each item and verify correct page loads
```

---

## 8. Phase 6: Update All Deep Links

> **⚠️ VIGILANCE NETTOYAGE:** Cette phase est critique. Les URLs hardcodées dans les API endpoints (`chat.ts`, `tips.ts`) sont souvent oubliées car elles ne cassent pas la compilation. Vérifier **chaque fichier** listé, pas seulement ceux trouvés par grep.

### 8.1 Automated Search & Replace

**Pattern 1:** `/plan?tab=swipe` → `/swipe`
```bash
# Find all occurrences
grep -rn "/plan?tab=swipe\|/plan?\(.*\)tab=swipe" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/components/suivi/MissionList.tsx` | 278 | `href="/swipe"` |
| `src/components/suivi/TimelineHero.tsx` | 98, 105 | `href="/swipe"` |
| `src/components/suivi/BrunoTips.tsx` | 283, 306, 318 | `href="/swipe"` |
| `src/components/EnergyTracker.tsx` | 94 | `href="/swipe"` |
| `src/components/chat/MCPUIRenderer.tsx` | 677 | `'/swipe'` |
| `src/config/onboardingTipRules.ts` | 402 | `href: '/swipe'` |
| `src/routes/api/tips.ts` | 240 | `href: '/swipe'` |
| `src/routes/api/chat.ts` | 1704 | `fallbackUrl: '/swipe'` |

**Pattern 2:** `/plan?tab=prospection` → `/me?tab=jobs`
```bash
grep -rn "/plan?tab=prospection" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/components/suivi/TimelineHero.tsx` | 112 | `href="/me?tab=jobs"` |
| `src/components/tabs/SkillsTab.tsx` | 480 | `href: '/me?tab=jobs'` |
| `src/config/onboardingTipRules.ts` | 417 | `href: '/me?tab=jobs'` |

**Pattern 3:** `/plan?tab=goals` → `/me?tab=goals`
```bash
grep -rn "/plan?tab=goals" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/routes/progress.tsx` | 1050 | `navigate('/me?tab=goals&action=new')` |
| `src/components/suivi/BrunoTips.tsx` | 270 | `href: '/me?tab=goals'` |
| `src/components/EnergyTracker.tsx` | 85 | `href: '/me?tab=goals'` |

**Pattern 4:** `/plan?tab=trade` → `/me?tab=trade`
```bash
grep -rn "/plan?tab=trade" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/components/suivi/TimelineHero.tsx` | 119 | `href="/me?tab=trade#add-trade"` |

**Pattern 5:** `/plan?tab=skills` → `/me?tab=profile` (skills in profile now)
```bash
grep -rn "/plan?tab=skills" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/config/onboardingTipRules.ts` | 448 | `href: '/me?tab=profile'` |

**Pattern 6:** `/plan?tab=budget` → `/me?tab=budget`
```bash
grep -rn "/plan?tab=budget" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/config/onboardingTipRules.ts` | 464 | `href: '/me?tab=budget'` |

**Pattern 7:** `/plan` (without tab) → `/me`
```bash
grep -rn "href=\"/plan\"" --include="*.tsx" --include="*.ts" src/
grep -rn "navigate('/plan')" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/routes/progress.tsx` | 1037 | `href="/me"` |
| `src/components/chat/OnboardingChat.tsx` | 2406 | `navigate('/me')` |

**Pattern 8:** `/suivi` → `/progress`
```bash
grep -rn "/suivi" --include="*.tsx" --include="*.ts" src/
```

**Files to update:**
| File | Line | Change |
|------|------|--------|
| `src/components/SimulationControls.tsx` | 734 | `href="/progress"` |

### 8.2 API Endpoints - Vérification Manuelle Requise

> **⚠️ VIGILANCE:** Ces fichiers contiennent des URLs dans des **templates strings** qui peuvent échapper au grep. Ouvrir et vérifier manuellement.

**Fichier:** `src/routes/api/chat.ts`

Rechercher toutes les occurrences de routes dans les réponses du chat :
```bash
grep -n "'/plan\|/suivi\|My Plan\|Tracking" src/routes/api/chat.ts
```

**Patterns à rechercher manuellement dans chat.ts :**
- `fallbackUrl: '/plan'` → `fallbackUrl: '/me'` ou `'/swipe'`
- Messages type `"Go to My Plan"` → `"Go to Me"`
- Références au "Tracking page" → "Progress page"
- Template strings avec interpolation: `` `Check your ${tab} in /plan` ``

**Fichier:** `src/routes/api/tips.ts`

Même vérification pour les URLs dans les tips générés dynamiquement.

### 8.3 Verification
```bash
# Ensure no old routes remain
grep -rn "/plan" --include="*.tsx" --include="*.ts" src/ | grep -v "node_modules\|.vinxi\|plan.tsx"
grep -rn "/suivi" --include="*.tsx" --include="*.ts" src/ | grep -v "node_modules\|.vinxi\|suivi.tsx"

# Should only show the redirect files
```

---

## 9. Phase 7: Update Text Content

### 9.1 Replace "My Plan" → "Me"

**Files and locations:**

| File | Search | Replace |
|------|--------|---------|
| `src/routes/api/chat.ts` | `"My Plan"` | `"Me"` |
| `src/routes/progress.tsx` | `"My Plan"` | `"Me"` |
| `src/app.tsx` | `"My Plan"` | `"Me"` |
| `src/lib/achievements.ts` | `"My Plan"` | `"Me"` |
| `src/lib/chat/flow/flowController.ts` | `"My Plan"` | `"Me"` |
| `src/lib/chat/prompts/templates.ts` | `"My Plan"` | `"Me"` |
| `src/components/suivi/MissionList.tsx` | `"My Plan"` | `"Me"` |
| `src/components/chat/OnboardingChat.tsx` | `"My Plan"` | `"Me"` |

**Special case - OnboardingChat button:**
```tsx
// OLD:
Start My Plan

// NEW:
Let's Go
```

### 9.2 Replace "Tracking" → "Progress"

| File | Search | Replace |
|------|--------|---------|
| `src/routes/api/chat.ts` | `"Tracking"` | `"Progress"` |

### 9.3 Context-Aware Replacements

Some replacements need more thought:

```tsx
// OLD (chat.ts):
response = `⚡ I don't have energy data yet. Start by logging your energy on the Tracking page!`;

// NEW:
response = `⚡ I don't have energy data yet. Start by logging your energy on the **Progress** page!`;
```

```tsx
// OLD (chat.ts):
response = `Your plan is ready in **My Plan**! There you can:...

// NEW:
response = `Your profile is ready in **Me**! There you can:...
```

### 9.4 Verification
```bash
# Search for any remaining "My Plan" references
grep -rn "My Plan" --include="*.tsx" --include="*.ts" src/ | grep -v "node_modules"

# Should return 0 results (except maybe comments)
```

---

## 10. Phase 8: Update Achievements System

### 10.1 Update completedTabs Count

**File:** `src/lib/achievements.ts`

```tsx
// OLD (line ~155):
{
  id: 'explorer',
  name: 'Explorer',
  description: 'You completed all tabs in My Plan',
  icon: '🗺️',
  condition: 'completedTabs.length === 6',
  points: 50,
},

// NEW:
{
  id: 'explorer',
  name: 'Explorer',
  description: 'You completed all tabs in Me',
  icon: '🗺️',
  condition: 'completedTabs.length === 5',  // ← Changed from 6 to 5
  points: 50,
},
```

### 10.2 Verification
```bash
# Test achievement unlock with 5 completed tabs
```

---

## 11. Phase 9: Update CLAUDE.md

**File:** `CLAUDE.md`

Update the "3 Screens Navigation" section:

```markdown
### 4 Screens Navigation
- **Screen 0** (`/` or `/chat`): Onboarding chat with Bruno avatar → becomes ongoing assistant
- **Screen 1** (`/me`): 5 tabs (Profile, Goals, Budget, Trade, Jobs)
- **Screen 2** (`/swipe`): Standalone Swipe scenarios page
- **Screen 3** (`/progress`): Dashboard with timeline, energy history, missions
```

Also update any references to file paths in the "Monorepo Structure" section.

---

## 12. Phase 10: Testing & Quality Assurance

### 12.1 Automated Tests
```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Unit tests
pnpm --filter @stride/mcp-server test

# If frontend tests exist:
pnpm --filter @stride/frontend test
```

### 12.2 Manual E2E Testing Checklist

| Test Case | Expected Result | ✓ |
|-----------|-----------------|---|
| Visit `/` | Onboarding/Chat page loads | |
| Complete onboarding | Redirects to `/me` (not /plan) | |
| Visit `/me` | Me page with 5 tabs loads | |
| Click each tab in `/me` | Profile, Goals, Budget, Trade, Jobs all work | |
| Visit `/swipe` | Swipe page loads with scenarios | |
| Complete swipe session | Redirects to `/progress` | |
| Visit `/progress` | Progress dashboard loads | |
| Visit `/plan` | Redirects to `/me` | |
| Visit `/plan?tab=swipe` | Redirects to `/swipe` | |
| Visit `/plan?tab=goals` | Redirects to `/me?tab=goals` | |
| Visit `/plan?tab=prospection` | Redirects to `/me?tab=jobs` | |
| Visit `/suivi` | Redirects to `/progress` | |
| Check navigation (desktop) | Shows Chat, Me, Swipe, Progress | |
| Check navigation (mobile) | Shows 4 items in bottom nav | |
| Check deep links from Progress | All links go to correct pages | |
| Check deep links from Chat | All links go to correct pages | |
| Unlock "Explorer" achievement | Triggers at 5 tabs completed | |

### 12.3 Production Build
```bash
pnpm build

# Check for errors in build output
# Look for:
# - Missing imports
# - Route resolution errors
# - Type errors
```

---

## 13. Commit Strategy

### 13.1 Atomic Commits (Recommended)

```bash
# Commit 1: ProfileContext extension
git add src/lib/profileContext.tsx
git commit -m "feat(context): add leads to ProfileContext for Swipe page"

# Commit 2: New Swipe page
git add src/routes/swipe.tsx
git commit -m "feat(routes): create standalone Swipe page"

# Commit 3: Route renames
git add src/routes/me.tsx src/routes/progress.tsx
git commit -m "refactor(routes): rename plan→me, suivi→progress"

# Commit 4: Redirect files
git add src/routes/plan.tsx src/routes/suivi.tsx
git commit -m "feat(routes): add redirects for backward compatibility"

# Commit 5: Navigation updates
git add src/components/layout/Sidebar.tsx src/components/layout/BottomNav.tsx
git commit -m "refactor(nav): update to Chat/Me/Swipe/Progress structure"

# Commit 6: Deep link updates
git add -A
git commit -m "refactor(links): update all internal links to new routes"

# Commit 7: Text content
git add -A
git commit -m "refactor(copy): rename My Plan→Me, Tracking→Progress"

# Commit 8: Achievements & docs
git add src/lib/achievements.ts CLAUDE.md docs/restructured.md
git commit -m "chore: update achievements count and documentation"
```

### 13.2 Single Commit (Alternative)

If you prefer one commit:
```bash
git add -A
git commit -m "feat(nav): restructure navigation to Chat/Me/Swipe/Progress

BREAKING CHANGE: Routes renamed
- /plan → /me (redirects in place)
- /suivi → /progress (redirects in place)
- /plan?tab=swipe → /swipe (standalone page)

Changes:
- Add leads to ProfileContext for Swipe integration
- Create standalone /swipe page
- Update navigation to 4 main items
- Update all internal links
- Update achievements from 6 to 5 tabs

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## 14. Rollback Procedure

If critical issues found after deployment:

```bash
# Option 1: Revert to tag
git checkout pre-restructure-backup
git checkout -b hotfix/revert-restructure
git push origin hotfix/revert-restructure

# Option 2: Revert commits (if atomic commits used)
git revert HEAD~8..HEAD  # Revert last 8 commits

# Option 3: Quick fix - restore redirect files to original routes
# This keeps new structure but makes old URLs work
```

---

## 15. Post-Implementation Tasks

### 15.1 Immediate
- [ ] Monitor error logs for 404s on old routes
- [ ] Check analytics for broken user journeys
- [ ] **Vérifier que refreshLeads() est appelé** quand on arrive sur `/swipe` après avoir quitté `/me?tab=jobs`
- [ ] **Tester les messages du chat** avec tous les scénarios (swipe advice, tracking advice, etc.) pour confirmer les URLs

### 15.2 Phase 2 (Future)
- [ ] Add badge to Swipe nav item showing pending scenarios
- [ ] Move inventory/lifestyle/trades to ProfileContext
- [ ] Consider extracting large files (me.tsx ~700 lines, progress.tsx ~1000 lines)

### 15.3 Documentation
- [ ] Update any external documentation
- [ ] Update README if it mentions routes

---

## Appendix: Full File List

| Action | File |
|--------|------|
| **CREATE** | `src/routes/swipe.tsx` |
| **RENAME** | `src/routes/plan.tsx` → `src/routes/me.tsx` |
| **RENAME** | `src/routes/suivi.tsx` → `src/routes/progress.tsx` |
| **CREATE** | `src/routes/plan.tsx` (redirect) |
| **CREATE** | `src/routes/suivi.tsx` (redirect) |
| **MODIFY** | `src/lib/profileContext.tsx` |
| **MODIFY** | `src/components/layout/Sidebar.tsx` |
| **MODIFY** | `src/components/layout/BottomNav.tsx` |
| **MODIFY** | `src/routes/api/chat.ts` |
| **MODIFY** | `src/routes/api/tips.ts` |
| **MODIFY** | `src/components/suivi/MissionList.tsx` |
| **MODIFY** | `src/components/suivi/TimelineHero.tsx` |
| **MODIFY** | `src/components/suivi/BrunoTips.tsx` |
| **MODIFY** | `src/components/EnergyTracker.tsx` |
| **MODIFY** | `src/components/SimulationControls.tsx` |
| **MODIFY** | `src/components/tabs/SkillsTab.tsx` |
| **MODIFY** | `src/components/chat/OnboardingChat.tsx` |
| **MODIFY** | `src/components/chat/MCPUIRenderer.tsx` |
| **MODIFY** | `src/config/onboardingTipRules.ts` |
| **MODIFY** | `src/lib/achievements.ts` |
| **MODIFY** | `src/lib/chat/flow/flowController.ts` |
| **MODIFY** | `src/lib/chat/prompts/templates.ts` |
| **MODIFY** | `src/app.tsx` |
| **MODIFY** | `CLAUDE.md` |
