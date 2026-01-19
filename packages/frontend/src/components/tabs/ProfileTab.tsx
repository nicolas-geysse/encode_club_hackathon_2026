/**
 * Profile Tab Component
 *
 * Displays and allows editing of user profile information.
 * Shows: Name, Diploma, Field, City, Work preferences, Budget.
 *
 * Uses ProfileContext for shared state so that changes here
 * are reflected in ProfileSelector and other components.
 */

import { createSignal, Show, For, createEffect } from 'solid-js';
import { profileService, type FullProfile } from '~/lib/profileService';
import { useProfile } from '~/lib/profileContext';
import { toast } from '~/lib/notificationStore';
import { calculateTotalExpenses } from '~/lib/expenseUtils';
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
import { cn } from '~/lib/cn';
import { User, Target, ClipboardList, GraduationCap, Briefcase, Clock } from 'lucide-solid';

// Alias for cleaner code
type Profile = FullProfile;

interface ProfileTabProps {
  onProfileChange?: (profile: Partial<Profile>) => void;
  currencySymbol?: string; // Kept for backward compatibility
}

export function ProfileTab(props: ProfileTabProps) {
  // Use shared ProfileContext instead of local state
  // This ensures ProfileSelector and other components see the same data
  const {
    profile: contextProfile,
    loading: contextLoading,
    refreshProfile,
    lifestyle: contextLifestyle,
    income: contextIncome,
  } = useProfile();

  // Get currency from profile context, fallback to USD
  const currency = () => (contextProfile()?.currency as Currency) || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  // Local state for editing UI
  const [editing, setEditing] = createSignal(false);
  const [editedProfile, setEditedProfile] = createSignal<Partial<Profile>>({});
  const [saving, setSaving] = createSignal(false);

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
    setEditing(false);
  };

  const calculateBudgetSummary = () => {
    const p = profile();
    if (!p) return { income: 0, expenses: 0, margin: 0 };

    // Use dynamic income from context (same as Budget Tab)
    const incomeItems = contextIncome();
    const income = incomeItems.reduce((sum, item) => sum + item.amount, 0);

    // Use merged expense sources (lifestyle_items + profile.expenses fallback)
    const lifestyleItems = contextLifestyle();
    const expenses = calculateTotalExpenses(lifestyleItems, p.expenses);

    return { income, expenses, margin: income - expenses };
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
          <Button onClick={() => setEditing(true)}>Edit</Button>
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

        {/* Budget Summary Cards */}
        {(() => {
          const budget = calculateBudgetSummary();
          return (
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Income */}
              <Card class="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
                <CardContent class="p-6">
                  <div class="text-sm text-green-600 dark:text-green-400 font-medium">Income</div>
                  <div class="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                    {formatCurrencyWithSuffix(budget.income, currency(), '/mo')}
                  </div>
                </CardContent>
              </Card>

              {/* Expenses */}
              <Card class="bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-500/20">
                <CardContent class="p-6">
                  <div class="text-sm text-red-600 dark:text-red-400 font-medium">Expenses</div>
                  <div class="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">
                    -{formatCurrencyWithSuffix(budget.expenses, currency(), '/mo')}
                  </div>
                </CardContent>
              </Card>

              {/* Net Margin */}
              <Card
                class={cn(
                  'bg-gradient-to-br border',
                  budget.margin >= 0
                    ? 'from-primary/5 to-primary/10 border-primary/20'
                    : 'from-amber-500/5 to-amber-500/10 border-amber-500/20'
                )}
              >
                <CardContent class="p-6">
                  <div
                    class={cn(
                      'text-sm font-medium',
                      budget.margin >= 0 ? 'text-primary' : 'text-amber-600 dark:text-amber-400'
                    )}
                  >
                    Margin
                  </div>
                  <div
                    class={cn(
                      'text-2xl font-bold mt-1',
                      budget.margin >= 0 ? 'text-primary' : 'text-amber-700 dark:text-amber-300'
                    )}
                  >
                    {formatCurrency(budget.margin, currency(), { showSign: true })}/mo
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Personal Info Card */}
        <Card>
          <CardContent class="p-6">
            <h3 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <ClipboardList class="h-4 w-4" /> Personal Information
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  City
                </label>
                <p class="text-lg font-medium text-foreground mt-1">
                  {profile()?.city || 'Not set'}
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
          {/* Personal Info */}
          <Card>
            <CardContent class="p-6 space-y-4">
              <h3 class="text-sm font-medium text-muted-foreground mb-4">Personal Information</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    City
                  </label>
                  <Input
                    type="text"
                    value={editedProfile().city || ''}
                    onInput={(e) =>
                      setEditedProfile({ ...editedProfile(), city: e.currentTarget.value })
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
