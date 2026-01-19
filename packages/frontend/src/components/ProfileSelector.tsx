/**
 * ProfileSelector Component
 *
 * Dropdown in header to select/switch profiles.
 * Shows active profile name + goal icon.
 * Uses ProfileContext for shared state across the app.
 */

import { createSignal, Show, For, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useNavigate } from '@solidjs/router';
import { profileService, type ProfileSummary, type FullProfile } from '~/lib/profileService';
import { useProfile } from '~/lib/profileContext';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '~/components/ui/Card';
import {
  User,
  Target,
  ChevronDown,
  Plus,
  Trash2,
  Check,
  Download,
  Upload,
  UserPlus,
  RotateCcw,
} from 'lucide-solid';

interface Props {
  onProfileChange?: (profile: FullProfile | null) => void;
}

export function ProfileSelector(props: Props) {
  const navigate = useNavigate();
  // Get shared profile state from context
  const { profile: activeProfile, loading: contextLoading, refreshProfile } = useProfile();

  const [isOpen, setIsOpen] = createSignal(false);
  const [profiles, setProfiles] = createSignal<ProfileSummary[]>([]);
  const [localLoading, setLocalLoading] = createSignal(true);
  const [showNewGoalModal, setShowNewGoalModal] = createSignal(false);
  const [newGoalForm, setNewGoalForm] = createSignal({
    name: '',
    amount: 500,
    deadline: '',
  });

  // Combined loading state
  const loading = () => contextLoading() || localLoading();

  // Load profiles on mount
  onMount(async () => {
    await loadProfiles();
  });

  const loadProfiles = async () => {
    setLocalLoading(true);
    try {
      // First try to sync localStorage to DB if needed
      await profileService.syncLocalToDb();

      // Load profiles list for dropdown
      const allProfiles = await profileService.listProfiles();
      setProfiles(allProfiles);

      // Refresh active profile via context (shared across app)
      await refreshProfile();
      props.onProfileChange?.(activeProfile());
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleSwitch = async (profileId: string) => {
    if (profileId === activeProfile()?.id) {
      setIsOpen(false);
      return;
    }

    const success = await profileService.switchProfile(profileId);
    if (success) {
      // Clear profile-specific localStorage items to prevent cross-profile contamination
      localStorage.removeItem('followupData');
      localStorage.removeItem('planData');
      localStorage.removeItem('achievements');
      // Force full page reload to reset all component state
      window.location.reload();
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
      // Clear profile-specific localStorage items to prevent cross-profile contamination
      localStorage.removeItem('followupData');
      localStorage.removeItem('planData');
      localStorage.removeItem('achievements');
      // Force full page reload to reset all component state for new profile
      window.location.reload();
    }

    setShowNewGoalModal(false);
    setNewGoalForm({ name: '', amount: 500, deadline: '' });
  };

  const getProfileIcon = (profile: ProfileSummary | FullProfile | null) => {
    if (!profile) return User;
    if (profile.profileType === 'goal-clone') return Target;
    return User;
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

  const handleDelete = async (profileId: string, profileName: string, e: Event) => {
    e.stopPropagation(); // Prevent triggering switch

    // Confirmation
    if (!confirm(`Delete profile "${profileName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/profiles?id=${profileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete profile');
      }

      // Reload profiles
      await loadProfiles();
    } catch (error) {
      console.error('Delete failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete profile');
    }
  };

  const handleNewFreshProfile = () => {
    // Clear localStorage to trigger fresh onboarding
    localStorage.removeItem('studentProfile');
    localStorage.removeItem('planData');
    localStorage.removeItem('activeProfileId');
    localStorage.removeItem('followupData');
    localStorage.removeItem('achievements');
    // Set flag to force fresh onboarding (skip API profile loading)
    localStorage.setItem('forceNewProfile', 'true');
    setIsOpen(false);
    // Navigate to onboarding - new profile will auto-generate UUID on first save
    navigate('/');
  };

  const handleResetAll = async () => {
    // Double confirmation for destructive action
    if (
      !confirm(
        '⚠️ RESET ALL DATA?\n\nThis will delete ALL profiles, goals, and progress.\nThis action cannot be undone!'
      )
    ) {
      return;
    }
    if (!confirm('Are you absolutely sure? Type OK to confirm.')) {
      return;
    }

    try {
      const response = await fetch('/api/reset', { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Reset failed');
      }

      // Clear all localStorage
      localStorage.removeItem('studentProfile');
      localStorage.removeItem('planData');
      localStorage.removeItem('activeProfileId');
      localStorage.removeItem('followupData');
      localStorage.removeItem('achievements');
      localStorage.removeItem('forceNewProfile');

      setIsOpen(false);
      // Force full reload to start fresh onboarding
      window.location.href = '/';
    } catch (error) {
      console.error('Reset failed:', error);
      alert(error instanceof Error ? error.message : 'Reset failed');
    }
  };

  return (
    <div class="relative">
      {/* Profile Button */}
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen())}
        class="flex items-center gap-2 h-9 px-3 bg-muted/50 hover:bg-muted border-border"
        disabled={loading()}
      >
        <Show when={!loading()} fallback={<span class="animate-pulse">...</span>}>
          <Dynamic component={getProfileIcon(activeProfile())} class="h-4 w-4" />
          <span class="font-medium max-w-[120px] truncate hidden sm:inline">
            {activeProfile()?.name || 'No profile'}
          </span>
          <Show when={activeProfile()?.goalName}>
            <span class="text-xs text-muted-foreground max-w-[80px] truncate hidden md:inline">
              ({activeProfile()?.goalName})
            </span>
          </Show>
          <ChevronDown
            class={`w-4 h-4 text-muted-foreground transition-transform ${isOpen() ? 'rotate-180' : ''}`}
          />
        </Show>
      </Button>

      {/* Dropdown */}
      <Show when={isOpen()}>
        <div class="absolute right-0 mt-2 w-72 bg-popover rounded-md shadow-md border border-border z-50 animate-in fade-in zoom-in-95 duration-200">
          <div class="py-2">
            <div class="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              My Profiles
            </div>

            <Show when={profiles().length === 0}>
              <a
                href="/"
                class="w-full flex items-center gap-3 px-3 py-2 text-primary hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Plus class="h-4 w-4" />
                <span class="text-sm font-medium">Create a profile</span>
              </a>
            </Show>

            <div class="max-h-[300px] overflow-y-auto">
              <For each={profiles()}>
                {(profile) => (
                  <div
                    class={`group w-full flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer ${
                      profile.isActive ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => handleSwitch(profile.id)}
                  >
                    <Dynamic
                      component={getProfileIcon(profile)}
                      class="h-4 w-4 text-muted-foreground"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-sm truncate">{profile.name}</div>
                      <Show when={profile.goalName}>
                        <div class="text-xs text-muted-foreground truncate">
                          {profile.goalName} - ${profile.goalAmount}
                        </div>
                      </Show>
                    </div>
                    <Show when={profile.isActive}>
                      <Check class="h-4 w-4 text-primary" />
                    </Show>

                    {/* Delete button - only show if more than 1 profile */}
                    <Show when={profiles().length > 1}>
                      <button
                        onClick={(e) => handleDelete(profile.id, profile.name, e)}
                        class="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                        title="Delete profile"
                      >
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <div class="border-t border-border mt-2 pt-2 px-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewFreshProfile}
                class="w-full justify-start gap-2 mb-1"
              >
                <UserPlus class="h-4 w-4" />
                New profile
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsOpen(false);
                  setShowNewGoalModal(true);
                }}
                class="w-full justify-start gap-2 mb-1"
              >
                <Target class="h-4 w-4" />
                New goal
              </Button>
            </div>

            <div class="border-t border-border mt-2 pt-2 px-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                class="w-full justify-start gap-2 mb-1"
              >
                <Upload class="h-4 w-4" />
                Export profile
              </Button>
              <label class="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
                <Download class="h-4 w-4" />
                Import profile
                <input type="file" accept=".json" class="hidden" onChange={handleImport} />
              </label>
            </div>

            {/* Danger zone */}
            <div class="border-t border-destructive/30 mt-2 pt-2 px-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetAll}
                class="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <RotateCcw class="h-4 w-4" />
                Reset all data
              </Button>
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
        <div class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <Card class="w-full max-w-md mx-4 shadow-xl">
            <CardHeader>
              <CardTitle>New goal</CardTitle>
              <CardDescription>
                Create a new profile based on "{activeProfile()?.name}" with a new goal.
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">Goal name</label>
                <Input
                  type="text"
                  value={newGoalForm().name}
                  onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                    setNewGoalForm({ ...newGoalForm(), name: e.currentTarget.value })
                  }
                  placeholder="Ex: Driver's license"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-foreground mb-1">
                  Target amount ($)
                </label>
                <Input
                  type="number"
                  value={newGoalForm().amount}
                  onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                    setNewGoalForm({
                      ...newGoalForm(),
                      amount: parseInt(e.currentTarget.value) || 0,
                    })
                  }
                  min="0"
                  step="50"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-foreground mb-1">
                  Deadline (optional)
                </label>
                <Input
                  type="date"
                  value={newGoalForm().deadline}
                  onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                    setNewGoalForm({ ...newGoalForm(), deadline: e.currentTarget.value })
                  }
                />
              </div>
            </CardContent>
            <CardFooter class="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewGoalModal(false);
                  setNewGoalForm({ name: '', amount: 500, deadline: '' });
                }}
                class="bg-[#F4F4F5] hover:bg-[#E4E4E7] dark:bg-[#27272A] dark:hover:bg-[#3F3F46] border-border"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDuplicateForGoal}
                disabled={!newGoalForm().name || !newGoalForm().amount}
              >
                Create
              </Button>
            </CardFooter>
          </Card>
        </div>
      </Show>
    </div>
  );
}

export default ProfileSelector;
