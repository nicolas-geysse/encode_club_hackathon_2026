/**
 * Job Matcher Agent
 *
 * Matches student skills to compatible jobs using knowledge graph.
 * Prioritizes jobs with co-benefits (CV++, networking, flexibility).
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';

// Job database (knowledge graph simulation)
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

// Register tools
registerTool('match_jobs', matchJobsTool);
registerTool('explain_job_match', explainJobMatchTool);
registerTool('compare_jobs', compareJobsTool);

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
  createJobMatcherAgent,
};
