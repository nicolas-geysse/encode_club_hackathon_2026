/**
 * Prospection Tab Component
 *
 * Main tab for exploring job opportunities beyond declared skills.
 * Phases:
 * 1. idle - Display CategoryExplorer
 * 2. loading - Search in progress
 * 3. swiping - SwipeDeck with cards
 * 4. complete - Summary + SavedLeads + Map
 */

import { createSignal, Show, createEffect, on } from 'solid-js';
import {
  CategoryExplorer,
  ProspectionSwipeDeck,
  ProspectionMap,
  SavedLeads,
} from '~/components/prospection';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { RotateCcw, MapIcon, List, Compass, Check } from 'lucide-solid';
import { toastPopup } from '~/components/ui/Toast';
import { celebrateBig } from '~/lib/confetti';
import type {
  ProspectionCard,
  Lead,
  LeadStatus,
  SwipeResult,
  ProspectionTabProps,
} from '~/lib/prospectionTypes';
import { getCategoryById } from '~/config/prospectionCategories';

type Phase = 'idle' | 'loading' | 'swiping' | 'complete';
type ViewMode = 'list' | 'map';

export function ProspectionTab(props: ProspectionTabProps) {
  const [phase, setPhase] = createSignal<Phase>('idle');
  const [viewMode, setViewMode] = createSignal<ViewMode>('list');
  const [_loadingCategory, setLoadingCategory] = createSignal<string | null>(null);
  const [currentCards, setCurrentCards] = createSignal<ProspectionCard[]>([]);
  const [currentCategory, setCurrentCategory] = createSignal<string | null>(null);
  const [leads, setLeads] = createSignal<Lead[]>([]);
  const [highlightedLeadId, setHighlightedLeadId] = createSignal<string | null>(null);
  const [swipeResults, setSwipeResults] = createSignal<SwipeResult[]>([]);

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
      setCurrentCards(data.cards);
      setCurrentCategory(categoryId);
      setSwipeResults([]);
      setPhase('swiping');
    } catch (err) {
      console.error('Search error', err);
      toastPopup.error('Search failed', 'Could not find opportunities. Try again.');
      setPhase('idle');
    } finally {
      setLoadingCategory(null);
    }
  };

  // Handle swipe action
  const handleSwipe = (result: SwipeResult) => {
    setSwipeResults([...swipeResults(), result]);
  };

  // Handle swipe session complete
  const handleSwipeComplete = async (saved: ProspectionCard[], _skipped: ProspectionCard[]) => {
    // Save leads to database
    const newLeads: Lead[] = [];

    for (const card of saved) {
      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: props.profileId,
            category: card.categoryId,
            title: card.title,
            company: card.company,
            locationRaw: card.location,
            lat: card.lat,
            lng: card.lng,
            commuteTimeMins: card.commuteMinutes,
            salaryMin: card.avgHourlyRate,
            salaryMax: card.avgHourlyRate,
            effortLevel: card.effortLevel,
            source: card.source,
            url: card.url,
          }),
        });

        if (response.ok) {
          const lead = await response.json();
          newLeads.push(lead);
        }
      } catch (err) {
        console.error('Failed to save lead', err);
      }
    }

    // Update leads state
    setLeads([...newLeads, ...leads()]);

    // Celebrate and show summary
    if (newLeads.length > 0) {
      celebrateBig();
      toastPopup.success(
        'Leads saved!',
        `${newLeads.length} opportunities added to your prospection list`
      );
    }

    props.onLeadSaved?.(newLeads[0]);
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
    setSwipeResults([]);
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
      {/* Idle Phase - Category Explorer */}
      <Show when={phase() === 'idle'}>
        <CategoryExplorer onCategorySelect={handleCategorySelect} currency={props.currency} />

        {/* Show existing leads if any */}
        <Show when={leads().length > 0}>
          <div class="mt-8 pt-6 border-t border-border">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-foreground">
                Your Saved Leads ({leads().length})
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
          </div>
        </Show>
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

      {/* Swiping Phase */}
      <Show when={phase() === 'swiping'}>
        <div class="flex flex-col lg:flex-row gap-6">
          {/* Swipe deck */}
          <div class="flex-1">
            <div class="text-center mb-4">
              <h2 class="text-xl font-bold text-foreground">{categoryLabel()}</h2>
              <p class="text-sm text-muted-foreground">Swipe right to save, left to skip</p>
            </div>
            <ProspectionSwipeDeck
              cards={currentCards()}
              onSwipe={handleSwipe}
              onComplete={handleSwipeComplete}
            />
          </div>

          {/* Map (desktop only) */}
          <Show when={props.userLocation}>
            <div class="hidden lg:block w-80">
              <Card>
                <CardContent class="p-4">
                  <h3 class="font-semibold text-foreground mb-3">Nearby</h3>
                  <ProspectionMap
                    userLocation={props.userLocation}
                    currentCards={currentCards()}
                    height="250px"
                  />
                </CardContent>
              </Card>
            </div>
          </Show>
        </div>

        {/* Back button */}
        <div class="text-center mt-4">
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw class="h-4 w-4 mr-2" />
            Choose another category
          </Button>
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
                You explored {swipeResults().length} opportunities in {categoryLabel()}.
                <br />
                {swipeResults().filter((r) => r.direction === 'right').length} saved to your list.
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
