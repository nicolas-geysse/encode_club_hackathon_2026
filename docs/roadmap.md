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

### Recent Fixes (January 2026)

- **Database Stability**: Centralized `_db.ts` with absolute path resolution
- **Error Handling**: All API routes return proper error responses (no crashes)
- **Fallback System**: localStorage backup when API unavailable
- **Onboarding Flow**: Checks API first, then localStorage

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

### Phase 2: Core Features (In Progress)

- [ ] **Plan Generation**: AI-generated financial plans
- [ ] **Budget Tracking**: Track income/expenses vs plan
- [ ] **Goal Progress**: Visual progress indicators
- [ ] **Notifications**: Reminders and alerts

### Phase 3: Enhanced UX

- [ ] **Profile Switching**: Multiple profiles/scenarios
- [ ] **What-If Scenarios**: Clone profile for simulations
- [ ] **Achievement System**: Gamification elements
- [ ] **Dark Mode**: Theme toggle

### Phase 4: Advanced Features

- [ ] **Opik Integration**: LLM observability
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
