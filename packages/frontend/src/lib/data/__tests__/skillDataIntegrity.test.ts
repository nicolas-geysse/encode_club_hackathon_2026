/**
 * Skill Data Integrity Tests
 *
 * Prevents orphan skill names from silently breaking the pipeline.
 * Validates string matching across ALL files that reference skill names:
 *
 * 1. SKILLS_BY_FIELD → SKILL_REGISTRY
 * 2. HARD/EASY_TO_START_SKILLS → SKILL_REGISTRY
 * 3. SKILL_OVERRIDES (bridge) → SKILL_REGISTRY
 * 4. CATEGORY_BRIDGE → valid prospection category IDs
 * 5. FIELD_CONNECTIONS → valid field keys
 *
 * A single typo in any of these files silently breaks the skill→job pipeline.
 */

import { describe, it, expect } from 'vitest';
import { SKILL_REGISTRY } from '../skillRegistry';
import { SKILLS_BY_FIELD, FIELD_CONNECTIONS } from '../skillsByField';
import { HARD_TO_START_SKILLS, EASY_TO_START_SKILLS } from '../skillSuggestionEngine';
import { SKILL_OVERRIDES, CATEGORY_BRIDGE } from '../skillCategoryBridge';
import { PROSPECTION_CATEGORIES } from '../../../config/prospectionCategories';

// Build lookup sets once
const registryNames = new Set(SKILL_REGISTRY.map((s) => s.name));
const fieldKeys = new Set(Object.keys(SKILLS_BY_FIELD));
const validProspectionIds = new Set(PROSPECTION_CATEGORIES.map((c) => c.id));

describe('SKILLS_BY_FIELD → SKILL_REGISTRY', () => {
  for (const [field, skills] of Object.entries(SKILLS_BY_FIELD)) {
    for (const skill of skills) {
      it(`"${skill}" (${field}) exists in SKILL_REGISTRY`, () => {
        expect(registryNames.has(skill)).toBe(true);
      });
    }
  }
});

describe('SKILLS_BY_FIELD has no intra-field duplicates', () => {
  for (const [field, skills] of Object.entries(SKILLS_BY_FIELD)) {
    it(`${field} has no duplicate skill names`, () => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const skill of skills) {
        if (seen.has(skill)) dupes.push(skill);
        seen.add(skill);
      }
      expect(dupes).toEqual([]);
    });
  }
});

describe('SKILL_REGISTRY field references are valid', () => {
  for (const skill of SKILL_REGISTRY) {
    for (const field of skill.fields) {
      it(`${skill.name} references valid field "${field}"`, () => {
        expect(fieldKeys.has(field)).toBe(true);
      });
    }
  }
});

describe('FIELD_CONNECTIONS reference valid fields', () => {
  for (const [field, connections] of Object.entries(FIELD_CONNECTIONS)) {
    it(`${field} is a valid field key`, () => {
      expect(fieldKeys.has(field)).toBe(true);
    });
    for (const strong of connections.strong) {
      it(`${field} strong connection "${strong}" is valid`, () => {
        expect(fieldKeys.has(strong)).toBe(true);
      });
    }
    for (const medium of connections.medium) {
      it(`${field} medium connection "${medium}" is valid`, () => {
        expect(fieldKeys.has(medium)).toBe(true);
      });
    }
  }
});

describe('Accessibility maps reference valid skills', () => {
  for (const skillName of Object.keys(HARD_TO_START_SKILLS)) {
    it(`HARD_TO_START: "${skillName}" exists in SKILL_REGISTRY`, () => {
      expect(registryNames.has(skillName)).toBe(true);
    });
  }
  for (const skillName of Object.keys(EASY_TO_START_SKILLS)) {
    it(`EASY_TO_START: "${skillName}" exists in SKILL_REGISTRY`, () => {
      expect(registryNames.has(skillName)).toBe(true);
    });
  }
});

// =========================================================================
// Phase 8: Cross-file bridge integrity
// =========================================================================

describe('SKILL_OVERRIDES (bridge) → SKILL_REGISTRY', () => {
  for (const skillName of Object.keys(SKILL_OVERRIDES)) {
    it(`SKILL_OVERRIDE: "${skillName}" exists in SKILL_REGISTRY`, () => {
      expect(registryNames.has(skillName)).toBe(true);
    });
  }
});

describe('SKILL_OVERRIDES → valid prospection category IDs', () => {
  for (const [skillName, categories] of Object.entries(SKILL_OVERRIDES)) {
    for (const catId of categories) {
      it(`"${skillName}" maps to valid category "${catId}"`, () => {
        expect(validProspectionIds.has(catId)).toBe(true);
      });
    }
  }
});

describe('CATEGORY_BRIDGE → valid prospection category IDs', () => {
  for (const [skillCategory, categories] of Object.entries(CATEGORY_BRIDGE)) {
    for (const catId of categories) {
      it(`${skillCategory} maps to valid category "${catId}"`, () => {
        expect(validProspectionIds.has(catId)).toBe(true);
      });
    }
  }
});
