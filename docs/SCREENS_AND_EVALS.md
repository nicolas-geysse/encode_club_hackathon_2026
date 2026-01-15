# Student Life Navigator - Écrans & Évaluations

## 🖥️ Écrans Principaux

### Écran 1: Onboarding / Profil

```
┌─────────────────────────────────────────────────────────────────┐
│  🎓 Student Life Navigator                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Bienvenue! Dis-moi un peu sur toi...                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Diplôme actuel:  [L2 Informatique        ▼]               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Tes compétences (sélection multiple):                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │
│  │Python│ │ SQL  │ │  JS  │ │Excel │ │Anglais│                 │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │
│                                                                  │
│  Budget mensuel:                                                 │
│  Revenus: [_800_] €/mois                                        │
│  Dépenses: [_750_] €/mois                                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    [Commencer →]                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Composants MCP-UI:**
- `action` (dropdown diploma)
- `action` (multi-select skills - chips)
- `metric` (input revenus/dépenses)
- `action` (button submit)

---

### Écran 2: Dashboard Principal

```
┌─────────────────────────────────────────────────────────────────┐
│  🎓 Student Life Navigator          [Profil] [Traces Opik]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐ ┌──────────────────────┐             │
│  │ 💰 BUDGET MENSUEL    │ │ 📊 PROJECTION 3 ANS  │             │
│  │                      │ │                      │             │
│  │  Revenus:    800€    │ │  82% de finir       │             │
│  │  Dépenses:   750€    │ │  sans dette         │             │
│  │  ─────────────────   │ │                      │             │
│  │  Marge:      +50€    │ │  ~8,500€ économies  │             │
│  │              ↑ 6%    │ │  [5k - 12k] IC 95%  │             │
│  └──────────────────────┘ └──────────────────────┘             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🎯 JOBS RECOMMANDÉS                                       │   │
│  │ ┌───────────────────┬────────┬─────────┬────────────────┐│   │
│  │ │ Job               │ Taux/h │ Match   │ Co-bénéfice    ││   │
│  │ ├───────────────────┼────────┼─────────┼────────────────┤│   │
│  │ │ Dev Freelance     │ 25€    │ ⭐⭐⭐⭐⭐ │ CV++           ││   │
│  │ │ Cours particuliers│ 20€    │ ⭐⭐⭐⭐  │ Renforce cours ││   │
│  │ │ Saisie données    │ 12€    │ ⭐⭐⭐   │ Automatisation ││   │
│  │ └───────────────────┴────────┴─────────┴────────────────┘│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 💡 OPTIMISATIONS BUDGET                                    │  │
│  │                                                            │  │
│  │  🏠 Coloc:    -150€/mois (30% loyer)                      │  │
│  │  🍽️ CROUS:    -100€/mois (50% bouffe)                     │  │
│  │  🚲 Vélo:     -40€/mois  (80% transport)                  │  │
│  │  ────────────────────────────────────────                  │  │
│  │  Total économies potentielles: 290€/mois                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Composants MCP-UI:**
```typescript
const dashboardLayout: UILayout = {
  id: 'student-dashboard',
  grid: { columns: 12, gap: '1rem' },
  components: [
    // Metrics row (6 cols each)
    {
      id: 'budget-metric',
      type: 'metric',
      position: { colStart: 1, colSpan: 6 },
      params: {
        title: 'Budget Mensuel',
        value: '+50€',
        unit: 'marge',
        trend: { value: 6, direction: 'up' },
        subtitle: 'Revenus: 800€ | Dépenses: 750€'
      }
    },
    {
      id: 'projection-metric',
      type: 'metric',
      position: { colStart: 7, colSpan: 6 },
      params: {
        title: 'Projection 3 ans',
        value: '82%',
        unit: 'sans dette',
        subtitle: '~8,500€ économies [5k-12k]'
      }
    },
    // Jobs table (full width)
    {
      id: 'jobs-table',
      type: 'table',
      position: { colStart: 1, colSpan: 12 },
      params: {
        title: 'Jobs Recommandés',
        columns: [
          { key: 'job', label: 'Job' },
          { key: 'rate', label: 'Taux/h' },
          { key: 'match', label: 'Match' },
          { key: 'benefit', label: 'Co-bénéfice' }
        ],
        rows: [
          { job: 'Dev Freelance', rate: '25€', match: '⭐⭐⭐⭐⭐', benefit: 'CV++' },
          { job: 'Cours particuliers', rate: '20€', match: '⭐⭐⭐⭐', benefit: 'Renforce cours' },
          { job: 'Saisie données', rate: '12€', match: '⭐⭐⭐', benefit: 'Automatisation' }
        ]
      }
    },
    // Optimizations list (full width)
    {
      id: 'optimizations',
      type: 'text',
      position: { colStart: 1, colSpan: 12 },
      params: {
        markdown: true,
        content: `### 💡 Optimisations Budget
- 🏠 **Coloc**: -150€/mois (30% loyer)
- 🍽️ **CROUS**: -100€/mois (50% bouffe)
- 🚲 **Vélo**: -40€/mois (80% transport)

**Total économies potentielles: 290€/mois**`
      }
    }
  ]
}
```

---

### Écran 3: Chat Interactif

```
┌─────────────────────────────────────────────────────────────────┐
│  💬 Chat avec l'assistant                  [Voir traces Opik]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🧑 Toi:                                                     │ │
│  │ "Je veux travailler 15h par semaine, est-ce que ça va      │ │
│  │  impacter mes notes?"                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🤖 Assistant:                                               │ │
│  │                                                             │ │
│  │ J'ai analysé l'impact avec notre modèle ML:                │ │
│  │                                                             │ │
│  │ ┌─────────────────────────────────────────────────────────┐│ │
│  │ │ 📊 Impact sur les notes                                 ││ │
│  │ │                                                         ││ │
│  │ │ GPA prévu:     13.2/20 (-0.8 vs sans job)              ││ │
│  │ │ Risque burnout: 35% ⚠️                                  ││ │
│  │ │ Confiance:      78%                                     ││ │
│  │ └─────────────────────────────────────────────────────────┘│ │
│  │                                                             │ │
│  │ 📈 Recommandation: 10-12h/semaine serait optimal           │ │
│  │                                                             │ │
│  │ [Voir le détail du calcul] [Modifier mes paramètres]       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [Tape ton message...                              ] [Envoyer]│ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### Écran 4: Traces Opik (Explainability)

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Traces Opik - Session #abc123                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Query: "Je suis en L2 Info, j'ai 800€/mois, comment m'en sortir?"
│                                                                  │
│  ┌─ TRACE ──────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │  ▼ root (2.3s)                                           │   │
│  │    ├─ budget_analysis (LLM) ✅ 450ms                     │   │
│  │    │   └─ Input: {income: 800, expenses: 750}            │   │
│  │    │   └─ Output: {margin: 50, status: "tight"}          │   │
│  │    │                                                      │   │
│  │    ├─ graph_job_matching (DuckPGQ) ✅ 320ms              │   │
│  │    │   └─ Query: Python → enables → ?                    │   │
│  │    │   └─ Results: 3 jobs (freelance_dev: 0.9, ...)      │   │
│  │    │                                                      │   │
│  │    ├─ graph_budget_optis (DuckPGQ) ✅ 180ms              │   │
│  │    │   └─ Query: solution → reduces → expense            │   │
│  │    │   └─ Results: 3 optis (coloc: -30%, ...)            │   │
│  │    │                                                      │   │
│  │    ├─ ml_graduation_projection (MindsDB) ✅ 890ms        │   │
│  │    │   └─ Model: loan_payoff_predictor                   │   │
│  │    │   └─ Output: {prob: 0.82, interval: [5k, 12k]}      │   │
│  │    │   └─ Confidence: 0.78                               │   │
│  │    │                                                      │   │
│  │    └─ llm_recommendation (LLM) ✅ 460ms                  │   │
│  │        └─ Synthesis of all results                       │   │
│  │                                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  📊 Métriques:                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Latence      │ │ Tokens       │ │ Cost         │            │
│  │ 2.3s total   │ │ 1,240 tokens │ │ $0.002       │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Framework d'Évaluation (4 Mantras)

### Évaluation 1: Job Matching Quality

| Mantra | Définition |
|--------|------------|
| **Target** | Recommander des jobs pertinents par rapport aux compétences de l'étudiant |
| **Test Set** | 50 profils étudiants synthétiques avec skills + jobs attendus |
| **Scoring** | Precision@3, Recall@3, MRR (Mean Reciprocal Rank) |
| **Decision Rule** | Precision@3 ≥ 0.8 pour passer en prod |

```typescript
interface JobMatchingEval {
  // Test case
  input: {
    skills: string[];           // ['python', 'sql']
    diploma: string;            // 'l2_info'
    constraints?: {
      max_hours_weekly?: number;
      min_hourly_rate?: number;
    };
  };

  // Expected output
  expected: {
    top_jobs: string[];         // ['freelance_dev', 'tutoring', 'data_entry']
    expected_at_position_1: string;  // 'freelance_dev'
  };

  // Scoring
  metrics: {
    precision_at_3: number;     // |relevant ∩ returned| / 3
    recall_at_3: number;        // |relevant ∩ returned| / |relevant|
    mrr: number;                // 1 / rank_of_first_relevant
    co_benefit_mentioned: boolean;
  };
}
```

**Opik Integration:**
```typescript
// Log evaluation to Opik
opik.logEvaluation({
  name: 'job_matching_quality',
  testCaseId: 'jm-001',
  input: { skills: ['python', 'sql'] },
  output: { jobs: ['freelance_dev', 'tutoring'] },
  expected: { jobs: ['freelance_dev', 'tutoring', 'data_entry'] },
  metrics: {
    precision_at_3: 0.67,
    mrr: 1.0
  },
  passed: true
});
```

---

### Évaluation 2: ML Prediction Accuracy

| Mantra | Définition |
|--------|------------|
| **Target** | Prédictions de projection financière calibrées et précises |
| **Test Set** | 100 scénarios avec outcomes connus (simulés) |
| **Scoring** | MAE (Mean Absolute Error), Calibration Error, Coverage |
| **Decision Rule** | MAE < 2000€ ET Calibration Error < 0.1 |

```typescript
interface MLPredictionEval {
  // Test case
  input: {
    monthly_income: number;
    monthly_expenses: number;
    years_remaining: number;
    job_hours_weekly: number;
  };

  // Expected (simulated ground truth)
  expected: {
    final_balance: number;      // 8500
    probability_debt_free: number; // 0.82
  };

  // Model output
  predicted: {
    final_balance: number;
    confidence_interval: [number, number];
    probability_debt_free: number;
  };

  // Metrics
  metrics: {
    absolute_error: number;     // |predicted - actual|
    coverage: boolean;          // actual ∈ confidence_interval?
    calibration_error: number;  // |predicted_prob - observed_freq|
  };
}
```

---

### Évaluation 3: Budget Optimization Relevance

| Mantra | Définition |
|--------|------------|
| **Target** | Suggérer des optimisations applicables et impactantes |
| **Test Set** | 30 profils avec différents contextes (ville, mode de vie) |
| **Scoring** | Applicability Rate, Impact Score, User Satisfaction (LLM-as-Judge) |
| **Decision Rule** | Applicability ≥ 0.7 ET Impact Score ≥ 100€/mois |

```typescript
interface BudgetOptimizationEval {
  // Test case
  input: {
    expense_breakdown: Record<string, number>;
    context: {
      city_size: 'small' | 'medium' | 'large';
      has_car: boolean;
      diet: 'normal' | 'vegetarian' | 'vegan';
    };
  };

  // Expected
  expected: {
    applicable_solutions: string[];  // ['coloc', 'crous']
    min_savings_per_month: number;   // 150
  };

  // Metrics
  metrics: {
    applicability_rate: number;      // % of suggestions that apply to context
    total_potential_savings: number; // Sum of all applicable savings
    user_satisfaction: number;       // LLM-as-Judge score 0-1
  };
}
```

---

### Évaluation 4: Explainability Quality

| Mantra | Définition |
|--------|------------|
| **Target** | Explications compréhensibles et fidèles au raisonnement |
| **Test Set** | 20 queries avec explanations attendues |
| **Scoring** | Faithfulness, Comprehensibility (LLM-as-Judge), Graph Path Coverage |
| **Decision Rule** | Faithfulness ≥ 0.9 ET Comprehensibility ≥ 0.8 |

```typescript
interface ExplainabilityEval {
  // Test case
  input: {
    query: string;              // "Pourquoi freelance plutôt que McDo?"
    recommendation: string;     // "freelance_dev"
  };

  // Expected explanation components
  expected: {
    graph_path_mentioned: boolean;  // Python → enables → freelance_dev
    metrics_cited: string[];        // ['hourly_rate', 'co_benefit']
    comparison_made: boolean;       // vs McDo comparison
  };

  // LLM-as-Judge scoring
  metrics: {
    faithfulness: number;           // Does explanation match actual reasoning?
    comprehensibility: number;      // Is it easy to understand?
    completeness: number;           // Are all factors explained?
  };
}
```

---

## 🎯 Test Sets Concrets

### Job Matching Test Cases (10 exemples)

| ID | Skills | Expected Top Job | Why |
|----|--------|------------------|-----|
| JM-01 | [python, sql] | freelance_dev | Best rate + CV++ |
| JM-02 | [excel] | data_entry | Only match |
| JM-03 | [english, french] | translation | Language skills |
| JM-04 | [python] | tutoring | If max 5h constraint |
| JM-05 | [] (no skills) | babysitting | No skill required |
| JM-06 | [js, python, sql] | freelance_dev | Multiple skills boost |
| JM-07 | [python] + min 20€/h | freelance_dev | Rate constraint |
| JM-08 | [excel] + max 10h | data_entry | Time constraint |
| JM-09 | [english] + flex high | translation | Flexibility match |
| JM-10 | [python] + coloc context | tutoring | Co-benefit relevant |

### ML Projection Test Cases (10 exemples)

| ID | Income | Expenses | Years | Job Hours | Expected Balance |
|----|--------|----------|-------|-----------|------------------|
| ML-01 | 800 | 750 | 3 | 10 | +8,500€ |
| ML-02 | 800 | 800 | 3 | 0 | -500€ |
| ML-03 | 1200 | 700 | 2 | 15 | +15,000€ |
| ML-04 | 600 | 650 | 4 | 5 | -3,000€ |
| ML-05 | 1000 | 900 | 3 | 10 | +6,000€ |

---

## 📈 Opik Dashboard Metrics

### Métriques à tracker dans Opik:

```typescript
const OPIK_METRICS = {
  // Performance
  'latency_total_ms': number,
  'latency_llm_ms': number,
  'latency_graph_ms': number,
  'latency_ml_ms': number,

  // Quality
  'job_match_score': number,        // 0-1
  'budget_optimization_impact': number, // €/month
  'ml_prediction_confidence': number,   // 0-1

  // Diversity (Anti-Hivemind)
  'recommendation_diversity': number,   // How different are top 3 jobs?
  'explanation_coverage': number,       // % of factors explained

  // User
  'user_feedback': 'thumbs_up' | 'thumbs_down' | null,
  'session_duration_s': number,
  'queries_per_session': number,
};
```

---

## 🔄 Feedback Loop

```
User Query → System Response → User Feedback (👍/👎)
                                     ↓
                              Opik logs feedback
                                     ↓
                         Weekly analysis of failures
                                     ↓
                    Improve prompts / graph data / ML model
                                     ↓
                              Re-run test sets
                                     ↓
                         Deploy if metrics improve
```

---

*Document de réflexion - Écrans et Évaluations*
