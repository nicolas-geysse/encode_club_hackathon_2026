/**
 * Step Forms Configuration
 *
 * Defines form fields for each onboarding step.
 * Used by OnboardingFormStep.tsx to render contextual forms.
 */

import type { OnboardingStep } from './types';

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
  | 'currency-select';

export interface FieldOption {
  value: string;
  label: string;
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
  { value: 'high_school', label: 'High School / Baccalauréat' },
  { value: 'freshman', label: 'Freshman (1st year)' },
  { value: 'sophomore', label: 'Sophomore (2nd year)' },
  { value: 'junior', label: 'Junior (3rd year)' },
  { value: 'senior', label: 'Senior (4th year)' },
  { value: 'bachelor', label: 'Bachelor / Licence' },
  { value: 'master1', label: 'Master 1' },
  { value: 'master2', label: 'Master 2' },
  { value: 'phd', label: 'PhD / Doctorate' },
  { value: 'bts_dut', label: 'BTS / DUT / Vocational' },
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
    ],
    derivedFields: ['currency'],
    helpText: 'Your city helps us find local opportunities and set your currency.',
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
        type: 'text',
        label: 'Field of study',
        placeholder: 'e.g., Computer Science, Law, Business',
        required: true,
      },
    ],
  },

  skills: {
    fields: [
      {
        name: 'skills',
        type: 'multi-select-pills',
        label: 'Your skills',
        placeholder: 'Type or select skills',
        suggestions: POPULAR_SKILLS,
      },
    ],
    helpText: 'Select all skills you have - these help us find relevant jobs.',
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
    helpText:
      "Certifications can unlock higher-paying opportunities. Say 'none' if you don't have any.",
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
        type: 'text',
        label: 'Upcoming events',
        placeholder: 'e.g., Finals next week, Spring break in March',
      },
    ],
    helpText: "List any exams, vacations, or busy periods. We'll plan around them.",
  },

  inventory: {
    fields: [
      {
        name: 'inventoryItems',
        type: 'text',
        label: 'Items to sell',
        placeholder: 'e.g., Old laptop, textbooks, clothes',
      },
    ],
    helpText: 'List items you could sell for extra cash. We can help estimate values.',
  },

  trade: {
    fields: [
      {
        name: 'tradeOpportunities',
        type: 'text',
        label: 'Trade opportunities',
        placeholder: "e.g., Borrow Alex's bike, swap tutoring for web design",
      },
    ],
    helpText: 'Think about what you could borrow, lend, or trade with friends.',
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
