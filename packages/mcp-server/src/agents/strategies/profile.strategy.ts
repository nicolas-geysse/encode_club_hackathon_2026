/**
 * Profile Tab Strategy
 *
 * Primary: Guardian
 * Secondary: None (profile is foundational)
 * Focus: Profile completeness, data quality, preferences
 */

import { BaseTabStrategy } from './base.strategy.js';
import type { TabType, TabContext, ValidationRules } from './types.js';
import { loadTabContext } from '../../services/tab-context.js';

export class ProfileStrategy extends BaseTabStrategy {
  readonly tabType: TabType = 'profile';

  async loadContext(profileId: string): Promise<TabContext> {
    return loadTabContext(profileId, this.tabType);
  }

  getPrimaryAgentId(): string {
    return 'guardian'; // Guardian checks profile quality
  }

  getSecondaryAgentIds(): string[] {
    return []; // No secondary agents for profile
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: false,
      checkSolvency: false,
      checkRealism: false,
      checkTimeline: false,
      minConfidence: 0.5,
      maxRiskLevel: 'low',
    };
  }

  getSystemPrompt(): string {
    return `You are Bruno, a caring financial coach for students.
Analyze the student's profile and give ONE short actionable tip to improve it.
Focus on: completing missing information, optimizing work preferences, or highlighting certifications.
If the profile is very complete, congratulate the student and suggest moving on to goals.
Reply in 1-2 sentences max, in an encouraging tone.`;
  }

  getFallbackMessage(): string {
    return 'Complete your profile to receive personalized tips!';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];
    const p = context.profile || {};

    // Profile fields
    if (p.name) parts.push(`Name: ${p.name}`);
    if (p.diploma) parts.push(`Degree: ${p.diploma}`);
    if (p.field) parts.push(`Field: ${p.field}`);
    if (p.city) parts.push(`City: ${p.city}`);

    // Skills
    if (p.skills && p.skills.length > 0) {
      parts.push(`Skills: ${this.formatList(p.skills)}`);
    } else {
      parts.push('Skills: none (to complete)');
    }

    // Certifications
    if (p.certifications && p.certifications.length > 0) {
      parts.push(`Certifications: ${this.formatList(p.certifications)}`);
    }

    // Work preferences
    if (p.maxWorkHoursWeekly) {
      parts.push(`Max hours/week: ${p.maxWorkHoursWeekly}h`);
    }
    if (p.minHourlyRate) {
      parts.push(`Min hourly rate: ${p.minHourlyRate}€/h`);
    }

    // Calculate completeness
    const requiredFields = ['name', 'diploma', 'field', 'city', 'skills'];
    const filledFields = requiredFields.filter((f) => {
      const value = p[f as keyof typeof p];
      return (
        value !== undefined &&
        value !== null &&
        value !== '' &&
        (!Array.isArray(value) || value.length > 0)
      );
    });
    const completeness = Math.round((filledFields.length / requiredFields.length) * 100);
    parts.push(`\nProfile completeness: ${completeness}%`);

    if (completeness < 100) {
      const missing = requiredFields.filter((f) => {
        const value = p[f as keyof typeof p];
        return (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        );
      });
      parts.push(`Missing fields: ${missing.join(', ')}`);
    }

    return parts.join('\n') || 'Profile incomplete';
  }
}
