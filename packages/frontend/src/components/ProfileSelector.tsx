/**
 * ProfileSelector Component
 *
 * Dropdown in header to select/switch profiles.
 * Shows active profile name + goal icon.
 */

import { createSignal, Show, For, onMount } from 'solid-js';
import { profileService, type ProfileSummary, type FullProfile } from '~/lib/profileService';

interface Props {
  onProfileChange?: (profile: FullProfile | null) => void;
}

export function ProfileSelector(props: Props) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [profiles, setProfiles] = createSignal<ProfileSummary[]>([]);
  const [activeProfile, setActiveProfile] = createSignal<FullProfile | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [showNewGoalModal, setShowNewGoalModal] = createSignal(false);
  const [newGoalForm, setNewGoalForm] = createSignal({
    name: '',
    amount: 500,
    deadline: '',
  });

  // Load profiles on mount
  onMount(async () => {
    await loadProfiles();
  });

  const loadProfiles = async () => {
    setLoading(true);
    try {
      // First try to sync localStorage to DB if needed
      await profileService.syncLocalToDb();

      // Load profiles
      const allProfiles = await profileService.listProfiles();
      setProfiles(allProfiles);

      // Load active profile
      const active = await profileService.loadActiveProfile();
      setActiveProfile(active);
      props.onProfileChange?.(active);
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (profileId: string) => {
    if (profileId === activeProfile()?.id) {
      setIsOpen(false);
      return;
    }

    const success = await profileService.switchProfile(profileId);
    if (success) {
      const newActive = await profileService.loadActiveProfile();
      setActiveProfile(newActive);
      props.onProfileChange?.(newActive);

      // Update profiles list
      const allProfiles = await profileService.listProfiles();
      setProfiles(allProfiles);
    }
    setIsOpen(false);
  };

  const handleDuplicateForGoal = async () => {
    const current = activeProfile();
    if (!current) return;

    const form = newGoalForm();
    if (!form.name || !form.amount) return;

    const newProfile = await profileService.duplicateProfileForGoal(current.id, {
      goalName: form.name,
      goalAmount: form.amount,
      goalDeadline: form.deadline || undefined,
    });

    if (newProfile) {
      setActiveProfile(newProfile);
      props.onProfileChange?.(newProfile);

      // Reload profiles
      const allProfiles = await profileService.listProfiles();
      setProfiles(allProfiles);
    }

    setShowNewGoalModal(false);
    setNewGoalForm({ name: '', amount: 500, deadline: '' });
  };

  const getProfileIcon = (profile: ProfileSummary | FullProfile | null) => {
    if (!profile) return '👤';
    if (profile.profileType === 'goal-clone') return '🎯';
    return '👤';
  };

  const handleExport = async () => {
    const current = activeProfile();
    if (!current) return;

    try {
      await profileService.exportProfile(current.id);
      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export profile');
    }
  };

  const handleImport = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const result = await profileService.importProfile(file, { setActive: true });
      if (result.success && result.profileId) {
        // Reload profiles
        await loadProfiles();
        setIsOpen(false);
        alert(result.message || 'Profile imported successfully');
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to import profile');
    } finally {
      // Reset file input
      input.value = '';
    }
  };

  return (
    <div class="relative">
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm"
        disabled={loading()}
      >
        <Show when={!loading()} fallback={<span class="animate-pulse">...</span>}>
          <span>{getProfileIcon(activeProfile())}</span>
          <span class="font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
            {activeProfile()?.name || 'No profile'}
          </span>
          <Show when={activeProfile()?.goalName}>
            <span class="text-xs text-slate-500 dark:text-slate-400 max-w-[80px] truncate">
              ({activeProfile()?.goalName})
            </span>
          </Show>
          <svg
            class={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${isOpen() ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </Show>
      </button>

      {/* Dropdown */}
      <Show when={isOpen()}>
        <div class="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50">
          <div class="py-2">
            <div class="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
              My Profiles
            </div>

            <Show when={profiles().length === 0}>
              <a
                href="/"
                class="w-full flex items-center gap-3 px-3 py-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <span>➕</span>
                <span class="text-sm font-medium">Create a profile</span>
              </a>
            </Show>

            <For each={profiles()}>
              {(profile) => (
                <button
                  onClick={() => handleSwitch(profile.id)}
                  class={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                    profile.isActive ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                  }`}
                >
                  <span>{getProfileIcon(profile)}</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {profile.name}
                    </div>
                    <Show when={profile.goalName}>
                      <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {profile.goalName} - {profile.goalAmount}€
                      </div>
                    </Show>
                  </div>
                  <Show when={profile.isActive}>
                    <span class="text-primary-600 dark:text-primary-400 text-xs">✓</span>
                  </Show>
                </button>
              )}
            </For>

            <div class="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowNewGoalModal(true);
                }}
                class="w-full flex items-center gap-3 px-3 py-2 text-left text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
              >
                <span>🎯</span>
                <span class="text-sm font-medium">New goal</span>
              </button>
            </div>

            <div class="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2">
              <button
                onClick={handleExport}
                class="w-full flex items-center gap-3 px-3 py-2 text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <span>📤</span>
                <span class="text-sm">Export profile</span>
              </button>
              <label class="w-full flex items-center gap-3 px-3 py-2 text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                <span>📥</span>
                <span class="text-sm">Import profile</span>
                <input type="file" accept=".json" class="hidden" onChange={handleImport} />
              </label>
            </div>
          </div>
        </div>
      </Show>

      {/* Click outside to close */}
      <Show when={isOpen()}>
        <div class="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      </Show>

      {/* New Goal Modal */}
      <Show when={showNewGoalModal()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">New goal</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Create a new profile based on "{activeProfile()?.name}" with a new goal.
            </p>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Goal name
                </label>
                <input
                  type="text"
                  value={newGoalForm().name}
                  onInput={(e) => setNewGoalForm({ ...newGoalForm(), name: e.currentTarget.value })}
                  placeholder="Ex: Driver's license"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target amount (€)
                </label>
                <input
                  type="number"
                  value={newGoalForm().amount}
                  onInput={(e) =>
                    setNewGoalForm({
                      ...newGoalForm(),
                      amount: parseInt(e.currentTarget.value) || 0,
                    })
                  }
                  min="0"
                  step="50"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Deadline (optional)
                </label>
                <input
                  type="date"
                  value={newGoalForm().deadline}
                  onInput={(e) =>
                    setNewGoalForm({ ...newGoalForm(), deadline: e.currentTarget.value })
                  }
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div class="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewGoalModal(false);
                  setNewGoalForm({ name: '', amount: 500, deadline: '' });
                }}
                class="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicateForGoal}
                disabled={!newGoalForm().name || !newGoalForm().amount}
                class="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default ProfileSelector;
