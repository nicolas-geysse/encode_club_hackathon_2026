/**
 * Retroplanning Types
 *
 * Types for the capacity-aware goal planning system.
 * This system adapts weekly targets based on student life constraints:
 * - Academic calendar (exams, vacations)
 * - Recurring commitments (classes, sports, family)
 * - Energy/mood tracking
 */

// ============================================
// ACADEMIC CALENDAR
// ============================================

export type AcademicEventType =
  | 'exam_period'
  | 'class_intensive'
  | 'vacation'
  | 'internship'
  | 'project_deadline';

export type EventPriority = 'critical' | 'high' | 'normal';

export interface AcademicEvent {
  id: string;
  userId: string;
  type: AcademicEventType;
  name: string;
  startDate: Date;
  endDate: Date;
  /** Capacity multiplier: 0.2 means 80% reduction, 1.5 means 50% boost */
  capacityImpact: number;
  priority: EventPriority;
  isRecurring?: boolean;
  recurrencePattern?: 'weekly' | 'monthly' | 'semester';
  createdAt?: Date;
}

// ============================================
// COMMITMENTS
// ============================================

export type CommitmentType =
  | 'class'
  | 'sport'
  | 'club'
  | 'internship'
  | 'family'
  | 'health'
  | 'volunteer'
  | 'other';

export type CommitmentPriority = 'essential' | 'important' | 'nice_to_have';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Commitment {
  id: string;
  userId: string;
  type: CommitmentType;
  name: string;
  hoursPerWeek: number;
  flexibleHours: boolean;
  dayPreferences?: DayOfWeek[];
  startDate?: Date;
  endDate?: Date;
  priority: CommitmentPriority;
  createdAt?: Date;
}

// ============================================
// ENERGY / MOOD TRACKING
// ============================================

export interface EnergyLog {
  id: string;
  userId: string;
  date: Date;
  /** 1-5 scale: 1=exhausted, 5=energized */
  energyLevel: 1 | 2 | 3 | 4 | 5;
  /** 1-5 scale: 1=very negative, 5=very positive */
  moodScore: 1 | 2 | 3 | 4 | 5;
  /** 1-5 scale: 1=no stress, 5=very stressed (inverse impact) */
  stressLevel: 1 | 2 | 3 | 4 | 5;
  hoursSlept?: number;
  notes?: string;
  createdAt?: Date;
}

// ============================================
// WEEK CAPACITY
// ============================================

export type CapacityCategory = 'high' | 'medium' | 'low' | 'protected';

export interface WeekCapacity {
  weekNumber: number;
  weekStartDate: Date;
  weekEndDate: Date;

  // Time breakdown (hours)
  totalAvailableHours: number; // 168h/week
  sleepHours: number; // ~56h (8h/day)
  classHours: number;
  commitmentHours: number;
  personalBufferHours: number; // Meals, travel, unexpected

  // Derived values
  maxWorkableHours: number;
  capacityScore: number; // 0-100
  capacityCategory: CapacityCategory;

  // Academic context
  academicEvents: AcademicEvent[];
  isExamPeriod: boolean;
  isProtectedWeek: boolean;

  // Energy prediction
  predictedEnergyMultiplier: number; // 0.5-1.5

  // Earning potential
  maxEarningPotential: number;
  recommendedTarget: number; // Sustainable target
  minimumTarget: number; // Floor target
}

// ============================================
// DYNAMIC MILESTONES
// ============================================

export type MilestoneDifficulty = 'easy' | 'moderate' | 'challenging' | 'protected';
export type MilestoneStatus = 'future' | 'current' | 'completed' | 'missed' | 'exceeded';

export interface DynamicMilestone {
  weekNumber: number;
  weekStartDate: Date;

  // Targets
  baseTarget: number; // Equal distribution (for comparison)
  adjustedTarget: number; // Capacity-adjusted target
  cumulativeTarget: number;

  // Capacity context
  capacity: WeekCapacity;

  // Strategy allocation
  recommendedStrategies: StrategyAllocation[];

  // Visualization
  difficulty: MilestoneDifficulty;
  visualColor: string;

  // Catch-up
  isCatchUpWeek: boolean;
  catchUpAmount: number;

  // Status tracking
  status: MilestoneStatus;
  actualEarned?: number;
}

export interface StrategyAllocation {
  strategyId: string;
  strategyName: string;
  type: 'job' | 'hustle' | 'selling' | 'optimization';
  allocatedHours: number;
  expectedEarnings: number;
  flexibility: number; // 0-1: can be moved if needed
}

// ============================================
// RETROPLAN CONFIGURATION
// ============================================

export interface RetroplanConfig {
  // Target settings
  goalAmount: number;
  deadline: Date;
  minimumBudgetProtection: number;

  // Capacity settings
  defaultHourlyRate: number;
  maxHoursPerWeek: number;
  minHoursPerWeek: number;

  // Buffer settings
  bufferWeeks: number;
  bufferPercentage: number; // Extra % for missed targets

  // Exam protection
  examCapacityMultiplier: number; // Default 0.2
  preExamWeeksProtected: number; // Weeks before exam to reduce

  // Catch-up settings
  catchUpMultiplier: number; // Max 1.5
  catchUpSpreadWeeks: number;
}

export const DEFAULT_RETROPLAN_CONFIG: Partial<RetroplanConfig> = {
  defaultHourlyRate: 15,
  maxHoursPerWeek: 20,
  minHoursPerWeek: 3,
  bufferWeeks: 1,
  bufferPercentage: 0.1,
  examCapacityMultiplier: 0.2,
  preExamWeeksProtected: 1,
  catchUpMultiplier: 1.5,
  catchUpSpreadWeeks: 3,
};

// ============================================
// COMPLETE RETROPLAN
// ============================================

export interface Retroplan {
  id: string;
  goalId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;

  // Configuration
  config: RetroplanConfig;

  // Milestones
  milestones: DynamicMilestone[];

  // Summary statistics
  totalWeeks: number;
  highCapacityWeeks: number;
  mediumCapacityWeeks: number;
  lowCapacityWeeks: number;
  protectedWeeks: number;

  // Feasibility
  feasibilityScore: number; // 0-1
  confidenceInterval: { low: number; high: number };
  riskFactors: string[];

  // Distribution analysis
  frontLoadedPercentage: number; // % in first half
  evenDistributionDeviation: number; // How much we deviate from equal

  // Buffer analysis
  totalBuffer: number;
  bufferUtilization: string;

  // Active state
  isActive: boolean;
}

// ============================================
// RETROPLAN INPUT
// ============================================

export interface RetroplanInput {
  goalId: string;
  userId: string;
  goalAmount: number;
  deadline: Date;
  goalName: string;

  // Profile
  userProfile: {
    skills: string[];
    monthlyIncome: number;
    monthlyExpenses: number;
    availableHours: number;
    defaultHourlyRate?: number;
  };

  // Life constraints (optional - will be fetched if not provided)
  academicEvents?: AcademicEvent[];
  commitments?: Commitment[];
  energyHistory?: EnergyLog[];

  // Preferences
  preferences?: {
    preferFrontLoading?: boolean;
    protectWeekends?: boolean;
    energyTrackingEnabled?: boolean;
  };

  // Config overrides
  configOverrides?: Partial<RetroplanConfig>;
}

// ============================================
// GAMIFICATION - RELATIVE ACHIEVEMENTS
// ============================================

export type AchievementTriggerType =
  | 'relative'
  | 'absolute'
  | 'streak'
  | 'milestone'
  | 'special';

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RelativeAchievement {
  id: string;
  name: string;
  icon: string;
  description: string;

  triggerType: AchievementTriggerType;

  // For relative achievements
  relativeTrigger?: {
    metric: 'pace' | 'capacity_utilization' | 'difficulty_completion';
    threshold: number;
    consecutiveWeeks?: number;
  };

  // For absolute achievements
  absoluteTrigger?: {
    metric: 'total_earned' | 'weeks_completed' | 'strategies_used';
    threshold: number;
  };

  // XP
  baseXP: number;
  xpMultiplier: 'difficulty' | 'none';

  rarity: AchievementRarity;
}

// ============================================
// VISUALIZATION TYPES
// ============================================

export interface CalendarViewData {
  month: string;
  year: number;
  weeks: CalendarWeek[];
}

export interface CalendarWeek {
  weekNumber: number;
  startDate: string;
  days: CalendarDay[];
  summary: {
    targetAmount: number;
    capacityCategory: CapacityCategory;
    isExamPeriod: boolean;
    events: string[];
    difficulty: MilestoneDifficulty;
    color: string;
  };
}

export interface CalendarDay {
  date: string;
  dayOfWeek: DayOfWeek;
  dayNumber: number;
  isWeekend: boolean;
  events: AcademicEvent[];
  commitments: Commitment[];
  capacityIndicator: 'full' | 'partial' | 'blocked';
}

export interface TimelineViewData {
  totalWeeks: number;
  goalAmount: number;
  progressLine: TimelinePoint[];
  targetLine: TimelinePoint[];
  capacityBars: CapacityBar[];
  milestoneMarkers: MilestoneMarker[];
  eventMarkers: EventMarker[];
}

export interface TimelinePoint {
  weekNumber: number;
  amount: number;
  cumulative: number;
  isProjected: boolean;
}

export interface CapacityBar {
  weekNumber: number;
  height: number; // 0-100
  color: string;
  label: string;
}

export interface MilestoneMarker {
  weekNumber: number;
  type: 'quarter' | 'half' | 'three_quarter' | 'goal';
  label: string;
  icon: string;
}

export interface EventMarker {
  weekNumber: number;
  type: AcademicEventType;
  name: string;
  icon: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface RetroplanResponse {
  success: boolean;
  retroplan?: Retroplan;
  calendarView?: CalendarViewData[];
  timelineView?: TimelineViewData;
  error?: string;
}

export interface WeekProgressUpdate {
  goalId: string;
  weekNumber: number;
  earnedAmount: number;
  actionsCompleted?: string[];
  energyLog?: Omit<EnergyLog, 'id' | 'userId' | 'date' | 'createdAt'>;
  notes?: string;
}

export interface ProgressUpdateResponse {
  success: boolean;
  updatedMilestone?: DynamicMilestone;
  newAchievements?: RelativeAchievement[];
  catchUpAdjustment?: {
    weeksAffected: number;
    additionalPerWeek: number;
  };
  error?: string;
}
