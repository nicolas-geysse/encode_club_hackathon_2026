/**
 * ProfileSelector Component
 *
 * Dropdown in header for simulations, settings, and reset.
 * Goal switching is handled by GoalsTab inline selector.
 * Uses ProfileContext for shared state across the app.
 */

import { createSignal, Show, For, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { profileService, type ProfileSummary, type FullProfile } from '~/lib/profileService';
import { useProfile } from '~/lib/profileContext';
import { eventBus } from '~/lib/eventBus';
import { toast } from '~/lib/notificationStore';
import { Button } from '~/components/ui/Button';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import {
  Target,
  ChevronDown,
  Trash2,
  Check,
  RotateCcw,
  FlaskConical,
  Settings,
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
  const [showResetConfirm1, setShowResetConfirm1] = createSignal(false);
  const [showResetConfirm2, setShowResetConfirm2] = createSignal(false);
  const [deleteProfileConfirm, setDeleteProfileConfirm] = createSignal<{
    id: string;
    name: string;
  } | null>(null);

  // Combined loading state
  const loading = () => contextLoading() || localLoading();

  const simProfiles = () => profiles().filter((p) => p.profileType === 'simulation');

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
    } catch {
      toast.error('Load error', 'Could not load profiles.');
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

  const isSimulation = (profile: ProfileSummary | FullProfile | null) => {
    return profile?.profileType === 'simulation';
  };

  const handleDelete = (profileId: string, profileName: string, e: Event) => {
    e.stopPropagation(); // Prevent triggering switch
    setDeleteProfileConfirm({ id: profileId, name: profileName });
  };

  const confirmDeleteProfile = async () => {
    const target = deleteProfileConfirm();
    if (!target) return;
    setDeleteProfileConfirm(null);

    try {
      const response = await fetch(`/api/profiles?id=${target.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete profile');
      }

      // Reload profiles
      await loadProfiles();
    } catch (error) {
      toast.error(
        'Delete failed',
        error instanceof Error ? error.message : 'Failed to delete profile.'
      );
    }
  };

  const handleResetAll = () => {
    setIsOpen(false);
    setShowResetConfirm1(true);
  };

  const executeReset = async () => {
    setShowResetConfirm2(false);

    try {
      const response = await fetch('/api/reset', { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Reset failed');
      }

      // 1. Notify other components/tabs immediately (use DATA_RESET for full reset)
      eventBus.emit('DATA_RESET');

      // 2. Clear all localStorage (profile + onboarding + wellbeing data)
      localStorage.removeItem('studentProfile');
      localStorage.removeItem('planData');
      localStorage.removeItem('activeProfileId');
      localStorage.removeItem('followupData');
      localStorage.removeItem('achievements');
      localStorage.removeItem('onboardingComplete');
      localStorage.removeItem('stride_chat_onboarding_temp'); // Temp chat messages during onboarding
      localStorage.removeItem('stride_last_mood_check'); // Daily mood check timestamp
      localStorage.removeItem('stride_has_visited'); // First visit flag
      // Clear all chat history entries (keyed by profile ID)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('stride_chat_history_')) {
          localStorage.removeItem(key);
        }
      }
      // Signal OnboardingChat to start completely fresh (skip API profile loading)
      localStorage.setItem('forceNewProfile', 'true');

      setIsOpen(false);

      // 3. Reactive update: Refresh context to clear state immediately
      await refreshProfile();

      // 4. Smooth navigation to onboarding (instead of hard reload)
      navigate('/');

      toast.success('System Reset', 'All data has been wiped successfully.');
    } catch (error) {
      toast.error('Reset failed', error instanceof Error ? error.message : 'Reset failed.');
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
          <Show
            when={!isSimulation(activeProfile())}
            fallback={
              <>
                <FlaskConical class="h-4 w-4 text-purple-500" />
                <span class="font-medium max-w-[120px] truncate hidden sm:inline">
                  {activeProfile()?.name || 'No profile'}
                </span>
                <span class="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded hidden sm:inline">
                  SIM
                </span>
              </>
            }
          >
            <Target class="h-4 w-4 text-primary" />
            <span class="font-medium max-w-[140px] truncate hidden sm:inline">
              {activeProfile()?.goalName || 'No goal'}
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
            {/* Simulation profiles (shown if any) */}
            <Show when={simProfiles().length > 0}>
              <div class="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Simulations
              </div>
              <div class="max-h-[200px] overflow-y-auto">
                <For each={simProfiles()}>
                  {(profile) => (
                    <div
                      class={`group w-full flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer ${
                        profile.isActive ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => handleSwitch(profile.id)}
                    >
                      <FlaskConical class="h-4 w-4 text-purple-500" />
                      <div class="flex-1 min-w-0">
                        <div class="font-medium text-sm truncate flex items-center gap-1">
                          {profile.name}
                          <span class="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded">
                            SIM
                          </span>
                        </div>
                      </div>
                      <Show when={profile.isActive}>
                        <Check class="h-4 w-4 text-primary" />
                      </Show>
                      <button
                        onClick={(e) => handleDelete(profile.id, profile.name, e)}
                        class="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                        title="Delete simulation"
                      >
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div
              class={simProfiles().length > 0 ? 'border-t border-border mt-2 pt-2 px-1' : 'px-1'}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/settings');
                }}
                class="w-full justify-start gap-2 mb-1"
              >
                <Settings class="h-4 w-4" />
                API Settings
              </Button>
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

      {/* Reset Confirmation Step 1 */}
      <ConfirmDialog
        isOpen={showResetConfirm1()}
        title="⚠️ Reset all data?"
        message="This will delete ALL profiles, goals, and progress. This action cannot be undone. Are you sure you want to proceed?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setShowResetConfirm1(false);
          setShowResetConfirm2(true);
        }}
        onCancel={() => setShowResetConfirm1(false)}
      />

      {/* Reset Confirmation Step 2 */}
      <ConfirmDialog
        isOpen={showResetConfirm2()}
        title="Thinking twice..."
        message="Are you absolutely sure? This will wipe everything and return you to the onboarding screen."
        confirmLabel="Yes, Delete Everything"
        cancelLabel="Stop, go back"
        variant="danger"
        onConfirm={executeReset}
        onCancel={() => setShowResetConfirm2(false)}
      />

      {/* Profile Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteProfileConfirm()}
        title="Delete Profile"
        message={`Delete profile "${deleteProfileConfirm()?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDeleteProfile}
        onCancel={() => setDeleteProfileConfirm(null)}
      />
    </div>
  );
}

export default ProfileSelector;
