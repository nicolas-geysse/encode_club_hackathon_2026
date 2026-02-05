# Swipe Agent Redesign

> **Status**: Phases 1-7 complètes, Checkpoints A, B, F.partial & G.partial complets. Skill Match + Karma Loop implémentés.

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
Trade/Jobs/Lifestyle → Scenarios → Missions ↔ Sync back to source
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

### Phase 3: Visual Distinction
**Fichiers modifiés**: `SwipeCard.tsx`, `MissionCard.tsx`

| Feature | Status | Détail |
|---------|--------|--------|
| Icônes par catégorie | ✅ | ShoppingBag/Briefcase/Pause/Repeat/HandHeart |
| Labels sémantiques | ✅ | "Sell", "Job", "Save", "Trade", "Lend" |
| Badges source | ✅ | "From Jobs", "From Inventory", "Subscription", "Community Action" |
| Stats conditionnelles | ✅ | weekly/one-time/monthly/karma display modes |
| Badge urgency | ✅ | Affiché si `score >= 75` |
| Badge karma | ✅ | "+50 karma" pour lend, "+30" pour trade |
| Badge goal impact | ✅ | Sur job_lead et pause_expense (sell_item a déjà urgency badge) |

### Phase 4: Sync Progress ↔ Source
**Fichier modifié**: `progress.tsx`

| Feature | Status | Détail |
|---------|--------|--------|
| `source` et `sourceId` sur Mission | ✅ | Tracking du lien vers item original |
| Sync on complete | ✅ | `sell_item` → trade.status='completed' |
| Sync on undo | ✅ | trade.status='pending' (reproposable) |
| Sync pause_expense | ✅ | Sync pauseMonths (1-6) depuis swipe adjustment |

### Phase 5: Bugfixes Pull Architecture
**Fichiers modifiés**: `SwipeSession.tsx`, `progress.tsx`

| Bug | Fix | Détail |
|-----|-----|--------|
| NaN€ dans missions | ✅ | Fallback `oneTimeAmount`/`monthlyAmount` si `weeklyEarnings` undefined |
| weeklyEarnings non recalculé | ✅ | Recalcul `rate × hours` dans SwipeSession quand adjustments |
| Missions work à 0€ | ✅ | Validation empêche complete si `weeklyEarnings <= 0` pour job_lead |

### Phase 6: Déduplication & Karma Loop
**Fichiers modifiés**: `swipe.tsx`, `SwipeTab.tsx`, `MissionCard.tsx`, `TimelineHero.tsx`, `TradeTab.tsx`

| Feature | Status | Détail |
|---------|--------|--------|
| Déduplication cartes swipe | ✅ | Filtre items avec missions actives/completed (skipped = re-swipable) |
| Karma total dans summary | ✅ | Affiche karma à côté du total € dans SwipeTab review |
| Karma dans MissionCard | ✅ | Karma au lieu de €0 pour lend/trade, savings+karma pour borrow |
| Karma dans TimelineHero | ✅ | Indicateur 🤍 X karma dans progress bar |
| TradeTab karma fix | ✅ | Utilise contextTrades() au lieu du state local (réactivité) |

### Phase 7: Skill Match & Goal Impact Fixes
**Fichiers modifiés**: `SwipeTab.tsx`, `SwipeSession.tsx`, `SwipeCard.tsx`, `jobScoring.ts`, `ProspectionCard.tsx`, `ProspectionList.tsx`

| Feature | Status | Détail |
|---------|--------|--------|
| Skill match sur job_lead (swipe) | ✅ | Badge `✨ X% skill match` sur cartes swipe |
| Skill match sur prospection | ✅ | Badge + breakdown dans ProspectionCard/List |
| Goal impact sur sell_item | ✅ | Badge visible quand urgency < 75 |
| Export matchSkillsToCategory | ✅ | Réutilisable depuis jobScoring.ts |
| Karma tiers (levels) | ✅ | Newcomer/Helper/Star avec progress bar |

---

## 🔲 Checkpoints restants

### Checkpoint A: Goal Impact % sur toutes les cartes ✅
**Objectif**: Afficher "X% of your goal!" sur toutes les cartes, dynamique avec Adjust Assumptions

```
✅ A.1 Calculer goalImpact pour job_lead
      - impact = (weeklyEarnings * weeksRemaining) / remainingAmount
      - Recalculer quand rate/hours changent dans Adjust Assumptions
      - Fichier: SwipeTab.tsx (generateScenarios), SwipeSession.tsx (recalc dynamique)

✅ A.2 Calculer goalImpact pour pause_expense
      - impact = (monthlyAmount * pauseMonths) / remainingAmount
      - Default: 1 mois (à personnaliser avec Checkpoint B)
      - Fichier: SwipeTab.tsx (generateScenarios)

✅ A.3 Afficher badge sur toutes les cartes
      - Si impact >= 5% → afficher "🎯 X% of your goal!"
      - Couleur: blue (5-10%), green (10-20%), gold (20%+)
      - Fichiers: SwipeCard.tsx (goalImpactPercent prop + badge)
```

### Checkpoint B: Adjust Assumptions pour pause_expense ✅
**Objectif**: Permettre de sélectionner le nombre de mois de pause dans le swipe

```
✅ B.1 Ajouter panel "Pause Duration" dans SwipeSession
      - Sélecteur 1-6 mois avec boutons
      - UI conditionnelle: job=rate+hours, pause=month selector
      - Fichier: SwipeSession.tsx

✅ B.2 Contraindre par deadline
      - Max = mois_restants_avant_deadline
      - Boutons désactivés pour mois > monthsRemaining
      - Fichier: SwipeSession.tsx (isDisabled logic)

✅ B.3 Stocker pauseMonths dans scenario/mission
      - Nouveau champ `pauseMonths?: number` dans CardAdjustments, Scenario, Mission
      - syncMissionToSource() utilise mission.pauseMonths
      - Fichiers: SwipeCard.tsx, SwipeSession.tsx, SwipeTab.tsx, MissionCard.tsx, progress.tsx

✅ B.4 Recalcul goal impact
      - Goal impact multiplié par pauseMonths pour pause_expense
      - Dynamique: impact recalculé quand user change pauseMonths
      - Fichier: SwipeSession.tsx (goalImpactPercent())
```

### Checkpoint C: Lifestyle Pause UX (Budget Tab)
**Objectif**: Améliorer l'interface de pause des abonnements

```
□ C.1 Contraindre pausedMonths par la deadline
      - Si deadline dans 3 mois et déjà avancé de 2 mois → max 1 mois de pause possible
      - Griser les mois non disponibles dans le sélecteur
      - Calcul: mois_disponibles = mois_restants_avant_deadline

□ C.2 Mettre à jour les mois disponibles quand le temps avance
      - Quand simulation avance → recalculer mois_disponibles
      - Réduire automatiquement pausedMonths si > mois_disponibles

□ C.3 Afficher impact visuel dans Budget Tab
      - "Pausing Netflix 2 months = 26€ saved (5% of goal)"
```

### Checkpoint D: Job Urgency (Priorité Moyenne)
**Objectif**: Prioriser les jobs avec deadlines

```
□ D.1 Ajouter `applicationDeadline` et `isHot` aux Leads
      - API: Enrichir la réponse Prospection
      - Optionnel: Détecter "Hot" via Google Places activity

□ D.2 Implémenter calculateJobUrgency() avec deadline/hot
      - daysToDeadline <= 2 → score 90
      - isHot → score 75
```

### Checkpoint E: Feedback Loop (Priorité Moyenne)
**Objectif**: Apprendre des rejets pour améliorer les suggestions

```
□ E.1 Créer interface SwipeFeedback
      interface SwipeFeedback {
        categoryStats: Record<string, { accepted: number; rejected: number; ratio: number }>;
        strongDislikes: Array<{ pattern: string; count: number }>;
      }

□ E.2 Logger les décisions dans SwipeSession
      - onSwipe → ajouter à swipeFeedback dans profile

□ E.3 Ajouter swipeFeedback au schema Profile (DuckDB)
      - JSON field dans profiles table

□ E.4 Filtrer les scénarios basé sur feedback
      - Si rejection rate > 80% sur 10+ swipes → exclure catégorie

□ E.5 UI "Reset preferences" dans Settings
      - Bouton qui vide swipeFeedback
```

### Checkpoint F: Skill Matching (Majoritairement Implémenté)
**Objectif**: Les skills améliorent le ranking des jobs

```
✅ F.1 matchSkillsToCategory() dans jobScoring.ts
      - Category-to-skills mapping (hardcoded)
      - Substring matching: skill name ∩ expected skills
      - Contributes to profileMatch (30% weight)
      - EXPORTÉ pour réutilisation dans SwipeTab

✅ F.2 Intégré dans ProspectionTab
      - scoreJobsForProfile() applique le skill matching
      - Jobs triés par score total (incluant skills)

✅ F.3 Badge "X% match" visible sur les cartes Prospection
      - ProspectionCard: Badge dans header + progress bar dans Match Score
      - ProspectionList: Badge après certification + breakdown dans tooltip
      - Couleurs: vert (80%+), bleu (50%+)

✅ F.4 Badge "X% skill match" visible sur cartes Swipe
      - SwipeTab: Calcule matchScore pour chaque job_lead
      - SwipeCard: Badge ✨ X% skill match (30%+ affichage)
      - Couleurs: vert (80%+), bleu (50%+), gris (30%+)

□ F.5 Améliorer l'algorithme de matching
      - Remplacer substring par fuzzy matching
      - Considérer skill.level (beginner/intermediate/advanced)
      - Pondérations par importance de skill dans catégorie

□ F.6 (V2) Semantic matching via LLM
      - Prompt: "Rate skill relevance to job 0-100"
```

### Checkpoint G: Karma System (Partiellement Implémenté)
**Objectif**: Gamifier les actions sociales

```
✅ G.1 Constantes KARMA_POINTS centralisées
      - useKarma.ts: { lend: 50, trade: 30, borrow: 20 }
      - Utilisées partout: SwipeCard, SwipeTab, MissionCard, TradeTab

✅ G.2 Affichage karma dans le Swipe summary
      - SwipeTab.tsx: Total karma à côté du total €
      - Fichiers: SwipeTab.tsx (getScenarioKarma helper)

✅ G.3 Affichage karma dans MissionCard
      - Lend/Trade: "+50 karma" / "+30 karma" au lieu de €0
      - Borrow: "X€ saved + 🤍+20 karma"
      - Fichiers: MissionCard.tsx

✅ G.4 Affichage karma dans TimelineHero
      - Indicateur "🤍 X karma" dans la barre de progression
      - Props: karmaScore passé depuis progress.tsx
      - Fichiers: TimelineHero.tsx, progress.tsx

✅ G.5 Karma score calculé depuis trades complétés
      - TradeTab.tsx utilise contextTrades() (source of truth)
      - Calcul: lend*50 + trade*30 + borrow*20

✅ G.6 Karma Levels avec labels
      - useKarma.ts: getKarmaTierInfo() retourne tier/label/emoji/color/progress
      - 0-99: "Newcomer" 🌱, 100-499: "Helper" 🤝, 500+: "Community Star" ⭐
      - Fichiers: useKarma.ts, TimelineHero.tsx, TradeTab.tsx

✅ G.7 Affichage tier dans UI
      - TimelineHero: emoji + label à côté du score karma
      - TradeTab: carte Karma avec tier, progress bar vers next tier
      - Progress bar: "X pts to go" pour atteindre le prochain niveau

□ G.8 Persister karma_points dans Profile (DuckDB) - OPTIONNEL
      - Actuellement calculé dynamiquement (source of truth = trades)
      - Persistance utile uniquement si on veut garder karma même si trades supprimés

□ G.9 Badges achievements pour karma milestones
      - Premier karma, 100 karma, etc.
```

### Checkpoint H: Agent Architecture (✅ Implémenté)
**Objectif**: Orchestration LLM intelligente des sources de scénarios

**Status**:
- ✅ H.1 Lifestyle Agent implémenté
- ✅ H.2 Trade Agent (ajout de 2 outils)
- ✅ H.3 Swipe Orchestrator implémenté
- ⏳ H.4 Frontend integration (TODO)

---

#### H.1 Lifestyle Agent (✅ Implémenté)
**Fichier**: `packages/mcp-server/src/agents/lifestyle-agent.ts`

**Rôle**: Analyser les abonnements/dépenses récurrentes et suggérer des optimisations intelligentes.

**Input**:
```typescript
interface LifestyleAgentInput {
  lifestyle: Array<{
    id: string;
    name: string;
    category: string;           // 'streaming', 'fitness', 'food', 'transport', etc.
    currentCost: number;        // Coût mensuel
    pausedMonths?: number;      // Déjà pausé ?
    lastUsed?: string;          // ISO date dernière utilisation
    usageFrequency?: 'daily' | 'weekly' | 'monthly' | 'rarely';
  }>;
  goalContext: {
    goalAmount: number;
    currentAmount: number;
    remainingAmount: number;
    daysToGoal: number;
    monthsRemaining: number;
  };
  energyLevel?: number;         // 0-100, affects suggestions
}
```

**Output**:
```typescript
interface LifestyleAgentOutput {
  suggestions: Array<{
    itemId: string;
    action: 'pause' | 'reduce' | 'cancel' | 'keep';
    recommendedMonths?: number;  // Pour pause
    savings: number;             // Économies totales sur la période
    goalImpact: number;          // % de l'objectif
    urgency: number;             // 0-100
    reason: string;              // Explication LLM
    alternativeFree?: string;    // "Use YouTube instead of Spotify"
  }>;
  totalPotentialSavings: number;
  priorityOrder: string[];       // IDs ordonnés par urgence
}
```

**Outils Mastra**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tool: analyze_subscriptions                                      │
├─────────────────────────────────────────────────────────────────┤
│ Input: lifestyle[], goalContext                                  │
│ Output: usage patterns, waste detection, category breakdown     │
│                                                                  │
│ Logic:                                                           │
│ - Détecte les doublons (Netflix + Disney+ + Prime = overlap)    │
│ - Identifie les abonnements sous-utilisés (lastUsed > 30j)      │
│ - Calcule le ratio coût/usage                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: suggest_pause_strategy                                     │
├─────────────────────────────────────────────────────────────────┤
│ Input: item, goalContext, energyLevel                            │
│ Output: { action, months, reason, alternative }                  │
│                                                                  │
│ Logic:                                                           │
│ - Si goalImpact >= 10% → priorité haute                         │
│ - Si category='fitness' && energyLevel < 40 → "pause 1 month"   │
│ - Si usageFrequency='rarely' → "cancel or pause 3+ months"      │
│ - Suggère alternatives gratuites par catégorie                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: calculate_savings_impact                                   │
├─────────────────────────────────────────────────────────────────┤
│ Input: suggestions[], goalContext                                │
│ Output: { totalSavings, goalImpact, timeline }                   │
│                                                                  │
│ Logic:                                                           │
│ - Somme des économies par mois                                  │
│ - Impact cumulé sur l'objectif                                  │
│ - Projection: "En pausant X et Y, tu atteins ton goal 2 sem +tôt"│
└─────────────────────────────────────────────────────────────────┘
```

**Database d'alternatives gratuites**:
```typescript
const FREE_ALTERNATIVES: Record<string, string[]> = {
  streaming: ['YouTube', 'Tubi', 'Pluto TV', 'Library streaming'],
  music: ['YouTube Music (free)', 'Spotify free tier', 'SoundCloud'],
  fitness: ['YouTube workouts', 'Nike Training Club (free)', 'Running'],
  food_delivery: ['Cook at home', 'Meal prep Sundays'],
  news: ['Google News', 'Library digital access', 'RSS feeds'],
  cloud_storage: ['Google Drive 15GB', 'Clean up photos'],
  gaming: ['Free-to-play games', 'Game Pass trials', 'Library game lending'],
};
```

---

#### H.2 Trade Agent Amélioré (✅ Implémenté)
**Fichier**: `packages/mcp-server/src/agents/money-maker.ts` (existant, à enrichir)

**Nouvelles fonctionnalités**:

**Tool: suggest_selling_platform**
```typescript
interface SuggestPlatformInput {
  itemName: string;
  category: string;        // 'electronics', 'clothing', 'furniture', etc.
  estimatedValue: number;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  urgency: 'asap' | 'normal' | 'flexible';
}

interface SuggestPlatformOutput {
  primaryPlatform: {
    name: string;           // 'Vinted', 'eBay', 'Facebook Marketplace'
    url: string;
    pros: string[];
    cons: string[];
    typicalFees: string;    // "10% + €0.70"
    estimatedDaysToSell: number;
  };
  alternatives: Array<{
    name: string;
    bestFor: string;        // "Quick sale", "Best price", "Local pickup"
  }>;
  tips: string[];           // "Add 5+ photos", "Price 10% below market"
}
```

**Database de plateformes**:
```typescript
const SELLING_PLATFORMS: Record<string, PlatformInfo[]> = {
  electronics: [
    { name: 'Back Market', fees: '10-15%', speed: 'fast', bestFor: 'phones, laptops' },
    { name: 'eBay', fees: '10-13%', speed: 'medium', bestFor: 'tech accessories' },
    { name: 'Facebook Marketplace', fees: '0%', speed: 'fast', bestFor: 'local pickup' },
    { name: 'Leboncoin', fees: '0-8%', speed: 'medium', bestFor: 'all electronics' },
  ],
  clothing: [
    { name: 'Vinted', fees: '0% seller', speed: 'medium', bestFor: 'fashion, shoes' },
    { name: 'Vestiaire Collective', fees: '15-25%', speed: 'slow', bestFor: 'luxury' },
    { name: 'Depop', fees: '10%', speed: 'medium', bestFor: 'vintage, streetwear' },
  ],
  furniture: [
    { name: 'Facebook Marketplace', fees: '0%', speed: 'fast', bestFor: 'bulky items' },
    { name: 'Leboncoin', fees: '0-8%', speed: 'medium', bestFor: 'all furniture' },
    { name: 'Geev', fees: '0%', speed: 'fast', bestFor: 'free giveaway (karma)' },
  ],
  books: [
    { name: 'Momox', fees: 'fixed price', speed: 'instant', bestFor: 'bulk books' },
    { name: 'Leboncoin', fees: '0%', speed: 'slow', bestFor: 'rare/valuable books' },
    { name: 'RecycLivre', fees: '0%', speed: 'instant', bestFor: 'donation + tax benefit' },
  ],
  // ... gaming, sports, collectibles, etc.
};
```

**Tool: estimate_days_to_sell**
```typescript
interface EstimateDaysInput {
  category: string;
  pricePoint: 'low' | 'medium' | 'high';  // vs market average
  condition: string;
  platform: string;
  seasonality?: boolean;   // Consider time of year
}

interface EstimateDaysOutput {
  estimatedDays: { min: number; max: number; average: number };
  confidence: number;      // 0-1
  factors: string[];       // "High demand season", "Competitive price"
  tip: string;             // "Post on weekend for 30% more views"
}
```

**Estimation logic**:
```typescript
const BASE_DAYS: Record<string, number> = {
  electronics: 7,
  clothing: 14,
  furniture: 21,
  books: 30,
  gaming: 10,
  sports: 14,
};

// Modifiers
const PRICE_MODIFIER = { low: 0.5, medium: 1.0, high: 2.0 };
const CONDITION_MODIFIER = { new: 0.7, like_new: 0.9, good: 1.0, fair: 1.5 };
const SEASON_MODIFIER = {
  electronics: { 'Nov-Dec': 0.5, 'Jan': 1.5 },  // Holiday demand
  clothing: { 'Sep': 0.7, 'Mar': 0.7 },         // Season change
  sports: { 'Jan': 0.6, 'Sep': 0.7 },           // New Year resolutions, rentrée
};
```

---

#### H.3 Swipe Orchestrator Agent (✅ Implémenté)
**Fichier**: `packages/mcp-server/src/agents/swipe-orchestrator.ts`

**Rôle**: Orchestrer tous les agents pour générer et prioriser les scénarios de swipe.

**Architecture**:
```
┌─────────────────────────────────────────────────────────────────┐
│                    SWIPE ORCHESTRATOR                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Trade      │  │   Lifestyle  │  │  Job Matcher │          │
│  │   Agent      │  │   Agent      │  │    Agent     │          │
│  │  (sell/trade)│  │ (pause/reduce│  │ (job leads)  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│         └────────────┬────┴────────────────┘                    │
│                      ▼                                           │
│         ┌────────────────────────┐                              │
│         │  Strategy Comparator   │                              │
│         │  (rank all scenarios)  │                              │
│         └────────────┬───────────┘                              │
│                      ▼                                           │
│         ┌────────────────────────┐                              │
│         │  Preference Learner    │                              │
│         │  (apply user prefs)    │                              │
│         └────────────┬───────────┘                              │
│                      ▼                                           │
│         ┌────────────────────────┐                              │
│         │       Guardian         │                              │
│         │  (validate final list) │                              │
│         └────────────────────────┘                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Input**:
```typescript
interface SwipeOrchestratorInput {
  // Data sources (Pull Architecture)
  trades: SwipeTradeItem[];
  lifestyle: SwipeLifestyleItem[];
  leads: Lead[];

  // User context
  skills: Array<{ name: string; hourlyRate: number }>;
  goalContext: SwipeContext;
  energyLevel: number;

  // Preferences (learned from swipes)
  preferences: {
    effortSensitivity: number;      // 0-1
    hourlyRatePriority: number;     // 0-1
    timeFlexibility: number;        // 0-1
    incomeStability: number;        // 0-1
  };

  // Swipe history for learning
  recentSwipes?: Array<{
    scenarioId: string;
    category: ScenarioCategory;
    direction: 'left' | 'right' | 'up' | 'down';
    timeSpent: number;
  }>;
}
```

**Output**:
```typescript
interface SwipeOrchestratorOutput {
  scenarios: Scenario[];            // Ordonnés par score

  insights: {
    topOpportunity: {
      scenario: Scenario;
      reason: string;               // LLM explanation
    };
    quickWins: Scenario[];          // Low effort, high impact
    bigMoves: Scenario[];           // High effort, high reward
    categoryBreakdown: Record<ScenarioCategory, number>;
  };

  recommendations: {
    focusArea: 'selling' | 'jobs' | 'savings' | 'karma';
    reason: string;
    suggestedActions: string[];
  };

  // Preference adjustments from learning
  preferenceUpdates?: Partial<UserPreferences>;
}
```

**Outils Mastra**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tool: orchestrate_scenario_generation                            │
├─────────────────────────────────────────────────────────────────┤
│ Input: trades, lifestyle, leads, goalContext                     │
│ Output: raw scenarios from all sources                           │
│                                                                  │
│ Logic:                                                           │
│ 1. Call Trade Agent → sell_item, karma_trade, karma_lend        │
│ 2. Call Lifestyle Agent → pause_expense scenarios               │
│ 3. Call Job Matcher → job_lead scenarios with skill match       │
│ 4. Merge all scenarios with source tracking                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: rank_scenarios_by_preference                               │
├─────────────────────────────────────────────────────────────────┤
│ Input: scenarios[], preferences, goalContext                     │
│ Output: ranked scenarios with scores                             │
│                                                                  │
│ Scoring formula:                                                 │
│ score = (goalImpact × 0.3)                                      │
│       + (1 - effort × effortSensitivity) × 0.25                 │
│       + (hourlyRate × hourlyRatePriority) × 0.2                 │
│       + (flexibility × timeFlexibility) × 0.15                  │
│       + (skillMatch × 0.1)                                      │
│                                                                  │
│ Urgency boost: if daysToGoal < 14 → score × 1.2                 │
│ Energy penalty: if energyLevel < 40 && effort > 3 → score × 0.7│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: learn_from_swipes                                          │
├─────────────────────────────────────────────────────────────────┤
│ Input: recentSwipes[], currentPreferences                        │
│ Output: preferenceUpdates                                        │
│                                                                  │
│ Logic:                                                           │
│ - Right swipes on low-effort → increase effortSensitivity      │
│ - Right swipes on high-paying → increase hourlyRatePriority    │
│ - Left swipes patterns → detect dislikes (category, effort)    │
│ - Super likes (up) → strong positive signal                    │
│ - Down swipes → negative feedback, reduce category weight      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: generate_swipe_insights                                    │
├─────────────────────────────────────────────────────────────────┤
│ Input: rankedScenarios[], goalContext, energyLevel               │
│ Output: insights + recommendations                               │
│                                                                  │
│ LLM prompt:                                                      │
│ "Given these scenarios and user context, identify:              │
│  1. The single best opportunity and why                         │
│  2. Quick wins (< 2h effort, > 5% goal impact)                  │
│  3. Big moves (high effort but transformative)                  │
│  4. What area to focus on given energy level"                   │
└─────────────────────────────────────────────────────────────────┘
```

---

#### H.4 Swipe Strategy (Tab Strategy) (⏳ TODO)
**Fichier**: `packages/mcp-server/src/agents/strategies/swipe.strategy.ts` (à enrichir)

**Intégration avec Tab Tips Orchestrator**:
```typescript
export class SwipeStrategy extends BaseTabStrategy {
  readonly tabType: TabType = 'swipe';

  getPrimaryAgentId(): string {
    return 'swipe-orchestrator';  // Nouveau
  }

  getSecondaryAgentIds(): string[] {
    return ['lifestyle-agent', 'money-maker', 'job-matcher', 'guardian'];
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: 'swipe',
      checkFeasibility: true,    // Vérifier énergie vs effort
      checkSolvency: false,
      checkRealism: true,        // Valuations réalistes
      checkTimeline: true,       // Goal atteignable ?
      minConfidence: 0.6,
      maxRiskLevel: 'medium',
    };
  }

  getSystemPrompt(): string {
    return `You are Bruno, a caring financial coach for students.

You are helping with the SWIPE feature - presenting money-making scenarios.

Given the user's context:
- Goal: {{goalAmount}} in {{daysToGoal}} days ({{remainingAmount}} remaining)
- Energy level: {{energyLevel}}%
- Preferences: effort={{effortSensitivity}}, rate={{hourlyRatePriority}}

Analyze the scenarios and provide:
1. Which scenario to focus on first and why
2. One encouraging tip about their progress
3. If energy is low, prioritize passive income (selling, pausing)

Be concise (2-3 sentences max), warm, and actionable.`;
  }
}
```

---

#### Fichiers à créer/modifier

| Fichier | Action | Contenu |
|---------|--------|---------|
| `agents/lifestyle-agent.ts` | **Créer** | 3 outils + agent config |
| `agents/money-maker.ts` | **Modifier** | +2 outils (platform, days) |
| `agents/swipe-orchestrator.ts` | **Créer** | 4 outils + orchestration |
| `agents/factory.ts` | **Modifier** | +2 agents dans AGENT_CONFIGS |
| `agents/index.ts` | **Modifier** | Exports + imports |
| `agents/strategies/swipe.strategy.ts` | **Modifier** | Nouveau primary agent |
| `agents/agent-executor.ts` | **Modifier** | +2 executors |

---

#### Ordre d'implémentation

```
1. H.1 Lifestyle Agent
   ├── Créer lifestyle-agent.ts
   ├── Définir 3 outils
   ├── Ajouter à factory.ts
   └── Tester isolément

2. H.2 Trade Agent Améliorations
   ├── Ajouter suggest_selling_platform à money-maker.ts
   ├── Ajouter estimate_days_to_sell
   └── Tester avec différentes catégories

3. H.3 Swipe Orchestrator
   ├── Créer swipe-orchestrator.ts
   ├── Définir 4 outils
   ├── Intégrer appels aux autres agents
   └── Tester orchestration complète

4. H.4 Intégration Tab Strategy
   ├── Modifier swipe.strategy.ts
   ├── Mettre à jour agent-executor.ts
   └── Tester via /api/tips endpoint
```

---

#### Tests de validation

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| H.1 | Lifestyle avec Netflix + Spotify + Gym | Suggère pause gym si énergie < 40% |
| H.2 | Item iPhone category=electronics | Suggère Back Market ou eBay, 7-10 jours |
| H.3 | Mix trades + leads + lifestyle | Ordonne par score composite |
| H.4 | User swipe right low-effort items | effortSensitivity augmente |
| H.5 | energyLevel=30%, high-effort job | Job rétrogradé, selling promu |

---

## 📊 Architecture Pull - Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER JOURNEY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. EXPLORE                    2. DECIDE                3. ACT             │
│   ┌─────────────────┐          ┌─────────────┐         ┌─────────────┐     │
│   │ Trade Tab       │────┐     │             │         │             │     │
│   │ • Add sell item │    │     │   SWIPE     │         │  Progress   │     │
│   │ • Add lend/trade│    │     │   AGENT     │         │             │     │
│   └─────────────────┘    │     │             │         │  Missions   │     │
│   ┌─────────────────┐    ├────▶│ • Aggregate │────────▶│  created    │     │
│   │ Jobs Tab        │    │     │ • Rank      │         │             │     │
│   │ • Mark interested│───┤     │ • Present   │         │  Complete/  │     │
│   └─────────────────┘    │     │             │         │  Undo       │     │
│   ┌─────────────────┐    │     └─────────────┘         └──────┬──────┘     │
│   │ Budget Tab      │────┘                                    │             │
│   │ • Subscriptions │        ⚠️ If no content:               │             │
│   └─────────────────┘           EmptySwipeView               │             │
│          ▲                                                    │             │
│          │                    4. SYNC BACK                    │             │
│          └────────────────────────────────────────────────────┘             │
│                                                                              │
│   When mission completed → Update source item status                        │
│   When undone → Restore source item to 'pending' (re-proposable)           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Fichiers clés

### Modifiés (Phase 1-7)

| Fichier | Rôle |
|---------|------|
| `components/tabs/SwipeTab.tsx` | Interface Scenario, generateScenarios() Pull, karma totals, **skill match calc** |
| `components/swipe/SwipeCard.tsx` | Props urgency/karma, badges visuels, **skillMatchPercent badge** |
| `components/swipe/SwipeSession.tsx` | Catégories adaptées, recalcul weeklyEarnings, **pass skillMatchPercent** |
| `routes/swipe.tsx` | canAccessSwipe(), EmptySwipeView, goalContext, mission deduplication filter |
| `routes/progress.tsx` | syncMissionToSource(), source/sourceId, karmaScore prop to TimelineHero |
| `components/suivi/MissionCard.tsx` | Icônes Pull Architecture, karma display (lend/trade/borrow) |
| `components/suivi/TimelineHero.tsx` | karmaScore indicator + tier label in progress bar |
| `components/tabs/TradeTab.tsx` | contextTrades() for karma score, **karma tier card with progress** |
| `components/prospection/ProspectionCard.tsx` | **skillMatch badge + progress bar** |
| `components/prospection/ProspectionList.tsx` | **skillMatch badge + tooltip breakdown** |
| `hooks/useKarma.ts` | KARMA_POINTS constants, **getKarmaTierInfo()** |
| `lib/jobScoring.ts` | **export matchSkillsToCategory()** |

### À modifier (Checkpoints futurs)

| Fichier | Changement |
|---------|------------|
| `components/tabs/BudgetTab.tsx` | Contrainte pausedMonths par deadline (Checkpoint C) |
| `routes/api/prospection.ts` | Ajouter applicationDeadline, isHot (Checkpoint D) |
| `lib/profileService.ts` | Ajouter swipeFeedback, karma_points (Checkpoints E, G) |

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
| 7 | Compléter vente iPhone → onglet Trade | iPhone marqué "completed" |
| 8 | Undo vente iPhone | iPhone revient à "pending", reproposable au swipe |
| 9 | Ajuster tarif horaire job 15→25€ | weeklyEarnings recalculé correctement |
| 10 | Compléter job avec 0€ | Toast warning, blocage |

### ✅ Testables après Checkpoint A

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 11 | Job 10h/sem à 20€/h, goal 1000€ en 5 sem | Badge "🎯 40% of your goal!" (dynamique avec adjustments) |

### ✅ Testables après Checkpoint B

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 12 | Pause Netflix 3 mois dans swipe | Boutons 1-6 mois, goal impact = monthlyAmount × pauseMonths |
| 13 | Deadline dans 2 mois, pause expense | Boutons 3-6 désactivés (grisés) |
| 14 | Compléter pause 3 mois | Mission stocke pauseMonths=3, sync vers lifestyle API |

### ✅ Testables après Phase 6 (Karma Loop)

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 15 | Swipe lend + trade items | Summary: "Total: X€ + Y karma" |
| 16 | Mission karma_lend affichée | "+50 karma" au lieu de €0 |
| 17 | Mission karma_borrow affichée | "X€ saved + 🤍+20" |
| 18 | Compléter mission lend | Karma score augmente dans Trade tab |
| 19 | TimelineHero avec karma | "🤍 X karma" visible à côté du status |
| 20 | Job déjà accepté → Swipe | Pas de doublon, filtré par missionSourceIds |
| 21 | Mission skipped → Swipe | Réapparaît (seuls active/completed filtrés) |

### ✅ Testables après Phase 7 (Skill Match & Fixes)

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 22 | Job sauvé avec skills matchants → Swipe | Badge "✨ X% skill match" visible |
| 23 | Vendre item 10% du goal → Swipe | Badge "🎯 10% of your goal!" visible |
| 24 | Trade tab avec karma | Tier affiché (🌱 Newcomer, 🤝 Helper, ⭐ Star) |
| 25 | Trade tab avec karma | Progress bar vers prochain tier |
| 26 | Jobs tab → recherche tutoring | Badge skill match si skill "teaching" présent |

---

## 📅 Historique des commits

| Date | Commit | Phase |
|------|--------|-------|
| 2026-02-05 | `feat(swipe): Implement Pull Architecture for scenarios` | Phase 1 |
| 2026-02-05 | `feat(swipe): Add access control for empty swipe state` | Phase 2 |
| 2026-02-05 | `fix(swipe): Improve SwipeCard visual distinction for scenario types` | Phase 3 |
| 2026-02-05 | `fix(progress): Handle Pull Architecture scenario types to prevent NaN` | Phase 5 |
| 2026-02-05 | `fix(swipe): Recalculate weeklyEarnings when adjusting job rate/hours` | Phase 5 |
| 2026-02-05 | `feat(progress): Sync mission completion with source Trade/Lifestyle` | Phase 4 |
| 2026-02-05 | `feat(swipe): Add goal impact % badge on all cards with dynamic recalc` | Checkpoint A |
| 2026-02-05 | `feat(swipe): Add Goal Impact badge + pause duration selector` | Checkpoints A+B |
| 2026-02-05 | `feat(karma): Add karma totals to swipe summary + unified KARMA_POINTS` | Phase 6/G |
| 2026-02-05 | `feat(karma): Display karma in MissionCard (lend/trade/borrow)` | Phase 6/G |
| 2026-02-05 | `feat(karma): Add karma indicator in TimelineHero progress bar` | Phase 6/G |
| 2026-02-05 | `fix(trade): Use contextTrades() for karma score (reactivity fix)` | Phase 6/G |
| 2026-02-05 | `fix(swipe): Filter out items that already have active missions` | Phase 6 |
| 2026-02-05 | `feat(karma): Add tier levels (Newcomer/Helper/Star) with progress` | Phase 7/G |
| 2026-02-05 | `feat(prospection): Add visible skill match badges and breakdown` | Phase 7/F.3 |
| 2026-02-05 | `fix(swipe): Show goal impact badge on sell_item when urgency < 75` | Phase 7 |
| 2026-02-05 | `feat(swipe): Add skill match badge on job_lead swipe cards` | Phase 7/F.4 |
