/**
 * Student Analysis Workflow
 *
 * Multi-agent workflow for complete student financial analysis.
 * Uses direct function calls with Opik tracing.
 */

import { trace, getCurrentTraceId } from '../services/opik.js';

/**
 * Student profile input type
 */
export interface StudentProfile {
  name?: string;
  diploma?: string;
  field?: string;
  skills: string[];
  yearsRemaining: number;
  incomes: Array<{ source: string; amount: number }>;
  expenses: Array<{ category: string; amount: number }>;
  maxWorkHours: number;
  minHourlyRate: number;
  hasLoan: boolean;
  loanAmount?: number;
}

/**
 * Analysis result type
 */
export interface AnalysisResult {
  budget: {
    totalIncome: number;
    totalExpenses: number;
    margin: number;
    status: string;
    severity: string;
  };
  jobs: Array<{
    name: string;
    hourlyRate: number;
    matchScore: number;
    coBenefit: string | null;
  }>;
  optimizations: Array<{
    expense: string;
    solution: string;
    savingsPct: number;
    potentialSavings: number;
  }>;
  projection: {
    finalBalance: number;
    probabilityDebtFree: number;
    confidenceInterval: { low: number; high: number };
  };
  validation: {
    passed: boolean;
    confidence: number;
    issues: string[];
  };
  synthesis: string;
  traceId?: string;
}

// Job database
const JOB_DATABASE = [
  { id: 'freelance_dev', name: 'Dev Freelance (Malt/Fiverr)', hourlyRate: 25, flexibility: 0.9, skills: ['python', 'javascript', 'sql', 'web'], coBenefit: 'CV++ et portfolio', networking: 'moyen', cvImpact: 'fort' },
  { id: 'tutoring', name: 'Cours particuliers', hourlyRate: 20, flexibility: 0.8, skills: ['python', 'math', 'anglais', 'francais'], coBenefit: 'Renforce apprentissage', networking: 'fort', cvImpact: 'moyen' },
  { id: 'data_entry', name: 'Saisie de donnees', hourlyRate: 12, flexibility: 0.7, skills: ['excel', 'sql'], coBenefit: 'Automatisation possible', networking: 'faible', cvImpact: 'faible' },
  { id: 'community_manager', name: 'Community Manager', hourlyRate: 15, flexibility: 0.8, skills: ['social_media', 'redaction', 'design'], coBenefit: 'Veille secteur digital', networking: 'fort', cvImpact: 'moyen' },
  { id: 'assistant_recherche', name: 'Assistant de recherche', hourlyRate: 12, flexibility: 0.6, skills: ['python', 'sql', 'redaction'], coBenefit: 'Reseau academique', networking: 'fort', cvImpact: 'fort' },
  { id: 'traducteur', name: 'Traducteur freelance', hourlyRate: 18, flexibility: 0.9, skills: ['anglais', 'redaction'], coBenefit: 'Clients internationaux', networking: 'moyen', cvImpact: 'moyen' },
];

// Optimization database
const OPTIMIZATIONS: Record<string, Array<{ solution: string; savingsPct: number; effort: string; condition: string }>> = {
  loyer: [
    { solution: 'Colocation', savingsPct: 0.30, effort: 'moyen', condition: 'bon coloc' },
    { solution: 'Residence CROUS', savingsPct: 0.40, effort: 'faible', condition: 'eligibilite' },
  ],
  alimentation: [
    { solution: 'Resto U CROUS', savingsPct: 0.50, effort: 'faible', condition: 'proximite' },
    { solution: 'Batch cooking', savingsPct: 0.30, effort: 'moyen', condition: 'temps disponible' },
  ],
  transport: [
    { solution: 'Velo/Marche', savingsPct: 0.80, effort: 'moyen', condition: 'ville adaptee' },
    { solution: 'Carte jeune SNCF', savingsPct: 0.30, effort: 'faible', condition: 'voyages reguliers' },
  ],
};

/**
 * Analyze budget
 */
async function analyzeBudget(incomes: Array<{ source: string; amount: number }>, expenses: Array<{ category: string; amount: number }>) {
  return trace('budget_coach_analysis', async (span) => {
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const margin = totalIncome - totalExpenses;

    const status = margin >= 0 ? 'positif' : 'deficit';
    const severity = margin < -100 ? 'critique' : margin < 0 ? 'attention' : margin < 50 ? 'serre' : 'confortable';

    span.setAttributes({
      total_income: totalIncome,
      total_expenses: totalExpenses,
      margin,
      status,
      severity,
    });

    return { totalIncome, totalExpenses, margin, status, severity };
  });
}

/**
 * Match jobs based on skills
 */
async function matchJobs(skills: string[], minHourlyRate: number) {
  return trace('job_matcher_graph', async (span) => {
    const skillsLower = skills.map(s => s.toLowerCase());

    const matches = JOB_DATABASE
      .filter(job => job.hourlyRate >= minHourlyRate)
      .map(job => {
        const matchingSkills = job.skills.filter(s => skillsLower.includes(s.toLowerCase()));
        const skillScore = job.skills.length > 0 ? matchingSkills.length / job.skills.length : 0;
        const score = skillScore * 0.4 + (job.hourlyRate / 30) * 0.3 + job.flexibility * 0.2;

        return {
          name: job.name,
          hourlyRate: job.hourlyRate,
          matchScore: Math.min(1, score),
          coBenefit: job.coBenefit,
        };
      })
      .filter(job => job.matchScore > 0.1)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    span.setAttributes({
      skills_input: skills.join(', '),
      jobs_found: matches.length,
    });

    return matches;
  });
}

/**
 * Find optimizations
 */
async function findOptimizations(expenses: Array<{ category: string; amount: number }>) {
  return trace('budget_coach_optimizations', async (span) => {
    const results: Array<{ expense: string; solution: string; savingsPct: number; potentialSavings: number }> = [];

    for (const expense of expenses) {
      const categoryLower = expense.category.toLowerCase();
      const opts = OPTIMIZATIONS[categoryLower] || [];

      for (const opt of opts) {
        results.push({
          expense: expense.category,
          solution: opt.solution,
          savingsPct: opt.savingsPct,
          potentialSavings: Math.round(expense.amount * opt.savingsPct),
        });
      }
    }

    results.sort((a, b) => b.potentialSavings - a.potentialSavings);

    span.setAttributes({
      optimizations_found: results.length,
      total_potential_savings: results.reduce((sum, r) => sum + r.potentialSavings, 0),
    });

    return results.slice(0, 5);
  });
}

/**
 * Predict graduation balance
 */
async function predictGraduation(
  monthlyIncome: number,
  monthlyExpenses: number,
  yearsRemaining: number,
  jobHoursWeekly: number,
  jobHourlyRate: number
) {
  return trace('projection_ml_prediction', async (span) => {
    const currentMargin = monthlyIncome - monthlyExpenses;
    const additionalJobIncome = jobHoursWeekly * jobHourlyRate * 4;
    const projectedMonthlyMargin = currentMargin + additionalJobIncome;
    const months = yearsRemaining * 12;
    const finalBalance = projectedMonthlyMargin * months;

    const probabilityDebtFree = Math.min(99, Math.max(1, Math.round(50 + (projectedMonthlyMargin / 500) * 40)));

    const confidenceLow = Math.round(finalBalance * 0.8);
    const confidenceHigh = Math.round(finalBalance * 1.2);

    span.setAttributes({
      projected_margin: projectedMonthlyMargin,
      final_balance: finalBalance,
      probability_debt_free: probabilityDebtFree,
    });

    return {
      finalBalance,
      probabilityDebtFree,
      confidenceInterval: { low: confidenceLow, high: confidenceHigh },
    };
  });
}

/**
 * Validate recommendation (Guardian)
 */
async function validateRecommendation(recommendation: string, margin: number, hasLoan: boolean) {
  return trace('guardian_validation', async (span) => {
    const issues: string[] = [];

    // Check for high-risk keywords
    const highRiskKeywords = ['crypto', 'bitcoin', 'forex', 'garanti', 'sans risque'];
    for (const keyword of highRiskKeywords) {
      if (recommendation.toLowerCase().includes(keyword)) {
        issues.push(`Mot-cle a risque: ${keyword}`);
      }
    }

    // Check if advice is appropriate for situation
    if (margin < 0 && recommendation.toLowerCase().includes('investir')) {
      issues.push('Conseil d\'investissement en situation de deficit');
    }

    const passed = issues.length === 0;
    const confidence = passed ? 0.9 : 0.4;

    span.setAttributes({
      validation_passed: passed,
      issues_count: issues.length,
      confidence,
    });

    return { passed, confidence, issues };
  });
}

/**
 * Generate synthesis
 */
function generateSynthesis(
  profile: StudentProfile,
  budget: { margin: number; status: string },
  jobs: Array<{ name: string; hourlyRate: number }>,
  optimizations: Array<{ solution: string; potentialSavings: number }>,
  projection: { finalBalance: number; probabilityDebtFree: number }
): string {
  const name = profile.name || 'Salut';
  const bestJob = jobs[0];
  const topOpt = optimizations[0];

  let synthesis = `## ${name}, voici ton analyse\n\n`;

  // Budget status
  if (budget.margin < 0) {
    synthesis += `**Situation budget**: Deficit de ${Math.abs(budget.margin)}e/mois. C'est urgent d'agir!\n\n`;
  } else if (budget.margin < 50) {
    synthesis += `**Situation budget**: Marge serree (${budget.margin}e/mois). Attention.\n\n`;
  } else {
    synthesis += `**Situation budget**: Marge confortable (${budget.margin}e/mois). Tu as de la flexibilite!\n\n`;
  }

  // Job recommendation
  if (bestJob) {
    synthesis += `**Job recommande**: ${bestJob.name} a ${bestJob.hourlyRate}e/h. `;
    synthesis += `Avec ${profile.maxWorkHours}h/sem, ca fait +${Math.round(bestJob.hourlyRate * profile.maxWorkHours * 4)}e/mois.\n\n`;
  }

  // Optimization
  if (topOpt) {
    synthesis += `**Optimisation facile**: ${topOpt.solution} (~${topOpt.potentialSavings}e/mois d'economie).\n\n`;
  }

  // Projection
  synthesis += `**Projection ${profile.yearsRemaining} ans**: `;
  if (projection.finalBalance >= 0) {
    synthesis += `${projection.probabilityDebtFree}% de chances de finir sans dette, `;
    synthesis += `avec environ ${projection.finalBalance.toLocaleString('fr-FR')}e d'epargne!\n`;
  } else {
    synthesis += `Attention, risque de dette de ${Math.abs(projection.finalBalance).toLocaleString('fr-FR')}e.\n`;
  }

  return synthesis;
}

/**
 * Run the complete student analysis workflow
 */
export async function runStudentAnalysis(profile: StudentProfile): Promise<AnalysisResult> {
  return trace('student_full_analysis', async (span) => {
    span.setAttributes({
      student_name: profile.name || 'anonymous',
      skills_count: profile.skills.length,
      years_remaining: profile.yearsRemaining,
    });

    // Step 1: Budget Analysis
    const budget = await analyzeBudget(profile.incomes, profile.expenses);

    // Step 2 & 3: Run job matching and optimizations in parallel
    const [jobs, optimizations] = await Promise.all([
      matchJobs(profile.skills, profile.minHourlyRate),
      findOptimizations(profile.expenses),
    ]);

    // Step 4: Graduation Projection
    const bestJob = jobs[0];
    const projection = await predictGraduation(
      budget.totalIncome,
      budget.totalExpenses,
      profile.yearsRemaining,
      profile.maxWorkHours,
      bestJob?.hourlyRate || 0
    );

    // Step 5: Guardian Validation
    const synthesis = generateSynthesis(profile, budget, jobs, optimizations, projection);
    const validation = await validateRecommendation(synthesis, budget.margin, profile.hasLoan);

    span.setAttributes({
      budget_margin: budget.margin,
      jobs_found: jobs.length,
      projection_balance: projection.finalBalance,
      validation_passed: validation.passed,
    });

    return {
      budget,
      jobs,
      optimizations,
      projection,
      validation,
      synthesis,
      traceId: getCurrentTraceId() || undefined,
    };
  });
}

export default { runStudentAnalysis };
