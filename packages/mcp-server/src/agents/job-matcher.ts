/**
 * Job Matcher Agent
 *
 * Matches student skills to compatible jobs using knowledge graph.
 * Prioritizes jobs with co-benefits (CV++, networking, flexibility).
 *
 * Now integrates with Skill Arbitrage algorithm for full 4-criteria scoring:
 * - Rate (30%): hourly earnings
 * - Demand (25%): market availability
 * - Effort (25%): cognitive load (inverted - lower is better)
 * - Rest (20%): recovery time needed (inverted - lower is better)
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';
import {
  calculateArbitrageScore,
  type Skill,
  type ArbitrageWeights,
  DEFAULT_WEIGHTS,
} from '../algorithms/skill-arbitrage.js';

// Extended Job database with effort/rest metrics for arbitrage scoring
const JOB_DATABASE = [
  {
    id: 'freelance_dev',
    name: 'Dev Freelance (Malt/Fiverr)',
    hourlyRate: 25,
    flexibility: 0.9,
    skills: ['python', 'javascript', 'sql', 'web'],
    coBenefit: 'CV++ et portfolio',
    networking: 'moyen',
    cvImpact: 'fort',
    platform: 'Malt, Fiverr, Upwork',
    // Arbitrage metrics
    marketDemand: 5,
    cognitiveEffort: 4,
    restNeeded: 2,
  },
  {
    id: 'tutoring',
    name: 'Cours particuliers',
    hourlyRate: 20,
    flexibility: 0.8,
    skills: ['python', 'math', 'anglais', 'francais'],
    coBenefit: 'Renforce apprentissage',
    networking: 'fort',
    cvImpact: 'moyen',
    platform: 'Superprof, Kelprof',
    marketDemand: 5,
    cognitiveEffort: 3,
    restNeeded: 1,
  },
  {
    id: 'data_entry',
    name: 'Saisie de donnees',
    hourlyRate: 12,
    flexibility: 0.7,
    skills: ['excel', 'sql'],
    coBenefit: 'Automatisation possible',
    networking: 'faible',
    cvImpact: 'faible',
    platform: 'Indeed, Pole Emploi',
    marketDemand: 4,
    cognitiveEffort: 1,
    restNeeded: 0.5,
  },
  {
    id: 'community_manager',
    name: 'Community Manager',
    hourlyRate: 15,
    flexibility: 0.8,
    skills: ['social_media', 'redaction', 'design'],
    coBenefit: 'Veille secteur digital',
    networking: 'fort',
    cvImpact: 'moyen',
    platform: 'LinkedIn, Welcome to the Jungle',
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
  },
  {
    id: 'assistant_recherche',
    name: 'Assistant de recherche',
    hourlyRate: 12,
    flexibility: 0.6,
    skills: ['python', 'sql', 'redaction'],
    coBenefit: 'Reseau academique',
    networking: 'fort',
    cvImpact: 'fort',
    platform: 'Universites, CNRS',
    marketDemand: 3,
    cognitiveEffort: 4,
    restNeeded: 1.5,
  },
  {
    id: 'traducteur',
    name: 'Traducteur freelance',
    hourlyRate: 18,
    flexibility: 0.9,
    skills: ['anglais', 'redaction'],
    coBenefit: 'Clients internationaux',
    networking: 'moyen',
    cvImpact: 'moyen',
    platform: 'Upwork, ProZ',
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 0.5,
  },
  {
    id: 'mcdo',
    name: 'Fast-food (reference)',
    hourlyRate: 11.65,
    flexibility: 0.3,
    skills: [],
    coBenefit: null,
    networking: 'faible',
    cvImpact: 'faible',
    platform: 'Direct',
    marketDemand: 5,
    cognitiveEffort: 2,
    restNeeded: 2,
  },
];

// === Tool Definitions ===

/**
 * Match jobs tool
 */
export const matchJobsTool = createTool({
  id: 'match_jobs',
  description: 'Trouve des jobs compatibles avec les competences via knowledge graph',
  inputSchema: z.object({
    skills: z.array(z.string()).describe('Liste des competences'),
    maxHoursWeekly: z.number().optional().describe('Heures max par semaine'),
    minHourlyRate: z.number().optional().describe('Taux horaire minimum'),
    prioritizeNetworking: z.boolean().optional().describe('Prioriser le networking'),
  }),
  execute: async ({ context }) => {
    const skillsLower = context.skills.map((s) => s.toLowerCase());
    const minRate = context.minHourlyRate || 0;

    // Score and filter jobs
    const matches = JOB_DATABASE.filter((job) => job.hourlyRate >= minRate)
      .map((job) => {
        // Calculate skill match score
        const matchingSkills = job.skills.filter((s) => skillsLower.includes(s.toLowerCase()));
        const skillScore = job.skills.length > 0 ? matchingSkills.length / job.skills.length : 0;

        // Calculate composite score
        let score = skillScore * 0.4 + (job.hourlyRate / 30) * 0.3 + job.flexibility * 0.2;

        // Boost networking jobs if prioritized
        if (context.prioritizeNetworking && job.networking === 'fort') {
          score += 0.15;
        }

        // Boost CV impact
        if (job.cvImpact === 'fort') {
          score += 0.1;
        }

        return {
          ...job,
          matchScore: Math.min(1, score),
          matchingSkills,
        };
      })
      .filter((job) => job.matchScore > 0.1)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    // Always include McDo as reference
    const mcdo = JOB_DATABASE.find((j) => j.id === 'mcdo');

    return {
      matches,
      reference: mcdo,
      skillsUsed: context.skills,
      totalJobsConsidered: JOB_DATABASE.length,
    };
  },
});

/**
 * Explain job match tool
 */
export const explainJobMatchTool = createTool({
  id: 'explain_job_match',
  description: 'Explique pourquoi un job est recommande via le chemin dans le graph',
  inputSchema: z.object({
    skill: z.string().describe('Competence source'),
    jobId: z.string().describe('ID du job cible'),
  }),
  execute: async ({ context }) => {
    const job = JOB_DATABASE.find((j) => j.id === context.jobId);

    if (!job) {
      return {
        found: false,
        explanation: `Job "${context.jobId}" non trouve`,
      };
    }

    const skillLower = context.skill.toLowerCase();
    const hasSkill = job.skills.some((s) => s.toLowerCase() === skillLower);

    // Build explanation path
    const path = [
      { node: context.skill, type: 'skill' },
      { relation: hasSkill ? 'enables' : 'partially_enables', weight: hasSkill ? 0.9 : 0.5 },
      { node: job.name, type: 'job' },
      { relation: 'pays', weight: job.hourlyRate },
      { node: 'Revenu', type: 'outcome' },
    ];

    const explanation = `${context.skill} → ${hasSkill ? 'active directement' : 'contribue a'} → ${job.name} (${job.hourlyRate}e/h)`;
    const coBenefitExplanation = job.coBenefit
      ? `Bonus: ${job.coBenefit}`
      : 'Pas de co-benefice particulier';

    return {
      found: true,
      job: job.name,
      skill: context.skill,
      explanation,
      coBenefit: coBenefitExplanation,
      path,
      recommendation: hasSkill
        ? `Excellent match! Ta competence ${context.skill} est directement utilisee.`
        : `Match partiel. Tu devras peut-etre completer tes competences.`,
    };
  },
});

/**
 * Compare jobs tool
 */
export const compareJobsTool = createTool({
  id: 'compare_jobs',
  description: 'Compare plusieurs jobs sur differents criteres',
  inputSchema: z.object({
    jobIds: z.array(z.string()).describe('IDs des jobs a comparer'),
    hoursPerWeek: z.number().optional().describe('Heures de travail par semaine'),
  }),
  execute: async ({ context }) => {
    const hoursPerWeek = context.hoursPerWeek || 10;
    const hoursPerMonth = hoursPerWeek * 4;

    const jobs = context.jobIds
      .map((id) => JOB_DATABASE.find((j) => j.id === id))
      .filter((j): j is (typeof JOB_DATABASE)[number] => j !== undefined);

    const comparison = jobs.map((job) => ({
      name: job.name,
      hourlyRate: job.hourlyRate,
      monthlyIncome: Math.round(job.hourlyRate * hoursPerMonth),
      flexibility: job.flexibility,
      coBenefit: job.coBenefit,
      networking: job.networking,
      cvImpact: job.cvImpact,
      platform: job.platform,
    }));

    // Calculate differences from best job
    const bestIncome = Math.max(...comparison.map((j) => j.monthlyIncome));
    const withDiff = comparison.map((j) => ({
      ...j,
      incomeDiffFromBest: j.monthlyIncome - bestIncome,
    }));

    return {
      comparison: withDiff,
      hoursPerWeek,
      recommendation:
        withDiff.sort((a, b) => {
          // Score: income (40%) + flexibility (30%) + CV impact (30%)
          const scoreA =
            (a.monthlyIncome / bestIncome) * 0.4 +
            a.flexibility * 0.3 +
            (a.cvImpact === 'fort' ? 1 : a.cvImpact === 'moyen' ? 0.5 : 0) * 0.3;
          const scoreB =
            (b.monthlyIncome / bestIncome) * 0.4 +
            b.flexibility * 0.3 +
            (b.cvImpact === 'fort' ? 1 : b.cvImpact === 'moyen' ? 0.5 : 0) * 0.3;
          return scoreB - scoreA;
        })[0]?.name || 'Aucune recommandation',
    };
  },
});

/**
 * Skill Arbitrage scoring tool
 *
 * Uses the full 4-criteria algorithm:
 * - Rate (30%), Demand (25%), Effort (25%), Rest (20%)
 */
export const scoreSkillArbitrageTool = createTool({
  id: 'score_skill_arbitrage',
  description:
    "Calcule le score d'arbitrage pour une competence avec 4 criteres: taux, demande, effort, repos",
  inputSchema: z.object({
    skills: z
      .array(
        z.object({
          name: z.string(),
          hourlyRate: z.number().describe('Taux horaire en euros'),
          marketDemand: z.number().min(1).max(5).describe('Demande marche (1-5)'),
          cognitiveEffort: z.number().min(1).max(5).describe('Effort cognitif (1-5)'),
          restNeeded: z.number().min(0).max(4).describe('Repos necessaire en heures'),
        })
      )
      .describe('Liste des competences a evaluer'),
    customWeights: z
      .object({
        rate: z.number().optional(),
        demand: z.number().optional(),
        effort: z.number().optional(),
        rest: z.number().optional(),
      })
      .optional()
      .describe('Poids personnalises (optionnel)'),
  }),
  execute: async ({ context }) => {
    const weights: ArbitrageWeights = context.customWeights
      ? { ...DEFAULT_WEIGHTS, ...context.customWeights }
      : DEFAULT_WEIGHTS;

    // Calculate scores for each skill
    const results = context.skills.map((skillInput) => {
      const skill: Skill = {
        id: `skill_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: skillInput.name,
        level: 'intermediate',
        hourlyRate: skillInput.hourlyRate,
        marketDemand: skillInput.marketDemand,
        cognitiveEffort: skillInput.cognitiveEffort,
        restNeeded: skillInput.restNeeded,
      };

      return calculateArbitrageScore(skill, weights);
    });

    // Sort by score descending
    const sortedResults = results.sort((a, b) => b.score - a.score);

    // Generate insights
    const insights: string[] = [];
    if (sortedResults.length > 0) {
      const top = sortedResults[0];
      insights.push(
        `🏆 "${top.skill.name}" est ton meilleur arbitrage (${top.score.toFixed(1)}/10)`
      );

      // Find high-rate but lower-score skill
      const highRateLowScore = sortedResults.find(
        (r) => r.skill.hourlyRate >= 20 && r.score < top.score - 1
      );
      if (highRateLowScore) {
        insights.push(
          `💡 "${highRateLowScore.skill.name}" paie bien mais l'effort fait baisser son score`
        );
      }
    }

    return {
      rankings: sortedResults.map((r) => ({
        name: r.skill.name,
        score: r.score,
        breakdown: r.breakdown,
        recommendation: r.recommendation,
      })),
      topPick: sortedResults[0]?.skill.name || null,
      insights,
      weightsUsed: weights,
    };
  },
});

/**
 * Match jobs with arbitrage scoring
 * Enhanced version that uses the full 4-criteria algorithm
 */
export const matchJobsWithArbitrageTool = createTool({
  id: 'match_jobs_arbitrage',
  description:
    "Trouve des jobs compatibles et les classe avec le score d'arbitrage (taux, demande, effort, repos)",
  inputSchema: z.object({
    skills: z.array(z.string()).describe('Liste des competences du user'),
    energyLevel: z.number().min(0).max(100).optional().describe("Niveau d'energie actuel (0-100)"),
    prioritizeLowEffort: z.boolean().optional().describe('Prioriser les jobs peu fatigants'),
  }),
  execute: async ({ context }) => {
    const skillsLower = context.skills.map((s) => s.toLowerCase());
    const prioritizeLowEffort = context.prioritizeLowEffort || (context.energyLevel || 100) < 50;

    // Adjust weights if low energy
    const weights: ArbitrageWeights = prioritizeLowEffort
      ? { rate: 0.2, demand: 0.2, effort: 0.35, rest: 0.25 } // Effort-focused
      : DEFAULT_WEIGHTS;

    // Score each job using arbitrage algorithm
    const scoredJobs = JOB_DATABASE.map((job) => {
      // Calculate skill match
      const matchingSkills = job.skills.filter((s) => skillsLower.includes(s.toLowerCase()));
      const skillMatchRatio = job.skills.length > 0 ? matchingSkills.length / job.skills.length : 0;

      // Create pseudo-skill for arbitrage scoring
      const jobAsSkill: Skill = {
        id: job.id,
        name: job.name,
        level: 'intermediate',
        hourlyRate: job.hourlyRate,
        marketDemand: job.marketDemand,
        cognitiveEffort: job.cognitiveEffort,
        restNeeded: job.restNeeded,
      };

      const arbitrageResult = calculateArbitrageScore(jobAsSkill, weights);

      // Combine arbitrage score with skill match
      const combinedScore = arbitrageResult.score * 0.7 + skillMatchRatio * 3; // Max 10

      return {
        ...job,
        matchingSkills,
        skillMatchRatio,
        arbitrageScore: arbitrageResult.score,
        combinedScore,
        breakdown: arbitrageResult.breakdown,
        recommendation: arbitrageResult.recommendation,
      };
    })
      .filter((job) => job.combinedScore > 2) // Filter out very poor matches
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 5);

    // Reference job (McDo)
    const mcdo = JOB_DATABASE.find((j) => j.id === 'mcdo');

    return {
      matches: scoredJobs.map((job) => ({
        id: job.id,
        name: job.name,
        hourlyRate: job.hourlyRate,
        combinedScore: Math.round(job.combinedScore * 10) / 10,
        arbitrageScore: Math.round(job.arbitrageScore * 10) / 10,
        matchingSkills: job.matchingSkills,
        coBenefit: job.coBenefit,
        platform: job.platform,
        effortLevel:
          job.cognitiveEffort <= 2 ? 'Facile' : job.cognitiveEffort <= 3 ? 'Modere' : 'Intense',
        recommendation: job.recommendation,
      })),
      reference: mcdo
        ? {
            name: mcdo.name,
            hourlyRate: mcdo.hourlyRate,
          }
        : null,
      weightsUsed: weights,
      energyAdjusted: prioritizeLowEffort,
      skillsUsed: context.skills,
    };
  },
});

// Register tools
registerTool('match_jobs', matchJobsTool);
registerTool('explain_job_match', explainJobMatchTool);
registerTool('compare_jobs', compareJobsTool);
registerTool('score_skill_arbitrage', scoreSkillArbitrageTool);
registerTool('match_jobs_arbitrage', matchJobsWithArbitrageTool);

/**
 * Create Job Matcher agent instance
 */
export async function createJobMatcherAgent(): Promise<Agent> {
  const config = getAgentConfig('job-matcher');
  if (!config) {
    throw new Error('Job Matcher agent config not found');
  }
  return createStrideAgent(config);
}

export default {
  matchJobsTool,
  explainJobMatchTool,
  compareJobsTool,
  scoreSkillArbitrageTool,
  matchJobsWithArbitrageTool,
  createJobMatcherAgent,
};
