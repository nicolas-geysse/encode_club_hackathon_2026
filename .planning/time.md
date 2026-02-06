# Time & Availability Audit

## Current State

### What Already Exists

| Feature | Where | Status |
|---------|-------|--------|
| `maxWorkHoursWeekly` | Onboarding step `work_preferences` | Collected, stored, used in retroplanning |
| Academic Events | Onboarding step `academic_events` (skippable) + Goals Tab | 6 event types with capacity multipliers |
| Current Commitments | Goals Tab ONLY (not in onboarding) | Recurring weekly hours (class, sport, club...) |
| Goal deadline min-date | `GoalForm.tsx`, `AcademicEventsSection.tsx`, `OnboardingFormStep.tsx` | All use `min={todayISO()}` |

### How Available Hours Flow

```
Onboarding "work_preferences" step
  → maxWorkHoursWeekly (default: 15h)
  → Stored in profiles.max_work_hours_weekly

Goals Tab
  → Academic Events: capacity multipliers per week (exam=0.2, vacation_available=1.5)
  → Commitments: hours_per_week subtracted from available time

Retroplanning Algorithm (retroplan.ts)
  → effectiveHours = min(maxWorkHoursWeekly, 25) * academicMultiplier
  → Used for week-by-week milestone calculation
```

### Where Hours Are Used

| Component | Uses `maxWorkHoursWeekly`? | Notes |
|-----------|---------------------------|-------|
| Retroplanning | YES | Core input for capacity calculation |
| Money Maker agent | YES | Estimates side hustle earnings |
| Strategy Comparator | YES | Calculates monthly gain |
| Job Matcher agent | PARTIAL | Has param but doesn't filter |
| Skill Arbitrage | NO | Only scores, ignores time budget |
| Job search (Prospection) | NO | No hour-based filtering |

---

## Issues Found

### Issue 1: Goal Deadline — Reported but NOT reproducible

All date inputs use `min={todayISO()}`:
- `GoalForm.tsx:275`
- `AcademicEventsSection.tsx:239`
- `OnboardingFormStep.tsx:880`

Possible causes for user seeing past dates:
- **Browser caching** old page version
- **Timezone edge case** around midnight (todayISO uses local time)
- **Edit mode** on an existing goal with a past deadline (existing value pre-filled)

**Action**: Verify in edit mode. If editing an existing goal that already has a past deadline, the DatePicker shows it but `min` should still prevent selecting a new past date.

### Issue 2: "Academic Events" naming is confusing

The label "Academic Events" suggests school activities only. The actual feature covers:
- Exam periods (reduced capacity)
- Vacation - rest (unavailable)
- Vacation - available to work (boosted capacity)
- Busy periods
- Internships
- Project deadlines

**Better names**: "Busy Periods", "Schedule Blocks", "Time Constraints", "Blocked Periods"

**Recommendation**: Rename to **"Busy Periods"** — short, clear, and covers all use cases.

### Issue 3: Event type doesn't auto-populate the name field

When selecting "Exam / Finals" as type, the name field stays empty. Users have to manually type "Exam period" etc.

**Fix**: Pre-fill name with the selected type's label. User can still modify it.

### Issue 4: Commitments are NOT in onboarding

Commitments (recurring weekly activities) are only accessible from the Goals Tab. Users never encounter them naturally. Since they directly reduce available hours, they should at minimum be mentioned.

**However**: Adding commitments to onboarding adds complexity. The `maxWorkHoursWeekly` field already captures the user's self-assessment of available time. Commitments are a more granular breakdown that power users can add later.

**Recommendation**: Keep commitments out of onboarding. The `maxWorkHoursWeekly` question ("How many hours can you work per week?") already captures this. Commitments serve as a refinement tool on the Goals Tab.

### Issue 5: Available hours not prominent enough

`maxWorkHoursWeekly` is buried in `work_preferences` step alongside `minHourlyRate`. It's a critical input that affects all planning but isn't highlighted.

---

## Proposed Sprint: Time UX Cleanup

**Scope**: Minimal, focused fixes for hackathon deadline. No architectural changes.

### Phase 1: Rename "Academic Events" (30 min)

**Files**:
- `packages/frontend/src/components/tabs/goals/AcademicEventsSection.tsx` — UI labels
- `packages/frontend/src/lib/chat/stepForms.ts` — onboarding form config
- `packages/frontend/src/lib/chat/prompts/templates.ts` — LLM prompt for step
- `packages/frontend/src/routes/api/chat.ts` — agent context labels

**Change**: "Academic Events" → "Busy Periods" everywhere in UI and prompts.

Keep the DuckDB table name `academic_events` (no migration needed).

### Phase 2: Auto-populate event name from type (15 min)

**Files**:
- `packages/frontend/src/components/tabs/goals/AcademicEventsSection.tsx` — Goals Tab form
- `packages/frontend/src/components/chat/OnboardingFormStep.tsx` — onboarding dynamic list

**Change**: When user selects event type (e.g. "Exam / Finals"), auto-fill name field with "Exam / Finals" (editable).

### Phase 3: Verify goal deadline in edit mode (15 min)

**Files**:
- `packages/frontend/src/components/tabs/goals/GoalForm.tsx`

**Check**: When editing an existing goal with past deadline, verify:
1. The form shows the existing (past) date
2. `min={todayISO()}` still prevents selecting a NEW past date
3. If the existing deadline is past, show a warning: "This deadline has passed"

### Phase 4: (SKIP for hackathon) Available hours integration

NOT recommended for hackathon. Would require:
- Filtering jobs by available hours
- Adding hours to skill arbitrage scoring
- Time budget visualization
- Commitment ↔ availability reconciliation

This is a post-hackathon feature. The current `maxWorkHoursWeekly` + retroplanning integration is sufficient for the demo.

---

## Decision Log

| Question | Decision | Rationale |
|----------|----------|-----------|
| Add "available hours" to onboarding? | Already exists (`work_preferences` step) | `maxWorkHoursWeekly` is collected |
| Add commitments to onboarding? | No | Too complex, `maxWorkHoursWeekly` covers it |
| Rename academic_events table? | No | Only rename UI labels, keep DB stable |
| Filter jobs by hours? | Post-hackathon | Adds complexity, scoring already considers effort |
| Add hours to prospection? | Post-hackathon | Would need major refactor of scoring pipeline |
