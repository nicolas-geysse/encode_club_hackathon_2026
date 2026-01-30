/**
 * Skills by Field of Study
 *
 * Static mapping of monetizable skills per academic domain.
 * Used for suggesting relevant skills during onboarding based on user's field of study.
 *
 * Data sourced from docs/architecture/skills.md
 * Field connections from docs/architecture/skills-kg.md
 */

// =============================================================================
// Skills by Field of Study
// =============================================================================

/**
 * Monetizable skills organized by field of study.
 * Keys match FIELD_OF_STUDY_OPTIONS values from stepForms.ts
 */
export const SKILLS_BY_FIELD: Record<string, string[]> = {
  agriculture: [
    'Urban gardening / permaculture consulting',
    'Nature / wildlife photography',
    'Environmental content writing',
    'Pet-sitting / dog-walking',
    'TikTok/YouTube eco content creation',
    'Social media management for organic/local brands',
  ],

  arts: [
    'Freelance graphic design',
    'Digital illustration / mockup creation',
    'Video editing',
    'Event photography',
    'Motion design animation',
    'Canva / Notion template creation',
    'Voice-over / narration',
  ],

  business: [
    'Social media management for SMEs',
    'Copywriting / commercial writing',
    'Micro-business consulting',
    'Virtual assistant',
    'Lead generation / B2B prospecting',
    'Quick competitive analysis',
    'Community management',
  ],

  computer_science: [
    'Freelance web development',
    'Mobile app development',
    'Debugging / QA testing',
    'Task automation (no-code/low-code)',
    'Technical support / IT helpdesk',
    'Chatbot creation',
    'Data labeling / AI annotation',
    'Junior cybersecurity',
  ],

  education: [
    'Online tutoring',
    'Online course creation',
    'Academic proofreading / editing',
    'Academic guidance coaching',
    'Workshop / webinar facilitation',
    'Educational materials translation',
  ],

  engineering: [
    '3D modeling / CAD',
    'On-demand 3D printing',
    'Electronics repair',
    'IoT / Arduino projects development',
    'Technical writing',
    'CAD/CAM support',
    'Smart home energy optimization',
  ],

  health: [
    'Medical transcription',
    'Health / wellness content writing',
    'Amateur nutrition coaching',
    'Online fitness/yoga classes',
    'Medical office admin support',
    'Medical document translation',
    'Social media content for health professionals',
  ],

  humanities: [
    'Freelance translation / localization',
    'Online language lessons',
    'Cultural content writing',
    'Video subtitling',
    'Audio transcription',
    'Documentary research / fact-checking',
    'Local tour guide / virtual tours',
  ],

  sciences: [
    'Online science / math tutoring',
    'Basic data analysis',
    'Popular science content creation',
    'Data entry and cleaning',
    'Academic research assistance',
    'Scientific proofreading',
    'Online simulator/calculator creation',
  ],

  services: [
    'Virtual event organization',
    'Custom travel itinerary creation',
    'Airbnb management / short-term concierge',
    'Travel reviews / content writing',
    'Food photography',
    'Mystery shopping / service quality evaluations',
    'Menu / tourism materials translation',
  ],

  social_sciences: [
    'Online community moderation',
    'UX research / user testing',
    'Psychology / personal development content writing',
    'Qualitative interview transcription',
    'Student / productivity coaching',
    'Support group / peer-to-peer support facilitation',
    'Surveys and field studies',
  ],

  other: [
    'General virtual assistant',
    'Data entry',
    'Content moderation',
    'Customer service / support',
    'Paid user testing',
    'Online micro-tasks',
    'Food delivery / courier',
    'Babysitting / childcare',
  ],
};

// =============================================================================
// Field Connections (Knowledge Graph)
// =============================================================================

/**
 * Connections between fields of study.
 * Strong connections = highly transferable skills, frequent collaboration.
 * Medium connections = partially transferable skills, occasional collaboration.
 *
 * Data sourced from docs/architecture/skills-kg.md
 */
export const FIELD_CONNECTIONS: Record<string, { strong: string[]; medium: string[] }> = {
  computer_science: {
    strong: ['business', 'arts', 'engineering', 'sciences'],
    medium: ['health', 'social_sciences', 'education'],
  },

  business: {
    strong: ['computer_science', 'social_sciences'],
    medium: ['arts', 'engineering', 'services', 'health'],
  },

  arts: {
    strong: ['computer_science', 'humanities'],
    medium: ['business', 'social_sciences', 'education'],
  },

  engineering: {
    strong: ['computer_science', 'sciences'],
    medium: ['business', 'health', 'agriculture'],
  },

  sciences: {
    strong: ['computer_science', 'engineering', 'health'],
    medium: ['agriculture', 'social_sciences'],
  },

  health: {
    strong: ['sciences'],
    medium: ['computer_science', 'engineering', 'social_sciences', 'business'],
  },

  social_sciences: {
    strong: ['business', 'humanities'],
    medium: ['computer_science', 'health', 'education', 'arts'],
  },

  humanities: {
    strong: ['arts', 'social_sciences'],
    medium: ['education', 'business'],
  },

  education: {
    strong: ['social_sciences'],
    medium: ['computer_science', 'humanities', 'arts', 'sciences'],
  },

  agriculture: {
    strong: ['sciences'],
    medium: ['engineering', 'health'],
  },

  services: {
    strong: [],
    medium: ['business', 'arts', 'humanities'],
  },

  other: {
    strong: [],
    medium: [],
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get skill suggestions based on user's field of study.
 * Returns primary skills for the field + top skills from connected fields.
 *
 * @param field - The user's field of study (matches FIELD_OF_STUDY_OPTIONS values)
 * @returns Array of suggested skill names
 */
export function getSkillSuggestions(field: string | undefined): string[] {
  // Fallback to all skills if no field or 'other'
  if (!field || field === 'other') {
    return getAllSkills();
  }

  const primary = SKILLS_BY_FIELD[field] || [];
  const connections = FIELD_CONNECTIONS[field];

  // If no connections defined, return just primary skills
  if (!connections) {
    return primary;
  }

  const suggestions = [...primary];

  // Add top 2 skills from strongly connected fields
  for (const connectedField of connections.strong) {
    const connectedSkills = SKILLS_BY_FIELD[connectedField] || [];
    suggestions.push(...connectedSkills.slice(0, 2));
  }

  // Add top 1 skill from medium connected fields
  for (const connectedField of connections.medium) {
    const connectedSkills = SKILLS_BY_FIELD[connectedField] || [];
    if (connectedSkills.length > 0) {
      suggestions.push(connectedSkills[0]);
    }
  }

  // Deduplicate and return
  return [...new Set(suggestions)];
}

/**
 * Get all available skills across all fields.
 * Used as fallback when field is unknown or 'other'.
 *
 * @returns Array of all skill names (deduplicated)
 */
export function getAllSkills(): string[] {
  const allSkills = Object.values(SKILLS_BY_FIELD).flat();
  return [...new Set(allSkills)];
}

/**
 * Get skills for a specific field only (no connected fields).
 * Useful for displaying field-specific skills in UI.
 *
 * @param field - The field of study
 * @returns Array of skills for that field only
 */
export function getFieldSkills(field: string): string[] {
  return SKILLS_BY_FIELD[field] || [];
}

/**
 * Check if a skill belongs to a specific field.
 *
 * @param skill - The skill name to check
 * @param field - The field of study
 * @returns True if the skill is in that field's list
 */
export function isSkillInField(skill: string, field: string): boolean {
  const fieldSkills = SKILLS_BY_FIELD[field] || [];
  return fieldSkills.some((s) => s.toLowerCase() === skill.toLowerCase());
}
