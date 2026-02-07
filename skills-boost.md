# Skills Boost Sprint

> Consolidate the Skills pipeline end-to-end: from onboarding selection to Jobs tab scoring to Bruno chat recommendations.

## Current State Audit

### Architecture Overview

```
Onboarding SkillMultiSelect
   ↓ reads from
skillSuggestionEngine.ts  (stars, Bruno's picks)
   ↓ uses
skillsByField.ts          (11 fields, 6-8 skills each, knowledge graph)
skillRegistry.ts          (87 skills, 9 categories, full attributes)
   ↓ selected skills saved to DuckDB
SkillsTab.tsx             (CRUD, arbitrage score display)
   ↓ skills passed as string[] to
ProspectionTab.tsx → jobScoring.ts (score jobs 1-5 stars)
   ↓ job-matcher agent (MCP)
Bruno chat tips → jobs.strategy.ts
```

### Key Files

| File | Lines | Role |
|------|-------|------|
| `frontend/src/lib/data/skillRegistry.ts` | 1157 | 87 skills, 9 categories, full attributes |
| `frontend/src/lib/data/skillsByField.ts` | 292 | 11 fields + knowledge graph connections |
| `frontend/src/lib/data/skillSuggestionEngine.ts` | 363 | Stars, Bruno's picks, accessibility scoring |
| `frontend/src/components/chat/SkillMultiSelect.tsx` | 338 | Onboarding skill picker UI |
| `frontend/src/components/tabs/SkillsTab.tsx` | 1098 | Post-onboarding skill CRUD |
| `frontend/src/lib/jobScoring.ts` | 395 | Prospection job scoring (distance/profile/effort/rate/goal) |
| `frontend/src/config/prospectionCategories.ts` | 280 | 12 prospection categories (physical jobs) |
| `frontend/src/components/tabs/ProspectionTab.tsx` | ~800 | Jobs tab UI |
| `mcp-server/src/agents/job-matcher.ts` | 571 | MCP agent with hardcoded 8-job database |
| `mcp-server/src/algorithms/skill-arbitrage.ts` | 429 | Rate 30% + Demand 25% + Effort 25% + Rest 20% |

### Numbers

- **87** skills in registry across **9** categories
- **11** field mappings (+ `other`) with **6-8** skills each
- **6** universal always-added skills (tutoring, VA, data entry, babysitting, delivery, pet-sitting)
- **12** prospection categories for physical/local jobs
- **8** hardcoded jobs in MCP job-matcher agent
- **2** external job APIs (Remotive, Arbeitnow) for remote listings

---

## Identified Issues

### Issue 1: Compact mode hides stars and hourly rates

**File:** `SkillMultiSelect.tsx:228-239`

Skills with **3 stars or fewer** are shown in "compact" mode: just the name, no stars, no hourly rate, no field match badge. This makes the "Autres options" group feel like second-class afterthoughts with zero actionable info.

**Impact:** Users can't compare skills below the 4-star threshold. A 3-star skill at 25/h is hidden next to a 1-star at 10/h.

### Issue 2: Two disconnected job universes

**Frontend** `jobScoring.ts:326-349` has a **generic** `categorySkillMap`:
```typescript
digital: ['computer', 'typing', 'social media', 'writing', 'design', 'programming']
tutoring: ['teaching', 'math', 'science', 'languages', 'patience', 'communication']
```

These are **generic keywords** that don't match any of the 87 registry skill names. A user who selected "Freelance web development" gets zero match against `digital: ['computer', 'typing', ...]` because the matching is `includes()` on lowercased strings.

**MCP** `job-matcher.ts:27-127` has its own **hardcoded 8-job database** with skill arrays like `['python', 'javascript', 'sql', 'web']` -- also disconnected from the 87-skill registry.

**Impact:** Skills selected during onboarding have almost no effect on job recommendations.

### Issue 3: No skill-to-prospection-category bridge

`ProspectionTab` receives `userSkills` (an array of skill names from the profile), and `jobScoring.ts` receives them, but `matchSkillsToCategory()` maps against hardcoded generic terms, not the actual skill names from the registry.

There is **no mapping** from registry skills (e.g. "Freelance web development", "Copywriting / commercial writing") to prospection categories (e.g. "digital", "tutoring").

### Issue 4: Services and Other fields have weak/no graph connections

```typescript
services: { strong: [], medium: ['business', 'arts', 'humanities'] }
other:    { strong: [], medium: [] }
```

Students in Services or Other get zero strong-connection skills. Only medium-connection skills (1 per field) are added. The `other` field literally adds nothing from connected fields.

### Issue 5: Orphan skill names in SKILLS_BY_FIELD

Several names in `SKILLS_BY_FIELD` don't match any skill in `SKILL_REGISTRY`:
- `"Educational materials translation"` (education field) -- not in registry
- `"CAD/CAM support"` (engineering field) -- not in registry
- `"Medical document translation"` (health field) -- not in registry
- `"Menu / tourism materials translation"` (services field) -- not in registry
- `"General virtual assistant"` (other field) -- registry has `"Virtual assistant"`
- `"Online community moderation"` (social_sciences field) -- registry has `"Content moderation"`
- `"Data entry and cleaning"` (sciences field) -- registry has `"Data entry"`

These orphans get `accessibility: 3` (default) and `hourlyRate: 15` (fallback) instead of their real values.

### Issue 6: MCP job-matcher is static and limited

Only 8 jobs: Freelance Dev, Tutoring, Data Entry, Community Manager, Research Assistant, Translator, Content Creator, Fast-food.

**Missing entirely:** All physical/local job types (service, retail, cleaning, childcare, events, campus) that the ProspectionTab covers. When Bruno gives job advice via chat, he can only reference these 8 generic options.

### Issue 7: Accessibility scoring has coverage gaps

`HARD_TO_START_SKILLS` has 16 skills, `EASY_TO_START_SKILLS` has 21 skills. That's 37/87 = 42% covered. The remaining 50 skills fall through to the computed formula `(6 - cognitiveEffort + marketDemand) / 2`, which is a rough approximation.

### Issue 8: Diploma requirements are minimal

Only 6 skills have diploma requirements defined. Skills like "Junior cybersecurity" require bachelor, "Freelance translation" requires master. But many other skills that arguably need credentials (medical transcription, scientific proofreading, etc.) are not gated.

### Issue 9: MCP job-matcher bug -- French string comparison

**File:** `job-matcher.ts:166`

```typescript
if (input.prioritizeNetworking && job.networking === 'fort') {
```

The code checks `'fort'` (French) but the JOB_DATABASE uses `'high'`/`'medium'`/`'low'` (English). The networking boost **never fires**.

### Issue 10: Rate normalization mismatch

- `skill-arbitrage.ts` (MCP): `MAX_HOURLY_RATE_EUROS = 30` -- a 25/h skill scores 0.83
- `jobScoring.ts` (frontend): `MAX_HOURLY_RATE = 25` -- the same 25/h job scores 1.0

Same rate, different scores depending on which system evaluates it. Creates inconsistency between SkillsTab arbitrage scores and ProspectionTab job scores.

### Issue 11: `getSkillSuggestions('other')` dumps all 87 skills

**File:** `skillsByField.ts:227`

When field is `'other'`, the function returns `getAllSkills()` -- all 87 skills in a flat list with no ordering, no field match scoring, no Bruno's picks. This overwhelms the user with an unsorted wall of skills.

---

## Improvement Plan

### Phase 1: Fix orphan skill names + add regression guard

**Goal:** All skill names in field mappings must match SKILL_REGISTRY entries exactly. Add a unit test to prevent orphans from ever returning.

**Files:**
- `skillsByField.ts` -- Fix 7 orphan names
- New: `frontend/src/lib/data/__tests__/skillDataIntegrity.test.ts` -- Regression guard

**Changes:**
| Field | Current (orphan) | Fix (registry match) | Note |
|-------|------------------|---------------------|------|
| education | "Educational materials translation" | "Freelance translation / localization" | cross-dup w/ humanities OK |
| engineering | "CAD/CAM support" | "Python" | only remaining eng skill in registry |
| health | "Medical document translation" | "Support group / peer-to-peer support facilitation" | avoids dup w/ Medical transcription |
| services | "Menu / tourism materials translation" | "Local tour guide / virtual tours" | avoids dup w/ Travel reviews |
| other | "General virtual assistant" | "Virtual assistant" | alias fix |
| social_sciences | "Online community moderation" | "Content moderation" | alias fix |
| sciences | "Data entry and cleaning" | "Data entry" | alias fix |

**Unit test** (prevents regression):
```typescript
import { SKILLS_BY_FIELD } from '../skillsByField';
import { SKILL_REGISTRY } from '../skillRegistry';

test('every name in SKILLS_BY_FIELD exists in SKILL_REGISTRY', () => {
  const registryNames = new Set(SKILL_REGISTRY.map(s => s.name));
  for (const [field, skills] of Object.entries(SKILLS_BY_FIELD)) {
    for (const skill of skills) {
      expect(registryNames.has(skill)).toBe(true);
      // ↑ Fails fast with: "Urban gardening..." not found in registry
    }
  }
});
```

**Estimate:** Small

### Phase 2: Always show metadata in SkillMultiSelect

**Goal:** Remove compact mode -- always show stars, hourly rate, and field match badge for all skills.

**Files:**
- `SkillMultiSelect.tsx` -- Remove `compact` prop usage in rest group, always render metadata row

**Changes:**
1. Remove `compact` prop from SkillChip in the "Autres options" group
2. Add star header for "Autres options" section (show range, e.g. "1-3 stars")
3. Use 2-col grid for rest group (same as 4-star/5-star)

**Estimate:** Small

### Phase 3: Bridge skills registry to prospection categories

**Goal:** Replace the generic `categorySkillMap` in `jobScoring.ts` with a mapping derived from the actual skill registry.

**Files:**
- `jobScoring.ts` -- Rewrite `matchSkillsToCategory()` to use skill registry
- New: `frontend/src/lib/data/skillCategoryBridge.ts` -- Mapping table

**Approach:**
1. Create a mapping from registry skill categories to prospection category IDs
2. Each registry category maps to 1-2 prospection categories:
   - `tech` → `digital`, `campus`
   - `creative` → `digital`, `events`
   - `teaching` → `tutoring`, `campus`
   - `writing` → `digital`
   - `services` → `service`, `events`, `campus`
   - `physical` → `childcare`, `cleaning`, `handyman`
   - `business` → `digital`, `events`, `interim`
   - `health` → `cleaning`, `childcare` (wellness focus)
3. `matchSkillsToCategory` now:
   - Looks up each user skill name in `SKILL_REGISTRY` to get its `category`
   - Checks if that category maps to the prospection category being scored
   - Returns a match ratio based on how many of the user's skills are relevant
4. Bonus: surface "Recommended for you" badge on prospection categories that match user skills

**Estimate:** Medium

### Phase 4: Enrich Services and Other field connections

**Goal:** No field should have zero strong connections in the knowledge graph. Fix `getSkillSuggestions('other')` to stop dumping all 87 skills.

**Files:**
- `skillsByField.ts` -- Update FIELD_CONNECTIONS + fix `getSkillSuggestions`

**Changes:**
```typescript
services: { strong: ['business'], medium: ['arts', 'humanities', 'social_sciences'] }
other:    { strong: [], medium: ['business', 'services'] }
```

Fix `getSkillSuggestions('other')` to use medium connections + universal skills instead of `getAllSkills()`:
```typescript
// Before: if (!field || field === 'other') return getAllSkills();
// After:  if (field === 'other') use medium connections like any other field
//         if (!field) return getAllSkills();  // only for truly undefined
```

**Estimate:** Small

### Phase 5: Expand MCP job-matcher database + fix bugs

**Goal:** Align the MCP job-matcher with the 87-skill registry and 12 prospection categories so Bruno's chat advice is relevant. Fix the `'fort'` vs `'high'` networking bug.

**Files:**
- `mcp-server/src/agents/job-matcher.ts` -- Expand JOB_DATABASE, fix networking comparison

**Approach:**
1. **Bug fix:** Change `job.networking === 'fort'` to `job.networking === 'high'` (line 166)
2. Add jobs for each prospection category (12 categories = ~15-20 jobs total)
3. Use skill names from the registry in `skills` arrays (not generic terms like `'web'`)
4. Add proper arbitrage metrics (marketDemand, cognitiveEffort, restNeeded)
5. Include platform suggestions from prospection categories
6. Normalize `MAX_HOURLY_RATE` to 30/h (align with skill-arbitrage.ts, not 25/h)

**Estimate:** Medium

### Phase 6: Improve accessibility scoring coverage

**Goal:** Cover at least 80% of skills with explicit accessibility scores.

**Files:**
- `skillSuggestionEngine.ts` -- Expand HARD_TO_START_SKILLS and EASY_TO_START_SKILLS

**Approach:**
1. Audit remaining 50 unscored skills
2. Add explicit scores for skills where the formula gives wrong results
3. Particularly: all physical skills should be easy (4-5), most consulting should be hard (2-3)

**Estimate:** Small

### Phase 7: Chat integration -- Bruno uses skill context

**Goal:** When Bruno gives tips in the Jobs tab, use the user's actual skill arbitrage scores and the bridge mapping to give personalized advice.

**Files:**
- `mcp-server/src/agents/strategies/jobs.strategy.ts` -- Enhance prompt context
- `mcp-server/src/agents/strategies/tab-prompts.ts` -- Add skill-to-category suggestions

**Approach:**
1. Include user's top-scoring skills (by arbitrage score) in the prompt
2. Include which prospection categories match those skills
3. Include the user's min hourly rate vs their skill's potential rates
4. Bruno can now say: "Your web dev skills match the Digital & Remote category -- have you checked those listings?"

**Estimate:** Medium

---

## Phase Dependencies

```
Phase 1 (orphans + test)    ←── standalone, DATA INTEGRITY FIRST
Phase 2 (SkillMultiSelect)  ←── standalone (but better after Phase 1 fixes data)
Phase 3 (bridge)            ←── depends on Phase 1
Phase 4 (field connections)  ←── standalone
Phase 5 (MCP jobs + bugs)   ←── depends on Phase 1
Phase 6 (accessibility)     ←── standalone
Phase 7 (chat)              ←── depends on Phase 3 + 5
```

**Execution order:** 1 → 2 → 4 → 6 → 3 → 5 → 7

Rationale: data integrity first (Phase 1), then UX (Phase 2), then standalone data fixes (4, 6), then the two medium-complexity phases that depend on clean data (3, 5), finally chat integration that depends on both (7).

---

## Verification

### Per-phase checks

```bash
# After each phase
pnpm typecheck && pnpm build:frontend && pnpm build:mcp

# After Phase 1 specifically
pnpm --filter @stride/frontend vitest run skillDataIntegrity

# After Phase 5
pnpm --filter @stride/mcp-server test
```

### End-to-end visual checks

After all phases:
1. **Onboarding:** Select "Master" + "Services" → verify skills show stars + rates (not compact)
2. **Onboarding:** Select "Other" → verify curated list (not 87 unsorted skills)
3. **Skills tab:** Add "Freelance web development" → check arbitrage score displays
4. **Jobs tab:** With web dev skill → "Digital & Remote" category should rank higher
5. **Chat (Jobs tab):** Bruno references actual user skills and suggests relevant categories

### Regression guard

The unit test from Phase 1 (`skillDataIntegrity.test.ts`) runs in CI and catches:
- Any new skill added to `SKILLS_BY_FIELD` that doesn't exist in `SKILL_REGISTRY`
- Any skill rename in registry that wasn't propagated to field mappings
