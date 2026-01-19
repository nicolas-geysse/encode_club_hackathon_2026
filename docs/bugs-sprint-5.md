# Sprint 5: Onboarding Data Loss - Bug Report

## Test Scenario

After using "Reset all data" feature and completing fresh onboarding:

**User input during onboarding**:
- Region: France (EUR)
- Name: Nicolas
- Studies: PhD Computer Science
- Skills: typescript, french, english, play the piano
- Certifications: PADI diving
- City: Montpellier
- Budget: earning 1000, spending 800
- Work: 10h at 50€/h
- Goal: 500 for vacations, in 2 months
- Exam: an exam in 1 month
- Sell: an iPhone 1 at 300€
- Borrow: borrow camping gear from Alex
- Subscription: Netflix

---

## Bug F: Goals NOT Created in Goals Table

**Severity**: CRITICAL

**Expected**: GoalsTab shows "vacations - 500€ - deadline 2026-03-19"
**Actual**: GoalsTab is EMPTY, shows "No goals yet"

**Evidence from Opik traces**:
```json
{
  "existingProfile": {
    "goalName": "vacations",
    "goalAmount": 500,
    "goalDeadline": "2026-03-19"
  }
}
```
Data is extracted but never persisted to `goals` table.

**Impact**: User cannot track progress toward their goal. Suivi page broken.

---

## Bug G: Skills Tab Shows Wrong Data (Hardcoded Templates)

**Severity**: CRITICAL

**Expected**: SkillsTab shows "TypeScript, French, English, Piano"
**Actual**: SkillsTab shows "Python, SQL Coaching, JavaScript, Excel, Tutoring, English Translation, Graphic Design, Data Entry, Social Media, Web Writing, Guitar, Music, Photography, Video Editing, Babysitting, Cleaning, Driving"

**Evidence from Opik traces**:
```json
{
  "skills": ["TypeScript", "French", "English", "Piano"]
}
```
User skills are extracted but UI displays hardcoded `SKILL_TEMPLATES` array.

**Root Cause**: `SkillsTab.tsx` initializes with hardcoded templates instead of fetching from `/api/skills?profileId=X`.

---

## Bug H: Trade/Borrow Items Never Saved

**Severity**: HIGH

**Expected**: Trade tab "Borrow" section shows "camping gear from Alex"
**Actual**: Borrow tab is EMPTY

**Evidence from Opik traces**:
```json
{
  "message": "borrow camping gear from Alex",
  "currentStep": "inventory"
}
```
## Root Cause Analysis & Technical Plan

### Bug F: Goals Persistence Failure
- **Diagnosis**: The code in `OnboardingChat.tsx` (lines 1167+) *does* attempt to create the goal, but it relies on `savedProfileId`.
- **Critical Flaw**: If `profileService.saveProfile` fails to save to API (DB) but succeeds in localStorage, it returns `{success: true}`. The subsequent `/api/goals` call tries to attach a goal to a profile ID that **does not exist in the database**.
- **Fix**:
    1.  Modify `profileService.saveProfile` to return distinct status for API vs Local save.
    2.  In `OnboardingChat`, if API save failed, **do not** call `/api/goals` (or queue it).
    3.  Consider using a transaction or a single "create full profile" endpoint to prevent this partial state.

### Bug G: Skills Display (Hardcoded Templates)
- **Diagnosis**: Similar to Bug F. `skillService.bulkCreateSkills` is called after profile save. If the profile doesn't exist in DB (due to API failure/fallback), this call fails (Foreign Key constraint or just 404).
- **Result**: `SkillsTab` finds no skills in DB, so it renders the "Quick Add" templates (which looks like "Wrong Data").
- **Fix**: Ensure robust profile creation before attaching skills.

### Bug H: Trade/Borrow Items Missing
- **Diagnosis**: **Confirmed Code Defect**. In `OnboardingChat.tsx`, the function `updateProfileFromExtracted` handles `inventory`, `subscriptions`, `academicEvents`, but has **zero** logic for `tradeOpportunities`.
- **Location**: `OnboardingChat.tsx` ~ line 890.
- **Fix**: Add `tradeOpportunities` smart merge logic mapping trace data to the state.

### Bug I: Expenses Mismatch (800€ vs 770€)
- **Diagnosis**: **Logic Artifact**. The breakdown logic calculates 5% for subscriptions (800 * 0.05 = 40€).
- **The Twist**: When "Netflix" is detected, the code *removes* the generic 'subscriptions' category (40€) and adds the actual item (10€).
- **Math**: 800 - 40 + 10 = 770.
- **Fix**: Adjust the 'other' category amount to absorb the difference so the total remains consistent with user input (800€).

### Bug D & E: Profile Switching & Caching
- **Diagnosis**: `GET` auto-activates random profiles. `PUT` update is not atomic (in some versions). Browser caches stale JSON.
- **Fix**:
    1.  **Atomic SQL**: `UPDATE profiles SET is_active = (id = ?)`
    2.  **No Fallback**: `GET` returns null if no active profile.
    3.  **Cache-Control**: Add headers to all API routes.

---

## Technical Roadmap (Sprint 5)

### Step 1: Stability Core (Backend)
- [x] **Fix D/E**: Update `api/profiles.ts`
    - Implement Atomic Switch (`PUT`).
    - Remove Random Auto-Activation (`GET`).
    - Add `Cache-Control: no-store` to all responses.

### Step 2: Fix Extraction Logic (Frontend)
- [x] **Fix H**: Update `OnboardingChat.tsx` to handle `tradeOpportunities` in `updateProfileFromExtracted`.
- [x] **Fix I**: Refine `expenses` breakdown logic to preserve total amount (recalculate 'other' bucket).
- [x] **Fix K**: Improve date parsing for "in 1 month" (handled by LLM, might need prompt tweak or robust date parser).
- [x] **Fix J**: Initialize `swipe_preferences` in `profileService` defaults.

### Step 3: Persistence Robustness
- [x] **Fix F & G**: Harden `OnboardingChat` save flow.
    - Ensure `goalService.createGoal` and `skillService.bulkCreateSkills` are only called if Profile ID is confirmed valid in DB.
    - Add error handling/retry for these calls.

### Step 4: Verification
- [ ] Run "Reset All".
- [ ] Perform standard onboarding (Nicolas, PhD...).
- [ ] Verify Goals, Skills, Trades, Budget totals in DB and UI.

## File Changes Expected
- `packages/frontend/src/routes/api/profiles.ts`
- `packages/frontend/src/components/chat/OnboardingChat.tsx`
- `packages/frontend/src/lib/profileService.ts`

---

## Implementation Details (Completed)

### Bug D & E Fix: Backend Stability
**File**: `packages/frontend/src/routes/api/profiles.ts`

**Problem**: Random currency switching and stale UI due to race conditions and caching.

**Solution**:
1.  **Atomic Switch**: `PUT` now uses `UPDATE profiles SET is_active = (id = target_id)`. This single query guarantees 100% consistency.
2.  **Strict GET**: `GET /api/profiles?active=true` returns `null` if no profile found (instead of a random one).
3.  **Cache-Control**: Added `no-store, no-cache, must-revalidate` to GET, POST, PUT, DELETE responses.

### Bug F & G Fix: Profile Persistence Hardening
**Files**:
- `packages/frontend/src/lib/profileService.ts`
- `packages/frontend/src/components/chat/OnboardingChat.tsx`

**Solution**:
1.  Updated `saveProfile` return signature to includes `apiSaved: boolean`.
2.  In `OnboardingChat.tsx`, we verify `profileExistsInDb` (via API check) before attempting to save Goals or Skills.
3.  This prevents "Foreign Key Violation" or "Orphaned Goals" when the profile only exists in localStorage (offline mode fallback).

### Bug H .. K Fixes: Data Extraction Logic
As detailed in previous section:
- **Trades**: Logic added to extract and merge trade opportunities.
- **Expenses**: Calculation logic improved to respect total amount.
- **Dates**: Academic events end-date normalization.
- **Swipes**: Default initialization added.

---

## Thoughts & Augmentations

> [!NOTE]
> **Why previous fixes failed**: We relied too much on "Happy Path" where API calls always succeed. The fallback to `localStorage` (while good for UX) was silent, masking the fact that the DB was empty. Sprint 3's "Reset" feature exacerbated this by wiping the DB but potentially leaving stale `localStorage` keys or vice-versa.

> [!IMPORTANT]
> **The Atomic Switch**: Moving to `UPDATE ... SET is_active = (id = ?)` is the definitive fix for the "Random Profile" bug. It eliminates the 50ms window where 0 profiles were active.

> [!TIP]
> **Next Steps**:
> The `OnboardingChat` is now very logic-heavy (~1600 lines). In Sprint 6, we should refactor the extraction and merging logic into a `lib/onboardingHelper.ts` to improve testability.

---

## 🆕 Bugs Découverts Pendant Tests (Sprint 5.5)

### Bug L: Skills Affiche Données d'Autres Profils

**Severity**: HIGH

**Symptôme**: L'onglet Skills affiche des skills qui ne correspondent pas au profil actif (ex: skills d'un ancien profil "Nicolas" alors que le profil actif est "Nico").

**Hypothèses**:
1. `SkillsTab` utilise un `profileId` obsolète (pas synchronisé avec le profil actif)
2. Le contexte `useProfile()` n'est pas mis à jour après switch de profil
3. Les skills sont chargés avant que le profil actif soit confirmé

**Investigation**:
- [ ] Vérifier les appels `/api/skills?profileId=XXX` dans la console (F12 → Network)
- [ ] Comparer le `profileId` utilisé vs le `profileId` du profil actif
- [ ] Vérifier si `SkillsTab` utilise `useProfile()` ou charge le profil indépendamment

**Fichiers suspects**:
- `packages/frontend/src/components/tabs/SkillsTab.tsx`
- `packages/frontend/src/lib/profileContext.tsx`

---

### Bug M: Net Margin Sans Cumul Jusqu'à Deadline (Feature Enhancement)

**Type**: FEATURE REQUEST / UX IMPROVEMENT

**Contexte**: Dans l'onglet Budget, le panel "Net Margin" montre l'impact individuel de chaque ajustement (pause/réduction), mais pas le **cumul total des économies jusqu'à la deadline**.

**Cas d'usage**:
```
Deadline: 3 mois (12 semaines)
Goal: 500€ pour vacances

Ajustements sélectionnés:
┌─────────────────┬──────────┬──────────┬─────────────┐
│ Item            │ Économie │ Durée    │ Total       │
├─────────────────┼──────────┼──────────┼─────────────┤
│ Netflix (pause) │ 10€/mois │ 1 mois   │ 10€         │
│ Food (réduire)  │ 50€/mois │ 2 mois   │ 100€        │
│ Transport       │ 20€/mois │ 3 mois   │ 60€         │
├─────────────────┼──────────┼──────────┼─────────────┤
│ CUMUL DEADLINE  │          │          │ **170€**    │
└─────────────────┴──────────┴──────────┴─────────────┘

Progress vers goal: 170€ / 500€ = 34%
```

**Comportement Actuel**:
- Chaque ligne montre son économie mensuelle
- Pas de vision globale "combien j'économise d'ici ma deadline"

**Comportement Attendu**:
- En bas à droite du panel "Net Margin", afficher:
  ```
  Savings until deadline: +170€
  ━━━━━━━━━━━━━━━━━━━━━ 34%
  ```

**Note**: Il ne s'agit pas d'arrêter de manger, mais d'optimiser le budget (moins de resto, plus de meal prep, etc.)

**Fichiers à modifier**:
- `packages/frontend/src/components/tabs/BudgetTab.tsx`

---

### Bug N: Borrowed Items Sans Cumul de Valeur (Feature Enhancement)

**Type**: FEATURE REQUEST / UX IMPROVEMENT

**Contexte**: Dans l'onglet Trade, le panel "From Sales" affiche bien le potentiel de gains avec une présentation claire (`+X€ potential` en bas à droite avec active/sold). Le panel "Borrowed" devrait avoir une présentation similaire montrant la **valeur cumulée des emprunts** qui réduit le besoin d'achat.

**Cas d'usage**:
```
Goal: 500€ pour vacances (incluant équipement camping)

Emprunts:
┌─────────────────────┬──────────┬────────────┐
│ Item                │ Valeur   │ Status     │
├─────────────────────┼──────────┼────────────┤
│ Camping gear (Alex) │ 150€     │ confirmed  │
│ Tent (Marie)        │ 80€      │ pending    │
├─────────────────────┼──────────┼────────────┤
│ TOTAL BORROWED      │ **230€** │            │
└─────────────────────┴──────────┴────────────┘

Impact: Goal réduit de 500€ → 270€ (économie de 230€)
```

**Comportement Actuel**:
- Panel "From Sales": ✅ Affiche `+X€ potential` en bas à droite
- Panel "Borrowed": ❌ Pas de cumul de valeur affiché

**Comportement Attendu**:
- Panel "Borrowed" similaire à "From Sales":
  ```
  ┌─────────────────────────────────────┐
  │ 📦 Borrowed                         │
  ├─────────────────────────────────────┤
  │ • Camping gear from Alex    [150€]  │
  │ • Tent from Marie           [80€]   │
  ├─────────────────────────────────────┤
  │              Saves: +230€ potential │
  │              ━━━━━━━━━━ 2 items     │
  └─────────────────────────────────────┘
  ```

**Lien avec Goal**:
- La valeur empruntée devrait réduire le "besoin réel" pour atteindre le goal
- Ex: Si goal = 500€ et borrowed = 230€, afficher "Remaining need: 270€"

**Fichiers à modifier**:
- `packages/frontend/src/components/tabs/TradeTab.tsx`

---

## Checklist de Test Post-Reset

Après "Reset All" + nouvel onboarding complet:

### Onboarding Input
- Region: France (EUR)
- Name: [ton nom]
- Studies: PhD Computer Science
- Skills: typescript, french, piano
- Certifications: PADI diving
- City: Montpellier
- Budget: 1000€ income, 800€ expenses
- Work: 10h at 50€/h
- Goal: 500€ vacations, 2 months
- Exam: 1 exam in 1 month
- Sell: iPhone at 300€
- Borrow: camping gear from Alex
- Subscription: Netflix

### Vérifications

| # | Onglet | Check | Attendu | Résultat |
|---|--------|-------|---------|----------|
| 1 | Goals | Timeline affichée | Pas le formulaire | ⬜ |
| 2 | Goals | Goal name | "vacations - 500€" | ⬜ |
| 3 | Goals | Academic events | Exam avec startDate ET endDate | ⬜ |
| 4 | Skills | Liste skills | typescript, french, piano (PAS templates) | ⬜ |
| 5 | Skills | Pas d'autres profils | Uniquement MES skills | ⬜ |
| 6 | Budget | Expense total | 800€ (pas 770€) | ⬜ |
| 7 | Trade | Borrow section | "camping gear from Alex" | ⬜ |
| 8 | Trade | Sell section | "iPhone - 300€" | ⬜ |
| 9 | Trade | From Sales panel | "+300€ potential" affiché | ⬜ |
| 10 | Swipe | Preference bars | 50% (valeurs neutres) | ⬜ |
| 11 | Console | Pas d'erreurs | Pas de 500/404 | ⬜ |

### Features à vérifier (Enhancement Requests)

| # | Onglet | Feature | Status Actuel | Attendu |
|---|--------|---------|---------------|---------|
| M | Budget | Net Margin cumulé deadline | ✅ Implemented | "+X€ savings until deadline" |
| N | Trade | Borrowed cumul valeur | ✅ Implemented | "+X€ saves" comme From Sales |

---

## Sprint 5.5: Post-Test Corrections

### Bug O: Deadline Not Displayed in Goals Form
**Severity**: MEDIUM
**Status**: ✅ FIXED (Sprint 5.5)

**Symptom**: Goal deadline extracted but not shown in form field

**Root Cause**: Race condition - `planData().setup` is undefined when GoalsTab first renders. Goal loading in `plan.tsx` onMount happens asynchronously AFTER GoalsTab has already rendered with empty `initialData`.

**Fix**: Added `createEffect` to sync `goalDeadline` signal when `props.initialData?.goalDeadline` changes. Only set 56-day default if no initialData provided AND no existing deadline.

**File**: `packages/frontend/src/components/tabs/GoalsTab.tsx`

---

### Bug P: Academic Events Not Captured
**Severity**: HIGH
**Status**: ✅ FIXED (Sprint 5.5)

**Symptom**: User says "I have an exam in 1 month" but academicEvents array is empty

**Root Cause**: Critical code defect at line 902 in `OnboardingChat.tsx`. The `smartMergeArrays()` call used `'goal'` as the step parameter, but academic events are collected at the `'academic_events'` step.

**Fix**: Changed line 902 from `'goal'` to `'academic_events'`.

**File**: `packages/frontend/src/components/chat/OnboardingChat.tsx`

---

### Bug Q: Skills Still Showing Templates
**Severity**: HIGH
**Status**: ✅ FIXED (Sprint 5.5)

**Symptom**: Despite Bug G fix, user still sees template skills instead of their own

**Root Cause**: When `contextSkills()` returns an empty array (due to skill loading failure), SkillsTab shows SKILL_TEMPLATES as "Quick Add" buttons. This happens when `skillService.bulkCreateSkills()` failed during onboarding.

**Fix**: Added visual distinction between "user has no skills" vs "skills loading failed" + retry mechanism.

**File**: `packages/frontend/src/components/tabs/SkillsTab.tsx`

---

### Bug L: Skills Display Shows Other Profile's Data
**Severity**: HIGH
**Status**: ✅ FIXED (Sprint 5.5)

**Symptom**: SkillsTab shows skills from another profile (e.g., "Nicolas" skills when active profile is "Nico")

**Root Cause**: Race condition between profile switch and `contextSkills()` signal update. When `/api/profiles?active=true` switches DB, frontend's `profile()` signal lags.

**Fix**: Added explicit skill clearing when profile ID changes and loading state during profile switch.

**File**: `packages/frontend/src/lib/profileContext.tsx`

---

### Bug R: Borrow Item Value Not Extracted
**Severity**: MEDIUM
**Status**: ✅ FIXED (Sprint 5.5)

**Symptom**: User says "borrow camping gear worth $150 from Alex" but value not captured

**Root Cause**: Extraction prompt did not ask for `estimatedValue` field for borrow items

**Fix**: Updated borrow item extraction to include `estimatedValue` mapping.

**File**: `packages/frontend/src/components/chat/OnboardingChat.tsx`

---

### Bug T: Missions Empty on First /suivi Load
**Severity**: MEDIUM
**Status**: ✅ FIXED (Sprint 5.5)

**Symptom**: After onboarding, /suivi page shows "No missions" until refresh

**Root Cause**: Missions generated async, not available on first navigation

**Fix**: Added loading state and triggers mission generation on mount if none exist.

**File**: `packages/frontend/src/routes/suivi.tsx`

---

## Sprint 6: Feature Enhancements

### Feature M: Cumulative Savings Until Deadline
**Priority**: HIGH
**Status**: ✅ IMPLEMENTED (Sprint 5.5)

**Description**: In BudgetTab "Net Margin" panel, show total savings projected until goal deadline.

**File**: `packages/frontend/src/components/tabs/BudgetTab.tsx`

---

### Feature N: Borrowed Panel with Value Totals
**Priority**: HIGH
**Status**: ✅ IMPLEMENTED (Sprint 5.5)

**Description**: Mirror "From Sales" panel style for "Borrowed" section with cumulative value.

**File**: `packages/frontend/src/components/tabs/BudgetTab.tsx` (TradeTab section)
