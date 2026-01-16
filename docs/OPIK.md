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
├── SPAN: energy_trend_analysis
│   ├── input: { weeks: [1,2,3,4], energy_scores: [30,25,35,85] }
│   ├── output: { trend: "recovering", confidence: 0.92 }
│   └── duration: 45ms
├── SPAN: comeback_window_detection
│   ├── input: { current_week: 5, energy: 85, deficit: 126€ }
│   ├── output: { window_detected: true, available_weeks: [5,6,7] }
│   └── duration: 23ms
├── SPAN: aggressive_plan_generation
│   ├── input: { deficit: 126€, weeks: 3, max_capacity: 90% }
│   ├── output: { plan: [50€, 45€, 31€], strategies: [...] }
│   └── duration: 156ms
└── SPAN: guardian_validation
    ├── input: { plan: [...], student_context: {...} }
    ├── output: { valid: true, confidence: 0.85 }
    └── duration: 342ms
```

### Why Tracing Matters

When a student asks "Why is my target suddenly 50€ instead of 30€?", we can show:
1. Energy recovery detected at week 5
2. 126€ deficit from weeks 1-4
3. Distribution logic: higher capacity weeks get more
4. Guardian validated the plan as realistic

### Dashboard Value

- **Debug failed comebacks**: See why catch-up plans didn't work
- **Tune detection**: Adjust energy thresholds based on outcomes
- **Track accuracy**: Compare predictions vs actual student performance

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
├── SPAN: skill_extraction
│   ├── input: { profile: "L2 Informatique", declared_skills: ["Python", "SQL"] }
│   ├── output: { skills: ["python", "sql", "data_analysis"], confidence: 0.88 }
│   └── duration: 67ms
├── SPAN: graph_job_matching
│   ├── input: { skills: ["python", "sql"] }
│   ├── output: {
│   │     jobs: [
│   │       { id: "freelance_dev", path: "python→enables→freelance_dev" },
│   │       { id: "sql_coaching", path: "sql→enables→sql_coaching" },
│   │       { id: "data_entry", path: "sql→enables→data_entry" }
│   │     ]
│   │   }
│   └── duration: 89ms
├── SPAN: multi_criteria_scoring
│   ├── input: { jobs: [...], weights: { rate: 0.3, demand: 0.25, effort: 0.25, rest: 0.2 } }
│   ├── output: {
│   │     scores: [
│   │       { job: "freelance_dev", rate: 25, effort: "high", final_score: 6.2 },
│   │       { job: "sql_coaching", rate: 22, effort: "moderate", final_score: 8.7 },
│   │       { job: "data_entry", rate: 12, effort: "low", final_score: 7.1 }
│   │     ],
│   │     recommendation: "sql_coaching",
│   │     reasoning: "Best balance of pay and sustainability"
│   │   }
│   └── duration: 112ms
└── SPAN: co_benefits_enrichment
    ├── input: { job: "sql_coaching" }
    ├── output: { benefits: ["reinforces_learning", "cv_plus", "networking"] }
    └── duration: 34ms
```

### Why Tracing Matters

When we recommend SQL Coaching (22€/h) over Python Freelance (25€/h), the student can see:
1. Python Dev scored 6.2/10 due to high cognitive effort
2. SQL Coaching scored 8.7/10 with better effort/rest balance
3. Graph path shows skill→job relationship
4. Co-benefits add CV++ and learning reinforcement

### Dashboard Value

- **A/B test scoring weights**: Tune the arbitrage formula
- **Track satisfaction**: Correlate recommendations with user feedback
- **Debug unexpected rankings**: Understand why certain jobs rank higher

---

## Killer Feature #3: Swipe Scenarios (Tinder for Strategies)

### What It Does
Presents financial strategies in a Tinder-like interface. Students swipe right (interested) or left (not interested). The app learns preferences over time.

### What Opik Traces

| Span | Data Captured | Purpose |
|------|---------------|---------|
| `scenario_presentation` | scenario_id, attributes_shown | Track what user saw |
| `swipe_decision` | decision, time_spent, scenario | Capture user choice |
| `preference_update` | old_weights, new_weights, delta | Learn from decisions |

### Example Trace

```
TRACE: swipe_session_user_123
├── SPAN: session_init
│   ├── input: { user_id: "student_123", goal: "save_500€" }
│   ├── output: { scenarios_queued: 4, preference_profile: {...} }
│   └── duration: 28ms
├── SPAN: scenario_1_freelance_dev
│   ├── input: { scenario: "freelance_dev", attributes: ["25€/h", "high_effort", "10h/week"] }
│   ├── decision: "left" (rejected)
│   ├── time_spent: 3.2s
│   └── duration: 3245ms
├── SPAN: scenario_2_tutoring
│   ├── input: { scenario: "tutoring", attributes: ["20€/h", "moderate_effort", "6h/week"] }
│   ├── decision: "right" (accepted)
│   ├── time_spent: 1.8s
│   └── duration: 1823ms
├── SPAN: preference_learning
│   ├── input: { decisions: [{ "freelance_dev": "reject" }, { "tutoring": "accept" }] }
│   ├── output: {
│   │     updated_weights: {
│   │       "effort_sensitivity": 0.65 → 0.75,
│   │       "hourly_rate_priority": 0.70 → 0.60,
│   │       "time_flexibility": 0.50 → 0.55
│   │     }
│   │   }
│   └── duration: 67ms
└── SPAN: next_recommendations_rerank
    ├── input: { new_weights: {...}, remaining_scenarios: [...] }
    ├── output: { reordered_queue: [...] }
    └── duration: 45ms
```

### Why Tracing Matters

Preference learning is powerful but opaque. Opik shows:
1. Exactly which swipes influenced which weights
2. How recommendations changed after each decision
3. Convergence of preference profile over time
4. Anomalies (contradictory swipes)

### Dashboard Value

- **Debug preference drift**: Understand why recommendations changed
- **Track engagement**: Time spent per scenario, completion rates
- **Improve scenarios**: Which attributes correlate with acceptance

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
├── SPAN: weekly_energy_aggregation
│   ├── input: { user_id: "student_123", week: 4 }
│   ├── output: {
│   │     history: [
│   │       { week: 1, avg_energy: 35 },
│   │       { week: 2, avg_energy: 30 },
│   │       { week: 3, avg_energy: 32 },
│   │       { week: 4, avg_energy: 28 }
│   │     ]
│   │   }
│   └── duration: 34ms
├── SPAN: debt_detection
│   ├── input: { energy_history: [...], threshold: 40 }
│   ├── output: {
│   │     debt_detected: true,
│   │     consecutive_weeks: 4,
│   │     severity: "high",
│   │     accumulated_debt: 180
│   │   }
│   └── duration: 23ms
├── SPAN: automatic_target_reduction
│   ├── input: { original_target: 63€, debt_severity: "high" }
│   ├── output: {
│   │     new_target: 10€,
│   │     reduction_percent: 84,
│   │     reason: "energy_debt_recovery_mode"
│   │   }
│   └── duration: 18ms
├── SPAN: recovery_plan_generation
│   ├── input: { reduced_weeks: 1, catch_up_weeks: [6,7,8] }
│   ├── output: { plan: "gentle_ramp_up", weekly_targets: [10€, 40€, 55€, 70€] }
│   └── duration: 89ms
└── SPAN: achievement_evaluation
    ├── input: { user_actions: ["accepted_reduction", "completed_checkin"] }
    ├── output: {
    │     unlocked: "self_care_champion",
    │     message: "Tu as écouté ton corps. C'est la vraie victoire."
    │   }
    └── duration: 12ms
```

### Why Tracing Matters

Gamification that promotes wellness must be transparent:
1. Why was my target reduced? (energy debt = 180 points)
2. What triggered the achievement? (accepted reduction + checkin)
3. How will I recover? (gentle ramp-up plan visible)
4. Is the system fair? (same rules for everyone, traceable)

### Dashboard Value

- **Track wellness impact**: Correlate energy debt with student outcomes
- **Tune thresholds**: When should reduction kick in?
- **Measure adoption**: Do students accept or override reductions?

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

---

## Trace Hierarchy

```
TRACE: student_financial_analysis
├── SPAN: budget_coach_analysis
│   ├── SPAN: income_expense_calculation
│   └── SPAN: optimization_suggestions
├── SPAN: skill_arbitrage (Killer #2)
│   ├── SPAN: graph_job_matching
│   └── SPAN: multi_criteria_scoring
├── SPAN: energy_assessment (Killer #1 & #4)
│   ├── SPAN: debt_detection
│   ├── SPAN: comeback_window_check
│   └── SPAN: target_adjustment
├── SPAN: swipe_session (Killer #3)
│   ├── SPAN: scenario_presentation (x4)
│   └── SPAN: preference_learning
└── SPAN: guardian_validation
    ├── SPAN: heuristics_check (~50ms)
    └── SPAN: geval_llm_judge (~500ms)
```

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
| Budget Coach | Traces budget calculations |
| Job Matcher | Traces graph queries + scoring |
| Energy Calculator | Traces debt detection + adjustments |
| Guardian | Traces validation decisions |
| Frontend | Links to trace dashboard |

---

> "Stride doesn't just give recommendations. It shows you exactly how it got there."
