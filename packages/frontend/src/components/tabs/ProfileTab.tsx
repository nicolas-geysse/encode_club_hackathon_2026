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

// Alias for cleaner code
type Profile = FullProfile;

interface ProfileTabProps {
  onProfileChange?: (profile: Partial<Profile>) => void;
}

export function ProfileTab(props: ProfileTabProps) {
  // Use shared ProfileContext instead of local state
  // This ensures ProfileSelector and other components see the same data
  const { profile: contextProfile, loading: contextLoading, refreshProfile } = useProfile();

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
    } catch (error) {
      console.error('[ProfileTab] Failed to save profile:', error);
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

    const income = (p.incomeSources || []).reduce(
      (sum: number, s: { amount?: number }) => sum + (s.amount || 0),
      0
    );
    const expenses = (p.expenses || []).reduce(
      (sum: number, e: { amount?: number }) => sum + (e.amount || 0),
      0
    );
    return { income, expenses, margin: income - expenses };
  };

  return (
    <div class="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>👤</span> My Profile
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Your personal and financial information
          </p>
        </div>
        <Show when={!editing() && profile()}>
          <button type="button" class="btn-primary" onClick={() => setEditing(true)}>
            Edit
          </button>
        </Show>
      </div>

      {/* Loading State */}
      <Show when={loading()}>
        <div class="card text-center py-12">
          <div class="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p class="text-slate-500 dark:text-slate-400">Loading profile...</p>
        </div>
      </Show>

      {/* Empty State */}
      <Show when={!loading() && !profile()}>
        <div class="card text-center py-12">
          <div class="text-4xl mb-4">👤</div>
          <h3 class="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
            No profile found
          </h3>
          <p class="text-slate-500 dark:text-slate-400 mb-4">
            Complete the onboarding to create your profile
          </p>
          <a href="/" class="btn-primary inline-block">
            Start Onboarding
          </a>
        </div>
      </Show>

      {/* Profile Display */}
      <Show when={!loading() && profile() && !editing()}>
        {/* Personal Info Card */}
        <div class="card">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <span>📋</span> Personal Information
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Name
              </label>
              <p class="text-lg font-medium text-slate-900 dark:text-slate-100">
                {profile()?.name || 'Not set'}
              </p>
            </div>
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                City
              </label>
              <p class="text-lg font-medium text-slate-900 dark:text-slate-100">
                {profile()?.city || 'Not set'}
              </p>
            </div>
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Diploma
              </label>
              <p class="text-lg font-medium text-slate-900 dark:text-slate-100">
                {profile()?.diploma || 'Not set'}
              </p>
            </div>
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Field of Study
              </label>
              <p class="text-lg font-medium text-slate-900 dark:text-slate-100">
                {profile()?.field || 'Not set'}
              </p>
            </div>
          </div>
        </div>

        {/* Skills Card */}
        <div class="card">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <span>💼</span> Skills
          </h3>
          <Show
            when={(profile()?.skills || []).length > 0}
            fallback={<p class="text-slate-500 dark:text-slate-400">No skills added yet</p>}
          >
            <div class="flex flex-wrap gap-2">
              <For each={profile()?.skills || []}>
                {(skill: string) => (
                  <span class="px-3 py-1.5 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full text-sm font-medium">
                    {skill}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Work Preferences Card */}
        <div class="card">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <span>⏱️</span> Work Preferences
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Max Hours/Week
              </label>
              <p class="text-lg font-medium text-slate-900 dark:text-slate-100">
                {profile()?.maxWorkHoursWeekly || 15}h
              </p>
            </div>
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Min Hourly Rate
              </label>
              <p class="text-lg font-medium text-slate-900 dark:text-slate-100">
                ${profile()?.minHourlyRate || 12}/h
              </p>
            </div>
          </div>
        </div>

        {/* Budget Summary Card */}
        <div class="card">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <span>💰</span> Budget Summary
          </h3>
          {(() => {
            const budget = calculateBudgetSummary();
            return (
              <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                  <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Income
                  </label>
                  <p class="text-lg font-bold text-green-600 dark:text-green-400">
                    ${budget.income}/mo
                  </p>
                </div>
                <div>
                  <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Expenses
                  </label>
                  <p class="text-lg font-bold text-red-600 dark:text-red-400">
                    ${budget.expenses}/mo
                  </p>
                </div>
                <div>
                  <label class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Margin
                  </label>
                  <p
                    class={`text-lg font-bold ${budget.margin >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {budget.margin >= 0 ? '+' : ''}${budget.margin}/mo
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Goal Card */}
        <Show when={profile()?.goalName}>
          <div class="card bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30 border-primary-200 dark:border-primary-700">
            <h3 class="text-sm font-medium text-primary-700 dark:text-primary-300 mb-4 flex items-center gap-2">
              <span>🎯</span> Current Goal
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="text-xs text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                  Goal
                </label>
                <p class="text-lg font-bold text-primary-900 dark:text-primary-100">
                  {profile()?.goalName}
                </p>
              </div>
              <div>
                <label class="text-xs text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                  Amount
                </label>
                <p class="text-lg font-bold text-primary-900 dark:text-primary-100">
                  ${profile()?.goalAmount || 0}
                </p>
              </div>
              <div>
                <label class="text-xs text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                  Deadline
                </label>
                <p class="text-lg font-bold text-primary-900 dark:text-primary-100">
                  {profile()?.goalDeadline || 'Not set'}
                </p>
              </div>
            </div>
          </div>
        </Show>
      </Show>

      {/* Edit Form */}
      <Show when={editing()}>
        <div class="space-y-4">
          {/* Personal Info */}
          <div class="card">
            <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
              Personal Information
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  class="input-field"
                  value={editedProfile().name || ''}
                  onInput={(e) =>
                    setEditedProfile({ ...editedProfile(), name: e.currentTarget.value })
                  }
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  City
                </label>
                <input
                  type="text"
                  class="input-field"
                  value={editedProfile().city || ''}
                  onInput={(e) =>
                    setEditedProfile({ ...editedProfile(), city: e.currentTarget.value })
                  }
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Diploma
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="e.g., Bachelor, Master, PhD"
                  value={editedProfile().diploma || ''}
                  onInput={(e) =>
                    setEditedProfile({ ...editedProfile(), diploma: e.currentTarget.value })
                  }
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Field of Study
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="e.g., Computer Science, Law, Business"
                  value={editedProfile().field || ''}
                  onInput={(e) =>
                    setEditedProfile({ ...editedProfile(), field: e.currentTarget.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Work Preferences */}
          <div class="card">
            <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
              Work Preferences
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Max Hours/Week
                </label>
                <input
                  type="number"
                  class="input-field"
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
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Min Hourly Rate ($)
                </label>
                <input
                  type="number"
                  class="input-field"
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
          </div>

          {/* Actions */}
          <div class="flex gap-3">
            <button
              type="button"
              class="btn-secondary flex-1"
              onClick={handleCancel}
              disabled={saving()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-primary flex-1"
              onClick={handleSave}
              disabled={saving()}
            >
              {saving() ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Show>

      {/* Chat Link */}
      <div class="card bg-slate-50 dark:bg-slate-700">
        <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Need to make more changes?
        </h4>
        <p class="text-sm text-slate-600 dark:text-slate-400 mb-3">
          You can also update your profile by chatting with Bruno. Just say "change my city to
          Paris" or "update my skills".
        </p>
        <a
          href="/"
          class="text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
        >
          Go to Chat →
        </a>
      </div>
    </div>
  );
}
