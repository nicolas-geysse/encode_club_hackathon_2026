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
import {
  CategoryExplorer,
  ProspectionList,
  ProspectionMap,
  SavedLeads,
} from '~/components/prospection';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import {
  RotateCcw,
  MapIcon,
  List,
  Compass,
  Check,
  Bookmark,
  ChevronDown,
  ChevronUp,
} from 'lucide-solid';
import { toastPopup } from '~/components/ui/Toast';
import { celebrateBig } from '~/lib/confetti';
import type {
  Lead,
  LeadStatus,
  ProspectionTabProps,
  ProspectionSearchMeta,
} from '~/lib/prospectionTypes';
import { getCategoryById } from '~/config/prospectionCategories';
import { scoreJobsForProfile, type ScoredJob, type UserProfile } from '~/lib/jobScoring';

type Phase = 'idle' | 'loading' | 'results' | 'complete';
type ViewMode = 'list' | 'map';

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
  const [showLeadsPanel, setShowLeadsPanel] = createSignal(false);

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
          console.error('Failed to load leads', err);
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
      };
      const scoredCards = scoreJobsForProfile(data.cards, userProfile);

      setCurrentCards(scoredCards);
      setCurrentCategory(categoryId);
      setSearchMeta(data.meta);
      setSavedJobIds(new Set<string>());
      setSavedCount(0);
      setPhase('results');
    } catch (err) {
      console.error('Search error', err);
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
      console.error('Failed to save lead', err);
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
      console.error('Failed to update lead', err);
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
      console.error('Failed to delete lead', err);
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
    return getCategoryById(cat)?.label || cat;
  };

  return (
    <div class="p-6 space-y-6">
      {/* Floating Saved Leads Badge - Always visible when there are leads */}
      <Show when={leads().length > 0 && phase() !== 'loading'}>
        <div class="fixed bottom-20 sm:bottom-8 right-4 sm:right-6 z-50">
          <button
            onClick={() => {
              setShowLeadsPanel(!showLeadsPanel());
              // Smooth scroll to saved leads section
              if (!showLeadsPanel()) {
                setTimeout(() => {
                  document.getElementById('saved-leads-panel')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }, 100);
              }
            }}
            class={`
              rounded-full shadow-xl px-4 py-2.5 flex items-center gap-2
              transition-all duration-200
              ${
                showLeadsPanel()
                  ? 'bg-transparent border-2 border-black dark:border-white text-black dark:text-white'
                  : 'bg-black dark:bg-white text-white dark:text-black'
              }
            `}
          >
            <Bookmark class="h-4 w-4" />
            <span class="font-semibold">{leads().length} saved</span>
            {showLeadsPanel() ? <ChevronDown class="h-4 w-4" /> : <ChevronUp class="h-4 w-4" />}
          </button>
        </div>
      </Show>

      {/* Collapsible Saved Leads Panel */}
      <Show when={showLeadsPanel() && leads().length > 0}>
        <Card id="saved-leads-panel" class="border-2 border-primary/20 bg-primary/5 scroll-mt-4">
          <CardContent class="p-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
                <Bookmark class="h-5 w-5 text-primary" />
                My Saved Leads ({leads().length})
              </h3>
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

            {/* Map always visible at top for saved leads */}
            <div class="mb-4">
              <ProspectionMap
                userLocation={props.userLocation}
                leads={leads()}
                highlightedId={highlightedLeadId() || undefined}
                onMarkerClick={handleMarkerClick}
                height="300px"
              />
            </div>

            {/* List below */}
            <SavedLeads
              leads={leads()}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLeadClick={handleLeadClick}
              highlightedId={highlightedLeadId() || undefined}
            />
          </CardContent>
        </Card>
      </Show>

      {/* Idle Phase - Category Explorer */}
      <Show when={phase() === 'idle'}>
        <CategoryExplorer onCategorySelect={handleCategorySelect} currency={props.currency} />
      </Show>

      {/* Loading Phase */}
      <Show when={phase() === 'loading'}>
        <div class="flex flex-col items-center justify-center py-20">
          <Compass class="h-16 w-16 animate-spin text-primary mb-6" />
          <p class="text-lg text-muted-foreground animate-pulse">
            Searching for {categoryLabel()} opportunities...
          </p>
        </div>
      </Show>

      {/* Results Phase */}
      <Show when={phase() === 'results'}>
        <div class="space-y-6">
          {/* Header */}
          <div>
            <h2 class="text-xl font-bold text-foreground">{categoryLabel()}</h2>
            <p class="text-sm text-muted-foreground">Save opportunities you're interested in</p>
            {/* Show search location */}
            <Show when={props.userLocation}>
              <p class="text-xs text-muted-foreground mt-1">
                📍 {props.city || 'Near you'} ({props.userLocation?.lat.toFixed(4)},{' '}
                {props.userLocation?.lng.toFixed(4)})
              </p>
            </Show>
          </div>

          {/* Map at top - visible on all devices */}
          <Show when={props.userLocation && currentCards().length > 0}>
            <Card>
              <CardContent class="p-4">
                <h3 class="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <MapIcon class="h-4 w-4" />
                  {currentCards().length} places nearby
                </h3>
                <ProspectionMap
                  userLocation={props.userLocation}
                  currentCards={currentCards()}
                  height="350px"
                  onSaveCard={handleSaveJob}
                  savedCardIds={savedJobIds()}
                />
              </CardContent>
            </Card>
          </Show>

          {/* Job list below */}
          <ProspectionList
            jobs={currentCards()}
            onSave={handleSaveJob}
            savedIds={savedJobIds()}
            meta={searchMeta()}
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
