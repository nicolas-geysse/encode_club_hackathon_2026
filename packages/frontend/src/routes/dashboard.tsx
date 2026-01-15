import { createSignal, onMount, Show, For } from "solid-js";

// Types
interface Profile {
  name: string;
  diploma: string;
  field: string;
  yearsRemaining: number;
  skills: string[];
  incomes: { source: string; amount: number }[];
  expenses: { category: string; amount: number }[];
  maxWorkHours: number;
  minHourlyRate: number;
  hasLoan: boolean;
  loanAmount: number;
}

interface Job {
  name: string;
  rate: number;
  match_score: number;
  benefit: string | null;
}

interface Optimization {
  name: string;
  savings_pct: number;
  monthly_savings: number;
  effort: string;
}

interface Projection {
  final_balance: number;
  probability_debt_free: number;
  confidence_low: number;
  confidence_high: number;
  monthly_savings: number;
}

export default function Dashboard() {
  const [profile, setProfile] = createSignal<Profile | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [jobs, setJobs] = createSignal<Job[]>([]);
  const [optimizations, setOptimizations] = createSignal<Optimization[]>([]);
  const [projection, setProjection] = createSignal<Projection | null>(null);
  const [advice, setAdvice] = createSignal<string[]>([]);
  const [opikTraceUrl, setOpikTraceUrl] = createSignal<string>("");

  // Calculate totals
  const totalIncome = () =>
    profile()?.incomes.reduce((sum, i) => sum + i.amount, 0) || 0;
  const totalExpenses = () =>
    profile()?.expenses.reduce((sum, e) => sum + e.amount, 0) || 0;
  const margin = () => totalIncome() - totalExpenses();

  onMount(async () => {
    // Get profile from sessionStorage
    const stored = sessionStorage.getItem("studentProfile");
    if (stored) {
      const p = JSON.parse(stored) as Profile;
      setProfile(p);

      // Simulate API calls to MCP server (in a real app, these would be actual API calls)
      await simulateAnalysis(p);
    }
    setLoading(false);
  });

  const simulateAnalysis = async (p: Profile) => {
    // Simulate job matching based on skills
    const matchedJobs: Job[] = [];
    if (p.skills.includes("python") || p.skills.includes("javascript")) {
      matchedJobs.push({
        name: "Dev Freelance Malt",
        rate: 25,
        match_score: 0.9,
        benefit: "CV++ et expérience pro",
      });
    }
    if (p.skills.includes("anglais")) {
      matchedJobs.push({
        name: "Cours particuliers",
        rate: 20,
        match_score: 0.75,
        benefit: "Renforce tes compétences",
      });
    }
    if (p.skills.includes("redaction")) {
      matchedJobs.push({
        name: "Rédaction web freelance",
        rate: 18,
        match_score: 0.7,
        benefit: "Portfolio et visibilité",
      });
    }
    if (matchedJobs.length === 0) {
      matchedJobs.push({
        name: "Saisie de données",
        rate: 12,
        match_score: 0.5,
        benefit: null,
      });
    }
    setJobs(matchedJobs);

    // Simulate optimizations based on expenses
    const opts: Optimization[] = [];
    const rent = p.expenses.find((e) => e.category === "loyer");
    if (rent && rent.amount > 400) {
      opts.push({
        name: "Colocation",
        savings_pct: 30,
        monthly_savings: Math.round(rent.amount * 0.3),
        effort: "moyen",
      });
    }
    const food = p.expenses.find((e) => e.category === "alimentation");
    if (food && food.amount > 150) {
      opts.push({
        name: "Resto U CROUS",
        savings_pct: 50,
        monthly_savings: Math.round(food.amount * 0.5),
        effort: "faible",
      });
    }
    const transport = p.expenses.find((e) => e.category === "transport");
    if (transport && transport.amount > 30) {
      opts.push({
        name: "Vélo / Marche",
        savings_pct: 80,
        monthly_savings: Math.round(transport.amount * 0.8),
        effort: "moyen",
      });
    }
    setOptimizations(opts);

    // Simulate projection
    const currentMargin = totalIncome() - totalExpenses();
    const yearsRemaining = p.yearsRemaining;
    const bestJob = matchedJobs[0];
    const potentialJobIncome = bestJob ? bestJob.rate * p.maxWorkHours * 4 : 0;
    const potentialOptSavings = opts.reduce((sum, o) => sum + o.monthly_savings, 0);

    const projectedMonthlySavings = currentMargin + potentialJobIncome + potentialOptSavings;
    const finalBalance = projectedMonthlySavings * 12 * yearsRemaining;
    const probabilityDebtFree = Math.min(0.95, Math.max(0.2, finalBalance > 0 ? 0.5 + (finalBalance / 50000) : 0.2));

    setProjection({
      final_balance: finalBalance,
      probability_debt_free: probabilityDebtFree,
      confidence_low: finalBalance * 0.7,
      confidence_high: finalBalance * 1.3,
      monthly_savings: projectedMonthlySavings,
    });

    // Generate advice
    const adviceList: string[] = [];
    if (currentMargin < 0) {
      adviceList.push("Tu es en déficit budgétaire. Priorité: augmenter tes revenus ou réduire tes dépenses.");
    } else if (currentMargin < 100) {
      adviceList.push("Ta marge est serrée. Un petit job pourrait sécuriser ton budget.");
    }
    if (bestJob && bestJob.rate >= 20) {
      adviceList.push(`Le ${bestJob.name} est idéal pour toi: ${bestJob.rate}€/h et ${bestJob.benefit || "flexibilité"}.`);
    }
    if (opts.length > 0) {
      adviceList.push(`Tu peux économiser jusqu'à ${potentialOptSavings}€/mois avec les optimisations suggérées.`);
    }
    if (p.hasLoan && p.loanAmount > 0) {
      adviceList.push("Pense à anticiper le remboursement de ton prêt dès maintenant.");
    }
    setAdvice(adviceList);

    // Set Opik trace URL
    setOpikTraceUrl("http://localhost:5173");
  };

  return (
    <div class="space-y-6">
      <Show when={loading()}>
        <div class="text-center py-12">
          <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-slate-600">Analyse en cours...</p>
        </div>
      </Show>

      <Show when={!loading() && !profile()}>
        <div class="card text-center py-12">
          <p class="text-slate-600 mb-4">
            Aucun profil trouvé. Commence par remplir le questionnaire.
          </p>
          <a href="/" class="btn-primary">
            Remplir le questionnaire →
          </a>
        </div>
      </Show>

      <Show when={!loading() && profile()}>
        {/* Header */}
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-slate-900">
              Salut {profile()?.name || "étudiant"} !
            </h2>
            <p class="text-slate-600">
              {profile()?.diploma.toUpperCase()} {profile()?.field} - {profile()?.yearsRemaining} ans restants
            </p>
          </div>
          <a
            href={opikTraceUrl()}
            target="_blank"
            class="btn-secondary flex items-center gap-2"
          >
            <span>📊</span> Voir traces Opik
          </a>
        </div>

        {/* Metrics */}
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="metric-card">
            <span class="text-sm text-slate-500">Revenus</span>
            <span class="metric-value text-green-600">{totalIncome()}€</span>
            <span class="metric-label">/mois</span>
          </div>
          <div class="metric-card">
            <span class="text-sm text-slate-500">Dépenses</span>
            <span class="metric-value text-red-600">{totalExpenses()}€</span>
            <span class="metric-label">/mois</span>
          </div>
          <div class="metric-card">
            <span class="text-sm text-slate-500">Marge</span>
            <span class={`metric-value ${margin() >= 0 ? "text-green-600" : "text-red-600"}`}>
              {margin() >= 0 ? "+" : ""}{margin()}€
            </span>
            <span class="metric-label">/mois</span>
          </div>
          <div class="metric-card">
            <span class="text-sm text-slate-500">Projection fin études</span>
            <span class={`metric-value ${(projection()?.final_balance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {projection() ? Math.round(projection()!.final_balance).toLocaleString() : 0}€
            </span>
            <span class="metric-label">
              {projection() ? `${Math.round(projection()!.probability_debt_free * 100)}% sans dette` : ""}
            </span>
          </div>
        </div>

        {/* Jobs recommandés */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">🎯</span> Jobs recommandés pour toi
          </h3>
          <Show when={jobs().length > 0} fallback={<p class="text-slate-500">Aucun job trouvé</p>}>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-slate-200">
                    <th class="text-left py-2 text-sm font-medium text-slate-500">Job</th>
                    <th class="text-left py-2 text-sm font-medium text-slate-500">Taux horaire</th>
                    <th class="text-left py-2 text-sm font-medium text-slate-500">Match</th>
                    <th class="text-left py-2 text-sm font-medium text-slate-500">Co-bénéfice</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={jobs()}>
                    {(job) => (
                      <tr class="border-b border-slate-100 last:border-0">
                        <td class="py-3 font-medium">{job.name}</td>
                        <td class="py-3 text-green-600 font-semibold">{job.rate}€/h</td>
                        <td class="py-3">
                          <span class="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-sm">
                            {Math.round(job.match_score * 100)}%
                          </span>
                        </td>
                        <td class="py-3 text-slate-600">{job.benefit || "-"}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>

        {/* Optimisations */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">💡</span> Optimisations budget
          </h3>
          <Show when={optimizations().length > 0} fallback={<p class="text-slate-500">Ton budget est déjà optimisé !</p>}>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <For each={optimizations()}>
                {(opt) => (
                  <div class="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <h4 class="font-medium text-slate-900">{opt.name}</h4>
                    <p class="text-2xl font-bold text-green-600 mt-2">
                      -{opt.monthly_savings}€<span class="text-sm font-normal text-slate-500">/mois</span>
                    </p>
                    <p class="text-sm text-slate-500 mt-1">
                      Économie de {opt.savings_pct}% • Effort {opt.effort}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Conseils */}
        <div class="card">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">💬</span> Conseils personnalisés
          </h3>
          <ul class="space-y-3">
            <For each={advice()}>
              {(a) => (
                <li class="flex items-start gap-3">
                  <span class="text-primary-500 mt-1">•</span>
                  <span class="text-slate-600">{a}</span>
                </li>
              )}
            </For>
          </ul>
          <div class="mt-6 pt-4 border-t border-slate-200">
            <a href="/chat" class="btn-primary inline-flex items-center">
              <span class="mr-2">💬</span> Affiner avec le chat
            </a>
          </div>
        </div>
      </Show>
    </div>
  );
}
