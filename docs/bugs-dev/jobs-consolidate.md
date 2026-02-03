# Jobs Tab Consolidation & Improvements

## Current State

The Jobs/Prospection tab currently:
1. **Google Places API** - Searches nearby businesses by category (restaurants, retail, etc.)
2. **Platform suggestions** - Static list of gig platforms (Uber Eats, TaskRabbit, etc.)
3. **Job scoring** - Scores jobs based on skills match, certifications, hourly rate, effort level
4. **TOP 10 features** - Per-category and global TOP 10 with Deep Search
5. **Leads management** - Save, track status, view on map

## Identified Improvement Areas

### 1. Real Job Listings Integration

**Problem**: Currently we show *places* (businesses) not actual *job postings*. A restaurant appearing doesn't mean they're hiring.

**Solution Options**:

| Option | API | Pros | Cons |
|--------|-----|------|------|
| **A. Indeed API** | Indeed Publisher API | Large job database, student jobs | Requires approval, rate limits |
| **B. Adzuna API** | Adzuna API | Free tier, good coverage EU | Limited customization |
| **C. JSearch (RapidAPI)** | LinkedIn/Indeed aggregator | Easy integration, multiple sources | Paid after free tier |
| **D. Jooble API** | Jooble | Free, 70+ countries | Less structured data |
| **E. Scraped aggregation** | Custom scraper | Full control | Maintenance burden, ToS issues |

**Recommended**: Start with **Adzuna API** (free tier, good EU coverage) or **JSearch** (aggregates multiple sources).

**Implementation**:
```typescript
// New API route: /api/prospection/jobs
interface RealJobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary_min?: number;
  salary_max?: number;
  description: string;
  url: string;
  posted_date: string;
  source: 'indeed' | 'linkedin' | 'adzuna' | 'jooble';
}
```

---

### 2. Hybrid Search: Places + Real Jobs

**Concept**: Combine both approaches for richer results:

```
Category Search
    ├── Google Places (nearby businesses)
    │   └── "Potential employers near you"
    │
    └── Job Board API (actual listings)
        └── "Active job postings"
```

**UI Enhancement**:
- Tab or toggle: "Places Near Me" vs "Job Listings"
- Or mixed view with clear source badges

---

### 3. Job Freshness & Caching

**Problem**: Deep Search hits many APIs → slow, expensive.

**Solutions**:

1. **Server-side cache** (DuckDB table):
```sql
CREATE TABLE job_cache (
  id VARCHAR PRIMARY KEY,
  category_id VARCHAR,
  location_hash VARCHAR,  -- hash of lat/lng/radius
  job_data JSON,
  fetched_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

2. **Background refresh**: Cron job or on-demand refresh button

3. **Incremental Deep Search**: Only search categories not in cache

---

### 4. Improved Job Scoring Algorithm

**Current factors**:
- Skills match (30%)
- Demand/availability (25%)
- Effort level (25%)
- Rest/flexibility (20%)

**Proposed additions**:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Commute time** | 15% | Closer = better score |
| **Schedule fit** | 10% | Match user's available hours |
| **Salary vs target** | 10% | How much it helps reach savings goal |
| **Experience match** | 10% | Junior-friendly jobs boost for students |
| **Company rating** | 5% | If available from source |

**Personalization**: Learn from Swipe feedback to adjust weights per user.

---

### 5. Smart Notifications

**Concept**: Alert users when good matches appear.

**Triggers**:
- New job posted in saved category
- Job matching TOP 10 criteria
- Salary increase on watched employer

**Implementation**:
- Store notification preferences
- Background check against job_cache
- Push via browser notifications or email

---

### 6. Application Tracking Integration

**Current**: Leads have status (saved, applied, interview, offer, rejected)

**Enhancement**:
- Auto-detect application status from email (opt-in)
- Calendar integration for interviews
- Follow-up reminders

---

## Priority Ranking

| Priority | Improvement | Effort | Impact |
|----------|-------------|--------|--------|
| **P1** | Real job listings (Adzuna/JSearch) | Medium | High |
| **P2** | Job caching (DuckDB) | Low | Medium |
| **P3** | Hybrid Places + Jobs view | Medium | High |
| **P4** | Improved scoring with commute | Low | Medium |
| **P5** | Smart notifications | High | Medium |
| **P6** | Application tracking | High | Low |

---

## Implementation Plan

### Phase 1: Real Job Listings (P1)

1. **Select API**: Adzuna (free tier, EU focus)
2. **Create endpoint**: `/api/prospection/job-listings`
3. **Integrate into search flow**: Add toggle or secondary results
4. **Score real jobs**: Adapt scoring algorithm

### Phase 2: Caching & Performance (P2)

1. **Add job_cache table** to DuckDB
2. **Cache Google Places results** (TTL: 24h)
3. **Cache job listings** (TTL: 6h - jobs are more dynamic)
4. **Add "Refresh" button** to force re-fetch

### Phase 3: Hybrid View (P3)

1. **UI tabs**: "Nearby Places" | "Job Listings" | "All"
2. **Unified scoring**: Same algorithm for both sources
3. **Clear source badges** on each card

### Phase 4: Scoring Improvements (P4)

1. **Add commute factor** (already have distance)
2. **Add schedule fit** (requires user availability input)
3. **Connect to Goals tab** for salary vs target scoring

---

## API Research (Updated 2026-02-03)

### TIER 1: No Authentication Required (Recommended for Hackathon)

#### Remotive API (Remote Jobs)
- **Endpoint**: `https://remotive.com/api/remote-jobs`
- **Auth**: NONE required
- **Cost**: FREE
- **Rate Limit**: Max 4 requests/day (data updates slowly)
- **Jobs**: ~2000 active remote listings
- **Requirement**: Must link back to Remotive and credit as source
- **Filters**: category, company_name, search, limit
- **Docs**: https://github.com/remotive-com/remote-jobs-api

```bash
# Example request
curl "https://remotive.com/api/remote-jobs?category=software-dev&limit=10"
```

#### Arbeitnow API (EU Jobs)
- **Endpoint**: `https://www.arbeitnow.com/api/job-board-api`
- **Auth**: NONE required
- **Cost**: FREE
- **CORS**: Supported (can call from browser!)
- **Focus**: Europe, visa sponsorship, remote, 4-day work week
- **Pagination**: 100 jobs/page
- **Docs**: https://documenter.getpostman.com/view/18545278/UVJbJdKh

```bash
# Example request
curl "https://www.arbeitnow.com/api/job-board-api"
```

---

### TIER 2: Free with API Key Registration

#### Adzuna API
- **Endpoint**: `https://api.adzuna.com/v1/api/jobs/{country}/search/{page}`
- **Auth**: API Key (free signup)
- **Free tier**: 250 requests/day
- **Countries**: US, UK, DE, FR, AU, etc.
- **Signup**: https://developer.adzuna.com/signup
- **Docs**: https://developer.adzuna.com/

#### Jooble API
- **Endpoint**: `https://jooble.org/api/{api_key}`
- **Auth**: API Key (free registration form)
- **Cost**: FREE
- **Countries**: 70+
- **Signup**: https://jooble.org/api/about
- **Docs**: https://help.jooble.org/en/support/solutions/articles/60001448238

---

### TIER 3: Paid/Limited Free Tier

#### JSearch (RapidAPI)
- **Endpoint**: `https://jsearch.p.rapidapi.com/search`
- **Free tier**: 200 requests/month only
- **Sources**: LinkedIn, Indeed, Glassdoor, ZipRecruiter
- **Docs**: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch

---

## Decision: API Selection

**Primary Choice**: Use **Remotive + Arbeitnow** (both FREE, no signup required!)

| API | Why | Best For |
|-----|-----|----------|
| **Remotive** | No auth, good data quality | Remote tech jobs |
| **Arbeitnow** | No auth, EU focus, CORS support | European students |

**Future Enhancement** (if needed): Add Adzuna/Jooble with optional API keys in `.env`

---

## Important: Geographic Distinction

### Two Types of Job Sources

| Source | Type | Location |
|--------|------|----------|
| **Google Places** | Nearby businesses | Based on user's lat/lng (local) |
| **Remotive/Arbeitnow** | Job postings | **REMOTE** - work from anywhere |

### UX Clarification

1. **TOP 10 of All Categories** → Nearby places from Google Places (local businesses)
2. **Remote Job Listings** → Actual job postings that can be done remotely

The "Remote Job Listings" category is **location-independent** because:
- Remotive only lists remote jobs
- These jobs don't require commuting
- Students can work from home/dorm

This is actually a **feature**, not a bug - remote jobs are perfect for students who:
- Have flexible schedules
- Don't have transportation
- Want to work between classes

---

## Implementation Checklist

### Phase 1: Real Job API Integration
- [x] Document API options and requirements
- [x] Create `/api/job-listings` endpoint
- [x] Integrate Remotive API (remote jobs)
- [x] Integrate Arbeitnow API (EU jobs)
- [x] Create unified `RealJobListing` type
- [x] Add job source badges in UI
- [x] Add "Real Job Listings" category in CategoryExplorer
- [x] Handle special category in ProspectionTab
- [x] Add Opik tracing for job listing searches

### Phase 2: Hybrid Search (Future)
- [ ] Add "Job Listings" tab in ProspectionList
- [ ] Combine with existing Google Places results
- [ ] Apply scoring algorithm to real jobs

### Phase 3: Caching (Future)
- [ ] Add `job_listings_cache` table
- [ ] TTL-based cache invalidation
- [ ] Background refresh option

---

## Environment Variables

```bash
# Optional - only needed if using TIER 2 APIs
ADZUNA_APP_ID=         # From developer.adzuna.com
ADZUNA_APP_KEY=        # From developer.adzuna.com
JOOBLE_API_KEY=        # From jooble.org/api/about
```

---

## Next Steps

1. [x] Research and document APIs
2. [ ] Create `/api/job-listings.ts` route
3. [ ] Test Remotive & Arbeitnow responses
4. [ ] Design unified job card format
5. [ ] Integrate into CategoryExplorer/ProspectionList
6. [ ] Add Opik tracing for job listing searches
