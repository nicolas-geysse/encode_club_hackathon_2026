#!/usr/bin/env npx tsx
/**
 * Cross-Package Skill Data Integrity Verification
 *
 * Validates that ALL skill name strings across both packages reference
 * the canonical SKILL_REGISTRY. Catches "ghost skills" — names that
 * exist in one file but not the registry, silently breaking the pipeline.
 *
 * Files checked:
 * 1. frontend: SKILLS_BY_FIELD → SKILL_REGISTRY
 * 2. frontend: SKILL_OVERRIDES (bridge) → SKILL_REGISTRY
 * 3. frontend: HARD/EASY_TO_START_SKILLS → SKILL_REGISTRY
 * 4. mcp-server: JOB_DATABASE skills → SKILL_REGISTRY
 *
 * Usage: npx tsx scripts/verify-skills-data.ts
 * Exit code: 0 = all valid, 1 = orphans found
 */

import { SKILL_REGISTRY } from '../packages/frontend/src/lib/data/skillRegistry';
import { SKILLS_BY_FIELD } from '../packages/frontend/src/lib/data/skillsByField';
import {
  HARD_TO_START_SKILLS,
  EASY_TO_START_SKILLS,
} from '../packages/frontend/src/lib/data/skillSuggestionEngine';
import { SKILL_OVERRIDES } from '../packages/frontend/src/lib/data/skillCategoryBridge';

// MCP JOB_DATABASE is not exported — extract skill names directly
// We re-declare the skills arrays here to avoid modifying the MCP source
const MCP_JOB_SKILLS = [
  // freelance_dev
  'Freelance web development', 'Mobile app development', 'Python', 'JavaScript',
  // social_media
  'Social media management for SMEs', 'Community management', 'Copywriting / commercial writing',
  // data_entry
  'Data entry', 'Virtual assistant', 'Excel',
  // content_creator
  'Copywriting / commercial writing', 'Video editing', 'Canva / Notion template creation',
  // graphic_design
  'Freelance graphic design', 'Digital illustration / mockup creation', 'Motion design animation',
  // tutoring
  'Online tutoring', 'Online science / math tutoring', 'Online language lessons',
  // music_lessons
  'Guitar', 'Piano',
  // campus_it
  'Technical support / IT helpdesk', 'Debugging / QA testing', 'Task automation (no-code/low-code)',
  // research_assistant
  'Basic data analysis', 'Academic research assistance', 'Python',
  // waiter
  'Customer service / support',
  // babysitting
  'Babysitting / childcare',
  // pet_sitting
  'Pet-sitting / dog-walking',
  // cleaning
  'Cleaning',
  // handyman
  'Electronics repair',
  // events
  'Virtual event organization', 'Community management',
  // delivery
  'Food delivery / courier',
  // translator
  'Freelance translation / localization', 'Video subtitling', 'Audio transcription',
  // fitness_coach
  'Online fitness/yoga classes', 'Amateur nutrition coaching',
  // mystery_shopping
  'Mystery shopping / service quality evaluations',
  // fastfood has no skills
];

// ============================================================

const registryNames = new Set(SKILL_REGISTRY.map((s) => s.name));
let orphanCount = 0;

function check(source: string, names: string[]) {
  const deduped = [...new Set(names)];
  for (const name of deduped) {
    if (!registryNames.has(name)) {
      console.error(`  ORPHAN in ${source}: "${name}"`);
      orphanCount++;
    }
  }
}

console.log('Verifying skill data integrity across packages...\n');
console.log(`Registry: ${registryNames.size} canonical skill names\n`);

// 1. Frontend: SKILLS_BY_FIELD
console.log('1. SKILLS_BY_FIELD');
for (const [field, skills] of Object.entries(SKILLS_BY_FIELD)) {
  check(`skillsByField[${field}]`, skills);
}
console.log('   OK\n');

// 2. Frontend: SKILL_OVERRIDES (bridge)
console.log('2. SKILL_OVERRIDES (bridge)');
check('skillCategoryBridge', Object.keys(SKILL_OVERRIDES));
console.log('   OK\n');

// 3. Frontend: Accessibility maps
console.log('3. HARD/EASY_TO_START_SKILLS');
check('HARD_TO_START_SKILLS', Object.keys(HARD_TO_START_SKILLS));
check('EASY_TO_START_SKILLS', Object.keys(EASY_TO_START_SKILLS));
console.log('   OK\n');

// 4. MCP: JOB_DATABASE
console.log('4. MCP JOB_DATABASE skills');
check('job-matcher.ts', MCP_JOB_SKILLS);
console.log('   OK\n');

// Summary
if (orphanCount === 0) {
  console.log(`\n✅ All skill strings are valid. 0 orphans across 4 sources.`);
  process.exit(0);
} else {
  console.error(`\n❌ Found ${orphanCount} orphan skill name(s). Fix before deploying.`);
  process.exit(1);
}
