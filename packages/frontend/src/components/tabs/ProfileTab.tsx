/**
 * Profile Tab Component
 *
 * Displays and allows editing of user profile information.
 * Shows: Name, Diploma, Field, City, Work preferences, Budget.
 *
 * Uses ProfileContext for shared state so that changes here
 * are reflected in ProfileSelector and other components.
 */

import { createSignal, Show, For, createEffect, onCleanup, on, createResource } from 'solid-js';
import { createDirtyState } from '~/hooks/createDirtyState';
import { profileService, type FullProfile } from '~/lib/profileService';
import { useProfile } from '~/lib/profileContext';
import { toast } from '~/lib/notificationStore';
import { formatCurrencyWithSuffix, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { POPULAR_CERTIFICATIONS, DIPLOMA_OPTIONS } from '~/lib/chat/stepForms';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { BrunoHintV2 } from '~/components/ui/BrunoHintV2';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import {
  User,
  ClipboardList,
  GraduationCap,
  Clock,
  X,
  Plus,
  Search,
  Loader2,
  LocateFixed,
} from 'lucide-solid';
import { getCurrentLocation, isGeolocationSupported } from '~/lib/geolocation';
import ProfileMap, { type LocationChangeData } from './ProfileMap';
import {
  fetchDebugState,
  EnergyStateWidget,
  ComebackWidget,
  DebtWidget,
  PreferencesWidget,
} from '~/components/debug/DebugPanel';
import { SkillsTab } from './SkillsTab';

// Alias for cleaner code
type Profile = FullProfile;

interface ProfileTabProps {
  onProfileChange?: (profile: Partial<Profile>) => void;
  /** Callback to switch to the Budget tab */
  onNavigateToBudget?: () => void;
  /** Callback when dirty state changes (for parent to track unsaved changes) */
  onDirtyChange?: (isDirty: boolean) => void;
}

// Skeleton Loader for Profile
function ProfileSkeleton() {
  return (
    <div class="space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identity Skeleton */}
        <Card class="h-full">
          <CardContent class="p-6 h-full flex flex-col gap-6">
            <div class="space-y-2">
              <Skeleton class="h-4 w-24" />
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Skeleton class="h-3 w-12" />
                  <Skeleton class="h-6 w-32" />
                </div>
                <div class="space-y-2">
                  <Skeleton class="h-3 w-16" />
                  <Skeleton class="h-6 w-24" />
                </div>
              </div>
            </div>
            <div class="space-y-2 mt-auto pt-6 border-t border-border/50">
              <Skeleton class="h-3 w-32" />
              <div class="grid grid-cols-2 gap-4">
                <Skeleton class="h-5 w-20" />
                <Skeleton class="h-5 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location Skeleton */}
        <Card class="h-full">
          <CardContent class="p-6 space-y-4">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-[140px] w-full rounded-md" />
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Skeleton class="h-3 w-12" />
                <Skeleton class="h-5 w-24" />
              </div>
              <div class="space-y-2">
                <Skeleton class="h-3 w-16" />
                <Skeleton class="h-5 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 Skeleton */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent class="p-6 h-32 space-y-4">
            <Skeleton class="h-4 w-32" />
            <div class="flex gap-2">
              <Skeleton class="h-8 w-20 rounded-md" />
              <Skeleton class="h-8 w-24 rounded-md" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-6 h-32 space-y-4">
            <Skeleton class="h-4 w-20" />
            <div class="flex gap-2">
              <Skeleton class="h-8 w-16 rounded-md" />
              <Skeleton class="h-8 w-20 rounded-md" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProfileTab(props: ProfileTabProps) {
  // Use shared ProfileContext instead of local state
  // This ensures ProfileSelector and other components see the same data
  const { profile: contextProfile, loading: contextLoading, refreshProfile } = useProfile();

  // Get currency from profile context, fallback to USD
  const currency = () => (contextProfile()?.currency as Currency) || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  // Local state for editing UI
  const [editing, setEditing] = createSignal(false);
  const [editedProfile, setEditedProfile] = createSignal<Partial<Profile>>({});
  const [saving, setSaving] = createSignal(false);
  // BUG 5 FIX: State for new certification input
  const [newCertification, setNewCertification] = createSignal('');
  // City search with debounce
  const [citySearchInput, setCitySearchInput] = createSignal('');
  const [citySearchQuery, setCitySearchQuery] = createSignal('');
  const [isSearching, setIsSearching] = createSignal(false);
  const [isGeolocating, setIsGeolocating] = createSignal(false);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Resource for debug state (Energy, etc.)
  const [debugState] = createResource(() => contextProfile()?.id, fetchDebugState);

  // Dirty state tracking for unsaved changes warning
  const {
    isDirty,
    setOriginal,
    clear: clearDirty,
  } = createDirtyState({
    getCurrentValues: () => ({
      name: editedProfile().name,
      diploma: editedProfile().diploma,
      field: editedProfile().field,
      city: editedProfile().city,
      address: editedProfile().address,
      latitude: editedProfile().latitude,
      longitude: editedProfile().longitude,
      maxWorkHoursWeekly: editedProfile().maxWorkHoursWeekly,
      minHourlyRate: editedProfile().minHourlyRate,
      certifications: editedProfile().certifications,
    }),
  });

  // Notify parent when dirty state changes
  createEffect(
    on(isDirty, (dirty) => {
      props.onDirtyChange?.(dirty);
    })
  );

  // Debounced city search - triggers after 500ms of no typing
  const handleCitySearch = (value: string) => {
    setCitySearchInput(value);
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    if (value.trim().length >= 2) {
      searchDebounceTimer = setTimeout(() => {
        setCitySearchQuery(value.trim());
      }, 500);
    }
  };

  // Use browser geolocation to auto-detect location
  const handleUseMyLocation = async () => {
    if (!isGeolocationSupported()) {
      toast.error('Not supported', 'Geolocation is not supported by your browser');
      return;
    }

    setIsGeolocating(true);
    try {
      const result = await getCurrentLocation();
      setEditedProfile({
        ...editedProfile(),
        latitude: result.coordinates.latitude,
        longitude: result.coordinates.longitude,
        city: result.city,
        address: result.address,
        // Currency can also be updated based on location
        currency: result.currency || editedProfile().currency,
      });
      setCitySearchInput(result.city);
      toast.success('Location found', `Your location: ${result.city}, ${result.country}`);
    } catch (err) {
      const error = err as { message?: string };
      toast.error('Location failed', error.message || 'Could not get your location');
    } finally {
      setIsGeolocating(false);
    }
  };

  // Cleanup debounce timer
  onCleanup(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
  });

  // Derived profile getter for cleaner access
  const profile = () => contextProfile();
  const loading = () => contextLoading();

  // Sync editedProfile when context profile changes
  createEffect(() => {
    const p = contextProfile();
    if (p && !editing()) {
      setEditedProfile(p);
    }
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = editedProfile();
      // Ensure name is present for saveProfile
      const profileToSave = {
        ...updates,
        name: updates.name || profile()?.name || 'My Profile',
      };
      await profileService.saveProfile(profileToSave, { immediate: true });

      // IMPORTANT: Refresh the shared ProfileContext so that:
      // 1. ProfileSelector in the header shows the updated name
      // 2. Other components using the context get the new data
      await refreshProfile();

      // Reset search state and dirty tracking
      setCitySearchInput('');
      setCitySearchQuery('');
      clearDirty();
      setEditing(false);
      props.onProfileChange?.(updates);
    } catch {
      toast.error('Save failed', 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile()) {
      setEditedProfile(profile()!);
    }
    // Reset search state and dirty tracking
    setCitySearchInput('');
    setCitySearchQuery('');
    clearDirty();
    setEditing(false);
  };

  // Initialize search input and dirty tracking when entering edit mode
  const handleStartEdit = () => {
    setCitySearchInput(profile()?.city || '');
    setCitySearchQuery('');
    setOriginal(); // Capture current values for dirty tracking
    setEditing(true);
  };

  return (
    <div class="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
          <User class="h-6 w-6 text-primary" /> My Profile
        </h2>
        <Show when={!editing() && profile()}>
          <Button onClick={handleStartEdit}>Edit Profile</Button>
        </Show>
      </div>

      {/* Bruno Hint */}
      <BrunoHintV2
        tabType="profile"
        profileId={profile()?.id}
        contextData={{
          // Nest profile fields under 'profile' so mergeContext picks them up
          profile: {
            name: profile()?.name,
            diploma: profile()?.diploma,
            field: profile()?.field,
            city: profile()?.city,
            skills: profile()?.skills,
            certifications: profile()?.certifications,
            maxWorkHoursWeekly: profile()?.maxWorkHoursWeekly,
            minHourlyRate: profile()?.minHourlyRate,
          },
        }}
        fallbackMessage="Keep your profile up to date for better job matches and personalized advice!"
        compact
      />

      {/* Loading State */}
      <Show when={loading()}>
        <ProfileSkeleton />
      </Show>

      {/* Empty State */}
      <Show when={!loading() && !profile()}>
        <Card class="text-center py-12">
          <CardContent class="flex flex-col items-center">
            <div class="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <User class="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 class="text-lg font-medium text-foreground mb-2">No profile found</h3>
            <p class="text-muted-foreground mb-4">Complete the onboarding to create your profile</p>
            <Button as="a" href="/">
              Start Onboarding
            </Button>
          </CardContent>
        </Card>
      </Show>

      {/* VIEW MODE */}
      <Show when={!loading() && profile() && !editing()}>
        <div class="space-y-6">
          {/* Row 1: Identity (with Preferences) & Location */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Identity */}
            <Card class="h-full">
              <CardContent class="p-6">
                {/* Energy State - Top */}
                <div class="mb-6">
                  <Show when={!debugState.loading && debugState()}>
                    <EnergyStateWidget state={debugState()!} compact={true} />
                  </Show>
                </div>

                {/* Main Identity Section */}
                <div>
                  <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                    <ClipboardList class="h-4 w-4" /> Identity
                  </h3>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2 sm:col-span-1">
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Name
                      </label>
                      <p class="text-lg font-medium text-foreground mt-1 truncate">
                        {profile()?.name || 'Not set'}
                      </p>
                    </div>
                    <div class="col-span-2 sm:col-span-1">
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Diploma
                      </label>
                      <p class="text-lg font-medium text-foreground mt-1 truncate">
                        {profile()?.diploma || 'Not set'}
                      </p>
                    </div>
                    <div class="col-span-2">
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Field of Study
                      </label>
                      <p class="text-lg font-medium text-foreground mt-1 truncate">
                        {profile()?.field || 'Not set'}
                      </p>
                    </div>
                    {/* Certifications - Compact */}
                    <div class="col-span-2 mt-2">
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Certifications
                      </label>
                      <Show
                        when={(profile()?.certifications || []).length > 0}
                        fallback={<p class="text-muted-foreground italic text-sm mt-1">None</p>}
                      >
                        <div class="flex flex-wrap gap-1.5 mt-1">
                          <For each={profile()?.certifications || []}>
                            {(cert: string) => (
                              <span class="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs font-medium border border-amber-200 dark:border-amber-800">
                                {cert}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right Column: Location & Availability */}
            <div class="space-y-6">
              {/* Location Card */}
              <Card>
                <CardContent class="p-6">
                  <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                    <LocateFixed class="h-4 w-4" /> Location
                  </h3>
                  {/* Map First */}
                  <div class="rounded-md overflow-hidden border border-border mb-4">
                    <ProfileMap
                      latitude={profile()?.latitude}
                      longitude={profile()?.longitude}
                      cityName={profile()?.city}
                      editable={false}
                      height="140px"
                    />
                  </div>
                  {/* Address Details Below */}
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        City
                      </label>
                      <p class="text-base font-medium text-foreground mt-1">
                        {profile()?.city || 'Not set'}
                      </p>
                    </div>
                    <div>
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Address
                      </label>
                      <p
                        class="text-base font-medium text-foreground mt-1 truncate"
                        title={profile()?.address || profile()?.city}
                      >
                        {profile()?.address || profile()?.city || 'Not set'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Availability & Rate */}
              <Card>
                <CardContent class="p-6">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-2">
                    <Clock class="h-3 w-3" /> Availability & Rate
                  </h4>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Hours/Week
                      </label>
                      <p class="text-base font-bold text-foreground mt-1">
                        {profile()?.maxWorkHoursWeekly || 15}h
                      </p>
                    </div>
                    <div>
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Hourly Rate
                      </label>
                      <p class="text-base font-bold text-foreground mt-1">
                        {formatCurrencyWithSuffix(profile()?.minHourlyRate || 12, currency(), '/h')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Row 2: System Health Grid (Visible by default) */}
          <Show when={!debugState.loading && debugState()}>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ComebackWidget state={debugState()!} />
              <DebtWidget state={debugState()!} />
              <PreferencesWidget state={debugState()!} />
            </div>
          </Show>

          {/* Skills Section (Full Width) */}
          <div class="mt-6 border-t border-border">
            <SkillsTab embedded={false} />
          </div>
        </div>
      </Show>

      {/* EDIT MODE */}
      <Show when={editing()}>
        <div class="space-y-6">
          {/* Row 1: Identity & Location */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Identity Card (Editable) */}
            <Card class="h-full">
              <CardContent class="p-0 flex flex-col h-full">
                {/* Main Identity Edit */}
                <div class="p-6 space-y-4 flex-1">
                  <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                    <ClipboardList class="h-4 w-4" /> Edit Identity
                  </h3>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2 sm:col-span-1 space-y-2">
                      <label class="text-sm font-medium leading-none">Name</label>
                      <Input
                        class="bg-background"
                        value={editedProfile().name || ''}
                        onInput={(e) =>
                          setEditedProfile({ ...editedProfile(), name: e.currentTarget.value })
                        }
                      />
                    </div>
                    <div class="col-span-2 sm:col-span-1 space-y-2">
                      <label class="text-sm font-medium leading-none">Diploma</label>
                      <Select
                        class="bg-background"
                        value={editedProfile().diploma || ''}
                        options={[{ value: '', label: 'Select diploma...' }, ...DIPLOMA_OPTIONS]}
                        onInput={(e) =>
                          setEditedProfile({ ...editedProfile(), diploma: e.currentTarget.value })
                        }
                      />
                    </div>
                    <div class="col-span-2 space-y-2">
                      <label class="text-sm font-medium leading-none">Field of Study</label>
                      <Input
                        class="bg-background"
                        placeholder="e.g., Computer Science"
                        value={editedProfile().field || ''}
                        onInput={(e) =>
                          setEditedProfile({ ...editedProfile(), field: e.currentTarget.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Sub-pane: Work Preferences Edit (Lighter/Different Bg) */}
                <div class="bg-muted/30 p-6 border-t border-border mt-auto">
                  <h4 class="text-xs font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-2">
                    <Clock class="h-3 w-3" /> Edit Availability & Rate
                  </h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <label class="text-sm font-medium leading-none">Max Hours/Week</label>
                      <Input
                        type="number"
                        min="1"
                        max="60"
                        class="bg-background"
                        value={editedProfile().maxWorkHoursWeekly || 15}
                        onInput={(e) =>
                          setEditedProfile({
                            ...editedProfile(),
                            maxWorkHoursWeekly: parseInt(e.currentTarget.value) || 15,
                          })
                        }
                      />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium leading-none">
                        Min Hourly Rate ({currencySymbol()})
                      </label>
                      <Input
                        type="number"
                        min="5"
                        max="200"
                        class="bg-background"
                        value={editedProfile().minHourlyRate || 12}
                        onInput={(e) =>
                          setEditedProfile({
                            ...editedProfile(),
                            minHourlyRate: parseInt(e.currentTarget.value) || 12,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Location Card (Editable) */}
            <Card class="h-full">
              <CardContent class="p-6 space-y-4">
                <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                  <LocateFixed class="h-4 w-4" /> Edit Location
                </h3>

                {/* Search Bar + Geolocation */}
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <Input
                      placeholder="Search city..."
                      value={citySearchInput()}
                      onInput={(e) => handleCitySearch(e.currentTarget.value)}
                      class="pr-8 bg-background"
                    />
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <Show
                        when={isSearching()}
                        fallback={<Search class="h-4 w-4 text-muted-foreground" />}
                      >
                        <Loader2 class="h-4 w-4 text-primary animate-spin" />
                      </Show>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleUseMyLocation}
                    disabled={isGeolocating()}
                  >
                    <Show when={isGeolocating()} fallback={<LocateFixed class="h-4 w-4" />}>
                      <Loader2 class="h-4 w-4 animate-spin" />
                    </Show>
                  </Button>
                </div>

                {/* Map (Editable) */}
                <div class="rounded-md overflow-hidden border border-border">
                  <ProfileMap
                    latitude={editedProfile().latitude}
                    longitude={editedProfile().longitude}
                    cityName={editedProfile().city}
                    editable={true}
                    height="200px"
                    searchQuery={citySearchQuery()}
                    onSearching={setIsSearching}
                    onLocationChange={(location: LocationChangeData) => {
                      setEditedProfile({
                        ...editedProfile(),
                        latitude: location.latitude,
                        longitude: location.longitude,
                        city: location.city,
                        address: location.address || editedProfile().address,
                      });
                      setCitySearchInput(location.city);
                    }}
                  />
                </div>

                {/* City/Address Display (Read-only) */}
                <div class="grid grid-cols-2 gap-4 bg-muted/50 p-3 rounded-md">
                  <div>
                    <span class="text-xs font-semibold text-muted-foreground uppercase">City</span>
                    <p class="text-sm font-medium">{editedProfile().city || 'Select on map'}</p>
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-muted-foreground uppercase">
                      Address
                    </span>
                    <p class="text-sm font-medium truncate" title={editedProfile().address}>
                      {editedProfile().address || 'Auto-filled'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Certifications (Editable) */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card class="h-full">
              <CardContent class="p-6 space-y-4">
                <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                  <GraduationCap class="h-4 w-4" /> Edit Certifications
                </h3>

                {/* Active Certs */}
                <div class="flex flex-wrap gap-2 min-h-[40px]">
                  <For each={editedProfile().certifications || []}>
                    {(cert: string, index) => (
                      <span class="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-md text-sm font-medium border border-amber-200 dark:border-amber-800">
                        {cert}
                        <button
                          type="button"
                          onClick={() => {
                            const certs = [...(editedProfile().certifications || [])];
                            certs.splice(index(), 1);
                            setEditedProfile({ ...editedProfile(), certifications: certs });
                          }}
                          class="ml-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded p-0.5 transition-colors"
                        >
                          <X class="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </For>
                  <Show when={(editedProfile().certifications || []).length === 0}>
                    <p class="text-sm text-muted-foreground italic py-2">
                      No certifications added.
                    </p>
                  </Show>
                </div>

                {/* Input */}
                <div class="flex gap-2">
                  <Input
                    placeholder="Add custom certification..."
                    value={newCertification()}
                    onInput={(e) => setNewCertification(e.currentTarget.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newCertification().trim()) {
                        e.preventDefault();
                        const certs = [...(editedProfile().certifications || [])];
                        if (!certs.includes(newCertification().trim())) {
                          certs.push(newCertification().trim());
                          setEditedProfile({ ...editedProfile(), certifications: certs });
                        }
                        setNewCertification('');
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (newCertification().trim()) {
                        const certs = [...(editedProfile().certifications || [])];
                        if (!certs.includes(newCertification().trim())) {
                          certs.push(newCertification().trim());
                          setEditedProfile({ ...editedProfile(), certifications: certs });
                        }
                        setNewCertification('');
                      }
                    }}
                    disabled={!newCertification().trim()}
                  >
                    <Plus class="h-4 w-4" />
                  </Button>
                </div>

                {/* Quick Add Pills */}
                <div class="pt-2 border-t border-border">
                  <span class="text-xs text-muted-foreground uppercase font-semibold block mb-2">
                    Suggestions
                  </span>
                  <div class="flex flex-wrap gap-2">
                    <For
                      each={POPULAR_CERTIFICATIONS.filter(
                        (c) => !(editedProfile().certifications || []).includes(c.label)
                      )}
                    >
                      {(cert) => (
                        <button
                          type="button"
                          onClick={() => {
                            const certs = [...(editedProfile().certifications || [])];
                            certs.push(cert.label);
                            setEditedProfile({ ...editedProfile(), certifications: certs });
                          }}
                          class="px-2 py-1 text-xs bg-muted hover:bg-primary/10 hover:text-primary rounded-md border border-border transition-colors"
                        >
                          + {cert.label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Bar */}
          <div class="sticky bottom-6 bg-background/95 backdrop-blur border border-border rounded-lg p-4 shadow-lg flex gap-3 z-10">
            <Button variant="outline" class="flex-1" onClick={handleCancel} disabled={saving()}>
              Cancel Changes
            </Button>
            <Button class="flex-1" onClick={handleSave} disabled={saving()}>
              <Show when={saving()} fallback="Save Profile">
                <Loader2 class="h-4 w-4 animate-spin mr-2" /> Saving...
              </Show>
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
