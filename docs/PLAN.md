# Plan Hackathon Financial Health - Comet/Opik

> **Objectif**: MCP Server simplifié avec Mastra + THE-BRAIN patterns, Opik au maximum
> **Durée**: 3 semaines
> **Track**: Financial Health ($5,000 prize)
> **Cible**: 🎓 **ÉTUDIANTS** (niche mais très engagée)
> **Décisions**: Opik self-hosted + UI complète + triptyque LLM+Graph+ML

---

## 🎓 PIVOT: Focus Étudiants

### Pourquoi les étudiants?
1. **Problèmes concrets et immédiats**: Budget serré, jobs, prêts
2. **Audience très engagée**: Partagent entre eux (viralité)
3. **Niche différenciante**: Peu d'apps vraiment adaptées
4. **Fun naturel**: Leur vie est une aventure

---

## 🚀 3 Concepts "Fun" pour Étudiants

### Option A: "Student Life Navigator" ⭐⭐⭐ (RECOMMANDÉ)

**Pitch**: Un GPS de vie étudiante qui t'aide à naviguer entre études, jobs et budget.

**3 Piliers**:
| Pilier | Ce qu'il fait | Tech |
|--------|---------------|------|
| 💰 **Budget Coach** | Gérer revenus (jobs, aides, famille) vs dépenses | LLM + ML prédiction |
| 🎯 **Job Matcher** | Trouver des jobs compatibles avec tes études | Graph (compétences → jobs) |
| 📉 **Loan Planner** | Stratégies de remboursement post-diplôme | ML projection |

**Scénario User**:
```
Étudiant: "Je suis en L2 Info, j'ai 800€/mois, je cherche un job compatible"
     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 1. BUDGET ANALYSIS (LLM)                                        │
│    Revenus: 800€ (APL 200 + parents 400 + job actuel 200)       │
│    Dépenses: loyer 500, bouffe 200, transport 50 = 750€         │
│    Marge: 50€/mois → "Tu dois augmenter tes revenus"            │
└─────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. JOB MATCHING (Graph DuckPGQ)                                  │
│    Tes compétences: Python, SQL, algo                           │
│    Graph: Python → contient → Data Entry → mène_à → Freelance   │
│    Match: "Dev freelance Malt = 25€/h + expérience CV"          │
│    Co-bénéfice: "Pratique tes compétences cours en vrai projet" │
└─────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. PROJECTION (MindsDB ML)                                       │
│    Si job 10h/semaine × 25€ = +1000€/mois                       │
│    Prédiction: "En 3 ans, tu auras 15k€ d'avance au diplôme"    │
│    Alternative: "Sans job, tu auras 5k€ de dette"               │
└─────────────────────────────────────────────────────────────────┘
```

**Opik Showcase**:
- Span 1: budget_analysis
- Span 2-4: graph_traversal (compétences → jobs)
- Span 5: ml_prediction (projection 3 ans)
- Span 6: llm_recommendation

---

### Option B: "Study-Work Balance Optimizer"

**Pitch**: Optimise ton ratio études/travail pour maximiser notes ET revenus.

**Flow**:
```
Input: Planning cours + capacité travail + objectif notes
     ↓
LLM: Analyse des créneaux disponibles
     ↓
Graph: Compatibilité jobs vs emploi du temps
     ↓
ML: Prédiction impact sur GPA
     ↓
Output: "Travaille max 12h/semaine pour garder un GPA > 14"
```

**Moins fun** que Option A (trop optimisation, moins émotionnel)

---

### Option C: "Loan Payoff Quest" 🎮

**Pitch**: Transforme le remboursement de prêt en jeu.

**Gamification**:
- **Quests**: "Rembourse 500€ ce mois" → débloquer achievement
- **Niveaux**: Débutant → Survivant → Maître de budget → Libre
- **Boss fights**: "Le mois de Noël" (dépenses ++)

**Risque**: Gamification peut sembler infantilisante pour certains

---

## ✅ RECOMMANDATION: Option A "Student Life Navigator"

**Raisons**:
1. **Problème réel et immédiat** pour les étudiants
2. **Graph très pertinent** (compétences → jobs → revenus)
3. **ML prédictif utile** (projection à 3-5 ans)
4. **Opik nécessaire** (beaucoup d'itérations pour trouver le bon job)
5. **Fun sans gamification forcée** (le fun vient de la pertinence)

## Critères de jugement (rappel)
1. **Functionality** - App qui marche vraiment
2. **Real-world relevance** - Applicable à la vraie vie
3. **Use of LLMs/Agents** - Reasoning chains, autonomy, tool use
4. **Evaluation and observability** - **Opik integration** ← CLÉ
5. **Goal Alignment** - Aide aux décisions financières responsables

---

## 🎯 Cas d'Usage Retenu: "Financial Strategy Lab"

### Option A: "Financial Strategy Lab" ⭐⭐⭐ (RECOMMANDÉ)

**Pitch**: Un laboratoire où l'utilisateur explore différentes stratégies financières, avec traçabilité complète de chaque évaluation et itération.

**Pourquoi Opik est NÉCESSAIRE:**
- Multi-agents (3 perspectives) = traces multiples par requête
- LLM-as-Judge évalue chaque stratégie sur 5+ critères
- Itérations successives pour raffiner les recommandations
- Comparaison A/B visible dans Opik
- Debugging des "mauvais conseils" = explainability

**Flow utilisateur:**
```
User: "J'ai 500€/mois, je veux épargner pour un apport immobilier dans 5 ans"
     ↓
┌─────────────────────────────────────────────────────────────────┐
│ STRATEGY GENERATOR (Mastra Agent)                                │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│ │ Perspective │  │ Perspective │  │ Perspective │              │
│ │ PRUDENT     │  │ ÉQUILIBRÉ   │  │ AMBITIEUX   │              │
│ │ Livret A    │  │ PEA + Livret│  │ ETF + Crypto│              │
│ └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
     ↓ (chaque stratégie tracée dans Opik)
┌─────────────────────────────────────────────────────────────────┐
│ STRATEGY EVALUATOR (LLM-as-Judge avec Opik)                      │
│ Critères: risque, rendement_espéré, effort, liquidité, fiscal   │
│ Score agrégé + radar chart                                       │
└─────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────┐
│ GUARDIAN LAYER (validation anti-hallucination)                   │
│ - Vérification des calculs (intérêts composés)                  │
│ - Cohérence temporelle (5 ans OK pour objectif)                 │
│ - Pas de conseil risqué non-disclaimé                           │
└─────────────────────────────────────────────────────────────────┘
     ↓
Réponse: 3 stratégies comparées + recommandation + lien Opik traces
```

**Composants techniques:**
1. `strategy-generator-agent.ts` - 3 perspectives (THE-BRAIN Alternatives Mode)
2. `strategy-evaluator.ts` - LLM-as-Judge avec 5 critères
3. `financial-guardian.ts` - Validation des recommandations
4. `opik-tracer.ts` - Instrumentation Opik native
5. Interface chat minimaliste

**Opik Showcase:**
- Dashboard avec toutes les traces
- Comparaison de runs (A/B testing stratégies)
- Métriques custom: `strategy_diversity_score`, `evaluation_confidence`
- Feedback loop visible (user thumbs up/down → amélioration)

---

### Option B: "Budget Copilot avec Episodic Memory" ⭐⭐

**Pitch**: Assistant budgétaire qui apprend de vos patterns de dépenses réussis.

**Pourquoi Opik utile (mais moins nécessaire):**
- Trace les décisions de l'agent
- Évalue la qualité des conseils
- Moins d'itérations = moins de traces intéressantes

**Flow:**
```
User upload bank CSV → Agent analyse patterns → Recommandations personnalisées
                                ↓
                    Episodic Memory stocke les patterns réussis
                                ↓
                    Prochaine fois: retrieval + adaptation
```

**Problème**: Moins de traces par requête, Opik moins "wow"

---

### Option C: "Financial Literacy Graph" ⭐

**Pitch**: Graph de concepts financiers avec parcours d'apprentissage.

**Pourquoi Opik moins pertinent:**
- Principalement du retrieval
- Peu d'itérations LLM
- Opik serait du simple logging

---

## 🏆 Recommandation: Option A "Financial Strategy Lab"

**Raisons:**
1. **Opik central**: Chaque requête génère 10+ spans (3 stratégies × éval × guardian)
2. **Disruptif**: Personne ne montre les traces de raisonnement au user final
3. **THE-BRAIN natif**: Alternatives Mode + Guardian Layer
4. **Faisable en 3 semaines**: Scope bien défini
5. **Demo impressive**: Montrer le dashboard Opik avec les traces en live

---

## 📐 Architecture Technique (Implémentée)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (SolidStart)                     │
│  Chat interface + Radar chart strategies + Opik traces link     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP SERVER (Mastra + Opik)                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 6 AGENTS MASTRA:                                            │ │
│  │  1. Budget Coach      - Analyse budget + conseils           │ │
│  │  2. Job Matcher       - Graph compétences → jobs            │ │
│  │  3. Projection ML     - Prédictions fin d'études            │ │
│  │  4. Guardian          - Validation hybride (Heuristics+LLM) │ │
│  │  5. Money Maker       - Vente objets + side hustles         │ │
│  │  6. Strategy Comparator - Cross-évaluation stratégies       │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ HYBRID EVALUATION SYSTEM:                                   │ │
│  │  Layer 1: Heuristics (calculation, risk, readability, tone)│ │
│  │  Layer 2: G-Eval LLM-as-Judge (4 critères)                 │ │
│  │  Layer 3: Aggregation avec veto logic                       │ │
│  │  Layer 4: Opik logging avec métriques custom               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MASTRA ORCHESTRATION                          │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Budget Coach  │  │ Job Matcher   │  │ Projection ML │       │
│  │ Analyse +     │  │ Graph         │  │ Prédiction    │       │
│  │ Conseils      │  │ DuckPGQ       │  │ probabiliste  │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Guardian      │  │ Money Maker   │  │ Strategy      │       │
│  │ Hybrid Eval   │  │ Vision +      │  │ Comparator    │       │
│  │ Veto Logic    │  │ Price Search  │  │ 4 axes score  │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                              │                                   │
│                              ▼                                   │
│                    OPIK TRACING (self-hosted)                    │
│  - Span per agent action                                        │
│  - Span per evaluation criterion                                │
│  - Hybrid eval metrics: heuristic_score, llm_score, final_score│
│  - Custom metrics: strategy_diversity, evaluation_confidence   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OPIK SELF-HOSTED (Docker)                     │
│  - Dashboard traces avec 15+ spans/requête                      │
│  - Hybrid evaluation visible (heuristics + G-Eval)              │
│  - Strategy comparison A/B                                       │
│  - Feedback tracking                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🤖 6 Agents Mastra (Implémentés)

| Agent | Fichier | Rôle | Tools |
|-------|---------|------|-------|
| **Budget Coach** | `budget-coach.ts` | Analyse budget + conseils personnalisés | `analyze_budget`, `generate_advice`, `find_optimizations` |
| **Job Matcher** | `job-matcher.ts` | Matching compétences → jobs via graph | `match_jobs`, `explain_job_match`, `compare_jobs` |
| **Projection ML** | `projection-ml.ts` | Prédictions probabilistes fin d'études | `predict_graduation_balance`, `simulate_scenarios` |
| **Guardian** | `guardian.ts` | Validation hybride (Heuristics + LLM-as-Judge) | `validate_calculation`, `check_risk_level`, `hybrid_evaluation` |
| **Money Maker** | `money-maker.ts` | Identifier objets à vendre + side hustles | `analyze_sellable_objects`, `estimate_item_price`, `calculate_sale_impact`, `suggest_side_hustles`, `money_maker_analysis` |
| **Strategy Comparator** | `strategy-comparator.ts` | Cross-évaluation jobs vs hustles vs ventes vs optimisations | `compare_strategies`, `quick_strategy_comparison` |

---

## 🎯 Hybrid Evaluation System (Implémenté)

### Architecture Pipeline

```
Recommandation + Contexte Étudiant
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: HEURISTIC CHECKS (~50ms, déterministe)                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ Calculs    │ │  Keywords  │ │ Readability│ │   Tone     │   │
│  │ Validation │ │  Risque    │ │ Flesch-K   │ │ Sentiment  │   │
│  │ (CRITICAL) │ │ (CRITICAL) │ │            │ │            │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│  ┌────────────┐                                                 │
│  │ Disclaimers│  → Score Heuristique (0-1)                      │
│  └────────────┘                                                 │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼ VETO CHECK: Si calcul faux ou risque critique → STOP
       │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: G-EVAL LLM-AS-JUDGE (~500ms, sémantique)              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Critères:                                                 │  │
│  │  • Appropriateness (adapté à l'étudiant?)       [30%]     │  │
│  │  • Safety (pas de conseils dangereux?)          [35%]     │  │
│  │  • Coherence (logique du raisonnement?)         [15%]     │  │
│  │  • Actionability (étapes concrètes?)            [20%]     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: AGGREGATION                                            │
│  Score Final = 60% Heuristique + 40% LLM (ajusté par confidence)│
│  + Veto Logic (si critique échoue, LLM ne peut pas override)    │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: OPIK LOGGING                                           │
│  • Span par check heuristique avec score + metadata             │
│  • Span G-Eval avec reasoning + confidence                      │
│  • Custom metrics: evaluation.safety_score, evaluation.passed    │
└─────────────────────────────────────────────────────────────────┘
```

### Fichiers Implémentés

```
src/evaluation/
├── types.ts                 # Interfaces TypeScript
├── index.ts                 # Exports + orchestrateur principal
├── heuristics/
│   ├── index.ts             # Orchestrateur heuristiques
│   ├── calculation.ts       # Validation calculs (CRITICAL)
│   ├── risk-keywords.ts     # Détection mots-clés risque (CRITICAL)
│   ├── readability.ts       # Flesch-Kincaid grade level
│   ├── tone.ts              # Sentiment + agressivité
│   └── disclaimers.ts       # Check présence mises en garde
├── geval/
│   ├── index.ts             # Orchestrateur G-Eval
│   ├── criteria.ts          # 4 critères avec poids
│   └── prompts.ts           # Templates Chain-of-Thought
├── aggregation.ts           # Combinaison scores + veto
└── opik-integration.ts      # Helpers logging Opik
```

---

## 💰 Money Maker Agent (Nouveau)

**Pitch**: "Prends une photo d'un truc que tu veux vendre" → identification → prix → impact budget

### Fonctionnalités

| Fonction | Description |
|----------|-------------|
| **Vision** | Analyse photos pour identifier objets vendables |
| **Estimation Prix** | Prix marché Leboncoin/Vinted/Back Market |
| **Impact Budget** | "Équivalent à X mois d'épargne" |
| **Side Hustles** | 8 suggestions adaptées aux étudiants |

### Side Hustles Supportés

```typescript
const SIDE_HUSTLES = [
  'reselling',        // Revente en ligne
  'pet_sitting',      // Garde d'animaux (Yoopies, Animaute)
  'delivery',         // Livraison (Uber Eats, Stuart)
  'transcription',    // Transcription audio
  'mystery_shopping', // Client mystère
  'plasma_donation',  // Don de plasma rémunéré
  'focus_groups',     // Panels consommateurs
  'moving_help',      // Aide déménagement (Youpijob)
];
```

---

## ⚖️ Strategy Comparator Agent (Nouveau)

**Pitch**: Comparer TOUTES les options pour améliorer ta situation financière

### Scoring sur 4 Axes

| Axe | Poids | Description |
|-----|-------|-------------|
| **Financial** | 35% | Impact sur le budget mensuel (€/mois normalisé) |
| **Effort** | 25% | Temps et énergie requis |
| **Flexibility** | 20% | Compatibilité avec les cours |
| **Sustainability** | 20% | Durabilité dans le temps |

### Types de Stratégies Comparées

```typescript
type StrategyType = 'job' | 'hustle' | 'selling' | 'optimization';

// Jobs: Dev freelance, cours particuliers, etc.
// Hustles: Pet sitting, livraison, revente, etc.
// Selling: Vente d'objets (one-time gain)
// Optimizations: Coloc, CROUS, vélo (monthly savings)
```

### Output

```typescript
interface ComparisonResult {
  bestOverall: Strategy;      // Meilleur score global
  bestQuickWin: Strategy;     // Meilleur pour gain rapide
  bestLongTerm: Strategy;     // Meilleur pour le long terme
  rankedStrategies: Strategy[];
  comparisonMatrix: Matrix;   // A vs B comparisons
}
```

---

## 📅 Planning 3 semaines

### Semaine 1: Foundation
- [ ] Setup Opik Cloud account + SDK integration
- [ ] MCP Server skeleton avec 5 tools de base
- [ ] Mastra agents structure (3 perspectives)
- [ ] Opik tracer wrapper

### Semaine 2: Core Logic
- [ ] Strategy Generator avec 3 perspectives
- [ ] LLM-as-Judge evaluator (5 critères)
- [ ] Guardian Layer (validation calculs)
- [ ] Tests unitaires + Opik traces

### Semaine 3: Polish + Demo
- [ ] Frontend chat minimal
- [ ] Dashboard Opik avec custom metrics
- [ ] Demo video / pitch deck
- [ ] Testing edge cases

---

## 🔧 Stack Technique

| Composant | Technologie | Raison |
|-----------|-------------|--------|
| Orchestration | Mastra | Pattern existant |
| Tracing | **Opik self-hosted** | Docker local, contrôle total |
| LLM | Groq (llama-3.1-70b) | Rapide + gratuit |
| MCP | TypeScript + patterns existants | Réutilisation |
| Frontend | SolidStart + UI complète | Stack existante + radar charts |
| Storage | **DuckDB + DuckPGQ** | Graphes de connaissance financiers |

---

## 🔗 DuckPGQ - Knowledge Graph Étudiant (RICHE)

### 3 Domaines Combinés:

| Domaine | Nodes | Edges | Use Case |
|---------|-------|-------|----------|
| 🎯 **Compétences → Jobs** | skills, jobs, platforms | enables, requires, pays | "Quel job avec Python?" |
| 📚 **Études → Métiers** | diplomas, careers, salaries | leads_to, requires | "Débouchés L2 Info?" |
| 💰 **Dépenses → Optis** | expenses, solutions, savings | reduces, replaces | "Comment économiser loyer?" |

### Schema Graph Complet:

```sql
-- ============================================
-- NODES: Tout l'univers étudiant
-- ============================================
CREATE TABLE student_nodes (
  id VARCHAR PRIMARY KEY,
  domain VARCHAR,  -- 'skill', 'job', 'diploma', 'career', 'expense', 'solution'
  name VARCHAR,
  properties JSONB
);

-- Exemples de données
INSERT INTO student_nodes VALUES
  -- Skills
  ('python', 'skill', 'Python', '{"level": "intermédiaire", "demand": 0.9}'),
  ('sql', 'skill', 'SQL', '{"level": "débutant", "demand": 0.8}'),
  ('js', 'skill', 'JavaScript', '{"level": "intermédiaire", "demand": 0.85}'),

  -- Jobs étudiants
  ('freelance_dev', 'job', 'Dev Freelance Malt', '{"hourly_rate": 25, "flexibility": 0.9}'),
  ('data_entry', 'job', 'Saisie de données', '{"hourly_rate": 12, "flexibility": 0.7}'),
  ('tutoring', 'job', 'Cours particuliers', '{"hourly_rate": 20, "flexibility": 0.8}'),
  ('mcdo', 'job', 'Fast-food', '{"hourly_rate": 11, "flexibility": 0.3}'),

  -- Diplômes
  ('l2_info', 'diploma', 'L2 Informatique', '{"duration": 2, "cost": 300}'),
  ('master_dev', 'diploma', 'Master Dev', '{"duration": 5, "cost": 500}'),

  -- Métiers
  ('dev_junior', 'career', 'Développeur Junior', '{"salary": 35000, "growth": 0.15}'),
  ('data_analyst', 'career', 'Data Analyst', '{"salary": 40000, "growth": 0.20}'),

  -- Dépenses
  ('rent', 'expense', 'Loyer', '{"avg_student": 500, "category": "housing"}'),
  ('food', 'expense', 'Alimentation', '{"avg_student": 200, "category": "daily"}'),
  ('transport', 'expense', 'Transport', '{"avg_student": 50, "category": "mobility"}'),

  -- Solutions d'économie
  ('coloc', 'solution', 'Colocation', '{"savings_pct": 0.30, "effort": "medium"}'),
  ('crous', 'solution', 'Resto U CROUS', '{"savings_pct": 0.50, "effort": "low"}'),
  ('velo', 'solution', 'Vélo/Marche', '{"savings_pct": 0.80, "effort": "medium"}');

-- ============================================
-- EDGES: Relations entre nodes
-- ============================================
CREATE TABLE student_edges (
  source_id VARCHAR,
  target_id VARCHAR,
  relation_type VARCHAR,
  weight FLOAT,
  properties JSONB
);

INSERT INTO student_edges VALUES
  -- Skills → Jobs (enables)
  ('python', 'freelance_dev', 'enables', 0.9, '{"co_benefit": "CV++"}'),
  ('python', 'data_entry', 'enables', 0.6, '{"co_benefit": "automatisation"}'),
  ('sql', 'data_entry', 'enables', 0.8, '{}'),
  ('python', 'tutoring', 'enables', 0.7, '{"co_benefit": "renforce apprentissage"}'),

  -- Jobs → Income (pays)
  ('freelance_dev', 'income', 'pays', 25, '{"unit": "hourly"}'),
  ('tutoring', 'income', 'pays', 20, '{"unit": "hourly"}'),
  ('mcdo', 'income', 'pays', 11, '{"unit": "hourly", "co_benefit": null}'),

  -- Diplomas → Careers (leads_to)
  ('l2_info', 'dev_junior', 'leads_to', 0.7, '{"years_after": 3}'),
  ('master_dev', 'data_analyst', 'leads_to', 0.85, '{"years_after": 0}'),

  -- Solutions → Expenses (reduces)
  ('coloc', 'rent', 'reduces', 0.30, '{"condition": "bon coloc"}'),
  ('crous', 'food', 'reduces', 0.50, '{"condition": "proximité"}'),
  ('velo', 'transport', 'reduces', 0.80, '{"condition": "ville plate"}');
```

### Requêtes DuckPGQ Puissantes:

```sql
-- 1. Jobs compatibles avec mes compétences (triés par salaire)
SELECT j.name, e.weight as match_score, j.properties->>'hourly_rate' as rate,
       e.properties->>'co_benefit' as bonus
FROM student_edges e
JOIN student_nodes s ON e.source_id = s.id
JOIN student_nodes j ON e.target_id = j.id
WHERE s.id IN ('python', 'sql')
AND e.relation_type = 'enables'
ORDER BY (j.properties->>'hourly_rate')::float * e.weight DESC;

-- 2. Chemin: Compétence → Job → Revenu + Co-bénéfice
MATCH (skill:student_nodes)-[e:enables]->(job:student_nodes)
WHERE skill.domain = 'skill' AND job.domain = 'job'
RETURN skill.name, job.name, e.weight, e.properties->>'co_benefit';

-- 3. Optimisations budget par catégorie
SELECT exp.name as expense, sol.name as solution,
       e.weight * 100 as savings_pct,
       exp.properties->>'avg_student' as monthly_cost
FROM student_edges e
JOIN student_nodes sol ON e.source_id = sol.id
JOIN student_nodes exp ON e.target_id = exp.id
WHERE e.relation_type = 'reduces'
ORDER BY e.weight DESC;

-- 4. Projection carrière: diplôme actuel → métier → salaire
MATCH (d:student_nodes {id: 'l2_info'})-[r:leads_to]->(c:student_nodes)
RETURN d.name, c.name, c.properties->>'salary', r.properties->>'years_after';
```

### Intégration dans le Flow Student Life Navigator:

```
User: "Je suis en L2 Info avec Python, quel job me rapporte le plus?"
     ↓
┌─────────────────────────────────────────────────────────────────┐
│ GRAPH JOB MATCHER (DuckPGQ)                                      │
│ 1. Traversée: Python → enables → [freelance_dev, data_entry]    │
│ 2. Score: freelance_dev (0.9) > data_entry (0.6)                │
│ 3. Taux horaire: 25€ vs 12€                                      │
│ 4. Co-bénéfice: "CV++" vs "automatisation"                      │
│ 5. Winner: Freelance Dev (score × rate = 22.5 vs 7.2)           │
└─────────────────────────────────────────────────────────────────┘
     ↓ (tracé dans Opik: span "graph_job_matching")
Réponse: "Dev freelance sur Malt: 25€/h + expérience CV"
```

---

## 🤖 MindsDB - Prédiction ML pour Étudiants

### Pourquoi c'est un game-changer:
1. **Unique**: Aucune app étudiante ne fait de projection ML
2. **Questions que TOUS les étudiants se posent**: "Aurais-je assez?", "Quand finirai-je de rembourser?"
3. **Triptyque unique**: LLM (coaching) + Graph (job matching) + ML (projections)
4. **Opik showcase**: Chaque prédiction = span avec confidence interval

### Cas d'Usage Étudiants:

#### 1. "Graduation Budget Predictor" ⭐⭐⭐
```
User: "Aurais-je des économies à la fin de mes études?"
     ↓
┌─────────────────────────────────────────────────────────────────┐
│ MINDSDB PREDICTOR                                                │
│ Input: monthly_income=800, expenses=750, job_hours=10, years=3  │
│ Model: trained on student financial trajectories                │
│ Output: final_balance=+8500€, confidence_interval=[5k, 12k]     │
│         probability_debt_free=0.82                              │
└─────────────────────────────────────────────────────────────────┘
     ↓ (tracé dans Opik: span "ml_graduation_projection")
Réponse: "82% de chances de finir sans dette, ~8500€ d'économies"
```

#### 2. "Loan Payoff Timeline"
```sql
-- Modèle MindsDB: temps de remboursement prêt étudiant
CREATE MODEL loan_payoff_predictor
PREDICT months_to_payoff, monthly_payment_optimal
USING ENGINE='lightwood'
FROM (
  SELECT loan_amount, interest_rate, starting_salary,
         cost_of_living, career_growth_rate
  FROM student_loan_scenarios
);

-- Prédiction pour L2 Info
SELECT months_to_payoff, monthly_payment_optimal, confidence
FROM loan_payoff_predictor
WHERE loan_amount = 15000
AND starting_salary = 35000
AND career_growth_rate = 0.05;
-- Output: 36 mois, 450€/mois, confidence 0.78
```

#### 3. "Study-Work Impact Predictor"
```sql
-- Prédire impact des heures de travail sur les notes
CREATE MODEL study_work_impact
PREDICT gpa_expected, burnout_risk
USING ENGINE='lightwood'
FROM (
  SELECT work_hours_weekly, study_hours, diploma_difficulty,
         current_gpa, sleep_hours
  FROM student_performance_data
);

-- Est-ce que 15h de job par semaine va impacter mes notes?
SELECT gpa_expected, burnout_risk
FROM study_work_impact
WHERE work_hours_weekly = 15
AND study_hours = 20
AND diploma_difficulty = 'medium';
-- Output: GPA 13.2 (-0.8 vs sans job), burnout_risk = 0.35
```

### Intégration dans l'Architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FINANCIAL STRATEGY LAB v2                     │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    LLM      │  │  DuckPGQ    │  │  MindsDB    │             │
│  │ Raisonnement│  │   Graph     │  │   ML        │             │
│  │ 3 persp.    │  │ Explications│  │ Prédictions │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                          ▼                                      │
│               ┌─────────────────────┐                          │
│               │    OPIK TRACING     │                          │
│               │ - llm_generation    │                          │
│               │ - graph_traversal   │                          │
│               │ - ml_prediction     │                          │
│               │ - confidence_scores │                          │
│               └─────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Tools MCP MindsDB à Utiliser:

| Tool existant | Usage hackathon |
|---------------|-----------------|
| `mindsdb_train_model` | Entraîner modèle prédiction |
| `mindsdb_predict` | Prédiction single |
| `mindsdb_batch_predict` | Scénarios multiples |
| `mindsdb_query` | Requêtes custom |

### Données pour Entraînement (synthétiques):

```typescript
// Générer données d'entraînement synthétiques
const TRAINING_DATA = generateSyntheticPortfolios({
  count: 10000,
  features: ['stocks_pct', 'bonds_pct', 'realestate_pct', 'crypto_pct'],
  target: ['5y_return', 'max_drawdown', 'sharpe_ratio'],
  noise: 0.1
});
```

### Valeur Ajoutée pour le Jury:

| Critère | Sans MindsDB | Avec MindsDB |
|---------|--------------|--------------|
| Functionality | ✅ Recommandations | ✅ + Prédictions probabilistes |
| Real-world | ⭐⭐ | ⭐⭐⭐ "Vais-je atteindre mon objectif?" |
| LLM/Agents | ✅ Multi-perspectives | ✅ + ML confidence scores |
| Opik traces | 10 spans/requête | 15+ spans (+ ml_prediction) |
| Différenciation | Standard | **Unique sur le marché** |

---

## 🔄 Opik Self-Hosted Setup

```bash
# Setup rapide (3 commandes)
git clone https://github.com/comet-ml/opik.git
cd opik
./opik.sh  # Linux/Mac

# Accessible sur http://localhost:5173
# Données persistées dans ~/opik
```

**Profiles Docker Compose:**
- `docker compose --profile opik up -d` → Full platform
- Infrastructure: ClickHouse + MySQL + Redis

---

## 📦 Composants Réutilisables (Stack Existante)

### Visualisation
| Fichier | Usage |
|---------|-------|
| `deposium_MCPs/src/services/quickchart.ts` | Génération charts (pie, radar, bar, line) |
| `deposium_MCPs/src/utils/chart-generator.ts` | Helpers (radarChart, doughnutChart, etc.) |
| `deposium_solid/src/features/macros/components/renderers/MetricRenderer.tsx` | KPIs avec sparklines + trends |

### Multi-Perspectives (THE-BRAIN)
| Fichier | Usage |
|---------|-------|
| `deposium_solid/macros/deposium_alternatives.yaml` | Pattern 3 perspectives + diversity check |
| `deposium_solid/macros/perspectives/business.yaml` | Config temperatures/prompts par perspective |
| `deposium_solid/macros/chat_agentique.yaml` | Pipeline multi-phases avec RRF |

### Agents & Orchestration
| Fichier | Usage |
|---------|-------|
| `deposium_edge_runtime/supabase/functions/_shared/mastra-agents.ts` | Factory agents + LLM-as-Judge pattern |
| `deposium_MCPs/src/services/outcome-graders.ts` | Binary pass/fail evaluation |

---

## 🎯 Points Clés pour le Jury

1. **Opik partout visible**: Dashboard intégré dans l'UI + traces détaillées
2. **Multi-perspectives**: Innovation THE-BRAIN Anti-Hivemind (3 stratégies divergentes)
3. **LLM-as-Judge**: Évaluation rigoureuse sur 5 critères (risque, rendement, effort, liquidité, fiscal)
4. **Guardian Layer**: Validation calculs + pas de conseils dangereux
5. **Real-world**: Vrai cas d'usage épargne/investissement compréhensible

---

## 📅 Planning Détaillé (3 semaines)

### Semaine 1: Foundation (Jours 1-7)
- [ ] **J1-2**: Setup Opik self-hosted + SDK Python/TS
- [ ] **J3-4**: MCP Server skeleton (10 tools financiers)
- [ ] **J5-6**: Mastra agents structure (3 perspectives)
- [ ] **J7**: Opik tracer wrapper + premiers tests

### Semaine 2: Core Logic (Jours 8-14)
- [ ] **J8-9**: Strategy Generator avec 3 perspectives (conservative, growth, income)
- [ ] **J10-11**: LLM-as-Judge evaluator (5 critères)
- [ ] **J12**: Guardian Layer (validation calculs intérêts composés)
- [ ] **J13-14**: Tests + ajustements Opik traces

### Semaine 3: UI + Polish (Jours 15-21)
- [ ] **J15-17**: Frontend SolidStart (chat + radar charts + pie charts)
- [ ] **J18-19**: Dashboard Opik embedded + custom metrics
- [ ] **J19-20**: Demo video / pitch deck
- [ ] **J21**: Testing edge cases + bug fixes

---

## 🔢 Tools MCP à Implémenter (15 tools - triptyque LLM+Graph+ML)

```typescript
// Tools financiers pour le hackathon
const FINANCIAL_TOOLS = {
  // === LLM / Strategy Generation ===
  'generate_strategies': {},      // 3 perspectives → 3 stratégies
  'evaluate_strategy': {},        // LLM-as-Judge sur 5 critères
  'validate_recommendation': {},  // Guardian Layer

  // === DuckPGQ / Graph ===
  'explain_recommendation': {},   // Traversée graph → explications
  'find_correlated_assets': {},   // Actifs corrélés/non-corrélés
  'impact_analysis': {},          // Si taux ↑ → impact sur quoi?

  // === MindsDB / ML ===
  'predict_goal_probability': {}, // Prob. atteindre objectif
  'forecast_portfolio_return': {},// Prédiction rendement
  'simulate_scenarios': {},       // Monte Carlo avec ML

  // === Calculs & Visualisation ===
  'calculate_compound_interest': {},
  'get_asset_allocation': {},
  'create_radar_chart': {},       // QuickChart radar
  'create_allocation_chart': {},  // QuickChart pie

  // === Opik Integration ===
  'get_opik_traces': {},          // Lien vers dashboard traces
  'log_user_feedback': {},        // Feedback → Opik
};
```

---

## 📊 Macro Template (financial_strategy_lab.yaml)

```yaml
name: financial_strategy_lab
version: '1.0.0'

params:
  objective: { type: enum, values: [epargne, retraite, immobilier, education] }
  monthly_amount: { type: number }
  horizon_years: { type: number }
  risk_tolerance: { type: enum, values: [conservative, moderate, aggressive] }

steps:
  # Phase 1: Génération parallèle 3 perspectives
  - id: perspective_conservative
    tool: generate_strategies
    params: { perspective: conservative, ...params }
    depends_on: []  # Parallèle

  - id: perspective_growth
    tool: generate_strategies
    params: { perspective: growth, ...params }
    depends_on: []  # Parallèle

  - id: perspective_income
    tool: generate_strategies
    params: { perspective: income, ...params }
    depends_on: []  # Parallèle

  # Phase 2: Évaluation LLM-as-Judge
  - id: evaluate_all
    tool: evaluate_strategy
    params:
      strategies: [steps.perspective_conservative, steps.perspective_growth, steps.perspective_income]
      criteria: [risk, return, effort, liquidity, tax_efficiency]
    depends_on: [perspective_conservative, perspective_growth, perspective_income]

  # Phase 3: Guardian validation
  - id: validate
    tool: validate_recommendation
    depends_on: [evaluate_all]

  # Phase 4: Visualisations
  - id: radar_chart
    tool: create_radar_chart
    depends_on: [evaluate_all]

  - id: allocation_chart
    tool: create_allocation_chart
    depends_on: [validate]

output:
  type: composite
  components:
    - { type: markdown, title: 'Recommandation', data: '{{ steps.validate.result }}' }
    - { type: chart, title: 'Profil Risque', data: '{{ steps.radar_chart.url }}' }
    - { type: chart, title: 'Allocation', data: '{{ steps.allocation_chart.url }}' }
    - { type: metrics, data: '{{ steps.evaluate_all.scores }}' }
    - { type: link, title: 'Voir traces Opik', url: '{{ opik_trace_url }}' }
```

---

## 🎬 Scénario Demo (Triptyque LLM + Graph + ML)

**User**: "J'ai 500€/mois, je veux épargner pour un apport immobilier dans 5 ans. Est-ce réaliste?"

**System** (avec traces Opik visibles):

### Phase 1: LLM - Génération de stratégies (3 spans parallèles)
```
Span 2: perspective_conservative → Livret A + PEL
Span 3: perspective_growth → PEA ETF World + Obligations
Span 4: perspective_income → SCPI + Livret A
```

### Phase 2: ML - Prédiction probabilité (1 span)
```
Span 5: mindsdb_predict
  Input: monthly=500, horizon=60, volatility=0.15
  Output: probability=0.78, confidence_interval=[27k, 33k]
```

### Phase 3: LLM - Évaluation (1 span)
```
Span 6: llm_judge
  Stratégies évaluées sur: risque, rendement, effort, liquidité, fiscal
  Winner: perspective_growth (score=0.82)
```

### Phase 4: Graph - Explications (1 span)
```
Span 7: graph_traversal
  Query: "Pourquoi PEA plutôt que PEL?"
  Path: PEA → contains → ETF → correlates_with → inflation → hedges
  Explication: "Le PEA protège mieux contre l'inflation à 5 ans"
```

### Phase 5: Guardian + Output (2 spans)
```
Span 8: guardian_validate → OK (calculs vérifiés)
Span 9: generate_output → 3 stratégies + radar + prédiction 78%
```

**Total: 9 spans minimum par requête** → Opik dashboard très riche

### Demo Opik Points Clés:
1. **Traces hiérarchiques**: Voir les 3 perspectives en parallèle
2. **Métriques custom**: `goal_probability`, `strategy_diversity_score`
3. **Comparaison runs**: User A vs User B (différents profils)
4. **Feedback tracking**: Thumbs up/down → amélioration modèles

---

## ✅ Verification (Tests End-to-End)

1. **Test fonctionnel**: Envoyer 5 requêtes variées, vérifier outputs cohérents
2. **Test Opik**: Vérifier que chaque requête génère 10+ spans
3. **Test UI**: Radar charts s'affichent, liens Opik fonctionnent
4. **Test Guardian**: Injecter des calculs faux → doit être rejeté
5. **Test diversité**: Vérifier que les 3 perspectives sont vraiment différentes

---

---

## 🏆 Résumé Exécutif

### Concept: "Student Life Navigator" 🎓
Un GPS de vie étudiante avec **traçabilité complète Opik** qui combine:

| Composant | Rôle | Exemple |
|-----------|------|---------|
| **LLM** (Mastra) | Budget coaching + conseils personnalisés | "Tu devrais augmenter tes revenus" |
| **Graph** (DuckPGQ) | Job matching + optimisations budget | Python → enables → Freelance Dev → 25€/h |
| **ML** (MindsDB) | Projections fin d'études + remboursement | "82% de finir sans dette" |
| **Opik** | Observabilité end-to-end | 10+ spans/requête avec métriques custom |

### Différenciation Hackathon

| Critère jury | Notre réponse |
|--------------|---------------|
| Functionality | ✅ Chat + job matching + budget optis + projections |
| Real-world | ✅ **Cible niche étudiants** = problèmes concrets immédiats |
| LLM/Agents | ✅ Budget coach + graph traversal + ML prediction |
| **Opik** | ✅ **10+ spans/requête, métriques custom, feedback loop** |
| Goal alignment | ✅ Aide étudiants à gérer budget + trouver jobs compatibles |

### Why We Win
1. **Niche claire** → étudiants = audience très engagée, peu d'apps adaptées
2. **Triptyque LLM+Graph+ML unique** → pas juste un chatbot
3. **Graph pertinent** → compétences → jobs avec co-bénéfices (CV++)
4. **ML prédictif** → "Aurais-je assez à la fin?" = question universelle
5. **Opik nécessaire** → job matching = beaucoup d'itérations visibles

### Quick Pitch (30 sec)
> "Student Life Navigator aide les étudiants à naviguer entre études, jobs et budget. Il trouve des jobs compatibles avec tes compétences via un graphe (Python → Dev Freelance → 25€/h + CV++), prédit si tu finiras tes études avec ou sans dette, et t'aide à optimiser ton budget. Tout est tracé dans Opik - tu peux voir exactement comment l'IA a trouvé ce job pour toi."

### Scénario Demo Complet

```
Étudiant: "Je suis en L2 Info, j'ai 800€/mois, comment m'en sortir?"

→ SPAN 1: budget_analysis (LLM)
  "Revenus: 800€, Dépenses: 750€, Marge: 50€"

→ SPAN 2: graph_job_matching (DuckPGQ)
  "Python → Freelance Dev (25€/h, CV++) vs McDo (11€/h, aucun bonus)"

→ SPAN 3: graph_budget_optis (DuckPGQ)
  "Coloc (-30% loyer), CROUS (-50% bouffe), Vélo (-80% transport)"

→ SPAN 4: ml_graduation_projection (MindsDB)
  "Avec job 10h/sem + optis: 82% sans dette, ~8500€ économies"

→ SPAN 5: llm_recommendation
  "Recommandation: Freelance 10h/sem + coloc = +750€/mois net"

→ OUTPUT:
  - Budget optimisé
  - Job recommandé avec co-bénéfices
  - Projection 3 ans
  - Lien Opik traces
```

---

*Plan finalisé - Prêt pour implémentation*
