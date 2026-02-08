# Stride - Screens & Evaluation

> 5 screens, 18 agents, 5 tabs, 4 killer features

---

## 4 Killer Features

| # | Feature | Location | Description |
|---|---------|----------|-------------|
| 1 | **Crunch Intelligent** | Progress (Retroplan) | Detects comeback windows, creates catch-up plans |
| 2 | **Skill Arbitrage** | Me (Tab Jobs/Profile) | Multi-criteria job matching (not just max pay) |
| 3 | **Swipe Scenarios** | Swipe (standalone page) | Tinder-like strategy selection |
| 4 | **Energy Debt** | Progress (Energy History) | Rewards self-care, reduces targets when exhausted |

---

## 5 Screens

### Screen 0: Onboarding

```
+---------------------------------------------------------------------+
|  Stride                                                              |
+---------------------------------------------------------------------+
|                                                                      |
|  +-----------------------------------------------------------------+ |
|  |  [PlasmaAvatar - Bruno]                                        | |
|  |                                                                  | |
|  |  "Salut! Je suis Bruno, ton coach financier.                   | |
|  |   Dis-moi un peu sur toi pour qu'on puisse                     | |
|  |   construire ton plan ensemble!"                                | |
|  +-----------------------------------------------------------------+ |
|                                                                      |
|  +-----------------------------------------------------------------+ |
|  |  [User Message]                                                 | |
|  |  "Je suis en L2 Info, j'aimerais economiser pour               | |
|  |   mes vacances cet ete..."                                      | |
|  +-----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------+ +-------+ +------+ |
|  | Tape ton message...                          | | [Mic] | | [->] | |
|  +----------------------------------------------+ +-------+ +------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Route:** `/`
**File:** `routes/index.tsx`

**Features:**
- Chat conversationnel (texte + voix)
- Questions progressives via flowController (objectif, skills, budget, contraintes)
- PlasmaAvatar (Bruno) avec personnalite bienveillante
- Hybrid extraction (regex + LLM) pour parsing des reponses
- Storage profil → navigation vers Me
- Opik traces: `chat.onboarding`, `chat.extraction`, `chat.generation`

---

### Screen 1: Me (5 Tabs)

```
+---------------------------------------------------------------------+
|  Me                                                       [Progress] |
+---------------------------------------------------------------------+
|                                                                      |
|  +---------+ +-------+ +--------+ +-------+ +------+                |
|  | Profile | | Goals | | Budget | | Trade | | Jobs |                |
|  +---------+ +-------+ +--------+ +-------+ +------+                |
|                                                                      |
|  [Content depends on selected tab - see below]                      |
|                                                                      |
+---------------------------------------------------------------------+
```

**Route:** `/me`
**File:** `routes/me.tsx`

> Legacy route `/plan` redirects to `/me` (backward compatibility).

---

#### Tab 1: Profile

**Component:** `ProfileTab.tsx` (+ embedded `SkillsTab.tsx`)

**Features:**
- Profil etudiant (nom, ville, situation)
- Skills avec ratings et certification
- Income sources
- Embedded skill management

---

#### Tab 2: Goals

**Component:** `GoalsTab.tsx` (+ 8 sub-components in `tabs/goals/`)

**Features:**
- Objectifs financiers (nom, montant, deadline)
- Goal components (sous-objectifs)
- Academic events (exams, vacances, stages)
- Commitments recurrents (cours, sport)
- Goal presets (templates predefinies)
- Active goal dashboard with metrics

---

#### Tab 3: Budget

**Component:** `BudgetTab.tsx`

**Features:**
- Analyse budget (revenus vs depenses)
- Budget insights via AI (LLM)
- Visualisation

---

#### Tab 4: Trade

**Component:** `TradeTab.tsx`

**Features:**
- Inventaire d'objets a vendre avec estimation de prix
- Suggestions de plateformes (Leboncoin, Vinted, Ebay)
- Leads management

---

#### Tab 5: Jobs (Prospection)

**Component:** `ProspectionTab.tsx`

**Features:**
- Recherche emploi via Google Maps (Places API)
- Calcul temps de trajet (Distance Matrix API)
- Job listings cache avec filtres
- Skill Arbitrage scoring integration

---

### Screen 2: Swipe (Standalone Page)

```
+---------------------------------------------------------------------+
|  Swipe - Choisis tes strategies!                                     |
+---------------------------------------------------------------------+
|                                                                      |
|           +-------------------------------------------+              |
|           |                                           |              |
|           |           [Freelance Dev]                 |              |
|           |             +120e/mois                    |              |
|           |                                           |              |
|           |  Taux: 25e/h                              |              |
|           |  Effort: [***] Haut                       |              |
|           |  Temps: 10h/semaine                       |              |
|           |  Match skills: Python                     |              |
|           |                                           |              |
|           |    [NOPE]              [YES]              |              |
|           |                                           |              |
|           +-------------------------------------------+              |
|                                                                      |
|                        Scenario 1/4                                  |
|                                                                      |
+---------------------------------------------------------------------+
```

**Route:** `/swipe`
**File:** `routes/swipe.tsx`

**Features:**
- SwipeCard component with HoloCard CSS animations
- SwipeSession for scenario management
- Preference learning after each swipe
- Opik traces: `swipe_session`, `swipe_decision`, `preference_learning`

---

### Screen 3: Progress

```
+---------------------------------------------------------------------+
|  Progress                                                    [Me]    |
+---------------------------------------------------------------------+
|                                                                      |
|  [TimelineHero] - Semaine 5/8, double barre temps/charge            |
|  [FinancialSummary] - Vue d'ensemble financiere                     |
|  [CapacityForecast] - Prevision de capacite                         |
|  [ComebackAlert] - Alerte rattrapage si detecte                     |
|  [EnergyHistory] + [EnergyChart] - Historique energie               |
|  [MissionList] + [MissionCard] - Missions du swipe                  |
|  [CompletedGoalsSummary] - Objectifs atteints                       |
|  [SavingsAdjustModal] - Ajustement epargne                          |
|  [LogProgressDialog] - Log de progression                           |
|  [PredictiveAlerts] - Alertes predictives                           |
|  [BrunoTips] - Conseils Bruno contextualises                        |
|                                                                      |
+---------------------------------------------------------------------+
```

**Route:** `/progress`
**File:** `routes/progress.tsx`

> Legacy route `/suivi` redirects to `/progress` (backward compatibility).

**Features:**
- **TimelineHero**: Double barre (temps restant + charge de travail)
- **FinancialSummary**: Vue d'ensemble des finances
- **CapacityForecast**: Prevision de la capacite hebdomadaire
- **ComebackAlert**: Detection comeback + plan de rattrapage
- **EnergyHistory** + **EnergyChart**: Historique energie avec detection recovery
- **MissionList**: Valider ou supprimer les missions acceptees
- **CompletedGoalsSummary**: Historique des objectifs termines
- **PredictiveAlerts**: Alertes predictives basees sur les tendances
- **BrunoTips**: Conseils AI contextualises par tab
- Opik traces: `timeline_updated`, `comeback_detected`, `energy_debt_check`, `mission_validated`

---

### Screen 4: Settings

**Route:** `/settings`
**File:** `routes/settings.tsx`

**Features:**
- Provider dropdowns for LLM (Mistral, Groq, Gemini) and STT (Groq Whisper, Voxtral)
- API key fields with show/hide toggles
- Server status indicators (green/yellow/red)
- Apply settings → saves to localStorage + pushes to server via POST /api/settings/apply

---

## Features Summary by Screen/Tab

| Feature | Screen/Tab | Opik Traces |
|---------|------------|-------------|
| **Onboarding Chat** | Screen 0 (/) | `chat.onboarding`, `chat.extraction` |
| **Profile Setup** | Tab Profile | `profiles.*` |
| **Goal Management** | Tab Goals | `goals.*` |
| **Budget Analysis** | Tab Budget | `budget.insights` |
| **Trade/Sell Items** | Tab Trade | `trades.*`, `inventory.*` |
| **Job Search** | Tab Jobs | `prospection.*`, `job-listings.*` |
| **Swipe Scenarios** | Screen 2 (/swipe) | `swipe_session`, `swipe_decision` |
| **Timeline Hero** | Screen 3 (/progress) | `timeline_updated` |
| **Comeback Mode** | Screen 3 (/progress) | `comeback_detected`, `catchup_plan` |
| **Energy Debt** | Screen 3 (/progress) | `energy_debt_check`, `target_reduced` |
| **Mission Validation** | Screen 3 (/progress) | `mission_validated` |
| **Provider Settings** | Screen 4 (/settings) | N/A |

> **Note: Energy Debt et Comeback Mode sont mutuellement exclusifs.**
> - **Energy Debt** = mode protectif (energie basse persistante → reduction cible)
> - **Comeback Mode** = mode offensif (energie remonte APRES recuperation → rattrapage)

---

## UI Components

### Chat Components (`components/chat/`)

| Component | File | Description |
|-----------|------|-------------|
| **OnboardingChat** | `OnboardingChat.tsx` | Chat conversationnel avec PlasmaAvatar Bruno |
| **ChatInput** | `ChatInput.tsx` | Input reutilisable (texte + mic) |
| **ChatMessage** | `ChatMessage.tsx` | Bulle de message avec feedback thumbs |
| **PlasmaAvatar** | `PlasmaAvatar.tsx` | Avatar anime de Bruno |
| **MCPUIRenderer** | `MCPUIRenderer.tsx` | Rendu des composants UI generes par le chat |
| **OnboardingFormStep** | `OnboardingFormStep.tsx` | Formulaire d'etape onboarding |
| **OnboardingFormStepWrapper** | `OnboardingFormStepWrapper.tsx` | Wrapper formulaire onboarding |
| **OnboardingProgress** | `OnboardingProgress.tsx` | Barre de progression onboarding |
| **OnboardingTips** | `OnboardingTips.tsx` | Tips contextuels pendant onboarding |
| **SkillMultiSelect** | `SkillMultiSelect.tsx` | Selection multiple de skills |
| **GridMultiSelect** | `GridMultiSelect.tsx` | Selection multiple en grille |
| **ConfirmChangeButtons** | `ConfirmChangeButtons.tsx` | Boutons de confirmation de changements |
| **MapPicker** | `MapPicker.tsx` | Selecteur de localisation |

### Suivi Components (`components/suivi/`)

| Component | File | Description |
|-----------|------|-------------|
| **TimelineHero** | `TimelineHero.tsx` | Double timeline avec character |
| **EnergyHistory** | `EnergyHistory.tsx` | Barres energie + recovery |
| **EnergyChart** | `EnergyChart.tsx` | Graphique Chart.js de l'energie |
| **MissionList** | `MissionList.tsx` | Liste missions avec valider/supprimer |
| **MissionCard** | `MissionCard.tsx` | Carte mission individuelle |
| **ComebackAlert** | `ComebackAlert.tsx` | Alerte mode comeback |
| **BrunoTips** | `BrunoTips.tsx` | Conseils Bruno contextualises |
| **FinancialSummary** | `FinancialSummary.tsx` | Resume financier |
| **CapacityForecast** | `CapacityForecast.tsx` | Prevision de capacite |
| **PredictiveAlerts** | `PredictiveAlerts.tsx` | Alertes predictives |
| **CompletedGoalsSummary** | `CompletedGoalsSummary.tsx` | Resume objectifs termines |
| **CompletedGoalCard** | `CompletedGoalCard.tsx` | Carte objectif termine |
| **CompletedGoalDetailModal** | `CompletedGoalDetailModal.tsx` | Detail objectif termine |
| **SavingsAdjustModal** | `SavingsAdjustModal.tsx` | Modal ajustement epargne |
| **LogProgressDialog** | `LogProgressDialog.tsx` | Dialog log de progression |

### Swipe Components (`components/swipe/`)

| Component | File | Description |
|-----------|------|-------------|
| **SwipeCard** | `SwipeCard.tsx` | Carte Tinder-like avec actions |
| **SwipeSession** | `SwipeSession.tsx` | Session de swipe (gestion scenarios) |
| **RollDice** | `RollDice.tsx` | Bouton compilation + generation |
| **HoloCard** | `HoloCard.tsx` + `.css` | Carte holographique animee |

### Tab Components (`components/tabs/`)

| Component | File | Description |
|-----------|------|-------------|
| **ProfileTab** | `ProfileTab.tsx` | Profil etudiant + skills |
| **GoalsTab** | `GoalsTab.tsx` | Gestion objectifs (+ 8 sous-composants dans `goals/`) |
| **BudgetTab** | `BudgetTab.tsx` | Analyse budget |
| **TradeTab** | `TradeTab.tsx` | Vente d'objets |
| **ProspectionTab** | `ProspectionTab.tsx` | Recherche emploi |
| **SkillsTab** | `SkillsTab.tsx` | Gestion skills (embedded dans ProfileTab) |
| **SwipeTab** | `SwipeTab.tsx` | Composant swipe (utilise en embed) |

### Other Components

| Component | File | Description |
|-----------|------|-------------|
| **AchievementBadge** | `AchievementBadge.tsx` | Badge gamification (locked/unlocked) |
| **VoiceInput** | `VoiceInput.tsx` | Mic button avec transcription |
| **RetroplanPanel** | `RetroplanPanel.tsx` | Visualisation semaines + comeback |

---

## 2-Layer Evaluation

```
+---------------------------------------------------------------------+
|  LAYER 1: HEURISTICS (60% weight, ~50ms)                            |
|  - risk_keywords (30%) - dangerous advice detection                  |
|  - tone (20%) - balanced sentiment                                   |
|  - readability (15%) - Flesch-Kincaid adapted for French             |
|  - disclaimers (15%) - appropriate warnings when risk detected       |
|  - length_quality (20%) - response length and structure              |
+---------------------------------------------------------------------+
       |
       v VETO: Critical risk keywords -> AUTO-REJECT
       |
+---------------------------------------------------------------------+
|  LAYER 2: G-EVAL LLM-AS-JUDGE (40% weight, ~500ms)                  |
|  - Appropriateness (30%) - fits student budget?                     |
|  - Safety (35%) - no dangerous advice?                              |
|  - Coherence (15%) - logical reasoning?                             |
|  - Actionability (20%) - concrete steps?                            |
+---------------------------------------------------------------------+
       |
       v
+---------------------------------------------------------------------+
|  AGGREGATION: Score = 60% Heuristic + 40% LLM                       |
+---------------------------------------------------------------------+
       |
       v
+---------------------------------------------------------------------+
|  OPIK MONITORING - feedback scores logged per trace                  |
+---------------------------------------------------------------------+
```

---

## API Endpoints (45 files)

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Handle all chat interactions (onboarding + conversation) |
| `/api/goals` | GET/POST | Goal CRUD + embedding |
| `/api/profiles` | GET/POST | Profile CRUD + migration |
| `/api/retroplan` | POST | Retroplanning engine (events, commitments, energy, comeback) |
| `/api/voice` | POST | Transcribe audio (Whisper/Voxtral) |
| `/api/budget` | GET/POST | Budget analysis + insights |
| `/api/skills` | GET/POST | Skills CRUD |
| `/api/lifestyle` | GET/POST | Lifestyle items CRUD |
| `/api/inventory` | GET/POST | Inventory items CRUD |
| `/api/trades` | GET/POST | Trade opportunities CRUD |
| `/api/income` | GET/POST | Income sources CRUD |
| `/api/agent` | POST | Mastra agent proxy |

### Feature Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tab-tips` | POST | Tab-specific AI tips |
| `/api/tips` | POST | General tips engine |
| `/api/daily-briefing` | GET | Daily financial briefing |
| `/api/comeback-detection` | POST | Comeback mode detection |
| `/api/energy-debt` | POST | Energy debt detection |
| `/api/energy-logs` | GET/POST | Energy tracking |
| `/api/swipe-trace` | POST | Swipe decision tracing |
| `/api/prospection` | POST | Job search (Google Maps) |
| `/api/job-listings` | GET/POST | Job listing cache |
| `/api/analytics` | POST | Analytics tracking |
| `/api/simulation` | POST | Time simulation |

### Observability Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/opik/benchmark` | GET/POST | Safety benchmark (43 test cases) |
| `/api/opik/metrics` | GET | Opik metrics dashboard |

### Settings Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings/apply` | POST | Apply runtime settings (LLM/STT provider) |
| `/api/settings/status` | GET | Server status check |

### Utility Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat-history` | GET/POST | Chat history management |
| `/api/feedback` | POST | User feedback logging |
| `/api/suggestion-feedback` | POST | Suggestion feedback |
| `/api/exclusions` | GET/POST | Exclusion management |
| `/api/leads` | GET/POST | Leads management |
| `/api/goal-components` | GET/POST | Goal component CRUD |
| `/api/rag` | POST | RAG context fetch |
| `/api/embed` | POST | Embedding generation |
| `/api/reset` | POST | Full reset |
| `/api/debug-state` | GET | Debug state inspection |
| `/api/profiles/duplicate` | POST | Profile duplication |
| `/api/profiles/import` | POST | Profile import |
| `/api/profiles/reset` | POST | Profile reset |

---

## DuckDB Schema

> See [database-guide.md](./database-guide.md) for complete schema details.

### Core Tables
- `profiles` - Profils utilisateur (uses `profile_id`, NOT `user_id`)
- `goals` - Objectifs financiers (columns: `name`, `amount`, `deadline`, NOT `goal_name`...)
- `skills` - Competences utilisateur
- `inventory_items` - Objets a vendre
- `energy_logs` - Suivi energie
- `academic_events` - Evenements academiques
- `commitments` - Engagements recurrents
- `retroplans` - Plans generes
- `simulation_state` - Simulation temporelle

### Knowledge Graph Tables
- `student_nodes` - Noeuds (skills, jobs, strategies)
- `student_edges` - Relations (enables, requires, co_benefit)

---

## Observability

See [opik-guide.md](./opik-guide.md) for full Opik integration details.

---

*Document updated - February 2026*
