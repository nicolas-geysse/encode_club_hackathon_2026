# Plan Hackathon Financial Health - Comet/Opik

> **Projet**: Stride (anciennement "Student Life Navigator")
> **Objectif**: MCP Server avec Mastra agents + Opik observability
> **Track**: Financial Health ($5,000 prize)
> **Cible**: 🎓 **ÉTUDIANTS** (niche engagée avec problèmes concrets)

---

## 🎓 Concept: Stride

**Pitch**: Un GPS de vie étudiante qui t'aide à naviguer entre études, jobs et budget, avec un **Goal Mode intelligent** qui adapte tes objectifs à ta vie réelle.

### 4 Piliers

| Pilier | Ce qu'il fait | Tech |
|--------|---------------|------|
| 💰 **Budget Coach** | Gérer revenus vs dépenses + optimisations | LLM + DuckDB |
| 🎯 **Job Matcher** | Trouver des jobs compatibles avec tes études | Graph (compétences → jobs) |
| 📊 **Projection** | Prédictions probabilistes fin d'études | Formules + intervalles confiance |
| 🎯 **Goal Mode** | Objectifs financiers avec retroplanning intelligent | Algorithme capacity-aware |

---

## 🚀 Features Implémentées

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Dashboard** | Analyse budget, jobs recommandés, optimisations | ✅ |
| **Chat Assistant** | Conversation avec entrée vocale | ✅ |
| **Goal Mode** | Objectifs avec Smart Retroplanning | ✅ |
| **Voice Input** | Transcription Groq Whisper (FR/EN) | ✅ |
| **Hybrid Evaluation** | Heuristics + LLM-as-Judge | ✅ |
| **Opik Tracing** | Observabilité complète | ✅ |

### Goal Mode - Smart Retroplanning

**Innovation clé**: Distribution intelligente des objectifs selon la capacité réelle de l'étudiant.

```
Semaine normale:     ████████████████ 100% capacité → 63€ cible
Semaine pré-exam:    ████████░░░░░░░░  50% capacité → 32€ cible
Semaine examens:     ████░░░░░░░░░░░░  20% capacité → 15€ cible (protégée)
Semaine vacances:    ████████████████████ 120% capacité → 75€ cible
```

**Fonctionnalités:**
- Saisie des événements académiques (examens, vacances, stages)
- Saisie des engagements récurrents (cours, sport, famille)
- Check-in énergie/mood quotidien
- Cibles hebdomadaires dynamiques selon capacité
- Calendrier visuel avec codes couleur
- Gamification avec achievements relatifs

---

## 📐 Architecture Technique

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (SolidStart)                     │
│  7 écrans: Onboarding, Dashboard, Chat, Goal Setup/Plan/Cal/Track│
│  Composants: VoiceInput, GoalProgress, EnergyTracker, etc.      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API ROUTES (SolidStart)                       │
│  /api/goals    - CRUD objectifs + progress tracking             │
│  /api/retroplan - Events académiques, engagements, énergie      │
│  /api/voice    - Transcription audio Whisper                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP SERVER (Mastra + Opik)                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 6 AGENTS MASTRA:                                            │ │
│  │  1. Budget Coach      - Analyse budget + conseils           │ │
│  │  2. Job Matcher       - Graph compétences → jobs            │ │
│  │  3. Projection        - Prédictions fin d'études            │ │
│  │  4. Guardian          - Validation hybride (Heur+LLM)       │ │
│  │  5. Money Maker       - Vente objets + side hustles         │ │
│  │  6. Strategy Comparator - Cross-évaluation stratégies       │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ WORKFLOWS:                                                  │ │
│  │  - Student Analysis   - Analyse multi-agent complète        │ │
│  │  - Goal Planning      - Création plans + retroplanning      │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ HYBRID EVALUATION:                                          │ │
│  │  Layer 1: Heuristics (calculs, risques, lisibilité, ton)   │ │
│  │  Layer 2: G-Eval LLM-as-Judge (4 critères)                 │ │
│  │  Layer 3: Aggregation avec veto logic                       │ │
│  │  Layer 4: Opik logging                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                               │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │    DuckDB       │  │   DuckPGQ       │                       │
│  │ - goals         │  │ - student_nodes │                       │
│  │ - academic_events│  │ - student_edges │                       │
│  │ - commitments   │  │ (skills→jobs)   │                       │
│  │ - energy_logs   │  │                 │                       │
│  │ - retroplans    │  │                 │                       │
│  └─────────────────┘  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OPIK SELF-HOSTED (Docker)                     │
│  - Traces avec 10+ spans/requête                                │
│  - Hybrid evaluation metrics                                     │
│  - Feedback tracking                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🤖 6 Agents Mastra

| Agent | Rôle | Tools |
|-------|------|-------|
| **Budget Coach** | Analyse budget + conseils personnalisés | `analyze_budget`, `generate_advice`, `find_optimizations` |
| **Job Matcher** | Matching compétences → jobs via graph | `match_jobs`, `explain_job_match`, `compare_jobs` |
| **Projection** | Prédictions probabilistes fin d'études | `predict_graduation_balance`, `simulate_scenarios` |
| **Guardian** | Validation hybride (Heuristics + LLM) | `validate_calculation`, `check_risk_level`, `hybrid_evaluation` |
| **Money Maker** | Objets à vendre + side hustles | `analyze_image`, `estimate_price`, `suggest_hustles` |
| **Strategy Comparator** | Cross-évaluation stratégies | `compare_strategies`, `quick_comparison` |

### Tools Goal Mode (Nouveaux)

| Tool | Description |
|------|-------------|
| `transcribe_audio` | Speech-to-text via Groq Whisper (FR/EN) |
| `create_goal_plan` | Créer un plan financier avec milestones |
| `update_goal_progress` | Enregistrer les progrès hebdomadaires |
| `add_academic_event` | Ajouter un événement académique |
| `add_commitment` | Ajouter un engagement récurrent |
| `log_energy` | Enregistrer le check-in énergie/mood |
| `generate_retroplan` | Générer un retroplan capacity-aware |

---

## 🎯 Hybrid Evaluation System

### Pipeline 4 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: HEURISTIC CHECKS (~50ms, déterministe)                │
│  • calculation_validation (CRITICAL) - marge, projection        │
│  • risk_keywords (CRITICAL) - crypto, forex, garanti            │
│  • readability - Flesch-Kincaid grade 8-12                      │
│  • tone - sentiment analysis                                     │
│  • disclaimers - mises en garde                                  │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼ VETO: Calcul faux ou risque critique → REJET
       │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: G-EVAL LLM-AS-JUDGE (~500ms)                          │
│  • Appropriateness (30%) - adapté au budget étudiant?           │
│  • Safety (35%) - pas de conseils dangereux?                    │
│  • Coherence (15%) - logique du raisonnement?                   │
│  • Actionability (20%) - étapes concrètes?                      │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: AGGREGATION                                            │
│  Score = 60% Heuristique + 40% LLM (ajusté par confidence)      │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: OPIK LOGGING - métriques custom par span              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Goal Mode - Algorithme Retroplanning

### Concept: Capacité Variable

L'objectif total reste le même, mais la répartition s'adapte à la vie réelle de l'étudiant.

### Données Prises en Compte

| Source | Impact sur Capacité |
|--------|---------------------|
| **Événements académiques** | Examens = 20%, Vacances = 120% |
| **Engagements récurrents** | Réduction heures disponibles |
| **Historique énergie/mood** | Multiplicateur prédictif |

### Algorithme

```typescript
function calculateWeekCapacity(week, academicEvents, commitments, energyHistory) {
  // Base: 168h/semaine - sommeil - cours - engagements
  const baseHours = 168 - 56 - classHours - commitmentHours - 21;

  // Multiplicateur académique (examens = 0.2, vacances = 1.5)
  const academicMultiplier = getAcademicMultiplier(week, academicEvents);

  // Multiplicateur énergie (basé sur historique)
  const energyMultiplier = predictEnergy(week, energyHistory);

  return baseHours * academicMultiplier * energyMultiplier;
}

function distributeGoal(goalAmount, weekCapacities) {
  const totalCapacity = sum(weekCapacities.map(w => w.capacityScore));
  return weekCapacities.map(week => ({
    adjustedTarget: (week.capacityScore / totalCapacity) * goalAmount
  }));
}
```

### Front-Loading

Stratégie qui déplace les cibles vers les semaines haute-capacité du début pour créer un buffer.

---

## 🗃️ Modèle de Données

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

-- Événements académiques
CREATE TABLE academic_events (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  event_type VARCHAR,  -- 'exam_period', 'vacation', 'internship'
  event_name VARCHAR,
  start_date DATE,
  end_date DATE,
  capacity_impact DECIMAL  -- 0.2 = 80% réduction
);

-- Engagements récurrents
CREATE TABLE commitments (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  commitment_type VARCHAR,  -- 'class', 'sport', 'family'
  commitment_name VARCHAR,
  hours_per_week DECIMAL
);

-- Suivi énergie/mood
CREATE TABLE energy_logs (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  log_date DATE,
  energy_level INTEGER,  -- 1-5
  mood_score INTEGER,    -- 1-5
  stress_level INTEGER   -- 1-5
);

-- Retroplans générés
CREATE TABLE retroplans (
  id VARCHAR PRIMARY KEY,
  goal_id VARCHAR,
  milestones JSONB,
  feasibility_score DECIMAL,
  front_loaded_percentage DECIMAL
);
```

### Graph DuckPGQ (Knowledge Graph)

```sql
-- Nodes: skills, jobs, diplomas, careers, expenses, solutions
-- Edges: enables, requires, pays, leads_to, reduces

-- Exemple: Quel job avec Python?
SELECT j.name, e.weight as match_score, j.properties->>'hourly_rate'
FROM student_edges e
JOIN student_nodes s ON e.source_id = s.id
JOIN student_nodes j ON e.target_id = j.id
WHERE s.id = 'python' AND e.relation_type = 'enables';
```

---

## 🔧 Stack Technique

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

## 📊 Projection Financière

> **Note**: Le système utilise des **formules mathématiques** avec intervalles de confiance, pas du ML au sens strict.

### Calculs Implémentés

```typescript
// Projection fin d'études
function predictGraduationBalance(profile) {
  const monthlyNet = income - expenses + jobIncome;
  const totalMonths = yearsRemaining * 12;
  const finalBalance = monthlyNet * totalMonths;

  // Intervalle de confiance ±20%
  const confidence = 0.78;
  const interval = [finalBalance * 0.8, finalBalance * 1.2];

  // Probabilité sans dette
  const probDebtFree = finalBalance > 0 ? Math.min(0.95, 0.5 + finalBalance/20000) : 0.1;

  return { finalBalance, interval, probDebtFree, confidence };
}
```

---

## 🎬 Scénario Demo

```
Étudiant: "Je suis en L2 Info, j'ai 800€/mois, je veux économiser 500€ pour les vacances"

→ SPAN 1: budget_analysis
  "Revenus: 800€, Dépenses: 750€, Marge: 50€"

→ SPAN 2: goal_feasibility
  "500€ en 8 semaines = 63€/sem, mais examens S4"

→ SPAN 3: retroplan_generation
  "Cibles ajustées: S1-S3: 75€, S4: 15€ (examens), S5-S8: 70€"

→ SPAN 4: strategy_selection
  "Freelance Dev (25€/h) + vente ancien PC (80€)"

→ SPAN 5: guardian_validation
  "OK - calculs vérifiés, pas de risque"

→ OUTPUT:
  - Plan avec 8 milestones adaptés
  - Calendrier visuel avec capacités
  - Stratégies recommandées
  - Achievements à débloquer
  - Lien Opik traces
```

---

## 🏆 Points Clés pour le Jury

| Critère | Notre Réponse |
|---------|---------------|
| **Functionality** | 7 écrans, 6 agents, Goal Mode complet |
| **Real-world** | Cible étudiants = problèmes concrets immédiats |
| **LLM/Agents** | Multi-agents + hybrid evaluation + voice input |
| **Opik** | 10+ spans/requête, métriques custom, feedback |
| **Goal Alignment** | Aide étudiants à gérer budget + atteindre objectifs |

### Différenciateurs

1. **Smart Retroplanning** - Aucune app étudiante n'adapte les objectifs aux examens
2. **Voice Input** - UX moderne avec Whisper
3. **Gamification relative** - Achievements basés sur l'effort vs capacité
4. **Hybrid Evaluation** - Sécurité des conseils financiers
5. **Observabilité** - Traces complètes visibles par l'utilisateur

---

## 📁 Structure du Projet

```
packages/
├── frontend/                 # SolidStart app
│   ├── src/
│   │   ├── routes/
│   │   │   ├── index.tsx           # Onboarding
│   │   │   ├── dashboard.tsx       # Dashboard
│   │   │   ├── chat.tsx            # Chat assistant
│   │   │   ├── goal-mode/
│   │   │   │   ├── setup.tsx       # Définir objectif
│   │   │   │   ├── plan.tsx        # Voir le plan
│   │   │   │   ├── calendar.tsx    # Calendrier retroplan
│   │   │   │   └── track.tsx       # Suivi progression
│   │   │   └── api/
│   │   │       ├── goals.ts        # API objectifs
│   │   │       ├── retroplan.ts    # API retroplanning
│   │   │       └── voice.ts        # API transcription
│   │   └── components/
│   │       ├── VoiceInput.tsx
│   │       ├── GoalProgress.tsx
│   │       ├── MilestoneCard.tsx
│   │       ├── AchievementBadge.tsx
│   │       └── EnergyTracker.tsx
│
└── mcp-server/               # MCP Server
    ├── src/
    │   ├── agents/
    │   │   ├── budget-coach.ts
    │   │   ├── job-matcher.ts
    │   │   ├── projection-ml.ts
    │   │   ├── guardian.ts
    │   │   ├── money-maker.ts
    │   │   └── strategy-comparator.ts
    │   ├── tools/
    │   │   ├── goal.ts             # Tools Goal Mode
    │   │   ├── voice.ts            # Tools Voice
    │   │   └── index.ts            # Registry
    │   ├── workflows/
    │   │   ├── student-analysis.ts
    │   │   └── goal-planning.ts
    │   ├── algorithms/
    │   │   └── retroplanning.ts    # Algorithme capacité
    │   ├── evaluation/
    │   │   ├── heuristics/
    │   │   └── geval/
    │   ├── services/
    │   │   ├── duckdb.ts
    │   │   ├── groq.ts
    │   │   └── opik.ts
    │   └── types/
    │       └── retroplanning.ts
```

---

## ✅ Checklist Implémentation

### Backend
- [x] 6 Agents Mastra configurés
- [x] Hybrid Evaluation System (5 heuristics + G-Eval)
- [x] DuckDB avec tables goals, academic_events, commitments, energy_logs
- [x] DuckPGQ knowledge graph (skills → jobs)
- [x] Workflow student-analysis
- [x] Workflow goal-planning avec retroplanning
- [x] Tools voice (transcribe_audio)
- [x] Tools goal (create_goal_plan, update_progress, etc.)
- [x] Opik integration

### Frontend
- [x] Onboarding avec profil complet
- [x] Dashboard avec métriques, jobs, optimisations
- [x] Chat avec voice input
- [x] Goal Mode - Setup (objectif + événements + engagements)
- [x] Goal Mode - Plan (stratégies + milestones)
- [x] Goal Mode - Calendar (retroplan visuel)
- [x] Goal Mode - Track (progression + energy check-in)
- [x] Composants: VoiceInput, GoalProgress, MilestoneCard, AchievementBadge, EnergyTracker

### Documentation
- [x] PLAN.md (ce fichier)
- [x] SCREENS_AND_EVALS.md (écrans + évaluations)

---

*Document mis à jour - Janvier 2026*
