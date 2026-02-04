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
    return `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse le profil de l'étudiant et donne UN conseil court et actionnable pour l'améliorer.
Focus sur: compléter les informations manquantes, optimiser les préférences de travail, ou valoriser les certifications.
Si le profil est très complet, félicite l'étudiant et suggère de passer aux objectifs.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;
  }

  getFallbackMessage(): string {
    return 'Complète ton profil pour recevoir des conseils personnalisés !';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];
    const p = context.profile || {};

    // Profile fields
    if (p.name) parts.push(`Nom: ${p.name}`);
    if (p.diploma) parts.push(`Diplôme: ${p.diploma}`);
    if (p.field) parts.push(`Domaine: ${p.field}`);
    if (p.city) parts.push(`Ville: ${p.city}`);

    // Skills
    if (p.skills && p.skills.length > 0) {
      parts.push(`Compétences: ${this.formatList(p.skills)}`);
    } else {
      parts.push('Compétences: aucune (à compléter)');
    }

    // Certifications
    if (p.certifications && p.certifications.length > 0) {
      parts.push(`Certifications: ${this.formatList(p.certifications)}`);
    }

    // Work preferences
    if (p.maxWorkHoursWeekly) {
      parts.push(`Heures max/semaine: ${p.maxWorkHoursWeekly}h`);
    }
    if (p.minHourlyRate) {
      parts.push(`Taux horaire min: ${p.minHourlyRate}€/h`);
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
    parts.push(`\nComplétude du profil: ${completeness}%`);

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
      parts.push(`Champs manquants: ${missing.join(', ')}`);
    }

    return parts.join('\n') || 'Profil incomplet';
  }
}
