/**
 * Jobs Tab Strategy
 *
 * Primary: Job Matcher
 * Secondary: Strategy Comparator
 * Focus: Skill matching, job opportunities, arbitrage scores
 */

import { BaseTabStrategy } from './base.strategy.js';
import type { TabType, TabContext, ValidationRules } from './types.js';
import { loadTabContext } from '../../services/tab-context.js';

export class JobsStrategy extends BaseTabStrategy {
  readonly tabType: TabType = 'jobs';

  async loadContext(profileId: string): Promise<TabContext> {
    return loadTabContext(profileId, this.tabType);
  }

  getPrimaryAgentId(): string {
    return 'job-matcher';
  }

  getSecondaryAgentIds(): string[] {
    return ['strategy-comparator'];
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: true, // Verify commute time, skill match, energy cost
      checkSolvency: false,
      checkRealism: false,
      checkTimeline: false,
      minConfidence: 0.6,
      maxRiskLevel: 'medium',
    };
  }

  getSystemPrompt(): string {
    return `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse les compétences et la recherche d'emploi de l'étudiant et donne UN conseil court et actionnable.
Focus sur: matcher une compétence avec une opportunité, suggérer une nouvelle piste, ou optimiser le taux horaire.
Considère l'énergie actuelle - si elle est basse (<50%), privilégie des jobs à faible effort.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;
  }

  getFallbackMessage(): string {
    return 'Ajoute tes compétences pour recevoir des suggestions de jobs personnalisées !';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Common context
    const common = this.buildCommonContext(context);
    if (common) parts.push(common);

    // Skills
    if (context.jobs?.skills && context.jobs.skills.length > 0) {
      parts.push(`Compétences: ${context.jobs.skills.length}`);
      context.jobs.skills.slice(0, 5).forEach((s) => {
        const rate = s.hourlyRate ? `${s.hourlyRate}€/h` : '?€/h';
        const score = s.arbitrageScore ? ` (score: ${s.arbitrageScore}/10)` : '';
        parts.push(`- ${s.name}: ${rate}${score}`);
      });
    } else {
      parts.push('Compétences: aucune déclarée');
    }

    // Work preferences
    if (context.profile?.maxWorkHoursWeekly) {
      parts.push(`Heures disponibles/semaine: ${context.profile.maxWorkHoursWeekly}h`);
    }
    if (context.profile?.minHourlyRate) {
      parts.push(`Taux horaire minimum: ${context.profile.minHourlyRate}€/h`);
    }

    // Leads
    if (context.jobs?.leads && context.jobs.leads.length > 0) {
      const interested = context.jobs.leads.filter((l) => l.status === 'interested').length;
      parts.push(`Opportunités sauvegardées: ${interested}`);
    }

    // Location
    if (context.jobs?.city) {
      parts.push(`Localisation: ${context.jobs.city}`);
    }

    return parts.join('\n') || 'Pas de compétences déclarées';
  }
}
