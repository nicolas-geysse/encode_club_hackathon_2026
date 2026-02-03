# Sprint Pre-Final - Demo Polish & Value Demonstration

## Executive Summary

**Date**: 2026-02-03
**Status**: Planning
**Priority**: High - Hackathon Demo Readiness

This sprint addresses 4 critical areas before the hackathon demo:
1. **Bruno's Catch-up Advice** - Contextual guidance on tracking page
2. **Performance Optimization** - Page transition slowdowns
3. **Opik Value Demonstration** - Concrete use cases for judges
4. **Agent Unification** - Proactive, unified multi-agent experience

---

## P0: Bruno's Contextual Catch-up Advice

### Problem
When user is "8% behind schedule" on `/suivi`, the Catch-up button exists but Bruno doesn't proactively explain **what to do**.

### Current State
```
TimelineHero.tsx:328-338
├─ Shows "X% behind schedule" alert (amber)
├─ Shows "Catch-up" button
└─ NO contextual advice from Bruno
```

### Solution: Enhance BrunoTips with Catch-up Detection

**Location**: `packages/frontend/src/components/suivi/BrunoTips.tsx`

**Implementation**:
1. Pass `behindPercent` from `suivi.tsx` to `BrunoTips`
2. Add catch-up specific local tip generation
3. Create `catch-up` tip category with amber styling
4. When behind + high energy: "Perfect time to boost hours"
5. When behind + low energy: "Rest first, strategic catch-up later"

**New Tip Logic** (add to `generateLocalTips()`):
```typescript
// Catch-up advice when behind schedule
if (behindPercent > 0) {
  const catchUpTip = {
    id: 'catch-up-strategy',
    category: 'catch-up' as const,
    title: behindPercent > 15
      ? 'Time to accelerate'
      : 'Small adjustment needed',
    message: currentEnergy > 70
      ? `You're ${behindPercent}% behind but energy is good. Add ${Math.ceil(behindPercent / 5)} extra hours this week to Trade or high-earning missions.`
      : `You're ${behindPercent}% behind. Focus on rest today, then tackle quick-win Trade scenarios tomorrow.`,
    action: currentEnergy > 70
      ? { label: 'View Trade Scenarios', href: '/plan?tab=trade' }
      : { label: 'Check Energy Tips', href: '#energy' },
  };
  tips.unshift(catchUpTip); // Priority position
}
```

**Props Addition** (suivi.tsx → BrunoTips):
```typescript
<BrunoTips
  // ... existing props
  behindPercent={Math.max(0, Math.round(timeProgress() - amountProgress()))}
/>
```

### Acceptance Criteria
- [ ] When behind schedule, Bruno's first tip addresses catch-up strategy
- [ ] Advice adapts to energy level (high = act now, low = rest first)
- [ ] Action button navigates to relevant section (Trade, Swipe, etc.)
- [ ] Works with both local and AI-generated tips

---

## P1: Performance Optimization

### Problem
Strong slowdowns between page transitions (`/` → `/plan` → `/suivi`).

### Root Cause Analysis

**Suspected Bottlenecks**:

1. **Heavy Component Trees** (per route analysis):
   | Route | Bundle Size | Components | Suspected Issue |
   |-------|-------------|------------|-----------------|
   | `/plan` | 243kb | 7 tabs, charts, forms | Tab pre-rendering |
   | `/suivi` | 94kb | Dashboard, timeline, charts | Multiple API calls on mount |
   | `/` | 125kb | Chat, avatar, forms | LLM intent detection |

2. **API Calls on Mount**:
   ```
   suivi.tsx onMount:
   ├─ GET /api/profiles (profile data)
   ├─ GET /api/goals (goal data)
   ├─ POST /api/tips (multi-agent, 2-15s!)
   ├─ GET /api/energy-debt (algorithm)
   └─ GET /api/comeback-detection (algorithm)
   ```

3. **No Route Prefetching**: SolidStart doesn't prefetch on hover

4. **Heavy Re-renders**: Large reactive graphs in tabs

### Solutions

#### P1.1: Lazy Load Heavy Tabs
**File**: `packages/frontend/src/routes/plan.tsx`

```typescript
// Before: All tabs loaded immediately
import { ProspectionTab } from '~/components/tabs/ProspectionTab';
import { SwipeTab } from '~/components/tabs/SwipeTab';

// After: Lazy load non-default tabs
const ProspectionTab = lazy(() => import('~/components/tabs/ProspectionTab'));
const SwipeTab = lazy(() => import('~/components/tabs/SwipeTab'));
const TradeTab = lazy(() => import('~/components/tabs/TradeTab'));
```

#### P1.2: Defer Non-Critical API Calls
**File**: `packages/frontend/src/routes/suivi.tsx`

```typescript
// Before: All calls on mount
onMount(async () => {
  await Promise.all([fetchProfile(), fetchGoals(), fetchTips()]);
});

// After: Prioritize visible content
onMount(async () => {
  // Critical: Show page structure immediately
  await fetchProfile();
  await fetchGoals();

  // Deferred: Tips can load after paint
  setTimeout(() => fetchTips(), 100);
});
```

#### P1.3: Add Loading Skeletons
**New Component**: `packages/frontend/src/components/ui/Skeleton.tsx`

```typescript
export function CardSkeleton() {
  return (
    <div class="animate-pulse bg-muted rounded-lg h-32" />
  );
}

// Usage in BrunoTips
<Show when={loading()} fallback={<CardSkeleton />}>
  <TipCard tip={currentTip()} />
</Show>
```

#### P1.4: Reduce Tips API Timeout
**File**: `packages/frontend/src/routes/api/tips.ts`

```typescript
// Before: Full orchestration (15s timeout)
const ORCHESTRATION_TIMEOUT = 15000;

// After: Aggressive timeout for demo responsiveness
const ORCHESTRATION_TIMEOUT = 5000; // 5s max, fallback to Level 2
```

### Performance Targets
| Metric | Current | Target |
|--------|---------|--------|
| `/plan` first paint | ~2s | <800ms |
| `/suivi` first paint | ~1.5s | <600ms |
| Tips load | 2-15s | <5s (with fallback) |
| Tab switch | ~500ms | <200ms |

---

## P2: Opik Value Demonstration

### Current Tracing Coverage

| Component | Traced | Feedback Scores | Demo Value |
|-----------|--------|-----------------|------------|
| Chat API | ✅ Full | ✅ Hybrid eval | HIGH |
| Tips Orchestrator | ✅ Full | ✅ User feedback | HIGH |
| Job Matcher | ✅ Tools | Partial | MEDIUM |
| Budget Coach | ✅ Tools | Partial | MEDIUM |
| Algorithms | ❌ None | ❌ None | LOW |
| API Routes | Partial | ❌ None | LOW |

### High-Value Demo Use Cases

#### Use Case 1: Chat Quality Monitoring (STRONGEST)
**Story**: "When students ask Bruno questions, Opik ensures answers are safe and actionable."

**Demo Flow**:
1. Open Opik dashboard → `chat.onboarding` traces
2. Show trace with nested spans:
   - `intent_detection` (confidence score)
   - `profile_loading` (student context)
   - `response_generation` (LLM details)
   - `hybrid_evaluation` (safety + quality scores)
3. Click on feedback scores:
   - `evaluation.heuristic_score`: 0.85
   - `evaluation.llm_score`: 0.92
   - `evaluation.final_score`: 0.88
4. Show filtered view: "All traces with score < 0.7" (quality alerts)

**Value Statement**: "Every chat response is automatically evaluated for safety and quality. We catch problematic responses before students see them."

#### Use Case 2: Multi-Agent Orchestration Tracing (IMPRESSIVE)
**Story**: "4 AI agents collaborate to generate personalized tips. Opik shows the full pipeline."

**Demo Flow**:
1. Open Opik → `tips.orchestrator` traces
2. Show nested agent spans:
   ```
   tips.orchestrator (12.5s)
   ├─ tips.energy_debt_detection (0.2s)
   ├─ tips.parallel_agents (5.1s)
   │  ├─ agent.budget_coach (4.8s)
   │  └─ agent.job_matcher (5.1s)
   ├─ agent.strategy_comparator (3.2s)
   ├─ agent.guardian (2.1s)
   └─ tips.llm_generation (2.0s)
   ```
3. Show input/output for each agent
4. Show fallback handling: "When agent times out, system gracefully degrades"

**Value Statement**: "Multi-agent systems are complex. Opik gives us X-ray vision into every decision."

#### Use Case 3: Prompt Regression Detection (TECHNICAL)
**Story**: "When we update prompts, Opik helps us detect quality regressions."

**Demo Flow**:
1. Show traces with `prompt.version` metadata
2. Filter by version: `prompt.version = v50-50-50-50`
3. Compare metrics across versions
4. Show: "Version A had 0.85 avg score, Version B dropped to 0.72 - regression detected"

**Value Statement**: "Prompt engineering is trial and error. Opik makes it scientific."

#### Use Case 4: User Feedback Loop (BUSINESS VALUE)
**Story**: "Students rate tips with 👍/👎. This data improves our agents."

**Demo Flow**:
1. Show `/api/feedback` endpoint receiving user feedback
2. Show Opik dashboard with feedback scores:
   - `feedback.helpful`: 1 (thumbs up)
   - `feedback.rating`: 5/5
3. Filter: "Tips with low ratings" → identify weak spots
4. Show correlation: "Budget tips get 4.2/5, Job tips get 3.8/5 → improve Job Matcher"

**Value Statement**: "Real user feedback closes the loop. We know exactly which features to improve."

### Gaps to Address for Demo

1. **Add tracing to Swipe decisions** (high visibility feature)
2. **Add tracing to Job Scoring** (shows personalization working)
3. **Create Opik dashboard screenshots** for slides
4. **Prepare 2-3 "interesting" traces** to show live

### Quick Wins for Demo

```typescript
// Add to jobScoring.ts - scoreJobsForProfile()
import { trace } from '~/lib/opik';

export function scoreJobsForProfile(jobs, profile) {
  return trace('scoring.job_batch', async (ctx) => {
    ctx.setAttributes({
      'scoring.jobs_count': jobs.length,
      'scoring.has_preferences': !!profile.swipePreferences,
      'scoring.preference_version': getPreferenceVersion(profile.swipePreferences),
    });

    const scored = jobs.map(job => scoreJob(job, profile));

    ctx.setOutput({
      'scoring.top_score': scored[0]?.score,
      'scoring.avg_score': scored.reduce((a, b) => a + b.score, 0) / scored.length,
    });

    return scored;
  });
}
```

---

## P3: Agent Unification & Proactivity

### Current Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CURRENT STATE                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /api/tips ────► Tips Orchestrator ────► 4 Agents          │
│                      │                    │                 │
│                      │                    ├─ Budget Coach   │
│                      │                    ├─ Job Matcher    │
│                      │                    ├─ Strategy Comp  │
│                      │                    └─ Guardian       │
│                      │                                      │
│                      └─► Single tip output                  │
│                                                             │
│  /api/chat ────► Onboarding Agent ────► Profile extraction │
│                                                             │
│  /api/agent ───► Generic (unused in frontend)              │
│                                                             │
│  DORMANT: Money Maker, Projection ML, Daily Briefing       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Problems

1. **Fragmented Invocation**: Each page calls agents independently
2. **Reactive Only**: Agents wait for user action, never proactive
3. **No Cross-Panel Insights**: Budget analysis doesn't inform Jobs tab
4. **Dormant Agents**: Money Maker, Projection ML never called
5. **No Agent Memory**: Each call starts fresh, no conversation context

### Vision: Unified Agent Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    TARGET STATE                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           UNIFIED AGENT CONTEXT LAYER               │   │
│  │                                                     │   │
│  │  Profile + Energy + Goals + Budget + Skills + Jobs  │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │         PROACTIVE TRIGGER ENGINE            │   │   │
│  │  │                                             │   │   │
│  │  │  - Behind schedule? → Catch-up agent        │   │   │
│  │  │  - Energy low? → Rest recommendation        │   │   │
│  │  │  - New skill? → Job opportunity scan        │   │   │
│  │  │  - Goal achieved? → Celebration + next goal │   │   │
│  │  │                                             │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐            │
│    │  Tips   │     │  Chat   │     │  Alerts │            │
│    │ (suivi) │     │ (onboard)│    │ (global)│            │
│    └─────────┘     └─────────┘     └─────────┘            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Roadmap

#### Phase 1: Unified Context Store (P3.1)
**Create shared agent context accessible from all pages**

```typescript
// packages/frontend/src/lib/agentContext.ts
export interface AgentContext {
  profile: Profile;
  energy: { current: number; history: EnergyEntry[]; debt: EnergyDebt | null };
  goals: { progress: number; behind: number; weeklyTarget: number };
  budget: { margin: number; status: string };
  skills: string[];
  lastAnalysis: {
    budgetCoach: BudgetAnalysis | null;
    jobMatcher: JobMatchResult | null;
    timestamp: number;
  };
}

// Singleton store, hydrated on app load
export const agentContext = createStore<AgentContext>({...});

// Reactive updates from profile changes
createEffect(() => {
  const profile = activeProfile();
  if (profile) {
    agentContext.setProfile(profile);
    agentContext.setEnergy({...});
  }
});
```

#### Phase 2: Proactive Trigger Engine (P3.2)
**Background checks that spawn agent advice**

```typescript
// packages/frontend/src/lib/proactiveTriggers.ts
export function initProactiveTriggers() {
  // Check every 30 seconds
  setInterval(async () => {
    const ctx = agentContext;

    // Trigger 1: Behind schedule + high energy
    if (ctx.goals.behind > 10 && ctx.energy.current > 70) {
      showProactiveAlert({
        agent: 'catch-up-advisor',
        title: 'Good energy! Time to catch up?',
        message: `You're ${ctx.goals.behind}% behind but feeling strong.`,
        action: { label: 'See catch-up plan', href: '/suivi#comeback' },
      });
    }

    // Trigger 2: New skill detected → scan jobs
    if (ctx.skills !== lastSkills) {
      const newSkills = ctx.skills.filter(s => !lastSkills.includes(s));
      if (newSkills.length > 0) {
        showProactiveAlert({
          agent: 'job-matcher',
          title: `New skill: ${newSkills[0]}!`,
          message: 'Want me to find matching opportunities?',
          action: { label: 'Scan jobs', href: '/plan?tab=jobs' },
        });
      }
    }

    // Trigger 3: Energy debt threshold
    if (ctx.energy.debt?.detected && ctx.energy.debt.severity === 'high') {
      showProactiveAlert({
        agent: 'guardian',
        title: 'Energy debt critical',
        message: 'Your goals have been auto-adjusted. Focus on rest.',
        action: { label: 'See adjustments', href: '/plan?tab=goals' },
      });
    }
  }, 30000);
}
```

#### Phase 3: Cross-Panel Agent Insights (P3.3)
**Share agent analysis across tabs**

```typescript
// When Budget tab analyzes margin, store result
// packages/frontend/src/components/tabs/BudgetTab.tsx
const budgetAnalysis = await analyzeBudget(profile);
agentContext.setLastAnalysis('budgetCoach', budgetAnalysis);

// Jobs tab can use this without re-calling agent
// packages/frontend/src/components/tabs/ProspectionTab.tsx
const budgetInsight = agentContext.lastAnalysis.budgetCoach;
if (budgetInsight?.status === 'deficit') {
  // Prioritize high-paying jobs
  scoringWeights.rate += 0.1;
}
```

#### Phase 4: Global Alert System (P3.4)
**Proactive notifications across the app**

```typescript
// packages/frontend/src/components/ProactiveAlerts.tsx
export function ProactiveAlerts() {
  const [alerts, setAlerts] = createSignal<ProactiveAlert[]>([]);

  onMount(() => {
    // Subscribe to proactive trigger events
    window.addEventListener('proactive-alert', (e) => {
      setAlerts(prev => [...prev, e.detail]);
    });
  });

  return (
    <div class="fixed bottom-4 right-4 space-y-2 z-50">
      <For each={alerts()}>
        {(alert) => (
          <AlertCard
            alert={alert}
            onDismiss={() => dismissAlert(alert.id)}
            onAction={() => handleAction(alert)}
          />
        )}
      </For>
    </div>
  );
}
```

### Quick Win for Demo: Wake Up Dormant Agents

**Money Maker on Trade Tab**:
```typescript
// packages/frontend/src/components/tabs/TradeTab.tsx
// Add "AI Suggestion" button that calls Money Maker
const suggestSideHustles = async () => {
  const result = await fetch('/api/agent', {
    method: 'POST',
    body: JSON.stringify({
      agentType: 'money-maker',
      message: 'Suggest side hustles based on my skills',
      profileId,
    }),
  });
  // Display suggestions in panel
};
```

**Projection ML on Goals Tab**:
```typescript
// packages/frontend/src/components/tabs/GoalsTab.tsx
// Add "Predict graduation balance" widget
const predictBalance = async () => {
  const result = await fetch('/api/agent', {
    method: 'POST',
    body: JSON.stringify({
      agentType: 'projection-ml',
      message: 'Predict my graduation balance',
      profileId,
    }),
  });
  // Show projection chart
};
```

---

## Sprint Summary

| Priority | Objective | Effort | Demo Impact |
|----------|-----------|--------|-------------|
| **P0** | Bruno catch-up advice | 2h | HIGH - User sees contextual guidance |
| **P1** | Performance optimization | 3h | HIGH - Smooth demo experience |
| **P2** | Opik value demonstration | 2h | HIGH - Judges see LLMOps value |
| **P3** | Agent unification | 4h+ | MEDIUM - Future architecture |

### Recommended Order
1. **P0**: Quick win, immediate user value
2. **P1.4**: Reduce tips timeout (fast fix)
3. **P2**: Prepare Opik demo traces
4. **P1.1-P1.3**: Lazy loading, skeletons
5. **P3**: Time permitting, add proactive triggers

### Definition of Done
- [ ] Bruno gives catch-up advice when behind schedule
- [ ] Page transitions feel snappy (<1s)
- [ ] 3 Opik use cases ready to demo with real traces
- [ ] At least 1 proactive agent trigger implemented

---

## Appendix: Files Reference

### P0 (Bruno Advice)
- `packages/frontend/src/components/suivi/BrunoTips.tsx` - Add catch-up logic
- `packages/frontend/src/routes/suivi.tsx` - Pass behindPercent prop

### P1 (Performance)
- `packages/frontend/src/routes/plan.tsx` - Lazy load tabs
- `packages/frontend/src/routes/suivi.tsx` - Defer API calls
- `packages/frontend/src/routes/api/tips.ts` - Reduce timeout

### P2 (Opik)
- `packages/mcp-server/src/services/opik.ts` - Tracing infrastructure
- `packages/frontend/src/lib/opik.ts` - Frontend tracing
- `packages/frontend/src/lib/jobScoring.ts` - Add scoring traces

### P3 (Agents)
- `packages/mcp-server/src/agents/` - All agent definitions
- `packages/frontend/src/routes/api/tips.ts` - Orchestrator entry
- NEW: `packages/frontend/src/lib/agentContext.ts` - Unified context
- NEW: `packages/frontend/src/lib/proactiveTriggers.ts` - Trigger engine
