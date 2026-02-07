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

---

## Improvement Plan

### Phase 1: Always show metadata in SkillMultiSelect

**Goal:** Remove compact mode -- always show stars, hourly rate, and field match badge for all skills.

**Files:**
- `SkillMultiSelect.tsx` -- Remove `compact` prop usage in rest group, always render metadata row

**Changes:**
1. Remove `compact` prop from SkillChip in the "Autres options" group
2. Keep the section label "Autres options" but add star header like other groups
3. Possibly use 2-col grid for rest group (same as 4-star/5-star)

**Estimate:** Small

### Phase 2: Fix orphan skill names in SKILLS_BY_FIELD

**Goal:** All skill names in field mappings must match SKILL_REGISTRY entries exactly.

**Files:**
- `skillsByField.ts` -- Fix 7 orphan names

**Changes:**
| Field | Current (orphan) | Fix (registry match) |
|-------|------------------|---------------------|
| education | "Educational materials translation" | "Freelance translation / localization" |
| engineering | "CAD/CAM support" | "3D modeling / CAD" |
| health | "Medical document translation" | "Medical transcription" |
| services | "Menu / tourism materials translation" | "Travel reviews / content writing" |
| other | "General virtual assistant" | "Virtual assistant" |
| social_sciences | "Online community moderation" | "Content moderation" |
| sciences | "Data entry and cleaning" | "Data entry" |

**Estimate:** Small

### Phase 3: Bridge skills registry to prospection categories

**Goal:** Replace the generic `categorySkillMap` in `jobScoring.ts` with a mapping derived from the actual skill registry.

**Files:**
- `jobScoring.ts` -- Rewrite `matchSkillsToCategory()` to use skill registry
- New: `frontend/src/lib/data/skillCategoryBridge.ts` -- Mapping table

**Approach:**
1. Create a mapping from registry skill names/categories to prospection category IDs
2. Each registry category maps to 1-2 prospection categories:
   - `tech` → `digital`, `campus`
   - `creative` → `digital`, `events`
   - `teaching` → `tutoring`, `campus`
   - `writing` → `digital`
   - `services` → `service`, `events`, `campus`
   - `physical` → `childcare`, `cleaning`, `handyman`
   - `business` → `digital`, `events`, `interim`
   - `health` → `cleaning`, `childcare` (wellness focus)
3. `matchSkillsToCategory` now checks: does the user have skills in categories that map to this prospection category?
4. Bonus: surface "Recommended for you" categories based on user skills

**Estimate:** Medium

### Phase 4: Enrich Services and Other field connections

**Goal:** No field should have zero strong connections in the knowledge graph.

**Files:**
- `skillsByField.ts` -- Update FIELD_CONNECTIONS

**Changes:**
```typescript
services: { strong: ['business'], medium: ['arts', 'humanities', 'social_sciences'] }
other:    { strong: [], medium: ['business', 'services'] }
```

Also consider adding more skills to the `other` field since it's the catch-all.

**Estimate:** Small

### Phase 5: Expand MCP job-matcher database

**Goal:** Align the MCP job-matcher with the 87-skill registry and 12 prospection categories so Bruno's chat advice is relevant.

**Files:**
- `mcp-server/src/agents/job-matcher.ts` -- Expand JOB_DATABASE

**Approach:**
1. Add jobs for each prospection category (12 categories = ~15-20 jobs total)
2. Use skill IDs from the registry in `skills` arrays (not generic terms)
3. Add proper arbitrage metrics (marketDemand, cognitiveEffort, restNeeded)
4. Include platform suggestions from prospection categories

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
Phase 1 (SkillMultiSelect)  ←── standalone
Phase 2 (orphan fix)        ←── standalone
Phase 3 (bridge)            ←── depends on Phase 2
Phase 4 (field connections)  ←── standalone
Phase 5 (MCP jobs)          ←── depends on Phase 2
Phase 6 (accessibility)     ←── standalone
Phase 7 (chat)              ←── depends on Phase 3 + 5
```

Suggested execution order: 1 → 2 → 4 → 6 → 3 → 5 → 7

---

## Verification

```bash
# After each phase
pnpm typecheck && pnpm build:frontend && pnpm build:mcp

# MCP tests
pnpm --filter @stride/mcp-server test

# Visual checks
# - Onboarding: all skills now show stars + rates
# - Jobs tab: categories sorted by skill match
# - Chat: Bruno references actual skills
```
