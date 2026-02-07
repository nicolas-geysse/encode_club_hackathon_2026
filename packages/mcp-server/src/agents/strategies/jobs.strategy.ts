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
Analyze the student's skills, their matching job categories, and arbitrage scores.
Give ONE short actionable tip focused on:
- Suggesting a specific prospection category that matches their top skills
- Pointing out their best-scoring skill and which platforms to try
- If they have low energy (<50%), suggesting low-effort categories (childcare, digital, campus)
Reference actual skill names and categories from the context.
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

    // Skills with arbitrage scores
    if (context.jobs?.skills && context.jobs.skills.length > 0) {
      const skills = context.jobs.skills;
      parts.push(`Skills: ${skills.length}`);
      // Show top 5 by arbitrage score (or all if ≤5)
      const sorted = [...skills].sort((a, b) => (b.arbitrageScore ?? 0) - (a.arbitrageScore ?? 0));
      sorted.slice(0, 5).forEach((s) => {
        const rate = s.hourlyRate ? `${s.hourlyRate}€/h` : '?€/h';
        const score = s.arbitrageScore ? ` (arbitrage: ${s.arbitrageScore}/10)` : '';
        parts.push(`- ${s.name}: ${rate}${score}`);
      });

      // Derive matching prospection categories from skill categories
      const categoryMap = this.deriveMatchingCategories(skills);
      if (categoryMap.length > 0) {
        parts.push(`\nMatching job categories:`);
        categoryMap.forEach(({ category, matchingSkills }) => {
          parts.push(`- ${category}: matches ${matchingSkills.join(', ')}`);
        });
      }
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

  /**
   * Derive matching prospection categories from user skills.
   * Maps skill names to prospection categories using keyword matching.
   */
  private deriveMatchingCategories(
    skills: Array<{ name: string }>
  ): Array<{ category: string; matchingSkills: string[] }> {
    // Skill name keywords → prospection category labels
    const SKILL_TO_CATEGORY: Array<{ keywords: string[]; category: string }> = [
      {
        keywords: ['web', 'app', 'python', 'javascript', 'cyber', 'debug', 'automation', 'chatbot'],
        category: 'Digital & Remote',
      },
      {
        keywords: ['design', 'illustration', 'video', 'motion', 'canva', 'template'],
        category: 'Digital & Remote',
      },
      {
        keywords: ['social media', 'community', 'copywriting', 'content', 'writing'],
        category: 'Digital & Remote',
      },
      {
        keywords: ['data entry', 'virtual assistant', 'transcription', 'translation', 'subtitling'],
        category: 'Digital & Remote',
      },
      {
        keywords: ['tutor', 'lesson', 'coaching', 'course', 'guitar', 'piano'],
        category: 'Tutoring & Lessons',
      },
      { keywords: ['helpdesk', 'support', 'lab', 'research'], category: 'Campus Jobs' },
      {
        keywords: ['babysit', 'childcare', 'pet-sitting', 'dog-walking'],
        category: 'Childcare & Pet sitting',
      },
      { keywords: ['cleaning', 'housekeep'], category: 'Cleaning & Maintenance' },
      { keywords: ['delivery', 'courier'], category: 'Temp Agencies' },
      { keywords: ['event', 'promo'], category: 'Events & Promo' },
      { keywords: ['fitness', 'yoga', 'nutrition', 'wellness'], category: 'Beauty & Wellness' },
      { keywords: ['mystery', 'shopping', 'retail'], category: 'Retail & Sales' },
      { keywords: ['repair', 'electronic', 'handyman', 'moving'], category: 'Handyman & Moving' },
    ];

    const categoryHits = new Map<string, string[]>();
    for (const skill of skills) {
      const nameLower = skill.name.toLowerCase();
      for (const { keywords, category } of SKILL_TO_CATEGORY) {
        if (keywords.some((kw) => nameLower.includes(kw))) {
          const existing = categoryHits.get(category) || [];
          if (!existing.includes(skill.name)) {
            existing.push(skill.name);
          }
          categoryHits.set(category, existing);
        }
      }
    }

    return Array.from(categoryHits.entries())
      .map(([category, matchingSkills]) => ({ category, matchingSkills }))
      .sort((a, b) => b.matchingSkills.length - a.matchingSkills.length)
      .slice(0, 4); // Top 4 categories
  }
}
