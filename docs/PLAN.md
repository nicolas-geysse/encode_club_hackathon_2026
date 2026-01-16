# Plan Hackathon Financial Health - Comet/Opik

> **Projet**: Stride (anciennement "Student Life Navigator")
> **Objectif**: MCP Server avec Mastra agents + Opik observability
> **Track**: Financial Health ($5,000 prize)
> **Cible**: ETUDIANTS (niche engagée avec problèmes concrets)

---

## Concept: Stride

**Pitch**: Un GPS de vie étudiante qui t'aide à naviguer entre études, jobs et budget, avec **4 killer features** qui rendent la gestion financière fun et bienveillante.

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

### 4 Agents (etait 6)

| Agent | Role | Killer Feature |
|-------|------|----------------|
| **Budget Coach** | Analyse budget + conseils personnalises | Foundation |
| **Job Matcher** | Skill Arbitrage + multi-criteria scoring | #2 Skill Arbitrage |
| **Guardian** | Validation simplifiee (2 layers) | Quality control |
| **Energy Calculator** | Capacity tracking + Comeback detection + Energy Debt | #1 & #4 |

**Supprime:**
- ~~Money Maker~~ (merge dans conseils Budget Coach)
- ~~Strategy Comparator~~ (merge dans Job Matcher)
- ~~Projection ML~~ (renomme en Energy Calculator)

### 5 Ecrans (etait 7)

| # | Ecran | Route | Purpose |
|---|-------|-------|---------|
| 1 | **Onboarding** | `/` | Profile + skills + budget |
| 2 | **Goal Setup** | `/goal-mode/setup` | Define goal + exams + commitments |
| 3 | **Goal Plan** | `/goal-mode/plan` | Strategies + Swipe Scenarios |
| 4 | **Goal Calendar** | `/goal-mode/calendar` | Retroplan with capacity visualization |
| 5 | **Goal Track** | `/goal-mode/track` | Progress + Energy check-in + Achievements |

**Supprime:**
- ~~Dashboard~~ (fonctions mergees dans Goal Track)
- ~~Chat~~ (voice input disponible sur autres ecrans)

### 2 Couches Evaluation (etait 4)

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

**Stockage:**
```sql
CREATE TABLE swipe_history (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  scenario_id VARCHAR,
  decision VARCHAR,  -- 'left' or 'right'
  time_spent INTEGER,  -- milliseconds
  created_at TIMESTAMP
);

CREATE TABLE user_preferences (
  user_id VARCHAR PRIMARY KEY,
  effort_sensitivity DECIMAL,
  hourly_rate_priority DECIMAL,
  time_flexibility DECIMAL,
  updated_at TIMESTAMP
);
```

### #4 Energy Debt Gamification

**Concept**: 3 semaines consecutives a basse energie = on reduit automatiquement les cibles et on recompense le self-care.

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

**Achievements:**
```typescript
const selfCareAchievements = [
  {
    id: 'self_care_champion',
    trigger: 'accepted_target_reduction',
    message: "Tu as ecoute ton corps. C'est la vraie victoire.",
    badge: 'heart'
  },
  {
    id: 'comeback_king',
    trigger: 'completed_catch_up_plan',
    message: "Retour en force! Tu as recupere ton retard.",
    badge: 'crown'
  },
  {
    id: 'energy_master',
    trigger: '4_weeks_above_70_energy',
    message: "4 semaines au-dessus de 70% d'energie. Bien joue!",
    badge: 'lightning'
  }
];
```

---

## Modele de Donnees

### Tables DuckDB

```sql
-- Objectifs financiers
CREATE TABLE goals (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  goal_name VARCHAR,
  goal_amount DECIMAL,
  goal_deadline DATE,
  status VARCHAR,  -- 'active', 'completed', 'abandoned'
  weekly_target DECIMAL,
  feasibility_score DECIMAL
);

-- Evenements academiques
CREATE TABLE academic_events (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  event_type VARCHAR,  -- 'exam_period', 'vacation', 'internship'
  event_name VARCHAR,
  start_date DATE,
  end_date DATE,
  capacity_impact DECIMAL  -- 0.2 = 80% reduction
);

-- Engagements recurrents
CREATE TABLE commitments (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  commitment_type VARCHAR,  -- 'class', 'sport', 'family'
  commitment_name VARCHAR,
  hours_per_week DECIMAL
);

-- Suivi energie/mood
CREATE TABLE energy_logs (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  log_date DATE,
  energy_level INTEGER,  -- 1-100
  mood_score INTEGER,    -- 1-5
  stress_level INTEGER   -- 1-5
);

-- Historique swipes
CREATE TABLE swipe_history (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  scenario_id VARCHAR,
  decision VARCHAR,
  time_spent INTEGER,
  created_at TIMESTAMP
);

-- Preferences apprises
CREATE TABLE user_preferences (
  user_id VARCHAR PRIMARY KEY,
  effort_sensitivity DECIMAL,
  hourly_rate_priority DECIMAL,
  time_flexibility DECIMAL,
  updated_at TIMESTAMP
);
```

### Graph DuckPGQ (Knowledge Graph)

```sql
-- Nodes: skills, jobs, diplomas, careers
-- Edges: enables (skill -> job), requires (job -> skill)

-- Exemple: Skill Arbitrage query
SELECT j.name,
       j.properties->>'hourly_rate' as rate,
       j.properties->>'effort_level' as effort,
       e.weight as match_score
FROM student_edges e
JOIN student_nodes s ON e.source_id = s.id
JOIN student_nodes j ON e.target_id = j.id
WHERE s.id = 'python' AND e.relation_type = 'enables'
ORDER BY e.weight DESC;
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

## Scenario Demo

```
Etudiant: "Je suis en L2 Info, j'ai 800 euros/mois, je veux economiser 500 euros pour les vacances"

-> SPAN 1: Budget Analysis
   Income: 800 euros, Expenses: 750 euros, Margin: 50 euros

-> SPAN 2: Skill Arbitrage (Killer #2)
   Python -> 25 euros/h but HIGH effort (score: 6.2)
   SQL Coaching -> 22 euros/h, MODERATE effort (score: 8.7) <- Recommended

-> SPAN 3: Swipe Session (Killer #3)
   [Freelance] <- swipe left
   [Tutoring] -> swipe right
   [Selling items] -> swipe right
   Learned: prioritizes flexibility, moderate effort

-> SPAN 4: Energy Check (Killer #1 & #4)
   Current energy: 85%
   No debt detected
   Comeback mode: not needed (all good!)

-> SPAN 5: Guardian Validation
   Heuristics: PASS (math valid)
   G-Eval: 0.89 confidence
   Final: APPROVED

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

## Structure du Projet

```
packages/
|-- frontend/                 # SolidStart app
|   |-- src/
|   |   |-- routes/
|   |   |   |-- index.tsx           # Onboarding
|   |   |   |-- goal-mode/
|   |   |   |   |-- setup.tsx       # Define goal
|   |   |   |   |-- plan.tsx        # Strategies + Swipe
|   |   |   |   |-- calendar.tsx    # Retroplan visual
|   |   |   |   |-- track.tsx       # Progress + Energy
|   |   |   |-- api/
|   |   |       |-- goals.ts        # API goals
|   |   |       |-- retroplan.ts    # API retroplanning
|   |   |       |-- voice.ts        # API transcription
|   |   |       |-- swipe.ts        # API swipe preferences
|   |   |-- components/
|   |       |-- VoiceInput.tsx
|   |       |-- SwipeCard.tsx
|   |       |-- GoalProgress.tsx
|   |       |-- MilestoneCard.tsx
|   |       |-- AchievementBadge.tsx
|   |       |-- EnergyTracker.tsx
|
|-- mcp-server/               # MCP Server
    |-- src/
    |   |-- agents/
    |   |   |-- budget-coach.ts
    |   |   |-- job-matcher.ts
    |   |   |-- guardian.ts
    |   |   |-- energy-calculator.ts
    |   |-- tools/
    |   |   |-- goal.ts
    |   |   |-- voice.ts
    |   |   |-- swipe.ts
    |   |   |-- energy.ts
    |   |-- workflows/
    |   |   |-- student-analysis.ts
    |   |   |-- goal-planning.ts
    |   |-- algorithms/
    |   |   |-- retroplanning.ts
    |   |   |-- skill-arbitrage.ts
    |   |   |-- comeback-detection.ts
    |   |   |-- energy-debt.ts
    |   |-- evaluation/
    |   |   |-- heuristics/
    |   |   |-- geval/
    |   |-- services/
    |       |-- duckdb.ts
    |       |-- groq.ts
    |       |-- opik.ts
```

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
  - [ ] SwipeCard component with animations
  - [ ] Preference learning algorithm
  - [ ] swipe_history table
  - [ ] Recommendation reranking after swipes
  - [ ] Opik traces for preference updates

- [ ] **#4 Energy Debt Gamification**
  - [ ] Energy debt detection algorithm
  - [ ] Automatic target reduction
  - [ ] Self-care achievements
  - [ ] Recovery plan generation
  - [ ] Opik traces for debt calculations

### Backend

- [ ] 4 Agents Mastra configures
- [ ] Hybrid Evaluation System (Heuristics + G-Eval)
- [ ] DuckDB avec tables goals, energy_logs, swipe_history, user_preferences
- [ ] DuckPGQ knowledge graph (skills -> jobs)
- [ ] Workflow student-analysis
- [ ] Workflow goal-planning avec retroplanning
- [ ] Tools voice, goal, swipe, energy
- [ ] Opik integration

### Frontend

- [ ] Onboarding avec profil complet
- [ ] Goal Mode - Setup (objectif + evenements + engagements)
- [ ] Goal Mode - Plan (strategies + Swipe Scenarios)
- [ ] Goal Mode - Calendar (retroplan visuel + capacity)
- [ ] Goal Mode - Track (progression + energy check-in + achievements)
- [ ] Composants: VoiceInput, SwipeCard, GoalProgress, AchievementBadge, EnergyTracker

### Documentation

- [x] PLAN.md (ce fichier)
- [x] SCREENS_AND_EVALS.md (ecrans + evaluations)
- [x] OPIK.md (observability pour les 4 killer features)
- [x] README.md (hero 4 killer features)

---

*Document mis a jour - Janvier 2026*
