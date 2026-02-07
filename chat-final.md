# Sprint Chat-Final: Intelligence Conversationnelle & Livraison Proactive

## Audit de l'existant

### Architecture Chat

```
User Message
    │
    ▼
POST /api/chat (chat.ts, 2756 lignes)
    │
    ├─ Slash commands (/help, /show_budget) → retour immédiat
    ├─ Direct actions (__action:xxx) → handleConversationMode()
    ├─ Mode onboarding → Groq Extractor (JSON) → regex fallback → legacy
    └─ Mode conversation → handleConversationMode()
         │
         ├─ Span 1: detectIntent() (detector.ts) — regex patterns + LLM fallback
         ├─ Span 2: Profile context lookup
         ├─ Span 2.5: fetchBudgetContext() → GET /api/budget
         ├─ Span 2.6: fetchActiveGoal() → GET /api/goals (fallback si absent du context)
         ├─ ActionDispatcher check (pause_subscription, create_goal, etc.)
         └─ switch(intent.action) → ~30 case handlers → response + uiResource
```

### Intents implémentés (fonctionnels)

| Intent | UIResource | Deep links |
|--------|-----------|------------|
| `show_budget_chart` | `chart` bar (income/expenses/savings) | Non |
| `show_progress_chart` | `chart` line (savings timeline) | Non |
| `show_projection_chart` | `chart` comparison (current vs scenario) | Non |
| `show_energy_chart` | `chart` line (energy over time) | Non |
| `show_earnings_chart` | `chart` line (earnings vs goal) | Non |
| `show_chart_gallery` | `grid` 4 boutons (budget/progress/projection/energy) | Non |
| `show_swipe_embed` | `swipe_embed` iframe /embed/swipe | Non |
| `whatif_work` | `chart` projection | Non |
| `whatif_sell` | `chart` projection | Non |
| `whatif_cut` | `chart` projection | Non |
| `search_jobs` | `table` jobs + arbitrage scores | Non |
| `search_remote_jobs` | `table` jobs remote filtrés | Non |
| `show_sellable_items` | `table` inventory + prix estimés | Non |
| `new_goal` | `input_form` si champs manquants | Non |
| `pause_subscription` | `input_form` si champs manquants | Non |
| `add_resource` | `confirmation` HITL | Non |

### Intents dégradés (stubs)

| Intent | Problème | Code (chat.ts) |
|--------|----------|----------------|
| `check_progress` (L2442) | Texte uniquement, pas de chart ni metrics | Aucun uiResource |
| `get_advice` (L2470) | Hardcodé 4 tips génériques | Aucun appel agent |
| `view_plan` (L2474) | Texte "go to Me" | Lien mort, pas de deep link |

### Intents détectés mais sans handler (tombent dans default → LLM générique)

| Intent | Pattern (detector.ts) | Jamais atteint dans chat.ts |
|--------|----------------------|----------------------------|
| `progress_summary` | L654: `comment ça avance`, `résumé`, `bilan` | Pas de case |
| `recommend_focus` | L646: `sur quoi me concentrer`, `focus`, `priorité` | Pas de case |
| `complete_mission` | L571: `j'ai terminé la mission X` | Pas de case |
| `skip_mission` | L598: `passer la mission X`, `skip X` | Pas de case |
| `update_energy` | L612/622/634: `fatigué` (→30), `super forme` (→85), `énergie 70` | Pas de case |

### Système proactif existant

**ProactiveAlerts.tsx** — Portal bottom-right, Bruno avatar, auto-dismiss 8s :
- `skill_job` — quand une skill est ajoutée (SkillsTab)
- `goal_achieved` — quand progress ≥ 100% (GoalsTab)
- `energy_low` — quand compositeScore < 40 (EnergyTracker)
- `energy_recovered` — quand compositeScore > 80 (EnergyTracker)
- `goal_behind` — type défini mais **jamais émis**

**Manque** : Aucun message proactif dans le chat lui-même. Pas de briefing au chargement.
Pas de welcome message post-onboarding. Pas de queue de messages event-driven.

### Agents MCP disponibles (18 agents)

| Agent | Utilisé depuis le chat ? |
|-------|-------------------------|
| Budget Coach | Indirect (via fetchBudgetContext) |
| Job Matcher | Oui (search_jobs) |
| Money Maker | Non |
| Strategy Comparator | Non |
| Guardian | Non |
| Essential Guardian | Non (frontend filter seulement) |
| Ghost Observer | Non |
| Daily Briefing | Non |
| Lifestyle Agent | Non |
| Swipe Orchestrator | Non (swipe est client-side) |
| Tab Tips Orchestrator | Oui (tab tips warmup sur /me) |
| Asset Pivot | Non |
| Cashflow Smoother | Non |
| Projection ML | Indirect (whatif_*) |
| Onboarding Agent | Oui (extraction) |

**Constat** : Le chat n'appelle directement que 3 agents sur 18. Toute l'intelligence MCP est sous-utilisée.

---

## Plan de Sprint (5 Phases)

---

### Phase 1 : Connecter les 5 intents orphelins

**But** : Les commandes vocales/texte pour le suivi fonctionnent enfin.

#### Architecture : Extraction en `handlers/`

`chat.ts` fait déjà 2757 lignes. Les 5 nouveaux handlers ne seront **pas** ajoutés dans le switch inline. Créer un dossier `handlers/` pour isoler chaque handler :

```
packages/frontend/src/routes/api/chat/
├── handlers/
│   ├── progressSummary.ts    # Phase 1.1
│   ├── recommendFocus.ts     # Phase 1.2
│   ├── completeMission.ts    # Phase 1.3
│   ├── skipMission.ts        # Phase 1.4
│   └── updateEnergy.ts       # Phase 1.5
└── (chat.ts reste en place, importe les handlers)
```

Chaque handler exporte une fonction avec la même signature :

```typescript
// packages/frontend/src/routes/api/chat/handlers/progressSummary.ts
import type { ChatHandlerContext, ChatHandlerResult } from '../types';

export async function handleProgressSummary(ctx: ChatHandlerContext): Promise<ChatHandlerResult> {
  // ... logic ...
  return { response, uiResource };
}
```

Dans `chat.ts`, le switch devient :

```typescript
case 'progress_summary': return await handleProgressSummary(handlerCtx);
case 'recommend_focus':  return await handleRecommendFocus(handlerCtx);
case 'complete_mission': return await handleCompleteMission(handlerCtx);
case 'skip_mission':     return await handleSkipMission(handlerCtx);
case 'update_energy':    return await handleUpdateEnergy(handlerCtx);
```

#### Tracing : Chaque handler dans un span

Chaque handler doit wrapper sa logique dans un child span pour le debug Opik :

```typescript
export async function handleProgressSummary(ctx: ChatHandlerContext): Promise<ChatHandlerResult> {
  return ctx.parentSpan.createChildSpan('chat.intent.progress_summary', async (span) => {
    span.setAttributes({ profileId: ctx.profileId });
    // ... handler logic ...
    span.setAttributes({ 'result.missions_active': activeMissions, 'result.progress': progress });
    return { response, uiResource };
  });
}
```

Ceci permet de filtrer dans Opik par intent et de voir les données de chaque handler individuellement.

**Fichier principal** : `packages/frontend/src/routes/api/chat.ts` (switch dispatch uniquement)
**Handlers** : `packages/frontend/src/routes/api/chat/handlers/*.ts`

#### 1.1 `progress_summary`

**Données déjà disponibles** dans le handler (spans 2.5 et 2.6) :
- `budgetContext.netMargin`, `budgetContext.adjustedMargin`, `budgetContext.goalProgress`
- `context.goalName`, `context.goalAmount`, `context.currentSaved`
- `context.goalDeadline`

**Données à fetcher** (missions actives, énergie) :
- `profile.planData.selectedScenarios` → missions actives
- `GET /api/energy-logs?profileId=xxx&limit=1` → dernier niveau d'énergie

**Response** : Texte structuré + composite UIResource

```typescript
case 'progress_summary': {
  const goalName = context.goalName as string;
  const goalAmount = (context.goalAmount as number) || 0;
  const currentSaved = (context.currentSaved as number) || 0;
  const progress = goalAmount > 0 ? Math.round((currentSaved / goalAmount) * 100) : 0;
  const margin = budgetContext?.adjustedMargin || budgetContext?.netMargin || 0;
  const curr = getCurrencySymbol(context.currency as string);

  // Fetch missions from profile planData
  const profile = await fetchProfile(profileId);
  const scenarios = profile?.planData?.selectedScenarios || [];
  const activeMissions = scenarios.filter((s: any) => s.status === 'active').length;
  const completedMissions = scenarios.filter((s: any) => s.status === 'completed').length;

  // Fetch latest energy
  const energyResp = await fetchEnergyLogs(profileId, 1);
  const latestEnergy = energyResp?.[0]?.level ?? null;

  // Build pace info
  const weeksRemaining = /* calc from goalDeadline */ ;
  const weeklyNeeded = weeksRemaining > 0 ? Math.round((goalAmount - currentSaved) / weeksRemaining) : 0;

  response = `Here's your update:\n\n` +
    `- **Goal**: ${goalName} — ${curr}${currentSaved} / ${curr}${goalAmount} (${progress}%)\n` +
    `- **Pace**: ${curr}${weeklyNeeded}/week needed, margin ${curr}${margin}/month\n` +
    `- **Missions**: ${activeMissions} active, ${completedMissions} completed\n` +
    (latestEnergy !== null ? `- **Energy**: ${latestEnergy}%\n` : '');

  uiResource = {
    type: 'composite',
    components: [
      { type: 'metric', params: { title: 'Goal', value: `${progress}%`, unit: goalName } },
      { type: 'metric', params: { title: 'Missions', value: `${activeMissions}`, unit: 'active' } },
      ...(latestEnergy !== null ? [{ type: 'metric', params: { title: 'Energy', value: `${latestEnergy}%` } }] : []),
      { type: 'grid', params: { columns: 3, children: [
        { type: 'action', params: { label: '📊 Charts', action: 'show_chart_gallery' } },
        { type: 'action', params: { label: '🎯 Progress', type: 'link', href: '/progress' } },
        { type: 'action', params: { label: '🃏 Swipe', type: 'link', href: '/swipe' } },
      ]}},
    ],
  };
  break;
}
```

#### 1.2 `recommend_focus`

**Logique déterministe** (pas de LLM) :

```typescript
case 'recommend_focus': {
  const latestEnergy = await fetchLatestEnergy(profileId);
  const missions = getMissionsFromProfile(profileId);
  const activeMissions = missions.filter(m => m.status === 'active');
  const goalProgress = budgetContext?.goalProgress || 0;

  let advice: string;
  let actions: UIResource[];

  if (latestEnergy !== null && latestEnergy < 40) {
    advice = `Your energy is at **${latestEnergy}%** — take care of yourself first. Rest, then tackle small wins.`;
    actions = [
      { type: 'action', params: { label: '⚡ Log Energy', action: '__action:update_energy' } },
      { type: 'action', params: { label: '📈 Energy Chart', action: 'show_energy_chart' } },
    ];
  } else if (activeMissions.length === 0) {
    advice = `No active missions! Head to Swipe to discover opportunities.`;
    actions = [
      { type: 'action', params: { label: '🃏 Go to Swipe', type: 'link', href: '/swipe' } },
    ];
  } else if (goalProgress < 80) {
    // Find highest-earning mission
    const topMission = activeMissions.sort((a, b) => b.weeklyEarnings - a.weeklyEarnings)[0];
    advice = `Focus on **${topMission.title}** — it's your highest-impact mission (${curr}${topMission.weeklyEarnings}/week).`;
    actions = [
      { type: 'action', params: { label: '🎯 Go to Progress', type: 'link', href: '/progress' } },
      { type: 'action', params: { label: '📊 My Budget', action: 'show_budget_chart' } },
    ];
  } else {
    // Nearest to completion
    const nearest = activeMissions.sort((a, b) => b.progress - a.progress)[0];
    advice = `Almost there! **${nearest.title}** is at ${nearest.progress}%. Finish it to boost your momentum.`;
    actions = [
      { type: 'action', params: { label: '🎯 Progress', type: 'link', href: '/progress' } },
    ];
  }

  response = advice;
  uiResource = { type: 'grid', params: { columns: actions.length, children: actions } };
  break;
}
```

#### 1.3 `complete_mission`

```typescript
case 'complete_mission': {
  const missionTitle = intent.extractedMission;
  const profile = await fetchProfile(profileId);
  const scenarios = profile?.planData?.selectedScenarios || [];
  const active = scenarios.filter((s: any) => s.status === 'active');

  if (!missionTitle || active.length === 0) {
    // Show selection buttons for all active missions
    response = active.length > 0
      ? `Which mission did you complete?`
      : `You don't have any active missions. Go to Swipe to add some!`;
    uiResource = {
      type: 'grid',
      params: {
        columns: 1,
        children: active.map((m: any) => ({
          type: 'action',
          params: { label: `✅ ${m.title}`, action: `__action:complete_mission_${m.id}` },
        })),
      },
    };
    break;
  }

  // Fuzzy match: find mission whose title includes the search term
  const lower = missionTitle.toLowerCase();
  const match = active.find((m: any) =>
    m.title.toLowerCase().includes(lower) || lower.includes(m.title.toLowerCase())
  );

  if (!match) {
    response = `I couldn't find an active mission matching "${missionTitle}". Which one?`;
    uiResource = /* same selection buttons as above */;
    break;
  }

  // Complete the mission (update planData)
  match.status = 'completed';
  match.earningsCollected = match.weeklyEarnings;
  match.completedAt = new Date().toISOString();
  await saveProfile(profile); // persist

  const curr = getCurrencySymbol(context.currency as string);
  response = `Mission **${match.title}** completed! +${curr}${match.weeklyEarnings} earned.`;
  uiResource = {
    type: 'grid',
    params: { columns: 2, children: [
      { type: 'action', params: { label: '🎯 See Progress', type: 'link', href: '/progress' } },
      { type: 'action', params: { label: '🃏 More Opportunities', type: 'link', href: '/swipe' } },
    ]},
  };
  break;
}
```

#### 1.4 `skip_mission`

Même pattern que `complete_mission`, mais `match.status = 'skipped'` et message différent.

#### 1.5 `update_energy`

```typescript
case 'update_energy': {
  const level = intent.extractedEnergy || 50;

  // Log energy via retroplan API
  await fetch(`/api/retroplan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId,
      action: 'log_energy',
      data: { level, date: getCurrentDate(timeCtx) },
    }),
  });

  let statusMsg = '';
  if (level < 40) {
    statusMsg = `That's low. Consider lighter missions this week.`;
  } else if (level > 80) {
    statusMsg = `Great energy! Good time to tackle high-impact missions.`;
  } else {
    statusMsg = `Moderate energy. Stay steady.`;
  }

  response = `Energy logged at **${level}%**. ${statusMsg}`;
  uiResource = {
    type: 'grid',
    params: { columns: 2, children: [
      { type: 'action', params: { label: '⚡ Energy Chart', action: 'show_energy_chart' } },
      { type: 'action', params: { label: '🎯 Focus Advice', action: '__action:recommend_focus' } },
    ]},
  };
  break;
}
```

---

### Phase 2 : Messages proactifs dans le chat

**But** : Le chat livre de la valeur AVANT que l'utilisateur ne tape quoi que ce soit.

#### 2.1 Welcome message post-onboarding

**Fichier** : `packages/frontend/src/components/chat/OnboardingChat.tsx`
**Où** : Dans les 6 endroits où `setChatMode('conversation')` est appelé (L329, L875, L1123, L1315, L1381, L2597).

Après le `setIsComplete(true)`, si c'est la première fois (check localStorage `stride_welcome_shown_${profileId}`), injecter un message assistant :

```typescript
// After setChatMode('conversation') + setIsComplete(true)
const welcomeKey = `stride_welcome_shown_${pid}`;
if (!localStorage.getItem(welcomeKey)) {
  localStorage.setItem(welcomeKey, 'true');
  const welcomeMsg: Message = {
    role: 'assistant',
    content: `Welcome! I'm now in **conversation mode**. Here's what I can help with:\n\n` +
      `- **Charts** — budget, progress, energy, projections\n` +
      `- **"What if"** — simulate working more, selling items, cutting subscriptions\n` +
      `- **Actions** — create goals, pause subscriptions, find jobs\n` +
      `- **Swipe** — discover opportunities right here\n\n` +
      `Try one:`,
    uiResource: {
      type: 'grid',
      params: {
        columns: 2,
        children: [
          { type: 'action', params: { label: '📊 My Budget', action: 'show_chart', params: { chartType: 'budget_breakdown' } } },
          { type: 'action', params: { label: '📈 My Progress', action: 'show_chart', params: { chartType: 'progress' } } },
          { type: 'action', params: { label: '🃏 Swipe', action: 'show_swipe_embed' } },
          { type: 'action', params: { label: '💡 Tips', action: '__action:get_advice' } },
        ],
      },
    },
  };
  setMessages((prev) => [...prev, welcomeMsg]);
}
```

#### 2.2 Daily briefing au chargement

**Fichier** : `packages/frontend/src/components/chat/OnboardingChat.tsx`
**Où** : Dans le `createEffect` de restauration d'historique, après les messages chargés.

**Condition** : `chatMode() === 'conversation'` ET `lastBriefingDate !== today`

```typescript
// After chat history is loaded in conversation mode
const briefingKey = `stride_last_briefing_${profileId}`;
const today = new Date().toISOString().split('T')[0];
const lastBriefing = localStorage.getItem(briefingKey);

if (chatMode() === 'conversation' && lastBriefing !== today) {
  localStorage.setItem(briefingKey, today);

  // Fetch data for briefing (non-blocking)
  const [budgetData, goalsData] = await Promise.all([
    fetch(`/api/budget?profileId=${profileId}`).then(r => r.json()).catch(() => null),
    fetch(`/api/goals?profileId=${profileId}&status=active`).then(r => r.json()).catch(() => null),
  ]);

  const goal = goalsData?.goals?.[0];
  const progress = goal ? Math.round((goal.progress / goal.amount) * 100) : 0;
  const margin = budgetData?.adjustedMargin || budgetData?.netMargin || 0;
  const curr = getCurrencySymbol(profile()?.currency);

  const briefingMsg: Message = {
    role: 'assistant',
    content: `Quick daily update:\n\n` +
      (goal ? `- **${goal.name}**: ${progress}% (${curr}${goal.progress} / ${curr}${goal.amount})\n` : '') +
      `- **Margin**: ${curr}${margin}/month\n` +
      `\nWhat would you like to do?`,
    uiResource: {
      type: 'grid',
      params: { columns: 2, children: [
        { type: 'action', params: { label: '📊 Charts', action: 'show_chart_gallery' } },
        { type: 'action', params: { label: '🃏 Opportunities', type: 'link', href: '/swipe' } },
      ]},
    },
  };
  setMessages((prev) => [...prev, briefingMsg]);
}
```

#### 2.3 Détection proactive dans conversation handler

**Fichier** : `packages/frontend/src/routes/api/chat.ts`
**Où** : Après le span 2.6 (goal fallback), avant le switch — ajouter des checks.

Checker si le contexte révèle un état notable et injecter un prefixe au response :

```typescript
// After span 2.6, before switch
let proactivePrefix = '';

// Goal achievement detection
const goalProgress = budgetContext?.goalProgress || 0;
if (goalProgress >= 100 && !context._goalCelebrated) {
  proactivePrefix = `**Goal Achieved!** You reached your target for ${context.goalName}!\n\n`;
}

// Comeback window detection (if energy data available)
// Energy debt detection
// These can check via internal API calls if latestEnergy context is enriched
```

---

### Phase 3 : Nouveaux charts + deep links systématiques

**But** : 3 nouvelles visualisations + chaque chart renvoie vers l'app.

#### 3.0 Mise à jour du type `ChartType`

**Fichier** : `packages/frontend/src/lib/chatChartBuilder.ts` (L17-18)

Les 3 nouveaux charts nécessitent l'extension du type union, sinon TypeScript rejettera les nouveaux IDs :

```typescript
export type ChartType =
  | 'budget_breakdown' | 'progress' | 'projection' | 'comparison' | 'energy'
  | 'skills' | 'missions' | 'capacity'; // NEW
```

Vérifier aussi que `AVAILABLE_CHARTS` (L39) et `MCPUIRenderer` (qui consomme `chartType`) acceptent les nouveaux IDs.

#### 3.1 Skill Arbitrage Chart

**Fichier** : `packages/frontend/src/lib/chatChartBuilder.ts`

```typescript
export interface SkillJobMatch {
  jobTitle: string;
  score: number; // 0-100 composite
  rateScore: number;
  demandScore: number;
  effortScore: number;
  restScore: number;
  hourlyRate: number;
}

export function buildSkillArbitrageChart(matches: SkillJobMatch[], currencySymbol: string): UIResource {
  const top5 = matches.slice(0, 5);
  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Top 5 Job Matches (Skill Arbitrage)',
      data: {
        labels: top5.map(m => `${m.jobTitle} (${currencySymbol}${m.hourlyRate}/h)`),
        datasets: [
          { label: 'Rate (30%)', data: top5.map(m => m.rateScore * 30), backgroundColor: 'rgba(34,197,94,0.6)' },
          { label: 'Demand (25%)', data: top5.map(m => m.demandScore * 25), backgroundColor: 'rgba(59,130,246,0.6)' },
          { label: 'Low Effort (25%)', data: top5.map(m => m.effortScore * 25), backgroundColor: 'rgba(251,191,36,0.6)' },
          { label: 'Low Rest (20%)', data: top5.map(m => m.restScore * 20), backgroundColor: 'rgba(168,85,247,0.6)' },
        ],
      },
    },
  };
}
```

**Intent patterns** à ajouter dans `detector.ts` :

```typescript
const SKILL_CHART_PATTERNS = [
  /\b(?:skill|compétence)s?\s+(?:chart|graph|graphique|match|arbitrage)\b/i,
  /\b(?:chart|graph|graphique)\s+(?:de\s+|des?\s+)?(?:skill|compétence)s?\b/i,
  /\b(?:montre|show|affiche)(?:-moi)?\s+(?:mes?\s+)?(?:skills?|compétences?)\b/i,
  /\b(?:job|emploi)s?\s+(?:match|correspondance|arbitrage)\b/i,
  /\barbitrage\b/i,
];
```

**Case handler** dans `chat.ts` : Fetch skills via context, run scoring, build chart, add deep links.

#### 3.2 Mission Progress Chart

**Fichier** : `packages/frontend/src/lib/chatChartBuilder.ts`

```typescript
export interface MissionSummary {
  title: string;
  progress: number; // 0-100
  earnings: number;
  target: number;
  category: string;
}

export function buildMissionChart(missions: MissionSummary[], currencySymbol: string): UIResource {
  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Active Missions',
      data: {
        labels: missions.map(m => m.title),
        datasets: [{
          label: 'Progress',
          data: missions.map(m => m.progress),
          backgroundColor: missions.map(m =>
            m.progress > 75 ? 'rgba(34,197,94,0.6)' :
            m.progress > 25 ? 'rgba(251,191,36,0.6)' : 'rgba(239,68,68,0.6)'
          ),
        }],
      },
    },
  };
}
```

**Intent** : `show_missions_chart`
**Patterns** : `mes missions`, `mission progress`, `my missions`

#### 3.3 Weekly Capacity Chart

```typescript
export interface WeekCapacity {
  weekLabel: string; // "Week 5 (Feb 10)"
  protectedHours: number; // exams, academic events
  committedHours: number; // active mission hours
  availableHours: number; // remaining
}

export function buildCapacityChart(weeks: WeekCapacity[]): UIResource {
  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Weekly Capacity (next 4 weeks)',
      data: {
        labels: weeks.map(w => w.weekLabel),
        datasets: [
          { label: 'Protected', data: weeks.map(w => w.protectedHours), backgroundColor: 'rgba(239,68,68,0.6)' },
          { label: 'Committed', data: weeks.map(w => w.committedHours), backgroundColor: 'rgba(59,130,246,0.6)' },
          { label: 'Available', data: weeks.map(w => w.availableHours), backgroundColor: 'rgba(34,197,94,0.6)' },
        ],
      },
    },
  };
}
```

**Intent** : `show_capacity_chart`
**Patterns** : `capacité`, `disponibilité`, `weekly capacity`, `heures disponibles`

#### 3.4 Deep links systématiques

**Fichier** : `packages/frontend/src/lib/chatChartBuilder.ts`

Ajouter une fonction helper :

```typescript
export function buildChartWithLinks(
  chart: UIResource,
  links: Array<{ label: string; href?: string; action?: string }>
): UIResource {
  return {
    type: 'composite',
    components: [
      chart,
      {
        type: 'grid',
        params: {
          columns: Math.min(links.length, 3),
          children: links.map(l => ({
            type: 'action',
            params: l.href
              ? { label: l.label, type: 'link', href: l.href }
              : { label: l.label, action: l.action },
          })),
        },
      },
    ],
  };
}
```

**Usage** dans chaque case handler de chart dans `chat.ts` :

| Chart | Deep links |
|-------|-----------|
| `show_budget_chart` | `[Edit Budget → /me?tab=budget]` `[Optimization Tips → get_advice]` |
| `show_progress_chart` | `[Go to Progress → /progress]` `[What-If Scenarios → show_chart_gallery]` |
| `show_projection_chart` | `[Find Jobs → /me?tab=jobs]` `[Swipe → /swipe]` |
| `show_energy_chart` | `[Log Energy → update_energy]` `[Go to Progress → /progress]` |
| `show_earnings_chart` | `[Go to Progress → /progress]` `[Swipe → /swipe]` |
| `show_skills_chart` (new) | `[Browse Jobs → /me?tab=jobs]` `[Swipe → /swipe]` |
| `show_missions_chart` (new) | `[Go to Progress → /progress]` `[Complete Mission]` |
| `show_capacity_chart` (new) | `[Academic Events → /me?tab=profile]` `[Swipe → /swipe]` |

#### 3.5 Chart Gallery V2

**Fichier** : `packages/frontend/src/lib/chatChartBuilder.ts` (L39-64)

Ajouter au tableau `AVAILABLE_CHARTS` :

```typescript
{ id: 'skills', label: 'Skill Match', description: 'Jobs ranked by arbitrage score', icon: '💼' },
{ id: 'missions', label: 'Mission Progress', description: 'Active missions status', icon: '✅' },
{ id: 'capacity', label: 'Weekly Capacity', description: 'Available hours next 4 weeks', icon: '📅' },
```

Passer de 4 à 7 boutons → adapter le grid à `columns: 2` (3.5 lignes, le dernier centré).

---

### Phase 4 : Réponses multi-agents composites

**But** : Un message = plusieurs agents combinés dans une réponse riche.

#### 4.1 `get_advice` → Multi-source (remplace le stub L2470)

**Architecture** : 3 requêtes parallèles depuis le handler, consolidation déterministe.

**Important** : Utiliser `Promise.allSettled` (pas `Promise.all`). Si le job matcher est down, on peut toujours donner des tips budget + inventory. Un seul échec ne doit pas crash toute la réponse.

```typescript
case 'get_advice': {
  const curr = getCurrencySymbol(context.currency as string);
  const skills = context.skills as string[] || [];
  const inventory = context.inventoryItems as any[] || [];

  // Parallel data fetching — allSettled for partial-success resilience
  const [budgetResult, jobResult, profileResult] = await Promise.allSettled([
    fetchBudgetContext(profileId),
    fetchJobMatches(profileId, skills),
    fetchProfile(profileId),
  ]);

  const budgetData = budgetResult.status === 'fulfilled' ? budgetResult.value : null;
  const jobMatches = jobResult.status === 'fulfilled' ? jobResult.value : [];
  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;

  const tips: Array<{ icon: string; text: string; impact: number }> = [];

  // 1. Budget optimization (top saving opportunity)
  if (budgetData) {
    const pausableSubs = /* query lifestyle_items WHERE category='subscriptions' AND paused_months=0 */;
    if (pausableSubs.length > 0) {
      const topSub = pausableSubs.sort((a, b) => b.currentCost - a.currentCost)[0];
      tips.push({
        icon: '💸',
        text: `Pause **${topSub.name}** — save ${curr}${topSub.currentCost}/month`,
        impact: topSub.currentCost,
      });
    }
  }

  // 2. Top job match
  if (jobMatches.length > 0) {
    const topJob = jobMatches[0];
    tips.push({
      icon: '💼',
      text: `**${topJob.title}** — ${curr}${topJob.hourlyRate}/h, matches your ${topJob.matchedSkill} skill`,
      impact: topJob.hourlyRate * 10, // ~10h/week estimate
    });
  }

  // 3. Top sellable item
  if (inventory.length > 0) {
    const topItem = inventory.sort((a, b) => b.estimatedValue - a.estimatedValue)[0];
    tips.push({
      icon: '📦',
      text: `Sell **${topItem.name}** — ~${curr}${topItem.estimatedValue}`,
      impact: topItem.estimatedValue,
    });
  }

  // Sort by impact descending
  tips.sort((a, b) => b.impact - a.impact);

  response = tips.length > 0
    ? `Top opportunities ranked by impact:\n\n` +
      tips.map((t, i) => `${i + 1}. ${t.icon} ${t.text}`).join('\n')
    : `I need more data to give specific advice. Complete your profile in **Me**!`;

  uiResource = {
    type: 'grid',
    params: { columns: 3, children: [
      { type: 'action', params: { label: '💼 All Jobs', type: 'link', href: '/me?tab=jobs' } },
      { type: 'action', params: { label: '📦 My Items', action: 'show_sellable_items' } },
      { type: 'action', params: { label: '💸 Budget', action: 'show_budget_chart' } },
    ]},
  };
  break;
}
```

#### 4.2 `check_progress` → Dashboard-in-Chat (remplace le texte L2442)

Même pattern que `progress_summary` (Phase 1.1) mais avec un chart embarqué :

```typescript
case 'check_progress': {
  // ... same data fetching as progress_summary ...

  // Build inline progress chart
  const progressChart = buildProgressChart({
    currentSaved, goalAmount,
    weeksRemaining, weeklyContribution: margin / 4,
  });

  response = `Goal: **${goalName}** — ${progress}% complete (${curr}${currentSaved} / ${curr}${goalAmount})`;

  uiResource = {
    type: 'composite',
    components: [
      // Metrics row
      { type: 'grid', params: { columns: 3, children: [
        { type: 'metric', params: { title: 'Progress', value: `${progress}%` } },
        { type: 'metric', params: { title: 'Missions', value: `${activeMissions}` } },
        { type: 'metric', params: { title: 'Margin', value: `${curr}${margin}/mo` } },
      ]}},
      // Chart
      progressChart,
      // Actions
      { type: 'grid', params: { columns: 3, children: [
        { type: 'action', params: { label: '📊 Budget', action: 'show_budget_chart' } },
        { type: 'action', params: { label: '⚡ Energy', action: 'show_energy_chart' } },
        { type: 'action', params: { label: '🎯 Progress', type: 'link', href: '/progress' } },
      ]}},
    ],
  };
  break;
}
```

#### 4.3 Follow-up suggestions contextuels

**Fichier** : `packages/frontend/src/routes/api/chat.ts`
**Où** : Fonction helper appelée à la fin du handler, juste avant le `return`.

```typescript
function buildFollowUpSuggestions(context: Record<string, unknown>, currentAction: string): UIResource | null {
  const suggestions: Array<{ label: string; action?: string; href?: string }> = [];

  // Don't add suggestions if we already returned a grid/composite with actions
  if (['progress_summary', 'check_progress', 'recommend_focus'].includes(currentAction)) return null;

  const hasGoal = Boolean(context.goalName);
  const goalProgress = (context.goalProgress as number) || 0;

  if (!hasGoal) {
    suggestions.push({ label: '🎯 Create Goal', action: '__action:new_goal' });
    suggestions.push({ label: '📊 See Budget', action: 'show_budget_chart' });
  } else if (goalProgress < 50) {
    suggestions.push({ label: '🃏 Swipe', href: '/swipe' });
    suggestions.push({ label: '💡 What If...', action: 'show_projection_chart' });
  } else if (goalProgress >= 100) {
    suggestions.push({ label: '🎯 New Goal', action: '__action:new_goal' });
    suggestions.push({ label: '📊 Final Stats', action: 'show_progress_chart' });
  }

  if (suggestions.length === 0) return null;

  return {
    type: 'grid',
    params: {
      columns: suggestions.length,
      children: suggestions.map(s => ({
        type: 'action',
        params: s.href
          ? { label: s.label, type: 'link', href: s.href }
          : { label: s.label, action: s.action },
      })),
    },
  };
}
```

**Usage** : Avant le return dans le handler, si `uiResource` est un chart simple (pas déjà composite), le wrapper :

```typescript
const followUp = buildFollowUpSuggestions(context, intent.action || '');
if (followUp && uiResource && uiResource.type === 'chart') {
  uiResource = { type: 'composite', components: [uiResource, followUp] };
} else if (followUp && !uiResource) {
  uiResource = followUp;
}
```

---

### Phase 5 : Messages event-driven (queue → chat)

**But** : Des events app génèrent des messages qui attendent dans une queue et sont livrés au prochain chargement du chat.

#### 5.1 Queue de messages proactifs

**Nouveau fichier** : `packages/frontend/src/lib/chat/proactiveQueue.ts`

```typescript
import type { UIResource } from '~/types/chat';

export interface QueuedChatMessage {
  id: string;
  content: string;
  uiResource?: UIResource;
  priority: 'low' | 'medium' | 'high';
  createdAt: string; // ISO
  ttlHours: number; // expire after N hours
  dedupeKey: string; // prevent duplicates
}

const QUEUE_KEY = 'stride_chat_queue';

export function enqueueMessage(msg: Omit<QueuedChatMessage, 'id' | 'createdAt'>): void {
  const queue = getQueue();
  // Dedupe
  if (queue.some(m => m.dedupeKey === msg.dedupeKey)) return;
  queue.push({
    ...msg,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function drainQueue(): QueuedChatMessage[] {
  const queue = getQueue();
  const now = Date.now();
  // Filter expired messages
  const valid = queue.filter(m => {
    const age = (now - new Date(m.createdAt).getTime()) / (1000 * 60 * 60);
    return age < m.ttlHours;
  });
  // Clear queue
  localStorage.removeItem(QUEUE_KEY);
  // Sort by priority (high first)
  return valid.sort((a, b) => {
    const pri = { high: 3, medium: 2, low: 1 };
    return pri[b.priority] - pri[a.priority];
  });
}

function getQueue(): QueuedChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch { return []; }
}
```

#### 5.2 Emetteurs (dans les composants existants)

**progress.tsx** — après `handleMissionComplete` (L1069) :

```typescript
import { enqueueMessage } from '~/lib/chat/proactiveQueue';

// After mission is completed successfully:
enqueueMessage({
  content: `Mission **${mission.title}** completed! +${curr}${mission.weeklyEarnings} earned. Goal: ${progress}% complete.`,
  priority: 'medium',
  ttlHours: 48,
  dedupeKey: `mission_complete_${mission.id}`,
  uiResource: {
    type: 'grid',
    params: { columns: 2, children: [
      { type: 'action', params: { label: '🎯 See Progress', type: 'link', href: '/progress' } },
      { type: 'action', params: { label: '📊 Charts', action: 'show_chart_gallery' } },
    ]},
  },
});
```

**EnergyTracker.tsx** — après détection energy_low 3+ semaines :

```typescript
enqueueMessage({
  content: `Energy debt detected (${consecutiveLowWeeks} low weeks). I've adjusted your targets. Take care of yourself.`,
  priority: 'high',
  ttlHours: 72,
  dedupeKey: `energy_debt_${currentWeek}`,
  uiResource: {
    type: 'grid',
    params: { columns: 2, children: [
      { type: 'action', params: { label: '⚡ Energy Chart', action: 'show_energy_chart' } },
      { type: 'action', params: { label: '🎯 Adjusted Plan', type: 'link', href: '/progress' } },
    ]},
  },
});
```

**ComebackAlert.tsx** — après détection comeback window :

```typescript
enqueueMessage({
  content: `Comeback window! Energy recovered to ${currentEnergy}%. I have a catch-up plan ready.`,
  priority: 'high',
  ttlHours: 72,
  dedupeKey: `comeback_${currentWeek}`,
});
```

#### 5.3 Récepteur (OnboardingChat.tsx)

**Où** : Au chargement en conversation mode, après le daily briefing (Phase 2.2).

```typescript
import { drainQueue } from '~/lib/chat/proactiveQueue';

// After briefing injection
const queuedMessages = drainQueue();
if (queuedMessages.length > 0) {
  const proactiveMessages: Message[] = queuedMessages.map(m => ({
    role: 'assistant' as const,
    content: `**Bruno noticed:** ${m.content}`,
    uiResource: m.uiResource,
    isProactive: true, // New field for visual styling
  }));
  setMessages(prev => [...prev, ...proactiveMessages]);
}
```

**Style visuel** dans `ChatMessage.tsx` : Si `isProactive`, ajouter un bandeau subtil (fond légèrement teinté, icône bell).

---

## Matrice d'impact fichiers

| Fichier | Phase | Nature |
|---------|-------|--------|
| `routes/api/chat.ts` | 1, 2, 3, 4 | Switch dispatch (1 ligne/handler) + deep links + follow-ups |
| `routes/api/chat/handlers/*.ts` | 1, 4 | **NOUVEAU** — 5 handlers Phase 1 + `getAdvice` + `checkProgress` Phase 4 |
| `lib/chat/intent/detector.ts` | 3 | 3 nouveaux pattern groups (skills, missions, capacity) |
| `lib/chatChartBuilder.ts` | 3 | `ChartType` update + 3 builders + `buildChartWithLinks()` + gallery V2 |
| `components/chat/OnboardingChat.tsx` | 2, 5 | Welcome msg + briefing + queue drain |
| `lib/chat/proactiveQueue.ts` | 5 | **NOUVEAU** — queue localStorage |
| `components/suivi/EnergyTracker.tsx` | 5 | enqueueMessage energy_debt |
| `components/suivi/ComebackAlert.tsx` | 5 | enqueueMessage comeback |
| `routes/progress.tsx` | 5 | enqueueMessage mission_complete |
| `components/chat/ChatMessage.tsx` | 5 | Style proactif (isProactive) |
| `types/chat.ts` | 3, 5 | `isProactive` sur Message, `quickActions` optionnel |

## Ordre d'exécution

| # | Phase | Effort | Impact |
|---|-------|--------|--------|
| 1 | **Phase 1** : 5 intents orphelins | Moyen | Les commandes vocales/texte marchent |
| 2 | **Phase 2** : Welcome + briefing | Léger | Premier contact proactif, wow effect |
| 3 | **Phase 3** : Charts + deep links | Moyen | Richesse visuelle, navigation fluide |
| 4 | **Phase 4** : Multi-agent + follow-ups | Moyen | Intelligence consolidée |
| 5 | **Phase 5** : Event-driven queue | Léger | Engagement continu |

## Vérification

```bash
pnpm typecheck
pnpm lint
```

### Checklist manuelle

**Phase 1 :**
- [ ] "comment ça avance" → résumé avec metrics + 3 boutons
- [ ] "sur quoi me concentrer" → conseil priorisé + boutons contextuels
- [ ] "j'ai fini la mission tutorat" → mission complétée + earnings
- [ ] "passer la mission vente" → mission skippée
- [ ] "je suis fatigué" → énergie 30% loggée + conseil
- [ ] "énergie 75" → énergie 75% loggée

**Phase 2 :**
- [ ] Premier chargement post-onboarding → welcome avec 4 boutons
- [ ] Chargement jour suivant → briefing daily auto (goal + margin)
- [ ] Pas de doublon briefing si rechargé même jour

**Phase 3 :**
- [ ] "montre mes compétences" → bar chart stacked arbitrage
- [ ] "mes missions" → bar chart avec couleurs progress
- [ ] "heures disponibles" → stacked bars 4 semaines
- [ ] Tout chart → 2-3 boutons de navigation en dessous
- [ ] Gallery → 7 boutons (4 existants + 3 nouveaux)

**Phase 4 :**
- [ ] "tips" / "advice" → 3 recommandations rankées (budget + job + sell)
- [ ] "how am I doing" → metrics + chart + boutons dans un composite
- [ ] Après n'importe quel chart → suggestions follow-up contextuelles

**Phase 5 :**
- [ ] Compléter mission sur /progress → message dans chat au prochain chargement
- [ ] 3 semaines energy < 40 → message energy debt dans chat
- [ ] Comeback détecté → message catch-up dans chat
- [ ] Messages expirés (>TTL) ne s'affichent pas
- [ ] Pas de doublon (dedupeKey)
