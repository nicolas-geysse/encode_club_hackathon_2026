# Plan Hackathon Financial Health - Comet/Opik

> **Projet**: Stride (anciennement "Student Life Navigator")
> **Objectif**: MCP Server avec Mastra agents + Opik observability
> **Track**: Financial Health ($5,000 prize)
> **Cible**: ETUDIANTS (niche engagee avec problemes concrets)

---

## Concept: Stride

**Pitch**: Un GPS de vie etudiante qui t'aide a naviguer entre etudes, jobs et budget, avec **4 killer features** qui rendent la gestion financiere fun et bienveillante.

---

## 4 Killer Features

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| 1 | **Crunch Intelligent** | Detecte les "comeback windows" post-exams, cree des plans de rattrapage agressifs mais realistes | Recupere jusqu'a 126 euros en 3 semaines |
| 2 | **Skill Arbitrage** | Job matching multi-criteres: pas juste "max money" mais equilibre taux/demande/effort/repos | SQL Coaching (22 euros/h) > Python Dev (25 euros/h) |
| 3 | **Swipe Scenarios** | UX Tinder pour les strategies: swipe oui/non, l'app apprend les preferences | 4 swipes = profil de preferences complet |
| 4 | **Energy Debt Gamification** | Psycho inversee: 3 semaines a 30% energie = reduction cible + reward self-care | Unlock "Self Care Champion" |

---

## Architecture Lean

### 4 Agents

| Agent | Role | Killer Feature |
|-------|------|----------------|
| **Budget Coach** | Analyse budget + conseils personnalises + chat onboarding | Foundation |
| **Job Matcher** | Skill Arbitrage + multi-criteria scoring | #2 Skill Arbitrage |
| **Guardian** | Validation simplifiee (2 layers) | Quality control |
| **Energy Calculator** | Capacity tracking + Comeback detection + Energy Debt | #1 & #4 |

**Supprime:**
- ~~Money Maker~~ (merge dans conseils Budget Coach)
- ~~Strategy Comparator~~ (merge dans Job Matcher)
- ~~Projection ML~~ (renomme en Energy Calculator)

### 3 Ecrans + 6 Tabs

| # | Ecran | Route | Purpose |
|---|-------|-------|---------|
| 0 | **Onboarding** | `/` | Chat conversationnel profil |
| 1 | **Mon Plan** | `/plan` | 6 tabs configuration |
| 2 | **Suivi** | `/suivi` | Dashboard unifie |

#### 6 Tabs (Mon Plan)

| Tab | Contenu | Chat |
|-----|---------|------|
| Setup | Objectif, echeance, evenements | - |
| Skills | Skill Arbitrage + scoring | addSkillChat |
| A Vendre | Inventory objets | addItemChat |
| Lifestyle | Logement, food, transport, abonnements | addLifestyleChat |
| Trade | Emprunter/troquer | addTradeChat |
| Swipe | Roll the Dice + Swipe Scenarios | - |

> **Note Design: Chats isolés par tab (intentionnel)**
> Les chats sont isolés par tab sans mémoire partagée. C'est un **choix de design délibéré**:
> - Contexte isolé = moins de confusion pour l'utilisateur
> - Chaque tab a son propre sujet spécifique
> - L'onboarding (Screen 0) EST conversationnel avec questions progressives
> - Alternative rejetée: mémoire cross-tab ajouterait de la complexité sans valeur ajoutée

### 2 Couches Evaluation

| Layer | Role | Latence |
|-------|------|---------|
| **Heuristics** | Checks rapides (calculs, risques) | ~50ms |
| **G-Eval LLM** | LLM-as-Judge scoring | ~500ms |

**Simplifie:**
- Aggregation = score pondere simple (60% heuristiques + 40% LLM)
- Opik = monitoring separe, pas dans le path d'evaluation

---

## Algorithmes Killer Features

### #1 Crunch Intelligent (Comeback Mode)

**Concept**: Quand l'energie remonte apres une periode difficile, on detecte cette "fenetre de comeback" et on propose un plan de rattrapage.

```typescript
function detectComebackWindow(energyHistory: number[]): ComebackWindow | null {
  // 1. Identifier les semaines "difficiles" (energie < 40%)
  const lowWeeks = energyHistory.filter(e => e < 40);

  // 2. Detecter la recuperation (energie remonte > 80%)
  const currentEnergy = energyHistory[energyHistory.length - 1];
  const previousEnergy = energyHistory[energyHistory.length - 2];

  if (lowWeeks.length >= 2 && currentEnergy > 80 && previousEnergy < 50) {
    return {
      detected: true,
      recoveryWeek: energyHistory.length,
      deficitWeeks: lowWeeks.length,
      suggestedCatchUpWeeks: Math.min(3, Math.ceil(lowWeeks.length * 1.5))
    };
  }
  return null;
}

function generateCatchUpPlan(deficit: number, catchUpWeeks: number, capacities: number[]) {
  // Distribution proportionnelle a la capacite
  const totalCapacity = capacities.reduce((a, b) => a + b, 0);
  return capacities.map(cap => (cap / totalCapacity) * deficit);
}
```

**Exemple:**
```
Semaine 1-4: 50% of target (exams)     <- Protected
Semaine 5:   Energy recovers to 90%    <- Comeback detected!
Semaine 5-7: Aggressive catch-up       <- 50 + 45 + 31 = 126 euros recovered
```

### #2 Skill Arbitrage (Multi-Criteria Scoring)

**Concept**: Le job qui paye le plus n'est pas forcement le meilleur. On equilibre 4 criteres.

```typescript
interface JobScore {
  hourlyRate: number;      // euros/h
  marketDemand: number;    // 1-5 stars
  cognitiveEffort: number; // 1-5 (1=low, 5=exhausting)
  restNeeded: number;      // hours needed to recover
}

function calculateArbitrageScore(job: JobScore, weights: Weights): number {
  const normalizedRate = job.hourlyRate / 30;  // Max 30 euros/h
  const normalizedDemand = job.marketDemand / 5;
  const normalizedEffort = 1 - (job.cognitiveEffort / 5);  // Inverse: low effort = good
  const normalizedRest = 1 - (job.restNeeded / 8);  // Inverse: less rest needed = good

  return (
    weights.rate * normalizedRate +
    weights.demand * normalizedDemand +
    weights.effort * normalizedEffort +
    weights.rest * normalizedRest
  ) * 10;  // Score on 10
}

// Default weights
const defaultWeights = {
  rate: 0.30,
  demand: 0.25,
  effort: 0.25,
  rest: 0.20
};
```

**Exemple:**
```
| Job | Rate | Demand | Effort | Rest | Score |
|-----|------|--------|--------|------|-------|
| Python Dev | 25 euros | 5 stars | Very High | Low | 6.2/10 |
| SQL Coaching | 22 euros | 4 stars | Moderate | High | 8.7/10 |
| Data Entry | 12 euros | 4 stars | Very Low | High | 7.1/10 |
```

### #3 Swipe Scenarios (Preference Learning)

**Concept**: Chaque swipe met a jour les poids de preference de l'utilisateur.

```typescript
interface SwipeDecision {
  scenarioId: string;
  decision: 'left' | 'right';
  timeSpent: number;  // ms
}

function updatePreferences(
  currentWeights: Weights,
  scenario: Scenario,
  decision: SwipeDecision
): Weights {
  const learningRate = 0.1;
  const multiplier = decision.decision === 'right' ? 1 : -1;

  // Update weights based on scenario attributes
  return {
    effort_sensitivity: currentWeights.effort_sensitivity +
      (learningRate * multiplier * scenario.effort_level),
    hourly_rate_priority: currentWeights.hourly_rate_priority +
      (learningRate * multiplier * (scenario.hourly_rate > 20 ? 1 : -1)),
    time_flexibility: currentWeights.time_flexibility +
      (learningRate * multiplier * scenario.flexibility_score)
  };
}
```

### #4 Energy Debt Gamification

**Concept**: 3 semaines consecutives a basse energie = on reduit automatiquement les cibles et on recompense le self-care.

> **Note: Energy Debt et Comeback Mode sont mutuellement exclusifs.**
> - **Energy Debt** = protection active (énergie basse → on réduit les objectifs)
> - **Comeback Mode** = rattrapage actif (énergie remonte APRÈS récupération)
> - Si l'utilisateur est en Energy Debt, pas de Comeback possible (il faut d'abord récupérer)

```typescript
interface EnergyDebt {
  consecutiveLowWeeks: number;
  severity: 'low' | 'medium' | 'high';
  accumulatedDebt: number;
}

function detectEnergyDebt(energyHistory: number[], threshold = 40): EnergyDebt | null {
  let consecutiveLow = 0;
  for (let i = energyHistory.length - 1; i >= 0; i--) {
    if (energyHistory[i] < threshold) consecutiveLow++;
    else break;
  }

  if (consecutiveLow >= 3) {
    return {
      consecutiveLowWeeks: consecutiveLow,
      severity: consecutiveLow >= 5 ? 'high' : consecutiveLow >= 4 ? 'medium' : 'low',
      accumulatedDebt: consecutiveLow * 30  // Points de dette
    };
  }
  return null;
}

function adjustTargetForDebt(originalTarget: number, debt: EnergyDebt): number {
  const reductionFactors = {
    'low': 0.5,     // 50% reduction
    'medium': 0.75, // 75% reduction
    'high': 0.85    // 85% reduction (only 15% of original target)
  };
  return originalTarget * (1 - reductionFactors[debt.severity]);
}
```

---

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| **Frontend** | SolidStart + TailwindCSS |
| **Backend** | MCP Server TypeScript |
| **Orchestration** | Mastra agents |
| **LLM** | Groq (llama-3.3-70b-versatile) |
| **Voice** | Groq Whisper (distil-whisper-large-v3-en) |
| **Storage** | DuckDB + DuckPGQ |
| **Tracing** | Opik self-hosted |

---

## Structure du Projet

```
packages/
├── frontend/                      # SolidStart app
│   └── src/
│       ├── pages/
│       │   ├── index.tsx          # Onboarding (chat conversationnel)
│       │   ├── plan.tsx           # Mon Plan (6 tabs)
│       │   └── suivi.tsx          # Suivi (dashboard unifie)
│       ├── components/
│       │   ├── chat/
│       │   │   ├── OnboardingChat.tsx
│       │   │   ├── SkillChat.tsx
│       │   │   ├── ItemChat.tsx
│       │   │   ├── LifestyleChat.tsx
│       │   │   ├── TradeChat.tsx
│       │   │   └── ChatInput.tsx
│       │   ├── timeline/
│       │   │   └── TimelineHero.tsx
│       │   ├── swipe/
│       │   │   ├── RollDice.tsx
│       │   │   └── SwipeCard.tsx
│       │   ├── suivi/
│       │   │   ├── Retroplan.tsx
│       │   │   ├── EnergyHistory.tsx
│       │   │   ├── MissionList.tsx
│       │   │   └── MissionCard.tsx
│       │   ├── VoiceInput.tsx
│       │   ├── GoalProgress.tsx
│       │   └── AchievementBadge.tsx
│       └── api/
│           ├── chat.ts            # API chat (onboarding, skills, items, etc.)
│           ├── goals.ts           # API goals
│           ├── retroplan.ts       # API retroplanning
│           ├── swipe.ts           # API swipe preferences
│           ├── missions.ts        # API missions (validate/delete)
│           └── voice.ts           # API transcription
│
└── mcp-server/                    # MCP Server
    └── src/
        ├── agents/
        │   ├── budget-coach.ts
        │   ├── job-matcher.ts
        │   ├── guardian.ts
        │   └── energy-calculator.ts
        ├── tools/
        │   ├── chat.ts
        │   ├── goal.ts
        │   ├── voice.ts
        │   ├── swipe.ts
        │   ├── energy.ts
        │   └── missions.ts
        ├── workflows/
        │   ├── student-analysis.ts
        │   └── goal-planning.ts
        ├── algorithms/
        │   ├── retroplanning.ts
        │   ├── skill-arbitrage.ts
        │   ├── comeback-detection.ts
        │   └── energy-debt.ts
        ├── evaluation/
        │   ├── heuristics/
        │   └── geval/
        └── services/
            ├── duckdb.ts
            ├── groq.ts
            └── opik.ts
```

---

## Scenario Demo

```
Etudiant: "Je suis en L2 Info, j'ai 800 euros/mois, je veux economiser 500 euros pour les vacances"

-> SPAN 1: Onboarding Chat
   Questions progressives, profil cree
   Opik: onboarding_chat, profile_created

-> SPAN 2: Tab Skills - Skill Arbitrage (Killer #2)
   Python -> 25 euros/h but HIGH effort (score: 6.2)
   SQL Coaching -> 22 euros/h, MODERATE effort (score: 8.7) <- Recommended
   Opik: skill_added, score_calculation

-> SPAN 3: Tab Swipe - Roll the Dice + Session (Killer #3)
   [Roll the Dice] -> Compile all tabs, freeze
   [Freelance] <- swipe left
   [Tutoring] -> swipe right
   [Selling items] -> swipe right
   Learned: prioritizes flexibility, moderate effort
   Opik: roll_the_dice, scenarios_compiled, swipe_decision, preference_learning

-> SPAN 4: Suivi - Energy Check (Killer #1 & #4)
   Current energy: 85%
   No debt detected
   Comeback mode: not needed (all good!)
   Opik: energy_debt_check, timeline_updated

-> SPAN 5: Guardian Validation
   Heuristics: PASS (math valid)
   G-Eval: 0.89 confidence
   Final: APPROVED
   Opik: guardian_validation

-> RESULT: "SQL Coaching 6h/week + sell 2 items = 500 euros in 7 weeks"
```

---

## Points Cles pour le Jury

| Critere | Notre Reponse |
|---------|---------------|
| **Functionality** | 4 killer features, not just a chatbot |
| **Real-world** | Student niche = concrete, immediate problems |
| **LLM/Agents** | 4 Mastra agents with multi-criteria intelligence |
| **Opik** | Full traceability for every recommendation |
| **Goal Alignment** | Help students balance money, time, and wellness |

### Differenciateurs

1. **Crunch Intelligent** - Aucune app etudiante ne detecte les comeback windows
2. **Skill Arbitrage** - Multi-criteria job scoring prevents burnout
3. **Swipe Scenarios** - UX Tinder rend la planification fun
4. **Energy Debt** - Psycho inversee recompense le self-care
5. **Observability** - Traces completes visibles par l'utilisateur

---

## Checklist Implementation

### 4 Killer Features

- [ ] **#1 Crunch Intelligent**
  - [ ] Comeback window detection algorithm
  - [ ] Catch-up plan generation
  - [ ] "Comeback King" achievement
  - [ ] Opik traces for energy trend analysis

- [ ] **#2 Skill Arbitrage**
  - [ ] Multi-criteria scoring function
  - [ ] Graph query for skill -> job matching
  - [ ] Score visualization in UI
  - [ ] Opik traces for scoring breakdown

- [ ] **#3 Swipe Scenarios**
  - [ ] Roll the Dice button (compile + freeze)
  - [ ] SwipeCard component with animations
  - [ ] Preference learning algorithm
  - [ ] Recommendation reranking after swipes
  - [ ] Opik traces for preference updates

- [ ] **#4 Energy Debt Gamification**
  - [ ] Energy debt detection algorithm
  - [ ] Automatic target reduction
  - [ ] Self-care achievements
  - [ ] Recovery plan generation
  - [ ] Opik traces for debt calculations

### Frontend

- [ ] **Screen 0: Onboarding**
  - [ ] OnboardingChat component
  - [ ] Chat conversationnel (texte + voix)
  - [ ] Questions progressives
  - [ ] Character avatar (Bruno)

- [ ] **Screen 1: Mon Plan**
  - [ ] Tab navigation (6 tabs)
  - [ ] Tab Setup - objectif, echeance, evenements
  - [ ] Tab Skills - Skill Arbitrage + addSkillChat
  - [ ] Tab A Vendre - Inventory + addItemChat
  - [ ] Tab Lifestyle - optimisations + addLifestyleChat
  - [ ] Tab Trade - emprunter/troquer + addTradeChat
  - [ ] Tab Swipe - Roll the Dice + SwipeCards

- [ ] **Screen 2: Suivi**
  - [ ] Timeline Hero (temps + charge de travail)
  - [ ] Retroplan + Comeback Alert
  - [ ] Energy History + Recovery mode
  - [ ] Missions du Swipe (valider/supprimer)
  - [ ] Achievements

- [ ] **Shared Components**
  - [ ] ChatInput (reutilisable)
  - [ ] VoiceInput
  - [ ] GoalProgress
  - [ ] AchievementBadge
  - [ ] MissionCard

### Backend

- [ ] 4 Agents Mastra configures
- [ ] Hybrid Evaluation System (Heuristics + G-Eval)
- [ ] DuckDB avec tables:
  - [ ] goals
  - [ ] academic_events
  - [ ] commitments
  - [ ] energy_logs
  - [ ] swipe_history
  - [ ] user_preferences
  - [ ] missions
  - [ ] lifestyle_items
  - [ ] trade_items
- [ ] DuckPGQ knowledge graph (skills -> jobs)
- [ ] Workflow student-analysis
- [ ] Workflow goal-planning avec retroplanning
- [ ] Tools: chat, voice, goal, swipe, energy, missions
- [ ] Opik integration (see OPIK.md)

### API Endpoints

- [ ] `/api/chat` - onboarding, add_skill, add_item, add_lifestyle, add_trade
- [ ] `/api/goals` - create, update_progress
- [ ] `/api/retroplan` - events, commitments, energy, comeback
- [ ] `/api/swipe` - roll_dice, record_decision, get_preferences
- [ ] `/api/missions` - validate, delete
- [ ] `/api/voice` - transcription

### Documentation

- [x] PLAN.md (ce fichier)
- [x] SCREENS_AND_EVALS.md (ecrans + evaluations)
- [x] OPIK.md (observability pour les 4 killer features)
- [x] README.md (hero 4 killer features)

---

*Document mis a jour - Janvier 2026*
