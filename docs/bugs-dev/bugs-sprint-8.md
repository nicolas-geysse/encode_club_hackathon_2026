# Sprint 8: Bug Fixes & UX Improvements

## Sprint 8 Status: ✅ COMPLETE

**Date**: 2026-01-19
**Focus**: 8 bug fixes + 3 features identified from Opik traces analysis

---

## Summary

| Type | Count | Status |
|------|-------|--------|
| CRITICAL Bugs | 1 | ✅ Fixed |
| HIGH Bugs | 3 | ✅ Fixed |
| MEDIUM Bugs | 4 | ✅ Fixed |
| Features | 3 | ✅ Implemented |

---

## Phase 1: Bug A - Missions Empty on First Load (CRITICAL)

### Problem
`/suivi` shows "No missions" until page refresh. The `existingFollowup` check was skipping mission generation when followup data existed but had empty missions array.

### File
`packages/frontend/src/routes/suivi.tsx` (lines 207-352)

### Fix
```typescript
// Added check for empty missions even when followup exists
const needsMissionGeneration =
  !existingFollowup ||
  !existingFollowup.missions ||
  existingFollowup.missions.length === 0;

if (existingFollowup && !needsMissionGeneration) {
  setFollowup(normalizeFollowup(existingFollowup));
} else {
  // Generate missions...
  // Also preserve existing data (currentAmount, currentWeek, energyHistory)
}
```

### Verification
- [x] Missions appear on first load of `/suivi`
- [x] Existing followup data (currentAmount, energyHistory) preserved

---

## Phase 2: Bug D - SwipeTab Progress Bars (HIGH)

### Problem
Preference bars showed 100% for everything. Kobalte `<Progress>` expects values 0-1, but code was multiplying by 100.

### File
`packages/frontend/src/components/tabs/SwipeTab.tsx` (lines 291-319)

### Fix
```typescript
// Before
<Progress value={Math.round((preferences().effortSensitivity ?? 0.5) * 100)} />

// After
<Progress value={preferences().effortSensitivity ?? 0.5} />
```

### Verification
- [x] Progress bars show correct proportions (not all 100%)

---

## Phase 3: Bug B - Skills Quick Add Templates (HIGH)

### Problem
Quick Add templates (Python, SQL, JS) were visible even when user already had skills, due to race condition between `skillsLoadState` and actual skills loading.

### File
`packages/frontend/src/components/tabs/SkillsTab.tsx` (lines 220-281, 503-511)

### Fix
```typescript
// Added initialLoadComplete flag
const [initialLoadComplete, setInitialLoadComplete] = createSignal(false);

onMount(async () => {
  if (profile()?.id) {
    await refreshSkills();
  }
  setInitialLoadComplete(true);  // Only after skills loaded
});

// Show condition now requires initialLoadComplete
<Show when={
  initialLoadComplete() &&
  skillsLoadState() === 'loaded' &&
  SKILL_TEMPLATES.filter(...).length > 0
}>
```

### Verification
- [x] Quick Add templates hidden when user has skills
- [x] Templates only show after initial load completes

---

## Phase 4: Bug C - Borrowed Value Reset on Done (HIGH)

### Problem
`borrowedValue()` excluded completed borrows, so marking a borrow as "Done" reset the savings counter to 0.

### File
`packages/frontend/src/components/tabs/TradeTab.tsx` (lines 378-383)

### Fix
```typescript
// Before
.filter((t) => t.type === 'borrow' && t.status === 'active')

// After - completed borrows still count as savings achieved
.filter((t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed'))
```

### Verification
- [x] Borrowed value persists after marking "Done"

---

## Phase 5: Bugs E & F - GoalsTab (MEDIUM)

### Bug E: Deadline Not Displayed

**Problem**: `createEffect` was overwriting user edits because it didn't check if values were already set.

**Fix** (lines 134-154):
```typescript
// Only sync if current value is empty
const deadline = props.initialData?.goalDeadline;
if (deadline && !goalDeadline()) {
  setGoalDeadline(deadline);
}
```

### Bug F: Academic Events Not Editable

**Problem**: No Edit button for academic events.

**Fix**: Added `editAcademicEvent()` function + Pencil button (lines 236-246, 882-914):
```typescript
const editAcademicEvent = (event: AcademicEvent) => {
  setNewEvent({
    type: event.type,
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
  });
  setIsSameDay(event.startDate === event.endDate);
  removeAcademicEvent(event.id);  // Pre-fills form for re-adding
};
```

### Verification
- [x] Deadline displays correctly in form
- [x] Academic events have Edit (Pencil) button
- [x] Editing pre-fills form with event data

---

## Phase 6: Bug G - Borrow Value Extraction (MEDIUM)

### Problem
Regex didn't capture monetary value from patterns like "borrow camping gear from Alex (saving 50€)".

### File
`packages/frontend/src/lib/onboardingExtractor.ts` (lines 1300-1312)

### Fix
```typescript
// Before
/borrow\s+(.+?)\s+from\s+(\w+)/gi

// After - captures optional value in parentheses
/borrow\s+(.+?)\s+from\s+(\w+)(?:\s*\(?[^)]*?(\d+)[€$£]?[^)]*?\))?/gi

// Now extracts:
trades.push({
  type: 'borrow',
  description: match[1].trim(),
  withPerson: match[2].trim(),
  estimatedValue: match[3] ? parseInt(match[3], 10) : undefined,
});
```

### Verification
- [x] "borrow X from Y (saving 50€)" extracts estimatedValue: 50

---

## Phase 7: Bug H - Mission Hours for One-Time Tasks (MEDIUM)

### Problem
Sell/Pause missions showed "0/0h" progress, which is meaningless for one-time actions.

### File
`packages/frontend/src/components/suivi/MissionCard.tsx` (lines 130-156)

### Fix
```typescript
const ONE_TIME_CATEGORIES = ['selling', 'lifestyle', 'trade'];

<Show
  when={!ONE_TIME_CATEGORIES.includes(props.mission.category)}
  fallback={
    <span>{props.mission.status === 'completed' ? '✓ Done' : 'Pending'}</span>
  }
>
  <span>{props.mission.hoursCompleted}/{props.mission.weeklyHours}h</span>
</Show>
```

### Verification
- [x] Selling/Lifestyle/Trade missions show "Done" or "Pending" instead of hours

---

## Phase 8: Feature I - Karma for Lend/Trade

### Concept
Replace € value with karma counter for Lend/Trade actions to encourage circular economy.

### File
`packages/frontend/src/components/tabs/TradeTab.tsx` (lines 395-398, 559-572)

### Implementation
```typescript
// Karma = count of lend/trade actions (not pending)
const karmaScore = () =>
  trades().filter(
    (t) => (t.type === 'lend' || t.type === 'trade') && t.status !== 'pending'
  ).length;

// New purple card replaces orange "Lent" card
<Card class="border-purple-500/20 bg-purple-500/5">
  <CardContent class="p-6">
    <div class="text-sm text-purple-600 font-medium flex items-center gap-2">
      <Heart class="h-4 w-4" /> Karma
    </div>
    <div class="text-2xl font-bold">
      {karmaScore()} <span class="text-sm font-normal">actions</span>
    </div>
    <div class="text-xs text-purple-500 mt-1">
      Sharing economy contributions
    </div>
  </CardContent>
</Card>
```

### Verification
- [x] Purple Karma card displays action count
- [x] Lent € value removed (replaced by karma)

---

## Phase 9: Feature J - Delete Confirmation Dialogs

### Problem
Direct deletion without confirmation is risky UX.

### Files Modified
- `SwipeTab.tsx` - Scenario deletion
- `GoalsTab.tsx` - Academic events & commitments deletion

### Implementation Pattern
```typescript
// State
const [deleteConfirm, setDeleteConfirm] = createSignal<{id: string, name: string} | null>(null);

// Button triggers confirmation
<Button onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}>
  <Trash2 class="h-4 w-4" />
</Button>

// Dialog
<ConfirmDialog
  isOpen={!!deleteConfirm()}
  title="Delete item?"
  message={`Delete "${deleteConfirm()?.name}"?`}
  confirmLabel="Delete"
  variant="danger"
  onConfirm={() => { handleDelete(deleteConfirm()!.id); setDeleteConfirm(null); }}
  onCancel={() => setDeleteConfirm(null)}
/>
```

### Verification
- [x] SwipeTab: Scenario removal shows confirmation
- [x] GoalsTab: Academic event deletion shows confirmation
- [x] GoalsTab: Commitment deletion shows confirmation
- [x] SkillsTab: Already had ConfirmDialog (no change needed)

---

## Phase 10: Feature K - Goal Auto-Complete

### Problem
Users had to manually mark goals as completed even when progress reached 100%.

### File
`packages/frontend/src/components/tabs/GoalsTab.tsx` (lines 197-209)

### Implementation
```typescript
// Auto-complete effect
createEffect(() => {
  const currentGoals = goals();
  for (const goal of currentGoals) {
    if (goal.progress >= 100 && goal.status === 'active') {
      goalService.updateGoal({ id: goal.id, status: 'completed' }).then(() => {
        refreshGoals();
        toast.success('Goal achieved!', `"${goal.name}" has been completed!`);
      });
    }
  }
});
```

### Verification
- [x] Goals auto-mark as completed when progress >= 100%
- [x] Toast celebration shown

---

## Files Changed Summary

| Action | File | Changes |
|--------|------|---------|
| MODIFY | `routes/suivi.tsx` | Bug A: Mission generation logic |
| MODIFY | `components/tabs/SwipeTab.tsx` | Bug D: Progress values, Feature J: Delete confirm |
| MODIFY | `components/tabs/SkillsTab.tsx` | Bug B: initialLoadComplete flag |
| MODIFY | `components/tabs/TradeTab.tsx` | Bug C: borrowedValue filter, Feature I: Karma |
| MODIFY | `components/tabs/GoalsTab.tsx` | Bugs E/F: Deadline + Edit, Features J/K: Confirm + Auto-complete |
| MODIFY | `lib/onboardingExtractor.ts` | Bug G: Borrow value regex |
| MODIFY | `components/suivi/MissionCard.tsx` | Bug H: One-time mission display |

---

## Quality Verification

- [x] `pnpm lint` passes (0 errors, 0 warnings)
- [x] `pnpm typecheck` passes
- [x] `pnpm build` succeeds

---

## Insights from Opik Traces

The bugs were identified by analyzing Opik traces:

1. **Onboarding captures correctly**: "borrow camping gear from Alex (saving 50€)" was in traces, but `estimatedValue` wasn't extracted (Bug G)
2. **Skills present in profile**: ["python", "spanish", "playing the guimbarde"] visible in traces, but Quick Add still showed templates (Bug B)
3. **Deadline calculated correctly**: "2026-03-19" in traces, but form didn't display it (Bug E)
4. **Profile complete with all data**: The LLM extraction worked, issues were in frontend sync/display

---

# BACKLOG - Items Mis de Côté

## Reporté des Sprints Précédents

| Item | Sprint Origin | Priority | Reason Deferred |
|------|---------------|----------|-----------------|
| **Smart Follow-up Questions** | Sprint 6 | MEDIUM | Requires significant prompt engineering |
| **TD-3: City/Currency Detection** | Sprint 6 | LOW | Code golf, no user value |
| **TD-4: Smart Merge Helper** | Sprint 6 | LOW | Code golf, no user value |
| **Dark Mode** | Phase 3 | LOW | Not started, nice-to-have |
| **Export/Import Profiles** | Phase 4 | MEDIUM | Useful but not MVP |
| **Analytics Dashboard** | Phase 4 | LOW | Post-hackathon feature |
| **Mobile PWA** | Phase 4 | LOW | Post-hackathon feature |

## Tech Debt Identified

| Item | File | Effort | Notes |
|------|------|--------|-------|
| **TD-3: City/Currency Detection** | `OnboardingChat.tsx:979-1057` | ~30min | Extract to `lib/locationDetection.ts` |
| **TD-4: Smart Merge Helper** | `OnboardingChat.tsx:114-153` | ~20min | Extract to `lib/arrayUtils.ts` |
| **Component Tests** | `GoalsTab.tsx`, `TradeTab.tsx` | ~2h | Complex UI logic deserves tests |

## Sprint 9 Candidates

| Priority | Item | Rationale |
|----------|------|-----------|
| **HIGH** | Google free tier migration | Replace Groq (cost/reliability) |
| **HIGH** | Mastra + DuckDB vector store | RAG for personalized advice |
| **MEDIUM** | Opik traces analysis workflow | Continuous improvement from traces |
| **LOW** | Mobile responsiveness audit | Check new cards on mobile |

---

## Sprint History Quick Reference

| Sprint | Focus | Key Deliverables |
|--------|-------|------------------|
| **1** | Foundation | Profile persistence, DuckDB setup |
| **2** | Core features | Skill arbitrage, retroplanning |
| **3** | Stability | Error handling, fallbacks |
| **5** | Screen 2 | Timeline, Energy, Missions |
| **6** | Architecture | Toast system, persistence extraction |
| **7** | Quality | Unit tests, cumulative savings |
| **7.5** | Polish | TD-1 console.error → toast.error |
| **8** | UX Bugs | 8 bugs + 3 features (current) |

---

## Lessons Learned

1. **Opik traces are invaluable** for debugging frontend sync issues
2. **Race conditions** in SolidJS require explicit load-complete flags
3. **Kobalte components** expect normalized values (0-1 not 0-100)
4. **Circular economy UX** benefits from gamification (karma > euros)
5. **Confirmation dialogs** should be systematic for destructive actions
