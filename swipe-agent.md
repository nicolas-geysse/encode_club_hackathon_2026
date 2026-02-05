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

### Checkpoint H.5: Guardrail Agents (⏳ TODO)
**Objectif**: Intelligence financière avancée - filtrer, enrichir et protéger les scénarios

Ces agents agissent comme des **couches de protection** entre l'agrégation et la présentation des scénarios.

```
SCENARIO AGGREGATOR
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GUARDRAIL AGENTS                                │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │ H.5.1            │  │ H.5.2            │  │ H.5.3            │      │
│  │ Ghost Observer   │  │ Cash Flow        │  │ Asset-to-Income  │      │
│  │                  │  │ Smoothing        │  │ Pivot            │      │
│  │ "Filtre          │  │                  │  │                  │      │
│  │  comportemental" │  │ "Anti-découvert" │  │ "Louer vs        │      │
│  │                  │  │                  │  │  Vendre"         │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
│           │                     │                     │                 │
│           ▼                     ▼                     ▼                 │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ H.5.4 Essential Guardian                                     │      │
│  │ "Protège les vitaux + suggère alternatives structurelles"    │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  SwipeScenario[] (filtered + enriched + protected)
```

---

#### H.5.1 Ghost Observer (Le Miroir Psychologique)
**Fichier**: `packages/mcp-server/src/agents/ghost-observer.ts`

**Mantra**: *"Listen to what users DO, not what they SAY."*

**Problème**: Les utilisateurs se mentent à eux-mêmes. "Je vais faire ce job" alors qu'ils le détestent et le rejettent systématiquement.

**Solution**: Analyser les patterns de swipe pour détecter les rejets répétés et adapter les propositions.

**Interfaces**:
```typescript
interface SwipeHistory {
  scenarioId: string;
  category: ScenarioCategory;
  sourceId: string;
  decision: 'left' | 'right';
  timestamp: string;
  metadata: {
    effort: number;
    amount: number;
    tags: string[];
  };
}

interface GhostObserverInput {
  recentSwipes: SwipeHistory[];        // Derniers 50 swipes
  candidateScenarios: SwipeScenario[]; // Scénarios à filtrer
  profileId: string;
}

interface RejectionPattern {
  type: 'category' | 'effort_level' | 'tag' | 'source';
  value: string;
  rejectionCount: number;
  lastRejected: string;
  confidence: number;  // 0-1, based on sample size
}

interface GhostObserverOutput {
  filteredScenarios: SwipeScenario[];  // Scénarios nettoyés
  blockedCount: number;
  patterns: RejectionPattern[];
  recommendations: string[];           // "User avoids high-effort jobs"
}
```

**Outils Mastra**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tool: detect_rejection_patterns                                  │
├─────────────────────────────────────────────────────────────────┤
│ Input: recentSwipes[]                                            │
│ Output: RejectionPattern[]                                       │
│                                                                  │
│ Logic:                                                           │
│ - Groupe les swipes left par catégorie/effort/tag               │
│ - Si ≥3 rejets consécutifs sur même critère → pattern détecté   │
│ - Si ≥5 rejets total sur critère → haute confiance              │
│ - Calcule confidence = rejectionCount / (rejections + accepts)  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: filter_by_patterns                                         │
├─────────────────────────────────────────────────────────────────┤
│ Input: candidateScenarios[], patterns[]                          │
│ Output: { filtered: Scenario[], blocked: Scenario[] }            │
│                                                                  │
│ Logic:                                                           │
│ - Pour chaque scénario, vérifie contre les patterns             │
│ - Si pattern.confidence > 0.7 → bloque le scénario              │
│ - Si pattern.confidence 0.5-0.7 → réduit le score de 30%        │
│ - Log les scénarios bloqués pour Opik tracing                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: generate_behavior_insights                                 │
├─────────────────────────────────────────────────────────────────┤
│ Input: patterns[], profileId                                     │
│ Output: string[] (human-readable insights)                       │
│                                                                  │
│ Examples:                                                        │
│ - "Tu rejettes systématiquement les jobs physiques (5x)"        │
│ - "Les offres > 100€ sont toujours acceptées"                   │
│ - "Tu préfères vendre plutôt que travailler"                    │
└─────────────────────────────────────────────────────────────────┘
```

**Règles métier**:
```typescript
const GHOST_RULES = {
  // Seuils de détection
  MIN_REJECTIONS_FOR_PATTERN: 3,
  HIGH_CONFIDENCE_THRESHOLD: 5,
  PATTERN_DECAY_DAYS: 14,      // Pattern expire après 2 semaines sans nouveau rejet

  // Actions
  BLOCK_CONFIDENCE: 0.7,       // Bloque si confiance > 70%
  PENALIZE_CONFIDENCE: 0.5,    // Pénalise score si 50-70%
  SCORE_PENALTY: 0.3,          // -30% sur le score

  // Catégories trackées
  TRACKED_DIMENSIONS: ['category', 'effort_level', 'amount_range', 'tag'],
};
```

---

#### H.5.2 Cash Flow Smoothing (L'Anti-Découvert)
**Fichier**: `packages/mcp-server/src/agents/cashflow-smoother.ts`

**Mantra**: *"Don't destroy value for short-term liquidity."*

**Problème**: Décalage temporel entre revenus (bientôt) et dépenses (maintenant). Vendre en urgence détruit de la valeur.

**Solution**: Proposer de décaler une dépense flexible plutôt que de vendre à perte ou s'endetter.

**Interfaces**:
```typescript
interface CashFlowContext {
  currentBalance: number;          // Solde actuel
  upcomingExpenses: Array<{
    id: string;
    name: string;
    amount: number;
    dueDate: string;               // ISO date
    isFlexible: boolean;           // Peut être décalé ?
    category: 'essential' | 'flexible' | 'discretionary';
  }>;
  upcomingIncome: Array<{
    source: string;
    amount: number;
    expectedDate: string;
    confidence: number;            // 0-1, fiabilité de la date
  }>;
  pendingSales: Array<{
    itemId: string;
    itemName: string;
    estimatedValue: number;
    urgency: 'asap' | 'normal' | 'flexible';
  }>;
}

interface TimingMismatch {
  expenseId: string;
  expenseName: string;
  expenseAmount: number;
  expenseDue: string;
  shortfallAmount: number;         // Combien il manque
  incomeArrival: string;           // Quand l'argent arrive
  gapDays: number;                 // Jours entre dépense et revenu
}

interface CashFlowSolution {
  type: 'delay_expense' | 'accelerate_sale' | 'partial_payment' | 'alternative';
  description: string;
  targetId: string;
  originalDate: string;
  suggestedDate: string;
  impactAmount: number;            // Économie ou gain
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

interface CashFlowOutput {
  mismatches: TimingMismatch[];
  solutions: CashFlowSolution[];
  worstCaseDate: string;           // Date critique
  recommendedAction: string;
}
```

**Outils Mastra**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tool: detect_timing_mismatches                                   │
├─────────────────────────────────────────────────────────────────┤
│ Input: currentBalance, upcomingExpenses[], upcomingIncome[]      │
│ Output: TimingMismatch[]                                         │
│                                                                  │
│ Logic:                                                           │
│ - Simule le solde jour par jour sur 30 jours                    │
│ - Détecte les moments où solde < 0                              │
│ - Identifie quelle dépense cause le découvert                   │
│ - Calcule le gap avec le prochain revenu                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: suggest_timing_solutions                                   │
├─────────────────────────────────────────────────────────────────┤
│ Input: mismatch, flexibleExpenses[], pendingSales[]              │
│ Output: CashFlowSolution[]                                       │
│                                                                  │
│ Logic:                                                           │
│ - Si dépense flexible: suggérer report après revenu             │
│ - Si vente en cours: suggérer baisser prix pour accélérer       │
│ - Si abonnement: suggérer pause temporaire                      │
│ - Prioriser solutions par risque (low first)                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: evaluate_urgency_sale                                      │
├─────────────────────────────────────────────────────────────────┤
│ Input: pendingSale, mismatch, normalSaleValue                    │
│ Output: { shouldAccelerate: boolean, priceReduction: number }    │
│                                                                  │
│ Logic:                                                           │
│ - Calcule la perte de valeur si vente urgente (-20% environ)    │
│ - Compare avec coût du découvert (agios, frais)                 │
│ - Si perte > coût découvert → recommande décaler                │
│ - Si perte < coût découvert → recommande vente rapide           │
└─────────────────────────────────────────────────────────────────┘
```

**Règles métier**:
```typescript
const CASHFLOW_RULES = {
  // Seuils
  URGENCY_SALE_DISCOUNT: 0.20,     // -20% pour vente urgente
  OVERDRAFT_DAILY_FEE: 0.50,       // 0.50€/jour de découvert estimé
  MAX_DELAY_DAYS: 14,              // Max 2 semaines de report

  // Catégories décalables
  DELAYABLE_CATEGORIES: ['flexible', 'discretionary'],
  NEVER_DELAY: ['rent', 'utilities', 'insurance'],

  // Priorité des solutions
  SOLUTION_PRIORITY: ['delay_expense', 'partial_payment', 'accelerate_sale', 'alternative'],
};
```

---

#### H.5.3 Asset-to-Income Pivot (L'Éducation Actif/Passif)
**Fichier**: `packages/mcp-server/src/agents/asset-pivot.ts`

**Mantra**: *"Don't sell the goose that lays golden eggs."*

**Problème**: Vendre un actif productif (guitare, vélo, appareil photo) pour du cash rapide est une erreur financière.

**Solution**: Détecter ces ventes et proposer de louer/rentabiliser l'actif à la place.

**Interfaces**:
```typescript
interface ProductiveAsset {
  itemId: string;
  name: string;
  category: string;
  estimatedSaleValue: number;
  isProductive: boolean;           // Peut générer des revenus ?
  productivityType: 'rental' | 'service' | 'teaching' | 'none';
  rentalPotential?: {
    dailyRate: number;
    monthlyRate: number;
    demandLevel: 'low' | 'medium' | 'high';
    platforms: string[];           // "Zilok", "Fat Llama", etc.
  };
  servicePotential?: {
    hourlyRate: number;
    serviceType: string;           // "cours de guitare", "livraison vélo"
    marketDemand: 'low' | 'medium' | 'high';
  };
}

interface AssetPivotSuggestion {
  itemId: string;
  originalAction: 'sell';
  suggestedAction: 'rent' | 'monetize' | 'keep_and_earn';
  comparison: {
    sellOnce: number;              // 150€ une fois
    earnPerMonth: number;          // 30€/mois en location
    breakEvenMonths: number;       // 5 mois pour équivalent
    yearlyEarning: number;         // 360€/an potentiel
  };
  platforms: Array<{
    name: string;
    url: string;
    typicalEarnings: string;
    setup: string;                 // "5 min to list"
  }>;
  recommendation: string;
  confidence: number;
}

interface AssetPivotOutput {
  analyzedItems: ProductiveAsset[];
  pivotSuggestions: AssetPivotSuggestion[];
  totalPreservedValue: number;     // Valeur non vendue
  potentialMonthlyIncome: number;  // Revenus mensuels possibles
}
```

**Outils Mastra**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tool: detect_productive_assets                                   │
├─────────────────────────────────────────────────────────────────┤
│ Input: sellItems[]                                               │
│ Output: ProductiveAsset[]                                        │
│                                                                  │
│ Logic:                                                           │
│ - Catégories productives: instruments, vélos, photo, outils     │
│ - Check si item peut générer des revenus                        │
│ - Estime potentiel location via database de taux                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: calculate_pivot_economics                                  │
├─────────────────────────────────────────────────────────────────┤
│ Input: asset, saleValue, userGoalContext                         │
│ Output: AssetPivotSuggestion                                     │
│                                                                  │
│ Logic:                                                           │
│ - Calcule revenu mensuel potentiel (location)                   │
│ - Calcule break-even vs vente directe                           │
│ - Si break-even < 6 mois ET goal > 6 mois → suggérer pivot      │
│ - Si urgence cash immédiat → recommander vente quand même       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: suggest_monetization_platforms                             │
├─────────────────────────────────────────────────────────────────┤
│ Input: assetCategory, location (city)                            │
│ Output: Platform[]                                               │
│                                                                  │
│ Platforms database:                                              │
│ - Instruments: "Zilok", "Rentez-vous", "local music schools"    │
│ - Vélos: "Velib peer", "Cycling delivery (Uber Eats)"           │
│ - Photo: "Geev Photo", "Wedding photography", "Stock photos"    │
│ - Outils: "Bricolib", "AlloVoisins"                             │
└─────────────────────────────────────────────────────────────────┘
```

**Database des taux de location**:
```typescript
const RENTAL_RATES: Record<string, { daily: number; monthly: number; demand: string }> = {
  // Instruments
  guitar_acoustic: { daily: 10, monthly: 80, demand: 'medium' },
  guitar_electric: { daily: 15, monthly: 120, demand: 'medium' },
  piano_keyboard: { daily: 20, monthly: 150, demand: 'high' },
  violin: { daily: 12, monthly: 100, demand: 'low' },
  drums: { daily: 25, monthly: 200, demand: 'low' },

  // Transport
  bike_city: { daily: 8, monthly: 60, demand: 'high' },
  bike_electric: { daily: 20, monthly: 150, demand: 'high' },
  scooter_electric: { daily: 15, monthly: 100, demand: 'medium' },

  // Photo/Video
  camera_dslr: { daily: 30, monthly: 250, demand: 'medium' },
  camera_mirrorless: { daily: 40, monthly: 300, demand: 'high' },
  lens_pro: { daily: 20, monthly: 150, demand: 'medium' },
  drone: { daily: 50, monthly: 400, demand: 'high' },

  // Tools
  drill: { daily: 5, monthly: 30, demand: 'high' },
  pressure_washer: { daily: 15, monthly: 80, demand: 'medium' },
  lawnmower: { daily: 20, monthly: 100, demand: 'seasonal' },

  // Gaming
  console_ps5: { daily: 15, monthly: 100, demand: 'high' },
  vr_headset: { daily: 20, monthly: 150, demand: 'medium' },

  // Camping/Outdoor
  tent_4person: { daily: 12, monthly: 80, demand: 'seasonal' },
  camping_gear_set: { daily: 25, monthly: 150, demand: 'seasonal' },
};
```

---

#### H.5.4 Essential Guardian (Le Protecteur des Vitaux)
**Fichier**: `packages/mcp-server/src/agents/essential-guardian.ts`

**Mantra**: *"Don't suggest the impossible. Suggest the structural."*

**Problème**: On ne peut pas "pause" le loyer ou "manger moins". Ces suggestions sont irréalistes et frustrantes.

**Solution**: Bloquer les suggestions naïves ET proposer des alternatives structurelles pour réduire les coûts fixes.

**Interfaces**:
```typescript
interface EssentialExpense {
  id: string;
  name: string;
  category: EssentialCategory;
  monthlyAmount: number;
  isReducible: boolean;            // Peut être optimisé (pas supprimé)
  currentOptimizations?: string[]; // Déjà appliqués
}

type EssentialCategory =
  | 'housing'      // Loyer, charges
  | 'food'         // Alimentation
  | 'transport'    // Déplacements essentiels
  | 'health'       // Mutuelle, médicaments
  | 'education'    // Frais scolarité
  | 'utilities';   // Électricité, eau, internet

interface StructuralAlternative {
  expenseId: string;
  type: 'roommate' | 'downgrade' | 'switch_provider' | 'lifestyle_change' | 'subsidy';
  description: string;
  savingsPerMonth: number;
  savingsPercent: number;
  implementationEffort: 'easy' | 'medium' | 'hard';
  implementationTime: string;      // "1 week", "1 month"
  requirements?: string[];         // "Needs landlord approval"
  resources?: string[];            // Links, apps, contacts
}

interface EssentialGuardianInput {
  essentialExpenses: EssentialExpense[];
  candidateScenarios: SwipeScenario[];
  userContext: {
    housingType: 'alone' | 'roommates' | 'family';
    transportMode: 'car' | 'public' | 'bike' | 'walk';
    dietType: 'standard' | 'vegetarian' | 'vegan';
  };
}

interface EssentialGuardianOutput {
  blockedScenarios: Array<{
    scenarioId: string;
    reason: string;
    alternative?: StructuralAlternative;
  }>;
  structuralSuggestions: StructuralAlternative[];
  totalPotentialSavings: number;
  implementationPlan: string[];
}
```

**Outils Mastra**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tool: detect_naive_suggestions                                   │
├─────────────────────────────────────────────────────────────────┤
│ Input: candidateScenarios[]                                      │
│ Output: { blocked: Scenario[], reason: string }[]                │
│                                                                  │
│ Blocked patterns:                                                │
│ - "pause rent" / "pause loyer"                                  │
│ - "eat less" / "manger moins"                                   │
│ - "cancel health insurance"                                     │
│ - Any lifestyle_pause on essential category                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: suggest_structural_alternatives                            │
├─────────────────────────────────────────────────────────────────┤
│ Input: essentialExpense, userContext                             │
│ Output: StructuralAlternative[]                                  │
│                                                                  │
│ Alternatives by category (see database below)                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tool: calculate_structural_impact                                │
├─────────────────────────────────────────────────────────────────┤
│ Input: alternatives[], goalContext                               │
│ Output: { totalSavings, goalImpact, timeline }                   │
│                                                                  │
│ Logic:                                                           │
│ - Somme les économies mensuelles                                │
│ - Calcule l'impact sur l'objectif                               │
│ - Ordonne par effort/bénéfice ratio                             │
└─────────────────────────────────────────────────────────────────┘
```

**Database des alternatives structurelles**:
```typescript
const STRUCTURAL_ALTERNATIVES: Record<EssentialCategory, StructuralAlternative[]> = {
  housing: [
    {
      type: 'roommate',
      description: 'Prendre un colocataire',
      savingsPercent: 40,
      implementationEffort: 'hard',
      implementationTime: '1-2 mois',
      requirements: ['Accord propriétaire', 'Chambre disponible'],
      resources: ['lacartedescolocs.fr', 'appartager.com'],
    },
    {
      type: 'downgrade',
      description: 'Déménager dans plus petit',
      savingsPercent: 25,
      implementationEffort: 'hard',
      implementationTime: '2-3 mois',
    },
    {
      type: 'subsidy',
      description: 'Demander APL/ALS si pas fait',
      savingsPercent: 30,
      implementationEffort: 'easy',
      implementationTime: '2 semaines',
      resources: ['caf.fr'],
    },
  ],

  food: [
    {
      type: 'lifestyle_change',
      description: 'Cuisiner maison (batch cooking dimanche)',
      savingsPercent: 40,
      implementationEffort: 'medium',
      implementationTime: '1 semaine',
      resources: ['marmiton.org/batch-cooking'],
    },
    {
      type: 'lifestyle_change',
      description: 'Réduire viande (2x/semaine max)',
      savingsPercent: 25,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
    },
    {
      type: 'switch_provider',
      description: 'Acheter en vrac / marché fin de journée',
      savingsPercent: 20,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
      resources: ['Too Good To Go app'],
    },
    {
      type: 'subsidy',
      description: 'Resto U / épicerie solidaire CROUS',
      savingsPercent: 50,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
      resources: ['etudiant.gouv.fr'],
    },
  ],

  transport: [
    {
      type: 'lifestyle_change',
      description: 'Passer au vélo (trajets < 5km)',
      savingsPercent: 80,
      implementationEffort: 'medium',
      implementationTime: '1 semaine',
      resources: ['geovelo.fr'],
    },
    {
      type: 'switch_provider',
      description: 'Covoiturage domicile-campus',
      savingsPercent: 50,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
      resources: ['blablacar daily', 'karos.fr'],
    },
    {
      type: 'subsidy',
      description: 'Abonnement jeune / étudiant',
      savingsPercent: 50,
      implementationEffort: 'easy',
      implementationTime: '1 semaine',
    },
  ],

  utilities: [
    {
      type: 'switch_provider',
      description: 'Changer de fournisseur énergie',
      savingsPercent: 15,
      implementationEffort: 'easy',
      implementationTime: '2 semaines',
      resources: ['energie-info.fr/comparateur'],
    },
    {
      type: 'switch_provider',
      description: 'Forfait mobile low-cost (2€ Free, 5€ Red)',
      savingsPercent: 70,
      implementationEffort: 'easy',
      implementationTime: '1 jour',
    },
    {
      type: 'lifestyle_change',
      description: 'Réduire chauffage 1°C = -7% facture',
      savingsPercent: 7,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
    },
  ],

  health: [
    {
      type: 'switch_provider',
      description: 'Mutuelle étudiante LMDE/SMERRA',
      savingsPercent: 30,
      implementationEffort: 'medium',
      implementationTime: '1 mois',
    },
    {
      type: 'subsidy',
      description: 'CSS (Complémentaire Santé Solidaire)',
      savingsPercent: 100,
      implementationEffort: 'medium',
      implementationTime: '1 mois',
      resources: ['ameli.fr/css'],
    },
  ],

  education: [
    {
      type: 'subsidy',
      description: 'Bourse CROUS si non demandée',
      savingsPercent: 100,
      implementationEffort: 'medium',
      implementationTime: '2 mois',
      resources: ['messervices.etudiant.gouv.fr'],
    },
    {
      type: 'subsidy',
      description: 'Aide au mérite, aide mobilité',
      savingsPercent: 50,
      implementationEffort: 'medium',
      implementationTime: '2 mois',
    },
  ],
};
```

---

#### Fichiers à créer pour H.5

| Fichier | Rôle | Outils |
|---------|------|--------|
| `agents/ghost-observer.ts` | Filtre comportemental | 3 outils |
| `agents/cashflow-smoother.ts` | Anti-découvert | 3 outils |
| `agents/asset-pivot.ts` | Louer vs Vendre | 3 outils |
| `agents/essential-guardian.ts` | Protège vitaux | 3 outils |
| `agents/guardrails/index.ts` | Exporte les 4 guardrails | - |

---

#### Ordre d'implémentation H.5

```
1. H.5.4 Essential Guardian (priorité: bloque les suggestions dangereuses)
   ├── detect_naive_suggestions
   ├── suggest_structural_alternatives
   └── calculate_structural_impact

2. H.5.1 Ghost Observer (priorité: filtre les rejets répétés)
   ├── detect_rejection_patterns
   ├── filter_by_patterns
   └── generate_behavior_insights

3. H.5.3 Asset-to-Income Pivot (enrichit les ventes)
   ├── detect_productive_assets
   ├── calculate_pivot_economics
   └── suggest_monetization_platforms

4. H.5.2 Cash Flow Smoothing (timing)
   ├── detect_timing_mismatches
   ├── suggest_timing_solutions
   └── evaluate_urgency_sale
```

---

#### Tests de validation H.5

| # | Scénario | Input | Résultat attendu |
|---|----------|-------|------------------|
| H.5.1a | User rejette 5 jobs "service" | swipe history | Pattern détecté, jobs service bloqués |
| H.5.1b | User accepte tous les sell_item | swipe history | Insight "préfère vendre vs travailler" |
| H.5.2a | Loyer due J+3, salaire J+10 | cashflow context | Suggère report abonnement flexible |
| H.5.2b | Vente urgente -20% vs découvert 3€/j | comparison | Recommande décaler si gap < 7 jours |
| H.5.3a | Guitare à vendre 150€ | sell item | Suggère location 80€/mois, break-even 2 mois |
| H.5.3b | Vélo électrique 500€ | sell item | Suggère livraison Uber Eats 200€/mois |
| H.5.4a | Scenario "pause loyer" | candidate | Bloqué + suggère colocation |
| H.5.4b | Scenario "manger moins" | candidate | Bloqué + suggère batch cooking |

---

#### Fichiers - Status Implémentation

| Fichier | Status | Contenu |
|---------|--------|---------|
| `agents/lifestyle-agent.ts` | ✅ Créé | 4 outils (analyze, suggest, calculate, optimize) |
| `agents/money-maker.ts` | ✅ Modifié | +2 outils (platform, days), SELLING_PLATFORMS db |
| `agents/swipe-orchestrator.ts` | ✅ Créé | 4 outils (gather, rank, generate, process) |
| `agents/ghost-observer.ts` | ⏳ TODO | 3 outils (patterns, filter, insights) |
| `agents/cashflow-smoother.ts` | ⏳ TODO | 3 outils (mismatches, solutions, evaluate) |
| `agents/asset-pivot.ts` | ⏳ TODO | 3 outils (detect, economics, platforms) |
| `agents/essential-guardian.ts` | ⏳ TODO | 3 outils (naive, structural, impact) |
| `agents/guardrails/index.ts` | ⏳ TODO | Exporte les 4 guardrails |
| `agents/index.ts` | ✅ Modifié | Exports lifestyle + orchestrator |
| `agents/strategies/swipe.strategy.ts` | ⏳ TODO | Intégrer orchestrator + guardrails |

---

#### Ordre d'implémentation (mis à jour)

```
✅ FAIT:
1. H.1 Lifestyle Agent (4 outils)
2. H.2 Trade Agent (+2 outils)
3. H.3 Swipe Orchestrator (4 outils)

⏳ EN COURS:
4. H.5.4 Essential Guardian (PRIORITÉ - bloque suggestions dangereuses)
   ├── detect_naive_suggestions
   ├── suggest_structural_alternatives
   └── calculate_structural_impact

5. H.5.1 Ghost Observer (filtre comportemental)
   ├── detect_rejection_patterns
   ├── filter_by_patterns
   └── generate_behavior_insights

6. H.5.3 Asset-to-Income Pivot (enrichit ventes)
   ├── detect_productive_assets
   ├── calculate_pivot_economics
   └── suggest_monetization_platforms

7. H.5.2 Cash Flow Smoothing (timing)
   ├── detect_timing_mismatches
   ├── suggest_timing_solutions
   └── evaluate_urgency_sale

⏳ APRÈS:
8. H.4 Intégration Frontend
   ├── Modifier swipe.strategy.ts
   ├── Wirer orchestrator + guardrails
   └── Tester via /swipe endpoint
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
