import { createSignal, For } from "solid-js";
import { useNavigate } from "@solidjs/router";

// Form data types
interface ProfileData {
  name: string;
  diploma: string;
  field: string;
  yearsRemaining: number;
  skills: string[];
  city: string;
  citySize: string;
  incomes: { source: string; amount: number }[];
  expenses: { category: string; amount: number }[];
  maxWorkHours: number;
  minHourlyRate: number;
  hasLoan: boolean;
  loanAmount: number;
}

// Available options
const DIPLOMAS = [
  { value: "l1", label: "L1" },
  { value: "l2", label: "L2" },
  { value: "l3", label: "L3" },
  { value: "m1", label: "M1" },
  { value: "m2", label: "M2" },
];

const FIELDS = [
  { value: "informatique", label: "Informatique" },
  { value: "langues", label: "Langues" },
  { value: "droit", label: "Droit" },
  { value: "psychologie", label: "Psychologie" },
  { value: "commerce", label: "Commerce" },
  { value: "sciences", label: "Sciences" },
  { value: "sante", label: "Santé" },
  { value: "arts", label: "Arts" },
  { value: "autre", label: "Autre" },
];

const SKILLS = [
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "javascript", label: "JavaScript" },
  { value: "excel", label: "Excel" },
  { value: "anglais", label: "Anglais" },
  { value: "design", label: "Design" },
  { value: "redaction", label: "Rédaction" },
  { value: "comptabilite", label: "Comptabilité" },
  { value: "social_media", label: "Réseaux sociaux" },
];

const INCOME_SOURCES = [
  { value: "apl", label: "APL/CAF" },
  { value: "parents", label: "Aide parentale" },
  { value: "job", label: "Job actuel" },
  { value: "bourse", label: "Bourse" },
  { value: "autre", label: "Autre" },
];

const EXPENSE_CATEGORIES = [
  { value: "loyer", label: "Loyer" },
  { value: "alimentation", label: "Alimentation" },
  { value: "transport", label: "Transport" },
  { value: "telephone", label: "Téléphone/Internet" },
  { value: "loisirs", label: "Loisirs" },
  { value: "autre", label: "Autre" },
];

export default function Questionnaire() {
  const navigate = useNavigate();

  const [formData, setFormData] = createSignal<ProfileData>({
    name: "",
    diploma: "l2",
    field: "informatique",
    yearsRemaining: 3,
    skills: [],
    city: "",
    citySize: "medium",
    incomes: [],
    expenses: [],
    maxWorkHours: 15,
    minHourlyRate: 12,
    hasLoan: false,
    loanAmount: 0,
  });

  const [incomeAmounts, setIncomeAmounts] = createSignal<Record<string, number>>({});
  const [expenseAmounts, setExpenseAmounts] = createSignal<Record<string, number>>({});
  const [loading, setLoading] = createSignal(false);

  const toggleSkill = (skill: string) => {
    const current = formData().skills;
    if (current.includes(skill)) {
      setFormData({ ...formData(), skills: current.filter((s) => s !== skill) });
    } else {
      setFormData({ ...formData(), skills: [...current, skill] });
    }
  };

  const handleIncomeChange = (source: string, amount: number) => {
    setIncomeAmounts({ ...incomeAmounts(), [source]: amount });
  };

  const handleExpenseChange = (category: string, amount: number) => {
    setExpenseAmounts({ ...expenseAmounts(), [category]: amount });
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);

    // Collect incomes and expenses from amounts
    const incomes = Object.entries(incomeAmounts())
      .filter(([, amount]) => amount > 0)
      .map(([source, amount]) => ({ source, amount }));

    const expenses = Object.entries(expenseAmounts())
      .filter(([, amount]) => amount > 0)
      .map(([category, amount]) => ({ category, amount }));

    const profile = {
      ...formData(),
      incomes,
      expenses,
    };

    // Store profile in sessionStorage for dashboard
    sessionStorage.setItem("studentProfile", JSON.stringify(profile));

    // Navigate to dashboard
    navigate("/dashboard");
  };

  return (
    <div class="max-w-3xl mx-auto">
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold text-slate-900 mb-2">
          Ton Profil Étudiant
        </h2>
        <p class="text-slate-600">
          Remplis ce questionnaire pour obtenir des recommandations personnalisées
        </p>
      </div>

      <form onSubmit={handleSubmit} class="space-y-8">
        {/* Études */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">📚</span> Études
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Prénom
              </label>
              <input
                type="text"
                class="input-field"
                placeholder="Ton prénom"
                value={formData().name}
                onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Diplôme actuel
              </label>
              <select
                class="input-field"
                value={formData().diploma}
                onChange={(e) => setFormData({ ...formData(), diploma: e.currentTarget.value })}
              >
                <For each={DIPLOMAS}>
                  {(d) => <option value={d.value}>{d.label}</option>}
                </For>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Filière
              </label>
              <select
                class="input-field"
                value={formData().field}
                onChange={(e) => setFormData({ ...formData(), field: e.currentTarget.value })}
              >
                <For each={FIELDS}>
                  {(f) => <option value={f.value}>{f.label}</option>}
                </For>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Années restantes
              </label>
              <input
                type="number"
                class="input-field"
                min="1"
                max="10"
                value={formData().yearsRemaining}
                onInput={(e) => setFormData({ ...formData(), yearsRemaining: parseInt(e.currentTarget.value) || 1 })}
              />
            </div>
          </div>
        </div>

        {/* Compétences */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">💼</span> Compétences
          </h3>
          <p class="text-sm text-slate-600 mb-4">
            Coche ce que tu maîtrises
          </p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <For each={SKILLS}>
              {(skill) => (
                <label
                  class={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData().skills.includes(skill.value)
                      ? "bg-primary-50 border-primary-500 text-primary-700"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    class="sr-only"
                    checked={formData().skills.includes(skill.value)}
                    onChange={() => toggleSkill(skill.value)}
                  />
                  <span class="text-sm font-medium">{skill.label}</span>
                </label>
              )}
            </For>
          </div>
        </div>

        {/* Budget - Revenus */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">💰</span> Revenus mensuels
          </h3>
          <div class="space-y-3">
            <For each={INCOME_SOURCES}>
              {(source) => (
                <div class="flex items-center gap-4">
                  <label class="w-40 text-sm text-slate-600">{source.label}</label>
                  <input
                    type="number"
                    class="input-field flex-1"
                    placeholder="0"
                    min="0"
                    value={incomeAmounts()[source.value] || ""}
                    onInput={(e) => handleIncomeChange(source.value, parseInt(e.currentTarget.value) || 0)}
                  />
                  <span class="text-slate-500">€/mois</span>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Budget - Dépenses */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">💸</span> Dépenses mensuelles
          </h3>
          <div class="space-y-3">
            <For each={EXPENSE_CATEGORIES}>
              {(cat) => (
                <div class="flex items-center gap-4">
                  <label class="w-40 text-sm text-slate-600">{cat.label}</label>
                  <input
                    type="number"
                    class="input-field flex-1"
                    placeholder="0"
                    min="0"
                    value={expenseAmounts()[cat.value] || ""}
                    onInput={(e) => handleExpenseChange(cat.value, parseInt(e.currentTarget.value) || 0)}
                  />
                  <span class="text-slate-500">€/mois</span>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Contraintes */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">⚙️</span> Contraintes de travail
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Heures max par semaine
              </label>
              <input
                type="number"
                class="input-field"
                min="0"
                max="35"
                value={formData().maxWorkHours}
                onInput={(e) => setFormData({ ...formData(), maxWorkHours: parseInt(e.currentTarget.value) || 0 })}
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Taux horaire minimum
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  class="input-field"
                  min="0"
                  value={formData().minHourlyRate}
                  onInput={(e) => setFormData({ ...formData(), minHourlyRate: parseInt(e.currentTarget.value) || 0 })}
                />
                <span class="text-slate-500">€/h</span>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-slate-200">
            <label class="flex items-center gap-3">
              <input
                type="checkbox"
                class="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                checked={formData().hasLoan}
                onChange={(e) => setFormData({ ...formData(), hasLoan: e.currentTarget.checked })}
              />
              <span class="text-sm font-medium text-slate-700">J'ai un prêt étudiant</span>
            </label>
            {formData().hasLoan && (
              <div class="mt-3 ml-8">
                <label class="block text-sm font-medium text-slate-700 mb-1">
                  Montant du prêt
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    class="input-field w-40"
                    min="0"
                    value={formData().loanAmount}
                    onInput={(e) => setFormData({ ...formData(), loanAmount: parseInt(e.currentTarget.value) || 0 })}
                  />
                  <span class="text-slate-500">€</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div class="flex justify-center">
          <button
            type="submit"
            class="btn-primary text-lg px-8 py-3"
            disabled={loading()}
          >
            {loading() ? "Analyse en cours..." : "Analyser ma situation →"}
          </button>
        </div>
      </form>
    </div>
  );
}
