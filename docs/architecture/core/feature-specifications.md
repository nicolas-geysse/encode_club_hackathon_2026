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

## Architecture

### 18 Agents Mastra

| Agent | ID | Role | Category |
|-------|----|------|----------|
| **Budget Coach** | `budget-coach` | Analyse budget + conseils | Foundation |
| **Job Matcher** | `job-matcher` | Skill Arbitrage + scoring | #2 Skill Arbitrage |
| **Guardian** | `guardian` | Validation (2 layers) | Quality control |
| **Projection ML** | `projection-ml` | Predict graduation balance | Projections |
| **Money Maker** | `money-maker` | Side hustles, item selling | Trade |
| **Strategy Comparator** | `strategy-comparator` | Compare options | Strategy |
| **Onboarding Agent** | `onboarding-agent` | Chat conversationnel profil | Onboarding |
| **Lifestyle Agent** | `lifestyle-agent` | Subscription optimization | Lifestyle |
| **Swipe Orchestrator** | `swipe-orchestrator` | Scenario generation + ranking | #3 Swipe |
| **Daily Briefing** | `daily-briefing` | Daily financial briefing | Tips |
| **Tab Tips Orchestrator** | `tab-tips-orchestrator` | Tab-specific AI tips | Tips |
| **Tips Orchestrator** | `tips-orchestrator` | General tips engine | Tips |
| **Essential Guardian** | `essential-guardian` | Structural alternatives | Guardrail |
| **Ghost Observer** | `ghost-observer` | Rejection pattern detection | Guardrail |
| **Asset Pivot** | `asset-pivot` | Asset monetization | Guardrail |
| **Cash Flow Smoother** | `cashflow-smoother` | Timing mismatch detection | Guardrail |
| **Agent Executor** | `agent-executor` | Agent dispatch coordinator | Infra |
| **Factory** | `factory` | Agent creation from config | Infra |

### 5 Ecrans + 5 Tabs

| # | Ecran | Route | Purpose |
|---|-------|-------|---------|
| 0 | **Onboarding** | `/` | Chat conversationnel profil |
| 1 | **Me** | `/me` | 5 tabs configuration |
| 2 | **Swipe** | `/swipe` | Standalone swipe page |
| 3 | **Progress** | `/progress` | Dashboard unifie |
| 4 | **Settings** | `/settings` | Provider + API keys config |

> Legacy routes `/plan` et `/suivi` redirigent respectivement vers `/me` et `/progress`.

#### 5 Tabs (Me)

| Tab | Component | Contenu |
|-----|-----------|---------|
| Profile | `ProfileTab` | Profil etudiant, skills embarques |
| Goals | `GoalsTab` | Objectifs financiers, composants, academic events |
| Budget | `BudgetTab` | Analyse budget, revenus, depenses |
| Trade | `TradeTab` | Vente d'objets, inventaire |
| Jobs | `ProspectionTab` | Recherche emploi, Google Maps, job listings |

### 2 Couches Evaluation

| Layer | Role | Latence |
|-------|------|---------|
| **Heuristics** (60%) | Checks rapides (risk_keywords, tone, readability, disclaimers, length_quality) | ~50ms |
| **G-Eval LLM** (40%) | LLM-as-Judge (appropriateness 30%, safety 35%, coherence 15%, actionability 20%) | ~500ms |

---

## Algorithmes Killer Features

### #1 Crunch Intelligent (Comeback Mode)

**Concept**: Quand l'energie remonte apres une periode difficile, on detecte cette "fenetre de comeback" et on propose un plan de rattrapage.

```typescript
function detectComebackWindow(energyHistory: number[]): ComebackWindow | null {
  const lowWeeks = energyHistory.filter(e => e < 40);
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
```

### #2 Skill Arbitrage (Multi-Criteria Scoring)

**Concept**: Le job qui paye le plus n'est pas forcement le meilleur. On equilibre 4 criteres.

```typescript
const defaultWeights = {
  rate: 0.30,   // 30%
  demand: 0.25, // 25%
  effort: 0.25, // 25%
  rest: 0.20    // 20%
};
```

### #3 Swipe Scenarios (Preference Learning)

**Concept**: Chaque swipe met a jour les poids de preference de l'utilisateur.

### #4 Energy Debt Gamification

**Concept**: 3 semaines consecutives a basse energie = on reduit automatiquement les cibles et on recompense le self-care.

> **Note: Energy Debt et Comeback Mode sont mutuellement exclusifs.**
> - **Energy Debt** = protection active (energie basse → on reduit les objectifs)
> - **Comeback Mode** = rattrapage actif (energie remonte APRES recuperation)
> - Si l'utilisateur est en Energy Debt, pas de Comeback possible

---

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| **Frontend** | SolidStart + SolidJS + TailwindCSS |
| **Backend** | MCP Server TypeScript (stdio transport) |
| **Orchestration** | Mastra agents (`@mastra/core`) |
| **LLM** | Provider-agnostic via OpenAI SDK (Mistral, Groq, Gemini, OpenAI...) |
| **Default LLM** | Mistral (`ministral-3b-2512`) ou Groq (`llama-3.1-8b-instant`) |
| **Voice** | Groq Whisper (`whisper-large-v3-turbo`) ou Mistral Voxtral |
| **Storage** | DuckDB + DuckPGQ |
| **Tracing** | Opik Cloud |

---

## Structure du Projet

```
packages/
├── frontend/                      # SolidStart app
│   └── src/
│       ├── routes/
│       │   ├── index.tsx          # Onboarding (chat conversationnel)
│       │   ├── me.tsx             # Dashboard (5 tabs)
│       │   ├── swipe.tsx          # Standalone swipe page
│       │   ├── progress.tsx       # Progress dashboard
│       │   ├── settings.tsx       # Provider settings
│       │   ├── plan.tsx           # Redirect → /me
│       │   ├── suivi.tsx          # Redirect → /progress
│       │   └── api/               # 45 API endpoints
│       │       ├── chat.ts        # Chat engine (3,564 lines)
│       │       ├── goals.ts, profiles.ts, retroplan.ts...
│       │       ├── budget/, opik/, profiles/, settings/
│       │       └── ...
│       ├── components/
│       │   ├── chat/              # OnboardingChat, ChatInput, ChatMessage...
│       │   ├── tabs/              # ProfileTab, GoalsTab, BudgetTab, TradeTab, ProspectionTab
│       │   ├── suivi/             # TimelineHero, EnergyHistory, MissionList... (15 files)
│       │   ├── swipe/             # SwipeCard, SwipeSession, RollDice
│       │   ├── ui/                # Base primitives (20+ components)
│       │   └── layout/, analytics/, debug/, onboarding/, prospection/
│       └── lib/
│           ├── chat/              # Modular chat system (33 files)
│           ├── llm/               # Provider-agnostic LLM client
│           └── ...                # 95 total lib files
│
└── mcp-server/                    # MCP Server
    └── src/
        ├── agents/                # 18 agents + strategies + guardrails (31 files)
        ├── tools/                 # MCP tool implementations
        ├── workflows/             # Mastra workflows
        ├── algorithms/            # Core algorithms
        │   ├── retroplanning.ts
        │   ├── skill-arbitrage.ts
        │   ├── comeback-detection.ts
        │   └── energy-debt.ts
        ├── evaluation/            # Hybrid eval (heuristics + G-Eval)
        └── services/              # DuckDB, LLM, Opik, Whisper
```

---

## Checklist Implementation

### 4 Killer Features

- [x] **#1 Crunch Intelligent** - Comeback window detection, catch-up plan generation, achievements
- [x] **#2 Skill Arbitrage** - Multi-criteria scoring, graph matching (DuckPGQ), UI visualization
- [x] **#3 Swipe Scenarios** - SwipeCard with animations, preference learning, reranking
- [x] **#4 Energy Debt Gamification** - Detection, target reduction, self-care achievements

### Frontend

- [x] **Screen 0: Onboarding** (`/`) - OnboardingChat, voix, questions progressives, Bruno avatar
- [x] **Screen 1: Me** (`/me`) - 5 tabs (Profile, Goals, Budget, Trade, Jobs)
- [x] **Screen 2: Swipe** (`/swipe`) - Standalone swipe page
- [x] **Screen 3: Progress** (`/progress`) - Timeline, retroplan, energy, missions, achievements
- [x] **Screen 4: Settings** (`/settings`) - Provider switching, API keys, status indicators

### Backend

- [x] 18 Agents Mastra (including 4 guardrails, orchestrators, and infra agents)
- [x] Hybrid Evaluation System (Heuristics 60% + G-Eval 40%)
- [x] DuckDB shared database (frontend + MCP, profile_id standardized)
- [x] DuckPGQ knowledge graph
- [x] 45 API endpoints
- [x] Opik tracing with prompt versioning
- [x] Provider-agnostic LLM (runtime switching via /settings)

### Core Algorithms (MCP Server)

- [x] `algorithms/retroplanning.ts` - Capacity-aware retroplanning
- [x] `algorithms/skill-arbitrage.ts` - 4-criteria scoring (rate/demand/effort/rest)
- [x] `algorithms/energy-debt.ts` - Consecutive week detection, severity levels
- [x] `algorithms/comeback-detection.ts` - Recovery window detection, catch-up plans

---

*Document mis a jour - 8 Fevrier 2026*
