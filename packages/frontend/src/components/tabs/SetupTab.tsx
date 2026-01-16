/**
 * Setup Tab Component
 *
 * Goal configuration: objective, deadline, academic events, commitments.
 */

import { createSignal, Show, For, onMount } from 'solid-js';

interface AcademicEvent {
  id: string;
  type: 'exam_period' | 'class_intensive' | 'vacation' | 'internship' | 'project_deadline';
  name: string;
  startDate: string;
  endDate: string;
}

interface Commitment {
  id: string;
  type: 'class' | 'sport' | 'club' | 'family' | 'health' | 'other';
  name: string;
  hoursPerWeek: number;
}

interface SetupData {
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  academicEvents: AcademicEvent[];
  commitments: Commitment[];
}

interface SetupTabProps {
  onComplete: (data: SetupData) => void;
  initialData?: Partial<SetupData>;
}

export function SetupTab(props: SetupTabProps) {
  const [goalName, setGoalName] = createSignal(props.initialData?.goalName || '');
  const [goalAmount, setGoalAmount] = createSignal(props.initialData?.goalAmount || 500);
  const [goalDeadline, setGoalDeadline] = createSignal(props.initialData?.goalDeadline || '');
  const [academicEvents, setAcademicEvents] = createSignal<AcademicEvent[]>(
    props.initialData?.academicEvents || []
  );
  const [commitments, setCommitments] = createSignal<Commitment[]>(
    props.initialData?.commitments || []
  );

  // New event/commitment forms
  const [newEvent, setNewEvent] = createSignal<Partial<AcademicEvent>>({
    type: 'exam_period',
    name: '',
    startDate: '',
    endDate: '',
  });
  const [newCommitment, setNewCommitment] = createSignal<Partial<Commitment>>({
    type: 'class',
    name: '',
    hoursPerWeek: 2,
  });

  // Set default deadline
  onMount(() => {
    if (!goalDeadline()) {
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 56);
      setGoalDeadline(defaultDeadline.toISOString().split('T')[0]);
    }
  });

  const addAcademicEvent = () => {
    const event = newEvent();
    if (!event.name || !event.startDate || !event.endDate) return;

    setAcademicEvents([
      ...academicEvents(),
      { ...event, id: `event_${Date.now()}` } as AcademicEvent,
    ]);
    setNewEvent({ type: 'exam_period', name: '', startDate: '', endDate: '' });
  };

  const removeAcademicEvent = (id: string) => {
    setAcademicEvents(academicEvents().filter((e) => e.id !== id));
  };

  const addCommitment = () => {
    const commitment = newCommitment();
    if (!commitment.name || !commitment.hoursPerWeek) return;

    setCommitments([...commitments(), { ...commitment, id: `commit_${Date.now()}` } as Commitment]);
    setNewCommitment({ type: 'class', name: '', hoursPerWeek: 2 });
  };

  const removeCommitment = (id: string) => {
    setCommitments(commitments().filter((c) => c.id !== id));
  };

  const handleSave = () => {
    if (!goalName() || goalAmount() <= 0 || !goalDeadline()) return;

    props.onComplete({
      goalName: goalName(),
      goalAmount: goalAmount(),
      goalDeadline: goalDeadline(),
      academicEvents: academicEvents(),
      commitments: commitments(),
    });
  };

  // Quick presets
  const presets = [
    { name: 'Vacances', amount: 500, icon: '🏖️' },
    { name: 'Permis', amount: 1500, icon: '🚗' },
    { name: 'Ordinateur', amount: 800, icon: '💻' },
    { name: 'Fonds urgence', amount: 1000, icon: '🛡️' },
  ];

  return (
    <div class="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Goal Presets */}
      <div class="card">
        <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span>🎯</span> Objectif rapide
        </h3>
        <div class="flex gap-3 flex-wrap">
          <For each={presets}>
            {(preset) => (
              <button
                type="button"
                class={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                  goalName() === preset.name
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
                onClick={() => {
                  setGoalName(preset.name);
                  setGoalAmount(preset.amount);
                }}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
                <span class="text-sm text-slate-500">({preset.amount}€)</span>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Goal Details */}
      <div class="card">
        <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span>💰</span> Details
        </h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Nom de l'objectif</label>
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
              <label class="block text-sm font-medium text-slate-700 mb-1">Montant</label>
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
              <label class="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
              <input
                type="date"
                class="input-field"
                value={goalDeadline() || ''}
                onInput={(e) => setGoalDeadline(e.currentTarget.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Academic Events */}
      <div class="card">
        <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span>📅</span> Evenements academiques
        </h3>
        <p class="text-sm text-slate-500 mb-4">
          Ajoute tes periodes d'examens ou vacances pour adapter les objectifs
        </p>

        <Show when={academicEvents().length > 0}>
          <div class="space-y-2 mb-4">
            <For each={academicEvents()}>
              {(event) => (
                <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                  <div class="flex items-center gap-3">
                    <span>
                      {event.type === 'exam_period'
                        ? '📝'
                        : event.type === 'vacation'
                          ? '🏖️'
                          : event.type === 'internship'
                            ? '💼'
                            : event.type === 'project_deadline'
                              ? '⏰'
                              : '📚'}
                    </span>
                    <div>
                      <p class="font-medium text-slate-800">{event.name}</p>
                      <p class="text-xs text-slate-500">
                        {new Date(event.startDate).toLocaleDateString('fr-FR')} -{' '}
                        {new Date(event.endDate).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="text-red-500 hover:text-red-700"
                    onClick={() => removeAcademicEvent(event.id)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="grid grid-cols-2 gap-3">
          <select
            class="input-field"
            value={newEvent().type}
            onChange={(e) =>
              setNewEvent({ ...newEvent(), type: e.currentTarget.value as AcademicEvent['type'] })
            }
          >
            <option value="exam_period">📝 Examens</option>
            <option value="vacation">🏖️ Vacances</option>
            <option value="class_intensive">📚 Cours intensifs</option>
            <option value="internship">💼 Stage</option>
            <option value="project_deadline">⏰ Rendu projet</option>
          </select>
          <input
            type="text"
            class="input-field"
            placeholder="Nom (ex: Partiels S1)"
            value={newEvent().name}
            onInput={(e) => setNewEvent({ ...newEvent(), name: e.currentTarget.value })}
          />
          <input
            type="date"
            class="input-field"
            value={newEvent().startDate || ''}
            onInput={(e) => setNewEvent({ ...newEvent(), startDate: e.currentTarget.value })}
          />
          <input
            type="date"
            class="input-field"
            value={newEvent().endDate || ''}
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

      {/* Commitments */}
      <div class="card">
        <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span>📋</span> Engagements reguliers
        </h3>
        <p class="text-sm text-slate-500 mb-4">
          Indique tes activites qui prennent du temps chaque semaine
        </p>

        <Show when={commitments().length > 0}>
          <div class="space-y-2 mb-4">
            <For each={commitments()}>
              {(commitment) => (
                <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                  <div class="flex items-center gap-3">
                    <span>
                      {commitment.type === 'class'
                        ? '📚'
                        : commitment.type === 'sport'
                          ? '⚽'
                          : commitment.type === 'club'
                            ? '🎭'
                            : commitment.type === 'family'
                              ? '👨‍👩‍👧'
                              : commitment.type === 'health'
                                ? '🏥'
                                : '📌'}
                    </span>
                    <div>
                      <p class="font-medium text-slate-800">{commitment.name}</p>
                      <p class="text-xs text-slate-500">{commitment.hoursPerWeek}h/semaine</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="text-red-500 hover:text-red-700"
                    onClick={() => removeCommitment(commitment.id)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="grid grid-cols-3 gap-3">
          <select
            class="input-field"
            value={newCommitment().type}
            onChange={(e) =>
              setNewCommitment({
                ...newCommitment(),
                type: e.currentTarget.value as Commitment['type'],
              })
            }
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
              class="input-field pr-14"
              min="1"
              max="40"
              value={newCommitment().hoursPerWeek}
              onInput={(e) =>
                setNewCommitment({
                  ...newCommitment(),
                  hoursPerWeek: parseInt(e.currentTarget.value) || 0,
                })
              }
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
              h/sem
            </span>
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

      {/* Save Button */}
      <div class="flex justify-center">
        <button
          type="button"
          class="btn-primary text-lg px-8 py-3"
          onClick={handleSave}
          disabled={!goalName() || goalAmount() <= 0 || !goalDeadline()}
        >
          Valider l'objectif
        </button>
      </div>
    </div>
  );
}
