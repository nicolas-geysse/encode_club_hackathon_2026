# Social & Community Impact — Feature Specification

**App:** Stride — Student Financial Health Navigator
**Context:** Encode Club Hackathon 2026 (Financial Health track, Comet/Opik sponsor)
**Status:** Vision document — prioritized by feasibility tier

---

## 1. Why Social Matters for Student Finance

Students don't manage money in isolation. They share apartments, split subscriptions, lend textbooks, borrow gear, and trade skills. A financial health app that ignores this **circular economy** misses the #1 lever students actually use to survive: each other.

**Stride's angle:** We don't build "yet another marketplace". We make the **social dimension of money visible and actionable** — karma rewards community behavior, missions turn sharing into measurable financial impact, and the app learns that lending your drill saves someone €50 while earning you trust.

### Core Principles

| Principle | Meaning |
|-----------|---------|
| **Personal-first** | Social features enhance the personal finance journey, never replace it |
| **Incentive-aligned** | Contributing to the community directly improves your own financial metrics |
| **Trust by design** | Karma tiers gate access — you earn trust through reliability |
| **Observable** | Every social action is traced (Opik) and impacts your goal progress |

---

## 2. What Already Exists (Foundation)

Stride already has a complete personal karma economy. This is the foundation everything builds on.

### 2.1 Trade System
- 4 action types: **sell**, **lend**, **borrow**, **trade**
- Status workflow: `pending → active → completed`
- Partner tracking (name-based, no peer profiles)
- Inventory integration (items auto-convert to sell trades)
- DB table: `trades` with `profile_id`, `type`, `name`, `partner`, `value`, `status`

### 2.2 Karma Scoring
| Action | Points | Rationale |
|--------|--------|-----------|
| Lend | +50 | Rewards contributing capital |
| Trade | +30 | Mutual benefit, both gain |
| Borrow | +20 | Saves money, lower contribution |

**Tiers:**
- Newcomer (0-99) 🌱 — Starting out
- Helper (100-499) 🤝 — Active contributor
- Community Star (500+) ⭐ — Trusted member

**Energy bonus:** +1% per 50 karma (capped +10%) — community involvement literally improves wellbeing.

### 2.3 Karma in the User Journey
- **Swipe scenarios** include karma actions (lend/trade/borrow) with point display
- **Missions** track karma completion alongside financial missions
- **Achievements** reward community behavior (Community Helper, Sharing Champion, Karma Legend)
- **Progress page** shows karma in the goal tracking context

### 2.4 What Does NOT Exist
- No multi-user infrastructure (no peer profiles, no social graph)
- No marketplace discovery (trades are self-declared, not matched)
- No leaderboards, challenges, or shared goals
- No peer ratings or trust verification
- No notification system for social events

---

## 3. Feature Tiers — Prioritized by Feasibility

### Tier Legend

| Tier | Effort | Scope | For Hackathon? |
|------|--------|-------|----------------|
| **T0 — Demo-ready** | < 2h each | UI-only, simulated data | Yes — polish what exists |
| **T1 — Quick wins** | 2-4h each | Small backend + UI | Yes — if time permits |
| **T2 — Significant** | 1-2 days each | New tables, APIs, agents | Stretch goal |
| **T3 — Full vision** | Multi-sprint | Multi-user infra | Post-hackathon roadmap |

---

## 4. T0 — Demo-Ready Polish (What We Can Show Now)

### 4.1 Karma Wallet Card on Progress Page

**What:** A dedicated card showing karma breakdown (not just total score) alongside financial progress. Makes the social impact *visible* as part of the goal journey.

**Display:**
```
┌─ 🤝 Community Impact ───────────────────────────────┐
│  Karma: 180 pts (Helper)  ████████░░ → 500 (Star)   │
│                                                       │
│  📦 3 items lent    → saved others €120              │
│  🔄 2 trades done   → mutual value €80              │
│  📥 1 item borrowed → saved you €50                 │
│                                                       │
│  Your community actions saved €170 total             │
└───────────────────────────────────────────────────────┘
```

**Implementation:** Derive from existing `trades` table (completed items with values). Pure frontend computation — no backend changes.

**Files:** New section in `progress.tsx` or standalone `KarmaWallet` component.

### 4.2 Social Impact in Mission Completion

**What:** When completing a karma mission, show the *social framing* — not just "+50 karma" but "You helped Alice save €50 by lending your textbook".

**Implementation:** Enhance the mission completion toast/proactive message to include partner name and estimated savings for the other party.

**Files:** `progress.tsx` → `handleMissionComplete()`, toast message formatting.

### 4.3 Community Stats in BrunoTips

**What:** Bruno's AI tips already consider karma score. Add explicit social tips:
- "You've helped 3 people this month — that's why your energy bonus is +6%"
- "Lending your camping gear could earn +50 karma and help someone save €80"

**Implementation:** Add karma-aware tip templates to the BrunoTips prompt context.

---

## 5. T1 — Quick Wins (Small Backend + UI)

### 5.1 "Impact Board" — Personal Social Dashboard

**What:** A lightweight view (new tab section or card) showing the user's cumulative community impact in financial terms.

**Metrics:**
| Metric | Source | Calculation |
|--------|--------|-------------|
| Money saved by borrowing | `trades` WHERE type='borrow' AND status='completed' | SUM(value) |
| Money saved for others (lending) | `trades` WHERE type='lend' AND status='completed' | SUM(value) |
| Items kept from landfill | `trades` WHERE type='trade' AND status='completed' | COUNT |
| Estimated CO₂ saved | All completed trades | COUNT × 2.5 kg (avg item reuse) |
| Equivalent hours of work avoided | Total money saved ÷ minHourlyRate | Computed |

**Why it matters for judges:** Makes the *social impact of financial behavior* measurable and traceable (Opik spans).

**Implementation:** New API endpoint `/api/impact` that queries trades table + computes metrics. Frontend card component.

### 5.2 Karma Tier Perks (Gamification Depth)

**What:** Each karma tier unlocks a visible perk, giving users a reason to progress.

| Tier | Perk | Implementation |
|------|------|----------------|
| Newcomer 🌱 | Basic trade features | Already exists |
| Helper 🤝 | "Trusted" badge on trades + priority in Bruno tips | Badge in TradeTab cards |
| Star ⭐ | Special achievement + golden celebration + exclusive Bruno advice | Achievement trigger |

**Implementation:** Conditional rendering based on `karmaResult().tier` in TradeTab and BrunoTips.

### 5.3 Simulated "Campus Board" (Mocked Discovery)

**What:** A read-only feed of "nearby students" with items available — **simulated data** for demo purposes. Shows the *vision* of peer discovery without multi-user infra.

**Display:**
```
┌─ 🏫 Campus Board (Demo) ────────────────────────────┐
│                                                       │
│  📚 Marine (300m) — Organic Chemistry textbook        │
│     Lend for 2 weeks · ⭐ Star · [I need this]       │
│                                                       │
│  🔧 Thomas (500m) — Power drill                      │
│     Borrow · 🤝 Helper · [I need this]               │
│                                                       │
│  🎸 Sofia (1.2km) — Guitar for jam sessions          │
│     Trade for keyboard lessons · 🌱 · [Interested]   │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Implementation:** Hardcoded JSON seed data (~10 items) displayed in a card list. Clicking "I need this" adds to user's own Trade tab as a borrow intent. Shows the vision without any multi-user backend.

**Files:** New `CampusBoardDemo` component, seed data in a JSON file.

---

## 6. T2 — Significant Features (Stretch Goals)

### 6.1 Karma Economy V2 — Collateral & Trust

Inspired by the marketplace spec's "Anti-Parasite" system.

**Current problem:** Borrowing gives +20 karma — it *rewards* taking. It should *cost* trust temporarily.

**Revised model:**

| Action | Karma Impact | Mechanism |
|--------|-------------|-----------|
| Lend item | +50 (permanent) | Reward for contributing |
| Request borrow | -Lock N pts (temporary) | Collateral based on item value |
| Return on time | +10 + unlock collateral | Reward reliability |
| Return late | -50 (penalty) | Trust damage |
| Complete trade | +30 (permanent) | Mutual benefit |

**Parasite filter:** Cannot borrow if `locked_collateral > available_karma`. Forces users to contribute (list items, complete trades) before they can take.

**Implementation:**
- New `karma_transactions` table (type, amount, locked_until, related_trade_id)
- Refactor `useKarma.ts` to read from transaction log instead of simple COUNT
- Add "Karma Wallet" UI: Available vs Locked display

### 6.2 Borrowing Lifecycle State Machine

Expand the trade status from 3 states to a full lifecycle:

```
pending → approved → active (pickup) → returned → completed
                                     → disputed
```

**New fields on trades table:**
- `start_date`, `end_date` (loan duration)
- `lender_rating`, `borrower_rating` (1-5 stars, post-completion)
- `collateral_points` (karma locked during loan)

**Notifications via proactive queue:**
- "Return the textbook tomorrow!" (endDate - 1 day)
- "Alice rated you 5 stars!" (post-completion)

### 6.3 Smart Matching — "Needs" System

**What:** Users declare what they *need* (not just what they *have*). The app matches needs with other users' inventory.

**Flow:**
1. User adds "Need: power drill" to their profile
2. Background agent matches against campus board inventory
3. Proactive chat message: "Thomas (500m) has a drill available"
4. User can initiate borrow request

**Implementation:**
- `needs` table: (profile_id, item_description, category, status)
- Matching agent: simple keyword/category matching on `trades` WHERE type='lend'
- Could use LLM for fuzzy matching ("perceuse" → "drill")

### 6.4 Community Challenges (Monthly Themes)

**What:** Shared monthly missions that encourage collective behavior.

**Examples:**
- "Textbook Exchange Month" — Community goal: 50 textbooks lent/borrowed campus-wide
- "Zero Waste Week" — Sell or trade 10 items instead of throwing away
- "Skill Swap Sprint" — Trade 5 skills (tutoring, cooking, coding...)

**Implementation:**
- `challenges` table with global progress tracking
- Simulated participants for demo (show progress bar filling)
- Personal contribution tracking + bonus karma for participation

---

## 7. T3 — Full Vision (Post-Hackathon Roadmap)

### 7.1 Multi-User Infrastructure

**The big shift:** From single-profile local DB to multi-user backend.

- **Auth layer:** Student email verification (university domains)
- **Shared database:** PostgreSQL or Supabase (replace DuckDB for multi-user)
- **Privacy zones:** Neighborhood-level location (GDPR compliant, already in onboarding)
- **Real-time updates:** WebSocket or SSE for trade notifications

### 7.2 Peer-to-Peer Marketplace

The full "Airbnb of Stuff" vision from the marketplace spec:
- Browse items by category, distance, karma tier
- Interactive item cards in chat (MCPUIRenderer extension)
- Calendar view for item availability (lending schedule)
- Ratings & reviews post-transaction
- Search with RAG-powered semantic matching

### 7.3 Neighborhood Feed in Chat

Bruno becomes a social connector:
- "Nicolas (500m) just listed a Bosch drill — you needed one last week!"
- Interactive cards with [Borrow] / [Add to Needs] actions
- New `marketplace_item` resource type in MCPUIRenderer

### 7.4 Leaderboards & Social Proof

- Campus-wide karma rankings (anonymized by default)
- "This month's top lenders" showcase
- Shareable impact badges ("I saved 50kg CO₂ by sharing")
- Streak tracking: "Helped someone 5 weeks in a row"

### 7.5 Group Goals & Shared Savings

- Flatmates share a savings goal (split rent deposit, group trip fund)
- Shared expense tracking with split calculations
- Group karma bonuses when all members contribute

---

## 8. Opik Tracing Strategy

Every social interaction should be traced for the hackathon's observability requirement.

| Feature | Trace Name | Key Attributes |
|---------|-----------|----------------|
| Karma calculation | `karma.calculate` | score, tier, breakdown |
| Trade completion | `trade.complete` | type, value, partner, karma_awarded |
| Impact metrics | `impact.calculate` | money_saved, co2_saved, items_reused |
| Campus board match | `campus.match` | need, matched_item, distance |
| Challenge progress | `challenge.progress` | challenge_id, contribution, global_progress |
| Social tip generated | `bruno.social_tip` | tip_type, karma_context, energy_bonus |

**Opik dashboard value:** Show judges that social actions have the same observability rigor as financial recommendations.

---

## 9. Implementation Recommendation for Hackathon

Given time constraints, prioritize **what tells the best story** for judges:

### Must-Have (T0 — hours)
1. **Karma Wallet card** on Progress page — shows community impact in € terms
2. **Enhanced completion messages** — social framing for karma missions
3. **Bruno social tips** — karma-aware advice

### Should-Have (T1 — if time permits)
4. **Impact Board** with CO₂/savings metrics — judges love measurable impact
5. **Simulated Campus Board** — shows the vision, even with mock data

### Nice-to-Have (T2 — stretch)
6. **Karma V2 with collateral** — deeper gamification
7. **Community challenge** — even one simulated challenge adds narrative

### The Demo Narrative

> "Stride helps students manage money, but money isn't just personal — students survive through community. When you lend a textbook, you earn karma that boosts your energy score. When you borrow instead of buying, the app tracks the €50 you saved and counts it toward your goal. Our Impact Board shows that this student's community actions saved €170 and kept 8 items from landfill. Every action is traced in Opik — we measure social impact with the same rigor as financial advice."

---

## 10. Appendix: Data Model Extensions

### New Tables (T2+)

```sql
-- Karma transaction log (T2)
CREATE TABLE IF NOT EXISTS karma_transactions (
  id VARCHAR PRIMARY KEY,
  profile_id VARCHAR NOT NULL,
  type VARCHAR NOT NULL,           -- 'earn', 'lock', 'unlock', 'penalty'
  amount INTEGER NOT NULL,
  related_trade_id VARCHAR,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Needs / Wishlist (T2)
CREATE TABLE IF NOT EXISTS needs (
  id VARCHAR PRIMARY KEY,
  profile_id VARCHAR NOT NULL,
  description VARCHAR NOT NULL,
  category VARCHAR,
  status VARCHAR DEFAULT 'active', -- 'active', 'matched', 'fulfilled'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Community Challenges (T2)
CREATE TABLE IF NOT EXISTS challenges (
  id VARCHAR PRIMARY KEY,
  title VARCHAR NOT NULL,
  description VARCHAR,
  target_count INTEGER NOT NULL,
  current_count INTEGER DEFAULT 0,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  reward_karma INTEGER DEFAULT 0
);

-- Challenge contributions (T2)
CREATE TABLE IF NOT EXISTS challenge_contributions (
  id VARCHAR PRIMARY KEY,
  challenge_id VARCHAR NOT NULL,
  profile_id VARCHAR NOT NULL,
  trade_id VARCHAR,
  contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Extended Trades Table (T2)

```sql
ALTER TABLE trades ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS collateral_points INTEGER DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS lender_rating INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS borrower_rating INTEGER;
```
