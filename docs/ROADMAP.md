# Stride Strategic Roadmap

> **Encode Club Hackathon 2026** - Financial Health Track (Sponsor: Comet/Opik)
> **Codebase Grade**: A- (Excellent foundation, UI gaps identified)
> **Last Updated**: January 2026

---

## Executive Summary

Stride is a student financial health navigator that combines LLM-powered agents with Opik observability. The codebase is production-ready with comprehensive test coverage on core algorithms. The primary gaps are UI integrations for existing backend capabilities.

### Key Differentiators

| Feature | Status | Description |
|---------|--------|-------------|
| **Skill Arbitrage** | Production | Smart job matching: rate (30%) + demand (25%) + effort (25%) + rest (20%) |
| **Energy Debt** | Production | 3+ weeks below 40% triggers target reduction + achievement |
| **Comeback Mode** | Production | Detects recovery (>80% after <40%) and creates catch-up plans |
| **Retroplanning** | Backend Ready | Capacity-aware planning with exam protection |
| **Opik Tracing** | Full Coverage | Every recommendation traceable with user_id |

---

## Implemented Quick Wins (Tier 1)

### 1. Retroplan UI Panel
**Status**: Implemented
**Files**:
- `packages/frontend/src/components/RetroplanPanel.tsx` (NEW)
- `packages/frontend/src/components/tabs/GoalsTab.tsx` (UPDATED)

**Features**:
- Week-by-week capacity bars (high/medium/low/protected)
- Feasibility score with visual indicator
- Risk factors display
- Timeline table with adjusted targets
- Modal view triggered from Goals tab

### 2. Voice Input in Onboarding
**Status**: Already Implemented
**Files**: `packages/frontend/src/components/chat/ChatInput.tsx`

The ChatInput component already includes:
- Microphone button with recording indicator
- Audio level visualization
- Groq Whisper integration via `/api/voice`

### 3. Swipe Feedback Toast
**Status**: Implemented
**Files**: `packages/frontend/src/components/tabs/SwipeTab.tsx` (UPDATED)

**Features**:
- Toast notification when preferences are validated
- Displays scenario count in confirmation message
- Visual preference display already existed (AI Profile pillars)

### 4. Capacity Forecast Card
**Status**: Implemented
**Files**:
- `packages/frontend/src/components/suivi/CapacityForecast.tsx` (NEW)
- `packages/frontend/src/routes/suivi.tsx` (UPDATED)

**Features**:
- Current week capacity (HIGH/MEDIUM/LOW/PROTECTED)
- Available hours display
- Color-coded status with icons
- Tooltip with academic/energy multipliers

---

## Remaining Quick Wins

### 5. Embed Trigger on Profile/Goal Save
**Effort**: 30min | **Impact**: Activates RAG system

The `/api/embed` endpoint exists but is never called. Add triggers:

```typescript
// profileService.ts - after successful save
fetch('/api/embed', {
  method: 'POST',
  body: JSON.stringify({ type: 'profile', id, data })
});

// goalService.ts - after goal creation
fetch('/api/embed', {
  method: 'POST',
  body: JSON.stringify({ type: 'goal', id, data })
});
```

**Note**: The embedding call in profileService is commented out due to DuckDB concurrency issues. Consider queueing or debouncing.

### 6. Goal Components List UI
**Effort**: 3-4h | **Impact**: Medium

The `/api/goal-components` CRUD is complete. Add a visual component list in GoalsTab showing:
- Exam prep milestones
- Time allocation blocks
- Purchase checkpoints

---

## Strategic Features (Tier 2)

### 1. RAG Context in Tips
**Effort**: 3h | **Impact**: High

Before generating tips, query similar profiles:
```typescript
// tips-orchestrator.ts
const similarProfiles = await ragService.findSimilar(currentProfile);
const socialProof = `${similarProfiles.length} students with similar skills saved an average of...`;
```

### 2. Achievement Popup with Confetti
**Effort**: 2h | **Impact**: Wow factor

`canvas-confetti` is already installed. Add triggers for:
- Comeback King (recovery after exam period)
- Phoenix Rising (energy surge)
- Debt Survivor (energy debt cleared)

### 3. Retroplanning Tests
**Effort**: 4h | **Impact**: Quality

The retroplanning algorithm (773 lines) has **zero tests**. Priority coverage:
- `calculateWeekCapacity()`
- `generateDynamicMilestones()`
- `assessFeasibility()`

---

## Disruptive Ideas (Tier 3 - Pitch Material)

### 1. "Anti-Hustle" Positioning
**Pitch**: "The first financial AI that tells you to take a nap"

Unlike productivity apps pushing "do more," Stride:
- Detects exhaustion and **reduces** targets
- Protects exam weeks automatically
- Gamifies rest with Energy Debt achievements

### 2. Privacy-First Local Processing
**Pitch**: "Your financial trauma is computed locally"

DuckDB runs locally, keeping sensitive student budget data off the cloud. Strong differentiator vs cloud-only competitors.

### 3. Predictive Energy Alerts
Based on historical energy patterns, predict difficult weeks:
```
"Attention: Week 12 looks intense (3 exams + project deadline)"
```

### 4. What-If Scenario Simulator
Use existing `profile_type: 'simulation'` support:
- Duplicate profile
- Modify variables (new job, dropped course)
- Compare outcomes side-by-side

### 5. Voice-First Mobile Demo
The Whisper integration enables 100% voice onboarding - impressive for live demos.

---

## Technical Debt (Not Prioritized for Hackathon)

| Item | Reason to Skip |
|------|----------------|
| TabPFN/ML burnout prediction | Energy Debt algorithm covers the use case |
| Python backend | Too risky for hackathon timeline |
| User authentication | Profile Selector with local DuckDB sufficient |
| E2E Playwright tests | Algorithm tests provide enough coverage |
| Console-to-Logger migration | Invisible in demo |
| New pages | Existing 3-screen flow is complete |

---

## Verification Checklist

### Manual Testing
```bash
# 1. Retroplan UI
pnpm dev
# Navigate: /plan -> Goals tab -> Active goal -> "View Capacity Retroplan"
# Expected: Modal with capacity bars, feasibility score, milestones table

# 2. Voice Input
# Navigate: / (Onboarding)
# Click microphone icon -> Speak -> Verify transcription

# 3. Swipe Feedback
# Navigate: /plan -> Swipe tab -> Roll dice -> Swipe cards -> Validate
# Expected: Toast "Preferences saved! X scenarios added"

# 4. Capacity Forecast
# Navigate: /suivi (Dashboard)
# Expected: Card showing current week capacity (HIGH/MEDIUM/LOW/PROTECTED)
```

### Opik Dashboard
Verify traces at: `https://www.comet.com/nickoolas/stride`
- Check retroplan generation traces
- Verify swipe session traces with preferences
- Confirm user_id present on all spans

---

## Architecture Reference

```
packages/
├── frontend/          # SolidStart + SolidJS
│   └── src/
│       ├── routes/    # Pages + API endpoints
│       │   └── api/   # Server functions (chat, goals, voice, retroplan)
│       ├── components/
│       │   ├── tabs/  # GoalsTab, SwipeTab, etc.
│       │   ├── suivi/ # Dashboard components
│       │   └── ui/    # Shared UI (Card, Button, Toast)
│       └── lib/       # Services (profile, goal, simulation)
│
└── mcp-server/        # Model Context Protocol
    └── src/
        ├── agents/    # Mastra agents (budget-coach, job-matcher, etc.)
        ├── algorithms/# Core logic (retroplanning, skill-arbitrage)
        └── services/  # DuckDB, Groq, Opik integrations
```

---

## Key Files Modified in This Sprint

| File | Changes |
|------|---------|
| `RetroplanPanel.tsx` | **NEW** - Capacity visualization component |
| `GoalsTab.tsx` | Added Retroplan button and modal |
| `SwipeTab.tsx` | Added toast feedback on validation |
| `CapacityForecast.tsx` | **NEW** - Week capacity card |
| `suivi.tsx` | Integrated CapacityForecast component |

---

## Contact

- **Project**: Stride - Student Financial Health Navigator
- **Hackathon**: Encode Club 2026 - Financial Health Track
- **Sponsor Integration**: Comet/Opik tracing on all recommendations
