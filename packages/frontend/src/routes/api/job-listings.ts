/**
 * Job Listings API Route
 *
 * Fetches real job listings from external APIs:
 * - Remotive (remote jobs, no auth required)
 * - Arbeitnow (EU jobs, no auth required)
 *
 * These are ACTUAL job postings, not just nearby businesses.
 *
 * @see docs/bugs-dev/jobs-consolidate.md for API documentation
 */

import type { APIEvent } from '@solidjs/start/server';
import { trace, getTraceUrl, type TraceOptions } from '~/lib/opik';
import { getCachedJobs, setCachedJobs } from './_job-cache';

// =============================================================================
// Types
// =============================================================================

export interface RealJobListing {
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  locationType: 'remote' | 'onsite' | 'hybrid';
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  description: string;
  url: string;
  postedDate: string;
  jobType: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship';
  category: string;
  tags: string[];
  source: 'remotive' | 'arbeitnow' | 'adzuna' | 'jooble';
}

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo: string;
  category: string;
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
  tags?: string[];
}

interface RemotiveResponse {
  'job-count': number;
  jobs: RemotiveJob[];
}

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links: {
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    from: number;
    last_page: number;
    path: string;
    per_page: number;
    to: number;
    total: number;
    terms: string;
    info: string;
  };
}

// =============================================================================
// API Fetchers
// =============================================================================

/**
 * Fetch jobs from Remotive API (remote jobs)
 * No authentication required, just need to credit them
 * Rate limit: max 4 requests/day
 */
async function fetchRemotiveJobs(
  category?: string,
  search?: string,
  limit = 20
): Promise<RealJobListing[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));

  const url = `https://remotive.com/api/remote-jobs?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Stride-Student-App/1.0 (https://stride.app)',
      },
    });

    if (!response.ok) {
      console.error(`[JobListings] Remotive API error: ${response.status}`);
      return [];
    }

    const data: RemotiveResponse = await response.json();

    return data.jobs.map((job) => ({
      id: `remotive_${job.id}`,
      title: job.title,
      company: job.company_name,
      companyLogo: job.company_logo || undefined,
      location: job.candidate_required_location || 'Remote',
      locationType: 'remote' as const,
      salaryMin: parseSalary(job.salary)?.min,
      salaryMax: parseSalary(job.salary)?.max,
      salaryCurrency: parseSalary(job.salary)?.currency,
      description: stripHtml(job.description).slice(0, 500),
      url: job.url,
      postedDate: job.publication_date,
      jobType: mapJobType(job.job_type),
      category: job.category,
      tags: job.tags || [],
      source: 'remotive' as const,
    }));
  } catch (error) {
    console.error('[JobListings] Remotive fetch error:', error);
    return [];
  }
}

/**
 * Fetch jobs from Arbeitnow API (EU jobs)
 * No authentication required, supports CORS
 */
async function fetchArbeitnowJobs(search?: string, page = 1): Promise<RealJobListing[]> {
  const url = `https://www.arbeitnow.com/api/job-board-api?page=${page}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Stride-Student-App/1.0 (https://stride.app)',
      },
    });

    if (!response.ok) {
      console.error(`[JobListings] Arbeitnow API error: ${response.status}`);
      return [];
    }

    const data: ArbeitnowResponse = await response.json();

    let jobs = data.data;

    // Client-side search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      jobs = jobs.filter(
        (job) =>
          job.title.toLowerCase().includes(searchLower) ||
          job.company_name.toLowerCase().includes(searchLower) ||
          job.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    return jobs.map((job) => ({
      id: `arbeitnow_${job.slug}`,
      title: job.title,
      company: job.company_name,
      location: job.location || 'Europe',
      locationType: job.remote ? ('remote' as const) : ('onsite' as const),
      description: stripHtml(job.description).slice(0, 500),
      url: job.url,
      postedDate: new Date(job.created_at * 1000).toISOString(),
      jobType: mapJobType(job.job_types?.[0] || 'full_time'),
      category: inferCategory(job.tags),
      tags: job.tags || [],
      source: 'arbeitnow' as const,
    }));
  } catch (error) {
    console.error('[JobListings] Arbeitnow fetch error:', error);
    return [];
  }
}

// =============================================================================
// Helpers
// =============================================================================

function parseSalary(
  salaryStr: string | undefined
): { min?: number; max?: number; currency?: string } | null {
  if (!salaryStr) return null;

  // Try to extract numbers from salary string
  // Examples: "$50,000 - $70,000", "€40k-60k", "50000-70000 USD"
  const numbers = salaryStr.match(/[\d,]+/g);
  if (!numbers || numbers.length === 0) return null;

  const cleanNumbers = numbers.map((n) => parseInt(n.replace(/,/g, ''), 10));

  // Detect currency
  let currency = 'USD';
  if (salaryStr.includes('€') || salaryStr.toLowerCase().includes('eur')) {
    currency = 'EUR';
  } else if (salaryStr.includes('£') || salaryStr.toLowerCase().includes('gbp')) {
    currency = 'GBP';
  }

  // Handle "k" notation (e.g., "50k")
  if (salaryStr.toLowerCase().includes('k')) {
    return {
      min: cleanNumbers[0] * 1000,
      max: cleanNumbers[1] ? cleanNumbers[1] * 1000 : undefined,
      currency,
    };
  }

  return {
    min: cleanNumbers[0],
    max: cleanNumbers[1],
    currency,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapJobType(
  type: string
): 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship' {
  const typeLower = type.toLowerCase().replace(/[_-]/g, '');
  if (typeLower.includes('fulltime') || typeLower.includes('full')) return 'full_time';
  if (typeLower.includes('parttime') || typeLower.includes('part')) return 'part_time';
  if (typeLower.includes('contract')) return 'contract';
  if (typeLower.includes('freelance')) return 'freelance';
  if (typeLower.includes('intern')) return 'internship';
  return 'full_time';
}

function inferCategory(tags: string[]): string {
  const tagStr = tags.join(' ').toLowerCase();
  if (
    tagStr.includes('software') ||
    tagStr.includes('developer') ||
    tagStr.includes('engineering')
  ) {
    return 'software-dev';
  }
  if (tagStr.includes('design') || tagStr.includes('ux') || tagStr.includes('ui')) {
    return 'design';
  }
  if (tagStr.includes('marketing') || tagStr.includes('seo') || tagStr.includes('content')) {
    return 'marketing';
  }
  if (tagStr.includes('sales') || tagStr.includes('business')) {
    return 'sales';
  }
  if (tagStr.includes('support') || tagStr.includes('customer')) {
    return 'customer-support';
  }
  return 'other';
}

// =============================================================================
// Category Mapping (Remotive categories)
// =============================================================================

const REMOTIVE_CATEGORIES = [
  'software-dev',
  'customer-support',
  'design',
  'marketing',
  'sales',
  'product',
  'business',
  'data',
  'devops',
  'finance',
  'hr',
  'qa',
  'writing',
  'all-others',
] as const;

// Map our prospection categories to Remotive categories
const CATEGORY_MAP: Record<string, string> = {
  'tech-digital': 'software-dev',
  'office-admin': 'business',
  'service-hospitality': 'customer-support',
  'retail-sales': 'sales',
  'tutoring-education': 'all-others',
};

// =============================================================================
// API Handler
// =============================================================================

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const search = url.searchParams.get('search') || undefined;
  const category = url.searchParams.get('category') || undefined;
  const source = url.searchParams.get('source') || 'all'; // 'remotive', 'arbeitnow', 'all'
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const skipCache = url.searchParams.get('refresh') === 'true'; // P2: Allow cache bypass

  // Map category to Remotive category if needed
  const remotiveCategory = category ? CATEGORY_MAP[category] || category : undefined;

  // P2: Check cache first (unless refresh requested)
  if (!skipCache && !search) {
    const cached = await getCachedJobs('job_listings', category || 'all');
    if (cached) {
      console.log(`[JobListings] Cache hit for ${category || 'all'}, ${cached.resultCount} jobs`);
      return new Response(
        JSON.stringify({
          jobs: cached.jobs,
          meta: {
            total: cached.resultCount,
            sources: ['cache'],
            search,
            category,
            cached: true,
            cachedAt: cached.cachedAt.toISOString(),
            expiresAt: cached.expiresAt.toISOString(),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const traceOptions: TraceOptions = {
    source: 'job_listings',
    tags: ['jobs', 'external-api', source],
    input: { search, category, source, limit },
    metadata: {
      'request.type': 'job_listings_search',
      'request.source': source,
      'request.category': category || 'all',
    },
  };

  const result = await trace(
    'jobs.fetch_listings',
    async (ctx) => {
      const allJobs: RealJobListing[] = [];
      const sources: string[] = [];

      // Fetch from Remotive (remote jobs)
      if (source === 'all' || source === 'remotive') {
        const remotiveJobs = await fetchRemotiveJobs(remotiveCategory, search, limit);
        allJobs.push(...remotiveJobs);
        sources.push('remotive');
        ctx.setAttributes({
          'remotive.jobs_count': remotiveJobs.length,
        });
      }

      // Fetch from Arbeitnow (EU jobs)
      if (source === 'all' || source === 'arbeitnow') {
        const arbeitnowJobs = await fetchArbeitnowJobs(search);
        // Limit arbeitnow results
        allJobs.push(...arbeitnowJobs.slice(0, limit));
        sources.push('arbeitnow');
        ctx.setAttributes({
          'arbeitnow.jobs_count': Math.min(arbeitnowJobs.length, limit),
        });
      }

      // Sort by posted date (newest first)
      allJobs.sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime());

      // Limit total results
      const limitedJobs = allJobs.slice(0, limit * 2); // Allow some buffer for multiple sources

      // P2: Save to cache (only if no search query - search results are too specific to cache)
      if (!search && limitedJobs.length > 0) {
        await setCachedJobs('job_listings', category || 'all', limitedJobs);
      }

      ctx.setAttributes({
        'jobs.total_count': limitedJobs.length,
        'jobs.sources': sources.join(','),
        'cache.saved': !search && limitedJobs.length > 0,
      });

      ctx.setOutput({
        jobs: limitedJobs,
        meta: {
          total: limitedJobs.length,
          sources,
          search,
          category,
          cached: false,
          traceUrl: getTraceUrl(ctx.getTraceId() || undefined),
        },
      });

      return {
        jobs: limitedJobs,
        meta: {
          total: limitedJobs.length,
          sources,
          search,
          category,
        },
      };
    },
    traceOptions
  );

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST - Search with more complex filters
 */
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { search, category, sources = ['remotive', 'arbeitnow'], limit = 20 } = body;

    // Redirect to GET with query params
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    params.set('source', sources.join(','));
    params.set('limit', String(limit));

    // Create a mock request for the GET handler
    const getUrl = new URL(event.request.url);
    getUrl.search = params.toString();

    const mockEvent = {
      ...event,
      request: new Request(getUrl.toString(), { method: 'GET' }),
    };

    return GET(mockEvent as APIEvent);
  } catch (error) {
    console.error('[JobListings] POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
