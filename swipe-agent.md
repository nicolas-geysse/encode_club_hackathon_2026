# Swipe Agent Redesign

## Problème identifié

Le système de Swipe actuel présente une confusion architecturale fondamentale :

### Comportement actuel (incorrect)
```
Skills → Scenarios → Missions
         ↑
         Crée directement "Freelance Python" comme mission
```

Les **skills sont transformés en scénarios actionnables**, ce qui n'a aucun sens :
- Un skill "Python" génère un scénario "Freelance Python" à 5h/semaine
- Ce scénario devient une mission "Freelance Python" dans Progress
- Mais **on ne peut pas "activer" un skill** - c'est une compétence, pas une action !

### Comportement attendu
```
Skills → Job Matching Agent → Leads → Scenarios → Missions
               ↓
         Trouve des jobs qui matchent les skills
```

Les **skills servent à matcher des jobs**, pas à devenir des missions :
- Un skill "Python" aide à trouver des offres de dev Python
- Ces offres (Leads) peuvent ensuite être swipées
- Les leads acceptés deviennent des missions

---

## Sources de données pour le Swipe

Le Swipe doit fonctionner uniquement avec des **actions concrètes** :

### 1. Items vendables (Trade type='sell')
| Source | Exemple | Action |
|--------|---------|--------|
| Trade tab | PS4 à 150€ | Vendre sur LeBonCoin |
| Trade tab | Vélo à 80€ | Vendre sur Facebook Marketplace |

**Critère d'accès** : Au moins 1 item avec `type='sell'` et `status='available'`

### 2. Job Leads sauvegardés (Prospection tab)
| Source | Exemple | Action |
|--------|---------|--------|
| Prospection | Serveur au Café du Coin | Postuler / Contacter |
| Prospection | Baby-sitter chez les Martin | Répondre à l'annonce |

**Critère d'accès** : Au moins 1 lead avec `status='interested'`

### 3. Réduction de dépenses (Lifestyle tab)
| Source | Exemple | Action |
|--------|---------|--------|
| Lifestyle | Netflix 15€/mois | Mettre en pause 3 mois |
| Lifestyle | Salle de sport 40€/mois | Suspendre pendant examens |

**Nouveau** : Générer des scénarios de pause/réduction basés sur les items Lifestyle actifs

### 4. Actions Karma (Trade type='trade' ou 'lend')
| Source | Exemple | Action |
|--------|---------|--------|
| Trade (trade) | Échange vélo ↔ skate | Trouver un partenaire d'échange |
| Trade (lend) | Prêter appareil photo | Poster sur groupe WhatsApp |

**Bénéfice** : Social + potentiel réciprocité future (karma points)

---

## Principes architecturaux

### Architecture "Pull" (vs. Push)

L'erreur fondamentale de l'implémentation actuelle est une architecture **Push** :
- Le Swipe **invente** des scénarios à partir de données brutes
- C'est fragile, peu réaliste, et mélange logique métier avec la vue

La nouvelle architecture est **Pull** :
- Le Swipe **agrège** des opportunités que les autres onglets ont déjà validées
- Chaque source (Trade, Jobs, Lifestyle) prépare ses "swipeable items"
- Le Swipe ne fait que les présenter et collecter les décisions

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE PULL                             │
│                                                                  │
│  Trade Tab        Jobs Tab         Lifestyle Tab                │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐               │
│  │ Mark as    │   │ Mark as    │   │ Suggest    │               │
│  │ "for sale" │   │"interested"│   │ "pausable" │               │
│  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘               │
│        │                │                │                       │
│        ▼                ▼                ▼                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SWIPEABLE POOL (ready items)                │   │
│  │  • Ne contient que des opportunités validées            │   │
│  │  • Chaque item a déjà ses métadonnées (prix, effort)    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│                    SWIPE AGENT (orchestre)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Swipe Agent = "Final Boss"

Le Swipe est le **boss de fin de niveau** dans le parcours utilisateur :

1. **Explore d'abord** : L'utilisateur peuple son inventaire (Trade, Jobs, Lifestyle)
2. **Décide ensuite** : Le Swipe présente les meilleures opportunités agrégées
3. **Agit enfin** : Les choix deviennent des missions dans Progress

Si les sous-agents n'ont rien trouvé → **pas de Swipe possible**. Ça force l'exploration.

---

## Architecture Swipe Agent

### Vue d'ensemble (avec Feedback Loop)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SWIPE AGENT                                  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Trade Agent  │  │ Jobs Agent   │  │ Lifestyle    │              │
│  │ (sell items) │  │ (leads)      │  │ Agent        │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                 │                       │
│         ▼                  ▼                 ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              SCENARIO AGGREGATOR + URGENCY RANKER            │   │
│  │  • Rank by URGENCY first (deadline, expiration)             │   │
│  │  • Then by effort/reward ratio                               │   │
│  │  • Filter by user energy level                               │   │
│  │  • Apply user preferences (from previous swipes)            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              SWIPE UI (existing)                             │   │
│  │  • Tinder-style cards                                        │   │
│  │  • Preference learning                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                    ┌─────────┴─────────┐                            │
│                    ▼                   ▼                            │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐   │
│  │  MISSION GENERATOR   │  │        FEEDBACK LOOP              │   │
│  │  • Selected → Missions│  │  • Rejections → inform sub-agents│   │
│  │  • Set tracking       │  │  • "10× NO freelance" → stop it  │   │
│  └──────────────────────┘  └───────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Agents impliqués

#### 1. Trade Agent (existant, à adapter)
```typescript
interface TradeAgentInput {
  trades: TradeItem[];
  userLocation?: { lat: number; lng: number };
  goalContext?: {
    remainingAmount: number;
    daysRemaining: number;
  };
  // NOUVEAU: Feedback des swipes précédents
  swipeFeedback?: AggregatedFeedback;
}

interface TradeAgentOutput {
  sellableItems: Array<{
    item: TradeItem;
    estimatedDaysToSell: number;
    suggestedPlatform: string;
    urgencyScore: number;        // 0-100 (normalized)
    urgencyReason?: string;      // "💰 20% of your goal!"
    goalImpactPercent?: number;  // Impact sur le goal
  }>;
  karmaActions: Array<{
    item: TradeItem;
    socialBenefit: string;
    karmaPoints: number;
  }>;
}
```

#### 2. Jobs Agent (nouveau nom pour Prospection)
```typescript
interface JobsAgentInput {
  skills: Skill[];
  leads: Lead[];
  userLocation: { lat: number; lng: number };
  energyLevel: number; // 1-100
  preferences: UserPreferences;
  // NOUVEAU: Feedback des swipes précédents
  swipeFeedback?: AggregatedFeedback;
}

interface JobsAgentOutput {
  rankedJobs: Array<{
    lead: Lead;
    matchScore: number; // 0-100
    requiredSkills: string[];
    missingSkills: string[];
    effortLevel: number; // 1-5
    // NOUVEAU: Urgency
    urgencyScore: number;
    urgencyReason?: string;
  }>;
  // NOUVEAU: Catégories exclues suite au feedback
  excludedCategories?: string[];
}
```

#### 3. Lifestyle Agent (nouveau)
```typescript
interface LifestyleAgentInput {
  lifestyle: LifestyleItem[];
  goalAmount: number;
  daysRemaining: number;
  today: Date;
  // NOUVEAU: Feedback des swipes précédents
  swipeFeedback?: AggregatedFeedback;
}

interface LifestyleAgentOutput {
  pauseOpportunities: Array<{
    item: LifestyleItem;
    suggestedPauseMonths: number;
    totalSavings: number;
    impactOnGoal: string;        // "Gets you 15% closer"
    // NOUVEAU: Urgency basée sur date de prélèvement
    urgencyScore: number;        // 0-100
    urgencyReason?: string;      // "⚡ Expires in 3 days!"
    nextBillingDate?: Date;      // Date du prochain prélèvement
    daysUntilBilling?: number;
  }>;
  reductionOpportunities: Array<{
    item: LifestyleItem;
    currentCost: number;
    suggestedCost: number;
    actionNeeded: string;        // "Downgrade to basic plan"
    urgencyScore: number;
  }>;
}
```

---

## Urgency Factor (Priorisation Intelligente)

Le tri actuel est trop "plat" - toutes les cartes ont le même poids. L'agent doit prioriser par **urgence** :

### Sources d'urgence

| Source | Signal d'urgence | Exemple |
|--------|------------------|---------|
| **Lifestyle** | Date de prélèvement proche | Netflix se renouvelle dans 3 jours → haute priorité |
| **Jobs** | Offre "Hot" / date limite | "Postuler avant le 10 février" → monte en tête |
| **Trade** | Saisonnalité / tendance | Vélo en avril = meilleur moment → priorité |
| **Goal** | Deadline proche | Plus que 2 semaines → boost items rapides |

### Calcul du score d'urgence

```typescript
interface UrgencyScore {
  score: number;      // 0-100
  reason: string;     // Explication pour l'UI
  daysUntilAction: number | null;
}

function calculateUrgency(scenario: Scenario, context: SwipeContext): UrgencyScore {
  const { goalDeadline, today } = context;
  const daysToGoal = differenceInDays(goalDeadline, today);

  // Lifestyle: Date de prélèvement
  if (scenario.category === 'pause_expense') {
    const nextBillingDate = scenario.metadata?.nextBillingDate;
    if (nextBillingDate) {
      const daysToBilling = differenceInDays(nextBillingDate, today);
      if (daysToBilling <= 3) {
        return { score: 95, reason: '⚡ Expires in 3 days!', daysUntilAction: daysToBilling };
      }
      if (daysToBilling <= 7) {
        return { score: 80, reason: '⏰ Billing soon', daysUntilAction: daysToBilling };
      }
    }
  }

  // Jobs: Offres avec deadline
  if (scenario.category === 'job_lead') {
    const applicationDeadline = scenario.metadata?.applicationDeadline;
    if (applicationDeadline) {
      const daysToDeadline = differenceInDays(applicationDeadline, today);
      if (daysToDeadline <= 2) {
        return { score: 90, reason: '🔥 Apply now!', daysUntilAction: daysToDeadline };
      }
    }
    // Jobs "hot" (recent, high activity)
    if (scenario.metadata?.isHot) {
      return { score: 75, reason: '🔥 Hot opportunity', daysUntilAction: null };
    }
  }

  // Trade: Impact sur goal si deadline proche
  if (scenario.category === 'sell_item' && daysToGoal < 14) {
    const impactPercent = (scenario.oneTimeAmount || 0) / context.remainingAmount * 100;
    if (impactPercent >= 10) {
      return { score: 85, reason: `💰 ${impactPercent.toFixed(0)}% of your goal!`, daysUntilAction: null };
    }
  }

  // Default: base urgency
  return { score: 50, reason: '', daysUntilAction: null };
}
```

### Affichage dans l'UI

Les cartes avec haute urgence ont un badge visuel :
```tsx
<Show when={urgency.score >= 75}>
  <Badge variant="destructive" class="absolute top-2 right-2 animate-pulse">
    {urgency.reason}
  </Badge>
</Show>
```

---

## Feedback Loop (Apprentissage bidirectionnel)

Si l'utilisateur swipe "NON" à 10 offres de freelance, l'agent Prospection doit le savoir et arrêter d'en proposer.

### Structure du Feedback

```typescript
interface SwipeFeedback {
  scenarioId: string;
  category: Scenario['category'];
  decision: 'accepted' | 'rejected' | 'meh';  // meh = strong dislike
  timestamp: Date;
  // Contexte du rejet
  rejectionPattern?: {
    sourceType: 'trade' | 'prospection' | 'lifestyle';
    categoryTag?: string;   // e.g., "freelance", "restaurant", "streaming"
    effortLevel?: number;
    hourlyRate?: number;
  };
}

interface AggregatedFeedback {
  // Compteurs par catégorie
  categoryStats: Record<string, {
    accepted: number;
    rejected: number;
    ratio: number;  // accepted / total
  }>;
  // Patterns de rejet forts
  strongDislikes: Array<{
    pattern: string;   // e.g., "freelance jobs", "high-effort items"
    count: number;
    lastSeen: Date;
  }>;
}
```

### Utilisation par les sub-agents

```typescript
// Dans Jobs Agent
function filterLeadsByFeedback(leads: Lead[], feedback: AggregatedFeedback): Lead[] {
  const freelanceStats = feedback.categoryStats['freelance'];

  // Si ratio < 20% sur 10+ swipes → exclure les freelance
  if (freelanceStats && freelanceStats.rejected >= 10 && freelanceStats.ratio < 0.2) {
    leads = leads.filter(l => !isFreelanceLead(l));
    console.log('[JobsAgent] Excluding freelance leads due to low acceptance rate');
  }

  // Pareil pour les strong dislikes
  for (const dislike of feedback.strongDislikes) {
    if (dislike.pattern === 'high-effort items' && dislike.count >= 5) {
      leads = leads.filter(l => l.effortLevel <= 3);
    }
  }

  return leads;
}
```

### Persistance du Feedback

Le feedback est stocké dans le profil utilisateur :
```typescript
// profile.swipeFeedback dans DuckDB
{
  "categoryStats": {
    "job_lead": { "accepted": 5, "rejected": 12, "ratio": 0.29 },
    "sell_item": { "accepted": 8, "rejected": 2, "ratio": 0.8 },
    "pause_expense": { "accepted": 3, "rejected": 1, "ratio": 0.75 }
  },
  "strongDislikes": [
    { "pattern": "freelance", "count": 10, "lastSeen": "2026-02-04" }
  ],
  "lastUpdated": "2026-02-05"
}
```

### Reset du Feedback

Bouton "Reset my preferences" dans les settings pour repartir de zéro.

---

## Nouvelles catégories de scénarios

### Modification de l'interface Scenario

```typescript
export interface Scenario {
  id: string;
  title: string;
  description: string;
  // NOUVEAU: Catégories repensées
  category:
    | 'sell_item'      // Vendre un objet (Trade sell)
    | 'job_lead'       // Postuler à un job (Prospection lead)
    | 'pause_expense'  // Mettre en pause une dépense (Lifestyle)
    | 'reduce_expense' // Réduire une dépense (Lifestyle)
    | 'karma_trade'    // Échanger un objet (Trade trade)
    | 'karma_lend';    // Prêter un objet (Trade lend)

  // Données financières
  weeklyHours?: number;      // Heures requises (jobs seulement)
  oneTimeAmount?: number;    // Montant unique (ventes)
  monthlyAmount?: number;    // Montant mensuel (pauses/réductions)
  weeklyEarnings?: number;   // Gains hebdo (compatibilité)

  // Métadonnées
  effortLevel: number;       // 1-5
  flexibilityScore: number;  // 1-5
  source: 'trade' | 'prospection' | 'lifestyle';
  sourceId: string;          // ID de l'item source

  // Karma
  karmaPoints?: number;
  socialBenefit?: string;

  // NOUVEAU: Urgency (pour tri intelligent)
  urgency: {
    score: number;           // 0-100
    reason?: string;         // "⚡ Expires in 3 days!"
    daysUntilAction?: number;
  };

  // NOUVEAU: Metadata pour calculs contextuels
  metadata?: {
    nextBillingDate?: string;      // ISO date for lifestyle
    applicationDeadline?: string;  // ISO date for jobs
    isHot?: boolean;               // Job is trending
    goalImpactPercent?: number;    // Impact on goal %
    matchScore?: number;           // Skill match for jobs
    matchingSkills?: string[];     // Skills that matched
  };
}
```

### Génération des scénarios (refactored + urgency)

```typescript
function generateScenarios(
  trades: TradeItem[],
  leads: Lead[],
  lifestyle: LifestyleItem[],
  context: SwipeContext  // goal info, today date, feedback
): Scenario[] {
  const scenarios: Scenario[] = [];

  // 1. Items à vendre (Trade sell) + urgency based on goal impact
  trades
    .filter(t => t.type === 'sell' && t.status === 'available')
    .forEach(item => {
      const goalImpact = context.remainingAmount > 0
        ? (item.value / context.remainingAmount) * 100
        : 0;
      const urgency = calculateSellUrgency(item, goalImpact, context.daysToGoal);

      scenarios.push({
        id: `sell_${item.id}`,
        title: `Sell ${item.name}`,
        description: `List on ${suggestPlatform(item)} for ${item.value}€`,
        category: 'sell_item',
        oneTimeAmount: item.value,
        effortLevel: 1,
        flexibilityScore: 5,
        source: 'trade',
        sourceId: item.id,
        urgency,
        metadata: { goalImpactPercent: goalImpact },
      });
    });

  // 2. Jobs sauvegardés (Leads interested) + urgency based on deadline/hot
  leads
    .filter(l => l.status === 'interested')
    .forEach(lead => {
      const urgency = calculateJobUrgency(lead, context.today);

      scenarios.push({
        id: `job_${lead.id}`,
        title: lead.title,
        description: `Apply at ${lead.company}`,
        category: 'job_lead',
        weeklyHours: 10,
        weeklyEarnings: lead.avgHourlyRate * 10,
        effortLevel: lead.effortLevel || 3,
        flexibilityScore: 3,
        source: 'prospection',
        sourceId: lead.id,
        urgency,
        metadata: {
          applicationDeadline: lead.applicationDeadline,
          isHot: lead.isHot,
          matchScore: lead.matchScore,
          matchingSkills: lead.matchingSkills,
        },
      });
    });

  // 3. Pauses de dépenses (Lifestyle) + urgency based on billing date
  lifestyle
    .filter(l => l.currentCost > 0 && !l.pausedMonths)
    .forEach(item => {
      const urgency = calculateLifestyleUrgency(item, context.today);

      scenarios.push({
        id: `pause_${item.id}`,
        title: `Pause ${item.name}`,
        description: `Save ${item.currentCost}€/month by pausing`,
        category: 'pause_expense',
        monthlyAmount: item.currentCost,
        effortLevel: 1,
        flexibilityScore: 5,
        source: 'lifestyle',
        sourceId: item.id,
        urgency,
        metadata: { nextBillingDate: item.nextBillingDate },
      });
    });

  // 4. Actions karma (Trade trade/lend) - lower urgency by default
  trades
    .filter(t => t.type === 'trade' || t.type === 'lend')
    .forEach(item => {
      const isLend = item.type === 'lend';
      scenarios.push({
        id: `karma_${item.id}`,
        title: isLend ? `Lend ${item.name}` : `Trade ${item.name}`,
        description: isLend
          ? `Help someone by lending your ${item.name}`
          : `Find someone to trade ${item.name} with`,
        category: isLend ? 'karma_lend' : 'karma_trade',
        karmaPoints: isLend ? 50 : 30,
        socialBenefit: isLend
          ? 'Build trust in your community'
          : 'Get something you need without spending',
        effortLevel: 2,
        flexibilityScore: 4,
        source: 'trade',
        sourceId: item.id,
        urgency: { score: 30, reason: '✨ Good karma' },  // Lower priority
      });
    });

  // SORT BY URGENCY DESC
  return scenarios.sort((a, b) => b.urgency.score - a.urgency.score);
}
```

---

## Condition d'accès au Swipe

Le Swipe ne doit être accessible que si l'utilisateur a du contenu à swiper :

```typescript
function canAccessSwipe(
  trades: TradeItem[],
  leads: Lead[],
  lifestyle: LifestyleItem[]
): { canAccess: boolean; reason: string } {
  const hasSellableItems = trades.some(
    t => t.type === 'sell' && t.status === 'available'
  );
  const hasInterestedLeads = leads.some(l => l.status === 'interested');
  const hasPausableExpenses = lifestyle.some(
    l => l.currentCost > 0 && !l.pausedMonths
  );
  const hasKarmaItems = trades.some(
    t => t.type === 'trade' || t.type === 'lend'
  );

  if (hasSellableItems || hasInterestedLeads || hasPausableExpenses || hasKarmaItems) {
    return { canAccess: true, reason: '' };
  }

  return {
    canAccess: false,
    reason: 'Add items to sell, save job listings, or add subscriptions to pause before swiping!',
  };
}
```

### UI quand pas d'accès

```tsx
<Show when={!canAccessSwipe().canAccess}>
  <Card class="text-center py-12">
    <div class="text-4xl mb-4">🎲</div>
    <h2 class="text-xl font-bold mb-2">Nothing to swipe yet</h2>
    <p class="text-muted-foreground mb-6">
      {canAccessSwipe().reason}
    </p>
    <div class="flex gap-3 justify-center">
      <Button variant="outline" onClick={() => navigate('/me?tab=trade')}>
        Add items to sell
      </Button>
      <Button onClick={() => navigate('/me?tab=jobs')}>
        Find jobs
      </Button>
    </div>
  </Card>
</Show>
```

---

## Ce que les Skills doivent faire (vs. ce qu'ils font maintenant)

### Maintenant (incorrect)
```
Skills → "Freelance Python" scenario → Mission directe
```

### Après refonte
```
Skills → Améliorer le matching des jobs

Exemple:
- User a skill "Python" (rate: 30€/h)
- Prospection search: "developer" near user location
- Job Matching Agent:
  - Lead "Junior Dev chez StartupX" → match 85% (Python requis)
  - Lead "Serveur au resto" → match 10% (pas lié aux skills)
- Swipe shows ranked leads based on skill match
```

### Implémentation du Skill Matching

```typescript
function rankLeadsBySkillMatch(
  leads: Lead[],
  skills: Skill[]
): Array<Lead & { matchScore: number; matchingSkills: string[] }> {
  const skillNames = skills.map(s => s.name.toLowerCase());

  return leads.map(lead => {
    // Simple keyword matching (v1)
    // TODO: Use LLM for semantic matching in v2
    const titleWords = lead.title.toLowerCase().split(/\s+/);
    const matchingSkills = skillNames.filter(skill =>
      titleWords.some(word =>
        word.includes(skill) || skill.includes(word)
      )
    );

    const matchScore = matchingSkills.length > 0
      ? Math.min(100, 50 + matchingSkills.length * 25)
      : 20; // Base score for non-matching leads

    return { ...lead, matchScore, matchingSkills };
  }).sort((a, b) => b.matchScore - a.matchScore);
}
```

---

## Plan d'implémentation

### Phase 1: Refactor generateScenarios (Architecture Pull)
- [ ] Supprimer la génération de scénarios depuis les skills
- [ ] Ajouter génération depuis Trade (sell only → `type='sell'`)
- [ ] Ajouter génération depuis Lifestyle (pause/reduce)
- [ ] Ajouter génération karma (trade/lend)
- [ ] Ajouter `metadata` sur chaque source (nextBillingDate, deadline, etc.)

### Phase 2: Access Control
- [ ] Implémenter `canAccessSwipe()`
- [ ] Afficher message + CTA si pas de contenu
- [ ] Navigation intelligente vers les onglets manquants

### Phase 3: Urgency Factor
- [ ] Implémenter `calculateUrgency()` pour chaque catégorie
- [ ] Trier les scénarios par urgency score DESC
- [ ] Afficher badges "⚡ Expires soon" / "🔥 Hot" sur les cartes
- [ ] Ajouter `nextBillingDate` aux items Lifestyle

### Phase 4: Feedback Loop
- [ ] Créer structure `SwipeFeedback` dans le profil
- [ ] Logger chaque décision (accept/reject/meh)
- [ ] Agréger les stats par catégorie
- [ ] Implémenter filtrage dans Jobs Agent basé sur feedback
- [ ] Ajouter bouton "Reset preferences" dans settings

### Phase 5: Job Matching (Skills → Leads)
- [ ] Créer fonction `rankLeadsBySkillMatch()`
- [ ] Intégrer dans Prospection pour trier les résultats
- [ ] Afficher score de match sur les cartes Prospection
- [ ] V2: Semantic matching via LLM

### Phase 6: Agent Architecture
- [ ] Créer Lifestyle Agent (pause/reduce suggestions)
- [ ] Améliorer Trade Agent (suggest platforms, urgency)
- [ ] Créer Swipe Orchestrator Agent (combine all sources)

### Phase 7: Karma System
- [ ] Définir karma points par action
- [ ] Créer UI karma badges
- [ ] Tracker karma dans le profil
- [ ] Afficher "Karma Level" dans le dashboard Progress

---

## Fichiers à modifier

| Fichier | Changement |
|---------|------------|
| `SwipeTab.tsx` | Refactor `generateScenarios()` (Pull architecture), nouvelles catégories |
| `swipe.tsx` | Ajouter `canAccessSwipe()` check + empty state UI |
| `SwipeSession.tsx` | Ajouter logging feedback, badges urgency |
| `ProspectionTab.tsx` | Intégrer skill matching score + feedback filtering |
| `TradeTab.tsx` | Ajouter `nextBillingDate` metadata, "ready for swipe" indicator |
| `LifestyleTab.tsx` | Ajouter `nextBillingDate` field, "Add to swipe queue" button |
| `progress.tsx` | Adapter création missions aux nouvelles catégories |
| `profileService.ts` | Ajouter `swipeFeedback` au profil |
| `lib/swipe/urgency.ts` | Nouveau: calcul urgency score |
| `lib/swipe/feedback.ts` | Nouveau: gestion feedback loop |

---

## Scénarios de test

### Accès au Swipe
1. **User sans rien** → Swipe inaccessible, message "Nothing to swipe yet" + CTAs
2. **User avec 1 item sell** → Swipe accessible, 1 scénario "Sell X"
3. **User avec 1 lead interested** → Swipe accessible, 1 scénario "Job at X"
4. **User avec Netflix actif** → Swipe accessible, 1 scénario "Pause Netflix"

### Urgency Factor
5. **Netflix expire dans 2 jours** → Badge "⚡ Expires in 2 days!" en premier
6. **Job avec deadline demain** → Badge "🔥 Apply now!" en tête
7. **Goal deadline < 2 semaines + item à 100€ (20% du goal)** → Badge "💰 20% of your goal!"

### Feedback Loop
8. **User rejette 10 jobs freelance** → Les prochains jobs freelance sont exclus
9. **User swipe "meh" sur 5 items haute-effort** → Filtre effort <= 3 appliqué
10. **User clique "Reset preferences"** → Compteurs à zéro, tout réapparaît

### Skill Matching
11. **User avec skill Python + lead "Dev Python"** → Lead affiché avec badge "85% match"
12. **User avec skill Python + lead "Serveur resto"** → Affiché mais avec "20% match" (base)

### Karma
13. **User avec item lend** → Scénario karma "Lend X" avec "+50 karma points"
14. **User avec item trade** → Scénario "Trade X" avec "+30 karma points"
15. **Mission karma completée** → Karma level visible dans Progress dashboard
