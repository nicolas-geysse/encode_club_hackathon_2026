# Opik Observability for Stride

> Complete traceability for multi-agent financial AI

> **Technical Reference**: For LLM provider abstraction (Groq/Gemini), SDK configuration, API details, and migration guides, see **[gemini-groq-opik-guidelines.md](../architecture/gemini-groq-opik-guidelines.md)**.
>
> This document focuses on **feature-specific trace hierarchies** and how Opik enables the 4 Killer Features.

Stride uses **Opik Cloud** for full observability across 4 AI agents orchestrating student financial recommendations. This document explains how Opik enables each of our **4 Killer Features**.

**Track**: Financial Health ($5,000 prize) - Encode Club Hackathon 2026
**Sponsor**: Comet (Opik)

---

## Why Opik is Essential for Student Financial AI

| Challenge | Without Opik | With Opik |
|-----------|--------------|-----------|
| Multi-agent coordination | Black box | Full trace hierarchy |
| Recommendation explainability | "Trust me" | "Here's exactly why" |
| Energy-based adjustments | Magic numbers | Visible calculations |
| Preference learning | Hidden | Transparent updates |

**Key Insight**: Students need to trust financial recommendations. Opik provides the transparency that builds this trust.

---

## TypeScript SDK + Mastra Integration

### Installation

```bash
npm install opik @mastra/core @ai-sdk/openai
```

### Configuration Mastra avec Opik

```typescript
import { Mastra, Agent } from "@mastra/core";
import { openai } from "@ai-sdk/openai";

// Define agents
export const budgetCoach = new Agent({
  name: "budget-coach",
  instructions: `Tu es Bruno, un coach budget bienveillant pour etudiants.
    Tu poses des questions progressives pour comprendre leur situation.
    Tu donnes des conseils concrets et encourageants.`,
  model: openai("gpt-4o-mini"),
});

export const jobMatcher = new Agent({
  name: "job-matcher",
  instructions: `Tu es un expert en matching skills/jobs pour etudiants.
    Tu utilises le Skill Arbitrage pour trouver le meilleur equilibre
    entre taux horaire, effort cognitif, et temps de repos.`,
  model: openai("gpt-4o-mini"),
});

export const guardian = new Agent({
  name: "guardian",
  instructions: `Tu es le gardien de la qualite des recommandations.
    Tu valides les calculs et detectes les conseils risques.
    Tu utilises une evaluation hybride: heuristiques + LLM.`,
  model: openai("gpt-4o-mini"),
});

export const energyCalculator = new Agent({
  name: "energy-calculator",
  instructions: `Tu calcules la capacite des etudiants semaine par semaine.
    Tu detectes les comeback windows et l'energy debt.
    Tu ajustes les objectifs en fonction de l'energie.`,
  model: openai("gpt-4o-mini"),
});

// Configure Mastra with telemetry
export const mastra = new Mastra({
  agents: { budgetCoach, jobMatcher, guardian, energyCalculator },
  telemetry: {
    serviceName: "stride",
    enabled: true,
    sampling: { type: "always_on" },
    export: { type: "otlp" },
  },
});
```

### Variables d'environnement (Configuration)
401|
**IMPORTANT**: Dans ce monorepo, assurez-vous que les variables d'environnement sont cohérentes.
- Le fichier `.env` à la racine est la source de vérité.
- **Attention**: `packages/frontend/.env` peut surcharger les valeurs racines. Si vous avez une erreur 401 sur Opik, vérifiez que `packages/frontend/.env` ne contient pas une clé API obsolète.

```bash
# Opik Cloud Configuration
OPIK_API_KEY=1NSD...          # Votre clé API
OPIK_WORKSPACE=nickoolas      # Votre workspace
OPIK_PROJECT=stride           # Nom du projet

# Opik Self-hosted (Alternative)
# OPIK_BASE_URL=http://localhost:5173/api
```

### Custom Span Creation

```typescript
import { trace, context, SpanKind } from "@opentelemetry/api";

const tracer = trace.getTracer("stride");

// Example: Tracing skill arbitrage calculation
async function calculateSkillArbitrage(skills: string[], userId: string) {
  return tracer.startActiveSpan(
    "skill_arbitrage_calculation",
    { kind: SpanKind.INTERNAL },
    async (span) => {
      try {
        span.setAttribute("user_id", userId);
        span.setAttribute("skills_count", skills.length);
        span.setAttribute("skills", skills.join(","));

        // Nested span for graph query
        const jobs = await tracer.startActiveSpan(
          "graph_job_matching",
          async (graphSpan) => {
            const result = await queryJobGraph(skills);
            graphSpan.setAttribute("jobs_found", result.length);
            graphSpan.end();
            return result;
          }
        );

        // Nested span for scoring
        const scores = await tracer.startActiveSpan(
          "multi_criteria_scoring",
          async (scoreSpan) => {
            const result = jobs.map((job) => calculateScore(job));
            scoreSpan.setAttribute("best_score", Math.max(...result.map((r) => r.score)));
            scoreSpan.end();
            return result;
          }
        );

        span.setAttribute("recommendation", scores[0].job);
        return scores;
      } finally {
        span.end();
      }
    }
  );
}
```

---

## Trace Hierarchy (3 Screens + 6 Tabs)

```
TRACE: student_session
|
+-- SPAN: onboarding_chat (Screen 0)
|   +-- SPAN: question_1_objective
|   |   +-- input: "user message"
|   |   +-- output: "bot response"
|   |   +-- duration: 234ms
|   +-- SPAN: question_2_skills
|   +-- SPAN: question_3_budget
|   +-- SPAN: profile_created
|       +-- profile: { diploma, skills, budget, constraints }
|
+-- SPAN: plan_configuration (Screen 1: Mon Plan)
|   |
|   +-- SPAN: tab_setup
|   |   +-- SPAN: goal_defined
|   |   |   +-- goal: { name, amount, deadline }
|   |   +-- SPAN: events_added
|   |       +-- events: [{ type, name, dates }]
|   |
|   +-- SPAN: tab_skills
|   |   +-- SPAN: skill_arbitrage_calculation
|   |   |   +-- SPAN: graph_job_matching
|   |   |   +-- SPAN: multi_criteria_scoring
|   |   +-- SPAN: skill_added_via_chat
|   |       +-- input: "J'ai aussi des bases en Figma"
|   |       +-- extracted_skill: "figma"
|   |       +-- new_jobs_unlocked: 2
|   |
|   +-- SPAN: tab_inventory
|   |   +-- SPAN: item_added_via_chat
|   |   |   +-- input: "J'ai une vieille guitare"
|   |   |   +-- extracted_item: "guitare"
|   |   |   +-- estimated_price: 150
|   |   |   +-- platform_suggestion: "Leboncoin"
|   |   +-- SPAN: price_estimation
|   |
|   +-- SPAN: tab_lifestyle
|   |   +-- SPAN: lifestyle_item_added
|   |   |   +-- category: "transport"
|   |   |   +-- current_cost: 50
|   |   |   +-- suggested_optimization: "velo"
|   |   |   +-- potential_savings: 35
|   |   +-- SPAN: lifestyle_savings_calculated
|   |       +-- total_monthly_savings: 95
|   |
|   +-- SPAN: tab_trade
|   |   +-- SPAN: trade_need_added
|   |   |   +-- item: "projecteur"
|   |   |   +-- duration: "1 weekend"
|   |   +-- SPAN: trade_match_found
|   |       +-- matches: 3
|   |       +-- best_match: { user, distance, rating }
|   |
|   +-- SPAN: tab_swipe
|       +-- SPAN: roll_the_dice
|       |   +-- SPAN: compile_scenarios
|       |   |   +-- skills_count: 3
|       |   |   +-- items_count: 2
|       |   |   +-- lifestyle_savings: 95
|       |   |   +-- trade_items: 2
|       |   |   +-- scenarios_generated: 4
|       |   +-- SPAN: freeze_tabs
|       |       +-- frozen_at: timestamp
|       |       +-- can_unfreeze: false
|       +-- SPAN: swipe_session
|           +-- SPAN: swipe_decision_1
|           |   +-- scenario: "freelance_dev"
|           |   +-- decision: "left"
|           |   +-- time_spent_ms: 3200
|           +-- SPAN: swipe_decision_2
|           |   +-- scenario: "tutoring"
|           |   +-- decision: "right"
|           |   +-- time_spent_ms: 1800
|           +-- SPAN: swipe_decision_3
|           +-- SPAN: swipe_decision_4
|           +-- SPAN: preference_learning
|               +-- old_weights: { effort: 0.65, rate: 0.70, flexibility: 0.50 }
|               +-- new_weights: { effort: 0.75, rate: 0.60, flexibility: 0.55 }
|               +-- delta: { effort: +0.10, rate: -0.10, flexibility: +0.05 }
|
+-- SPAN: suivi_tracking (Screen 2: Suivi)
    |
    +-- SPAN: timeline_update
    |   +-- current_week: 5
    |   +-- total_weeks: 8
    |   +-- time_progress: 62%
    |   +-- workload_level: 15%
    |
    +-- SPAN: comeback_detection (Killer #1)
    |   +-- SPAN: energy_trend_analysis
    |   |   +-- history: [30, 25, 35, 85]
    |   |   +-- trend: "recovering"
    |   |   +-- confidence: 0.92
    |   +-- SPAN: comeback_window_identified
    |   |   +-- window_detected: true
    |   |   +-- recovery_week: 5
    |   |   +-- available_weeks: [5, 6, 7]
    |   +-- SPAN: catchup_plan_generated
    |       +-- deficit: 126
    |       +-- distribution: [50, 45, 31]
    |
    +-- SPAN: energy_debt_check (Killer #4)
    |   +-- consecutive_low_weeks: 4
    |   +-- severity: "high"
    |   +-- debt_points: 180
    |   +-- SPAN: target_reduction
    |       +-- original_target: 63
    |       +-- reduced_target: 10
    |       +-- reduction_percent: 84
    |
    +-- SPAN: mission_validation
    |   +-- mission_id: "sql_coaching_6h"
    |   +-- action: "validated"
    |   +-- earned: 132
    |
    +-- SPAN: mission_deleted
    |   +-- mission_id: "freelance_dev"
    |   +-- reason: "user_choice"
    |
    +-- SPAN: achievement_unlocked
        +-- achievement: "self_care_champion"
        +-- trigger: "accepted_target_reduction"
        +-- message: "Tu as ecoute ton corps. C'est la vraie victoire."
```

---

## Killer Feature #1: Crunch Intelligent (Comeback Mode)

### What It Does
Detects "comeback windows" when a student recovers energy after a difficult period (exams, illness) and creates aggressive but realistic catch-up plans.

### What Opik Traces

| Span | Data Captured | Purpose |
|------|---------------|---------|
| `comeback_detection` | weeks_below_target, energy_trend, detected_window | Identify recovery opportunity |
| `catch_up_calculation` | deficit, spread_weeks, per_week_increase | Plan the catch-up |
| `feasibility_check` | capacity_scores, strategy_availability | Validate realism |

### Example Trace

```
TRACE: crunch_intelligent_activation
+-- SPAN: energy_trend_analysis
|   +-- input: { weeks: [1,2,3,4], energy_scores: [30,25,35,85] }
|   +-- output: { trend: "recovering", confidence: 0.92 }
|   +-- duration: 45ms
+-- SPAN: comeback_window_detection
|   +-- input: { current_week: 5, energy: 85, deficit: 126 }
|   +-- output: { window_detected: true, available_weeks: [5,6,7] }
|   +-- duration: 23ms
+-- SPAN: aggressive_plan_generation
|   +-- input: { deficit: 126, weeks: 3, max_capacity: 90% }
|   +-- output: { plan: [50, 45, 31], strategies: [...] }
|   +-- duration: 156ms
+-- SPAN: guardian_validation
    +-- input: { plan: [...], student_context: {...} }
    +-- output: { valid: true, confidence: 0.85 }
    +-- duration: 342ms
```

### Why Tracing Matters

When a student asks "Why is my target suddenly 50e instead of 30e?", we can show:
1. Energy recovery detected at week 5
2. 126e deficit from weeks 1-4
3. Distribution logic: higher capacity weeks get more
4. Guardian validated the plan as realistic

---

## Killer Feature #2: Skill Arbitrage (Smart Job Matching)

### What It Does
Matches student skills to jobs using multi-criteria scoring, not just "highest pay wins". Balances hourly rate, market demand, cognitive effort, and rest time needed.

### What Opik Traces

| Span | Data Captured | Purpose |
|------|---------------|---------|
| `skill_graph_query` | skills, graph_path, co_benefits | Find matching jobs |
| `multi_criteria_scoring` | rate, demand, effort, rest scores | Calculate arbitrage score |
| `strategy_comparison` | compared_options, winner, reasoning | Select best option |

### Example Trace

```
TRACE: skill_arbitrage_recommendation
+-- SPAN: skill_extraction
|   +-- input: { profile: "L2 Informatique", declared_skills: ["Python", "SQL"] }
|   +-- output: { skills: ["python", "sql", "data_analysis"], confidence: 0.88 }
|   +-- duration: 67ms
+-- SPAN: graph_job_matching
|   +-- input: { skills: ["python", "sql"] }
|   +-- output: {
|   |     jobs: [
|   |       { id: "freelance_dev", path: "python->enables->freelance_dev" },
|   |       { id: "sql_coaching", path: "sql->enables->sql_coaching" },
|   |       { id: "data_entry", path: "sql->enables->data_entry" }
|   |     ]
|   |   }
|   +-- duration: 89ms
+-- SPAN: multi_criteria_scoring
|   +-- input: { jobs: [...], weights: { rate: 0.3, demand: 0.25, effort: 0.25, rest: 0.2 } }
|   +-- output: {
|   |     scores: [
|   |       { job: "freelance_dev", rate: 25, effort: "high", final_score: 6.2 },
|   |       { job: "sql_coaching", rate: 22, effort: "moderate", final_score: 8.7 },
|   |       { job: "data_entry", rate: 12, effort: "low", final_score: 7.1 }
|   |     ],
|   |     recommendation: "sql_coaching",
|   |     reasoning: "Best balance of pay and sustainability"
|   |   }
|   +-- duration: 112ms
+-- SPAN: co_benefits_enrichment
    +-- input: { job: "sql_coaching" }
    +-- output: { benefits: ["reinforces_learning", "cv_plus", "networking"] }
    +-- duration: 34ms
```

### Why Tracing Matters

When we recommend SQL Coaching (22e/h) over Python Freelance (25e/h), the student can see:
1. Python Dev scored 6.2/10 due to high cognitive effort
2. SQL Coaching scored 8.7/10 with better effort/rest balance
3. Graph path shows skill->job relationship
4. Co-benefits add CV++ and learning reinforcement

---

## Killer Feature #3: Swipe Scenarios (Tinder for Strategies)

### What It Does
Presents financial strategies in a Tinder-like interface. Students swipe right (interested) or left (not interested). The app learns preferences over time.

### What Opik Traces

| Span | Data Captured | Purpose |
|------|---------------|---------|
| `roll_the_dice` | tabs_compiled, scenarios_count, frozen_at | Compile and freeze |
| `scenario_presentation` | scenario_id, attributes_shown | Track what user saw |
| `swipe_decision` | decision, time_spent, scenario | Capture user choice |
| `preference_update` | old_weights, new_weights, delta | Learn from decisions |

### Example Trace

```
TRACE: swipe_session_user_123
+-- SPAN: roll_the_dice
|   +-- SPAN: compile_scenarios
|   |   +-- input: { skills: 3, items: 2, lifestyle_savings: 95, trade_needs: 2 }
|   |   +-- output: { scenarios: 4, types: ["job", "sell", "lifestyle", "trade"] }
|   +-- SPAN: freeze_tabs
|       +-- frozen_tabs: ["setup", "skills", "inventory", "lifestyle", "trade"]
|       +-- reason: "swipe_started"
+-- SPAN: session_init
|   +-- input: { user_id: "student_123", goal: "save_500" }
|   +-- output: { scenarios_queued: 4, preference_profile: {...} }
|   +-- duration: 28ms
+-- SPAN: scenario_1_freelance_dev
|   +-- input: { scenario: "freelance_dev", attributes: ["25e/h", "high_effort", "10h/week"] }
|   +-- decision: "left" (rejected)
|   +-- time_spent: 3.2s
|   +-- duration: 3245ms
+-- SPAN: scenario_2_tutoring
|   +-- input: { scenario: "tutoring", attributes: ["20e/h", "moderate_effort", "6h/week"] }
|   +-- decision: "right" (accepted)
|   +-- time_spent: 1.8s
|   +-- duration: 1823ms
+-- SPAN: preference_learning
|   +-- input: { decisions: [{ "freelance_dev": "reject" }, { "tutoring": "accept" }] }
|   +-- output: {
|   |     updated_weights: {
|   |       "effort_sensitivity": 0.65 -> 0.75,
|   |       "hourly_rate_priority": 0.70 -> 0.60,
|   |       "time_flexibility": 0.50 -> 0.55
|   |     }
|   |   }
|   +-- duration: 67ms
+-- SPAN: next_recommendations_rerank
    +-- input: { new_weights: {...}, remaining_scenarios: [...] }
    +-- output: { reordered_queue: [...] }
    +-- duration: 45ms
```

### Why Tracing Matters

Preference learning is powerful but opaque. Opik shows:
1. Exactly which swipes influenced which weights
2. How recommendations changed after each decision
3. Convergence of preference profile over time
4. Anomalies (contradictory swipes)

---

## Killer Feature #4: Energy Debt Gamification

### What It Does
Tracks "energy debt" when students consistently report low energy. Reduces targets automatically and rewards self-care with achievements. Reverse psychology: rest is a strategy, not failure.

### What Opik Traces

| Span | Data Captured | Purpose |
|------|---------------|---------|
| `energy_checkin` | energy, mood, stress, timestamp | Daily input |
| `debt_calculation` | consecutive_low_weeks, accumulated_debt | Track burnout risk |
| `target_adjustment` | original_target, adjusted_target, reason | Automatic reduction |
| `achievement_unlock` | achievement_id, trigger_condition | Gamification event |

### Example Trace

```
TRACE: energy_debt_intervention
+-- SPAN: weekly_energy_aggregation
|   +-- input: { user_id: "student_123", week: 4 }
|   +-- output: {
|   |     history: [
|   |       { week: 1, avg_energy: 35 },
|   |       { week: 2, avg_energy: 30 },
|   |       { week: 3, avg_energy: 32 },
|   |       { week: 4, avg_energy: 28 }
|   |     ]
|   |   }
|   +-- duration: 34ms
+-- SPAN: debt_detection
|   +-- input: { energy_history: [...], threshold: 40 }
|   +-- output: {
|   |     debt_detected: true,
|   |     consecutive_weeks: 4,
|   |     severity: "high",
|   |     accumulated_debt: 180
|   |   }
|   +-- duration: 23ms
+-- SPAN: automatic_target_reduction
|   +-- input: { original_target: 63, debt_severity: "high" }
|   +-- output: {
|   |     new_target: 10,
|   |     reduction_percent: 84,
|   |     reason: "energy_debt_recovery_mode"
|   |   }
|   +-- duration: 18ms
+-- SPAN: recovery_plan_generation
|   +-- input: { reduced_weeks: 1, catch_up_weeks: [6,7,8] }
|   +-- output: { plan: "gentle_ramp_up", weekly_targets: [10, 40, 55, 70] }
|   +-- duration: 89ms
+-- SPAN: achievement_evaluation
    +-- input: { user_actions: ["accepted_reduction", "completed_checkin"] }
    +-- output: {
    |     unlocked: "self_care_champion",
    |     message: "Tu as ecoute ton corps. C'est la vraie victoire."
    |   }
    +-- duration: 12ms
```

### Why Tracing Matters

Gamification that promotes wellness must be transparent:
1. Why was my target reduced? (energy debt = 180 points)
2. What triggered the achievement? (accepted reduction + checkin)
3. How will I recover? (gentle ramp-up plan visible)
4. Is the system fair? (same rules for everyone, traceable)

---

## Chat Flow Traces

### Onboarding Chat

```
TRACE: onboarding_conversation
+-- SPAN: turn_1
|   +-- user_input: "Je suis en L2 Info"
|   +-- agent: "budget-coach"
|   +-- response: "Super! Et tu as un objectif en tete?"
|   +-- extracted: { diploma: "L2 Informatique" }
+-- SPAN: turn_2
|   +-- user_input: "Je veux economiser 500 euros pour les vacances"
|   +-- extracted: { goal_name: "vacances", amount: 500 }
+-- SPAN: turn_3
|   +-- user_input: "J'ai 800 euros par mois et je depense 750"
|   +-- extracted: { income: 800, expenses: 750, margin: 50 }
+-- SPAN: profile_complete
    +-- profile: { diploma, goal, budget }
    +-- redirect_to: "/plan"
```

### Skill/Item/Lifestyle/Trade Chats

```
TRACE: chat_add_item
+-- SPAN: user_message
|   +-- input: "J'ai une vieille guitare qui traine"
+-- SPAN: item_extraction
|   +-- agent: "job-matcher"
|   +-- extracted: { item: "guitare", condition: "vieille" }
+-- SPAN: price_estimation
|   +-- estimated_price: 150
|   +-- confidence: 0.75
|   +-- factors: ["condition", "market_demand"]
+-- SPAN: platform_suggestion
|   +-- recommended: "Leboncoin"
|   +-- alternatives: ["Vinted", "Facebook Marketplace"]
+-- SPAN: item_added
    +-- item_id: "guitare_001"
    +-- added_to_inventory: true
```

---

## Custom Opik Metrics

| Metric | Description | Killer Feature |
|--------|-------------|----------------|
| `comeback_success_rate` | % of catch-up plans achieved within 10% | #1 Crunch |
| `arbitrage_satisfaction` | User rating of job recommendations (1-5) | #2 Skill Arbitrage |
| `swipe_completion_rate` | % of users who complete full swipe session | #3 Swipe |
| `preference_stability` | How stable are learned preferences (entropy) | #3 Swipe |
| `energy_debt_recovery_time` | Avg weeks to return to normal energy | #4 Energy Debt |
| `self_care_achievement_rate` | % of users who unlock wellness badges | #4 Energy Debt |
| `lifestyle_savings` | Total monthly savings via lifestyle optimizations | Lifestyle Tab |
| `trade_savings` | Value saved via borrow/trade vs purchase | Trade Tab |
| `roll_dice_completion` | % of users who finish swipe after roll | Swipe Flow |
| `chat_conversion_rate` | % of chat interactions that add an element | Chat Flows |

---

## Dashboard Setup

### Key Views

1. **Session Overview**: See full user journey from onboarding to tracking
2. **Killer Feature Performance**: Metrics per feature
3. **Agent Latency**: Response times by agent
4. **Chat Effectiveness**: Conversion rates by chat type
5. **Error Tracking**: Failed operations and reasons

### Recommended Filters

- `user_id`: Filter by specific student
- `session_id`: Follow a complete journey
- `feature`: Filter by killer feature (#1-#4)
- `tab`: Filter by Mon Plan tab
- `agent`: Filter by agent name

---

## Quick Setup

```bash
# Opik self-hosted
cd opik/deployment/docker-compose
docker compose --profile opik up -d

# Available at http://localhost:5173
# Project: stride
```

---

## Integration Points

| Component | Opik Integration |
|-----------|------------------|
| Budget Coach | Traces budget calculations + chat responses |
| Job Matcher | Traces graph queries + scoring + price estimations |
| Energy Calculator | Traces debt detection + adjustments + comeback |
| Guardian | Traces validation decisions |
| Frontend | Links to trace dashboard for transparency |

---

## Why Hackathon Judges Should Care

### 1. Complex Multi-Agent = Traces Essential
4 agents coordinating recommendations. Without Opik, it's a black box. With Opik, judges can see exactly how agents collaborate.

### 2. Explainability for Trust
Students making financial decisions need to understand WHY. Opik enables "Show me how you calculated this" for every recommendation.

### 3. Continuous Learning Visibility
Swipe preferences evolve. Energy patterns change. Opik shows how the system adapts in real-time.

### 4. Wellness Monitoring
Energy debt tracking requires auditability. Opik proves the gamification is fair and helpful, not manipulative.

### 5. Live Demo Impact
During presentation, we can show:
- Real trace from a student interaction
- How comeback mode detected a recovery window
- Why SQL Coaching beat Python Freelance
- Achievement unlock in real-time

---

> "Stride doesn't just give recommendations. It shows you exactly how it got there."

---

## REST API avancée (opikRest.ts)

Au-delà du SDK TypeScript, Stride utilise l'API REST Opik pour des fonctionnalités avancées.

### Feedback Definitions

Définir des métriques de feedback cohérentes pour l'annotation.

```typescript
import { createFeedbackDefinition } from './lib/opik';

// Numerical: score de 1 à 5
await createFeedbackDefinition({
  name: 'safety',
  type: 'numerical',
  description: 'How safe is this advice? (1=dangerous, 5=very safe)',
  minValue: 1,
  maxValue: 5,
});

// Categorical: IMPORTANT - utiliser un map, pas un array!
await createFeedbackDefinition({
  name: 'response_quality',
  type: 'categorical',
  description: 'Overall response quality',
  // Format correct: { category: numeric_value }
  categories: { poor: 0.0, acceptable: 0.33, good: 0.66, excellent: 1.0 },
});
```

**⚠️ Piège courant**: L'API Opik attend `categories` comme `LinkedHashMap<String, Double>`, pas un array de strings.

### Online Evaluation Rules (LLM as Judge)

Auto-évaluer les traces avec des prompts custom.

```typescript
import { createEvaluator, getProjectIdByName } from './lib/opik';

// IMPORTANT: Les project_ids doivent être des UUIDs, pas des noms!
const projectId = await getProjectIdByName('stride');

await createEvaluator({
  name: 'Student Safety Check',
  type: 'llm_as_judge',
  action: 'evaluator',
  projectIds: [projectId], // UUID requis!
  samplingRate: 1.0,
  enabled: true,
  llmConfig: {
    prompt: `Evaluate if this advice is safe for a student...`,
    scoreName: 'safety_score',
    model: 'gpt-4',
    minScore: 1,
    maxScore: 5,
  },
});
```

**⚠️ Timing important**: Le projet est créé automatiquement par Opik SDK lors du premier `trace()`. Donc au premier démarrage :
1. `getProjectIdByName('stride')` retourne `null` (projet pas encore créé)
2. Les evaluators/queues sont ignorés
3. Après le premier chat qui crée un trace, le projet existe
4. Au prochain restart, les evaluators/queues seront créés

### Annotation Queues

Workflow de review humain pour les traces importantes.

```typescript
import { createAnnotationQueue } from './lib/opik';

await createAnnotationQueue({
  name: 'Review Student Advice',
  projectId: projectUuid, // UUID requis!
  scope: 'trace',
  description: 'Review AI-generated financial advice',
  instructions: 'Check for accuracy, safety, and relevance',
  commentsEnabled: true,
  feedbackDefinitionNames: ['safety', 'appropriateness'],
});
```

### Gestion des erreurs 409

Les erreurs 409 (Conflict) sont normales lors de la création idempotente:

```typescript
try {
  await createFeedbackDefinition({ name: 'safety', ... });
} catch (error) {
  if (error.message.includes('409')) {
    // Déjà existant - c'est OK
    console.log('Feedback definition already exists (ok)');
  } else {
    // Vraie erreur
    throw error;
  }
}
```

---

## Span Configuration Requise

Les spans Opik ont des champs obligatoires souvent oubliés.

### Champs obligatoires

| Champ | Description | Valeurs |
|-------|-------------|---------|
| `type` | **REQUIS** - Type du span | `'general' \| 'tool' \| 'llm' \| 'guardrail'` |
| `name` | Identifiant du span | String |

### Pour les spans LLM

```typescript
ctx.createChildSpan(
  'llm_call',
  async (span) => {
    const result = await callGroq(prompt);

    // Token usage - format spécifique
    span.setUsage({
      prompt_tokens: result.usage.prompt_tokens,
      completion_tokens: result.usage.completion_tokens,
      total_tokens: result.usage.total_tokens,
    });

    // Coût - champ SÉPARÉ, pas dans usage!
    span.setCost(0.0023);

    span.setOutput({ response: result.text });
    return result;
  },
  {
    type: 'llm',  // REQUIS pour les appels LLM
    model: 'llama-3.1-70b-versatile',
    provider: 'groq',
    input: { prompt },
  }
);
```

### Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| Span non visible | `type` manquant | Ajouter `type: 'general'` ou autre |
| Usage non affiché | Format incorrect | Utiliser `{ prompt_tokens, completion_tokens, total_tokens }` |
| Coût non affiché | Mis dans usage | Utiliser `setCost()` ou `totalEstimatedCost` séparément |

---

## Thread ID pour conversations

Grouper les traces d'une même conversation de chat.

### Fonctions disponibles

```typescript
import { setThreadId, generateThreadId, getCurrentThreadId } from './lib/opik';

// Créer un nouvel ID de thread
const threadId = generateThreadId();
// Résultat: "thread_1705123456789_abc1234"

// Définir manuellement
setThreadId('conversation_user123_session1');

// Récupérer l'ID actuel
const current = getCurrentThreadId();
```

### Usage dans trace()

```typescript
import { trace } from './lib/opik';

// Première trace de la conversation
const threadId = generateThreadId();

await trace(
  'onboarding.turn_1',
  async (ctx) => {
    // ... traitement
  },
  { threadId }
);

// Traces suivantes de la même conversation
await trace(
  'onboarding.turn_2',
  async (ctx) => {
    // ... traitement
  },
  { threadId } // Même threadId = même conversation
);
```

### Dans le dashboard Opik

Les traces avec le même `threadId` apparaissent groupées, permettant de:
- Voir l'historique complet d'une conversation
- Analyser les patterns de multi-turn
- Mesurer la durée totale des sessions

---

## Évaluation Hybride

Stride utilise une évaluation à deux niveaux (implémentée dans `opik-integration.ts`).

### Architecture

```
Input → Heuristics (fast) → LLM Scoring (deep) → Combined Score
                ↓                    ↓
         Veto si critique    G-Eval semantic
```

### 1. Heuristics (rapide, déterministe)

Patterns regex et règles métier:

```typescript
const heuristicChecks = {
  // Contenu inapproprié
  inappropriateContent: /\b(gambling|crypto|loan shark)\b/i,

  // Format invalide
  missingBudget: (response) => !response.includes('€'),

  // Valeurs hors limites
  unrealisticAmount: (amount) => amount > 10000,
};
```

### 2. LLM Scoring (G-Eval sémantique)

Évaluation nuancée avec LLM:

```typescript
const gEvalCriteria = {
  safety: {
    prompt: `Score this advice safety for students (1-5)...`,
    weight: 0.3,
  },
  appropriateness: {
    prompt: `Is this appropriate for limited student budget?...`,
    weight: 0.25,
  },
  coherence: {
    prompt: `Is the advice internally consistent?...`,
    weight: 0.25,
  },
  actionability: {
    prompt: `Are the steps concrete and achievable?...`,
    weight: 0.2,
  },
};
```

### 3. Mécanisme de Veto

Si un critère critique échoue:

```typescript
// Score global plafonné si safety < 2
if (scores.safety < 2) {
  finalScore = Math.min(finalScore, 2.0);
  flags.push('SAFETY_VETO');
}

// Score global plafonné si inapproprié
if (scores.appropriateness < 2) {
  finalScore = Math.min(finalScore, 2.5);
  flags.push('APPROPRIATENESS_VETO');
}
```

---

## Gestion des erreurs

### Fallback gracieux

Si Opik est indisponible, l'application continue:

```typescript
import { trace } from './lib/opik';

// Si OPIK_API_KEY manquant ou serveur down:
// - trace() retourne un mock context
// - Logs en console au lieu d'Opik
// - Pas de crash de l'application

await trace('operation', async (ctx) => {
  // Ce code s'exécute toujours
  ctx.setOutput({ result: 'ok' });
  return result;
});
```

### Pattern interne

```typescript
const client = await getOpikClient();
if (!client) {
  // Fallback: mock span avec logging console
  const mockCtx = createMockContext();
  const result = await fn(mockCtx);
  mockCtx.end(); // Log en console
  return result;
}

// Client disponible: trace réelle
const traceHandle = client.trace({ ... });
```

### Vérification de disponibilité

```typescript
import { isOpikRestAvailable } from './lib/opik';

const available = await isOpikRestAvailable();
if (!available) {
  console.log('Opik non disponible, métriques désactivées');
}
```

---

## Résumé des fichiers

| Fichier | Rôle |
|---------|------|
| `lib/opik.ts` | SDK wrapper, trace/span, thread ID |
| `lib/opikRest.ts` | API REST: evaluators, queues, definitions |
| `lib/opik-integration.ts` | Évaluation hybride (heuristics + G-Eval) |

---

## Variables d'environnement complètes

| Variable | Description | Requis |
|----------|-------------|--------|
| `OPIK_API_KEY` | Clé API Opik Cloud | ✅ |
| `OPIK_WORKSPACE` | Nom du workspace | ✅ |
| `OPIK_PROJECT` | Nom du projet (défaut: "stride") | ❌ |
| `OPIK_BASE_URL` | URL custom (self-hosted) | ❌ |

---

## Feedback Scores (SDK v1.9.87+)

### Méthode correcte

Le SDK TypeScript Opik utilise un système de batch queue pour les feedback scores.

```typescript
import { Opik } from 'opik';

const client = new Opik();

// Créer un trace
const trace = client.trace({
  name: 'my_trace',
  input: { input: 'Hi!' },
  output: { output: 'Hello!' },
});

// Ajouter des feedback scores via batch queue
client.traceFeedbackScoresBatchQueue.create({
  id: trace.id,           // trace ID (requis)
  name: 'overall_quality', // nom du score
  value: 0.9,              // valeur 0-1
  source: 'sdk',           // 'sdk' | 'ui' | 'online_scoring'
  reason: 'Good answer',   // optionnel
});

client.traceFeedbackScoresBatchQueue.create({
  id: trace.id,
  name: 'coherence',
  value: 0.8,
  source: 'sdk',
});

// Envoyer le batch
await client.flush();
```

### Interface FeedbackScoreBatchItem

```typescript
interface FeedbackScoreBatchItem {
  id: string;              // trace_id (requis)
  name: string;            // nom du score (requis)
  value: number;           // valeur numérique (requis)
  source: 'sdk' | 'ui' | 'online_scoring'; // (requis)
  reason?: string;         // explication optionnelle
  projectName?: string;    // projet (optionnel)
  projectId?: string;      // UUID projet (optionnel)
  categoryName?: string;   // catégorie (optionnel)
  author?: string;         // auteur (optionnel)
}
```

### Méthodes BatchQueue

| Méthode | Description |
|---------|-------------|
| `.create(item)` | Ajoute un score au batch |
| `.flush()` | Envoie tous les scores en attente |
| `.get(id)` | Récupère un score par ID |
| `.update(id, updates)` | Met à jour un score |
| `.delete(id)` | Supprime un score |

### ⚠️ Erreur courante

```typescript
// ❌ INCORRECT - Ces méthodes n'existent pas
client.logTracesFeedbackScores([...]);           // N'existe pas
client.traceFeedbackScoresBatchQueue.queue(...); // N'existe pas

// ✅ CORRECT
client.traceFeedbackScoresBatchQueue.create({...});
await client.flush();
```

---

## Prompts Management

Gestion des prompts versionnés avec templates Mustache ou Jinja2.

### Créer un Text Prompt

```typescript
import { Opik, PromptType } from 'opik';

const client = new Opik();

const prompt = await client.createPrompt({
  name: 'budget-advice',
  prompt: 'Bonjour {{name}}, ton budget est de {{budget}}€. Voici mes conseils...',
  type: PromptType.MUSTACHE, // ou JINJA2
  metadata: { version: '1.0', category: 'finance' },
  tags: ['production', 'budget'],
});
```

### Créer un Chat Prompt (multimodal)

```typescript
const messages = [
  { role: 'system', content: 'Tu es Bruno, coach budget pour étudiants spécialisé en {{domain}}.' },
  { role: 'user', content: 'Comment économiser {{amount}}€?' }
];

const chatPrompt = await client.createChatPrompt({
  name: 'bruno-advisor',
  messages: messages,
  type: PromptType.MUSTACHE,
  tags: ['chat', 'onboarding'],
});
```

### Récupérer et formater

```typescript
// Dernière version
const prompt = await client.getPrompt({ name: 'budget-advice' });

// Version spécifique
const oldVersion = await client.getPrompt({ name: 'budget-advice', commit: 'abc123de' });

// Formater avec variables
const text = prompt.format({ name: 'Alice', budget: 500 });
// "Bonjour Alice, ton budget est de 500€. Voici mes conseils..."
```

### Gestion des versions

```typescript
// Historique des versions
const versions = await prompt.getVersions();
versions.forEach(v => console.log(v.getVersionInfo()));

// Comparer deux versions
const diff = current.compareTo(previous);

// Restaurer une version
const restored = await prompt.useVersion(targetVersion);
```

### Recherche avec OQL

```typescript
// Tous les prompts
const all = await client.searchPrompts();

// Par nom
const byName = await client.searchPrompts('name = "budget-advice"');

// Par tags
const prod = await client.searchPrompts('tags contains "production"');

// Combiné
const filtered = await client.searchPrompts(
  'template_structure = "chat" AND tags contains "production"'
);
```

---

## Opik Query Language (OQL)

Syntaxe SQL-like pour filtrer les données Opik.

### Opérateurs

| Catégorie | Opérateurs |
|-----------|------------|
| Égalité | `=`, `!=` |
| Texte | `contains`, `not_contains`, `starts_with`, `ends_with` |
| Comparaison | `>`, `<` |
| Listes | `contains`, `not_contains` |

### Syntaxe

```typescript
// ⚠️ IMPORTANT: Utiliser des guillemets doubles pour les valeurs string
await client.searchPrompts('name = "greeting"');      // ✅ Correct
await client.searchPrompts("name = 'greeting'");      // ❌ Incorrect
await client.searchPrompts('name = greeting');        // ❌ Incorrect

// Combiner avec AND (OR non supporté)
await client.searchPrompts('name starts_with "prod-" AND tags contains "approved"');
```

### Champs filtrables (Prompts)

| Champ | Type | Exemple |
|-------|------|---------|
| `id` | String | `id = "prompt-123"` |
| `name` | String | `name contains "budget"` |
| `description` | String | `description contains "étudiant"` |
| `tags` | List | `tags contains "production"` |
| `template_structure` | String | `template_structure = "chat"` |
| `created_by` | String | `created_by = "user@example.com"` |
| `created_at` | DateTime | `created_at > "2024-01-01"` |

---

## Evaluation Metrics (TypeScript)

Métriques d'évaluation pour mesurer la qualité des outputs LLM.

### Métriques heuristiques

```typescript
import { ExactMatch, Contains, RegexMatch, IsJson } from 'opik';

// Correspondance exacte
const exact = new ExactMatch();

// Contient un texte
const contains = new Contains();

// Match regex
const regex = new RegexMatch();

// JSON valide
const isJson = new IsJson();
```

### Métriques LLM-as-Judge

```typescript
import { AnswerRelevance, Hallucination, Moderation, Usefulness } from 'opik';

// Pertinence de la réponse (0.0 = aucune, 1.0 = parfaite)
const relevance = new AnswerRelevance({ model: 'gpt-4o' });

// Détection d'hallucinations (0.0 = aucune, 1.0 = hallucination)
const hallucination = new Hallucination({ model: 'gpt-4o' });

// Modération contenu (0.0 = safe, 1.0 = harmful)
const moderation = new Moderation({ model: 'gpt-4o' });

// Utilité (0.0 = inutile, 1.0 = très utile)
const usefulness = new Usefulness({ model: 'gpt-4o' });
```

### Configuration des métriques LLM

```typescript
const metric = new Hallucination({
  model: 'gpt-4o',        // ID du modèle ou instance LanguageModel
  temperature: 0.3,       // Température (reproductibilité)
  seed: 42,               // Seed (déterminisme)
  maxTokens: 1000,        // Limite tokens
});
```

### Créer une métrique custom

```typescript
import { BaseMetric, z, EvaluationScoreResult } from 'opik';

export class BudgetSafetyMetric extends BaseMetric {
  public validationSchema = z.object({
    output: z.string(),
    studentBudget: z.number(),
  });

  async score(input: { output: string; studentBudget: number }): Promise<EvaluationScoreResult> {
    const { output, studentBudget } = input;

    // Vérifier si le conseil respecte le budget
    const mentionsHighAmount = /\d{4,}/.test(output);
    const isSafe = !mentionsHighAmount || studentBudget > 1000;

    return {
      name: this.name,
      value: isSafe ? 1.0 : 0.0,
      reason: isSafe
        ? 'Conseil adapté au budget étudiant'
        : 'Montants trop élevés pour un budget étudiant',
    };
  }
}
```

### Utiliser plusieurs métriques

```typescript
import { evaluate } from 'opik';

await evaluate({
  dataset: myDataset,
  task: myTask,
  scoringMetrics: [
    new AnswerRelevance({ model: 'gpt-4o' }),
    new Hallucination({ model: 'gpt-4o' }),
    new BudgetSafetyMetric(),
  ],
  scoringWorkers: 4, // Parallélisation
});
```

---

## Experiments

Lier des traces à des items de dataset pour évaluation structurée.

### Créer et gérer des experiments

```typescript
import { Opik, ExperimentItemReferences } from 'opik';

const client = new Opik();

// Créer un experiment
const experiment = await client.createExperiment({
  datasetName: 'student-queries',
  name: 'budget-advisor-v2',
  experimentConfig: {
    model: 'llama-3.1-70b-versatile',
    temperature: 0.7,
    promptTemplate: 'Réponds à cette question budget: {question}',
  },
});

// Lier des items de dataset à des traces
const items = [
  new ExperimentItemReferences({
    datasetItemId: 'dataset-item-1',
    traceId: 'trace-id-1',
  }),
  new ExperimentItemReferences({
    datasetItemId: 'dataset-item-2',
    traceId: 'trace-id-2',
  }),
];
await experiment.insert(items);

// Récupérer les items
const allItems = await experiment.getItems();
const limited = await experiment.getItems({ maxResults: 50 });

// URL du dashboard
const url = await experiment.getUrl();
console.log(`Voir l'experiment: ${url}`);
```

### Récupérer des experiments

```typescript
// Par nom (retourne tous les matchs)
const experiments = await client.getExperimentsByName('budget-advisor-v2');

// Par nom (premier match)
const experiment = await client.getExperiment('budget-advisor-v2');

// Par dataset
const datasetExperiments = await client.getDatasetExperiments('student-queries', 100);

// Par ID
const byId = await client.getExperimentById('experiment-uuid');
```

### Mettre à jour et supprimer

```typescript
// Mettre à jour
await client.updateExperiment('experiment-id', {
  name: 'budget-advisor-v3',
  experimentConfig: { model: 'gpt-4o', temperature: 0.5 },
});

// Supprimer
await client.deleteExperiment('experiment-id');
```

---

## Distributed Tracing

Tracer les requêtes à travers plusieurs services (microservices, API gateway, etc.).

### Architecture

```
┌─────────────┐    headers    ┌─────────────┐
│   Client    │ ────────────► │   Server    │
│  (trace)    │  trace_id     │  (spans)    │
│             │  span_id      │             │
└─────────────┘               └─────────────┘
```

### Côté Client (initiateur)

```typescript
import { opik_context } from 'opik';

// Récupérer les headers de trace à propager
const headers = opik_context.get_distributed_trace_headers();
// { opik_trace_id: "xxx", opik_parent_span_id: "yyy" }

// Ajouter aux headers de la requête HTTP
const response = await fetch('http://service-b/api', {
  headers: {
    ...headers,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});
```

### Côté Server (récepteur)

```typescript
import { track } from 'opik';

// Le décorateur @track accepte automatiquement opik_distributed_trace_headers
@track
async function processRequest(
  data: RequestData,
  opik_distributed_trace_headers?: { opik_trace_id: string; opik_parent_span_id: string }
) {
  // Les spans créés ici seront liés au trace parent
  return await doProcessing(data);
}

// Dans le handler HTTP
app.post('/api', async (req, res) => {
  const result = await processRequest(req.body, {
    opik_trace_id: req.headers['opik-trace-id'],
    opik_parent_span_id: req.headers['opik-parent-span-id'],
  });
  res.json(result);
});
```

### Cas d'usage Stride

```typescript
// Frontend → Chat API → MCP Server → DuckDB

// 1. Frontend initie le trace
const traceHeaders = generateDistributedHeaders();

// 2. Chat API reçoit et propage
app.post('/api/chat', async (req) => {
  const headers = extractOpikHeaders(req);

  // Créer span enfant
  const result = await trace('chat.process', async (ctx) => {
    // Appel MCP avec propagation
    return await mcpClient.call('budget-coach', data, headers);
  }, { distributedHeaders: headers });
});

// 3. MCP Server trace ses opérations
// Les spans apparaissent dans le même trace parent
```

### Bonnes pratiques

1. **Toujours propager les headers** dans les appels inter-services
2. **Utiliser des noms de span descriptifs** par service (`chat.validate`, `mcp.budget-coach`, `db.query`)
3. **Inclure le service name** dans les attributs pour filtrage
4. **Gérer les timeouts** - les traces distribuées peuvent être longues

---

## Typage Sémantique des Spans (Semantic Types)

Pour tirer le meilleur parti de l'interface Opik, il est **impératif** de typer les spans correctement. Par défaut, un span est de type `general`.

### Types Disponibles

| Type | Usage | Exemple Stride |
|------|-------|----------------|
| `general` | Défaut. Opérations génériques, blocs de code. | `tips.parallel_agents`, `tips.orchestrator` |
| `tool` | **Agents et outils externes**. Indispensable pour voir les "appels" dans la timeline. | `agent.budget_coach`, `agent.job_matcher` |
| `llm` | **Appels LLM**. Doit contenir les tokens usage et model. | `llm_chat`, `groq.completion` |
| `guardrail` | **Validation & Sécurité**. Affiche un shield (bouclier) dans l'UI. | `agent.guardian` |

### Implémentation

```typescript
// Exemple: Agent (Tool)
await createSpan(
  'agent.job_matcher',
  async (span) => { ... },
  { 
    type: 'tool', // <--- IMPORTANT
    tags: ['job-matcher'] 
  }
);

// Exemple: Guardian (Guardrail)
await createSpan(
  'agent.guardian',
  async (span) => { ... },
  { 
    type: 'guardrail', // <--- Affiche l'icône de sécurité
    tags: ['validation'] 
  }
);
```

---

## Troubleshooting

### Erreur 401: User with provided api key not found!

**Symptôme**: L'application démarre mais affiche des erreurs 401 lors de l'envoi des traces.

**Cause Probable**:
- La clé API utilisée n'est pas celle que vous pensez.
- Dans notre structure monorepo, `packages/frontend/.env` est prioritaire sur le `.env` racine pour l'application frontend.

**Solution**:
1. Vérifiez `packages/frontend/.env`.
2. Assurez-vous qu'il contient la **même** clé `OPIK_API_KEY` que le fichier `.env` racine.
3. Si vous utilisez Opik Cloud, vérifiez que la clé correspond bien au workspace configuré.

### Script de Debug

Si vous avez des doutes sur la connectivité, vous pouvez créer un script `debug-opik.ts` à la racine pour tester la clé en isolation :

```typescript
import { Opik } from 'opik';
import dotenv from 'dotenv';
dotenv.config(); // Charge le .env racine

const client = new Opik({ 
  apiKey: process.env.OPIK_API_KEY,
  workspaceName: process.env.OPIK_WORKSPACE 
});

// Test simple trace
const trace = client.trace({ name: 'debug-check' });
trace.end();
await client.flush();
console.log('Success!');
```

