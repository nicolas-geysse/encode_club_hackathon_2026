/**
 * Skill Service
 *
 * Frontend service for skill management with DuckDB persistence.
 * Skills are stored in a dedicated table (not embedded in profiles)
 * for clean architecture, Opik traceability, and query flexibility.
 */

import { createLogger } from './logger';

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
    return true;
  } catch (error) {
    logger.error('Error deleting skill', { error });
    return false;
  }
}

/**
 * Bulk create skills (useful for migration from onboarding)
 */
export async function bulkCreateSkills(
  profileId: string,
  skills: Array<Omit<CreateSkillInput, 'profileId'>>
): Promise<Skill[]> {
  const created: Skill[] = [];

  for (const skillInput of skills) {
    const skill = await createSkill({
      profileId,
      ...skillInput,
    });
    if (skill) {
      created.push(skill);
    }
  }

  return created;
}

export const skillService = {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  bulkCreateSkills,
};

export default skillService;
