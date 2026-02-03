/**
 * Unified Skill Registry
 *
 * Single Source of Truth for all skills in the application.
 * Merges skills from:
 * - skillsByField.ts (onboarding suggestions by field of study)
 * - SKILL_TEMPLATES (SkillsTab quick-add)
 *
 * Each skill has complete attributes for arbitrage scoring:
 * - marketDemand (1-5): How in-demand is this skill?
 * - cognitiveEffort (1-5): How mentally demanding?
 * - restNeeded (0-4): Hours of rest needed after work
 * - defaultHourlyRate: Suggested hourly rate in EUR
 *
 * Created as part of Phase 1: Onboarding→Skills integration sprint.
 */

// =============================================================================
// Types
// =============================================================================

export interface SkillDefinition {
  /** Unique identifier (lowercase, underscored) */
  id: string;
  /** Display name */
  name: string;
  /** Alternative names for matching */
  aliases?: string[];
  /** Default hourly rate in EUR */
  defaultHourlyRate: number;
  /** Market demand (1=low, 5=high) */
  marketDemand: 1 | 2 | 3 | 4 | 5;
  /** Cognitive effort required (1=low, 5=high) */
  cognitiveEffort: 1 | 2 | 3 | 4 | 5;
  /** Rest needed after work in hours (0-4) */
  restNeeded: number;
  /** Fields of study where this skill is relevant */
  fields: string[];
  /** Category for grouping */
  category: SkillCategory;
}

export type SkillCategory =
  | 'tech'
  | 'creative'
  | 'teaching'
  | 'writing'
  | 'services'
  | 'physical'
  | 'business'
  | 'health'
  | 'other';

// =============================================================================
// Skill Registry
// =============================================================================

/**
 * Complete skill registry with all attributes.
 * Skills are organized by category for easier maintenance.
 */
export const SKILL_REGISTRY: SkillDefinition[] = [
  // ---------------------------------------------------------------------------
  // TECH SKILLS
  // ---------------------------------------------------------------------------
  {
    id: 'python',
    name: 'Python',
    aliases: ['Python Freelance', 'Python Programming'],
    defaultHourlyRate: 25,
    marketDemand: 5,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['computer_science', 'sciences', 'engineering'],
    category: 'tech',
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    aliases: ['JS', 'Frontend Development'],
    defaultHourlyRate: 23,
    marketDemand: 5,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['computer_science'],
    category: 'tech',
  },
  {
    id: 'sql_coaching',
    name: 'SQL Coaching',
    aliases: ['SQL', 'Database'],
    defaultHourlyRate: 22,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['computer_science', 'business'],
    category: 'tech',
  },
  {
    id: 'web_development',
    name: 'Freelance web development',
    aliases: ['Web Development', 'Web Dev', 'Frontend', 'Full Stack'],
    defaultHourlyRate: 25,
    marketDemand: 5,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['computer_science'],
    category: 'tech',
  },
  {
    id: 'mobile_app_development',
    name: 'Mobile app development',
    aliases: ['Mobile Dev', 'iOS', 'Android', 'React Native', 'Flutter'],
    defaultHourlyRate: 28,
    marketDemand: 5,
    cognitiveEffort: 5,
    restNeeded: 2,
    fields: ['computer_science'],
    category: 'tech',
  },
  {
    id: 'debugging_qa',
    name: 'Debugging / QA testing',
    aliases: ['QA', 'Testing', 'Quality Assurance'],
    defaultHourlyRate: 20,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['computer_science'],
    category: 'tech',
  },
  {
    id: 'automation',
    name: 'Task automation (no-code/low-code)',
    aliases: ['Automation', 'No-code', 'Zapier', 'Make'],
    defaultHourlyRate: 22,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['computer_science', 'business'],
    category: 'tech',
  },
  {
    id: 'tech_support',
    name: 'Technical support / IT helpdesk',
    aliases: ['IT Support', 'Helpdesk', 'Tech Support'],
    defaultHourlyRate: 18,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['computer_science'],
    category: 'tech',
  },
  {
    id: 'chatbot_creation',
    name: 'Chatbot creation',
    aliases: ['Chatbot', 'Conversational AI'],
    defaultHourlyRate: 25,
    marketDemand: 4,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['computer_science'],
    category: 'tech',
  },
  {
    id: 'data_labeling',
    name: 'Data labeling / AI annotation',
    aliases: ['Data Annotation', 'AI Training Data'],
    defaultHourlyRate: 15,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['computer_science', 'sciences'],
    category: 'tech',
  },
  {
    id: 'cybersecurity',
    name: 'Junior cybersecurity',
    aliases: ['Cybersecurity', 'Security'],
    defaultHourlyRate: 28,
    marketDemand: 5,
    cognitiveEffort: 5,
    restNeeded: 2,
    fields: ['computer_science'],
    category: 'tech',
  },
  {
    id: 'cad_modeling',
    name: '3D modeling / CAD',
    aliases: ['CAD', '3D Modeling', 'SolidWorks', 'AutoCAD'],
    defaultHourlyRate: 25,
    marketDemand: 4,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['engineering', 'arts'],
    category: 'tech',
  },
  {
    id: '3d_printing',
    name: 'On-demand 3D printing',
    aliases: ['3D Printing'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['engineering'],
    category: 'tech',
  },
  {
    id: 'electronics_repair',
    name: 'Electronics repair',
    aliases: ['Electronics', 'Repair'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['engineering'],
    category: 'tech',
  },
  {
    id: 'iot_projects',
    name: 'IoT / Arduino projects development',
    aliases: ['IoT', 'Arduino', 'Raspberry Pi'],
    defaultHourlyRate: 25,
    marketDemand: 4,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['engineering', 'computer_science'],
    category: 'tech',
  },
  {
    id: 'smart_home',
    name: 'Smart home energy optimization',
    aliases: ['Smart Home', 'Home Automation'],
    defaultHourlyRate: 25,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['engineering'],
    category: 'tech',
  },
  {
    id: 'excel',
    name: 'Excel',
    aliases: ['Microsoft Excel', 'Spreadsheets', 'Google Sheets'],
    defaultHourlyRate: 18,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['business', 'sciences'],
    category: 'tech',
  },
  {
    id: 'data_analysis',
    name: 'Basic data analysis',
    aliases: ['Data Analysis', 'Analytics'],
    defaultHourlyRate: 22,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['sciences', 'business', 'computer_science'],
    category: 'tech',
  },

  // ---------------------------------------------------------------------------
  // CREATIVE SKILLS
  // ---------------------------------------------------------------------------
  {
    id: 'graphic_design',
    name: 'Freelance graphic design',
    aliases: ['Graphic Design', 'Design', 'Visual Design'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['arts'],
    category: 'creative',
  },
  {
    id: 'digital_illustration',
    name: 'Digital illustration / mockup creation',
    aliases: ['Illustration', 'Digital Art', 'Mockups'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['arts'],
    category: 'creative',
  },
  {
    id: 'video_editing',
    name: 'Video editing',
    aliases: ['Video Editing', 'Video Production', 'Premiere', 'Final Cut'],
    defaultHourlyRate: 22,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 2,
    fields: ['arts', 'computer_science'],
    category: 'creative',
  },
  {
    id: 'event_photography',
    name: 'Event photography',
    aliases: ['Photography', 'Photo'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['arts', 'services'],
    category: 'creative',
  },
  {
    id: 'motion_design',
    name: 'Motion design animation',
    aliases: ['Motion Design', 'Animation', 'After Effects'],
    defaultHourlyRate: 25,
    marketDemand: 4,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['arts'],
    category: 'creative',
  },
  {
    id: 'template_creation',
    name: 'Canva / Notion template creation',
    aliases: ['Canva', 'Notion Templates', 'Template Design'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['arts', 'business'],
    category: 'creative',
  },
  {
    id: 'voiceover',
    name: 'Voice-over / narration',
    aliases: ['Voice Over', 'Narration', 'Voice Acting'],
    defaultHourlyRate: 25,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['arts', 'humanities'],
    category: 'creative',
  },
  {
    id: 'nature_photography',
    name: 'Nature / wildlife photography',
    aliases: ['Wildlife Photography', 'Nature Photos'],
    defaultHourlyRate: 20,
    marketDemand: 2,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['agriculture', 'arts'],
    category: 'creative',
  },
  {
    id: 'food_photography',
    name: 'Food photography',
    aliases: ['Food Photos'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['services', 'arts'],
    category: 'creative',
  },
  {
    id: 'guitar',
    name: 'Guitar',
    aliases: ['Guitar Lessons', 'Guitar Teaching'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['arts', 'education'],
    category: 'creative',
  },
  {
    id: 'piano',
    name: 'Piano',
    aliases: ['Piano Lessons', 'Piano Teaching'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['arts', 'education'],
    category: 'creative',
  },
  {
    id: 'music',
    name: 'Music',
    aliases: ['Music Lessons', 'Music Production'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['arts'],
    category: 'creative',
  },

  // ---------------------------------------------------------------------------
  // TEACHING SKILLS
  // ---------------------------------------------------------------------------
  {
    id: 'tutoring',
    name: 'Online tutoring',
    aliases: ['Tutoring', 'Teaching', 'Academic Tutoring'],
    defaultHourlyRate: 20,
    marketDemand: 5,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['education', 'sciences', 'humanities'],
    category: 'teaching',
  },
  {
    id: 'course_creation',
    name: 'Online course creation',
    aliases: ['Course Creation', 'E-learning'],
    defaultHourlyRate: 25,
    marketDemand: 4,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['education'],
    category: 'teaching',
  },
  {
    id: 'academic_coaching',
    name: 'Academic guidance coaching',
    aliases: ['Academic Coaching', 'Study Coaching'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['education', 'social_sciences'],
    category: 'teaching',
  },
  {
    id: 'workshop_facilitation',
    name: 'Workshop / webinar facilitation',
    aliases: ['Workshop', 'Webinar', 'Facilitation'],
    defaultHourlyRate: 25,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['education', 'business'],
    category: 'teaching',
  },
  {
    id: 'language_lessons',
    name: 'Online language lessons',
    aliases: ['Language Teaching', 'Language Tutoring'],
    defaultHourlyRate: 20,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['humanities', 'education'],
    category: 'teaching',
  },
  {
    id: 'science_tutoring',
    name: 'Online science / math tutoring',
    aliases: ['Math Tutoring', 'Science Tutoring', 'STEM Tutoring'],
    defaultHourlyRate: 22,
    marketDemand: 5,
    cognitiveEffort: 4,
    restNeeded: 1,
    fields: ['sciences', 'education'],
    category: 'teaching',
  },
  {
    id: 'fitness_classes',
    name: 'Online fitness/yoga classes',
    aliases: ['Fitness', 'Yoga', 'Online Fitness'],
    defaultHourlyRate: 20,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 2,
    fields: ['health'],
    category: 'teaching',
  },
  {
    id: 'productivity_coaching',
    name: 'Student / productivity coaching',
    aliases: ['Productivity Coaching', 'Life Coaching'],
    defaultHourlyRate: 25,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['social_sciences', 'education'],
    category: 'teaching',
  },

  // ---------------------------------------------------------------------------
  // WRITING & TRANSLATION
  // ---------------------------------------------------------------------------
  {
    id: 'english_translation',
    name: 'Freelance translation / localization',
    aliases: ['English Translation', 'Translation', 'Localization'],
    defaultHourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 0.5,
    fields: ['humanities'],
    category: 'writing',
  },
  {
    id: 'copywriting',
    name: 'Copywriting / commercial writing',
    aliases: ['Copywriting', 'Commercial Writing', 'Ad Copy'],
    defaultHourlyRate: 20,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['business', 'arts'],
    category: 'writing',
  },
  {
    id: 'web_writing',
    name: 'Web Writing',
    aliases: ['Content Writing', 'Blog Writing', 'SEO Writing'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['business', 'humanities'],
    category: 'writing',
  },
  {
    id: 'environmental_writing',
    name: 'Environmental content writing',
    aliases: ['Eco Writing', 'Green Content'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['agriculture', 'sciences'],
    category: 'writing',
  },
  {
    id: 'health_writing',
    name: 'Health / wellness content writing',
    aliases: ['Health Writing', 'Wellness Content'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['health'],
    category: 'writing',
  },
  {
    id: 'technical_writing',
    name: 'Technical writing',
    aliases: ['Tech Writing', 'Documentation'],
    defaultHourlyRate: 25,
    marketDemand: 4,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['engineering', 'computer_science'],
    category: 'writing',
  },
  {
    id: 'cultural_writing',
    name: 'Cultural content writing',
    aliases: ['Cultural Writing', 'Arts Writing'],
    defaultHourlyRate: 18,
    marketDemand: 2,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['humanities', 'arts'],
    category: 'writing',
  },
  {
    id: 'psychology_writing',
    name: 'Psychology / personal development content writing',
    aliases: ['Psychology Writing', 'Self-help Writing'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['social_sciences'],
    category: 'writing',
  },
  {
    id: 'science_writing',
    name: 'Popular science content creation',
    aliases: ['Science Writing', 'Science Communication'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 4,
    restNeeded: 1,
    fields: ['sciences'],
    category: 'writing',
  },
  {
    id: 'academic_proofreading',
    name: 'Academic proofreading / editing',
    aliases: ['Proofreading', 'Editing', 'Academic Editing'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['education', 'humanities'],
    category: 'writing',
  },
  {
    id: 'scientific_proofreading',
    name: 'Scientific proofreading',
    aliases: ['Scientific Editing'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 4,
    restNeeded: 1,
    fields: ['sciences'],
    category: 'writing',
  },
  {
    id: 'medical_transcription',
    name: 'Medical transcription',
    aliases: ['Medical Typing'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['health'],
    category: 'writing',
  },
  {
    id: 'audio_transcription',
    name: 'Audio transcription',
    aliases: ['Transcription'],
    defaultHourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['humanities', 'social_sciences'],
    category: 'writing',
  },
  {
    id: 'video_subtitling',
    name: 'Video subtitling',
    aliases: ['Subtitling', 'Captions'],
    defaultHourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['humanities', 'arts'],
    category: 'writing',
  },
  {
    id: 'travel_writing',
    name: 'Travel reviews / content writing',
    aliases: ['Travel Writing', 'Travel Content'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['services', 'humanities'],
    category: 'writing',
  },

  // ---------------------------------------------------------------------------
  // BUSINESS & MARKETING
  // ---------------------------------------------------------------------------
  {
    id: 'social_media',
    name: 'Social media management for SMEs',
    aliases: ['Social Media', 'Social Media Management', 'SMM'],
    defaultHourlyRate: 16,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['business', 'arts'],
    category: 'business',
  },
  {
    id: 'community_management',
    name: 'Community management',
    aliases: ['Community Manager', 'Online Communities'],
    defaultHourlyRate: 18,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['business', 'social_sciences'],
    category: 'business',
  },
  {
    id: 'virtual_assistant',
    name: 'Virtual assistant',
    aliases: ['VA', 'Admin Assistant', 'General virtual assistant'],
    defaultHourlyRate: 15,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['business', 'other'],
    category: 'business',
  },
  {
    id: 'lead_generation',
    name: 'Lead generation / B2B prospecting',
    aliases: ['Lead Gen', 'Prospecting', 'Sales'],
    defaultHourlyRate: 20,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['business'],
    category: 'business',
  },
  {
    id: 'competitive_analysis',
    name: 'Quick competitive analysis',
    aliases: ['Competitor Analysis', 'Market Research'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['business'],
    category: 'business',
  },
  {
    id: 'micro_consulting',
    name: 'Micro-business consulting',
    aliases: ['Business Consulting', 'Startup Consulting'],
    defaultHourlyRate: 30,
    marketDemand: 3,
    cognitiveEffort: 4,
    restNeeded: 1,
    fields: ['business'],
    category: 'business',
  },
  {
    id: 'eco_social_media',
    name: 'Social media management for organic/local brands',
    aliases: ['Eco Marketing', 'Green Marketing'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['agriculture', 'business'],
    category: 'business',
  },
  {
    id: 'health_social_media',
    name: 'Social media content for health professionals',
    aliases: ['Healthcare Marketing'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['health', 'business'],
    category: 'business',
  },
  {
    id: 'tiktok_youtube',
    name: 'TikTok/YouTube eco content creation',
    aliases: ['TikTok', 'YouTube', 'Content Creation'],
    defaultHourlyRate: 20,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['agriculture', 'arts'],
    category: 'business',
  },
  {
    id: 'ux_research',
    name: 'UX research / user testing',
    aliases: ['UX Research', 'User Testing', 'Usability'],
    defaultHourlyRate: 25,
    marketDemand: 4,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['social_sciences', 'computer_science'],
    category: 'business',
  },

  // ---------------------------------------------------------------------------
  // SERVICES
  // ---------------------------------------------------------------------------
  {
    id: 'data_entry',
    name: 'Data entry',
    aliases: ['Data Entry', 'Data Input'],
    defaultHourlyRate: 12,
    marketDemand: 4,
    cognitiveEffort: 1,
    restNeeded: 0.5,
    fields: ['other', 'business'],
    category: 'services',
  },
  {
    id: 'content_moderation',
    name: 'Content moderation',
    aliases: ['Moderation', 'Online Moderation'],
    defaultHourlyRate: 14,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['other', 'social_sciences'],
    category: 'services',
  },
  {
    id: 'customer_service',
    name: 'Customer service / support',
    aliases: ['Customer Support', 'Help Desk'],
    defaultHourlyRate: 14,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['other', 'business'],
    category: 'services',
  },
  {
    id: 'user_testing',
    name: 'Paid user testing',
    aliases: ['User Testing', 'Beta Testing'],
    defaultHourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 1,
    restNeeded: 0.5,
    fields: ['other'],
    category: 'services',
  },
  {
    id: 'micro_tasks',
    name: 'Online micro-tasks',
    aliases: ['Micro Tasks', 'Crowdsourcing'],
    defaultHourlyRate: 10,
    marketDemand: 3,
    cognitiveEffort: 1,
    restNeeded: 0.5,
    fields: ['other'],
    category: 'services',
  },
  {
    id: 'event_organization',
    name: 'Virtual event organization',
    aliases: ['Event Planning', 'Virtual Events'],
    defaultHourlyRate: 22,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['services', 'business'],
    category: 'services',
  },
  {
    id: 'travel_itinerary',
    name: 'Custom travel itinerary creation',
    aliases: ['Travel Planning', 'Trip Planning'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['services'],
    category: 'services',
  },
  {
    id: 'airbnb_management',
    name: 'Airbnb management / short-term concierge',
    aliases: ['Airbnb', 'Property Management'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['services'],
    category: 'services',
  },
  {
    id: 'mystery_shopping',
    name: 'Mystery shopping / service quality evaluations',
    aliases: ['Mystery Shopping', 'Secret Shopper'],
    defaultHourlyRate: 15,
    marketDemand: 2,
    cognitiveEffort: 1,
    restNeeded: 0.5,
    fields: ['services'],
    category: 'services',
  },
  {
    id: 'tour_guide',
    name: 'Local tour guide / virtual tours',
    aliases: ['Tour Guide', 'Virtual Tours'],
    defaultHourlyRate: 20,
    marketDemand: 2,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['humanities', 'services'],
    category: 'services',
  },
  {
    id: 'research_assistance',
    name: 'Academic research assistance',
    aliases: ['Research Assistant', 'Research Help'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['sciences', 'humanities'],
    category: 'services',
  },
  {
    id: 'fact_checking',
    name: 'Documentary research / fact-checking',
    aliases: ['Fact Checking', 'Research'],
    defaultHourlyRate: 18,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['humanities'],
    category: 'services',
  },
  {
    id: 'surveys',
    name: 'Surveys and field studies',
    aliases: ['Survey Research', 'Field Research'],
    defaultHourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['social_sciences'],
    category: 'services',
  },
  {
    id: 'medical_admin',
    name: 'Medical office admin support',
    aliases: ['Medical Admin', 'Healthcare Admin'],
    defaultHourlyRate: 16,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['health'],
    category: 'services',
  },
  {
    id: 'nutrition_coaching',
    name: 'Amateur nutrition coaching',
    aliases: ['Nutrition Coach', 'Diet Advice'],
    defaultHourlyRate: 20,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['health'],
    category: 'services',
  },
  {
    id: 'support_groups',
    name: 'Support group / peer-to-peer support facilitation',
    aliases: ['Support Groups', 'Peer Support'],
    defaultHourlyRate: 18,
    marketDemand: 2,
    cognitiveEffort: 3,
    restNeeded: 1,
    fields: ['social_sciences', 'health'],
    category: 'services',
  },
  {
    id: 'interview_transcription',
    name: 'Qualitative interview transcription',
    aliases: ['Interview Transcription'],
    defaultHourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['social_sciences'],
    category: 'services',
  },
  {
    id: 'online_simulator',
    name: 'Online simulator/calculator creation',
    aliases: ['Calculator Creation', 'Web Tools'],
    defaultHourlyRate: 25,
    marketDemand: 2,
    cognitiveEffort: 4,
    restNeeded: 2,
    fields: ['sciences', 'computer_science'],
    category: 'services',
  },

  // ---------------------------------------------------------------------------
  // PHYSICAL / LOCAL SERVICES
  // ---------------------------------------------------------------------------
  {
    id: 'babysitting',
    name: 'Babysitting / childcare',
    aliases: ['Babysitting', 'Childcare', 'Nanny'],
    defaultHourlyRate: 12,
    marketDemand: 5,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['other', 'education'],
    category: 'physical',
  },
  {
    id: 'pet_sitting',
    name: 'Pet-sitting / dog-walking',
    aliases: ['Pet Sitting', 'Dog Walking', 'Pet Care'],
    defaultHourlyRate: 12,
    marketDemand: 4,
    cognitiveEffort: 1,
    restNeeded: 1,
    fields: ['agriculture', 'other'],
    category: 'physical',
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    aliases: ['House Cleaning', 'Cleaning Services'],
    defaultHourlyRate: 14,
    marketDemand: 4,
    cognitiveEffort: 1,
    restNeeded: 1,
    fields: ['other'],
    category: 'physical',
  },
  {
    id: 'driving',
    name: 'Driving',
    aliases: ['Driver', 'Delivery Driver', 'Chauffeur'],
    defaultHourlyRate: 15,
    marketDemand: 4,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['other'],
    category: 'physical',
  },
  {
    id: 'food_delivery',
    name: 'Food delivery / courier',
    aliases: ['Food Delivery', 'Courier', 'Delivery'],
    defaultHourlyRate: 12,
    marketDemand: 5,
    cognitiveEffort: 1,
    restNeeded: 1,
    fields: ['other'],
    category: 'physical',
  },
  {
    id: 'gardening',
    name: 'Urban gardening / permaculture consulting',
    aliases: ['Gardening', 'Permaculture', 'Urban Farming'],
    defaultHourlyRate: 18,
    marketDemand: 2,
    cognitiveEffort: 2,
    restNeeded: 1,
    fields: ['agriculture'],
    category: 'physical',
  },
];

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Find a skill definition by name (case-insensitive, checks aliases).
 * Returns undefined if no match found.
 */
export function findSkillDefinition(skillName: string): SkillDefinition | undefined {
  const lowerName = skillName.toLowerCase().trim();

  return SKILL_REGISTRY.find((def) => {
    // Check exact name match
    if (def.name.toLowerCase() === lowerName) return true;

    // Check aliases
    if (def.aliases?.some((alias) => alias.toLowerCase() === lowerName)) return true;

    // Check partial match (skill name contains definition name or vice versa)
    if (lowerName.includes(def.name.toLowerCase()) || def.name.toLowerCase().includes(lowerName)) {
      return true;
    }

    // Check partial alias match
    if (
      def.aliases?.some(
        (alias) =>
          lowerName.includes(alias.toLowerCase()) || alias.toLowerCase().includes(lowerName)
      )
    ) {
      return true;
    }

    return false;
  });
}

/**
 * Get default attributes for a skill.
 * Returns sensible defaults if skill not found in registry.
 */
export function getSkillDefaults(skillName: string): {
  marketDemand: number;
  cognitiveEffort: number;
  restNeeded: number;
  defaultHourlyRate: number;
} {
  const definition = findSkillDefinition(skillName);

  if (definition) {
    return {
      marketDemand: definition.marketDemand,
      cognitiveEffort: definition.cognitiveEffort,
      restNeeded: definition.restNeeded,
      defaultHourlyRate: definition.defaultHourlyRate,
    };
  }

  // Default values for unknown skills (middle-of-the-road)
  return {
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    defaultHourlyRate: 15,
  };
}

/**
 * Get skills for a specific field of study.
 * Returns skills where the field is in their fields array.
 */
export function getSkillsForField(field: string): SkillDefinition[] {
  return SKILL_REGISTRY.filter((def) => def.fields.includes(field));
}

/**
 * Get all unique skill names from the registry.
 */
export function getAllRegistrySkillNames(): string[] {
  return SKILL_REGISTRY.map((def) => def.name);
}

/**
 * Get quick-add templates (skills with good attributes for common use).
 * Returns skills sorted by market demand (highest first).
 */
export function getQuickAddTemplates(field?: string, excludeNames?: string[]): SkillDefinition[] {
  let skills = field ? getSkillsForField(field) : SKILL_REGISTRY;

  // Exclude already added skills
  if (excludeNames && excludeNames.length > 0) {
    const lowerExclude = excludeNames.map((n) => n.toLowerCase());
    skills = skills.filter((def) => {
      const lowerName = def.name.toLowerCase();
      const hasExactMatch = lowerExclude.includes(lowerName);
      const hasAliasMatch = def.aliases?.some((a) => lowerExclude.includes(a.toLowerCase()));
      return !hasExactMatch && !hasAliasMatch;
    });
  }

  // Sort by market demand (descending), then by cognitive effort (ascending)
  return skills.sort((a, b) => {
    if (b.marketDemand !== a.marketDemand) {
      return b.marketDemand - a.marketDemand;
    }
    return a.cognitiveEffort - b.cognitiveEffort;
  });
}
