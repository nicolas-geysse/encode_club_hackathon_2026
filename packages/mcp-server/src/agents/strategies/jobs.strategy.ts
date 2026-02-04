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
    return `You are Bruno, a caring financial coach for students.
Analyze the student's skills and job search and give ONE short actionable tip.
Focus on: matching a skill with an opportunity, suggesting a new lead, or optimizing hourly rate.
Consider current energy - if it's low (<50%), favor low-effort jobs.
Reply in 1-2 sentences max, in an encouraging tone.`;
  }

  getFallbackMessage(): string {
    return 'Add your skills to receive personalized job suggestions!';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Common context
    const common = this.buildCommonContext(context);
    if (common) parts.push(common);

    // Skills
    if (context.jobs?.skills && context.jobs.skills.length > 0) {
      parts.push(`Skills: ${context.jobs.skills.length}`);
      context.jobs.skills.slice(0, 5).forEach((s) => {
        const rate = s.hourlyRate ? `${s.hourlyRate}€/h` : '?€/h';
        const score = s.arbitrageScore ? ` (score: ${s.arbitrageScore}/10)` : '';
        parts.push(`- ${s.name}: ${rate}${score}`);
      });
    } else {
      parts.push('Skills: none declared');
    }

    // Work preferences
    if (context.profile?.maxWorkHoursWeekly) {
      parts.push(`Available hours/week: ${context.profile.maxWorkHoursWeekly}h`);
    }
    if (context.profile?.minHourlyRate) {
      parts.push(`Minimum hourly rate: ${context.profile.minHourlyRate}€/h`);
    }

    // Leads
    if (context.jobs?.leads && context.jobs.leads.length > 0) {
      const interested = context.jobs.leads.filter((l) => l.status === 'interested').length;
      parts.push(`Saved opportunities: ${interested}`);
    }

    // Location
    if (context.jobs?.city) {
      parts.push(`Location: ${context.jobs.city}`);
    }

    return parts.join('\n') || 'No skills declared';
  }
}
