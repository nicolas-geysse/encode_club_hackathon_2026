/**
 * Skills Tab Component
 *
 * Skill Arbitrage: multi-criteria job matching and scoring.
 * Now uses skillService for DuckDB persistence.
 * Uses createCrudTab hook for common CRUD state management.
 */

import { createSignal, For, Show, createEffect, onMount } from 'solid-js';
import { useProfile } from '~/lib/profileContext';
import { skillService, type Skill, type CreateSkillInput } from '~/lib/skillService';
import { createCrudTab } from '~/hooks/createCrudTab';
import { createDirtyState } from '~/hooks/createDirtyState';
import { UnsavedChangesDialog } from '~/components/ui/UnsavedChangesDialog';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { formatCurrencyWithSuffix, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { type LegacySkill, skillToLegacy } from '~/types/entities';
import { updateAchievements, onAchievementUnlock } from '~/lib/achievements';
import { toastPopup } from '~/components/ui/Toast';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
  Briefcase,
  Lightbulb,
  Check,
  Pencil,
  Trash2,
  Plus,
  X,
  BrainCircuit,
  Users,
  Bed,
  HelpCircle,
} from 'lucide-solid';

interface SkillsTabProps {
  initialSkills?: LegacySkill[];
  onSkillsChange?: (skills: LegacySkill[]) => void;
  currency?: Currency;
  /** Callback when dirty state changes (for parent to track unsaved changes) */
  onDirtyChange?: (isDirty: boolean) => void;
}

const SKILL_TEMPLATES: Partial<CreateSkillInput>[] = [
  { name: 'Python', hourlyRate: 25, marketDemand: 5, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'SQL Coaching', hourlyRate: 22, marketDemand: 4, cognitiveEffort: 3, restNeeded: 1 },
  { name: 'JavaScript', hourlyRate: 23, marketDemand: 5, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'Excel', hourlyRate: 18, marketDemand: 4, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Tutoring', hourlyRate: 20, marketDemand: 5, cognitiveEffort: 3, restNeeded: 1 },
  {
    name: 'English Translation',
    hourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 0.5,
  },
  { name: 'Graphic Design', hourlyRate: 22, marketDemand: 3, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'Data Entry', hourlyRate: 12, marketDemand: 4, cognitiveEffort: 1, restNeeded: 0.5 },
  { name: 'Social Media', hourlyRate: 16, marketDemand: 4, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Web Writing', hourlyRate: 18, marketDemand: 3, cognitiveEffort: 3, restNeeded: 1 },
  // Additional common skills
  { name: 'Guitar', hourlyRate: 20, marketDemand: 3, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Piano', hourlyRate: 22, marketDemand: 3, cognitiveEffort: 3, restNeeded: 1 },
  { name: 'Music', hourlyRate: 18, marketDemand: 3, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Photography', hourlyRate: 20, marketDemand: 3, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Video Editing', hourlyRate: 22, marketDemand: 4, cognitiveEffort: 3, restNeeded: 2 },
  { name: 'Babysitting', hourlyRate: 12, marketDemand: 5, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Cleaning', hourlyRate: 14, marketDemand: 4, cognitiveEffort: 1, restNeeded: 1 },
  { name: 'Driving', hourlyRate: 15, marketDemand: 4, cognitiveEffort: 2, restNeeded: 1 },
];

/**
 * Find a matching template for a skill name (case-insensitive)
 * Returns the template if found, undefined otherwise
 */
function findSkillTemplate(skillName: string): Partial<CreateSkillInput> | undefined {
  const lowerName = skillName.toLowerCase().trim();
  return SKILL_TEMPLATES.find(
    (t) => t.name?.toLowerCase() === lowerName || lowerName.includes(t.name?.toLowerCase() || '')
  );
}

// Default minimum hourly rate fallback
const DEFAULT_HOURLY_RATE = 15;

// Skill Arbitrage Algorithm (for display purposes, score is calculated server-side)
function calculateArbitrageScore(skill: Skill): number {
  const weights = {
    rate: 0.3,
    demand: 0.25,
    effort: 0.25,
    rest: 0.2,
  };

  const hourlyRate =
    skill.hourlyRate && skill.hourlyRate > 0 ? skill.hourlyRate : DEFAULT_HOURLY_RATE;
  const marketDemand = skill.marketDemand && skill.marketDemand > 0 ? skill.marketDemand : 3;
  const cognitiveEffort =
    skill.cognitiveEffort && skill.cognitiveEffort > 0 ? skill.cognitiveEffort : 3;
  const restNeeded = skill.restNeeded !== undefined && skill.restNeeded >= 0 ? skill.restNeeded : 1;

  const normalizedRate = Math.min(hourlyRate / 30, 1);
  const normalizedDemand = marketDemand / 5;
  const normalizedEffort = 1 - cognitiveEffort / 5;
  const normalizedRest = 1 - restNeeded / 4;

  return (
    (weights.rate * normalizedRate +
      weights.demand * normalizedDemand +
      weights.effort * normalizedEffort +
      weights.rest * normalizedRest) *
    10
  );
}

// Rest needed steps configuration
const REST_STEPS = [
  { hours: 0, label: '0h' },
  { hours: 4, label: '4h' },
  { hours: 8, label: '8h' },
  { hours: 12, label: '12h' },
  { hours: 24, label: '24h (1 day)' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
  { hours: 96, label: '4 days' },
  { hours: 120, label: '5 days' },
  { hours: 144, label: '6 days' },
  { hours: 168, label: '7 days' },
];

function getClosestRestStepIndex(hours: number): number {
  let closestIndex = 0;
  let minDiff = Math.abs(hours - REST_STEPS[0].hours);

  for (let i = 1; i < REST_STEPS.length; i++) {
    const diff = Math.abs(hours - REST_STEPS[i].hours);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }
  return closestIndex;
}

interface IconRatingProps {
  value: number;
  max: number;
  icon: typeof Briefcase;
  onChange: (value: number) => void;
  labels?: string[];
  activeColor?: string;
  emptyLabel?: string;
  /** Show a "none" button at the start to allow clearing to 0 */
  showNoneOption?: boolean;
}

function IconRating(props: IconRatingProps) {
  const [hoverValue, setHoverValue] = createSignal<number | null>(null);

  const handleRatingClick = (rating: number) => {
    if (props.value === rating) {
      props.onChange(0); // Toggle off
    } else {
      props.onChange(rating);
    }
  };

  const currentLabel = () => {
    const v = hoverValue() ?? props.value;
    if (v === 0) return props.emptyLabel || '';
    return props.labels ? props.labels[v - 1] : '';
  };

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-1 flex-wrap">
        {/* "None" option - crossed out icon to clear selection */}
        <Show when={props.showNoneOption}>
          <button
            type="button"
            class={`focus:outline-none transition-transform hover:scale-110 active:scale-95 p-0.5 relative ${
              props.value === 0 ? 'ring-2 ring-primary ring-offset-1 rounded' : ''
            }`}
            onMouseEnter={() => setHoverValue(0)}
            onMouseLeave={() => setHoverValue(null)}
            onClick={() => props.onChange(0)}
            title="No rest needed"
          >
            <props.icon
              class={`h-6 w-6 transition-colors ${
                hoverValue() === 0 || props.value === 0
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/20'
              }`}
              fill="none"
            />
            {/* Strikethrough line */}
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div class="w-7 h-0.5 bg-red-500 rotate-45 rounded-full" />
            </div>
          </button>
          <div class="w-px h-6 bg-border mx-1" /> {/* Separator */}
        </Show>

        <For each={Array.from({ length: props.max }, (_, i) => i + 1)}>
          {(rating) => (
            <button
              type="button"
              class="focus:outline-none transition-transform hover:scale-110 active:scale-95 p-0.5"
              onMouseEnter={() => setHoverValue(rating)}
              onMouseLeave={() => setHoverValue(null)}
              onClick={() => handleRatingClick(rating)}
            >
              <props.icon
                class={`h-6 w-6 transition-colors ${
                  rating <= (hoverValue() ?? props.value)
                    ? props.activeColor || 'text-primary'
                    : 'text-muted-foreground/20'
                }`}
                fill={rating <= (hoverValue() ?? props.value) ? 'currentColor' : 'none'}
              />
            </button>
          )}
        </For>
      </div>
      <div class="text-sm font-medium text-muted-foreground min-h-[1.25rem]">{currentLabel()}</div>
    </div>
  );
}

export function SkillsTab(props: SkillsTabProps) {
  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  const { profile, skills: contextSkills, refreshSkills, loading: profileLoading } = useProfile();

  // Use createCrudTab hook for common CRUD state management
  const crud = createCrudTab<Skill>({
    getItemId: (skill) => skill.id,
    getItemName: (skill) => skill.name,
    onItemsChange: (skills) => props.onSkillsChange?.(skills.map(skillToLegacy)),
  });

  // Destructure for convenience (aliased to match original names for minimal changes)
  const {
    items: localSkills,
    setItems: setLocalSkills,
    showAddForm,
    setShowAddForm,
    isLoading,
    setIsLoading,
    editingId: editingSkillId,
    deleteConfirm,
    resetForm: resetFormState,
  } = crud;

  const [newSkill, setNewSkill] = createSignal<Partial<CreateSkillInput>>({
    name: '',
    level: 'intermediate',
    hourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
  });

  // Dirty state tracking for unsaved changes dialog
  const {
    isDirty,
    setOriginal: setDirtyOriginal,
    clear: clearDirty,
  } = createDirtyState({
    getCurrentValues: () => newSkill(),
  });

  // Unsaved changes confirmation dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);

  // Notify parent when dirty state changes
  createEffect(() => {
    props.onDirtyChange?.(isDirty());
  });

  // BUG Q FIX: Track skills loading state to distinguish "loading" from "no skills"
  // 'initial' = first load, 'loaded' = skills fetched successfully, 'error' = fetch failed
  const [skillsLoadState, setSkillsLoadState] = createSignal<'initial' | 'loaded' | 'error'>(
    'initial'
  );

  // Bug B Fix: Track when initial load is complete to prevent showing templates prematurely
  const [initialLoadComplete, setInitialLoadComplete] = createSignal(false);

  // Use context skills (from DB) as source of truth when profile exists
  // Only fall back to initialSkills when no profile (backward compat)
  // BUG Q FIX: Track skills load state to distinguish "loading" from "no skills"
  createEffect(() => {
    const ctxSkills = contextSkills();
    const currentProfile = profile();
    const isProfileLoading = profileLoading();

    // If profile is still loading, keep skills in initial/loading state
    if (isProfileLoading) {
      setSkillsLoadState('initial');
      return;
    }

    // If we have a profile ID, always trust the DB (context skills)
    // This prevents temp IDs from initialSkills causing 404 on delete
    if (currentProfile?.id) {
      setLocalSkills(ctxSkills);
      // Mark as loaded once we have context skills (even if empty array)
      setSkillsLoadState('loaded');
      return;
    }

    // No profile - fall back to initialSkills for backward compatibility
    if (props.initialSkills && props.initialSkills.length > 0) {
      // Process initialSkills to ensure proper values
      const processed = props.initialSkills.map((skill) => {
        const template = findSkillTemplate(skill.name);
        const processedSkill: Skill = {
          id: skill.id,
          profileId: '',
          name: skill.name,
          level: skill.level,
          hourlyRate:
            skill.hourlyRate > 0 ? skill.hourlyRate : template?.hourlyRate || DEFAULT_HOURLY_RATE,
          marketDemand: skill.marketDemand > 0 ? skill.marketDemand : template?.marketDemand || 3,
          cognitiveEffort:
            skill.cognitiveEffort > 0 ? skill.cognitiveEffort : template?.cognitiveEffort || 3,
          restNeeded: skill.restNeeded >= 0 ? skill.restNeeded : template?.restNeeded || 1,
        };
        processedSkill.score = skill.score || calculateArbitrageScore(processedSkill);
        return processedSkill;
      });
      setLocalSkills(processed.sort((a, b) => (b.score || 0) - (a.score || 0)));
      setSkillsLoadState('loaded');
    } else {
      // No profile and no initialSkills - mark as loaded (empty state)
      setSkillsLoadState('loaded');
    }
  });

  // Load skills on mount if profile exists
  onMount(async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      await refreshSkills();
    }
    // Bug B Fix: Mark initial load as complete after refreshSkills
    setInitialLoadComplete(true);
  });

  const skills = () => localSkills();

  const addSkill = async (template?: Partial<CreateSkillInput>) => {
    const base = template || newSkill();
    if (!base.name) return;

    const currentProfile = profile();
    if (!currentProfile?.id) {
      // No profile - fall back to local-only mode (for backward compat)
      const skill: Skill = {
        id: `skill_${Date.now()}`,
        profileId: '',
        name: base.name || '',
        level: (base.level as Skill['level']) || 'intermediate',
        hourlyRate: base.hourlyRate || 15,
        marketDemand: base.marketDemand || 3,
        cognitiveEffort: base.cognitiveEffort || 3,
        restNeeded: base.restNeeded || 1,
      };
      skill.score = calculateArbitrageScore(skill);

      const updated = [...skills(), skill].sort((a, b) => (b.score || 0) - (a.score || 0));
      setLocalSkills(updated);
      props.onSkillsChange?.(updated.map(skillToLegacy));
      setShowAddForm(false);
      resetNewSkill();
      return;
    }

    // Use service to create skill in DB
    setIsLoading(true);
    try {
      const created = await skillService.createSkill({
        profileId: currentProfile.id,
        name: base.name,
        level: base.level,
        hourlyRate: base.hourlyRate,
        marketDemand: base.marketDemand,
        cognitiveEffort: base.cognitiveEffort,
        restNeeded: base.restNeeded,
      });

      if (created) {
        await refreshSkills();
        props.onSkillsChange?.(contextSkills().map(skillToLegacy));
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewSkill();
    }
  };

  const removeSkill = async (id: string) => {
    const currentProfile = profile();
    if (!currentProfile?.id) {
      // Local-only mode
      const updated = skills().filter((s) => s.id !== id);
      setLocalSkills(updated);
      props.onSkillsChange?.(updated.map(skillToLegacy));
      return;
    }

    // Use service to delete skill from DB
    setIsLoading(true);
    try {
      const success = await skillService.deleteSkill(id);
      if (success) {
        await refreshSkills();
        props.onSkillsChange?.(contextSkills().map(skillToLegacy));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetNewSkill = () => {
    setNewSkill({
      name: '',
      level: 'intermediate',
      hourlyRate: 15,
      marketDemand: 3,
      cognitiveEffort: 3,
      restNeeded: 1,
    });
    resetFormState();
    clearDirty(); // Clear dirty state when form closes
  };

  // Handle cancel - shows confirmation dialog if there are unsaved changes
  const handleCancel = () => {
    if (isDirty()) {
      setShowUnsavedDialog(true);
    } else {
      resetNewSkill();
      crud.closeAddForm();
    }
  };

  // Discard changes and close form (called from unsaved changes dialog)
  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    resetNewSkill();
    crud.closeAddForm();
  };

  // Open add form with dirty state tracking
  const openAddForm = () => {
    crud.openAddForm();
    setDirtyOriginal(); // Capture initial state
  };

  const handleEdit = (skill: Skill) => {
    setNewSkill({
      name: skill.name,
      level: skill.level,
      hourlyRate: skill.hourlyRate,
      marketDemand: skill.marketDemand,
      cognitiveEffort: skill.cognitiveEffort,
      restNeeded: skill.restNeeded,
    });
    crud.startEdit(skill.id);
    setDirtyOriginal(); // Capture loaded values as original
  };

  const updateSkill = async () => {
    const skillId = editingSkillId();
    if (!skillId) return;

    const currentProfile = profile();
    const data = newSkill();

    if (!currentProfile?.id) {
      // Local-only mode - update in local array
      const updated = skills().map((s) =>
        s.id === skillId
          ? {
              ...s,
              name: data.name || s.name,
              level: (data.level as Skill['level']) || s.level,
              hourlyRate: data.hourlyRate ?? s.hourlyRate,
              marketDemand: data.marketDemand ?? s.marketDemand,
              cognitiveEffort: data.cognitiveEffort ?? s.cognitiveEffort,
              restNeeded: data.restNeeded ?? s.restNeeded,
              score: calculateArbitrageScore({
                ...s,
                hourlyRate: data.hourlyRate ?? s.hourlyRate,
                marketDemand: data.marketDemand ?? s.marketDemand,
                cognitiveEffort: data.cognitiveEffort ?? s.cognitiveEffort,
                restNeeded: data.restNeeded ?? s.restNeeded,
              }),
            }
          : s
      );
      setLocalSkills(updated.sort((a, b) => (b.score || 0) - (a.score || 0)));
      props.onSkillsChange?.(updated.map(skillToLegacy));
      setShowAddForm(false);
      resetNewSkill();
      return;
    }

    // Use service to update skill in DB
    setIsLoading(true);
    try {
      const updated = await skillService.updateSkill({
        id: skillId,
        name: data.name,
        level: data.level,
        hourlyRate: data.hourlyRate,
        marketDemand: data.marketDemand,
        cognitiveEffort: data.cognitiveEffort,
        restNeeded: data.restNeeded,
      });

      if (updated) {
        await refreshSkills();
        props.onSkillsChange?.(contextSkills().map(skillToLegacy));

        // Check for skill_arbitrage_pro achievement
        const { newlyUnlocked } = updateAchievements({ skillArbitrageUsed: true });
        for (const achievement of newlyUnlocked) {
          onAchievementUnlock(achievement, {
            showToast: (type, title, message) => {
              if (type === 'success') {
                toastPopup.success(title, message);
              } else {
                toastPopup.info(title, message);
              }
            },
          });
        }
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewSkill();
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40';
    if (score >= 5)
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40';
    return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40';
  };

  const getEffortLabel = (effort: number) => {
    const labels = ['', 'Very low', 'Low', 'Moderate', 'High', 'Very high'];
    return labels[effort] || 'Moderate';
  };

  return (
    <div class="p-6 space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
            <Briefcase class="h-6 w-6 text-primary" /> Skill Arbitrage
          </h2>
          <p class="text-sm text-muted-foreground mt-1">
            The highest paying job isn't necessarily the best
          </p>
        </div>
        <Button onClick={openAddForm} disabled={isLoading()}>
          <Plus class="h-4 w-4 mr-2" /> Add
        </Button>
      </div>

      {/* Scoring Explanation */}
      <Card class="bg-muted/30 border-primary/20">
        <CardContent class="p-4">
          <h4 class="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <Lightbulb class="h-4 w-4 text-amber-500" /> How does it work?
          </h4>
          <p class="text-sm text-muted-foreground">
            The score balances 4 criteria: hourly rate (30%), market demand (25%), cognitive effort
            (25%), and rest time (20%). A well-paid but exhausting job may score lower than a
            lower-paid but easier job.
          </p>
        </CardContent>
      </Card>

      {/* BUG Q FIX: Show loading state while skills are being fetched */}
      <Show when={skillsLoadState() === 'initial'}>
        <Card>
          <CardContent class="p-4">
            <div class="flex items-center gap-2 text-muted-foreground">
              <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              <span>Loading your skills...</span>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Quick Add Templates - Sprint 2 Bug #5 fix: Hide when no templates available */}
      {/* BUG Q FIX: Only show templates after skills have loaded (not during initial load) */}
      {/* Bug B Fix: Also require initialLoadComplete to prevent race condition */}
      <Show
        when={
          initialLoadComplete() &&
          skillsLoadState() === 'loaded' &&
          SKILL_TEMPLATES.filter(
            (t) => !skills().some((s) => s.name.toLowerCase() === t.name?.toLowerCase())
          ).length > 0
        }
      >
        <Card>
          <CardContent class="p-4">
            <h3 class="text-sm font-medium text-foreground mb-3">Quick add</h3>
            <div class="flex flex-wrap gap-2">
              <For
                each={SKILL_TEMPLATES.filter(
                  (t) => !skills().some((s) => s.name.toLowerCase() === t.name?.toLowerCase())
                )}
              >
                {(template) => (
                  <Button
                    variant="outline"
                    size="sm"
                    class="rounded-full h-8"
                    onClick={() => addSkill(template)}
                    disabled={isLoading()}
                  >
                    <Plus class="h-3 w-3 mr-1" />
                    {template.name}
                  </Button>
                )}
              </For>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Skills List with Scores */}
      <Show when={skills().length > 0}>
        <div class="space-y-3">
          <For each={skills()}>
            {(skill, index) => (
              <Card>
                <CardContent class="p-4 flex items-center gap-4">
                  {/* Rank */}
                  <div class="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground">
                    {index() + 1}
                  </div>

                  {/* Skill Info */}
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h4 class="font-semibold text-foreground">{skill.name}</h4>
                      <Show when={index() === 0}>
                        <span class="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full flex items-center gap-1">
                          <Check class="h-3 w-3" /> Recommended
                        </span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span class="flex items-center gap-1" title="Hourly Rate">
                        {formatCurrencyWithSuffix(skill.hourlyRate, currency(), '/h')}
                      </span>
                      <span class="flex items-center gap-1" title="Market Demand">
                        <Users class="h-3 w-3 text-yellow-500" /> {skill.marketDemand}/5
                      </span>
                      <span class="flex items-center gap-1" title="Cognitive Effort">
                        <BrainCircuit class="h-3 w-3 text-pink-500" />{' '}
                        {getEffortLabel(skill.cognitiveEffort)}
                      </span>
                      <span class="flex items-center gap-1" title="Rest Needed">
                        <Bed class="h-3 w-3 text-indigo-500" />{' '}
                        {REST_STEPS.find((s) => s.hours === (skill.restNeeded || 0))?.label ||
                          (skill.restNeeded || 0) + 'h'}
                      </span>
                    </div>
                  </div>

                  {/* Score */}
                  <div
                    class={`flex-shrink-0 px-3 py-1.5 rounded-lg font-bold ${getScoreColor(
                      skill.score || 0
                    )}`}
                  >
                    {(skill.score || calculateArbitrageScore(skill)).toFixed(1)}/10
                  </div>

                  {/* Edit & Remove */}
                  <div class="flex-shrink-0 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleEdit(skill)}
                      disabled={isLoading()}
                      title="Edit skill"
                    >
                      <Pencil class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => crud.confirmDelete(skill)}
                      disabled={isLoading()}
                      title="Delete skill"
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>
        </div>
      </Show>

      {/* Empty State */}
      <Show when={skills().length === 0 && !showAddForm()}>
        <Card class="text-center py-12">
          <CardContent>
            <div class="flex justify-center mb-4">
              <Briefcase class="h-12 w-12 text-muted-foreground/50" />
            </div>
            <h3 class="text-lg font-medium text-foreground mb-2">No skills added</h3>
            <p class="text-muted-foreground mb-4">Add your skills to discover the best jobs</p>
            <Button onClick={openAddForm}>Add a skill</Button>
          </CardContent>
        </Card>
      </Show>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card class="max-w-md w-full">
            <CardContent class="p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Briefcase class="h-5 w-5 text-primary" />
                  {editingSkillId() ? 'Edit skill' : 'New skill'}
                </h3>
                <Button variant="ghost" size="icon" onClick={handleCancel}>
                  <X class="h-4 w-4" />
                </Button>
              </div>

              <div class="space-y-6">
                {/* Name */}
                <div>
                  <label class="block text-sm font-medium text-foreground mb-1">Name</label>
                  <Input
                    type="text"
                    placeholder="Ex: Python, Excel, Coaching..."
                    value={newSkill().name}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewSkill({ ...newSkill(), name: e.currentTarget.value })
                    }
                  />
                </div>

                {/* Hourly Rate */}
                <div>
                  <label class="block text-sm font-medium text-foreground mb-1">
                    Hourly rate ({currencySymbol()})
                  </label>
                  <Input
                    type="number"
                    min="5"
                    max="100"
                    value={newSkill().hourlyRate}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewSkill({
                        ...newSkill(),
                        hourlyRate: parseInt(e.currentTarget.value) || 15,
                      })
                    }
                  />
                </div>

                {/* Market Demand */}
                <div>
                  <label class="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    Market demand
                    <div class="group relative">
                      <HelpCircle class="h-4 w-4 text-muted-foreground cursor-help" />
                      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border opacity-0 group-hover:opacity-100 transition-opacity w-48 text-center pointer-events-none">
                        How easy is it to find clients?
                      </div>
                    </div>
                  </label>
                  <IconRating
                    value={newSkill().marketDemand || 3}
                    max={5}
                    icon={Users}
                    activeColor="text-yellow-500"
                    onChange={(val) => setNewSkill({ ...newSkill(), marketDemand: val })}
                    labels={['Very low', 'Low', 'Moderate', 'High', 'Very high']}
                  />
                </div>

                {/* Cognitive Effort */}
                <div>
                  <label class="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    Cognitive Effort
                    <div class="group relative">
                      <HelpCircle class="h-4 w-4 text-muted-foreground cursor-help" />
                      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border opacity-0 group-hover:opacity-100 transition-opacity w-48 text-center pointer-events-none">
                        How mentally draining is this task?
                      </div>
                    </div>
                  </label>
                  <IconRating
                    value={newSkill().cognitiveEffort || 3}
                    max={5}
                    icon={BrainCircuit}
                    activeColor="text-pink-500"
                    onChange={(val) => setNewSkill({ ...newSkill(), cognitiveEffort: val })}
                    labels={['Very low', 'Low', 'Moderate', 'High', 'Very high']}
                  />
                </div>

                {/* Rest Needed */}
                <div>
                  <label class="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    Rest needed
                    <div class="group relative">
                      <HelpCircle class="h-4 w-4 text-muted-foreground cursor-help" />
                      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border opacity-0 group-hover:opacity-100 transition-opacity w-48 text-center pointer-events-none">
                        Recovery time needed after 1h of work
                      </div>
                    </div>
                  </label>
                  <IconRating
                    value={getClosestRestStepIndex(newSkill().restNeeded ?? 0)}
                    max={10}
                    icon={Bed}
                    activeColor="text-indigo-500"
                    emptyLabel="0h (No rest needed)"
                    showNoneOption={true}
                    onChange={(index) => {
                      setNewSkill({
                        ...newSkill(),
                        restNeeded: REST_STEPS[index].hours,
                      });
                    }}
                    labels={REST_STEPS.slice(1).map((s) => s.label)}
                  />
                </div>
              </div>

              <div class="flex gap-3 mt-6">
                <Button variant="outline" class="flex-1" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  class="flex-1"
                  onClick={() => (editingSkillId() ? updateSkill() : addSkill())}
                  disabled={!newSkill().name || isLoading()}
                >
                  {isLoading()
                    ? editingSkillId()
                      ? 'Updating...'
                      : 'Adding...'
                    : editingSkillId()
                      ? 'Update'
                      : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Show>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm()}
        title="Delete skill?"
        message={`Are you sure you want to delete "${deleteConfirm()?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          const confirm = deleteConfirm();
          if (confirm) {
            removeSkill(confirm.id);
            crud.cancelDelete();
          }
        }}
        onCancel={crud.cancelDelete}
      />

      {/* Unsaved changes confirmation */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog()}
        onDiscard={handleDiscardChanges}
        onKeepEditing={() => setShowUnsavedDialog(false)}
      />
    </div>
  );
}
