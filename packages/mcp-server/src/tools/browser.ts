/**
 * Agent Browser Tool - Geolocation-aware job search
 *
 * Uses agent-browser for intelligent web scraping with geolocation.
 * Requires: npm install -g agent-browser && agent-browser install
 *
 * Features:
 * - Geolocation-aware job search
 * - Accessible snapshots (93% less context than full DOM)
 * - Semantic refs for element interaction
 *
 * @see https://github.com/vercel-labs/agent-browser
 */

import { trace, createSpan } from '../services/opik.js';

/**
 * Job search result from browser scraping
 */
export interface JobSearchResult {
  title: string;
  company?: string;
  location?: string;
  salary?: string;
  url?: string;
  source: string;
  snippet?: string;
}

/**
 * Browser tool configuration
 */
export interface BrowserConfig {
  /** Enable geolocation */
  enableGeolocation?: boolean;
  /** Default latitude for geolocation */
  defaultLat?: number;
  /** Default longitude for geolocation */
  defaultLng?: number;
  /** Timeout in ms for browser operations */
  timeout?: number;
}

// Default config
const defaultConfig: BrowserConfig = {
  enableGeolocation: true,
  timeout: 30000,
};

/**
 * Check if agent-browser is available
 */
export async function checkAgentBrowserAvailable(): Promise<boolean> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    await execAsync('which agent-browser', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Set geolocation for browser session
 *
 * @param lat - Latitude
 * @param lng - Longitude
 */
export async function setGeolocation(lat: number, lng: number): Promise<void> {
  return createSpan('browser.setGeolocation', async (span) => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    await execAsync(`agent-browser set geo ${lat} ${lng}`, {
      timeout: defaultConfig.timeout,
    });

    span.setAttributes({
      'geo.lat': lat,
      'geo.lng': lng,
    });
  });
}

/**
 * Search for jobs near a location
 *
 * @param params - Search parameters
 * @returns Array of job search results
 */
export async function searchJobsNearby(params: {
  skills: string[];
  city: string;
  lat?: number;
  lng?: number;
  maxResults?: number;
}): Promise<{ jobs: JobSearchResult[]; query: string; source: string }> {
  return trace('browser.searchJobs', async (span) => {
    const { skills, city, lat, lng, maxResults = 10 } = params;

    // Check if agent-browser is available
    const isAvailable = await checkAgentBrowserAvailable();

    if (!isAvailable) {
      span.setAttributes({
        'browser.available': false,
        fallback: true,
      });

      // Return mock data as fallback
      return {
        jobs: generateMockJobs(skills, city, maxResults),
        query: `${skills.slice(0, 3).join(' ')} jobs ${city}`,
        source: 'mock',
      };
    }

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Set geolocation if provided
    if (lat !== undefined && lng !== undefined) {
      await setGeolocation(lat, lng);
    }

    // Build search query
    const searchQuery = skills.slice(0, 3).join(' ') + ' jobs ' + city;
    const encodedQuery = encodeURIComponent(searchQuery);

    try {
      // Navigate to Indeed (or other job board)
      await execAsync(`agent-browser open "https://www.indeed.com/jobs?q=${encodedQuery}"`, {
        timeout: defaultConfig.timeout,
      });

      // Get accessible snapshot
      const { stdout: snapshot } = await execAsync('agent-browser snapshot', {
        timeout: defaultConfig.timeout,
      });

      // Parse jobs from snapshot (simplified - would need more robust parsing)
      const jobs = parseJobsFromSnapshot(snapshot, maxResults);

      span.setAttributes({
        'browser.available': true,
        'search.city': city,
        'search.skills': skills.join(','),
        'results.count': jobs.length,
        source: 'indeed',
      });

      return {
        jobs,
        query: searchQuery,
        source: 'indeed',
      };
    } catch (error) {
      span.setAttributes({
        'browser.available': true,
        error: (error as Error).message,
        fallback: true,
      });

      // Return mock data on error
      return {
        jobs: generateMockJobs(skills, city, maxResults),
        query: searchQuery,
        source: 'mock',
      };
    }
  });
}

/**
 * Parse job listings from agent-browser snapshot
 * Note: This is a simplified parser - would need refinement for production
 */
function parseJobsFromSnapshot(snapshot: string, maxResults: number): JobSearchResult[] {
  const jobs: JobSearchResult[] = [];

  // Simple pattern matching for job listings
  // In production, would use more sophisticated parsing
  const lines = snapshot.split('\n');
  let currentJob: Partial<JobSearchResult> | null = null;

  for (const line of lines) {
    // Look for job title patterns
    if (line.includes('job_title') || line.includes('jobTitle')) {
      if (currentJob && currentJob.title) {
        jobs.push({
          ...currentJob,
          source: 'indeed',
        } as JobSearchResult);

        if (jobs.length >= maxResults) break;
      }
      currentJob = { title: line.trim() };
    }

    // Look for company name
    if (currentJob && (line.includes('company') || line.includes('employer'))) {
      currentJob.company = line.trim();
    }

    // Look for location
    if (currentJob && line.includes('location')) {
      currentJob.location = line.trim();
    }

    // Look for salary
    if (currentJob && (line.includes('salary') || line.includes('€') || line.includes('$'))) {
      currentJob.salary = line.trim();
    }
  }

  // Add last job if exists
  if (currentJob && currentJob.title && jobs.length < maxResults) {
    jobs.push({
      ...currentJob,
      source: 'indeed',
    } as JobSearchResult);
  }

  return jobs;
}

/**
 * Generate mock job data for fallback
 */
function generateMockJobs(skills: string[], city: string, count: number): JobSearchResult[] {
  const templates = [
    {
      titleTemplate: '{skill} Developer',
      company: 'Tech Startup',
      salaryRange: '35-45k',
    },
    {
      titleTemplate: '{skill} Tutoring',
      company: 'Education Platform',
      salaryRange: '15-25€/h',
    },
    {
      titleTemplate: 'Freelance {skill}',
      company: 'Various Clients',
      salaryRange: '20-40€/h',
    },
    {
      titleTemplate: '{skill} Intern',
      company: 'Local Company',
      salaryRange: '800-1200€/month',
    },
    {
      titleTemplate: 'Part-time {skill}',
      company: 'Remote',
      salaryRange: '15-20€/h',
    },
  ];

  const jobs: JobSearchResult[] = [];

  for (let i = 0; i < Math.min(count, templates.length * skills.length); i++) {
    const template = templates[i % templates.length];
    const skill = skills[i % skills.length];

    jobs.push({
      title: template.titleTemplate.replace('{skill}', skill),
      company: template.company,
      location: city,
      salary: template.salaryRange,
      source: 'mock',
      snippet: `Looking for a student with ${skill} skills in ${city}`,
    });
  }

  return jobs;
}

/**
 * Get coordinates for a city (simplified)
 * In production, would use a geocoding API
 */
export function getCityCoordinates(city: string): { lat: number; lng: number } | undefined {
  const cityCoords: Record<string, { lat: number; lng: number }> = {
    paris: { lat: 48.8566, lng: 2.3522 },
    lyon: { lat: 45.764, lng: 4.8357 },
    marseille: { lat: 43.2965, lng: 5.3698 },
    london: { lat: 51.5074, lng: -0.1278 },
    berlin: { lat: 52.52, lng: 13.405 },
    amsterdam: { lat: 52.3676, lng: 4.9041 },
    'new york': { lat: 40.7128, lng: -74.006 },
    'san francisco': { lat: 37.7749, lng: -122.4194 },
  };

  const cityLower = city.toLowerCase();
  for (const [name, coords] of Object.entries(cityCoords)) {
    if (cityLower.includes(name)) {
      return coords;
    }
  }

  return undefined;
}

/**
 * MCP Tool definitions for browser operations
 */
export const BROWSER_TOOLS = {
  search_jobs_nearby: {
    description:
      'Search for jobs near a specific location using browser automation. Uses geolocation for more relevant results.',
    inputSchema: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skills to search for',
        },
        city: {
          type: 'string',
          description: 'City to search in',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results',
          default: 10,
        },
      },
      required: ['skills', 'city'],
    },
  },

  check_browser_available: {
    description: 'Check if agent-browser is installed and available',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
};

/**
 * Handle browser tool calls
 */
export async function handleBrowserTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'search_jobs_nearby': {
      const skills = args.skills as string[];
      const city = args.city as string;
      const maxResults = (args.max_results as number) || 10;

      // Get city coordinates
      const coords = getCityCoordinates(city);

      const result = await searchJobsNearby({
        skills,
        city,
        lat: coords?.lat,
        lng: coords?.lng,
        maxResults,
      });

      return {
        type: 'table',
        params: {
          title: `Jobs in ${city}`,
          columns: [
            { key: 'title', label: 'Job' },
            { key: 'company', label: 'Company' },
            { key: 'salary', label: 'Salary' },
            { key: 'source', label: 'Source' },
          ],
          rows: result.jobs.map((j) => ({
            title: j.title,
            company: j.company || '-',
            salary: j.salary || '-',
            source: j.source,
          })),
        },
        metadata: {
          query: result.query,
          source: result.source,
          resultsCount: result.jobs.length,
        },
      };
    }

    case 'check_browser_available': {
      const available = await checkAgentBrowserAvailable();
      return {
        type: 'text',
        params: {
          content: available
            ? 'agent-browser is available'
            : 'agent-browser is NOT available. Install with: npm install -g agent-browser && agent-browser install',
          markdown: false,
        },
        metadata: { available },
      };
    }

    default:
      throw new Error(`Unknown browser tool: ${name}`);
  }
}

// Export browser service
export const browser = {
  searchJobsNearby,
  setGeolocation,
  checkAvailable: checkAgentBrowserAvailable,
  getCityCoordinates,
};

export default browser;
