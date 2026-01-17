/**
 * Demo Profiles for Stride
 *
 * Pre-configured student profiles to showcase killer features:
 * - Lucas: Energy Debt scenario (3 weeks low energy)
 * - Marie: Skill Arbitrage demo (multiple skills comparison)
 * - Emma: Swipe Scenarios demo (preference learning)
 * - Tom: Standard happy path (balanced profile)
 */

export interface DemoProfile {
  id: string;
  name: string;
  description: string;
  killerFeature: '#1' | '#2' | '#3' | '#4' | 'standard';
  studentProfile: {
    name: string;
    diploma: string;
    field: string;
    yearsRemaining: number;
    skills: string[];
    city: string;
    incomes: { source: string; amount: number }[];
    expenses: { category: string; amount: number }[];
    maxWorkHours: number;
    minHourlyRate: number;
    hasLoan: boolean;
    loanAmount: number;
  };
  planData: {
    setup: {
      goalName: string;
      goalAmount: number;
      goalDeadline: string;
      academicEvents: Array<{
        id: string;
        type: string;
        name: string;
        startDate: string;
        endDate: string;
      }>;
      commitments: Array<{
        id: string;
        type: string;
        name: string;
        hoursPerWeek: number;
      }>;
    };
    skills: Array<{
      id: string;
      name: string;
      level: string;
      hourlyRate: number;
      marketDemand: number;
      cognitiveEffort: number;
      restNeeded: number;
      score: number;
    }>;
    inventory: Array<{
      id: string;
      name: string;
      category: string;
      estimatedValue: number;
      condition: string;
    }>;
    lifestyle: Array<{
      id: string;
      category: string;
      name: string;
      currentCost: number;
      optimizedCost?: number;
      suggestion?: string;
    }>;
    trades: Array<{
      id: string;
      type: string;
      name: string;
      partner: string;
      value: number;
      status: string;
    }>;
    completedTabs: string[];
  };
  followupData: {
    currentAmount: number;
    weeklyTarget: number;
    currentWeek: number;
    totalWeeks: number;
    energyHistory: Array<{
      week: number;
      level: number;
      date: string;
    }>;
    missions: Array<{
      id: string;
      title: string;
      description: string;
      category: string;
      weeklyHours: number;
      weeklyEarnings: number;
      status: string;
      progress: number;
      startDate: string;
      hoursCompleted: number;
      earningsCollected: number;
    }>;
  };
}

// Calculate date helpers
const today = new Date();
const weekAgo = (weeks: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString();
};
const weeksFromNow = (weeks: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
};

export const DEMO_PROFILES: DemoProfile[] = [
  {
    id: 'lucas-energy-debt',
    name: 'Lucas',
    description: 'Energy Debt - 3 weeks of extreme fatigue',
    killerFeature: '#4',
    studentProfile: {
      name: 'Lucas',
      diploma: 'L3',
      field: 'Computer Science',
      yearsRemaining: 2,
      skills: ['python', 'sql', 'javascript'],
      city: 'Lyon',
      incomes: [
        { source: 'scholarship', amount: 300 },
        { source: 'family', amount: 400 },
      ],
      expenses: [
        { category: 'rent', amount: 450 },
        { category: 'food', amount: 150 },
        { category: 'transport', amount: 50 },
      ],
      maxWorkHours: 15,
      minHourlyRate: 15,
      hasLoan: false,
      loanAmount: 0,
    },
    planData: {
      setup: {
        goalName: 'New Gaming PC',
        goalAmount: 1200,
        goalDeadline: weeksFromNow(12),
        academicEvents: [
          {
            id: 'exam_1',
            type: 'exam_period',
            name: 'S5 Finals',
            startDate: weekAgo(4).split('T')[0],
            endDate: weekAgo(1).split('T')[0],
          },
        ],
        commitments: [{ id: 'cours', type: 'class', name: 'Classes', hoursPerWeek: 25 }],
      },
      skills: [
        {
          id: 's1',
          name: 'Python',
          level: 'advanced',
          hourlyRate: 25,
          marketDemand: 5,
          cognitiveEffort: 4,
          restNeeded: 2,
          score: 6.2,
        },
        {
          id: 's2',
          name: 'SQL Coaching',
          level: 'intermediate',
          hourlyRate: 22,
          marketDemand: 4,
          cognitiveEffort: 3,
          restNeeded: 1,
          score: 8.7,
        },
      ],
      inventory: [
        {
          id: 'i1',
          name: 'Old Laptop',
          category: 'electronics',
          estimatedValue: 200,
          condition: 'good',
        },
      ],
      lifestyle: [
        {
          id: 'l1',
          category: 'subscriptions',
          name: 'Netflix',
          currentCost: 13,
          optimizedCost: 6.5,
          suggestion: 'Family sharing',
        },
      ],
      trades: [],
      completedTabs: ['setup', 'skills', 'inventory', 'lifestyle'],
    },
    followupData: {
      currentAmount: 150,
      weeklyTarget: 100,
      currentWeek: 4,
      totalWeeks: 12,
      energyHistory: [
        { week: 1, level: 35, date: weekAgo(3) },
        { week: 2, level: 28, date: weekAgo(2) },
        { week: 3, level: 32, date: weekAgo(1) },
        { week: 4, level: 30, date: today.toISOString() },
      ],
      missions: [
        {
          id: 'm1',
          title: 'Freelance Python',
          description: 'Dev gig for startup',
          category: 'freelance',
          weeklyHours: 5,
          weeklyEarnings: 125,
          status: 'active',
          progress: 30,
          startDate: weekAgo(3),
          hoursCompleted: 6,
          earningsCollected: 150,
        },
      ],
    },
  },
  {
    id: 'marie-skill-arbitrage',
    name: 'Marie',
    description: 'Skill Arbitrage - Multi-criteria comparison',
    killerFeature: '#2',
    studentProfile: {
      name: 'Marie',
      diploma: 'M1',
      field: 'Business',
      yearsRemaining: 2,
      skills: ['excel', 'english', 'social_media', 'accounting'],
      city: 'Paris',
      incomes: [
        { source: 'housing_aid', amount: 200 },
        { source: 'family', amount: 500 },
        { source: 'job', amount: 300 },
      ],
      expenses: [
        { category: 'rent', amount: 600 },
        { category: 'food', amount: 200 },
        { category: 'transport', amount: 75 },
      ],
      maxWorkHours: 20,
      minHourlyRate: 12,
      hasLoan: true,
      loanAmount: 5000,
    },
    planData: {
      setup: {
        goalName: 'Loan Repayment',
        goalAmount: 2000,
        goalDeadline: weeksFromNow(16),
        academicEvents: [],
        commitments: [
          { id: 'cours', type: 'class', name: 'Classes + project', hoursPerWeek: 20 },
          { id: 'sport', type: 'sport', name: 'Volley', hoursPerWeek: 4 },
        ],
      },
      skills: [
        {
          id: 's1',
          name: 'Advanced Excel',
          level: 'expert',
          hourlyRate: 22,
          marketDemand: 5,
          cognitiveEffort: 3,
          restNeeded: 1,
          score: 8.5,
        },
        {
          id: 's2',
          name: 'Community Manager',
          level: 'advanced',
          hourlyRate: 18,
          marketDemand: 4,
          cognitiveEffort: 2,
          restNeeded: 0.5,
          score: 8.1,
        },
        {
          id: 's3',
          name: 'Accounting',
          level: 'intermediate',
          hourlyRate: 20,
          marketDemand: 3,
          cognitiveEffort: 4,
          restNeeded: 2,
          score: 5.8,
        },
        {
          id: 's4',
          name: 'English Translation',
          level: 'advanced',
          hourlyRate: 15,
          marketDemand: 3,
          cognitiveEffort: 2,
          restNeeded: 1,
          score: 6.9,
        },
      ],
      inventory: [
        {
          id: 'i1',
          name: 'Old iPhone',
          category: 'electronics',
          estimatedValue: 150,
          condition: 'good',
        },
        {
          id: 'i2',
          name: 'Designer Clothes',
          category: 'clothing',
          estimatedValue: 100,
          condition: 'like_new',
        },
      ],
      lifestyle: [
        {
          id: 'l1',
          category: 'subscriptions',
          name: 'Spotify',
          currentCost: 11,
          optimizedCost: 5.5,
          suggestion: 'Duo',
        },
        {
          id: 'l2',
          category: 'transport',
          name: 'Metro',
          currentCost: 75,
          optimizedCost: 37,
          suggestion: 'Student discount',
        },
      ],
      trades: [],
      completedTabs: ['setup', 'skills', 'inventory', 'lifestyle'],
    },
    followupData: {
      currentAmount: 400,
      weeklyTarget: 125,
      currentWeek: 3,
      totalWeeks: 16,
      energyHistory: [
        { week: 1, level: 75, date: weekAgo(2) },
        { week: 2, level: 80, date: weekAgo(1) },
        { week: 3, level: 72, date: today.toISOString() },
      ],
      missions: [
        {
          id: 'm1',
          title: 'Excel Training',
          description: 'Excel training for SMBs',
          category: 'tutoring',
          weeklyHours: 4,
          weeklyEarnings: 88,
          status: 'active',
          progress: 50,
          startDate: weekAgo(2),
          hoursCompleted: 6,
          earningsCollected: 132,
        },
        {
          id: 'm2',
          title: 'Community Manager freelance',
          description: 'Social media management for startup',
          category: 'freelance',
          weeklyHours: 6,
          weeklyEarnings: 108,
          status: 'active',
          progress: 40,
          startDate: weekAgo(2),
          hoursCompleted: 5,
          earningsCollected: 90,
        },
      ],
    },
  },
  {
    id: 'emma-swipe',
    name: 'Emma',
    description: 'Swipe Scenarios - Preference learning',
    killerFeature: '#3',
    studentProfile: {
      name: 'Emma',
      diploma: 'L2',
      field: 'Psychology',
      yearsRemaining: 4,
      skills: ['writing', 'english'],
      city: 'Bordeaux',
      incomes: [
        { source: 'scholarship', amount: 400 },
        { source: 'family', amount: 300 },
      ],
      expenses: [
        { category: 'rent', amount: 380 },
        { category: 'food', amount: 180 },
        { category: 'transport', amount: 40 },
      ],
      maxWorkHours: 12,
      minHourlyRate: 11,
      hasLoan: false,
      loanAmount: 0,
    },
    planData: {
      setup: {
        goalName: 'Spain Vacation',
        goalAmount: 600,
        goalDeadline: weeksFromNow(10),
        academicEvents: [],
        commitments: [{ id: 'cours', type: 'class', name: 'Classes', hoursPerWeek: 22 }],
      },
      skills: [
        {
          id: 's1',
          name: 'Web Writing',
          level: 'intermediate',
          hourlyRate: 15,
          marketDemand: 3,
          cognitiveEffort: 3,
          restNeeded: 1,
          score: 6.5,
        },
        {
          id: 's2',
          name: 'English Classes',
          level: 'intermediate',
          hourlyRate: 18,
          marketDemand: 4,
          cognitiveEffort: 2,
          restNeeded: 1,
          score: 7.8,
        },
      ],
      inventory: [
        {
          id: 'i1',
          name: 'Psychology Textbooks',
          category: 'books',
          estimatedValue: 80,
          condition: 'good',
        },
      ],
      lifestyle: [],
      trades: [],
      completedTabs: ['setup', 'skills'],
    },
    followupData: {
      currentAmount: 0,
      weeklyTarget: 60,
      currentWeek: 1,
      totalWeeks: 10,
      energyHistory: [{ week: 1, level: 85, date: today.toISOString() }],
      missions: [],
    },
  },
  {
    id: 'tom-comeback',
    name: 'Tom',
    description: 'Comeback Mode - Post-exams recovery',
    killerFeature: '#1',
    studentProfile: {
      name: 'Tom',
      diploma: 'M2',
      field: 'Law',
      yearsRemaining: 1,
      skills: ['writing', 'english'],
      city: 'Toulouse',
      incomes: [
        { source: 'scholarship', amount: 500 },
        { source: 'job', amount: 200 },
      ],
      expenses: [
        { category: 'rent', amount: 420 },
        { category: 'food', amount: 180 },
        { category: 'transport', amount: 45 },
      ],
      maxWorkHours: 18,
      minHourlyRate: 15,
      hasLoan: true,
      loanAmount: 8000,
    },
    planData: {
      setup: {
        goalName: 'Emergency Fund',
        goalAmount: 1000,
        goalDeadline: weeksFromNow(8),
        academicEvents: [
          {
            id: 'exam_1',
            type: 'exam_period',
            name: 'M2 Finals',
            startDate: weekAgo(5).split('T')[0],
            endDate: weekAgo(2).split('T')[0],
          },
        ],
        commitments: [{ id: 'stage', type: 'other', name: 'Court Internship', hoursPerWeek: 20 }],
      },
      skills: [
        {
          id: 's1',
          name: 'Legal Writing',
          level: 'advanced',
          hourlyRate: 25,
          marketDemand: 3,
          cognitiveEffort: 4,
          restNeeded: 2,
          score: 6.0,
        },
        {
          id: 's2',
          name: 'Law Classes',
          level: 'advanced',
          hourlyRate: 22,
          marketDemand: 4,
          cognitiveEffort: 3,
          restNeeded: 1.5,
          score: 7.2,
        },
      ],
      inventory: [],
      lifestyle: [
        {
          id: 'l1',
          category: 'subscriptions',
          name: 'Gym',
          currentCost: 35,
          optimizedCost: 0,
          suggestion: 'Campus gym',
        },
      ],
      trades: [],
      completedTabs: ['setup', 'skills', 'lifestyle'],
    },
    followupData: {
      currentAmount: 200,
      weeklyTarget: 125,
      currentWeek: 5,
      totalWeeks: 8,
      energyHistory: [
        { week: 1, level: 35, date: weekAgo(4) },
        { week: 2, level: 30, date: weekAgo(3) },
        { week: 3, level: 40, date: weekAgo(2) },
        { week: 4, level: 55, date: weekAgo(1) },
        { week: 5, level: 85, date: today.toISOString() },
      ],
      missions: [
        {
          id: 'm1',
          title: 'Law Tutoring',
          description: 'Help students prepare for finals',
          category: 'tutoring',
          weeklyHours: 4,
          weeklyEarnings: 88,
          status: 'active',
          progress: 25,
          startDate: weekAgo(1),
          hoursCompleted: 2,
          earningsCollected: 44,
        },
      ],
    },
  },
];

/**
 * Load a demo profile into localStorage
 */
export function loadDemoProfile(profileId: string): boolean {
  const profile = DEMO_PROFILES.find((p) => p.id === profileId);
  if (!profile) return false;

  localStorage.setItem('studentProfile', JSON.stringify(profile.studentProfile));
  localStorage.setItem('planData', JSON.stringify(profile.planData));
  localStorage.setItem('followupData', JSON.stringify(profile.followupData));

  return true;
}

/**
 * Clear all stored data
 */
export function clearStoredData(): void {
  localStorage.removeItem('studentProfile');
  localStorage.removeItem('planData');
  localStorage.removeItem('followupData');
}
