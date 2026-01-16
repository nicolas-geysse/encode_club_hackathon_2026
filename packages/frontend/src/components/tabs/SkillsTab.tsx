/**
 * Skills Tab Component
 *
 * Skill Arbitrage: multi-criteria job matching and scoring.
 */

import { createSignal, For, Show } from 'solid-js';

interface Skill {
  id: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  hourlyRate: number;
  marketDemand: number; // 1-5
  cognitiveEffort: number; // 1-5
  restNeeded: number; // hours
  score?: number;
}

interface SkillsTabProps {
  initialSkills?: Skill[];
  onSkillsChange?: (skills: Skill[]) => void;
}

const SKILL_TEMPLATES: Partial<Skill>[] = [
  { name: 'Python', hourlyRate: 25, marketDemand: 5, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'SQL Coaching', hourlyRate: 22, marketDemand: 4, cognitiveEffort: 3, restNeeded: 1 },
  { name: 'JavaScript', hourlyRate: 23, marketDemand: 5, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'Excel', hourlyRate: 18, marketDemand: 4, cognitiveEffort: 2, restNeeded: 1 },
  {
    name: 'Cours particuliers',
    hourlyRate: 20,
    marketDemand: 5,
    cognitiveEffort: 3,
    restNeeded: 1,
  },
  {
    name: 'Traduction Anglais',
    hourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 0.5,
  },
  { name: 'Design Graphique', hourlyRate: 22, marketDemand: 3, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'Data Entry', hourlyRate: 12, marketDemand: 4, cognitiveEffort: 1, restNeeded: 0.5 },
  { name: 'Social Media', hourlyRate: 16, marketDemand: 4, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Redaction Web', hourlyRate: 18, marketDemand: 3, cognitiveEffort: 3, restNeeded: 1 },
];

// Skill Arbitrage Algorithm
function calculateArbitrageScore(skill: Skill): number {
  const weights = {
    rate: 0.3,
    demand: 0.25,
    effort: 0.25,
    rest: 0.2,
  };

  const normalizedRate = Math.min(skill.hourlyRate / 30, 1);
  const normalizedDemand = skill.marketDemand / 5;
  const normalizedEffort = 1 - skill.cognitiveEffort / 5;
  const normalizedRest = 1 - skill.restNeeded / 4;

  return (
    (weights.rate * normalizedRate +
      weights.demand * normalizedDemand +
      weights.effort * normalizedEffort +
      weights.rest * normalizedRest) *
    10
  );
}

export function SkillsTab(props: SkillsTabProps) {
  const [skills, setSkills] = createSignal<Skill[]>(props.initialSkills || []);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newSkill, setNewSkill] = createSignal<Partial<Skill>>({
    name: '',
    level: 'intermediate',
    hourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
  });

  const addSkill = (template?: Partial<Skill>) => {
    const base = template || newSkill();
    if (!base.name) return;

    const skill: Skill = {
      id: `skill_${Date.now()}`,
      name: base.name || '',
      level: base.level || 'intermediate',
      hourlyRate: base.hourlyRate || 15,
      marketDemand: base.marketDemand || 3,
      cognitiveEffort: base.cognitiveEffort || 3,
      restNeeded: base.restNeeded || 1,
    };
    skill.score = calculateArbitrageScore(skill);

    const updated = [...skills(), skill].sort((a, b) => (b.score || 0) - (a.score || 0));
    setSkills(updated);
    props.onSkillsChange?.(updated);
    setShowAddForm(false);
    setNewSkill({
      name: '',
      level: 'intermediate',
      hourlyRate: 15,
      marketDemand: 3,
      cognitiveEffort: 3,
      restNeeded: 1,
    });
  };

  const removeSkill = (id: string) => {
    const updated = skills().filter((s) => s.id !== id);
    setSkills(updated);
    props.onSkillsChange?.(updated);
  };

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'text-green-600 bg-green-100';
    if (score >= 5) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getEffortLabel = (effort: number) => {
    const labels = ['', 'Tres faible', 'Faible', 'Modere', 'Eleve', 'Tres eleve'];
    return labels[effort] || 'Modere';
  };

  return (
    <div class="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>💼</span> Skill Arbitrage
          </h2>
          <p class="text-sm text-slate-500 mt-1">
            Le job qui paye le plus n'est pas forcement le meilleur
          </p>
        </div>
        <button type="button" class="btn-primary" onClick={() => setShowAddForm(true)}>
          + Ajouter
        </button>
      </div>

      {/* Quick Add Templates */}
      <div class="card">
        <h3 class="text-sm font-medium text-slate-700 mb-3">Ajouter rapidement</h3>
        <div class="flex flex-wrap gap-2">
          <For each={SKILL_TEMPLATES.filter((t) => !skills().some((s) => s.name === t.name))}>
            {(template) => (
              <button
                type="button"
                class="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                onClick={() => addSkill(template)}
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
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                  {index() + 1}
                </div>

                {/* Skill Info */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="font-semibold text-slate-900">{skill.name}</h4>
                    <Show when={index() === 0}>
                      <span class="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                        Recommande
                      </span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-4 mt-1 text-sm text-slate-500">
                    <span>{skill.hourlyRate}€/h</span>
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
                  {(skill.score || 0).toFixed(1)}/10
                </div>

                {/* Remove */}
                <button
                  type="button"
                  class="flex-shrink-0 text-slate-400 hover:text-red-500 transition-colors"
                  onClick={() => removeSkill(skill.id)}
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
            )}
          </For>
        </div>
      </Show>

      {/* Empty State */}
      <Show when={skills().length === 0 && !showAddForm()}>
        <div class="card text-center py-12">
          <div class="text-4xl mb-4">💼</div>
          <h3 class="text-lg font-medium text-slate-900 mb-2">Aucune competence ajoutee</h3>
          <p class="text-slate-500 mb-4">
            Ajoute tes competences pour decouvrir les meilleurs jobs
          </p>
          <button type="button" class="btn-primary" onClick={() => setShowAddForm(true)}>
            Ajouter une competence
          </button>
        </div>
      </Show>

      {/* Add Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Nouvelle competence</h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Nom</label>
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
                  <label class="block text-sm font-medium text-slate-700 mb-1">
                    Taux horaire (€)
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
                  <label class="block text-sm font-medium text-slate-700 mb-1">
                    Demande marche (1-5)
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
                  <div class="text-center text-sm text-slate-500">
                    {'⭐'.repeat(newSkill().marketDemand || 3)}
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">
                    Effort cognitif (1-5)
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
                    <option value="1">1 - Tres faible</option>
                    <option value="2">2 - Faible</option>
                    <option value="3">3 - Modere</option>
                    <option value="4">4 - Eleve</option>
                    <option value="5">5 - Tres eleve</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">
                    Repos necessaire (h)
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
                onClick={() => setShowAddForm(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                class="btn-primary flex-1"
                onClick={() => addSkill()}
                disabled={!newSkill().name}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Scoring Explanation */}
      <div class="card bg-slate-50">
        <h4 class="text-sm font-medium text-slate-700 mb-2">Comment ca marche ?</h4>
        <p class="text-sm text-slate-600">
          Le score equilibre 4 criteres : taux horaire (30%), demande marche (25%), effort cognitif
          (25%), et temps de repos (20%). Un job bien paye mais epuisant peut avoir un score
          inferieur a un job moins paye mais plus facile.
        </p>
      </div>
    </div>
  );
}
