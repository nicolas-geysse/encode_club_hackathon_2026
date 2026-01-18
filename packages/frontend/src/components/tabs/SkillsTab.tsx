/**
 * Skills Tab Component
 *
 * Skill Arbitrage: multi-criteria job matching and scoring.
 * Now uses skillService for DuckDB persistence.
 */

import { createSignal, For, Show, createEffect, onMount } from 'solid-js';
import { useProfile } from '~/lib/profileContext';
import { skillService, type Skill, type CreateSkillInput } from '~/lib/skillService';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { formatCurrencyWithSuffix, getCurrencySymbol, type Currency } from '~/lib/dateUtils';

// Legacy skill interface for backward compatibility with plan.tsx
interface LegacySkill {
  id: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  hourlyRate: number;
  marketDemand: number;
  cognitiveEffort: number;
  restNeeded: number;
  score?: number;
}

interface SkillsTabProps {
  initialSkills?: LegacySkill[];
  onSkillsChange?: (skills: LegacySkill[]) => void;
  currency?: Currency;
}

// Convert new skill to legacy format for backward compat with plan.tsx
function skillToLegacy(skill: Skill): LegacySkill {
  return {
    id: skill.id,
    name: skill.name,
    level: skill.level,
    hourlyRate: skill.hourlyRate,
    marketDemand: skill.marketDemand,
    cognitiveEffort: skill.cognitiveEffort,
    restNeeded: skill.restNeeded,
    score: skill.score,
  };
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

export function SkillsTab(props: SkillsTabProps) {
  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  const { profile, skills: contextSkills, refreshSkills } = useProfile();
  const [localSkills, setLocalSkills] = createSignal<Skill[]>([]);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [editingSkillId, setEditingSkillId] = createSignal<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = createSignal<{ id: string; name: string } | null>(null);
  const [newSkill, setNewSkill] = createSignal<Partial<CreateSkillInput>>({
    name: '',
    level: 'intermediate',
    hourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
  });

  // Use context skills (from DB) as source of truth when profile exists
  // Only fall back to initialSkills when no profile (backward compat)
  createEffect(() => {
    const ctxSkills = contextSkills();
    const currentProfile = profile();

    // If we have a profile ID, always trust the DB (context skills)
    // This prevents temp IDs from initialSkills causing 404 on delete
    if (currentProfile?.id) {
      setLocalSkills(ctxSkills);
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
    }
  });

  // Load skills on mount if profile exists
  onMount(async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      await refreshSkills();
    }
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
    setEditingSkillId(null);
  };

  const handleEdit = (skill: Skill) => {
    setEditingSkillId(skill.id);
    setNewSkill({
      name: skill.name,
      level: skill.level,
      hourlyRate: skill.hourlyRate,
      marketDemand: skill.marketDemand,
      cognitiveEffort: skill.cognitiveEffort,
      restNeeded: skill.restNeeded,
    });
    setShowAddForm(true);
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
    <div class="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>💼</span> Skill Arbitrage
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            The highest paying job isn't necessarily the best
          </p>
        </div>
        <button
          type="button"
          class="btn-primary"
          onClick={() => setShowAddForm(true)}
          disabled={isLoading()}
        >
          + Add
        </button>
      </div>

      {/* Quick Add Templates */}
      <div class="card">
        <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Quick add</h3>
        <div class="flex flex-wrap gap-2">
          <For each={SKILL_TEMPLATES.filter((t) => !skills().some((s) => s.name === t.name))}>
            {(template) => (
              <button
                type="button"
                class="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors disabled:opacity-50"
                onClick={() => addSkill(template)}
                disabled={isLoading()}
              >
                {template.name}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Skills List with Scores */}
      <Show when={skills().length > 0}>
        <div class="space-y-3">
          <For each={skills()}>
            {(skill, index) => (
              <div class="card flex items-center gap-4">
                {/* Rank */}
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                  {index() + 1}
                </div>

                {/* Skill Info */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="font-semibold text-slate-900 dark:text-slate-100">{skill.name}</h4>
                    <Show when={index() === 0}>
                      <span class="px-2 py-0.5 text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full">
                        Recommended
                      </span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
                    <span>{formatCurrencyWithSuffix(skill.hourlyRate, currency(), '/h')}</span>
                    <span>{'⭐'.repeat(skill.marketDemand)}</span>
                    <span>Effort: {getEffortLabel(skill.cognitiveEffort)}</span>
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
                  <button
                    type="button"
                    class="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-50"
                    onClick={() => handleEdit(skill)}
                    disabled={isLoading()}
                    title="Edit skill"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    onClick={() => setDeleteConfirm({ id: skill.id, name: skill.name })}
                    disabled={isLoading()}
                    title="Delete skill"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Empty State */}
      <Show when={skills().length === 0 && !showAddForm()}>
        <div class="card text-center py-12">
          <div class="text-4xl mb-4">💼</div>
          <h3 class="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
            No skills added
          </h3>
          <p class="text-slate-500 dark:text-slate-400 mb-4">
            Add your skills to discover the best jobs
          </p>
          <button type="button" class="btn-primary" onClick={() => setShowAddForm(true)}>
            Add a skill
          </button>
        </div>
      </Show>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {editingSkillId() ? 'Edit skill' : 'New skill'}
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: Python, Excel, Coaching..."
                  value={newSkill().name}
                  onInput={(e) => setNewSkill({ ...newSkill(), name: e.currentTarget.value })}
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hourly rate ({currencySymbol()})
                  </label>
                  <input
                    type="number"
                    class="input-field"
                    min="5"
                    max="100"
                    value={newSkill().hourlyRate}
                    onInput={(e) =>
                      setNewSkill({
                        ...newSkill(),
                        hourlyRate: parseInt(e.currentTarget.value) || 15,
                      })
                    }
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Market demand (1-5)
                  </label>
                  <input
                    type="range"
                    class="w-full"
                    min="1"
                    max="5"
                    value={newSkill().marketDemand}
                    onInput={(e) =>
                      setNewSkill({ ...newSkill(), marketDemand: parseInt(e.currentTarget.value) })
                    }
                  />
                  <div class="text-center text-sm text-slate-500 dark:text-slate-400">
                    {'⭐'.repeat(newSkill().marketDemand || 3)}
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cognitive effort (1-5)
                  </label>
                  <select
                    class="input-field"
                    value={newSkill().cognitiveEffort}
                    onChange={(e) =>
                      setNewSkill({
                        ...newSkill(),
                        cognitiveEffort: parseInt(e.currentTarget.value),
                      })
                    }
                  >
                    <option value="1">1 - Very low</option>
                    <option value="2">2 - Low</option>
                    <option value="3">3 - Moderate</option>
                    <option value="4">4 - High</option>
                    <option value="5">5 - Very high</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Rest needed (h)
                  </label>
                  <input
                    type="number"
                    class="input-field"
                    min="0"
                    max="8"
                    step="0.5"
                    value={newSkill().restNeeded}
                    onInput={(e) =>
                      setNewSkill({
                        ...newSkill(),
                        restNeeded: parseFloat(e.currentTarget.value) || 1,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div class="flex gap-3 mt-6">
              <button
                type="button"
                class="btn-secondary flex-1"
                onClick={() => {
                  setShowAddForm(false);
                  resetNewSkill();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn-primary flex-1"
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
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Scoring Explanation */}
      <div class="card bg-slate-50 dark:bg-slate-700">
        <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          How does it work?
        </h4>
        <p class="text-sm text-slate-600 dark:text-slate-400">
          The score balances 4 criteria: hourly rate (30%), market demand (25%), cognitive effort
          (25%), and rest time (20%). A well-paid but exhausting job may score lower than a
          lower-paid but easier job.
        </p>
      </div>

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
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
