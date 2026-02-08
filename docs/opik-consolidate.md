# Hackathon Gap Analysis & Opik Consolidation Plan

**App:** Stride — Student Financial Health Navigator
**Tracks:** Opik/Evaluation (sponsor), Financial Health, Wellness, Social Impact
**Date:** 2026-02-08

---

## Executive Summary

Stride has **deep infrastructure** across all 4 tracks but a critical gap: much of it is **built but not wired up**. The evaluation system (G-Eval, datasets, experiments) exists as dead code. This creates a paradox — judges who look at the codebase see sophistication, but the running app doesn't demonstrate it.

**Priority order for max judge impact:**
1. **Opik** (sponsor prize): Wire up existing evaluation to production flow
2. **Financial Health** (main track): Add spending insights + financial literacy layer
3. **Wellness** (secondary): Add disclaimers + micro-habit system
4. **Social Impact** (tertiary): Implement T0/T1 from social-community-impact.md

---

## 1. OPIK & EVALUATION — Sponsor Track

### Judging Criteria
> "Showcase exceptional implementation of evaluation and observability. Demonstrate how you use Opik to systematically track experiments, measure agent performance, and improve system quality with data-driven insights."

### What EXISTS (strong foundation)

| Layer | Status | Files | Evidence |
|-------|--------|-------|----------|
| **Tracing** | 99+ trace calls | `opik.ts` (both packages) | Every LLM call, agent, tool, workflow traced |
| **Spans** | Nested hierarchy | `trace().createChildSpan()` | Parent→child spans visible in Opik UI |
| **Feedback Scores** | 25+ metrics | `logFeedbackScores()` in 4 endpoints | Swipe preference, user ratings, evaluation scores |
| **Prompt Versioning** | 13+ agents | `registerPrompt()` + SHA256 hash | Version tracking enables regression detection |
| **Sampling** | Intelligent 10% | `trace-sampling.ts` | 100% for errors/new users, 10% random |
| **PII Protection** | Location redaction | `sanitizeLocationPII()` | FERPA/GDPR compliance |
| **REST API Layer** | Full CRUD | `opikRest.ts` (1560 lines) | Datasets, Experiments, Evaluators, Annotations, Metrics |
| **G-Eval System** | 4 criteria | `evaluation/geval/` | Appropriateness, Safety, Coherence, Actionability |
| **Heuristics** | 5 checks | `evaluation/heuristics/` | Calculation, Risk Keywords, Readability, Tone, Disclaimers |
| **Hybrid Evaluation** | Heuristic + LLM | `opik-integration.ts` | 60% heuristic / 40% LLM-as-Judge with confidence weighting |
| **Online Evaluators** | 4 presets | `STRIDE_EVALUATORS` | Intent Detection, Safety, Appropriateness, Actionability |
| **Feedback Definitions** | 7 presets | `STRIDE_FEEDBACK_DEFINITIONS` | Numerical + categorical metrics |
| **Annotation Queue** | Configured | `initializeStrideOpikSetup()` | Human review queue for financial advice |
| **Benchmark Dataset** | 47 test cases | `scripts/create-benchmark-dataset.ts` | Intent, Extraction, Safety, Conversation categories |
| **Daily Experiment** | Script ready | `scripts/run-daily-experiment.ts` | `npx tsx scripts/run-daily-experiment.ts` |

### What's NOT WIRED UP (critical gaps)

| Gap | Impact | Detail |
|-----|--------|--------|
| **`runHybridEvaluationWithTracing()` never called** | HIGH | G-Eval + Heuristics evaluation exists but is dead code — never called from chat or any production flow |
| **Datasets never created at runtime** | HIGH | `createDataset()`, `addDatasetItems()` API wrappers exist but are never called from app code. Benchmark dataset requires manual CLI run |
| **Experiments never run automatically** | HIGH | Daily experiment script exists but isn't integrated into app lifecycle or CI |
| **Online evaluators may not trigger** | MEDIUM | `initializeStrideOpikSetup()` is called from `chat.ts` but evaluators depend on Opik Cloud processing |
| **No Opik Agent Optimizer** | MEDIUM | Mentioned in hackathon examples, completely absent from codebase |
| **No Opik dashboard screenshots/demos** | LOW | Judges need to see the dashboard, not just code |
| **Chat endpoint lacks per-response evaluation** | HIGH | `chat.ts` traces extraction + generation but never evaluates response quality |

### Action Plan — Opik

#### P0: Wire evaluation to chat flow (2-3h)

**Goal:** Every chat response is evaluated and scored in real-time.

1. **Add online evaluation to `chat.ts` response path:**
   - After generating a chat response, call `runHybridEvaluationWithTracing()` from `evaluation/`
   - Log scores as feedback on the chat trace
   - Store high-scoring responses to Opik dataset for future benchmarking
   - This gives judges: "Every response is evaluated by 5 heuristics + 4 LLM-as-Judge criteria"

2. **Add intent detection confidence score:**
   - Already partially done — `llmClassifier.ts` has `confidence` in output
   - Log as feedback score `intent_detection_confidence` on every chat trace

3. **Run benchmark dataset on startup (or endpoint):**
   - Create API endpoint `/api/opik/run-benchmark` that runs the benchmark
   - Or auto-run on first app start if dataset doesn't exist
   - Shows judges: "We have a regression test suite with 47 test cases"

#### P1: Dashboard demo artifacts (1h)

4. **Create Opik dashboard screenshots / walkthrough:**
   - Run app with Opik enabled, generate traces
   - Screenshot: Trace list with feedback scores
   - Screenshot: Span hierarchy (chat → extraction → generation → evaluation)
   - Screenshot: Experiment comparison (before/after prompt changes)

5. **Add `/api/opik/metrics` endpoint:**
   - Returns aggregated metrics from `getProjectStats()`, `aggregateTracesByTags()`
   - Shows: total traces, avg duration, error rate, evaluation pass rate
   - Judges can hit this endpoint live during demo

#### P2: Advanced features (stretch, 2-4h)

6. **Prompt A/B testing with Opik experiments:**
   - Create 2 prompt variants for budget advice
   - Run both against benchmark dataset
   - Compare scores in Opik experiment view
   - This demonstrates: "We use Opik to systematically compare model versions"

7. **Auto-log high-quality responses to golden dataset:**
   - When G-Eval score > 0.8, automatically add to `stride_golden_responses` dataset
   - This creates a growing quality benchmark over time

---

## 2. FINANCIAL HEALTH — Main Track

### Judging Criteria
> "Help users understand where their money goes, build emergency funds, or make informed choices about spending and saving without the overwhelm."

### What EXISTS

| Feature | Status | Strength |
|---------|--------|----------|
| Budget tracking | Full | Income/expenses with margin calculation, correct monthly vs one-time separation |
| Goal management | Full | Multi-goal, components, conditional goals, priority ordering |
| Weekly milestones | Full | Capacity-aware retroplanning with exam/energy adjustment |
| Job matching | Full | Skill Arbitrage with 4-factor scoring (rate, demand, effort, rest) |
| Swipe scenarios | Full | 3 sources (trades, lifestyle, jobs), preference learning, Essential Guardian |
| Expense optimization | Partial | Pause subscriptions, optimized cost suggestions |
| Budget health score | Full | 0-100 with 4 factors, status categories |
| Savings projection | Full | Weekly timeline with what-if scenarios |

### What's MISSING

| Gap | Judge Impact | Detail |
|-----|-------------|--------|
| **No spending insights** | HIGH | No trends, no "you spent 15% more on food", no category comparison to peers |
| **No financial literacy** | MEDIUM | No "what is compound interest?", no RAG education, no glossary |
| **Emergency fund is just a goal preset** | MEDIUM | No dedicated bucket, no 3-6 month target recommendation, no depletion alerts |
| **No spending anomaly detection** | MEDIUM | No "your transport cost spiked", no proactive alerts about spending changes |

### Action Plan — Financial Health

#### P0: Spending Insights Agent (3-4h)

1. **Create spending analysis endpoint `/api/budget/insights`:**
   - Query `lifestyle_items` by category
   - Calculate category percentages (rent %, food %, transport %)
   - Compare to student benchmarks (hardcoded: rent < 35%, food < 20%, transport < 10%)
   - Return "over" / "on track" / "under" per category
   - Trace with Opik for judge visibility

2. **Add "Budget Insights" card to Progress page or Budget tab:**
   - Donut chart of category distribution
   - Category-level "above average" / "below average" indicators
   - Bruno tip based on biggest optimization opportunity

#### P1: Emergency Fund Calculator (2h)

3. **Add emergency fund recommendation to goal creation:**
   - When user creates a goal, suggest "Emergency fund: 3x monthly expenses = €X"
   - Track as special goal type with dedicated progress UI
   - Show "X months of expenses covered" instead of just €

#### P2: Financial Literacy (stretch, 2-3h)

4. **Add "Why?" tooltips to budget components:**
   - "Why is my margin important?" → 1-paragraph explanation
   - "What is skill arbitrage?" → Plain-language description
   - Use RAG or hardcoded content for 10-15 key concepts

---

## 3. WELLNESS — Secondary Track

### Judging Criteria
> "Help people build sustainable routines, manage stress effectively, prioritize wellbeing."
> "Safety and responsibility: Does it provide appropriate caveats?"

### What EXISTS

| Feature | Status | Strength |
|---------|--------|----------|
| Energy system | Full | Composite score (energy + mood + stress), daily check-ins |
| Energy Debt | Full | 3-tier severity (3/4/5+ weeks), auto-reduces goals by 50-85% |
| Comeback Mode | Full | Recovery detection (>80% after <40%), catch-up plans with achievements |
| Academic accommodation | Full | Exam periods reduce capacity by 20-80% |
| Proactive alerts | Full | Chat + toast notifications for energy changes |
| Recovery suggestions | Partial | Text-based: rest, sleep, walk, screen limits, "talk to professional" |

### What's MISSING

| Gap | Judge Impact | Detail |
|-----|-------------|--------|
| **No medical disclaimers** | HIGH | Judges explicitly check "appropriate caveats". Zero disclaimers in app |
| **No guided wellness exercises** | MEDIUM | Only text suggestions, no breathing timer, no meditation guide |
| **No habit tracking** | MEDIUM | "Take a 15min walk" suggested but not tracked as habit/streak |
| **No crisis escalation** | MEDIUM | "Talk to professional" at 5+ weeks, no hotline links |
| **No sleep quality** | LOW | Only logs hours, no quality assessment |

### Action Plan — Wellness

#### P0: Safety Disclaimers (30min)

1. **Add disclaimer to EnergyTracker component:**
   - "Stride is not a medical tool. If you're experiencing persistent distress, please contact a healthcare professional."
   - Add to onboarding flow and settings page
   - This directly addresses "Safety and responsibility" criterion

2. **Add crisis resources to high-severity Energy Debt alert:**
   - When severity = 'high' (5+ weeks): Add local crisis hotline numbers
   - France: 3114 (suicide prevention), UK: 116 123 (Samaritans), US: 988

#### P1: Micro-Habit System (2-3h)

3. **Add simple habit tracking to energy check-in:**
   - After logging energy, offer 1-3 micro-habits based on score:
     - Low energy: "Did you sleep 7h?", "Did you take a walk today?"
     - Medium: "Did you cook a meal?", "Did you stretch?"
     - High: "Great day to find a gig!", "Check your swipe cards"
   - Track completion with streak counter
   - Show streak in Progress page
   - Trace habit completions in Opik for behavior analysis

#### P2: Breathing Exercise (1h, stretch)

4. **Add "Breathe" button to low-energy state:**
   - 4-7-8 breathing technique (animated circle)
   - Shows after Energy Debt detection
   - Traces usage in Opik (wellness engagement metric)

---

## 4. SOCIAL & COMMUNITY IMPACT — Tertiary Track

### Judging Criteria
> "Build apps that foster connection, inclusion, and create tangible social good."

### What EXISTS

| Feature | Status | Strength |
|---------|--------|----------|
| Trade system | Full | 4 types (sell, lend, borrow, trade) with status workflow |
| Karma economy | Full | 3 tiers, energy bonus, achievements |
| Inventory | Full | 6 categories, condition tracking, sell integration |
| Achievements | 3 karma-based | Community Helper, Sharing Champion, Karma Legend |

### What's MISSING

| Gap | Impact | Detail |
|-----|--------|--------|
| **No impact metrics** | HIGH | No "money saved by community", no CO2 calculation |
| **No community visibility** | HIGH | All trades are private, no shared campus board |
| **No peer discovery** | MEDIUM | Manual partner entry only |
| **No group challenges** | MEDIUM | All missions are personal |

### Action Plan — Social (per social-community-impact.md tiers)

#### T0: Demo-Ready (1-2h)

1. **Karma Wallet card on Progress page:**
   - Derive from `trades` table: items lent, items borrowed, trades done
   - Calculate "community savings" = SUM(completed borrow values)
   - Calculate "helped others" = SUM(completed lend values)
   - Show tier progress bar (e.g., Helper 180/500 → Star)
   - Trace `karma.calculate` in Opik

2. **Social framing in mission completion:**
   - When completing a karma mission, show "You helped {partner} save €{value}"
   - Add partner name and estimated savings to completion toast

#### T1: Quick Wins (2-4h, if time)

3. **Impact Board — Personal Social Dashboard:**
   - New card on Progress page showing cumulative community impact:
     - Money saved by borrowing: SUM(borrow values)
     - Money saved for others: SUM(lend values)
     - Items kept from landfill: COUNT(completed trades)
     - Estimated CO2 saved: COUNT × 2.5 kg
   - New endpoint `/api/impact` with Opik tracing

4. **Simulated Campus Board (mocked data):**
   - Hardcoded JSON with ~10 items from "nearby students"
   - Read-only feed showing items available
   - "I need this" button creates a borrow trade in user's tab
   - Shows the vision even with mock data

---

## 5. Cross-Track Opik Integration Strategy

Every feature above should be traced. Here's the Opik narrative for judges:

### Demo Story

> "Stride traces every interaction in Opik. When a student asks for budget advice, we trace the intent detection (with confidence scoring), the response generation, and then evaluate the response quality using our hybrid evaluation system — 5 heuristic checks plus 4 LLM-as-Judge criteria (safety, appropriateness, coherence, actionability).
>
> We have a benchmark dataset of 47 test cases covering intent detection, data extraction, safety boundaries, and conversation quality. We run daily experiments against this dataset to catch regressions when we change prompts.
>
> Every prompt has a version hash tracked in metadata, so we can filter traces by prompt version and correlate quality metrics with specific changes. When a student swipes on a scenario, the preference signal is logged as feedback — this creates a human-in-the-loop evaluation loop.
>
> Our Opik dashboard shows: trace volumes by action type, average evaluation scores over time, error rates, and token costs per agent. We can drill into any trace to see the full span hierarchy: chat → extraction → generation → evaluation → feedback."

### Opik Feature Mapping for Judge Demo

| Hackathon Example | Stride Implementation | Status |
|-------------------|----------------------|--------|
| "Chat agent with online LLM-as-judge evaluations" | G-Eval (4 criteria) + Heuristics (5 checks) → Feedback Scores | Built, needs wiring |
| "Automated prompt/agent tuning loop" | Prompt hash versioning + Daily experiment script | Built, needs demo |
| "Guardrailed compliance summarizer" | Essential Guardian + Risk Keywords heuristic + PII sanitization | Implemented |
| "Regression test suite with fixed dataset" | 47-item benchmark + `run-daily-experiment.ts` | Built, needs CI integration |
| "RAG QA bot with tracing + evals" | RAG tool traces + evaluation pipeline | Partial (RAG traces, evals not connected) |
| "Multi-tool agent with tool-selection accuracy" | 10 agents + trace per tool call + feedback scores | Implemented |

---

## 6. Implementation Priority Matrix

| # | Task | Track | Effort | Judge Impact | Dependencies |
|---|------|-------|--------|-------------|--------------|
| 1 | Wire `runHybridEvaluationWithTracing()` to chat response | Opik | 2h | CRITICAL | None |
| 2 | Add medical disclaimers | Wellness | 30min | HIGH | None |
| 3 | Karma Wallet card on Progress page | Social | 1h | HIGH | None |
| 4 | Run benchmark dataset and show results | Opik | 1h | HIGH | #1 |
| 5 | Spending insights endpoint + UI card | Finance | 3h | HIGH | None |
| 6 | `/api/opik/metrics` summary endpoint | Opik | 1h | MEDIUM | None |
| 7 | Crisis resources in Energy Debt alert | Wellness | 30min | MEDIUM | None |
| 8 | Impact Board (CO2, savings, items) | Social | 2h | MEDIUM | None |
| 9 | Emergency fund calculator | Finance | 2h | MEDIUM | None |
| 10 | Micro-habit tracking | Wellness | 2-3h | MEDIUM | None |
| 11 | Simulated Campus Board | Social | 2h | LOW | None |
| 12 | Prompt A/B experiment demo | Opik | 2h | LOW | #1 |
| 13 | Financial literacy tooltips | Finance | 2h | LOW | None |
| 14 | Breathing exercise | Wellness | 1h | LOW | None |

**Critical path:** Tasks 1-4 (Opik) + Task 2 (disclaimers) = ~5 hours for maximum cross-track impact.

---

## 7. Gemini Analysis Delta

The Gemini analysis (`hackathon_gap_analysis.md`) identified similar themes but underestimated what exists:

| Gemini Claim | Reality |
|-------------|---------|
| "No evaluations" | Evaluation system exists (G-Eval + Heuristics) but is dead code |
| "No datasets" | Benchmark dataset script exists (47 items) but isn't auto-run |
| "Community: Zero implementation" | Trade system + Karma + Achievements exist, but no peer discovery |
| "No step-by-step goal breakdown" | Retroplanning with weekly milestones exists and is sophisticated |
| "No recovery plans" | Energy Debt suggestions exist (rest, walk, screen limits, professional referral) |

**Where Gemini is right:**
- Financial literacy / education content is absent
- Online evaluation isn't wired to production flow
- Community features lack peer discovery and impact visualization
- No Opik Agent Optimizer usage
