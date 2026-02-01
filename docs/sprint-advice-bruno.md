# Sprint: Bruno Advice System

## Overview

This document describes the design and implementation of Bruno's proactive advice system - context-aware tips that appear during onboarding and throughout the app experience.

## Feature Vision

Bruno should feel like a helpful friend, not just a reactive chatbot. The advice system provides:

1. **Proactive guidance** - Tips appear before users ask
2. **Context awareness** - Tips adapt to current step, profile data, and location
3. **Encouraging tone** - Celebrate wins, gently warn about issues
4. **Actionable insights** - Each tip can link to a relevant action

## Architecture

### Tip Sources

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tip Generation Pipeline                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Static Rules (onboardingTipRules.ts)                        │
│     - Fast, deterministic                                        │
│     - Context + condition matching                               │
│     - Priority-weighted selection                                │
│                                                                   │
│  2. Algorithm-Based (comebackDetection, energyDebt)             │
│     - Pattern recognition from energy history                    │
│     - Real-time calculations                                     │
│                                                                   │
│  3. LLM-Enhanced (via /api/tips + Mastra agents)                │
│     - Multi-agent orchestration                                  │
│     - Full context analysis                                      │
│     - Location-aware recommendations                             │
│                                                                   │
│  4. Future: Geolocation (Google Maps integration)               │
│     - Nearby job opportunities                                   │
│     - Student-friendly places                                    │
│     - Regional aid programs                                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
OnboardingChat (/) - After onboarding complete
└── OnboardingTips
    ├── Uses: onboardingTipRules.ts (static rules, 'complete' context)
    ├── Displays: Post-onboarding tips with actions
    └── Shows: Quick links to plan features

SuiviPage (/suivi)
└── BrunoTips
    ├── Uses: /api/tips (LLM + agents)
    ├── Shows: Multi-agent insights
    └── Enables: User feedback (Opik)
```

**Note:** Tips appear AFTER onboarding is complete, not during. During onboarding, the sidebar shows the progress tracker instead.

## Tip Types

### Category Taxonomy

| Category | Icon | Use Case | Color |
|----------|------|----------|-------|
| `opportunity` | Lightbulb | New possibilities, suggestions | Purple |
| `celebration` | Trophy | Wins, achievements, milestones | Yellow |
| `warning` | AlertTriangle | Issues needing attention | Red |
| `progress` | TrendingUp | Tracking updates | Green |
| `energy` | Zap | Energy-related advice | Amber |
| `mission` | Target | Mission/task related | Blue |

### Context Mapping

| Onboarding Step | Tip Focus |
|-----------------|-----------|
| `greeting` | Welcome, privacy, getting started |
| `name` | Personalization benefits |
| `studies` | Field-specific opportunities |
| `skills` | Skill monetization potential |
| `certifications` | Premium rate unlocks |
| `budget` | Cash flow awareness |
| `income_timing` | Payment cycle planning |
| `work_preferences` | Balance and scheduling |
| `goal` | Motivation and planning |
| `academic_events` | Energy-aware scheduling |
| `inventory` | Hidden value discovery |
| `trade` | Cost-free savings |
| `lifestyle` | Subscription optimization |
| `complete` | Celebration and next steps |

## Extensibility Patterns

### Adding New Static Tips

1. Open `packages/frontend/src/config/onboardingTipRules.ts`
2. Add entry to `ONBOARDING_TIP_RULES` array:

```typescript
{
  id: 'unique_tip_id',
  context: 'skills',  // Which step
  condition: (p) => p.skills?.includes('Python'),  // Optional filter
  priority: 75,  // Higher = shown more often
  tip: {
    title: 'Python pays well!',
    message: 'Python developers earn €35-55/hour on freelance platforms.',
    category: 'opportunity',
    action: { label: 'See jobs', href: '/plan?tab=jobs' }
  }
}
```

### Adding Location-Aware Tips

Future pattern for geolocation integration:

```typescript
// In tips-orchestrator.ts
interface GeoTipRule {
  id: string;
  region: string;
  coordinates?: { lat: number; lng: number; radius: number };
  tip: TipTemplate;
  dataSource?: 'static' | 'google_maps' | 'job_api';
}

const REGIONAL_TIPS: GeoTipRule[] = [
  {
    id: 'paris_crous',
    region: 'france',
    coordinates: { lat: 48.8566, lng: 2.3522, radius: 50000 },
    tip: {
      title: 'CROUS student housing',
      message: 'Paris CROUS offers €200-400/month housing. Apply before September!',
      category: 'opportunity'
    },
    dataSource: 'static'
  },
  // Dynamic: Query Google Places for nearby tutoring centers
  {
    id: 'nearby_tutoring',
    region: '*',
    tip: {
      title: 'Tutoring centers nearby',
      message: '{{count}} tutoring centers within 5km are hiring.',
      category: 'opportunity'
    },
    dataSource: 'google_maps'
  }
];
```

### Database-Driven Tips (Future)

For admin-managed tips without code changes:

```sql
CREATE TABLE tip_rules (
  id VARCHAR PRIMARY KEY,
  context VARCHAR NOT NULL,
  condition_json JSON,  -- Serialized condition
  priority INTEGER DEFAULT 50,
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR NOT NULL,
  action_label VARCHAR,
  action_href VARCHAR,
  is_active BOOLEAN DEFAULT true,
  region VARCHAR,  -- Optional: 'france', 'uk', etc.
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Implementation Phases

### Phase 1: Static Onboarding Tips (Current)
- [x] `OnboardingTips` component
- [x] `onboardingTipRules.ts` configuration
- [x] Integration in OnboardingChat sidebar
- [x] Refresh button for tip cycling

### Phase 2: Profile-Aware Tips
- [ ] Richer condition functions (income, goals, skills)
- [ ] Achievement-triggered tips
- [ ] Time-aware tips (exam season, holidays)

### Phase 3: Geolocation Integration
- [ ] Store coordinates in profile (already supported)
- [ ] Pass coordinates to /api/tips
- [ ] Query Google Maps for nearby opportunities
- [ ] Regional student aid database

### Phase 4: Learning Tips
- [ ] Track which tips users find helpful (thumbs up/down)
- [ ] Adjust priority based on feedback
- [ ] A/B test tip variants

## API Reference

### POST /api/tips

Request:
```typescript
{
  profileId: string;
  currentEnergy: number;
  energyHistory: number[];
  goalProgress: number;
  // ... existing fields ...

  // NEW: Onboarding context
  onboardingStep?: string;
  tipContext?: 'tracking' | 'onboarding';
}
```

Response:
```typescript
{
  tip: {
    title: string;
    message: string;
    category: string;
    action?: { label: string; href: string };
  };
  insights: {
    energyDebt: { detected: boolean; severity: string | null; weeks: number };
    comeback: { detected: boolean; confidence: number };
    topPriority: string;
    agentRecommendations?: AgentRecommendations;
    localOpportunities?: LocalOpportunities;
  };
  processingInfo: {
    agentsUsed: string[];
    fallbackLevel: 0 | 1 | 2 | 3;
    durationMs: number;
    orchestrationType: 'full' | 'single' | 'algorithms' | 'static';
  };
  traceId: string;
  traceUrl: string;
}
```

## Testing

### Manual Testing

1. Navigate to onboarding (`/`)
2. Verify tips panel appears below "Financial Coach"
3. Click refresh button - tip should change
4. Progress through steps - tips should change context
5. Add skills like "Python" - verify skill-specific tips appear
6. Complete onboarding - verify celebration tip

### Automated Testing (Future)

```typescript
describe('OnboardingTips', () => {
  it('shows greeting tips on greeting step', () => {
    const { getByText } = render(
      <OnboardingTips
        currentStep="greeting"
        profileData={{}}
        isComplete={false}
      />
    );
    expect(getByText(/get started/i)).toBeInTheDocument();
  });

  it('shows skill-specific tips when skills match', () => {
    const { getByText } = render(
      <OnboardingTips
        currentStep="skills"
        profileData={{ skills: ['Python'] }}
        isComplete={false}
      />
    );
    expect(getByText(/coding skills/i)).toBeInTheDocument();
  });
});
```

## Files

| File | Purpose |
|------|---------|
| `components/chat/OnboardingTips.tsx` | Tips panel component |
| `config/onboardingTipRules.ts` | Static tip rules |
| `components/chat/OnboardingChat.tsx` | Integration point |
| `routes/api/tips.ts` | API with onboarding context |
| `components/suivi/BrunoTips.tsx` | Suivi page tips (LLM) |
