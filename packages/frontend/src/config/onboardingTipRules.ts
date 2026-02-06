/**
 * Onboarding Tip Rules Configuration
 *
 * Extensible system for context-aware tips during onboarding.
 * Tips are selected based on:
 * - Current onboarding step (context)
 * - Profile data conditions
 * - Priority ranking
 *
 * To add new tips:
 * 1. Add entry to ONBOARDING_TIP_RULES array
 * 2. Define context, optional condition, priority
 * 3. Component automatically picks highest priority matching rule
 */

import type { FullProfile } from '~/lib/profileService';

// =============================================================================
// Types
// =============================================================================

export type TipCategory =
  | 'energy'
  | 'progress'
  | 'mission'
  | 'opportunity'
  | 'warning'
  | 'celebration';

export type OnboardingContext =
  | 'greeting'
  | 'currency_confirm'
  | 'name'
  | 'studies'
  | 'skills'
  | 'certifications'
  | 'budget'
  | 'income_timing'
  | 'work_preferences'
  | 'goal'
  | 'academic_events'
  | 'inventory'
  | 'trade'
  | 'lifestyle'
  | 'complete';

export interface TipRule {
  id: string;
  /** Which onboarding step this tip applies to */
  context: OnboardingContext;
  /** Optional condition based on profile data */
  condition?: (profile: Partial<FullProfile>) => boolean;
  /** Higher priority = shown first (0-100) */
  priority: number;
  /** The tip content */
  tip: {
    title: string;
    message: string;
    category: TipCategory;
    action?: {
      label: string;
      href?: string;
      actionType?: 'navigate' | 'info';
    };
  };
}

// =============================================================================
// Tip Rules
// =============================================================================

export const ONBOARDING_TIP_RULES: TipRule[] = [
  // -------------------------------------------------------------------------
  // Greeting Phase
  // -------------------------------------------------------------------------
  {
    id: 'welcome_start',
    context: 'greeting',
    priority: 10,
    tip: {
      title: "Let's get started!",
      message: 'Tell me your city so I can give you localized advice on jobs and student aid.',
      category: 'opportunity',
    },
  },
  {
    id: 'greeting_privacy',
    context: 'greeting',
    priority: 5,
    tip: {
      title: 'Your data stays private',
      message: "I don't store anything externally. Your info stays on your device.",
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Name Phase
  // -------------------------------------------------------------------------
  {
    id: 'name_friendly',
    context: 'name',
    priority: 10,
    tip: {
      title: 'Nice to meet you!',
      message: "Your name helps me personalize advice. I'll use it to keep our chats friendly.",
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Studies Phase
  // -------------------------------------------------------------------------
  {
    id: 'studies_opportunity',
    context: 'studies',
    priority: 10,
    tip: {
      title: 'Study = earning potential',
      message: 'Your field unlocks specific job opportunities. Tech & healthcare pay well!',
      category: 'opportunity',
    },
  },
  {
    id: 'studies_stem',
    context: 'studies',
    condition: (p) =>
      ['informatique', 'computer science', 'engineering', 'ingénieur'].some((f) =>
        (p.field || '').toLowerCase().includes(f)
      ),
    priority: 80,
    tip: {
      title: 'Tech skills = high demand!',
      message: 'Your field typically commands €30-50/hour for tutoring or freelance work.',
      category: 'celebration',
    },
  },

  // -------------------------------------------------------------------------
  // Skills Phase
  // -------------------------------------------------------------------------
  {
    id: 'skills_default',
    context: 'skills',
    priority: 10,
    tip: {
      title: 'Skills unlock jobs',
      message: 'Even basic skills like Excel or languages can earn you extra income.',
      category: 'opportunity',
    },
  },
  {
    id: 'skills_programming',
    context: 'skills',
    condition: (p) =>
      (p.skills || []).some((s) =>
        ['python', 'javascript', 'typescript', 'react', 'java', 'c++'].includes(s.toLowerCase())
      ),
    priority: 85,
    tip: {
      title: 'High-value coding skills!',
      message: 'Programming skills can earn €25-60/hour on freelance platforms.',
      category: 'celebration',
    },
  },
  {
    id: 'skills_tutoring',
    context: 'skills',
    condition: (p) =>
      (p.skills || []).some((s) =>
        ['tutoring', 'teaching', 'cours particuliers', 'math', 'physics'].includes(s.toLowerCase())
      ),
    priority: 75,
    tip: {
      title: 'Tutoring opportunity!',
      message: 'Tutoring is flexible and pays €15-35/hour. Great for students!',
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Certifications Phase
  // -------------------------------------------------------------------------
  {
    id: 'certifications_default',
    context: 'certifications',
    priority: 10,
    tip: {
      title: 'Certifications = premium',
      message: 'BAFA, PSC1, or TEFL can boost your hourly rate by 20-50%.',
      category: 'opportunity',
    },
  },
  {
    id: 'certifications_bafa',
    context: 'certifications',
    condition: (p) => (p.certifications || []).some((c) => c.toLowerCase().includes('bafa')),
    priority: 80,
    tip: {
      title: 'BAFA unlocks summer jobs!',
      message: 'Animation, colonies, and youth camps pay well during holidays.',
      category: 'celebration',
    },
  },

  // -------------------------------------------------------------------------
  // Budget Phase
  // -------------------------------------------------------------------------
  {
    id: 'budget_default',
    context: 'budget',
    priority: 10,
    tip: {
      title: 'Know your numbers',
      message: 'Understanding your income vs expenses is the first step to saving.',
      category: 'opportunity',
    },
  },
  {
    id: 'budget_positive_margin',
    context: 'budget',
    condition: (p) => (p.monthlyMargin ?? 0) > 100,
    priority: 70,
    tip: {
      title: 'Positive cash flow!',
      message: "You're already saving. Let's optimize and accelerate your goal.",
      category: 'celebration',
    },
  },
  {
    id: 'budget_tight',
    context: 'budget',
    condition: (p) => (p.monthlyMargin ?? 0) < 0,
    priority: 80,
    tip: {
      title: "Let's fix this together",
      message: "Don't worry! We'll find ways to earn more or spend less.",
      category: 'warning',
    },
  },

  // -------------------------------------------------------------------------
  // Income Timing Phase
  // -------------------------------------------------------------------------
  {
    id: 'income_timing_default',
    context: 'income_timing',
    priority: 10,
    tip: {
      title: 'Cash flow timing matters',
      message: 'Knowing when money arrives helps plan around tight periods.',
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Work Preferences Phase
  // -------------------------------------------------------------------------
  {
    id: 'work_preferences_default',
    context: 'work_preferences',
    priority: 10,
    tip: {
      title: 'Balance is key',
      message: "I'll suggest jobs that fit your schedule and energy levels.",
      category: 'opportunity',
    },
  },
  {
    id: 'work_preferences_high_rate',
    context: 'work_preferences',
    condition: (p) => (p.minHourlyRate ?? 0) >= 20,
    priority: 60,
    tip: {
      title: 'Premium rate target!',
      message: 'High hourly rates are achievable with the right skills and positioning.',
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Goal Phase
  // -------------------------------------------------------------------------
  {
    id: 'goal_default',
    context: 'goal',
    priority: 10,
    tip: {
      title: 'Dream big!',
      message: 'Whether a trip, new laptop, or emergency fund - having a goal motivates.',
      category: 'opportunity',
    },
  },
  {
    id: 'goal_ambitious',
    context: 'goal',
    condition: (p) => (p.goalAmount ?? 0) >= 1000,
    priority: 70,
    tip: {
      title: 'Ambitious goal!',
      message: "Big goals need a plan. I'll help you break it into weekly targets.",
      category: 'celebration',
    },
  },

  // -------------------------------------------------------------------------
  // Busy Periods Phase
  // -------------------------------------------------------------------------
  {
    id: 'academic_events_default',
    context: 'academic_events',
    priority: 10,
    tip: {
      title: 'Plan around exams',
      message: "I'll reduce work suggestions before exams and boost them during breaks.",
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Inventory Phase
  // -------------------------------------------------------------------------
  {
    id: 'inventory_default',
    context: 'inventory',
    priority: 10,
    tip: {
      title: 'Hidden value at home',
      message: 'Old electronics, textbooks, or clothes can bring quick cash.',
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Trade Phase
  // -------------------------------------------------------------------------
  {
    id: 'trade_default',
    context: 'trade',
    priority: 10,
    tip: {
      title: 'Save without spending',
      message: 'Barter, borrow, or share subscriptions to cut costs.',
      category: 'opportunity',
    },
  },

  // -------------------------------------------------------------------------
  // Lifestyle (Subscriptions) Phase
  // -------------------------------------------------------------------------
  {
    id: 'lifestyle_default',
    context: 'lifestyle',
    priority: 10,
    tip: {
      title: 'Subscription audit',
      message: 'Small monthly costs add up. €10/month = €120/year!',
      category: 'warning',
    },
  },

  // -------------------------------------------------------------------------
  // Complete Phase (Post-Onboarding Tips)
  // These tips are shown after onboarding is complete
  // -------------------------------------------------------------------------
  {
    id: 'complete_celebration',
    context: 'complete',
    priority: 90,
    tip: {
      title: "You're all set!",
      message: 'Your personalized plan is ready. Explore the dashboard!',
      category: 'celebration',
      action: {
        label: 'Go to Me',
        href: '/me',
        actionType: 'navigate',
      },
    },
  },
  {
    id: 'complete_next_steps',
    context: 'complete',
    priority: 50,
    tip: {
      title: 'What happens next?',
      message: 'Check your weekly targets, explore job matches, and track your progress.',
      category: 'opportunity',
    },
  },
  {
    id: 'complete_swipe_intro',
    context: 'complete',
    priority: 70,
    tip: {
      title: 'Try Swipe Mode',
      message:
        "Swipe right on strategies you like, left on ones you don't. I'll learn your preferences!",
      category: 'opportunity',
      action: {
        label: 'Start Swiping',
        href: '/swipe',
        actionType: 'navigate',
      },
    },
  },
  {
    id: 'complete_jobs_intro',
    context: 'complete',
    priority: 65,
    tip: {
      title: 'Find Jobs Near You',
      message: 'Explore job opportunities matched to your skills and location.',
      category: 'opportunity',
      action: {
        label: 'Browse Jobs',
        href: '/me?tab=jobs',
        actionType: 'navigate',
      },
    },
  },
  {
    id: 'complete_track_progress',
    context: 'complete',
    priority: 60,
    tip: {
      title: 'Track Your Progress',
      message: 'Log your energy weekly and watch your savings grow on the dashboard.',
      category: 'progress',
      action: {
        label: 'View Dashboard',
        href: '/progress',
        actionType: 'navigate',
      },
    },
  },
  {
    id: 'complete_skills_monetize',
    context: 'complete',
    condition: (p) => (p.skills?.length ?? 0) >= 3,
    priority: 75,
    tip: {
      title: 'Monetize Your Skills',
      message: "You have multiple skills listed. Let's find the best-paying opportunities!",
      category: 'opportunity',
      action: {
        label: 'Skill Arbitrage',
        href: '/me?tab=profile',
        actionType: 'navigate',
      },
    },
  },
  {
    id: 'complete_budget_check',
    context: 'complete',
    condition: (p) => (p.monthlyMargin ?? 0) < 50,
    priority: 80,
    tip: {
      title: 'Tight Budget Detected',
      message: "Your margin is slim. Let's find quick wins to boost your income.",
      category: 'warning',
      action: {
        label: 'See Options',
        href: '/me?tab=budget',
        actionType: 'navigate',
      },
    },
  },
  {
    id: 'complete_goal_reminder',
    context: 'complete',
    condition: (p) => !!(p.goalName && p.goalAmount),
    priority: 55,
    tip: {
      title: 'Goal in Progress',
      message: 'Your savings goal is set. Keep tracking your progress weekly!',
      category: 'mission',
    },
  },
  {
    id: 'complete_energy_tip',
    context: 'complete',
    priority: 45,
    tip: {
      title: 'Energy Matters',
      message: "Log your energy level weekly. I'll adjust recommendations when you're tired.",
      category: 'energy',
    },
  },
  {
    id: 'complete_inventory_sell',
    context: 'complete',
    priority: 40,
    tip: {
      title: 'Sell Unused Items',
      message: 'Old electronics, textbooks, or clothes can bring quick cash!',
      category: 'opportunity',
      action: {
        label: 'View Inventory',
        href: '/me?tab=profile',
        actionType: 'navigate',
      },
    },
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all tips matching the current context and profile
 * Returns tips sorted by priority (highest first)
 */
export function getTipsForContext(
  context: OnboardingContext,
  profile: Partial<FullProfile>
): TipRule[] {
  return ONBOARDING_TIP_RULES.filter((rule) => {
    // Must match context
    if (rule.context !== context) return false;
    // Must pass condition if present
    if (rule.condition && !rule.condition(profile)) return false;
    return true;
  }).sort((a, b) => b.priority - a.priority);
}

/**
 * Get the highest priority tip for the current context
 */
export function getTopTipForContext(
  context: OnboardingContext,
  profile: Partial<FullProfile>
): TipRule | null {
  const tips = getTipsForContext(context, profile);
  return tips[0] || null;
}

/**
 * Get a random tip from matching tips (with priority weighting)
 */
export function getRandomTipForContext(
  context: OnboardingContext,
  profile: Partial<FullProfile>
): TipRule | null {
  const tips = getTipsForContext(context, profile);
  if (tips.length === 0) return null;
  if (tips.length === 1) return tips[0];

  // Weight by priority - higher priority tips more likely
  const totalPriority = tips.reduce((sum, t) => sum + t.priority, 0);
  let random = Math.random() * totalPriority;

  for (const tip of tips) {
    random -= tip.priority;
    if (random <= 0) return tip;
  }

  return tips[0];
}
