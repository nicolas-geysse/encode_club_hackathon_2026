# Swipe Agent Redesign

> **Status**: Phases 1-2 complètes, Phase 3 partielle. Prêt pour test utilisateur.

---

## 🎯 Résumé Exécutif

### Problème résolu
Les **skills** étaient transformés en scénarios actionnables ("Freelance Python"), ce qui n'a aucun sens car on ne peut pas "activer" un skill.

### Solution implémentée
Architecture **Pull** : le Swipe agrège des opportunités concrètes provenant de 4 sources validées.

```
AVANT (incorrect):
Skills → Scenarios → Missions
         ↑ Invente "Freelance Python"

APRÈS (correct):
Trade/Jobs/Lifestyle → Scenarios → Missions
                       ↑ Agrège des opportunités réelles
```

---

## ✅ Ce qui est implémenté

### Phase 1: Pull Architecture
**Fichiers modifiés**: `SwipeTab.tsx`, `SwipeSession.tsx`, `SwipeCard.tsx`

| Feature | Status | Détail |
|---------|--------|--------|
| Nouvelle interface `Scenario` | ✅ | 5 catégories: `sell_item`, `job_lead`, `pause_expense`, `karma_trade`, `karma_lend` |
| Skills supprimés des scénarios | ✅ | Plus de "Freelance Python" inventé |
| Génération depuis Trade (sell) | ✅ | Items avec `type='sell'` et `status!='completed'` |
| Génération depuis Leads | ✅ | Leads avec `status='interested'` |
| Génération depuis Lifestyle | ✅ | Items non pausés avec `currentCost > 0` |
| Génération karma | ✅ | Items `type='trade'` ou `type='lend'` |
| Tri par urgency score | ✅ | `scenarios.sort((a,b) => b.urgency.score - a.urgency.score)` |

### Phase 2: Access Control
**Fichier modifié**: `swipe.tsx`

| Feature | Status | Détail |
|---------|--------|--------|
| `canAccessSwipe()` | ✅ | Vérifie 4 sources de contenu |
| EmptySwipeView | ✅ | Message + 4 CTAs vers les onglets |
| Navigation intelligente | ✅ | Boutons vers Trade/Jobs/Budget |

### Phase 3: Urgency Factor (Partiel)
**Fichiers modifiés**: `SwipeTab.tsx`, `SwipeCard.tsx`

| Feature | Status | Détail |
|---------|--------|--------|
| `calculateSellUrgency()` | ✅ | Basé sur goalImpactPercent |
| `calculateJobUrgency()` | ⚠️ | Base score seulement (pas de deadline) |
| `calculateLifestyleUrgency()` | ⚠️ | Base score seulement (pas de billingDate) |
| Badge urgency sur cards | ✅ | Affiché si `score >= 75` |
| Badge karma sur cards | ✅ | "+50 karma" pour lend, "+30" pour trade |

---

## 🔲 Checkpoints restants

### Checkpoint A: Urgency Data (Priorité Haute)
**Objectif**: Activer l'urgency intelligente avec des vraies données

```
□ A.1 Ajouter `nextBillingDate` à LifestyleItem
      - Migration DB: ALTER TABLE lifestyle_items ADD next_billing_date DATE
      - API: Retourner le champ dans GET /api/lifestyle
      - UI: Champ date dans BudgetTab pour saisie

□ A.2 Ajouter `applicationDeadline` et `isHot` aux Leads
      - API: Enrichir la réponse Prospection
      - Optionnel: Détecter "Hot" via Google Places activity

□ A.3 Implémenter calculateLifestyleUrgency() avec vraie date
      - daysToBilling <= 3 → score 95
      - daysToBilling <= 7 → score 80

□ A.4 Implémenter calculateJobUrgency() avec deadline/hot
      - daysToDeadline <= 2 → score 90
      - isHot → score 75
```

### Checkpoint B: Feedback Loop (Priorité Moyenne)
**Objectif**: Apprendre des rejets pour améliorer les suggestions

```
□ B.1 Créer interface SwipeFeedback
      interface SwipeFeedback {
        categoryStats: Record<string, { accepted: number; rejected: number; ratio: number }>;
        strongDislikes: Array<{ pattern: string; count: number }>;
      }

□ B.2 Logger les décisions dans SwipeSession
      - onSwipe → ajouter à swipeFeedback dans profile

□ B.3 Ajouter swipeFeedback au schema Profile (DuckDB)
      - JSON field dans profiles table

□ B.4 Filtrer les scénarios basé sur feedback
      - Si rejection rate > 80% sur 10+ swipes → exclure catégorie

□ B.5 UI "Reset preferences" dans Settings
      - Bouton qui vide swipeFeedback
```

### Checkpoint C: Skill Matching (Priorité Moyenne)
**Objectif**: Les skills améliorent le ranking des jobs

```
□ C.1 Créer fonction rankLeadsBySkillMatch()
      - Keyword matching: skill name ∩ job title
      - matchScore: 50 + 25 * matchingSkills.length

□ C.2 Intégrer dans ProspectionTab
      - Trier les résultats par matchScore

□ C.3 Afficher badge "85% match" sur les cartes Prospection

□ C.4 (V2) Semantic matching via LLM
      - Prompt: "Rate skill relevance to job 0-100"
```

### Checkpoint D: Karma System Complet (Priorité Basse)
**Objectif**: Gamifier les actions sociales

```
□ D.1 Ajouter karma_points au schema Profile
      - INTEGER default 0

□ D.2 Incrémenter karma quand mission karma complétée
      - onMissionComplete → si category karma_* → add points

□ D.3 Afficher Karma Level dans Progress dashboard
      - 0-100: "Newcomer", 100-500: "Helper", 500+: "Community Star"

□ D.4 Badges achievements pour karma milestones
```

### Checkpoint E: Agent Architecture (Priorité Basse)
**Objectif**: Orchestration LLM des sources

```
□ E.1 Créer Lifestyle Agent (Mastra)
      - Input: lifestyle items, goal context
      - Output: pause/reduce suggestions with urgency

□ E.2 Améliorer Trade Agent
      - Suggest platforms based on item category
      - Estimate days to sell

□ E.3 Créer Swipe Orchestrator Agent
      - Combine outputs from all sub-agents
      - Apply user preferences
```

---

## 📁 Fichiers clés

### Modifiés (Phase 1-2)

| Fichier | Rôle |
|---------|------|
| `components/tabs/SwipeTab.tsx` | Nouvelle interface Scenario, generateScenarios() Pull, helpers display |
| `components/swipe/SwipeCard.tsx` | Props urgency/karma, badges visuels |
| `components/swipe/SwipeSession.tsx` | Catégories adaptées, validation non-work |
| `routes/swipe.tsx` | canAccessSwipe(), EmptySwipeView, goalContext |

### À créer (Checkpoints futurs)

| Fichier | Rôle |
|---------|------|
| `lib/swipe/urgency.ts` | Calculs urgency centralisés |
| `lib/swipe/feedback.ts` | Gestion feedback loop |
| `lib/swipe/skillMatch.ts` | Ranking leads par skills |

### À modifier (Checkpoints futurs)

| Fichier | Changement |
|---------|------------|
| `routes/api/lifestyle.ts` | Ajouter next_billing_date |
| `routes/api/prospection.ts` | Ajouter applicationDeadline, isHot |
| `lib/profileService.ts` | Ajouter swipeFeedback, karma_points |
| `components/tabs/ProspectionTab.tsx` | Skill match badges |
| `routes/progress.tsx` | Karma level display |

---

## 🧪 Scénarios de test

### ✅ Testables maintenant

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 1 | User sans rien | EmptySwipeView avec 4 CTAs |
| 2 | User avec 1 item sell | Swipe accessible, scénario "Sell X" |
| 3 | User avec 1 lead interested | Swipe accessible, scénario job |
| 4 | User avec Netflix non pausé | Swipe accessible, scénario "Pause Netflix" |
| 5 | User avec item lend | Scénario karma avec badge "+50 karma" |
| 6 | Goal deadline < 14j + item 20% du goal | Badge "💰 20% of your goal!" |

### 🔲 À tester après Checkpoint A

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 7 | Netflix expire dans 2 jours | Badge "⚡ Expires in 2 days!" en premier |
| 8 | Job avec deadline demain | Badge "🔥 Apply now!" en tête |

### 🔲 À tester après Checkpoint B

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 9 | User rejette 10 jobs freelance | Jobs freelance exclus des suggestions |
| 10 | User clique "Reset preferences" | Tout réapparaît |

### 🔲 À tester après Checkpoint C

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 11 | Skill Python + lead "Dev Python" | Badge "85% match" sur la carte |

---

## 📊 Architecture Pull - Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   1. EXPLORE                    2. DECIDE                3. ACT     │
│   ┌─────────────────┐          ┌─────────────┐         ┌─────────┐ │
│   │ Trade Tab       │────┐     │             │         │         │ │
│   │ • Add sell item │    │     │   SWIPE     │         │ Progress│ │
│   │ • Add lend/trade│    │     │   AGENT     │         │         │ │
│   └─────────────────┘    │     │             │         │ Missions│ │
│   ┌─────────────────┐    ├────▶│ • Aggregate │────────▶│ created │ │
│   │ Jobs Tab        │    │     │ • Rank      │         │         │ │
│   │ • Mark interested│───┤     │ • Present   │         │         │ │
│   └─────────────────┘    │     │             │         │         │ │
│   ┌─────────────────┐    │     └─────────────┘         └─────────┘ │
│   │ Budget Tab      │────┘                                         │
│   │ • Subscriptions │        ⚠️ If no content:                     │
│   └─────────────────┘           EmptySwipeView                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Code de référence

### Interface Scenario (implémentée)

```typescript
// SwipeTab.tsx
export type ScenarioCategory =
  | 'sell_item'      // Trade type='sell'
  | 'job_lead'       // Prospection lead interested
  | 'pause_expense'  // Lifestyle pausable
  | 'karma_trade'    // Trade type='trade'
  | 'karma_lend';    // Trade type='lend'

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: ScenarioCategory;

  // Financial (optionnel selon catégorie)
  weeklyHours?: number;
  weeklyEarnings?: number;
  oneTimeAmount?: number;
  monthlyAmount?: number;
  hourlyRate?: number;

  // Metadata
  effortLevel: number;
  flexibilityScore: number;
  source: 'trade' | 'prospection' | 'lifestyle';
  sourceId: string;

  // Urgency (pour tri)
  urgency: {
    score: number;      // 0-100
    reason?: string;    // "⚡ Expires in 3 days!"
  };

  // Karma
  karmaPoints?: number;
  socialBenefit?: string;
}
```

### Access Control (implémenté)

```typescript
// swipe.tsx
const swipeAccess = createMemo(() => {
  const hasSellableItems = trades().some(
    t => t.type === 'sell' && t.status !== 'completed'
  );
  const hasInterestedLeads = leads().some(l => l.status === 'interested');
  const hasPausableExpenses = lifestyle().some(
    l => l.currentCost > 0 && !l.pausedMonths
  );
  const hasKarmaItems = trades().some(
    t => (t.type === 'trade' || t.type === 'lend') && t.status !== 'completed'
  );

  return {
    canAccess: hasSellableItems || hasInterestedLeads || hasPausableExpenses || hasKarmaItems,
    // ...
  };
});
```

---

## 📅 Historique des commits

| Date | Commit | Phase |
|------|--------|-------|
| 2026-02-05 | `feat(swipe): Implement Pull Architecture for scenarios` | Phase 1 |
| 2026-02-05 | `feat(swipe): Add access control for empty swipe state` | Phase 2 |
| 2026-02-05 | `docs: Add Swipe Agent redesign specification` | Initial spec |
