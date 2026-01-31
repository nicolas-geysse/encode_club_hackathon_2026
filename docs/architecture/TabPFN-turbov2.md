# TabPFN Integration Strategy for Stride

**Version**: 1.0
**Date**: 24 January 2026
**Scope**: Analysis and recommendation for integrating TabPFN 2.5 with Stride

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [TabPFN 2.5 Overview](#2-tabpfn-25-overview)
3. [Use Cases for Stride](#3-use-cases-for-stride)
4. [Integration Options Analysis](#4-integration-options-analysis)
5. [Recommendation: Turbov2 Integration](#5-recommendation-turbov2-integration)
6. [Implementation Plan](#6-implementation-plan)
7. [Deployment Considerations](#7-deployment-considerations)
8. [Verification Checklist](#8-verification-checklist)

---

## 1. Executive Summary

This document analyzes integration options for TabPFN 2.5 (a foundation model for tabular data) with the Stride project. After evaluating four approaches, we recommend **Option B: Turbov2 Integration** due to existing infrastructure, Railway-ready deployment, and appropriate scaling for Stride's dataset sizes.

**Key Finding**: Stride's burnout prediction uses ~14-50 samples (2 weeks of daily logs). This is tiny for TabPFN, making CPU inference fully viable without GPU requirements.

---

## 2. TabPFN 2.5 Overview

### What is TabPFN?

TabPFN is a **foundation model for tabular data** - essentially an LLM-equivalent for structured tables. Instead of training a new model per dataset, TabPFN can make predictions zero-shot using in-context learning.

### Key Specifications

| Aspect | Specification |
|--------|---------------|
| **Scale** | Up to 50K samples, 2K features |
| **Speed** | Outperforms 4h AutoML tuning in 2.8s (zero-shot) |
| **Model Size** | ~672 MB checkpoint |
| **Architecture** | 18-24 layer transformer with alternating attention |
| **Memory** | <1,000 bytes per cell |
| **Licensing** | Non-commercial (OSS via HuggingFace), Commercial via Prior Labs API |

### Sources

- [TabPFN GitHub](https://github.com/PriorLabs/TabPFN)
- [Prior Labs](https://priorlabs.ai/tabpfn)
- [Nature Paper](https://www.nature.com/articles/s41586-024-08328-6)
- [Technical Report](https://priorlabs.ai/technical-reports/tabpfn-2-5-model-report)

---

## 3. Use Cases for Stride

This section provides detailed specifications for each TabPFN use case, including data requirements, model selection, and expected outputs.

### 3.1 TabPFN Model Variants

| Variant | HuggingFace | Task Type | Best For |
|---------|-------------|-----------|----------|
| **TabPFN-v2-clf** | [Prior-Labs/TabPFN-v2-clf](https://huggingface.co/Prior-Labs/TabPFN-v2-clf) | Classification | Binary/multiclass decisions |
| **TabPFN-v2-reg** | [Prior-Labs/TabPFN-v2-reg](https://huggingface.co/Prior-Labs/TabPFN-v2-reg) | Regression | Continuous values, probabilities |
| **TabPFN-TS** | [Prior-Labs/tabpfn-timeseries](https://huggingface.co/Prior-Labs/tabpfn-timeseries) | Time Series | Forecasting via tabular regression |

Sources: [TabPFN GitHub](https://github.com/PriorLabs/TabPFN), [TabPFN-TS Paper](https://arxiv.org/abs/2501.02945), [Nature Paper](https://www.nature.com/articles/s41586-024-08328-6)

---

### 3.2 Use Case 1: Burnout Prediction (Energy Crash Forecasting)

#### Current Stride Implementation
- **Algorithm**: `energy-debt.ts` - Rule-based: 3+ consecutive weeks with energy < 40% triggers debt
- **Thresholds**: Low energy = < 40%, Recovery = > 80%
- **Limitation**: Binary detection, no probability estimation

#### TabPFN Enhancement

##### Option A: Classification (TabPFN-v2-clf)
**Question**: "Will this student crash next week?"

| Aspect | Specification |
|--------|---------------|
| **Model** | TabPFN-v2-clf |
| **Output** | Binary: crash (1) / no crash (0) |
| **Min Data** | 7 days (1 week of daily logs) |
| **Optimal Data** | 14-21 days (2-3 weeks) |
| **Max Useful Data** | ~50 samples (TabPFN sweet spot) |

**Feature Matrix (per day)**:

| Feature | Type | Range | Source |
|---------|------|-------|--------|
| energy_level | int | 1-5 | energy_logs.energy_level |
| mood_score | int | 1-5 | energy_logs.mood_score |
| stress_level | int | 1-5 | energy_logs.stress_level |
| hours_slept | float | 0-12 | energy_logs.hours_slept |
| day_of_week | int | 0-6 | Derived from log_date |
| is_exam_period | bool | 0/1 | academic_events table |
| weekly_work_hours | int | 0-40 | commitments table |

**Label Definition** (for training):
```python
# A "crash" is defined as: next week avg energy < 2.5 (out of 5)
crash_label = 1 if next_week_avg_energy < 2.5 else 0
```

**Insight Delivered**: "Tu as 73% de risque de crash la semaine prochaine"

##### Option B: Time Series Forecasting (TabPFN-TS)
**Question**: "What will my energy level be each day next week?"

| Aspect | Specification |
|--------|---------------|
| **Model** | TabPFN-TS (tabpfn-timeseries) |
| **Output** | Daily energy predictions for next 7 days |
| **Min Data** | 14 days (minimum for pattern recognition) |
| **Optimal Data** | 21-28 days (3-4 weeks) |
| **Covariates** | Exam dates, work hours, weekends |

**Feature Engineering** (TabPFN-TS approach):
```python
# Transform time series to tabular format
features = {
    'lag_1': energy_yesterday,
    'lag_7': energy_same_day_last_week,
    'rolling_mean_3': avg_last_3_days,
    'rolling_std_7': std_last_week,
    'day_of_week': 0-6,
    'is_weekend': 0/1,
    'has_exam_this_week': 0/1,
    'planned_work_hours': int
}
```

**Insight Delivered**: "Prediction energie: Lun=3, Mar=2, Mer=2, Jeu=1, Ven=1 → Alerte vendredi"

---

### 3.3 Use Case 2: Grant/Scholarship Eligibility

#### Current Stride Implementation
- **Status**: NOT IMPLEMENTED (no grant tracking in codebase)
- **Opportunity**: New feature enabled by TabPFN

#### TabPFN Enhancement (TabPFN-v2-clf or TabPFN-v2-reg)

**Question**: "Am I likely to get this scholarship?"

| Aspect | Specification |
|--------|---------------|
| **Model** | TabPFN-v2-clf (eligible/not) OR TabPFN-v2-reg (success %) |
| **Output** | Probability 0-100% or binary eligible/not |
| **Min Data** | 1 profile (zero-shot with priors) |
| **Training Data** | Historical grant outcomes (if available) |

**Feature Matrix (per student)**:

| Feature | Type | Range | Source |
|---------|------|-------|--------|
| diploma | categorical | Bac+1 to Bac+5 | profiles.diploma |
| field | categorical | ~20 fields | profiles.field |
| monthly_income | float | 0-3000 EUR | profiles.monthly_income |
| monthly_expenses | float | 0-2000 EUR | profiles.monthly_expenses |
| has_loan | bool | 0/1 | profiles.has_loan |
| loan_amount | float | 0-50000 EUR | profiles.loan_amount |
| city_size | categorical | small/medium/large | profiles.city_size |
| skills_count | int | 0-20 | len(profiles.skills) |
| gpa_equivalent | float | 0-20 | NEW FIELD NEEDED |
| family_income_bracket | categorical | 1-10 | NEW FIELD NEEDED |

**Label Definition** (for training with historical data):
```python
# Would need historical grant application outcomes
grant_obtained = 1 if application_successful else 0
```

**Zero-Shot Mode** (without historical data):
- Use TabPFN's priors to predict based on feature similarity
- Compare student profile to "typical grant recipient" patterns
- Less accurate but immediately usable

**Insight Delivered**: "Tu as 65% de chances pour la bourse CROUS (base sur: revenus, ville, diplome)"

**Implementation Requirement**:
- Add `gpa_equivalent` and `family_income_bracket` to profile schema
- Create `grant_applications` table to track outcomes
- Minimum 20-30 historical outcomes for fine-tuned predictions

---

### 3.4 Use Case 3: Swipe Preference Learning (Enhanced)

#### Current Stride Implementation
- **Algorithm**: Linear update with 15% learning rate per swipe
- **Weights**: effort_sensitivity, hourly_rate_priority, time_flexibility, income_stability
- **Limitation**: Simple linear model, doesn't learn complex preference interactions

#### TabPFN Enhancement (TabPFN-v2-reg)

**Question**: "How will this user rate this scenario?"

| Aspect | Specification |
|--------|---------------|
| **Model** | TabPFN-v2-reg |
| **Output** | Predicted acceptance probability (0-1) |
| **Min Data** | 5 swipes (few-shot learning) |
| **Optimal Data** | 15-30 swipes |
| **Cold Start** | Use population priors until user has 5+ swipes |

**Feature Matrix (per scenario)**:

| Feature | Type | Range | Source |
|---------|------|-------|--------|
| effort_level | int | 1-5 | scenario.effortLevel |
| hourly_rate | float | 5-35 EUR | scenario.hourlyRate |
| flexibility_score | int | 1-5 | scenario.flexibilityScore |
| weekly_hours | int | 1-20 | scenario.weeklyHours |
| category | categorical | 5 types | scenario.category |
| user_monthly_margin | float | -500 to +500 | profile.monthlyMargin |
| user_has_loan | bool | 0/1 | profile.hasLoan |
| user_max_work_hours | int | 0-40 | profile.maxWorkHoursWeekly |
| user_min_hourly_rate | float | 0-30 | profile.minHourlyRate |
| time_spent_viewing | float | 0-30s | swipe.timeSpent |

**Label Definition**:
```python
# Convert swipe direction to continuous label
label = {
    'up': 1.0,      # Super like
    'right': 0.75,  # Accept
    'down': 0.25,   # Meh
    'left': 0.0     # Reject
}[swipe_direction]
```

**Advantages over Linear Model**:
- Learns non-linear interactions (e.g., "high effort OK if rate > 25 EUR")
- Adapts to changing preferences without forgetting
- Handles categorical features natively (category, diploma)
- Uncertainty quantification (confidence intervals)

**Insight Delivered**:
- "Ce job te correspondrait a 89% (confiance: haute)"
- "Classement personnalise: SQL Coaching > Tutoring > Freelance Dev"

---

### 3.5 Use Case 4: Energy Trajectory Forecasting (Cross-Case)

#### Concept
Combine energy prediction with financial planning to answer: "If I take this job, what will my energy look like?"

| Aspect | Specification |
|--------|---------------|
| **Model** | TabPFN-TS |
| **Output** | 4-week energy forecast under different scenarios |
| **Min Data** | 14 days energy + 1 week work history |
| **Simulation** | Compare trajectories: "current plan" vs "add 10h job" |

**Feature Matrix**:

| Feature | Type | Description |
|---------|------|-------------|
| historical_energy[t-14:t] | array | Past 14 days energy |
| planned_work_hours[t:t+28] | array | Scheduled work per day |
| exam_dates[t:t+28] | array | Academic pressure |
| job_effort_level | int | Cognitive load of potential job |
| job_weekly_hours | int | Time commitment |
| current_monthly_margin | float | Financial pressure |

**Output**:
```json
{
  "scenario_a_no_job": [4, 4, 3, 3, 3, 3, 3, "..."],
  "scenario_b_add_job": [4, 3, 3, 2, 2, 2, 3, "..."],
  "crash_risk_a": 0.12,
  "crash_risk_b": 0.45,
  "recommendation": "Le job SQL Coaching augmente ton risque de crash de 12% a 45%. Attends 2 semaines."
}
```

---

### 3.6 Use Case 5: Optimal Work Schedule (Cross-Case)

#### Concept
Predict the best week to add extra work hours based on energy forecast + financial need.

| Aspect | Specification |
|--------|---------------|
| **Model** | TabPFN-v2-reg + TabPFN-TS |
| **Output** | Week-by-week recommendation score |
| **Min Data** | 21 days energy + goal deadline |

**Approach**:
1. **TabPFN-TS**: Forecast energy for next 4 weeks
2. **TabPFN-v2-reg**: Predict "productivity score" per week
3. **Combine**: `optimal_week = argmax(productivity * (1 - crash_risk) * financial_urgency)`

**Insight Delivered**: "Semaine optimale pour 10h de plus: Semaine 3 (energie predite: 4/5, risque crash: 8%)"

---

### 3.7 Use Case 6: Comeback Window Detection (Enhancement)

#### Current Implementation
- Rule-based: recovery > 80% AND previous < 50% AND 2+ low weeks

#### TabPFN Enhancement
- **Model**: TabPFN-v2-clf
- **Question**: "Is this a sustainable recovery or a false positive?"
- **Features**: Recovery velocity, pattern similarity to past true recoveries
- **Insight**: "Confiance comeback: 78% (pattern similaire a tes recuperations passees)"

---

### 3.8 Data Requirements Summary

| Use Case | Min Days | Optimal Days | Model | Cold Start? |
|----------|----------|--------------|-------|-------------|
| Burnout Classification | 7 | 14-21 | TabPFN-v2-clf | Yes (priors) |
| Burnout Forecasting | 14 | 21-28 | TabPFN-TS | No |
| Grant Eligibility | 0 | +20 outcomes | TabPFN-v2-clf | Yes (zero-shot) |
| Swipe Preference | 5 | 15-30 | TabPFN-v2-reg | Yes (population) |
| Energy Trajectory | 14 | 21+ | TabPFN-TS | No |
| Optimal Work Schedule | 21 | 28+ | TS + Reg | No |
| Comeback Validation | 21 | 35+ | TabPFN-v2-clf | Needs history |

---

### 3.9 Implementation Priority

| Priority | Use Case | Value | Effort | Model |
|----------|----------|-------|--------|-------|
| **P0** | Burnout Prediction | High (killer feature) | Low | TabPFN-v2-clf |
| **P1** | Swipe Preference | High (personalization) | Medium | TabPFN-v2-reg |
| **P2** | Energy Forecasting | Medium (proactive) | Medium | TabPFN-TS |
| **P3** | Grant Eligibility | Medium (new feature) | High (schema changes) | TabPFN-v2-clf |
| **P4** | Cross-Case Scenarios | Low (advanced) | High | Multiple |

---

### 3.10 Dataset Size Analysis

Stride's primary use case (burnout prediction) involves:
- **14-50 rows** (2 weeks of daily logs)
- **3-5 features** (sleep, stress, mood, activity, etc.)

This is **tiny** for TabPFN's capabilities (designed for up to 50K samples), which means:
1. CPU inference is fast and viable
2. No GPU required
3. Memory footprint is minimal

---

## 4. Integration Options Analysis

### Option A: Standalone Python MCP Server

**Architecture:**
```
Stride Frontend → Mastra Agents → [stdio/sse] → Python MCP Server → TabPFN
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | Low |
| **Time to MVP** | 4-6 hours |
| **MCP Native** | Yes |
| **Data Stays Local** | Yes |
| **Hackathon Scope** | Fits |
| **License** | Non-commercial OK |

**Pros:**
- Minimal complexity (fastmcp + tabpfn only)
- Isolated Python environment
- Same pattern as existing MCP server

**Cons:**
- Another service to maintain
- No model caching infrastructure
- Cold start on each prediction

---

### Option B: Extend Turbov2 with TabPFN + MCP Layer (RECOMMENDED)

**Architecture:**
```
Stride Frontend → Mastra Agents → [stdio/HTTP] → Turbov2 + TabPFN → CPU
                                      ↓
                              /api/tabpfn/predict
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | Medium |
| **Time to MVP** | 8-12 hours |
| **MCP Native** | Partial (needs layer) |
| **Reuse Existing** | Yes (existing infrastructure) |
| **Production Ready** | Yes |

**Pros:**
- Reuse production-ready infrastructure
- Model manager and health checks already exist
- Railway-ready (existing Dockerfile)
- Combines embeddings + TabPFN in one service

**Cons:**
- Turbov2 is in a different repo
- Slight overkill for TabPFN alone (but infrastructure is already there)

---

### Option C: MindsDB + DuckDB Direct Integration

**Architecture:**
```
Stride Frontend → SQL Queries → MindsDB → DuckDB (data) + TabPFN Handler (ML)
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | HIGH |
| **Time to MVP** | 16-24 hours |
| **MCP Native** | No (SQL interface) |
| **DuckDB Connector** | Exists |
| **TabPFN Handler** | Does NOT exist |

**Critical Finding:** MindsDB does NOT have a native TabPFN integration. Building a [custom ML handler](https://github.com/mindsdb/mindsdb/blob/main/docs/contribute/ml-handlers.mdx) is significant work.

**Verdict:** NOT recommended for hackathon scope.

---

### Option D: TabPFN Cloud API (Simplest but Commercial)

**Architecture:**
```
Stride Frontend → Mastra Agent → HTTP → TabPFN API (priorlabs.ai)
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | Very Low |
| **Time to MVP** | 2-3 hours |
| **Data Stays Local** | No |
| **License** | Commercial required |

**Source:** [tabpfn-client PyPI](https://pypi.org/project/tabpfn/)

---

### Comparison Matrix

| Criteria | A (MCP) | B (Turbov2) | C (MindsDB) | D (API) |
|----------|---------|-------------|-------------|---------|
| **Complexity** | Low | Medium | High | Very Low |
| **Time to MVP** | 4-6h | 8-12h | 16-24h | 2-3h |
| **MCP Native** | Yes | Partial | No | No |
| **Data Local** | Yes | Yes | Yes | No |
| **Hackathon Fit** | Yes | Yes | No | Yes |
| **License OK** | Yes | Yes | Yes | No |
| **Existing Infra** | No | Yes | No | N/A |

---

## 5. Recommendation: Turbov2 Integration

### Why Option B?

Given that Turbov2 is an actively maintained project with production-ready infrastructure:

1. **Infrastructure exists** - Model manager, VRAM/RAM management, health checks
2. **Railway-ready** - Existing Dockerfile, deployment workflow mastered
3. **No GPU needed** - Stride's dataset is tiny (~14 samples), CPU suffices
4. **Model relay** - Existing tools for model management
5. **672 MB model** - Fits within Railway's 2-3 GB recommended limit

### Turbov2 Repository Location

```
/home/nico/code_source/tss/deposium_fullstack/deposium_embeddings-turbov2
```

### What Turbov2 Provides

- Ultra-fast embeddings/reranking service (FastAPI + PyTorch)
- 10+ models (Model2Vec, BGE-M3, mxbai-rerank, LFM2.5-VL, Qwen2.5-Coder)
- Dynamic VRAM management with LRU cache
- Anthropic API compatible (`/v1/messages`)
- **NOT an MCP server** but architecture supports it

---

## 6. Implementation Plan

### Phase 1: Turbov2 TabPFN Integration (MVP)

**Effort**: 4-6 hours

**Files to modify in Turbov2:**

```
deposium_embeddings-turbov2/
├── src/
│   ├── main.py              # Add /api/tabpfn/* endpoints
│   ├── model_manager.py     # Add TabPFN model type
│   ├── tabpfn_handler.py    # NEW: TabPFN inference logic
│   └── mcp_server.py        # OPTIONAL: MCP transport layer
├── requirements.txt         # Add tabpfn>=2.5.0
└── Dockerfile               # Ensure CPU-only build
```

#### 6.1 New Endpoint

```python
# src/main.py
@app.post("/api/tabpfn/predict")
async def tabpfn_predict(request: TabPFNPredictRequest):
    """
    Predict using TabPFN foundation model.
    Input: {"features": [[7, 3, 4], [5, 4, 2]], "target": [0, 1], "query": [[6, 2, 3]]}
    Output: {"predictions": [0.23], "model": "tabpfn-2.5"}
    """
    return await tabpfn_handler.predict(request)
```

#### 6.2 TabPFN Handler

```python
# src/tabpfn_handler.py
from tabpfn import TabPFNClassifier
import os

os.environ["TABPFN_ALLOW_CPU_LARGE_DATASET"] = "1"

class TabPFNHandler:
    def __init__(self):
        self.clf = None

    def ensure_loaded(self):
        if self.clf is None:
            self.clf = TabPFNClassifier(device='cpu')

    async def predict(self, request):
        self.ensure_loaded()
        self.clf.fit(request.features, request.target)
        proba = self.clf.predict_proba(request.query)
        return {"predictions": proba[:, 1].tolist(), "model": "tabpfn-2.5"}
```

---

### Phase 2: Stride Integration

**Effort**: 2-3 hours

1. Create wrapper in Stride's `lib/ml.ts`
2. Call turbov2 `/api/tabpfn/predict` from Stride backend
3. Wire into burnout prediction UI

```typescript
// packages/frontend/src/lib/ml.ts
export async function predictBurnout(
  sleepHistory: number[],
  stressHistory: number[],
  moodHistory: number[]
): Promise<number> {
  const response = await fetch(`${TURBOV2_URL}/api/tabpfn/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      features: zipFeatures(sleepHistory.slice(0, -1), stressHistory.slice(0, -1), moodHistory.slice(0, -1)),
      target: computeCrashLabels(sleepHistory, stressHistory, moodHistory),
      query: [[sleepHistory.at(-1), stressHistory.at(-1), moodHistory.at(-1)]],
    }),
  });
  const data = await response.json();
  return data.predictions[0];
}
```

---

### Phase 3: MCP Layer (Optional)

**Effort**: 2-3 hours

If Mastra/Stride needs to call TabPFN via MCP:

```python
# src/mcp_server.py
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("turbov2-ml")

@mcp.tool()
def predict_burnout(
    sleep_history: list[float],
    stress_history: list[float],
    mood_history: list[float],
    crash_labels: list[int]
) -> float:
    """Predict burnout probability using TabPFN."""
    X = list(zip(sleep_history[:-1], stress_history[:-1], mood_history[:-1]))
    y = crash_labels[:-1]
    query = [[sleep_history[-1], stress_history[-1], mood_history[-1]]]

    handler = get_tabpfn_handler()
    result = handler.predict(X, y, query)
    return result["predictions"][0]
```

---

## 7. Deployment Considerations

### Railway Constraints

Source: [Railway Scaling Docs](https://docs.railway.com/reference/scaling)

| Limit | Value |
|-------|-------|
| Max vCPUs | 32 |
| Max RAM | 32 GB |
| Recommended for small services | 2 GB |

**672 MB model + PyTorch runtime ≈ 2-3 GB** → Fits Railway limits.

### CPU Inference Feasibility

| Dataset Size | CPU Feasibility | Notes |
|--------------|-----------------|-------|
| <100 samples | Fast | Perfect for Stride (14 days = 14 rows) |
| 100-1000 samples | Acceptable | Use `TABPFN_ALLOW_CPU_LARGE_DATASET=1` |
| >1000 samples | Very slow | Need GPU or distillation |

### HuggingFace Option

- [Prior-Labs/tabpfn_2_5](https://huggingface.co/Prior-Labs/tabpfn_2_5) available
- Inference Endpoints require custom container
- License: Non-commercial only (OK for hackathon)

### TabPFN-as-MLP Distillation

Prior Labs offers a proprietary distillation engine:
- Converts TabPFN to MLP or Tree Ensemble
- **Latency**: Orders of magnitude faster
- **Memory**: Very light
- **Enterprise License ONLY** - not available for hackathon

---

## 8. Verification Checklist

```bash
# 1. Test TabPFN locally
python -c "from tabpfn import TabPFNClassifier; print('OK')"

# 2. Test endpoint
curl -X POST http://localhost:11435/api/tabpfn/predict \
  -H "Content-Type: application/json" \
  -d '{"features": [[7,3,4],[5,4,2]], "target": [0,1], "query": [[6,2,3]]}'

# 3. Verify Railway deployment
curl https://your-turbov2.railway.app/api/tabpfn/predict ...

# 4. Check memory usage
docker stats turbov2  # Should be <3GB
```

### Expected Response

```json
{
  "predictions": [0.73],
  "model": "tabpfn-2.5"
}
```

---

## Summary

| Decision | Choice |
|----------|--------|
| **Integration Approach** | Option B: Turbov2 Extension |
| **Deployment Target** | Railway (CPU) |
| **Model Loading** | Lazy (on first request) |
| **MCP Support** | Optional Phase 3 |
| **GPU Required** | No (dataset too small) |

---

## References

- [TabPFN GitHub](https://github.com/PriorLabs/TabPFN)
- [Prior Labs](https://priorlabs.ai)
- [Nature Paper: TabPFN](https://www.nature.com/articles/s41586-024-08328-6)
- [TabPFN 2.5 Model Report](https://priorlabs.ai/technical-reports/tabpfn-2-5-model-report)
- [Railway Scaling Docs](https://docs.railway.com/reference/scaling)
- [MindsDB DuckDB Docs](https://docs.mindsdb.com/integrations/data-integrations/duckdb)
- [tabpfn-client PyPI](https://pypi.org/project/tabpfn/)

---

> **Note**: This document serves as an architecture decision record (ADR) for the TabPFN integration. Implementation details may evolve as we progress through the phases.
