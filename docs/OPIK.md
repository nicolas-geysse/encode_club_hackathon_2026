# Opik Observability for Stride

> Complete traceability for multi-agent financial AI

Stride uses **Opik self-hosted** for full observability across 4 AI agents orchestrating student financial recommendations. This document explains how Opik enables each of our **4 Killer Features**.

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

### Variables d'environnement (Self-hosted)

```bash
# Opik OTLP endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5173/api/v1/private/otel
OTEL_EXPORTER_OTLP_HEADERS='projectName=stride'

# OpenAI for agents
OPENAI_API_KEY=sk-...

# Groq for voice
GROQ_API_KEY=gsk_...
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
