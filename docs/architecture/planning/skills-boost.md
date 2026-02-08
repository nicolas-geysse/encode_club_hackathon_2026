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

### Phase 1: Fix orphan skill names + add regression guard -- DONE

**Status:** DONE (commit `5169bbc`)

**Goal:** All skill names in field mappings must match SKILL_REGISTRY entries exactly. Add a unit test to prevent orphans from ever returning.

**Files modified:**
- `skillsByField.ts` -- Fixed 7 orphan names
- `skillSuggestionEngine.ts` -- Exported `HARD_TO_START_SKILLS` and `EASY_TO_START_SKILLS` for test
- New: `frontend/src/lib/data/__tests__/skillDataIntegrity.test.ts` -- 334 assertions

**Changes applied:**
| Field | Old (orphan) | New (registry match) | Note |
|-------|-------------|---------------------|------|
| education | "Educational materials translation" | "Freelance translation / localization" | cross-dup w/ humanities OK |
| engineering | "CAD/CAM support" | "Python" | only remaining eng skill in registry |
| health | "Medical document translation" | "Support group / peer-to-peer support facilitation" | avoids dup w/ Medical transcription |
| services | "Menu / tourism materials translation" | "Local tour guide / virtual tours" | avoids dup w/ Travel reviews |
| other | "General virtual assistant" | "Virtual assistant" | alias fix |
| social_sciences | "Online community moderation" | "Content moderation" | alias fix |
| sciences | "Data entry and cleaning" | "Data entry" | alias fix |

**Test coverage (334 assertions):**
- Every SKILLS_BY_FIELD name exists in SKILL_REGISTRY
- No intra-field duplicates
- All SKILL_REGISTRY.fields reference valid field keys
- All FIELD_CONNECTIONS reference valid fields
- All HARD/EASY_TO_START_SKILLS reference valid registry names

**Deviation from plan:** 3 replacements changed from original plan because they would have created intra-field duplicates (engineering already had "3D modeling / CAD", health already had "Medical transcription", services already had "Travel reviews / content writing").

### Phase 2: Always show metadata in SkillMultiSelect -- DONE

**Status:** DONE (commit `e7baaed`)

**Goal:** Remove compact mode -- always show stars, hourly rate, and field match badge for all skills.

**Files modified:**
- `SkillMultiSelect.tsx` -- Removed `compact` prop entirely

**Changes applied:**
1. Removed `compact` prop from `SkillChipProps` interface
2. Removed `<Show when={!props.compact}>` wrapper around metadata row -- stars, hourly rate, and field match badge now always render
3. Removed dead ternary `props.compact ? 'text-sm' : 'text-sm'` (was a no-op)
4. "Autres options" section already had 2-col grid and star header from first edit pass

### Phase 3: Bridge skills registry to prospection categories -- DONE

**Status:** DONE (commit `fe251fe`)

**Goal:** Replace the generic `categorySkillMap` in `jobScoring.ts` with a mapping derived from the actual skill registry.

**Files modified:**
- `jobScoring.ts` -- Rewrote `matchSkillsToCategory()` to delegate to bridge
- New: `frontend/src/lib/data/skillCategoryBridge.ts` -- Category bridge + utilities

**Changes applied:**
1. Created `CATEGORY_BRIDGE` mapping 9 registry categories → 12 prospection IDs
2. Added `SKILL_OVERRIDES` for 15 individual skill exceptions (e.g. SQL Coaching → tutoring)
3. Built lazy-init `Map<skillName, Set<prospectionCategoryId>>` from SKILL_REGISTRY
4. Scoring: 0 matches = 0, 1 match = 0.4, 2 matches = 0.7, 3+ = 1.0
5. Exported `getMatchingProspectionCategories()` for future "Recommended for you" badges
6. `matchSkillsToCategory` in jobScoring.ts now delegates to bridge (was hardcoded generic keywords)

### Phase 4: Enrich Services and Other field connections -- DONE

**Status:** DONE (commit `e3a8c75`)

**Goal:** No field should have zero strong connections in the knowledge graph. Fix `getSkillSuggestions('other')` to stop dumping all 87 skills.

**Files modified:**
- `skillsByField.ts` -- Updated FIELD_CONNECTIONS + fixed `getSkillSuggestions`
- `skillSuggestionEngine.ts` -- Fixed `getFieldMatch` and `getEnhancedSkillSuggestions` to treat `'other'` as a real field

**Changes applied:**
1. `services` connections: `strong: [] → ['business']`, added `social_sciences` to medium
2. `other` connections: `medium: [] → ['business', 'services']`
3. `getSkillSuggestions('other')`: now uses primary (8 skills) + medium connections (~4) instead of all 87
4. `getEnhancedSkillSuggestions('other')`: removed `field !== 'other'` guard -- now adds primary skills + connections + universal = ~16 curated skills
5. `getFieldMatch('other')`: removed `field === 'other'` early return -- skills in the `other` list now get `primary` match (score 5) instead of `general` (score 2)

### Phase 5: Expand MCP job-matcher database + fix bugs -- DONE

**Status:** DONE (commit `becdc79`)

**Goal:** Align the MCP job-matcher with the 87-skill registry and 12 prospection categories so Bruno's chat advice is relevant. Fix scoring bugs.

**Files modified:**
- `mcp-server/src/agents/job-matcher.ts` -- Expanded database + fixed 4 bugs
- `frontend/src/lib/jobScoring.ts` -- Aligned MAX_HOURLY_RATE

**Changes applied:**
1. **Bug fixes:**
   - `job.networking === 'fort'` → `'high'` (networking boost never fired)
   - `job.cvImpact === 'fort'`/`'moyen'` → `'high'`/`'medium'` (compare tool scoring broken)
   - `mcdo` reference → `fastfood` (actual job ID in database)
   - Frontend `MAX_HOURLY_RATE`: 25 → 30 (aligned with MCP's `MAX_HOURLY_RATE_EUROS = 30`)
2. **JOB_DATABASE expanded:** 8 → 20 jobs covering all 12 prospection categories:
   - Digital: freelance_dev, social_media, data_entry, content_creator, graphic_design, translator
   - Tutoring: tutoring, music_lessons
   - Campus: campus_it, research_assistant
   - Physical: waiter, babysitting, pet_sitting, cleaning, handyman, delivery
   - Events: events
   - Beauty/wellness: fitness_coach
   - Retail: mystery_shopping
   - Reference: fastfood
3. **Skills arrays use registry names** (e.g. `'Freelance web development'` instead of `'web'`)
4. **Skill matching improved**: exact + partial name comparison (was strict `toLowerCase().includes()`)
5. **Each job tagged with `category`** matching prospection category IDs

### Phase 6: Improve accessibility scoring coverage -- DONE

**Status:** DONE (commit `86e30d7`)

**Goal:** Cover at least 80% of skills with explicit accessibility scores.

**Files modified:**
- `skillSuggestionEngine.ts` -- Expanded both maps from 34 → 74 skills (85% coverage)

**Changes applied:**
- HARD_TO_START_SKILLS: 15 → 31 entries (+16)
  - Portfolio-dependent: Python, JavaScript, Video editing, Basic data analysis, Digital illustration, Chatbot creation
  - Equipment barrier: On-demand 3D printing
  - Expertise/credibility: UX research, Technical writing, Scientific proofreading, Lead generation, Smart home, Medical transcription, Cultural content writing, Support groups, Online simulator
  - Moderate barrier (explicit confirmation of computed score): Electronics repair, Voice-over, Food photography, Academic coaching, Workshop facilitation, Competitive analysis, Virtual event organization
- EASY_TO_START_SKILLS: 19 → 33 entries (+14)
  - Can start today: Cleaning, Mystery shopping
  - Teaching: Guitar, Piano, Online fitness/yoga
  - Services: Canva templates, Social media (organic brands), Travel itinerary, Airbnb management
  - Platform-based: Interview transcription, Surveys
  - Moderate barrier (explicit confirmation): Social media (SMEs), Community management, Debugging/QA, Task automation, Excel, SQL Coaching
- Remaining 13 uncovered skills all compute reasonable scores via the formula

### Phase 7: Chat integration -- Bruno uses skill context -- DONE

**Status:** DONE (commit `2913df4`)

**Goal:** When Bruno gives tips in the Jobs tab, use the user's actual skill arbitrage scores and the bridge mapping to give personalized advice.

**Files modified:**
- `mcp-server/src/agents/strategies/jobs.strategy.ts` -- Enhanced prompt context + new `deriveMatchingCategories` method
- `mcp-server/src/agents/strategies/tab-prompts.ts` -- Updated JOBS_SYSTEM_PROMPT

**Changes applied:**
1. `formatContextForPrompt` now sorts skills by arbitrage score (highest first)
2. Derives matching prospection categories from skill names via keyword matching (13 category rules)
3. Prompt context now includes: `"Matching job categories: Digital & Remote: matches Freelance web development, Python"`
4. System prompt updated to instruct Bruno to reference actual skill names, categories, and platforms
5. `JOBS_SYSTEM_PROMPT` in tab-prompts.ts aligned with the strategy's `getSystemPrompt()`

**Note:** The MCP server doesn't import the frontend's skill registry, so category derivation uses keyword matching on skill names rather than the `skillCategoryBridge.ts` bridge. This is intentional to keep the packages decoupled.

### Phase 8: Cross-file string integrity validation -- DONE

**Status:** DONE (commit `9f216ad`)

**Goal:** Close the critical risk identified by Gemini: 4 files using exact string matching need CI-level validation to prevent silent "ghost skills".

**Files modified:**
- `frontend/src/lib/data/__tests__/skillDataIntegrity.test.ts` -- Extended with 3 new test suites (+69 tests = 446 total)
- `frontend/src/lib/data/skillCategoryBridge.ts` -- Exported `SKILL_OVERRIDES` and `CATEGORY_BRIDGE`
- New: `scripts/verify-skills-data.ts` -- Cross-package validation script

**Changes applied:**
1. **Frontend vitest** (446 tests):
   - `SKILL_OVERRIDES` keys → `SKILL_REGISTRY` (17 skill names validated)
   - `SKILL_OVERRIDES` values → valid `PROSPECTION_CATEGORIES` IDs
   - `CATEGORY_BRIDGE` values → valid `PROSPECTION_CATEGORIES` IDs
2. **Cross-package script** (`npx tsx scripts/verify-skills-data.ts`):
   - Validates `SKILLS_BY_FIELD`, `SKILL_OVERRIDES`, `HARD/EASY_TO_START_SKILLS`, and MCP `JOB_DATABASE` skills against the canonical `SKILL_REGISTRY`
   - MCP skills are mirrored as constants (packages are decoupled)
   - Exit code 1 on any orphan — ready for CI integration

**Coverage:** All 4 files identified by Gemini are now validated:
| File | Validation |
|------|------------|
| `skillRegistry.ts` | Source of truth (87 skills) |
| `skillsByField.ts` | vitest (Phase 1) |
| `skillCategoryBridge.ts` | vitest (Phase 8) |
| `job-matcher.ts` | cross-package script (Phase 8) |

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
Phase 8 (integrity)         ←── depends on Phase 3 + 5 (validates their output)
```

**Execution order:** 1 → 2 → 4 → 6 → 3 → 5 → 7 → 8

Rationale: data integrity first (Phase 1), then UX (Phase 2), then standalone data fixes (4, 6), then the two medium-complexity phases that depend on clean data (3, 5), chat integration (7), then cross-file integrity validation as safety net (8).

---

## Verification

### Per-phase checks

```bash
# After each phase
pnpm typecheck && pnpm build:frontend && pnpm build:mcp

# After Phase 1 / Phase 8
cd packages/frontend && npx vitest run skillDataIntegrity  # 446 tests

# Cross-package integrity (Phase 8)
npx tsx scripts/verify-skills-data.ts  # validates all 4 files

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

The unit test (`skillDataIntegrity.test.ts`, 446 assertions) runs in CI and catches:
- Any new skill added to `SKILLS_BY_FIELD` that doesn't exist in `SKILL_REGISTRY`
- Any skill rename in registry that wasn't propagated to field mappings
- Any `SKILL_OVERRIDES` key (bridge) that doesn't match a registry skill
- Any prospection category ID in bridge or overrides that doesn't match `PROSPECTION_CATEGORIES`
- Any `HARD/EASY_TO_START_SKILLS` referencing a non-existent skill

The cross-package script (`scripts/verify-skills-data.ts`) additionally validates:
- MCP `JOB_DATABASE` skill arrays against the frontend's `SKILL_REGISTRY`
- Can be added to CI: `npx tsx scripts/verify-skills-data.ts`
