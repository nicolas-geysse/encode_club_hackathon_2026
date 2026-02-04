/**
 * Prospection Tab Component
 *
 * Main tab for exploring job opportunities beyond declared skills.
 * Phases:
 * 1. idle - Display CategoryExplorer
 * 2. loading - Search in progress
 * 3. results - ProspectionList with sorted jobs
 * 4. complete - Summary + SavedLeads + Map
 */

import { createSignal, Show, createEffect, on } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  CategoryExplorer,
  TOP10_ALL_CATEGORY_ID,
  REAL_JOBS_CATEGORY_ID,
  ProspectionList,
  ProspectionMap,
  SavedLeads,
} from '~/components/prospection';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { BrunoHintV2 } from '~/components/ui/BrunoHintV2';
import {
  RotateCcw,
  MapIcon,
  List,
  Compass,
  Check,
  Bookmark,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MapPin,
} from 'lucide-solid';
import { Slider } from '~/components/ui/Slider';
import { toastPopup } from '~/components/ui/Toast';
import { celebrateBig } from '~/lib/confetti';
import type {
  Lead,
  LeadStatus,
  ProspectionTabProps,
  ProspectionSearchMeta,
} from '~/lib/prospectionTypes';
import { getCategoryById, PROSPECTION_CATEGORIES } from '~/config/prospectionCategories';
import { scoreJobsForProfile, type ScoredJob, type UserProfile } from '~/lib/jobScoring';
import { createLogger } from '~/lib/logger';

const logger = createLogger('ProspectionTab');

type Phase = 'idle' | 'loading' | 'results' | 'complete';
type ViewMode = 'list' | 'map';

// Constant for Wide Search (Top 10 Highlights) - 30km (User requested max)
const DEEP_SEARCH_RADIUS_METERS = 30000;

export function ProspectionTab(props: ProspectionTabProps) {
  const [phase, setPhase] = createSignal<Phase>('idle');
  const [viewMode, setViewMode] = createSignal<ViewMode>('list');
  const [_loadingCategory, setLoadingCategory] = createSignal<string | null>(null);
  const [currentCards, setCurrentCards] = createSignal<ScoredJob[]>([]);
  const [currentCategory, setCurrentCategory] = createSignal<string | null>(null);
  const [searchMeta, setSearchMeta] = createSignal<ProspectionSearchMeta | undefined>(undefined);
  const [leads, setLeads] = createSignal<Lead[]>([]);
  const [highlightedLeadId, setHighlightedLeadId] = createSignal<string | null>(null);
  const [savedJobIds, setSavedJobIds] = createSignal<Set<string>>(new Set());
  const [savedCount, setSavedCount] = createSignal(0);
  // Phase 8b: "My Selection" collapsed by default
  const [showLeadsPanel, setShowLeadsPanel] = createSignal(false);
  // Track ALL jobs from ALL searched categories (for global TOP 10)
  const [allCategoryJobs, setAllCategoryJobs] = createSignal<ScoredJob[]>([]);
  // Track which categories have been searched
  const [searchedCategories, setSearchedCategories] = createSignal<string[]>([]);
  // Track deep search progress
  const [deepSearchProgress, setDeepSearchProgress] = createSignal<string | null>(null);
  // v4.1: User-configurable search radius (in meters)
  const [searchRadius, setSearchRadius] = createSignal(5000);

  // Load existing leads on mount
  createEffect(
    on(
      () => props.profileId,
      async (profileId) => {
        if (!profileId) return;

        try {
          const response = await fetch(`/api/leads?profileId=${profileId}`);
          if (response.ok) {
            const data = await response.json();
            setLeads(data);
          }
        } catch (err) {
          logger.error('Failed to load leads', { error: err });
        }
      }
    )
  );

  // Phase 4: Notify parent when leads change (for Swipe integration)
  createEffect(
    on(
      leads,
      (currentLeads) => {
        props.onLeadsChange?.(currentLeads);
      },
      { defer: true } // Don't fire on initial empty array
    )
  );

  // Handle category selection
  const handleCategorySelect = async (categoryId: string) => {
    setLoadingCategory(categoryId);
    setPhase('loading');

    // Special case: TOP 10 of all categories
    if (categoryId === TOP10_ALL_CATEGORY_ID) {
      // If we have cached jobs AND we are searching with the default large radius (50km),
      // use the cache to avoid re-fetching.
      // If the user requests a different radius (e.g. 5km via slider), we bypass cache to fetch new results.
      if (
        allCategoryJobs().length > 0 &&
        searchRadius() === DEEP_SEARCH_RADIUS_METERS &&
        searchMeta()?.radiusUsed === 'deep_search'
      ) {
        // Pass ALL jobs to allow filtering/sorting on the client (List will limit to 10)
        setCurrentCards(allCategoryJobs());
        setCurrentCategory(categoryId);
        setSearchMeta({
          source: 'platforms',
          searchPerformed: false,
          placesTypesQueried: [],
          hasCoordinates: !!props.userLocation,
          searchLocation: props.userLocation
            ? { lat: props.userLocation.lat, lng: props.userLocation.lng, city: props.city || '' }
            : null,
          radiusUsed: 'deep_search', // Mark as deep search (implies 50km usually)
        });
        setSavedJobIds(new Set<string>());
        setSavedCount(0);
        setPhase('results');
        setLoadingCategory(null);
        return;
      }

      // Proceed to fetch...

      // No cached jobs - do a deep search across ALL categories
      try {
        const allJobs: ScoredJob[] = [];
        const searchedCats: string[] = [];

        for (const category of PROSPECTION_CATEGORIES) {
          setDeepSearchProgress(`Searching ${category.label}...`);

          const response = await fetch('/api/prospection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'search',
              categoryId: category.id,
              latitude: props.userLocation?.lat,
              longitude: props.userLocation?.lng,
              city: props.city,
              radius: searchRadius(), // v4.1: User-selected radius (default 50km for initial Top 10)
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const userProfile: UserProfile = {
              skills: props.userSkills,
              certifications: props.userCertifications,
              minHourlyRate: props.minHourlyRate,
              swipePreferences: props.swipePreferences, // P0-Health: personalized scoring
            };
            const scoredCards = scoreJobsForProfile(data.cards, userProfile);
            allJobs.push(...scoredCards);
            searchedCats.push(category.id);
          }
        }

        // Store all jobs and categories for future use
        setAllCategoryJobs(allJobs);
        setSearchedCategories(searchedCats);

        setSearchedCategories(searchedCats);

        // Pass ALL jobs to allow filtering/sorting on the client (List will limit to 10)
        setCurrentCards(allJobs);
        setCurrentCategory(categoryId);
        setSearchMeta({
          source: 'google_places',
          searchPerformed: true,
          placesTypesQueried: ['all'],
          hasCoordinates: !!props.userLocation,
          searchLocation: props.userLocation
            ? { lat: props.userLocation.lat, lng: props.userLocation.lng, city: props.city || '' }
            : null,
          radiusUsed:
            searchRadius() === DEEP_SEARCH_RADIUS_METERS ? 'deep_search' : String(searchRadius()),
        });
        setSavedJobIds(new Set<string>());
        setSavedCount(0);
        setPhase('results');
        toastPopup.success(
          'Deep Search Complete',
          `Found ${allJobs.length} jobs across ${searchedCats.length} categories`
        );
      } catch (err) {
        logger.error('Deep search error', { error: err });
        toastPopup.error('Deep Search failed', 'Could not complete the search. Try again.');
        setPhase('idle');
      } finally {
        setLoadingCategory(null);
        setDeepSearchProgress(null);
      }
      return;
    }

    // Special case: Real Job Listings (external APIs)
    if (categoryId === REAL_JOBS_CATEGORY_ID) {
      try {
        setDeepSearchProgress('Fetching remote job listings...');

        const response = await fetch('/api/job-listings?limit=30');

        if (!response.ok) {
          throw new Error('Failed to fetch job listings');
        }

        const data = await response.json();

        // Convert real job listings to ScoredJob format for display
        const jobCards: ScoredJob[] = data.jobs.map(
          (job: {
            id: string;
            title: string;
            company: string;
            companyLogo?: string;
            location: string;
            locationType: string;
            salaryMin?: number;
            salaryMax?: number;
            description: string;
            url: string;
            postedDate: string;
            jobType: string;
            category: string;
            tags: string[];
            source: string;
          }) => ({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            categoryId: job.category,
            avgHourlyRate: job.salaryMin ? Math.round(job.salaryMin / 2080) : 15, // Convert annual to hourly estimate
            effortLevel: job.jobType === 'internship' ? 1 : job.jobType === 'part_time' ? 2 : 3,
            source: job.source,
            url: job.url,
            // Score based on simple factors
            score:
              (job.locationType === 'remote' ? 20 : 10) +
              (job.salaryMin ? Math.min(job.salaryMin / 5000, 30) : 15) +
              (job.jobType === 'internship' ? 25 : job.jobType === 'part_time' ? 20 : 15) +
              Math.random() * 10, // Add some variance
            skillsMatched: job.tags.slice(0, 3),
            certBoost: 0,
            commuteMinutes: job.locationType === 'remote' ? 0 : undefined,
          })
        );

        // Sort by score
        jobCards.sort((a, b) => b.score - a.score);

        setCurrentCards(jobCards);
        setCurrentCategory(categoryId);
        setSearchMeta({
          source: 'platforms',
          searchPerformed: true,
          placesTypesQueried: [],
          hasCoordinates: false,
          searchLocation: null,
          radiusUsed: 'external_api',
        });
        setSavedJobIds(new Set<string>());
        setSavedCount(0);
        setPhase('results');
        toastPopup.success(
          'Remote Jobs Found',
          `Found ${jobCards.length} remote positions - work from anywhere!`
        );
      } catch (err) {
        logger.error('Real jobs fetch error', { error: err });
        toastPopup.error('Fetch failed', 'Could not load job listings. Try again.');
        setPhase('idle');
      } finally {
        setLoadingCategory(null);
        setDeepSearchProgress(null);
      }
      return;
    }

    try {
      const response = await fetch('/api/prospection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          categoryId,
          latitude: props.userLocation?.lat,
          longitude: props.userLocation?.lng,
          city: props.city,
          radius: searchRadius(), // v4.1: User-selected radius
        }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      // JOBS-04/05: Build user profile for scoring and score/sort jobs
      // Phase 5: Now includes certifications for job boost
      const userProfile: UserProfile = {
        skills: props.userSkills,
        certifications: props.userCertifications,
        minHourlyRate: props.minHourlyRate,
        swipePreferences: props.swipePreferences, // P0-Health: personalized scoring
      };
      const scoredCards = scoreJobsForProfile(data.cards, userProfile);

      setCurrentCards(scoredCards);
      setCurrentCategory(categoryId);
      setSearchMeta(data.meta);
      setSavedJobIds(new Set<string>());
      setSavedCount(0);
      setPhase('results');

      // Track this category as searched
      setSearchedCategories((prev) => (prev.includes(categoryId) ? prev : [...prev, categoryId]));

      // Accumulate jobs for global TOP 10 (avoid duplicates by id)
      setAllCategoryJobs((prev) => {
        const existingIds = new Set(prev.map((j) => j.id));
        const newJobs = scoredCards.filter((j) => !existingIds.has(j.id));
        return [...prev, ...newJobs];
      });
    } catch (err) {
      logger.error('Search error', { error: err });
      toastPopup.error('Search failed', 'Could not find opportunities. Try again.');
      setPhase('idle');
    } finally {
      setLoadingCategory(null);
    }
  };

  // Handle saving a single job from the list
  const handleSaveJob = async (job: ScoredJob) => {
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: props.profileId,
          category: job.categoryId,
          title: job.title,
          company: job.company,
          locationRaw: job.location,
          lat: job.lat,
          lng: job.lng,
          commuteTimeMins: job.commuteMinutes,
          salaryMin: job.avgHourlyRate,
          salaryMax: job.avgHourlyRate,
          effortLevel: job.effortLevel,
          source: job.source,
          url: job.url,
        }),
      });

      if (response.ok) {
        const lead = await response.json();
        setLeads([lead, ...leads()]);
        setSavedJobIds((prev) => new Set([...prev, job.id]));
        setSavedCount((c) => c + 1);
        toastPopup.success('Lead saved!', `${job.company || job.title} added to your list`);
        props.onLeadSaved?.(lead);
      }
    } catch (err) {
      logger.error('Failed to save lead', { error: err });
      toastPopup.error('Save failed', 'Could not save this opportunity');
    }
  };

  // Handle finishing the results phase
  const handleFinishResults = () => {
    if (savedCount() > 0) {
      celebrateBig();
    }
    setPhase('complete');
  };

  // Handle lead status change
  const handleStatusChange = async (leadId: string, status: LeadStatus) => {
    try {
      const response = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, status }),
      });

      if (response.ok) {
        setLeads(leads().map((l) => (l.id === leadId ? { ...l, status } : l)));
        toastPopup.success('Status updated', `Lead marked as ${status}`);
      }
    } catch (err) {
      logger.error('Failed to update lead', { error: err });
      toastPopup.error('Update failed', 'Could not update lead status');
    }
  };

  // Handle lead delete
  const handleDelete = async (leadId: string) => {
    try {
      const response = await fetch(`/api/leads?id=${leadId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setLeads(leads().filter((l) => l.id !== leadId));
        toastPopup.success('Lead deleted', 'Opportunity removed from your list');
      }
    } catch (err) {
      logger.error('Failed to delete lead', { error: err });
      toastPopup.error('Delete failed', 'Could not delete lead');
    }
  };

  // Handle lead click (for map highlighting)
  const handleLeadClick = (leadId: string) => {
    setHighlightedLeadId(leadId);
    // Switch to map view if in list view
    if (viewMode() === 'list') {
      setViewMode('map');
    }
  };

  // Handle marker click
  const handleMarkerClick = (leadId: string) => {
    setHighlightedLeadId(leadId);
    setViewMode('list');
  };

  // Reset to idle
  const handleReset = () => {
    setPhase('idle');
    setCurrentCards([]);
    setCurrentCategory(null);
    setSearchMeta(undefined);
    setSavedJobIds(new Set<string>());
    setSavedCount(0);
    setHighlightedLeadId(null);
  };

  // Category label helper
  const categoryLabel = () => {
    const cat = currentCategory();
    if (!cat) return '';
    if (cat === TOP10_ALL_CATEGORY_ID) return 'TOP 10 of All Categories';
    if (cat === REAL_JOBS_CATEGORY_ID) return 'Remote Job Listings';
    return getCategoryById(cat)?.label || cat;
  };

  return (
    <div class="p-6 space-y-6">
      {/* Header */}
      <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
        <Compass class="h-6 w-6 text-primary" /> Jobs
      </h2>

      {/* Bruno Hint */}
      <BrunoHintV2
        tabType="jobs"
        profileId={props.profileId}
        contextData={{
          skills: (props.userSkills || []).map((s) => ({ name: s })),
          leads: leads().map((l) => ({
            status: l.status,
            title: l.title,
          })),
          city: props.city,
        }}
        fallbackMessage="Explore job opportunities near you. I'll match them to your skills!"
        compact
      />

      {/* Top Dashboard - Visible when Idle or Results (but not loading deep search) */}
      <Show when={phase() !== 'loading'}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Panel 1: My Selection Shortcut */}
          <button
            onClick={() => setShowLeadsPanel(true)}
            class="group relative overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-all hover:shadow-lg hover:border-primary/30 hover:ring-2 hover:ring-primary/10 text-left h-full min-h-[100px] cursor-pointer"
          >
            <div class="p-4 flex flex-col justify-between h-full">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Bookmark class="h-4 w-4" />
                  <span>My Selection</span>
                </div>
                <ChevronRight class="h-5 w-5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
              <div>
                <div class="text-2xl font-bold text-foreground">{leads().length}</div>
                <div class="text-xs text-muted-foreground mt-1">Saved opportunities</div>
              </div>
            </div>
          </button>

          {/* Panel 2: Quick Action - Top 10 */}
          <button
            onClick={() => {
              setSearchRadius(DEEP_SEARCH_RADIUS_METERS); // Set to 50km for initial "Deep Search"
              handleCategorySelect(TOP10_ALL_CATEGORY_ID);
            }}
            disabled={phase() === 'loading'}
            class="group relative overflow-hidden rounded-xl border border-purple-200/50 dark:border-purple-800/50 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/10 shadow-sm transition-all hover:shadow-lg hover:border-purple-400/50 hover:ring-2 hover:ring-purple-500/20 text-left h-full min-h-[100px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div class="p-4 flex flex-col justify-between h-full">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                  Highlights
                </span>
                <div class="flex items-center gap-2">
                  <div class="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center transition-transform group-hover:scale-110">
                    <Dynamic
                      component={getCategoryById(TOP10_ALL_CATEGORY_ID)?.icon || Compass}
                      class="h-4 w-4 text-purple-600 dark:text-purple-400"
                    />
                  </div>
                  <ChevronRight class="h-5 w-5 text-purple-400/50 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
              <div>
                <div class="text-lg font-bold text-purple-900 dark:text-purple-100">
                  Top 10 Opportunities
                </div>
                <div class="text-xs text-purple-600/80 dark:text-purple-400/80 mt-1">
                  Best matches across all categories
                </div>
              </div>
            </div>
          </button>

          {/* Panel 3: Quick Action - Remote */}
          <button
            onClick={() => handleCategorySelect(REAL_JOBS_CATEGORY_ID)}
            disabled={phase() === 'loading'}
            class="group relative overflow-hidden rounded-xl border border-blue-200/50 dark:border-blue-800/50 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/10 shadow-sm transition-all hover:shadow-lg hover:border-blue-400/50 hover:ring-2 hover:ring-blue-500/20 text-left h-full min-h-[100px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div class="p-4 flex flex-col justify-between h-full">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                  Remote First
                </span>
                <div class="flex items-center gap-2">
                  <div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center transition-transform group-hover:scale-110">
                    <Dynamic
                      component={getCategoryById(REAL_JOBS_CATEGORY_ID)?.icon || MapIcon}
                      class="h-4 w-4 text-blue-600 dark:text-blue-400"
                    />
                  </div>
                  <ChevronRight class="h-5 w-5 text-blue-400/50 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
              <div>
                <div class="text-lg font-bold text-blue-900 dark:text-blue-100">
                  Full Remote Jobs
                </div>
                <div class="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
                  Work from anywhere in the world
                </div>
              </div>
            </div>
          </button>
        </div>
      </Show>

      {/* Saved Jobs Inline Section */}
      <Show when={leads().length > 0}>
        <div class="border rounded-xl bg-card shadow-sm overflow-hidden">
          <button
            onClick={() => setShowLeadsPanel(!showLeadsPanel())}
            class="w-full flex items-center justify-between p-4 bg-muted/20 hover:bg-muted/30 transition-colors"
          >
            <div class="flex items-center gap-3">
              <div class="h-8 w-8 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-sm">
                <Bookmark class="h-4 w-4" />
              </div>
              <div class="text-left">
                <h3 class="font-bold text-foreground">My Selection</h3>
                <p class="text-xs text-muted-foreground">{leads().length} saved opportunities</p>
              </div>
            </div>
            <div
              class={`transition-transform duration-300 ${showLeadsPanel() ? 'rotate-180' : ''}`}
            >
              <ChevronDown class="h-5 w-5 text-muted-foreground" />
            </div>
          </button>

          <Show when={showLeadsPanel()}>
            <div class="p-0 border-t border-border animate-in slide-in-from-top-2 duration-200">
              {/* View Toggle inside panel */}
              <div class="p-2 flex justify-end bg-muted/10 border-b border-border/50">
                <div class="flex items-center gap-1 bg-background rounded-lg p-1 border">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode('list');
                    }}
                    class={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode() === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    List
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode('map');
                    }}
                    class={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode() === 'map' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    Map
                  </button>
                </div>
              </div>

              <div class="p-4">
                <Show when={viewMode() === 'map'}>
                  <ProspectionMap
                    userLocation={props.userLocation}
                    leads={leads()}
                    highlightedId={highlightedLeadId() || undefined}
                    onMarkerClick={handleMarkerClick}
                    height="300px"
                  />
                </Show>
                <Show when={viewMode() === 'list'}>
                  <SavedLeads
                    leads={leads()}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onLeadClick={handleLeadClick}
                    highlightedId={highlightedLeadId() || undefined}
                  />
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Idle Phase - Category Explorer */}
      <Show when={phase() === 'idle'}>
        <div class="pt-4 border-t border-border/50">
          <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Explore Job Categories
          </h3>
          <CategoryExplorer
            onCategorySelect={handleCategorySelect}
            currency={props.currency}
            allCategoryJobs={allCategoryJobs()}
            searchedCategories={searchedCategories()}
          />
        </div>
      </Show>

      {/* Loading Phase */}
      <Show when={phase() === 'loading'}>
        <div class="flex flex-col items-center justify-center py-20">
          <Compass class="h-16 w-16 animate-spin text-primary mb-6" />
          <p class="text-lg text-muted-foreground animate-pulse">
            {deepSearchProgress() || `Searching for ${categoryLabel()} opportunities...`}
          </p>
          <Show when={deepSearchProgress()}>
            <p class="text-sm text-muted-foreground mt-2">Deep search in progress...</p>
          </Show>
        </div>
      </Show>

      {/* Results Phase */}
      <Show when={phase() === 'results'}>
        <div class="space-y-6">
          {/* Header with quick actions */}
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-bold text-foreground">{categoryLabel()}</h2>
              <p class="text-sm text-muted-foreground">Save opportunities you're interested in</p>
              <Show when={props.userLocation}>
                <p class="text-xs text-muted-foreground mt-1">📍 {props.city || 'Near you'}</p>
              </Show>
            </div>
            {/* Phase 8b: Quick access button at top */}
            <div class="flex flex-col items-end gap-2">
              <Button
                size="sm"
                onClick={handleReset}
                class="shrink-0 bg-foreground text-background hover:bg-muted-foreground"
              >
                <RotateCcw class="h-4 w-4 mr-2" />
                Change category
              </Button>
            </div>
          </div>

          {/* Map at top - visible on all devices */}
          <Show when={props.userLocation && currentCards().length > 0}>
            <Card>
              <CardContent class="p-4">
                <h3 class="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <MapIcon class="h-4 w-4" />
                  {currentCategory() === TOP10_ALL_CATEGORY_ID
                    ? `Top 10 of ${currentCards().length} places nearby`
                    : `${currentCards().length} places nearby`}
                </h3>
                <ProspectionMap
                  userLocation={props.userLocation}
                  currentCards={
                    currentCategory() === TOP10_ALL_CATEGORY_ID
                      ? currentCards().slice(0, 10)
                      : currentCards()
                  }
                  height="350px"
                  onSaveCard={handleSaveJob}
                  savedCardIds={savedJobIds()}
                />

                {/* Radius Control - Placed below map as requested */}
                <Show when={props.userLocation && searchMeta()?.radiusUsed !== 'external_api'}>
                  <div class="flex items-center justify-between mt-3 px-1 pt-2 border-t border-border/50">
                    <span class="text-xs text-muted-foreground">Search Radius</span>
                    <div class="flex items-center gap-3">
                      <div class="w-32">
                        <Slider
                          label=""
                          min={1}
                          max={30}
                          step={1}
                          value={[searchRadius() / 1000]}
                          onChange={(v) => setSearchRadius(v[0] * 1000)}
                        />
                      </div>
                      <span class="text-xs font-medium w-8 text-right">
                        {(searchRadius() / 1000).toFixed(0)}km
                      </span>

                      {/* Inline update button if changed */}
                      <Show when={String(searchMeta()?.radiusUsed) !== String(searchRadius())}>
                        <button
                          onClick={() =>
                            currentCategory() && handleCategorySelect(currentCategory()!)
                          }
                          class="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                          title="Update Search"
                        >
                          <RotateCcw class="h-3 w-3" />
                        </button>
                      </Show>
                    </div>
                  </div>
                </Show>
              </CardContent>
            </Card>
          </Show>

          {/* Job list below */}
          <ProspectionList
            jobs={currentCards()}
            onSave={handleSaveJob}
            savedIds={savedJobIds()}
            meta={searchMeta()}
            userCertifications={props.userCertifications}
            profileId={props.profileId}
            categoryLabel={categoryLabel()}
            allCategoryJobs={allCategoryJobs()}
            showViewTabs={true}
            // Phase 8b: Limit deep search results to Top 10, but allow sorting on full set
            limit={currentCategory() === TOP10_ALL_CATEGORY_ID ? 10 : undefined}
          />
        </div>

        {/* Action buttons */}
        <div class="flex justify-center gap-4 mt-6">
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw class="h-4 w-4 mr-2" />
            Choose another category
          </Button>
          <Show when={savedCount() > 0}>
            <Button onClick={handleFinishResults}>
              <Check class="h-4 w-4 mr-2" />
              Done ({savedCount()} saved)
            </Button>
          </Show>
        </div>
      </Show>

      {/* Complete Phase */}
      <Show when={phase() === 'complete'}>
        <div class="space-y-6">
          {/* Summary */}
          <Card>
            <CardContent class="p-6 text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full mb-4">
                <Check class="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 class="text-2xl font-bold text-foreground mb-2">Exploration Complete!</h2>
              <p class="text-muted-foreground">
                You explored {currentCards().length} opportunities in {categoryLabel()}.
                <br />
                {savedCount()} saved to your list.
              </p>
            </CardContent>
          </Card>

          {/* View mode toggle */}
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-foreground">Your Leads</h3>
            <div class="flex items-center gap-2">
              <Button
                variant={viewMode() === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List class="h-4 w-4 mr-1" />
                List
              </Button>
              <Button
                variant={viewMode() === 'map' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('map')}
              >
                <MapIcon class="h-4 w-4 mr-1" />
                Map
              </Button>
            </div>
          </div>

          {/* Content based on view mode */}
          <Show when={viewMode() === 'list'}>
            <SavedLeads
              leads={leads()}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLeadClick={handleLeadClick}
              highlightedId={highlightedLeadId() || undefined}
            />
          </Show>

          <Show when={viewMode() === 'map'}>
            <ProspectionMap
              userLocation={props.userLocation}
              leads={leads()}
              highlightedId={highlightedLeadId() || undefined}
              onMarkerClick={handleMarkerClick}
              height="400px"
            />
          </Show>

          {/* Actions */}
          <div class="flex gap-4">
            <Button variant="outline" class="flex-1" onClick={handleReset}>
              <Compass class="h-4 w-4 mr-2" />
              Explore More
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
