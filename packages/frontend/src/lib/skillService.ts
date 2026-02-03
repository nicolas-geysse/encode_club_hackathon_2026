/**
 * Skill Service
 *
 * Frontend service for skill management with DuckDB persistence.
 * Skills are stored in a dedicated table (not embedded in profiles)
 * for clean architecture, Opik traceability, and query flexibility.
 */

import { createLogger } from './logger';
import { eventBus } from './eventBus';

// Re-export types from canonical source
export type { Skill, CreateSkillInput, SkillLevel } from '../types/entities';
import type { Skill, CreateSkillInput, SkillLevel } from '../types/entities';

const logger = createLogger('SkillService');

/**
 * Input for updating an existing skill (internal use)
 */
interface UpdateSkillInput {
  id: string;
  name?: string;
  level?: SkillLevel;
  hourlyRate?: number;
  marketDemand?: number;
  cognitiveEffort?: number;
  restNeeded?: number;
}

/**
 * List skills for a profile
 */
export async function listSkills(profileId: string): Promise<Skill[]> {
  try {
    const response = await fetch(`/api/skills?profileId=${profileId}`);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to list skills', { error: error.message });
      return [];
    }

    const skills = await response.json();
    return skills;
  } catch (error) {
    logger.error('Error listing skills', { error });
    return [];
  }
}

/**
 * Create a new skill
 */
export async function createSkill(input: CreateSkillInput): Promise<Skill | null> {
  try {
    const response = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to create skill', { error: error.message });
      return null;
    }

    const skill = await response.json();
    logger.info('Skill created', { skillId: skill.id, name: skill.name });
    eventBus.emit('DATA_CHANGED');
    return skill;
  } catch (error) {
    logger.error('Error creating skill', { error });
    return null;
  }
}

/**
 * Update an existing skill
 */
export async function updateSkill(input: UpdateSkillInput): Promise<Skill | null> {
  try {
    const response = await fetch('/api/skills', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to update skill', { error: error.message });
      return null;
    }

    const skill = await response.json();
    logger.info('Skill updated', { skillId: skill.id });
    eventBus.emit('DATA_CHANGED');
    return skill;
  } catch (error) {
    logger.error('Error updating skill', { error });
    return null;
  }
}

/**
 * Delete a skill
 */
export async function deleteSkill(skillId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/skills?id=${skillId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to delete skill', { error: error.message });
      return false;
    }

    logger.info('Skill deleted', { skillId });
    eventBus.emit('DATA_CHANGED');
    return true;
  } catch (error) {
    logger.error('Error deleting skill', { error });
    return false;
  }
}

/**
 * Clear all skills for a profile (for re-onboarding)
 */
export async function clearSkillsForProfile(profileId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/skills?profileId=${profileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to clear skills', { error: error.message });
      return false;
    }

    logger.info('Cleared all skills for profile', { profileId });
    eventBus.emit('DATA_CHANGED');
    return true;
  } catch (error) {
    logger.error('Error clearing skills', { error });
    return false;
  }
}

/**
 * Bulk create skills (useful for migration from onboarding)
 * Clears existing skills first to prevent duplicates.
 *
 * Defensive coding: Continues processing even if individual skills fail.
 * Logs warnings for failed skills but doesn't crash the entire operation.
 */
export async function bulkCreateSkills(
  profileId: string,
  skills: Array<Omit<CreateSkillInput, 'profileId'>>,
  clearFirst = true
): Promise<Skill[]> {
  // Clear existing skills first to prevent orphaned data
  if (clearFirst) {
    await clearSkillsForProfile(profileId);
  }

  const created: Skill[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const skillInput of skills) {
    try {
      const skill = await createSkill({
        profileId,
        ...skillInput,
      });
      if (skill) {
        created.push(skill);
      } else {
        // createSkill returned null (API error already logged)
        failed.push({ name: skillInput.name, error: 'API returned null' });
      }
    } catch (error) {
      // Unexpected error - log and continue with other skills
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      failed.push({ name: skillInput.name, error: errorMsg });
      logger.error('Unexpected error creating skill', {
        skillName: skillInput.name,
        error: errorMsg,
      });
    }
  }

  // Log summary if any skills failed
  if (failed.length > 0) {
    logger.warn('bulkCreateSkills completed with errors', {
      total: skills.length,
      created: created.length,
      failed: failed.length,
      failedSkills: failed.map((f) => f.name),
    });
  } else {
    logger.info('bulkCreateSkills completed successfully', {
      total: skills.length,
      created: created.length,
    });
  }

  return created;
}

export const skillService = {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  clearSkillsForProfile,
  bulkCreateSkills,
};

export default skillService;
