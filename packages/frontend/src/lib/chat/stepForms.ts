/**
 * Step Forms Configuration
 *
 * Defines form fields for each onboarding step.
 * Used by OnboardingFormStep.tsx to render contextual forms.
 */

import type { OnboardingStep } from './types';
import { getSkillSuggestions } from '../data/skillsByField';

// =============================================================================
// Field Types
// =============================================================================

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'autocomplete'
  | 'multi-select-pills'
  | 'geolocation-button'
  | 'currency-select'
  | 'dynamic-list';

export interface FieldOption {
  value: string;
  label: string;
}

/** Configuration for dynamic-list field type */
export interface DynamicListFieldConfig {
  /** Fields for each item in the list */
  itemFields: FormField[];
  /** Label for the "Add" button */
  addLabel: string;
  /** Maximum number of items allowed */
  maxItems?: number;
}

export interface FormField {
  name: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  suggestions?: string[];
  options?: FieldOption[];
  min?: number;
  max?: number;
  suffix?: string; // e.g., "€/month", "/h"
  derivedFrom?: string; // Field that auto-fills this one
  /** Configuration for dynamic-list fields */
  config?: DynamicListFieldConfig;
}

export interface StepFormConfig {
  fields: FormField[];
  /** Fields that are auto-derived from other fields */
  derivedFields?: string[];
  /** Help text shown below the form */
  helpText?: string;
}

// =============================================================================
// Popular Cities for Autocomplete
// =============================================================================

export const POPULAR_CITIES = [
  // France
  'Paris',
  'Lyon',
  'Marseille',
  'Toulouse',
  'Bordeaux',
  'Lille',
  'Nantes',
  'Nice',
  'Strasbourg',
  'Montpellier',
  // UK
  'London',
  'Manchester',
  'Birmingham',
  'Leeds',
  'Glasgow',
  'Edinburgh',
  'Bristol',
  'Liverpool',
  'Oxford',
  'Cambridge',
  // US
  'New York',
  'Los Angeles',
  'Chicago',
  'San Francisco',
  'Boston',
  'Seattle',
  'Austin',
  'Miami',
  'Washington',
  'Denver',
  // Germany
  'Berlin',
  'Munich',
  'Hamburg',
  'Frankfurt',
  'Cologne',
  // Other EU
  'Amsterdam',
  'Barcelona',
  'Madrid',
  'Rome',
  'Milan',
  'Brussels',
  'Vienna',
  'Dublin',
  'Lisbon',
  'Prague',
  // Canada
  'Toronto',
  'Vancouver',
  'Montreal',
  // Australia
  'Sydney',
  'Melbourne',
  // Asia
  'Tokyo',
  'Singapore',
  'Hong Kong',
  'Seoul',
];

// =============================================================================
// Diploma Options
// =============================================================================

export const DIPLOMA_OPTIONS: FieldOption[] = [
  { value: 'high_school', label: 'High School / Secondary' },
  { value: 'vocational', label: 'Vocational / Short-cycle' },
  { value: 'bachelor', label: 'Bachelor / Licence' },
  { value: 'master', label: 'Master' },
  { value: 'phd', label: 'PhD / Doctorate' },
];

// =============================================================================
// Field of Study Options
// =============================================================================

export const FIELD_OF_STUDY_OPTIONS: FieldOption[] = [
  { value: 'agriculture', label: 'Agriculture, Environment & Veterinary' },
  { value: 'arts', label: 'Arts, Design & Media' },
  { value: 'business', label: 'Business, Management & Law' },
  { value: 'computer_science', label: 'Computer Science & IT' },
  { value: 'education', label: 'Education & Training' },
  { value: 'engineering', label: 'Engineering & Technology' },
  { value: 'health', label: 'Health & Medicine' },
  { value: 'humanities', label: 'Humanities & Languages' },
  { value: 'sciences', label: 'Natural Sciences & Mathematics' },
  { value: 'services', label: 'Services, Tourism & Hospitality' },
  { value: 'social_sciences', label: 'Social Sciences & Psychology' },
  { value: 'other', label: 'Other' },
];

// =============================================================================
// Popular Skills
// =============================================================================

export const POPULAR_SKILLS = [
  // Programming
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'C++',
  'React',
  'Node.js',
  'SQL',
  // Languages
  'English',
  'French',
  'Spanish',
  'German',
  'Chinese',
  'Japanese',
  // Creative
  'Design',
  'Photography',
  'Video Editing',
  'Writing',
  'Music',
  'Guitar',
  'Piano',
  // Teaching
  'Tutoring',
  'Teaching',
  'Math tutoring',
  'Language tutoring',
  // Services
  'Babysitting',
  'Pet sitting',
  'Cleaning',
  'Driving',
  'Delivery',
  // Sports
  'Sports coaching',
  'Fitness',
  'Swimming',
  'Tennis',
];

// =============================================================================
// Academic Event Types
// =============================================================================

// Values must match retroplan API types
export const ACADEMIC_EVENT_TYPES: FieldOption[] = [
  { value: 'exam_period', label: 'Exam / Finals' },
  { value: 'vacation_rest', label: 'Vacation (rest - not available)' },
  { value: 'vacation_available', label: 'Vacation (available to work)' },
  { value: 'class_intensive', label: 'Busy Period' },
  { value: 'internship', label: 'Internship' },
  { value: 'project_deadline', label: 'Project Deadline' },
];

// =============================================================================
// Inventory Categories
// =============================================================================

export const INVENTORY_CATEGORIES: FieldOption[] = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'books', label: 'Books / Textbooks' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'sports', label: 'Sports Equipment' },
  { value: 'other', label: 'Other' },
];

// =============================================================================
// Trade/Borrow Types
// =============================================================================

export const TRADE_TYPES: FieldOption[] = [
  { value: 'borrow', label: 'Borrow' },
  { value: 'lend', label: 'Lend' },
  { value: 'trade', label: 'Trade / Swap' },
];

// =============================================================================
// Popular Certifications
// =============================================================================

export const POPULAR_CERTIFICATIONS = [
  // France
  { value: 'BAFA', label: 'BAFA (Animation)' },
  { value: 'BNSSA', label: 'BNSSA (Lifeguard)' },
  { value: 'PSC1', label: 'PSC1 (First Aid)' },
  { value: 'SST', label: 'SST (Workplace Safety)' },
  // UK
  { value: 'DBS', label: 'DBS Check' },
  { value: 'PFA', label: 'Paediatric First Aid' },
  { value: 'NPLQ', label: 'NPLQ (Pool Lifeguard)' },
  // US
  { value: 'CPR_AHA', label: 'CPR/First Aid (AHA)' },
  { value: 'LIFEGUARD_RC', label: 'Lifeguard (Red Cross)' },
  { value: 'FOOD_HANDLER', label: 'Food Handler' },
  // International
  { value: 'PADI_OW', label: 'PADI Open Water' },
  { value: 'TEFL', label: 'TEFL/TESOL (Teaching English)' },
];

// =============================================================================
// Step Form Configurations
// =============================================================================

export const STEP_FORMS: Partial<Record<OnboardingStep, StepFormConfig>> = {
  greeting: {
    fields: [
      {
        name: 'city',
        type: 'autocomplete',
        label: 'City',
        placeholder: 'Where do you live?',
        required: true,
        suggestions: POPULAR_CITIES,
      },
      {
        name: 'address',
        type: 'text',
        label: 'Address (optional)',
        placeholder: 'Your street address',
        required: false,
      },
    ],
    derivedFields: ['currency'],
    helpText:
      'Your city helps us find local opportunities. Address is optional but helps for job proximity.',
  },

  currency_confirm: {
    fields: [
      {
        name: 'currency',
        type: 'currency-select',
        label: 'Currency',
        required: true,
        options: [
          { value: 'USD', label: '$ USD (United States)' },
          { value: 'EUR', label: '€ EUR (Europe)' },
          { value: 'GBP', label: '£ GBP (United Kingdom)' },
        ],
      },
    ],
  },

  name: {
    fields: [
      {
        name: 'name',
        type: 'text',
        label: 'First name',
        placeholder: 'Your first name',
        required: true,
      },
    ],
  },

  studies: {
    fields: [
      {
        name: 'diploma',
        type: 'select',
        label: 'Education level',
        required: true,
        options: DIPLOMA_OPTIONS,
      },
      {
        name: 'field',
        type: 'select',
        label: 'Field of study',
        required: true,
        options: FIELD_OF_STUDY_OPTIONS,
      },
      {
        name: 'fieldOther',
        type: 'text',
        label: 'Specify your field',
        placeholder: 'e.g., Cybersecurity, Data Science, International Relations',
        required: false,
        // This field is conditionally shown when field === 'other'
        derivedFrom: 'field',
      },
    ],
  },

  skills: {
    fields: [
      {
        name: 'skills',
        type: 'multi-select-pills',
        label: 'Skills you can monetize',
        placeholder: 'Type or select skills',
        // Note: suggestions are provided dynamically via getFieldContext prop
        // DO NOT add suggestions: POPULAR_SKILLS here as fallback
      },
    ],
    helpText: 'Skills you can use to earn money: freelance, tutoring, services, creative work...',
  },

  certifications: {
    fields: [
      {
        name: 'certifications',
        type: 'multi-select-pills',
        label: 'Professional certifications',
        placeholder: 'Select or type certifications',
        suggestions: POPULAR_CERTIFICATIONS.map((c) => c.label),
      },
    ],
    helpText: 'Certifications can unlock higher-paying opportunities. You can fill this in later.',
  },

  budget: {
    fields: [
      {
        name: 'income',
        type: 'number',
        label: 'Monthly income',
        placeholder: '0',
        min: 0,
        suffix: '/month',
      },
      {
        name: 'expenses',
        type: 'number',
        label: 'Monthly expenses',
        placeholder: '0',
        min: 0,
        suffix: '/month',
      },
    ],
    helpText:
      'Include all regular income (job, allowance, aid) and expenses (rent, food, subscriptions).',
  },

  income_timing: {
    fields: [
      {
        name: 'incomeDay',
        type: 'select',
        label: 'When does your income arrive?',
        required: false,
        options: [
          { value: '1', label: 'Beginning of month (1st-5th)' },
          { value: '15', label: 'Mid-month (15th)' },
          { value: '25', label: 'End of month (25th-31st)' },
        ],
      },
    ],
    helpText: 'This helps us track your monthly savings in the right week.',
  },

  work_preferences: {
    fields: [
      {
        name: 'maxWorkHours',
        type: 'number',
        label: 'Max hours per week',
        placeholder: '15',
        min: 1,
        max: 40,
        suffix: 'h/week',
      },
      {
        name: 'minHourlyRate',
        type: 'number',
        label: 'Minimum hourly rate',
        placeholder: '12',
        min: 1,
        suffix: '/h',
      },
    ],
  },

  goal: {
    fields: [
      {
        name: 'goalName',
        type: 'text',
        label: "What you're saving for",
        placeholder: 'e.g., Vacation, Laptop, Emergency fund',
        required: true,
      },
      {
        name: 'goalAmount',
        type: 'number',
        label: 'Target amount',
        placeholder: '500',
        min: 1,
        required: true,
      },
      {
        name: 'goalDeadline',
        type: 'date',
        label: 'Target date',
        required: true,
      },
    ],
  },

  academic_events: {
    fields: [
      {
        name: 'academicEvents',
        type: 'dynamic-list',
        label: 'Academic Events',
        config: {
          itemFields: [
            {
              name: 'type',
              type: 'select',
              label: 'Type',
              options: ACADEMIC_EVENT_TYPES,
              required: true,
            },
            {
              name: 'name',
              type: 'text',
              label: 'Name',
              placeholder: 'e.g., Finals week',
              required: true,
            },
            {
              name: 'startDate',
              type: 'date',
              label: 'Start date',
              required: true,
            },
            {
              name: 'endDate',
              type: 'date',
              label: 'End date',
              required: true,
            },
          ],
          addLabel: 'Add event',
          maxItems: 10,
        },
      },
    ],
    helpText: "Add exams, vacations, or busy periods. We'll plan around them.",
  },

  inventory: {
    fields: [
      {
        name: 'inventoryItems',
        type: 'dynamic-list',
        label: 'Items to Sell',
        config: {
          itemFields: [
            {
              name: 'name',
              type: 'text',
              label: 'Item',
              placeholder: 'e.g., Old laptop',
              required: true,
            },
            {
              name: 'estimatedValue',
              type: 'number',
              label: 'Estimated price',
              placeholder: '50',
              min: 0,
              suffix: '$',
            },
          ],
          addLabel: 'Add item',
          maxItems: 20,
        },
      },
    ],
    helpText: 'List items you could sell for extra cash.',
  },

  trade: {
    fields: [
      {
        name: 'tradeOpportunities',
        type: 'dynamic-list',
        label: 'Borrow/Trade Opportunities',
        config: {
          itemFields: [
            {
              name: 'type',
              type: 'select',
              label: 'Type',
              options: TRADE_TYPES,
              required: true,
            },
            {
              name: 'name',
              type: 'text',
              label: 'Item',
              placeholder: 'e.g., Camping tent',
              required: true,
            },
            {
              name: 'estimatedSavings',
              type: 'number',
              label: 'Cost saved',
              placeholder: '50',
              min: 0,
              suffix: '$',
            },
          ],
          addLabel: 'Add opportunity',
          maxItems: 15,
        },
      },
    ],
    helpText: 'Things you could borrow, lend, or trade with friends.',
  },

  lifestyle: {
    fields: [
      {
        name: 'subscriptions',
        type: 'text',
        label: 'Current subscriptions',
        placeholder: 'e.g., Netflix, Spotify, Gym',
      },
    ],
    helpText: "We'll help identify subscriptions you might optimize or cancel.",
  },
};

/**
 * Get form configuration for a step
 */
export function getStepFormConfig(step: OnboardingStep): StepFormConfig | undefined {
  return STEP_FORMS[step];
}

/**
 * Check if a step has a form configuration
 */
export function hasStepForm(step: OnboardingStep): boolean {
  return step in STEP_FORMS;
}

/**
 * Get skill suggestions based on user's field of study.
 * Returns field-specific skills + skills from connected fields.
 * Falls back to all skills from the knowledge graph if field is unknown.
 *
 * @param field - The user's field of study (optional)
 * @returns Array of suggested skill names
 */
export function getSkillsForField(field: string | undefined): string[] {
  const suggestions = getSkillSuggestions(field);
  // getSkillSuggestions always returns skills (field-specific or all skills)
  // so we can return directly without fallback
  return suggestions;
}

// Re-export for convenience
export { getAllSkills } from '../data/skillsByField';
