# Stride - Screens & Evaluation

> 3 screens, 4 agents, 6 tabs, 4 killer features

---

## 4 Killer Features

| # | Feature | Location | Description |
|---|---------|----------|-------------|
| 1 | **Crunch Intelligent** | Suivi (Retroplan) | Detects comeback windows, creates catch-up plans |
| 2 | **Skill Arbitrage** | Mon Plan (Tab Skills) | Multi-criteria job matching (not just max pay) |
| 3 | **Swipe Scenarios** | Mon Plan (Tab Swipe) | Tinder-like strategy selection after Roll the Dice |
| 4 | **Energy Debt** | Suivi (Energy History) | Rewards self-care, reduces targets when exhausted |

---

## 3 Screens

### Screen 0: Onboarding

```
+---------------------------------------------------------------------+
|  Stride                                                              |
+---------------------------------------------------------------------+
|                                                                      |
|  +-----------------------------------------------------------------+ |
|  |  [Character Avatar - Bruno]                                     | |
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
|  +-----------------------------------------------------------------+ |
|  |  [Bruno]                                                        | |
|  |  "Super objectif! C'est combien ton budget vacances?           | |
|  |   Et tu as une date limite en tete?"                           | |
|  +-----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------+ +-------+ +------+ |
|  | Tape ton message...                          | | [Mic] | | [->] | |
|  +----------------------------------------------+ +-------+ +------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Route:** `/`
**File:** `pages/index.tsx`

**Features:**
- Chat conversationnel (texte + voix)
- Questions progressives (objectif, skills, budget, contraintes)
- Character avatar (Bruno) avec personnalite bienveillante
- Storage profil → navigation vers Mon Plan
- Opik traces: `onboarding_chat`, `question_1_objective`, `question_2_skills`, `question_3_budget`

---

### Screen 1: Mon Plan (6 Tabs)

```
+---------------------------------------------------------------------+
|  Mon Plan                                                   [Suivi] |
+---------------------------------------------------------------------+
|                                                                      |
|  +--------+ +--------+ +----------+ +-----------+ +-------+ +------+ |
|  | Setup  | | Skills | | A Vendre | | Lifestyle | | Trade | | Swipe| |
|  +--------+ +--------+ +----------+ +-----------+ +-------+ +------+ |
|                                                                      |
|  [Content depends on selected tab - see below]                      |
|                                                                      |
+---------------------------------------------------------------------+
```

**Route:** `/plan`
**File:** `pages/plan.tsx`

---

#### Tab 1: Setup

```
+---------------------------------------------------------------------+
|  Setup - Ton Objectif                                                |
+---------------------------------------------------------------------+
|                                                                      |
|  Objectif:  [Vacances ete_________________]                         |
|  Montant:   [500] euros                                              |
|  Deadline:  [15/08/2026]                                             |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | EVENEMENTS ACADEMIQUES                                    [+]  | |
|  +----------------------------------------------------------------+ |
|  | [Examens partiels]     | 15/01 - 25/01 | [X]                   | |
|  | [Vacances fevrier]     | 15/02 - 01/03 | [X]                   | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | ENGAGEMENTS RECURRENTS                                    [+]  | |
|  +----------------------------------------------------------------+ |
|  | [Cours]                | 20h/sem       | [X]                   | |
|  | [Sport]                | 4h/sem        | [X]                   | |
|  +----------------------------------------------------------------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Features:**
- Objectif (nom, montant, deadline)
- Evenements academiques (exams, vacances, stages)
- Engagements recurrents (cours, sport, famille)
- Opik traces: `tab_setup`, `goal_defined`, `events_added`

---

#### Tab 2: Skills (Killer #2 - Skill Arbitrage)

```
+---------------------------------------------------------------------+
|  Skills - Skill Arbitrage                                            |
+---------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | MULTI-CRITERIA SCORING                                         | |
|  |                                                                 | |
|  | Job             | Rate  | Demand | Effort | Score              | |
|  | ----------------|-------|--------|--------|------------------- | |
|  | Python Dev      | 25e   | *****  | High   | 6.2/10             | |
|  | SQL Coaching    | 22e   | ****   | Medium | 8.7/10  [Best]     | |
|  | Data Entry      | 12e   | ****   | Low    | 7.1/10             | |
|  |                                                                 | |
|  | Recommendation: SQL Coaching (best balance)                    | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | AJOUTER UNE COMPETENCE                                         | |
|  +----------------------------------------------------------------+ |
|  | [Bruno Avatar]                                                  | |
|  | "Tu as d'autres skills? Design, langues, musique?"             | |
|  |                                                                 | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  | | J'ai aussi des bases en Figma...         | [Mic] | [Envoyer]| | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  +----------------------------------------------------------------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Features:**
- Multi-criteria job scoring table
- Chat pour ajouter des competences (addSkillChat)
- Recommendation intelligente
- Opik traces: `tab_skills`, `skill_added`, `score_calculation`

---

#### Tab 3: A Vendre (Inventory)

```
+---------------------------------------------------------------------+
|  A Vendre - Ton Inventaire                                           |
+---------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | OBJETS A VENDRE                                                | |
|  +----------------------------------------------------------------+ |
|  | [Vieux velo]           | ~80e  | Leboncoin  | [X]              | |
|  | [Manuels L1]           | ~45e  | Vinted     | [X]              | |
|  | [Console retro]        | ~120e | Ebay       | [X]              | |
|  |                                                     Total: 245e | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | AJOUTER UN OBJET                                               | |
|  +----------------------------------------------------------------+ |
|  | [Bruno Avatar]                                                  | |
|  | "Tu as des trucs qui trainent? Livres, vetements, tech?"       | |
|  |                                                                 | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  | | J'ai une vieille guitare...              | [Mic] | [Envoyer]| | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  +----------------------------------------------------------------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Features:**
- Liste des objets a vendre avec estimation
- Chat pour ajouter des objets (addItemChat)
- Suggestions de plateformes (Leboncoin, Vinted, Ebay)
- Opik traces: `tab_inventory`, `item_added_via_chat`, `price_estimation`

---

#### Tab 4: Lifestyle

```
+---------------------------------------------------------------------+
|  Lifestyle - Optimise ton quotidien                                  |
+---------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | LOGEMENT                                                       | |
|  +----------------------------------------------------------------+ |
|  | Loyer actuel: 450e/mois                                        | |
|  | Suggestion: Colocation (-150e)                       [Explore] | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | ALIMENTATION                                                   | |
|  +----------------------------------------------------------------+ |
|  | Budget actuel: 200e/mois                                       | |
|  | Suggestions: Batch cooking, Too Good To Go          [Explore] | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | ABONNEMENTS                                                    | |
|  +----------------------------------------------------------------+ |
|  | Netflix: 13e  [Partage?]                                       | |
|  | Spotify: 10e  [Etudiant?]                                      | |
|  | Salle sport: 35e  [SUAPS?]                                     | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | CHAT LIFESTYLE                                                 | |
|  +----------------------------------------------------------------+ |
|  | [Bruno Avatar]                                                  | |
|  | "Des depenses recurrentes qu'on pourrait optimiser?"           | |
|  |                                                                 | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  | | Je paye 50e de transport par mois...     | [Mic] | [Envoyer]| | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  +----------------------------------------------------------------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Features:**
- Analyse des depenses recurrentes (logement, food, transport, abonnements)
- Suggestions d'optimisation
- Chat pour ajouter des depenses (addLifestyleChat)
- Opik traces: `tab_lifestyle`, `lifestyle_item_added`, `lifestyle_savings`

---

#### Tab 5: Trade

```
+---------------------------------------------------------------------+
|  Trade - Emprunter / Troquer                                         |
+---------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | BESOINS TEMPORAIRES                                            | |
|  +----------------------------------------------------------------+ |
|  | [Perceuse]             | 1 weekend    | [Match trouve!]       | |
|  | [Velo cargo]           | 2 semaines   | [Recherche...]        | |
|  | [Appareil photo]       | 1 jour       | [3 offres]            | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | MES OBJETS A PRETER                                            | |
|  +----------------------------------------------------------------+ |
|  | [Tente camping]        | Dispo        | [2 demandes]          | |
|  | [Outils jardinage]     | Dispo        | [0 demandes]          | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | CHAT TRADE                                                     | |
|  +----------------------------------------------------------------+ |
|  | [Bruno Avatar]                                                  | |
|  | "Besoin d'emprunter quelque chose? Ou tu veux proposer?"       | |
|  |                                                                 | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  | | Je cherche un projecteur pour ce weekend | [Mic] | [Envoyer]| | |
|  | +------------------------------------------+ +-----+ +--------+ | |
|  +----------------------------------------------------------------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Features:**
- Liste des besoins temporaires (emprunter)
- Liste des objets a preter (troquer)
- Matching avec autres utilisateurs
- Chat pour ajouter des besoins (addTradeChat)
- Opik traces: `tab_trade`, `trade_need_added`, `trade_match_found`, `trade_savings`

---

#### Tab 6: Swipe (Roll the Dice + Swipe Scenarios)

```
+---------------------------------------------------------------------+
|  Swipe - Tes Strategies                                              |
+---------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | RESUME DE TES CHOIX                                            | |
|  +----------------------------------------------------------------+ |
|  | Skills: Python, SQL, Figma                          [3 items]  | |
|  | A Vendre: Velo, Manuels, Console                    [245e]     | |
|  | Lifestyle: Transport, Abonnements                   [-95e/mois]| |
|  | Trade: Perceuse, Appareil photo                     [2 items]  | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  |                                                                 | |
|  |           +-----------------------------------+                 | |
|  |           |                                   |                 | |
|  |           |  [ROLL THE DICE]                  |                 | |
|  |           |                                   |                 | |
|  |           |  Compiler mes choix et            |                 | |
|  |           |  generer des scenarios            |                 | |
|  |           |                                   |                 | |
|  |           +-----------------------------------+                 | |
|  |                                                                 | |
|  +----------------------------------------------------------------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**After Roll the Dice (tabs freeze, swipe begins):**

```
+---------------------------------------------------------------------+
|  Swipe - Choisis tes missions!                                       |
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

**Features:**
- Resume des choix (skills, items, lifestyle, trade)
- Bouton Roll the Dice (compile scenarios + freeze autres tabs)
- Swipe Cards avec details (taux, effort, temps, match)
- Preference learning apres chaque swipe
- Opik traces: `tab_swipe`, `roll_the_dice`, `scenarios_compiled`, `tabs_frozen`, `swipe_decision`, `preference_learning`

---

### Screen 2: Suivi

```
+---------------------------------------------------------------------+
|  Suivi                                                      [Plan]  |
+---------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | TIMELINE HERO                                                  | |
|  +----------------------------------------------------------------+ |
|  |                                                                 | |
|  |  [Character]  Semaine 5/8 - Tu es sur la bonne voie!          | |
|  |                                                                 | |
|  |  Temps restant:                                                | |
|  |  [========================================------] 62%           | |
|  |  |     S1   S2   S3   S4   S5   S6   S7   S8  |                | |
|  |                       ^                                         | |
|  |                    Aujourd'hui                                  | |
|  |                                                                 | |
|  |  Charge de travail:                                            | |
|  |  [=====------------------------------] 15% (periode calme)     | |
|  |                                                                 | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | RETROPLAN                                          [COMEBACK]  | |
|  +----------------------------------------------------------------+ |
|  | [S1: 75€ ✓] → [S2: 150€ ✓] → [S3: 200€ ✓] → [S4: 215€] → [S5]  | |
|  |  Cumul progressif: 75 → 150 → 200 → 215€                       | |
|  |  Target: 500€ | Restant: 285€                                  | |
|  |  🟢 ahead | 🟡 on track | 🔴 behind                            | |
|  |                                                                 | |
|  | Alerte: Semaine 4 manquee - Plan de rattrapage active!        | |
|  | S5: +20e | S6: +15e | S7: +13e = 48e a recuperer              | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | ENERGY HISTORY                                                 | |
|  +----------------------------------------------------------------+ |
|  | S1: [====------] 35%   S2: [===-------] 30%                   | |
|  | S3: [===-------] 32%   S4: [======----] 65% <- recovering!    | |
|  |                                                                 | |
|  | Recovery mode active - Objectif reduit cette semaine          | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | MISSIONS DU SWIPE                                              | |
|  +----------------------------------------------------------------+ |
|  | Progression: [████████░░░░] 2/6 missions = +132€ sur 500€     | |
|  |                                                                 | |
|  | [SQL Coaching - 6h]        22e/h    [Valider] [Supprimer]     | |
|  | [Vendre velo]              ~80e     [Valider] [Supprimer]     | |
|  | [Batch cooking]            -40e/mois [Valider] [Supprimer]    | |
|  +----------------------------------------------------------------+ |
|                                                                      |
|  +----------------------------------------------------------------+ |
|  | ACHIEVEMENTS                                                   | |
|  +----------------------------------------------------------------+ |
|  | [First Euro] [Comeback King] [Self Care] [Week Complete] [...] | |
|  +----------------------------------------------------------------+ |
|                                                                      |
+---------------------------------------------------------------------+
```

**Route:** `/suivi`
**File:** `pages/suivi.tsx`

**Features:**
- **Timeline Hero**: Double barre (temps restant + charge de travail)
- **Retroplan**: Visualisation semaines avec Comeback Alert
- **Energy History**: Historique energie avec detection recovery
- **Missions du Swipe**: Valider ou supprimer les missions acceptees
- **Achievements**: Badges gamification
- Opik traces: `timeline_updated`, `comeback_detected`, `energy_debt_check`, `mission_validated`, `mission_deleted`, `achievement_unlocked`

---

## Features Summary by Screen/Tab

| Feature | Screen/Tab | Chat | Opik Traces |
|---------|------------|------|-------------|
| **Onboarding Chat** | Screen 0 | Conversationnel | `onboarding_chat`, `profile_created` |
| **Goal Setup** | Tab Setup | - | `goal_defined`, `events_added` |
| **Skill Arbitrage** | Tab Skills | addSkillChat | `skill_added`, `score_calculation` |
| **Inventory** | Tab A Vendre | addItemChat | `item_added_via_chat`, `price_estimation` |
| **Lifestyle** | Tab Lifestyle | addLifestyleChat | `lifestyle_item_added`, `lifestyle_savings` |
| **Trade** | Tab Trade | addTradeChat | `trade_need_added`, `trade_match_found` |
| **Roll the Dice** | Tab Swipe | - | `scenarios_compiled`, `tabs_frozen` |
| **Swipe Scenarios** | Tab Swipe | - | `swipe_decision`, `preference_learning` |
| **Timeline Hero** | Suivi | - | `timeline_updated` |
| **Comeback Mode** | Suivi | - | `comeback_detected`, `catchup_plan` |
| **Energy Debt** | Suivi | - | `energy_debt_check`, `target_reduced` |
| **Mission Validation** | Suivi | - | `mission_validated`, `mission_deleted` |
| **Achievements** | Suivi | - | `achievement_unlocked` |

> **Note: Energy Debt et Comeback Mode sont mutuellement exclusifs.**
> - **Energy Debt** = mode protectif (énergie basse persistante → réduction cible)
> - **Comeback Mode** = mode offensif (énergie remonte APRÈS récupération → rattrapage)
> - Si Energy Debt actif → pas de Comeback (on est encore épuisé)

---

## UI Components

| Component | File | Description |
|-----------|------|-------------|
| **OnboardingChat** | `components/chat/OnboardingChat.tsx` | Chat conversationnel avec avatar Bruno |
| **SkillChat** | `components/chat/SkillChat.tsx` | Chat ajout competences |
| **ItemChat** | `components/chat/ItemChat.tsx` | Chat ajout objets a vendre |
| **LifestyleChat** | `components/chat/LifestyleChat.tsx` | Chat optimisation lifestyle |
| **TradeChat** | `components/chat/TradeChat.tsx` | Chat besoins emprunt/troc |
| **ChatInput** | `components/chat/ChatInput.tsx` | Input reutilisable (texte + mic) |
| **TimelineHero** | `components/timeline/TimelineHero.tsx` | Double timeline avec character |
| **RollDiceButton** | `components/swipe/RollDice.tsx` | Bouton compilation + freeze |
| **SwipeCard** | `components/swipe/SwipeCard.tsx` | Carte Tinder-like avec actions |
| **Retroplan** | `components/suivi/Retroplan.tsx` | Visualisation semaines + comeback |
| **EnergyHistory** | `components/suivi/EnergyHistory.tsx` | Barres energie + recovery |
| **MissionList** | `components/suivi/MissionList.tsx` | Liste missions avec valider/supprimer |
| **MissionCard** | `components/suivi/MissionCard.tsx` | Carte mission individuelle |
| **AchievementBadge** | `components/AchievementBadge.tsx` | Badge gamification (locked/unlocked) |
| **VoiceInput** | `components/VoiceInput.tsx` | Mic button avec Whisper transcription |

---

## 4 Agents

| Agent | Role | Killer Feature |
|-------|------|----------------|
| **Budget Coach** | Analyse budget + conseils personnalises + chat onboarding | Foundation |
| **Job Matcher** | Skill Arbitrage + multi-criteria scoring | #2 Skill Arbitrage |
| **Guardian** | Validation 2-layer (Heuristics + G-Eval) | Quality |
| **Energy Calculator** | Capacity tracking + Comeback detection + Energy Debt | #1 & #4 |

### Agent Tools

| Agent | Tools |
|-------|-------|
| **Budget Coach** | `analyze_budget`, `generate_advice`, `find_optimizations`, `chat_response` |
| **Job Matcher** | `match_jobs`, `skill_arbitrage_score`, `compare_strategies`, `estimate_item_price` |
| **Guardian** | `validate_calculation`, `check_risk_level`, `hybrid_evaluation` |
| **Energy Calculator** | `calculate_capacity`, `detect_comeback`, `energy_debt_check`, `generate_retroplan` |

---

## 2-Layer Evaluation

```
+---------------------------------------------------------------------+
|  LAYER 1: HEURISTICS (~50ms)                                         |
|  - calculation_validation - math correctness                         |
|  - risk_keywords - dangerous advice detection                        |
|  - readability - student-appropriate language                        |
|  - tone - balanced sentiment                                         |
+---------------------------------------------------------------------+
       |
       v VETO: Wrong calculation or critical risk -> AUTO-REJECT
       |
+---------------------------------------------------------------------+
|  LAYER 2: G-EVAL LLM-AS-JUDGE (~500ms)                              |
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
|  OPIK MONITORING (separate concern) - see docs/OPIK.md              |
+---------------------------------------------------------------------+
```

---

## Smart Retroplanning

### Variable Capacity Concept

```
Normal week:      [================] 100% capacity -> 63e target
Pre-exam week:    [========--------]  50% capacity -> 32e target
Exam week:        [====------------]  20% capacity -> 15e target (protected)
Vacation week:    [====================] 120% capacity -> 75e target
```

**Result**: Same total goal, but intelligent distribution.

### Algorithm

```
+---------------------------------------------------------------------+
|  INPUT: Academic events + Commitments + Energy history              |
+---------------------------------------------------------------------+
                               |
                               v
+---------------------------------------------------------------------+
|  CAPACITY CALCULATION                                                |
|  capacityScore = baseHours x academicMultiplier x energyFactor      |
+---------------------------------------------------------------------+
                               |
                               v
+---------------------------------------------------------------------+
|  RETROPLANNING                                                       |
|  1. Calculate total available capacity                              |
|  2. Distribute goal proportionally                                  |
|  3. Front-load high capacity weeks                                  |
|  4. Protect critical weeks (exams)                                  |
|  5. Detect comeback windows                                         |
|  6. Track energy debt                                               |
+---------------------------------------------------------------------+
```

---

## Gamification

### Achievements

| Achievement | Condition | Killer Feature |
|-------------|-----------|----------------|
| First Euro | Record first earning | - |
| Week Complete | Hit 100% of week target | - |
| Overachiever | Beat target by 20% | - |
| Exam Warrior | Hit target during exams | #1 Crunch |
| **Comeback King** | Recover 2 weeks of deficit | #1 Crunch |
| **Self Care Champion** | Accept reduced target when exhausted | #4 Energy Debt |
| Capacity Master | Use 90%+ capacity 3 weeks straight | - |
| Lifestyle Optimizer | Save 50e+ via lifestyle changes | Lifestyle |
| Trade Master | Complete 3 successful trades | Trade |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Handle all chat interactions |
| `/api/goals` | POST | Create/update goal |
| `/api/retroplan` | POST | Manage events, commitments, energy |
| `/api/swipe` | POST | Handle swipe decisions |
| `/api/missions` | POST | Validate/delete missions |
| `/api/voice` | POST | Transcribe audio |

### `/api/chat` Actions
- `onboarding` - Conversational onboarding
- `add_skill` - Add skill via chat
- `add_item` - Add item to sell via chat
- `add_lifestyle` - Add lifestyle optimization
- `add_trade` - Add trade need

### `/api/goals` Actions
- `create` - Create goal with plan
- `update_progress` - Record weekly progress

### `/api/retroplan` Actions
- `add_academic_event` - Add exam/vacation
- `add_commitment` - Add recurring commitment
- `log_energy` - Record energy check-in
- `generate_retroplan` - Generate capacity-aware plan
- `detect_comeback` - Check for comeback window
- `check_energy_debt` - Check for energy debt

### `/api/swipe` Actions
- `roll_dice` - Compile scenarios from all tabs
- `record_decision` - Record swipe left/right
- `get_preferences` - Get learned preferences

### `/api/missions` Actions
- `validate` - Mark mission as completed
- `delete` - Remove mission from plan

---

## DuckDB Schema

```sql
-- Academic events
CREATE TABLE academic_events (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL,  -- 'exam_period', 'vacation', 'internship'
  event_name VARCHAR NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  capacity_impact DECIMAL DEFAULT 0.2
);

-- Recurring commitments
CREATE TABLE commitments (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  commitment_type VARCHAR NOT NULL,
  commitment_name VARCHAR NOT NULL,
  hours_per_week DECIMAL NOT NULL
);

-- Energy tracking
CREATE TABLE energy_logs (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  log_date DATE NOT NULL,
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
  mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
  stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 5)
);

-- Swipe preferences (for Killer #3)
CREATE TABLE swipe_history (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  strategy_id VARCHAR NOT NULL,
  decision VARCHAR NOT NULL,  -- 'left', 'right'
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences (learned from swipes)
CREATE TABLE user_preferences (
  user_id VARCHAR PRIMARY KEY,
  effort_sensitivity DECIMAL,
  hourly_rate_priority DECIMAL,
  time_flexibility DECIMAL,
  updated_at TIMESTAMP
);

-- Missions (from swipe acceptance)
CREATE TABLE missions (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  mission_type VARCHAR NOT NULL,  -- 'job', 'sell', 'lifestyle', 'trade'
  description VARCHAR NOT NULL,
  estimated_value DECIMAL,
  status VARCHAR DEFAULT 'pending',  -- 'pending', 'validated', 'deleted'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lifestyle items
CREATE TABLE lifestyle_items (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  category VARCHAR NOT NULL,  -- 'housing', 'food', 'transport', 'subscriptions'
  item_name VARCHAR NOT NULL,
  current_cost DECIMAL,
  optimized_cost DECIMAL,
  savings DECIMAL
);

-- Trade items
CREATE TABLE trade_items (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  item_name VARCHAR NOT NULL,
  trade_type VARCHAR NOT NULL,  -- 'need', 'offer'
  duration VARCHAR,
  status VARCHAR DEFAULT 'active'  -- 'active', 'matched', 'completed'
);
```

---

## Observability

See [OPIK.md](OPIK.md) for full Opik integration details, including:
- Trace hierarchy for all screens and tabs
- Custom metrics for each killer feature
- TypeScript SDK + Mastra configuration
- Dashboard setup

---

*Document updated - January 2026*
