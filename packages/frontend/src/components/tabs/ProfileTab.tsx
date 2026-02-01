/**
 * Profile Tab Component
 *
 * Displays and allows editing of user profile information.
 * Shows: Name, Diploma, Field, City, Work preferences, Budget.
 *
 * Uses ProfileContext for shared state so that changes here
 * are reflected in ProfileSelector and other components.
 */

import { createSignal, Show, For, createEffect, onCleanup, on } from 'solid-js';
import { createDirtyState } from '~/hooks/createDirtyState';
import { profileService, type FullProfile } from '~/lib/profileService';
import { useProfile } from '~/lib/profileContext';
import { toast } from '~/lib/notificationStore';
import {
  formatDate,
  formatCurrency,
  formatCurrencyWithSuffix,
  getCurrencySymbol,
  type Currency,
} from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
  User,
  Target,
  ClipboardList,
  GraduationCap,
  Briefcase,
  Clock,
  X,
  Plus,
  Wallet,
  Search,
  Loader2,
  LocateFixed,
} from 'lucide-solid';
import { getCurrentLocation, isGeolocationSupported } from '~/lib/geolocation';
import ProfileMap, { type LocationChangeData } from './ProfileMap';

// Alias for cleaner code
type Profile = FullProfile;

interface ProfileTabProps {
  onProfileChange?: (profile: Partial<Profile>) => void;
  /** Callback to switch to the Budget tab */
  onNavigateToBudget?: () => void;
  /** Callback when dirty state changes (for parent to track unsaved changes) */
  onDirtyChange?: (isDirty: boolean) => void;
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
    <div class="p-6 space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
            <User class="h-6 w-6 text-primary" /> My Profile
          </h2>
          <p class="text-sm text-muted-foreground mt-1">Your personal and financial information</p>
        </div>
        <Show when={!editing() && profile()}>
          <Button onClick={handleStartEdit}>Edit</Button>
        </Show>
      </div>

      {/* Loading State */}
      <Show when={loading()}>
        <Card class="text-center py-12">
          <CardContent>
            <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p class="text-muted-foreground">Loading profile...</p>
          </CardContent>
        </Card>
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

      {/* Profile Display */}
      <Show when={!loading() && profile() && !editing()}>
        {/* Current Goal - wrapped container */}
        <Show when={profile()?.goalName}>
          <Card class="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent class="p-6">
              <h3 class="text-sm font-medium text-primary mb-4 flex items-center gap-2">
                <Target class="h-4 w-4" /> Current Goal
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Goal Name */}
                <div class="bg-background/50 rounded-lg p-4 border border-border/50">
                  <div class="text-sm text-muted-foreground">Goal</div>
                  <div class="text-xl font-bold text-foreground mt-1">{profile()?.goalName}</div>
                </div>

                {/* Amount */}
                <div class="bg-background/50 rounded-lg p-4 border border-border/50">
                  <div class="text-sm text-muted-foreground">Target</div>
                  <div class="text-xl font-bold text-foreground mt-1">
                    {formatCurrency(profile()?.goalAmount || 0, currency())}
                  </div>
                </div>

                {/* Deadline */}
                <div class="bg-background/50 rounded-lg p-4 border border-border/50">
                  <div class="text-sm text-muted-foreground">Deadline</div>
                  <div class="text-xl font-bold text-foreground mt-1">
                    {profile()?.goalDeadline
                      ? formatDate(profile()!.goalDeadline!, 'MMM D, YYYY')
                      : 'Not set'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Show>

        {/* Budget Link Card */}
        <Card class="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent class="p-6">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet class="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div class="text-sm font-medium text-primary">Budget & Finances</div>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    View income, expenses, savings, and trades
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onNavigateToBudget?.()}
                class="shrink-0"
              >
                View Budget
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Personal Info Card - 2 Column Layout */}
        <Card>
          <CardContent class="p-6">
            <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <ClipboardList class="h-4 w-4" /> Personal Information
            </h3>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Identity */}
              <div class="space-y-4">
                <div>
                  <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Name
                  </label>
                  <p class="text-lg font-medium text-foreground mt-1">
                    {profile()?.name || 'Not set'}
                  </p>
                </div>
                <div>
                  <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Diploma
                  </label>
                  <p class="text-lg font-medium text-foreground mt-1">
                    {profile()?.diploma || 'Not set'}
                  </p>
                </div>
                <div>
                  <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Field of Study
                  </label>
                  <p class="text-lg font-medium text-foreground mt-1">
                    {profile()?.field || 'Not set'}
                  </p>
                </div>
              </div>

              {/* Right Column: Location */}
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      City
                    </label>
                    <p class="text-lg font-medium text-foreground mt-1">
                      {profile()?.city || 'Not set'}
                    </p>
                  </div>
                  <div>
                    <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Address
                    </label>
                    <p
                      class="text-lg font-medium text-foreground mt-1 truncate"
                      title={profile()?.address || profile()?.city}
                    >
                      {profile()?.address || profile()?.city || 'Not set'}
                    </p>
                  </div>
                </div>
                <div>
                  <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
                    Location
                  </label>
                  <ProfileMap
                    latitude={profile()?.latitude}
                    longitude={profile()?.longitude}
                    cityName={profile()?.city}
                    editable={false}
                    height="160px"
                  />
                  {/* Show coordinates */}
                  <Show when={profile()?.latitude && profile()?.longitude}>
                    <p class="text-xs text-muted-foreground mt-1">
                      📍 {profile()?.latitude?.toFixed(4)}, {profile()?.longitude?.toFixed(4)}
                    </p>
                  </Show>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Certifications Card */}
        <Card>
          <CardContent class="p-6">
            <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <GraduationCap class="h-4 w-4" /> Certifications
            </h3>
            <Show
              when={(profile()?.certifications || []).length > 0}
              fallback={<p class="text-muted-foreground italic">No certifications added yet</p>}
            >
              <div class="flex flex-wrap gap-2">
                <For each={profile()?.certifications || []}>
                  {(cert: string) => (
                    <span class="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-md text-sm font-medium border border-amber-200 dark:border-amber-800">
                      {cert}
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </CardContent>
        </Card>

        {/* Skills Card */}
        <Card>
          <CardContent class="p-6">
            <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Briefcase class="h-4 w-4" /> Skills
            </h3>
            <Show
              when={(profile()?.skills || []).length > 0}
              fallback={<p class="text-muted-foreground italic">No skills added yet</p>}
            >
              <div class="flex flex-wrap gap-2">
                <For each={profile()?.skills || []}>
                  {(skill: string) => (
                    <span class="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium">
                      {skill}
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </CardContent>
        </Card>

        {/* Work Preferences Card */}
        <Card>
          <CardContent class="p-6">
            <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Clock class="h-4 w-4" /> Work Preferences
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Max Hours/Week
                </label>
                <p class="text-lg font-medium text-foreground mt-1">
                  {profile()?.maxWorkHoursWeekly || 15}h
                </p>
              </div>
              <div>
                <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Min Hourly Rate
                </label>
                <p class="text-lg font-medium text-foreground mt-1">
                  {formatCurrencyWithSuffix(profile()?.minHourlyRate || 12, currency(), '/h')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Edit Form */}
      <Show when={editing()}>
        <div class="space-y-4">
          {/* Personal Info - 2 Column Layout */}
          <Card>
            <CardContent class="p-6 space-y-4">
              <h3 class="text-sm font-medium text-muted-foreground mb-4">Personal Information</h3>
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Identity */}
                <div class="space-y-4">
                  <div class="space-y-2">
                    <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Name
                    </label>
                    <Input
                      type="text"
                      value={editedProfile().name || ''}
                      onInput={(e) =>
                        setEditedProfile({ ...editedProfile(), name: e.currentTarget.value })
                      }
                    />
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Diploma
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g., Bachelor, Master, PhD"
                      value={editedProfile().diploma || ''}
                      onInput={(e) =>
                        setEditedProfile({ ...editedProfile(), diploma: e.currentTarget.value })
                      }
                    />
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Field of Study
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g., Computer Science, Law, Business"
                      value={editedProfile().field || ''}
                      onInput={(e) =>
                        setEditedProfile({ ...editedProfile(), field: e.currentTarget.value })
                      }
                    />
                  </div>
                </div>

                {/* Right Column: Location */}
                <div class="space-y-4">
                  {/* Location Input */}
                  <div class="space-y-2">
                    <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Location
                    </label>
                    {/* Use my location button */}
                    <Button
                      type="button"
                      variant="outline"
                      class="w-full justify-center gap-2"
                      onClick={handleUseMyLocation}
                      disabled={isGeolocating()}
                    >
                      <Show when={isGeolocating()} fallback={<LocateFixed class="h-4 w-4" />}>
                        <Loader2 class="h-4 w-4 animate-spin" />
                      </Show>
                      {isGeolocating() ? 'Detecting location...' : 'Use my location'}
                    </Button>
                    {/* City search input */}
                    <div class="relative">
                      <Input
                        type="text"
                        placeholder="Or search a city (e.g., Paris, London)"
                        value={citySearchInput()}
                        onInput={(e) => handleCitySearch(e.currentTarget.value)}
                        class="pr-10"
                      />
                      <div class="absolute right-3 top-1/2 -translate-y-1/2">
                        <Show
                          when={isSearching()}
                          fallback={<Search class="h-4 w-4 text-muted-foreground" />}
                        >
                          <Loader2 class="h-4 w-4 text-primary animate-spin" />
                        </Show>
                      </div>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      Use geolocation, search, or drag the marker on the map.
                    </p>
                  </div>

                  {/* Map */}
                  <div class="space-y-2">
                    <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Location
                    </label>
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
                        // Update search input to match the new city
                        setCitySearchInput(location.city);
                      }}
                    />
                  </div>

                  {/* City and Address shown as read-only, auto-updated by map */}
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        City
                      </label>
                      <p class="text-base font-medium text-foreground mt-1">
                        {editedProfile().city || 'Search or move marker'}
                      </p>
                    </div>
                    <div>
                      <label class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        Address
                      </label>
                      <p
                        class="text-base font-medium text-foreground mt-1 truncate"
                        title={editedProfile().address}
                      >
                        {editedProfile().address || 'Will be auto-filled'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BUG 5 FIX: Certifications (Editable) */}
          <Card>
            <CardContent class="p-6 space-y-4">
              <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                <GraduationCap class="h-4 w-4" /> Certifications
              </h3>

              {/* Current certifications with remove buttons */}
              <div class="flex flex-wrap gap-2 mb-4">
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
                        title="Remove certification"
                      >
                        <X class="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </For>
                <Show when={(editedProfile().certifications || []).length === 0}>
                  <p class="text-muted-foreground italic text-sm">No certifications yet</p>
                </Show>
              </div>

              {/* Add new certification input */}
              <div class="flex gap-2">
                <Input
                  type="text"
                  placeholder="Add certification (e.g., BAFA, CPR, TEFL)"
                  value={newCertification()}
                  onInput={(e) => setNewCertification(e.currentTarget.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && newCertification().trim()) {
                      e.preventDefault();
                      const certs = [...(editedProfile().certifications || [])];
                      const newCert = newCertification().trim();
                      if (!certs.includes(newCert)) {
                        certs.push(newCert);
                        setEditedProfile({ ...editedProfile(), certifications: certs });
                      }
                      setNewCertification('');
                    }
                  }}
                  class="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (newCertification().trim()) {
                      const certs = [...(editedProfile().certifications || [])];
                      const newCert = newCertification().trim();
                      if (!certs.includes(newCert)) {
                        certs.push(newCert);
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
              <p class="text-xs text-muted-foreground">
                Press Enter or click + to add. Certifications can boost your hourly rate!
              </p>
            </CardContent>
          </Card>

          {/* Work Preferences */}
          <Card>
            <CardContent class="p-6 space-y-4">
              <h3 class="text-sm font-medium text-muted-foreground mb-4">Work Preferences</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Max Hours/Week
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="40"
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
                  <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Min Hourly Rate ({currencySymbol()})
                  </label>
                  <Input
                    type="number"
                    min="5"
                    max="100"
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
            </CardContent>
          </Card>

          {/* Actions */}
          <div class="flex gap-3">
            <Button
              variant="outline"
              class="flex-1 bg-[#F4F4F5] hover:bg-[#E4E4E7] dark:bg-[#27272A] dark:hover:bg-[#3F3F46] border-border"
              onClick={handleCancel}
              disabled={saving()}
            >
              Cancel
            </Button>
            <Button class="flex-1" onClick={handleSave} disabled={saving()}>
              {saving() ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
