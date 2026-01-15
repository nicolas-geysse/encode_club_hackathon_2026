/**
 * Goal Setup Page
 *
 * Allows users to define a financial goal with amount and deadline.
 * Now includes capacity-aware retroplanning with:
 * - Academic events (exams, vacations)
 * - Recurring commitments (classes, sports, family)
 * - Energy/mood tracking
 */

import { createSignal, onMount, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { VoiceInput } from '~/components/VoiceInput';

interface Profile {
  name: string;
  skills: string[];
  incomes: { source: string; amount: number }[];
  expenses: { category: string; amount: number }[];
}

interface AcademicEvent {
  id?: string;
  type: 'exam_period' | 'class_intensive' | 'vacation' | 'internship' | 'project_deadline';
  name: string;
  startDate: string;
  endDate: string;
}

interface Commitment {
  id?: string;
  type: 'class' | 'sport' | 'club' | 'family' | 'health' | 'other';
  name: string;
  hoursPerWeek: number;
}

export default function GoalSetup() {
  const navigate = useNavigate();

  const [profile, setProfile] = createSignal<Profile | null>(null);
  const [goalName, setGoalName] = createSignal('');
  const [goalAmount, setGoalAmount] = createSignal<number>(500);
  const [goalDeadline, setGoalDeadline] = createSignal('');
  const [minimumBudget, setMinimumBudget] = createSignal<number>(200);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Retroplanning - Academic Events
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [academicEvents, setAcademicEvents] = createSignal<AcademicEvent[]>([]);
  const [newEvent, setNewEvent] = createSignal<AcademicEvent>({
    type: 'exam_period',
    name: '',
    startDate: '',
    endDate: '',
  });

  // Retroplanning - Commitments
  const [commitments, setCommitments] = createSignal<Commitment[]>([]);
  const [newCommitment, setNewCommitment] = createSignal<Commitment>({
    type: 'class',
    name: '',
    hoursPerWeek: 2,
  });

  // Set default deadline to 8 weeks from now
  onMount(() => {
    const stored = sessionStorage.getItem('studentProfile');
    if (stored) {
      setProfile(JSON.parse(stored));
    }

    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 56); // 8 weeks
    setGoalDeadline(defaultDeadline.toISOString().split('T')[0]);
  });

  // Add academic event
  const addAcademicEvent = () => {
    const event = newEvent();
    if (!event.name || !event.startDate || !event.endDate) return;

    setAcademicEvents([...academicEvents(), { ...event, id: `temp_${Date.now()}` }]);
    setNewEvent({ type: 'exam_period', name: '', startDate: '', endDate: '' });
  };

  // Remove academic event
  const removeAcademicEvent = (index: number) => {
    setAcademicEvents(academicEvents().filter((_, i) => i !== index));
  };

  // Add commitment
  const addCommitment = () => {
    const commitment = newCommitment();
    if (!commitment.name || commitment.hoursPerWeek <= 0) return;

    setCommitments([...commitments(), { ...commitment, id: `temp_${Date.now()}` }]);
    setNewCommitment({ type: 'class', name: '', hoursPerWeek: 2 });
  };

  // Remove commitment
  const removeCommitment = (index: number) => {
    setCommitments(commitments().filter((_, i) => i !== index));
  };

  // Handle voice input for goal description
  const handleVoiceInput = (text: string) => {
    // Parse voice input for amount and goal name
    const lowerText = text.toLowerCase();

    // Try to extract amount (e.g., "500 euros", "mille euros", "1000€")
    const amountMatch = lowerText.match(/(\d+)\s*(euros?|€)?/);
    if (amountMatch) {
      setGoalAmount(parseInt(amountMatch[1]));
    } else if (lowerText.includes('mille')) {
      setGoalAmount(1000);
    } else if (lowerText.includes('cinq cents') || lowerText.includes('500')) {
      setGoalAmount(500);
    }

    // Extract goal name
    if (lowerText.includes('vacances')) {
      setGoalName('Vacances');
    } else if (lowerText.includes('permis')) {
      setGoalName('Permis de conduire');
    } else if (lowerText.includes('ordinateur') || lowerText.includes('pc') || lowerText.includes('mac')) {
      setGoalName('Nouvel ordinateur');
    } else if (lowerText.includes('telephone') || lowerText.includes('iphone')) {
      setGoalName('Nouveau telephone');
    } else if (lowerText.includes('voyage')) {
      setGoalName('Voyage');
    } else if (lowerText.includes('urgence') || lowerText.includes('epargne')) {
      setGoalName('Fonds d\'urgence');
    } else if (!goalName()) {
      // Use the full text as goal name if we couldn't parse it
      setGoalName(text);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);

    if (!goalName()) {
      setError('Donne un nom a ton objectif');
      return;
    }

    if (goalAmount() <= 0) {
      setError('Le montant doit etre positif');
      return;
    }

    setLoading(true);

    try {
      // First, save academic events and commitments to retroplan API
      if (academicEvents().length > 0 || commitments().length > 0) {
        // Save academic events
        for (const event of academicEvents()) {
          await fetch('/api/retroplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_academic_event',
              ...event,
            }),
          });
        }

        // Save commitments
        for (const commitment of commitments()) {
          await fetch('/api/retroplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_commitment',
              ...commitment,
            }),
          });
        }
      }

      // Create goal
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          goalName: goalName(),
          goalAmount: goalAmount(),
          goalDeadline: goalDeadline(),
          minimumBudget: minimumBudget(),
          profile: profile(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Erreur lors de la creation');
      }

      const goal = await response.json();

      // Generate retroplan if we have academic events or commitments
      if (academicEvents().length > 0 || commitments().length > 0) {
        const retroplanResponse = await fetch('/api/retroplan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate_retroplan',
            goalId: goal.id,
            goalAmount: goalAmount(),
            deadline: goalDeadline(),
          }),
        });

        if (retroplanResponse.ok) {
          const { retroplan } = await retroplanResponse.json();
          goal.retroplan = retroplan;
        }
      }

      // Store goal ID for plan page
      sessionStorage.setItem('currentGoalId', goal.id);
      sessionStorage.setItem('currentGoal', JSON.stringify(goal));

      // Navigate to plan page (or calendar if retroplan exists)
      if (goal.retroplan) {
        navigate('/goal-mode/calendar');
      } else {
        navigate('/goal-mode/plan');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  // Quick presets
  const presets = [
    { name: 'Vacances', amount: 500, icon: '🏖️' },
    { name: 'Permis', amount: 1500, icon: '🚗' },
    { name: 'Ordinateur', amount: 800, icon: '💻' },
    { name: 'Fonds urgence', amount: 1000, icon: '🛡️' },
  ];

  return (
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold text-slate-900 mb-2">Definis ton objectif</h2>
        <p class="text-slate-600">
          Transforme ton reve en plan d'action concret avec des etapes motivantes
        </p>
      </div>

      {/* Voice input suggestion */}
      <div class="card mb-6 bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
        <div class="flex items-center gap-4">
          <VoiceInput onTranscript={handleVoiceInput} />
          <div>
            <p class="font-medium text-slate-800">Dis ton objectif a haute voix !</p>
            <p class="text-sm text-slate-600">
              Exemple: "Je veux 500 euros pour mes vacances"
            </p>
          </div>
        </div>
      </div>

      {/* Quick presets */}
      <div class="mb-6">
        <p class="text-sm font-medium text-slate-700 mb-3">Ou choisis un objectif populaire:</p>
        <div class="flex gap-3 flex-wrap">
          {presets.map((preset) => (
            <button
              type="button"
              class={`
                px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2
                ${
                  goalName() === preset.name
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }
              `}
              onClick={() => {
                setGoalName(preset.name);
                setGoalAmount(preset.amount);
              }}
            >
              <span>{preset.icon}</span>
              <span>{preset.name}</span>
              <span class="text-sm text-slate-500">({preset.amount}€)</span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} class="space-y-6">
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">🎯</span> Details de l'objectif
          </h3>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Nom de l'objectif
              </label>
              <input
                type="text"
                class="input-field"
                placeholder="Ex: Vacances d'ete"
                value={goalName()}
                onInput={(e) => setGoalName(e.currentTarget.value)}
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">
                  Montant a atteindre
                </label>
                <div class="relative">
                  <input
                    type="number"
                    class="input-field pr-8"
                    min="50"
                    max="10000"
                    value={goalAmount()}
                    onInput={(e) => setGoalAmount(parseInt(e.currentTarget.value) || 0)}
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">€</span>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Date limite</label>
                <input
                  type="date"
                  class="input-field"
                  value={goalDeadline()}
                  onInput={(e) => setGoalDeadline(e.currentTarget.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Budget minimum mensuel (depenses essentielles)
              </label>
              <div class="relative">
                <input
                  type="number"
                  class="input-field pr-12"
                  min="0"
                  value={minimumBudget()}
                  onInput={(e) => setMinimumBudget(parseInt(e.currentTarget.value) || 0)}
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">€/mois</span>
              </div>
              <p class="text-xs text-slate-500 mt-1">
                Ce que tu dois absolument payer (loyer, bouffe, etc.)
              </p>
            </div>
          </div>
        </div>

        {/* Advanced Settings - Retroplanning */}
        <div class="card">
          <button
            type="button"
            class="w-full flex items-center justify-between text-left"
            onClick={() => setShowAdvanced(!showAdvanced())}
          >
            <div class="flex items-center gap-2">
              <span class="text-xl">📅</span>
              <div>
                <h3 class="font-semibold text-slate-900">Planification intelligente</h3>
                <p class="text-sm text-slate-500">
                  Adapte tes objectifs selon tes examens et activites
                </p>
              </div>
            </div>
            <span class="text-2xl text-slate-400">{showAdvanced() ? '−' : '+'}</span>
          </button>

          <Show when={showAdvanced()}>
            <div class="mt-6 space-y-6 border-t border-slate-200 pt-6">
              {/* Academic Events Section */}
              <div>
                <h4 class="font-medium text-slate-800 mb-3 flex items-center gap-2">
                  <span>📝</span> Evenements academiques
                </h4>
                <p class="text-sm text-slate-500 mb-4">
                  Ajoute tes periodes d'examens ou vacances pour adapter les objectifs
                </p>

                {/* List existing events */}
                <Show when={academicEvents().length > 0}>
                  <div class="space-y-2 mb-4">
                    <For each={academicEvents()}>
                      {(event, index) => (
                        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                          <div class="flex items-center gap-3">
                            <span>
                              {event.type === 'exam_period' ? '📝' :
                               event.type === 'vacation' ? '🏖️' :
                               event.type === 'internship' ? '💼' :
                               event.type === 'project_deadline' ? '⏰' : '📚'}
                            </span>
                            <div>
                              <p class="font-medium text-slate-800">{event.name}</p>
                              <p class="text-xs text-slate-500">
                                {new Date(event.startDate).toLocaleDateString('fr-FR')} - {new Date(event.endDate).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            class="text-red-500 hover:text-red-700"
                            onClick={() => removeAcademicEvent(index())}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Add new event form */}
                <div class="grid grid-cols-2 gap-3">
                  <select
                    class="input-field col-span-2 sm:col-span-1"
                    value={newEvent().type}
                    onChange={(e) => setNewEvent({ ...newEvent(), type: e.currentTarget.value as AcademicEvent['type'] })}
                  >
                    <option value="exam_period">📝 Examens</option>
                    <option value="vacation">🏖️ Vacances</option>
                    <option value="class_intensive">📚 Cours intensifs</option>
                    <option value="internship">💼 Stage</option>
                    <option value="project_deadline">⏰ Rendu projet</option>
                  </select>
                  <input
                    type="text"
                    class="input-field col-span-2 sm:col-span-1"
                    placeholder="Nom (ex: Partiels S1)"
                    value={newEvent().name}
                    onInput={(e) => setNewEvent({ ...newEvent(), name: e.currentTarget.value })}
                  />
                  <input
                    type="date"
                    class="input-field"
                    value={newEvent().startDate}
                    onInput={(e) => setNewEvent({ ...newEvent(), startDate: e.currentTarget.value })}
                  />
                  <input
                    type="date"
                    class="input-field"
                    value={newEvent().endDate}
                    onInput={(e) => setNewEvent({ ...newEvent(), endDate: e.currentTarget.value })}
                  />
                </div>
                <button
                  type="button"
                  class="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  onClick={addAcademicEvent}
                >
                  + Ajouter cet evenement
                </button>
              </div>

              {/* Commitments Section */}
              <div>
                <h4 class="font-medium text-slate-800 mb-3 flex items-center gap-2">
                  <span>📋</span> Engagements reguliers
                </h4>
                <p class="text-sm text-slate-500 mb-4">
                  Indique tes activites qui prennent du temps chaque semaine
                </p>

                {/* List existing commitments */}
                <Show when={commitments().length > 0}>
                  <div class="space-y-2 mb-4">
                    <For each={commitments()}>
                      {(commitment, index) => (
                        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                          <div class="flex items-center gap-3">
                            <span>
                              {commitment.type === 'class' ? '📚' :
                               commitment.type === 'sport' ? '⚽' :
                               commitment.type === 'club' ? '🎭' :
                               commitment.type === 'family' ? '👨‍👩‍👧' :
                               commitment.type === 'health' ? '🏥' : '📌'}
                            </span>
                            <div>
                              <p class="font-medium text-slate-800">{commitment.name}</p>
                              <p class="text-xs text-slate-500">{commitment.hoursPerWeek}h/semaine</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            class="text-red-500 hover:text-red-700"
                            onClick={() => removeCommitment(index())}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Add new commitment form */}
                <div class="grid grid-cols-3 gap-3">
                  <select
                    class="input-field"
                    value={newCommitment().type}
                    onChange={(e) => setNewCommitment({ ...newCommitment(), type: e.currentTarget.value as Commitment['type'] })}
                  >
                    <option value="class">📚 Cours</option>
                    <option value="sport">⚽ Sport</option>
                    <option value="club">🎭 Club/Asso</option>
                    <option value="family">👨‍👩‍👧 Famille</option>
                    <option value="health">🏥 Sante</option>
                    <option value="other">📌 Autre</option>
                  </select>
                  <input
                    type="text"
                    class="input-field"
                    placeholder="Nom (ex: Basket)"
                    value={newCommitment().name}
                    onInput={(e) => setNewCommitment({ ...newCommitment(), name: e.currentTarget.value })}
                  />
                  <div class="relative">
                    <input
                      type="number"
                      class="input-field pr-12"
                      min="1"
                      max="40"
                      value={newCommitment().hoursPerWeek}
                      onInput={(e) => setNewCommitment({ ...newCommitment(), hoursPerWeek: parseInt(e.currentTarget.value) || 0 })}
                    />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">h/sem</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  onClick={addCommitment}
                >
                  + Ajouter cet engagement
                </button>
              </div>

              {/* Capacity Preview */}
              <Show when={academicEvents().length > 0 || commitments().length > 0}>
                <div class="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4">
                  <p class="text-sm font-medium text-slate-700 mb-2">
                    📊 Resume de ta capacite
                  </p>
                  <div class="flex items-center gap-4 text-sm">
                    <Show when={academicEvents().length > 0}>
                      <span class="bg-white rounded px-2 py-1">
                        {academicEvents().filter(e => e.type === 'exam_period').length} periode(s) d'exam
                      </span>
                    </Show>
                    <Show when={commitments().length > 0}>
                      <span class="bg-white rounded px-2 py-1">
                        {commitments().reduce((sum, c) => sum + c.hoursPerWeek, 0)}h/sem d'engagements
                      </span>
                    </Show>
                  </div>
                  <p class="text-xs text-slate-500 mt-2">
                    Ton plan sera adapte automatiquement pour proteger tes periodes chargees
                  </p>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        <Show when={error()}>
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error()}</div>
        </Show>

        <div class="flex justify-center">
          <button type="submit" class="btn-primary text-lg px-8 py-3" disabled={loading()}>
            {loading() ? 'Creation du plan...' : academicEvents().length > 0 || commitments().length > 0 ? 'Creer mon retroplan →' : 'Creer mon plan →'}
          </button>
        </div>
      </form>

      <Show when={!profile()}>
        <div class="mt-6 text-center">
          <p class="text-sm text-slate-500 mb-2">Tu n'as pas encore de profil ?</p>
          <a href="/" class="text-primary-600 hover:underline">
            Remplis le questionnaire pour des recommandations personnalisees
          </a>
        </div>
      </Show>
    </div>
  );
}
