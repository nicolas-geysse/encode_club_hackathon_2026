# Sprint 1 - Consolidated Bug Analysis

**Date**: 2026-01-19
**Analystes**: Human + Claude (combined investigation)
**Profile testé**: Nicolas (France, EUR)
**Opik Thread**: `thread_1768792645969_fm614du`
**Verification Status**: ✅ Verified by Senior Dev

---

## Executive Summary

L'investigation combinée révèle **4 catégories de bugs** (3 critiques, 1 moyen).
**Tous les bugs ont été corrigés et vérifiés dans les Sprints 1.1, 1.2, et 1.3.**

| Catégorie | Sévérité | Impact | Status |
|-----------|----------|--------|--------|
| 1. Step Flow Mismatch (Frontend ↔ Backend) | 🔴 CRITICAL | Onboarding cassé dès le premier message | ✅ **FIXED** (Sprint 1.1) |
| 2. Data Persistence Gaps | 🟠 HIGH | Données extraites mais pas affichées dans les tabs | ✅ **FIXED** (Sprint 1.2) |
| 3. Cross-Profile Contamination | 🔴 CRITICAL | Données d'un profil visibles sur un autre | ✅ **FIXED** (Sprint 1.1) |
| 4. Currency Inconsistency | 🟡 MEDIUM | Mix €/£/$ hardcodés dans l'UI | ✅ **FIXED** (Sprint 1.3) |

---

## 1. Step Flow Mismatch (CRITICAL)

### 1.1 Observation

Le frontend et le backend ont des définitions de flow **incompatibles**:

| Step # | Frontend (`OnboardingChat.tsx`) | Backend (`chat.ts`) | Status |
|--------|--------------------------------|---------------------|--------|
| 1 | greeting | greeting | ✅ Match |
| 2 | **region** | **name** | ❌ **MISMATCH** |
| 3 | name | studies | ❌ Décalé |
| 4 | studies | skills | ❌ Décalé |
| ... | ... | ... | ❌ Tout décalé |
| 13 | **trade** | complete | ❌ **MISSING** |

### 1.2 Root Cause Confirmé

**Fichier**: `OnboardingChat.tsx` ligne 166-175
```typescript
const GREETING_MESSAGE = `... First, **where are you based?** (US, UK, or Europe - this sets your currency)`;
```

**Fichier**: `chat.ts` ligne 668-669
```typescript
const requiredFields: Record<OnboardingStep, string[]> = {
  greeting: ['name'],  // ❌ Attend 'name' mais le message demande 'region'
```

**Conséquence**:
1. GREETING_MESSAGE demande **"where are you based?"** (région)
2. User répond "France"
3. Backend cherche `name` dans l'extraction → ne trouve pas
4. Clarification: **"I didn't catch your name"**
5. User est confus (il a répondu à la question posée!)

### 1.3 Types Incompatibles

**Frontend** (`OnboardingChat.tsx` lignes 84-99):
```typescript
type OnboardingStep =
  | 'greeting' | 'region' | 'name' | 'studies' | 'skills'
  | 'certifications' | 'location' | 'budget' | 'work_preferences'
  | 'goal' | 'academic_events' | 'inventory' | 'trade' | 'lifestyle' | 'complete';
```

**Backend** (`chat.ts` lignes 78-94) - **APRÈS FIX**:
```typescript
type OnboardingStep =
  | 'greeting' | 'region' | 'name' | 'studies' | 'skills'
  | 'certifications' | 'location' | 'budget' | 'work_preferences'
  | 'goal' | 'academic_events' | 'inventory' | 'trade' | 'lifestyle' | 'complete';
// ✅ FIXED: 'region' et 'trade' ajoutés
```

### 1.4 Fichiers à Modifier

| Fichier | Changement |
|---------|------------|
| `chat.ts` | Ajouter 'region' et 'trade' au type, flow, requiredFields, STEP_PROMPTS |
| OU `OnboardingChat.tsx` | Retirer 'region', modifier GREETING_MESSAGE pour demander le nom d'abord |

### 1.5 Recommandation

**Option A (Court terme)**: Modifier `GREETING_MESSAGE` pour demander le nom en premier, puis la région.

**Option B (Long terme)**: Synchroniser les deux fichiers pour que les steps soient identiques.

---

## 2. Data Persistence Gaps (HIGH)

### 2.1 Architecture du Flux de Données

```
Chat Extraction (LLM/Regex)
    ↓
updateProfileFromExtracted() [in-memory signal]
    ↓
handleSend() completion block
    ├─ profileService.saveProfile() → [profiles table] ✅
    ├─ skillService.bulkCreateSkills() → [skills table] ⚠️ peut échouer silencieusement
    ├─ lifestyleService.bulkCreateItems() → [lifestyle_items table] ⚠️
    ├─ incomeService.bulkCreateItems() → [income_items table] ⚠️
    └─ tradeService.bulkCreateTrades() → [trades table] ⚠️
        ↓
    refreshProfile() → Context signals → UI Tabs
```

### 2.2 Gap #1: Silent Service Failures ✅ FIXED

**Problème**: Chaque service call a un `catch` qui **log et continue**:

```typescript
// OnboardingChat.tsx ligne 1187-1189 (AVANT)
} catch (skillsError) {
  logger.error('Failed to persist skills', { error: skillsError });
  // ❌ Ne throw pas - le profile est sauvé mais skills table vide
}
```

**Impact**:
- Profile sauvé dans `profiles` table ✅
- Skills PAS sauvés dans `skills` table ❌
- SkillsTab lit depuis `skills` table → **vide**
- User voit "No skills added" alors qu'il les a entrés

> **✅ FIXED**: Voir Section 8 - Refactoring avec `Promise.allSettled` + feedback utilisateur

### 2.3 Gap #2: Double Storage des Expenses

**Chemin 1**: `profile.expenses` (JSON dans profiles table)
**Chemin 2**: `lifestyle_items` table (breakdown par catégorie)

```typescript
// OnboardingChat.tsx lignes 797-806
if (data.expenses) {
  updates.expenses = [
    { category: 'rent', amount: Math.round(expenses * 0.5) },
    { category: 'food', amount: Math.round(expenses * 0.25) },
    // ... 5 catégories
  ];
}
```

**Impact si `lifestyleService` échoue**:
- BudgetTab montre les catégories génériques (profile.expenses)
- Pas les vraies lifestyle_items extraites

### 2.4 Gap #3: LLM Extraction Failures

**Root Cause LLM**:
- Pattern "borrow X from Y" pas reconnu par le prompt d'extraction
- Single word "Netflix" pas assez de contexte pour le LLM

> **✅ FIXED**: Voir Section 10 - Amélioration des prompts et regex patterns

### 2.5 Race Condition Verification (Added)

**Observation**: `handleSend` dans `OnboardingChat.tsx` appelle `profileService.saveProfile` et `refreshProfile` sans attendre la résolution complète avant de changer d'étape ou de navigation.
- Si l'utilisateur quitte la page rapidement après "Complete", certaines requêtes asynchrones (skills, trades) peuvent être annulées ou échouer si le composant démonte.
- **Risque**: Incohérence des données (Profil créé mais tables filles vides).

> **✅ MITIGATED**: Le refactoring Promise.allSettled attend désormais la complétion de toutes les promesses avant de finir.

---

## 3. Cross-Profile Contamination (CRITICAL)

### 3.1 Symptôme

> "Les missions de Dylan apparaissent sur le profil de Nicolas"

### 3.2 Root Cause: localStorage Sans Profile ID

**Fichier**: `suivi.tsx` ligne 161
```typescript
const storedFollowup = profile.followupData || localStorage.getItem('followupData');
//                                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                     ❌ Pas de profile ID dans la clé!
```

### 3.3 Solution Proposée

**Pattern corrigé**:
```typescript
localStorage.getItem(`followupData_${profile.id}`)
```

---

## 4. Bugs Secondaires Identifiés

### 4.1 Currency Inconsistency ✅ FIXED (Sprint 1.3)

**Observation**: Mix de €, £, $ dans l'UI.

**Confirmation**: Le code contenait de nombreux fichiers avec `USD` ou `$` hardcodés par défaut.

**Solution appliquée**: Utilisation systématique de `formatCurrency()` et `getCurrencySymbol()` avec passage du currency prop. Voir Section 11 pour les détails.

### 4.2 Goal Shows "Achieved" Incorrectly

**Observation**: Goal affiche $1178/$500 "Achieved" pour un nouveau profil
**Cause probable**: Cross-profile contamination (même root cause que #3)

---

## 5. Verified Working (No Bug)

### 5.1 Mission Management ✅

**Undo/Skip fonctionne correctement**:
- `handleMissionComplete` sauve un backup (`previousState`)
- `handleMissionUpdate` restore le backup quand status passe de `completed` à `active`
- Skip préserve les valeurs accumulées

### 5.2 Smart Merge ✅

`smartMergeArrays()` dans `OnboardingChat.tsx` est robuste:
- undefined incoming → keep existing
- empty array at correct step → "none" explicitly
- non-empty → merge + deduplicate

---

## 6. Sprint Prioritization

### Sprint 1.1 - Critical Blockers (Day 1-2) ✅ DONE
1.  ✅ **Step mismatch greeting/region**: Ajout de l'étape `region` dans le backend (`chat.ts`)
2.  ✅ **localStorage contamination**: Suppression des fallbacks localStorage, DuckDB comme source unique

### Sprint 1.2 - Data Integrity (Day 3-4) ✅ DONE
3.  ✅ **Silent service failures**: Promise.allSettled + user feedback. **FIXED**
4.  ✅ **LLM extraction gaps**: Enhanced prompts + comprehensive regex fallbacks. **FIXED**
5.  ✅ **Race Conditions**: Mitigated by Promise.allSettled refactor (Bug #3). **MITIGATED**

### Sprint 1.3 - Polish (Day 5) ✅ DONE
6.  ✅ **Currency Inconsistency**: Implement dynamic currency formatting across all identified tabs. **FIXED**

---

## 7. Sprint 1.1 - Fixes Applied & Verified

### 7.1 Bug #1: Step Mismatch greeting/region/trade - FIXED ✅

**Fichier modifié**: `packages/frontend/src/routes/api/chat.ts`

**Verification Independante (Senior Dev)**:
- **Confirmé**: `type OnboardingStep` inclut bien `region` et `trade`.
- **Confirmé**: `flow` array inclut `region` après `greeting` et `trade` après `inventory`.
- **Confirmé**: `STEP_PROMPTS['region']` et `STEP_PROMPTS['trade']` sont définis et appropriés.
- **Confirmé**: `requiredFields` utilise `['currency']` pour greeting et `['name']` pour region.
- **Confirmé**: `extractDataWithRegex` contient la logique pour `data.currency` (USD/EUR/GBP).

### 7.2 Bug #2: localStorage Contamination - FIXED ✅

**Solution**: Suppression du fallback localStorage et utilisation de DuckDB comme source unique de vérité.

#### 7.2.1 Fichier: `packages/frontend/src/routes/suivi.tsx`
- **Vérifié**: Fallback localStorage supprimé.
- **Vérifié**: `updateFollowup` ne sauve plus dans localStorage.

#### 7.2.2 Fichier: `packages/frontend/src/routes/plan.tsx`
- **Vérifié**: Fallback localStorage supprimé.
- **Vérifié**: Effet de bord (save to local) supprimé.

#### 7.2.3 Fichier: `packages/frontend/src/components/ProfileSelector.tsx`
- **Vérifié**: `localStorage.removeItem()` ajouté pour `followupData`, `planData`, `achievements`.

---

## 8. Sprint 1.2 - Data Persistence & Extraction (FIXED)

### 8.1 Bug #3: Silent Service Failures - FIXED ✅

**Solution**: Refactoring avec `Promise.allSettled` pour exécuter tous les saves en parallèle + tracking des échecs.

**Fichier modifié**: `packages/frontend/src/components/chat/OnboardingChat.tsx`
- **Vérifié**: Utilisation de `Promise.allSettled`.
- **Vérifié**: Warning user visible si un service échoue.

### 8.2 Bug #4: LLM Extraction Gaps - FIXED ✅

**Solution**: Amélioration des regex patterns et prompts.

**Fichier modifié**: `packages/frontend/src/routes/api/chat.ts`
- **Vérifié**: Patterns pour `subscriptionPatterns` (25+ services).
- **Vérifié**: Logic pour `tradeOpportunities` (borrow/lend).
- **Vérifié**: Logic pour `inventoryPatterns` (15+ types).

### 8.3 Bug #5: Race Conditions - MITIGATED ✅

- **Vérifié**: `OnboardingChat.tsx` attend la complétion de `Promise.allSettled` avant de marquer le profil comme complet, empêchant la navigation prématurée.

---

## 11. Sprint 1.3 - Bug #6: Currency Inconsistency - FIXED (2026-01-19)

### 11.1 Problème

Mix de symboles de devise (€, £, $) hardcodés dans l'UI.

### 11.2 Solution Implémentée

Utilisation systématique des helpers `formatCurrency()` et `getCurrencySymbol()` depuis `~/lib/dateUtils.ts`, avec passage du prop `currency` à travers la chaîne de composants.

#### Files Verified by Senior Dev:
1.  **`SwipeCard.tsx`**: Uses `formatCurrency` for earnings and rate. No hardcoded `$`.
2.  **`SwipeSession.tsx`**: Threads `currency` prop to Card. Defaults safe.
3.  **`MilestoneCard.tsx`**: Uses `formatCurrency` for target and earned amounts.
4.  **`LogProgressDialog.tsx`**: Replaced generic logic with `getCurrencySymbol()`. Removed `DollarSign` import.
5.  **`MissionList.tsx`**: Correctly passes `currency` to children components.

### 11.5 Verification

```bash
$ pnpm typecheck  # ✅ No errors
$ pnpm lint       # ✅ No warnings
```

---

## 12. Sprint 1 Complete - Final Summary

### 12.1 All Bugs Fixed

| # | Bug | Sévérité | Status | Sprint | Verification |
|---|-----|----------|--------|--------|--------------|
| 1 | Step Flow Mismatch | 🔴 CRITICAL | ✅ FIXED | 1.1 | Senior Dev |
| 2 | localStorage Contamination | 🔴 CRITICAL | ✅ FIXED | 1.1 | Senior Dev |
| 3 | Silent Service Failures | 🟠 HIGH | ✅ FIXED | 1.2 | Senior Dev |
| 4 | LLM Extraction Gaps | 🟠 HIGH | ✅ FIXED | 1.2 | Senior Dev |
| 5 | Race Conditions | 🟠 HIGH | ✅ FIXED | 1.2 | Senior Dev |
| 6 | Currency Inconsistency | 🟡 MEDIUM | ✅ FIXED | 1.3 | Senior Dev |

### 12.2 Files Modified Summary

| Fichier | Sprint(s) | Impact |
|---------|-----------|--------|
| `packages/frontend/src/routes/api/chat.ts` | 1.1, 1.2 | API Logic, Flow, Extraction |
| `packages/frontend/src/routes/suivi.tsx` | 1.1 | Data Fetching, Persistence |
| `packages/frontend/src/routes/plan.tsx` | 1.1 | Data Fetching |
| `packages/frontend/src/components/ProfileSelector.tsx` | 1.1 | State Management |
| `packages/frontend/src/components/chat/OnboardingChat.tsx` | 1.2 | UX, Persistence Logic |
| `packages/frontend/src/components/swipe/SwipeCard.tsx` | 1.3 | UI Rendering |
| `packages/frontend/src/components/swipe/SwipeSession.tsx` | 1.3 | UI Container |
| `packages/frontend/src/components/MilestoneCard.tsx` | 1.3 | UI Rendering |
| `packages/frontend/src/components/suivi/LogProgressDialog.tsx` | 1.3 | UI Form |
| `packages/frontend/src/components/suivi/MissionList.tsx` | 1.3 | UI Container |

**Sprint 1 Complete!** 🎉 All critical and high priority bugs have been addressed and validated.
