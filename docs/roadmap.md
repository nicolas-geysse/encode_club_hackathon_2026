# Stride - Roadmap

> Navigate student life, one smart step at a time

## Current Status

### Working Features

| Feature | Status | Notes |
|---------|--------|-------|
| **Onboarding Chat** | ✅ Working | Bruno conversational onboarding |
| **Profile Creation** | ✅ Working | DuckDB + localStorage fallback |
| **Profile Persistence** | ✅ Working | Centralized DB with auto-init |
| **Time Simulation** | ✅ Working | Advance/reset simulated time |
| **API Endpoints** | ✅ Working | `/api/profiles`, `/api/simulation` |
| **LLM Integration** | ✅ Working | Groq API for chat |
| **Screen 1 (Mon Plan)** | ✅ Working | 6 tabs functional with algorithms |
| **Screen 2 (Suivi)** | ✅ Working | Timeline, Energy, Comeback, Missions |
| **7 Mastra Agents** | ✅ Working | budget-coach, job-matcher, guardian, etc. |
| **DuckPGQ Graph** | ✅ Working | 31 nodes, 47 edges (skills→jobs) |
| **Swipe Preference Learning** | ✅ Working | Frontend + Backend |
| **Retroplanning** | ✅ Working | 773 lignes, capacity-aware |

### Core Algorithms (Backend)

| Algorithm | File | Status |
|-----------|------|--------|
| **Skill Arbitrage** | `algorithms/skill-arbitrage.ts` | ✅ Complete |
| **Energy Debt** | `algorithms/energy-debt.ts` | ✅ Complete |
| **Comeback Detection** | `algorithms/comeback-detection.ts` | ✅ Complete |
| **Retroplanning** | `algorithms/retroplanning.ts` | ✅ Complete |

### Recent Updates (January 2026)

- **Algorithm Consolidation**: Extracted frontend algorithms to backend MCP server
- **Skill Arbitrage**: Full 4-criteria scoring (rate 30%, demand 25%, effort 25%, rest 20%)
- **Job Matcher Enhancement**: New `match_jobs_arbitrage` tool with energy-aware weights
- **Database Stability**: Centralized `_db.ts` with absolute path resolution
- **Error Handling**: All API routes return proper error responses
- **Fallback System**: localStorage backup when API unavailable

---

## Architecture

```
packages/
├── frontend/          # SolidStart application
│   ├── src/
│   │   ├── routes/
│   │   │   ├── api/
│   │   │   │   ├── _db.ts        # Centralized DuckDB
│   │   │   │   ├── profiles.ts   # Profile CRUD
│   │   │   │   ├── simulation.ts # Time simulation
│   │   │   │   └── chat.ts       # LLM chat
│   │   │   ├── index.tsx         # Onboarding page
│   │   │   └── plan.tsx          # Plan page
│   │   ├── components/
│   │   │   └── chat/
│   │   │       └── OnboardingChat.tsx
│   │   └── lib/
│   │       ├── profileService.ts
│   │       └── simulationService.ts
│   └── data/                     # DuckDB database location
└── mcp-server/        # MCP server (optional)
```

---

## Roadmap

### Phase 1: Stabilisation ✅ DONE

- [x] Fix DuckDB path resolution
- [x] Centralize database connection
- [x] Add error handling to all API routes
- [x] Add localStorage fallback
- [x] Create API test scripts

### Phase 2: Core Features ✅ DONE

- [x] **Skill Arbitrage Algorithm**: 4-criteria multi-weighted scoring
- [x] **Energy Debt Detection**: Consecutive low-week detection with severity levels
- [x] **Comeback Mode**: Recovery detection + catch-up plan generation
- [x] **Job Matcher Integration**: Arbitrage scoring in job recommendations
- [x] **Retroplanning**: Capacity-aware goal planning (773 lines)
- [x] **Swipe Preference Learning**: Real-time weight updates from user decisions

### Phase 3: Enhanced UX ✅ MOSTLY DONE

- [x] **Profile Switching**: Multiple profiles/scenarios supported
- [x] **What-If Scenarios**: Profile duplication (parent_profile_id)
- [x] **Achievement System**: Comeback King, Self-Care Champion, etc.
- [ ] **Dark Mode**: Theme toggle (not started)

### Phase 4: Advanced Features (In Progress)

- [x] **Opik Integration**: Service implemented with fallback to console
- [ ] **Opik Cloud Verification**: Need to verify `.env` configuration
  - Current `.env` has incorrect `OPIK_BASE_URL` (points to Vite port)
  - For Opik Cloud: Remove `OPIK_BASE_URL`, add `OPIK_WORKSPACE`
- [ ] **Export/Import**: Profile backup/restore
- [ ] **Analytics Dashboard**: Spending insights
- [ ] **Mobile PWA**: Offline support

---

## Testing

### Manual API Tests

```bash
# Start the server
cd packages/frontend && pnpm dev

# Run API tests (in another terminal)
./scripts/test-api.sh http://localhost:3000
```

### Database Tests

```bash
# Run DuckDB tests
cd packages/frontend
npx tsx src/routes/api/_db.test.ts
```

### Build Verification

```bash
# Full build + lint check
pnpm build && pnpm lint
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DUCKDB_DIR` | `./data` | Directory for DuckDB files |
| `DUCKDB_PATH` | `./data/stride.duckdb` | Full path to database |
| `GROQ_API_KEY` | - | Required for LLM chat |

---

## Known Issues

1. **Hot Reload**: Schema initialization flag resets on hot reload (minimal impact)
2. **Large Files**: No pagination on profile list (OK for typical usage)

---

## Contributing

1. Check existing issues before starting work
2. Run `pnpm lint && pnpm build` before committing
3. Follow existing code patterns
4. Add tests for new API endpoints
