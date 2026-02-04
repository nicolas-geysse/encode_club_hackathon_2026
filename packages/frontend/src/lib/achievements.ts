/**
 * Achievements System
 *
 * Gamification layer for Stride:
 * - First Euro: First earnings collected
 * - Week Complete: Complete a full week of missions
 * - Comeback King: Complete comeback plan after energy dip
 * - Self Care Champion: 3 weeks of energy debt = unlock rest mode
 * - Budget Master: Apply 3+ lifestyle optimizations
 * - Skill Arbitrage Pro: Use skill comparison to pick best job
 * - Swipe Master: Complete full swipe session
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'earning' | 'wellness' | 'optimization' | 'engagement';
  /** Achievement tier - gold tier triggers special celebration */
  tier: AchievementTier;
  condition: string;
  unlockedAt?: string;
  progress?: number;
  maxProgress?: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Earning achievements
  {
    id: 'first_euro',
    name: 'First Euro',
    description: 'You earned your first euro with Stride!',
    icon: '💰',
    category: 'earning',
    tier: 'bronze',
    condition: 'earningsCollected >= 1',
    maxProgress: 1,
  },
  {
    id: 'hundred_club',
    name: '100 Club',
    description: 'You reached 100 euros in earnings',
    icon: '💯',
    category: 'earning',
    tier: 'silver',
    condition: 'earningsCollected >= 100',
    maxProgress: 100,
  },
  {
    id: 'week_complete',
    name: 'Week Complete',
    description: 'You completed all your missions for the week',
    icon: '📅',
    category: 'earning',
    tier: 'bronze',
    condition: 'weeklyMissionsCompleted === weeklyMissionsTotal',
    maxProgress: 1,
  },
  {
    id: 'goal_achieved',
    name: 'Goal Achieved',
    description: 'You reached your savings goal!',
    icon: '🏆',
    category: 'earning',
    tier: 'gold',
    condition: 'currentAmount >= goalAmount',
    maxProgress: 1,
  },

  // Wellness achievements
  {
    id: 'self_care_champion',
    name: 'Self Care Champion',
    description: 'You took care of yourself during a difficult period',
    icon: '🧘',
    category: 'wellness',
    tier: 'silver',
    condition: 'energyDebtActivated && restModeUsed',
    maxProgress: 1,
  },
  {
    id: 'comeback_king',
    name: 'Comeback King',
    description: 'You completed a catch-up plan after an energy dip',
    icon: '🚀',
    category: 'wellness',
    tier: 'gold',
    condition: 'comebackPlanCompleted',
    maxProgress: 1,
  },
  {
    id: 'energy_stable',
    name: 'Stable Energy',
    description: 'You maintained energy above 60% for 4 weeks',
    icon: '⚡',
    category: 'wellness',
    tier: 'silver',
    condition: 'energyHistory.filter(e => e.level >= 60).length >= 4',
    maxProgress: 4,
  },

  // Optimization achievements
  {
    id: 'budget_master',
    name: 'Budget Master',
    description: 'You applied 3 lifestyle optimizations',
    icon: '💡',
    category: 'optimization',
    tier: 'silver',
    condition: 'optimizationsApplied >= 3',
    maxProgress: 3,
  },
  {
    id: 'skill_arbitrage_pro',
    name: 'Skill Arbitrage Pro',
    description: 'You used multi-criteria scoring to choose a job',
    icon: '📊',
    category: 'optimization',
    tier: 'bronze',
    condition: 'skillArbitrageUsed',
    maxProgress: 1,
  },
  {
    id: 'diversified_income',
    name: 'Diversified Income',
    description: 'You have 3+ active income sources',
    icon: '🌈',
    category: 'optimization',
    tier: 'silver',
    condition: 'activeMissions.length >= 3',
    maxProgress: 3,
  },

  // Engagement achievements
  {
    id: 'swipe_master',
    name: 'Swipe Master',
    description: 'You completed a Swipe Scenarios session',
    icon: '👆',
    category: 'engagement',
    tier: 'bronze',
    condition: 'swipeSessionCompleted',
    maxProgress: 1,
  },
  {
    id: 'profile_complete',
    name: 'Profile Complete',
    description: 'You completed all tabs in Me',
    icon: '✅',
    category: 'engagement',
    tier: 'silver',
    condition: 'completedTabs.length === 5',
    maxProgress: 5,
  },
  {
    id: 'daily_check',
    name: 'Daily Check',
    description: 'You updated your energy for 7 days in a row',
    icon: '📱',
    category: 'engagement',
    tier: 'bronze',
    condition: 'consecutiveDailyChecks >= 7',
    maxProgress: 7,
  },

  // Karma achievements (community/sharing economy)
  {
    id: 'community_helper',
    name: 'Community Helper',
    description: 'You helped 2 people by lending or trading items',
    icon: '🤝',
    category: 'wellness',
    tier: 'bronze',
    condition: 'karmaScore >= 2',
    maxProgress: 2,
  },
  {
    id: 'sharing_champion',
    name: 'Sharing Champion',
    description: 'You reached 5 karma by helping the community',
    icon: '🌟',
    category: 'wellness',
    tier: 'silver',
    condition: 'karmaScore >= 5',
    maxProgress: 5,
  },
  {
    id: 'karma_legend',
    name: 'Karma Legend',
    description: 'You reached 10 karma - a true community pillar!',
    icon: '👑',
    category: 'wellness',
    tier: 'gold',
    condition: 'karmaScore >= 10',
    maxProgress: 10,
  },
];

/**
 * User achievements state
 */
export interface AchievementsState {
  unlocked: string[];
  progress: Record<string, number>;
  lastChecked: string;
}

/**
 * Get initial achievements state
 */
export function getInitialAchievementsState(): AchievementsState {
  const stored = localStorage.getItem('achievements');
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    unlocked: [],
    progress: {},
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Save achievements state
 */
export function saveAchievementsState(state: AchievementsState): void {
  localStorage.setItem('achievements', JSON.stringify(state));
}

/**
 * Check if an achievement should be unlocked
 */
export function checkAchievement(
  achievementId: string,
  context: Record<string, unknown>
): { unlocked: boolean; progress: number } {
  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!achievement) return { unlocked: false, progress: 0 };

  // Simple condition evaluation
  switch (achievementId) {
    case 'first_euro': {
      const earnings = (context.earningsCollected as number) || 0;
      return { unlocked: earnings >= 1, progress: Math.min(1, earnings) };
    }

    case 'hundred_club': {
      const total = (context.earningsCollected as number) || 0;
      return { unlocked: total >= 100, progress: Math.min(100, total) };
    }

    case 'week_complete': {
      const completed = (context.weeklyMissionsCompleted as number) || 0;
      const totalMissions = (context.weeklyMissionsTotal as number) || 1;
      return {
        unlocked: completed >= totalMissions && totalMissions > 0,
        progress: completed >= totalMissions ? 1 : 0,
      };
    }

    case 'goal_achieved': {
      const current = (context.currentAmount as number) || 0;
      const goal = (context.goalAmount as number) || Infinity;
      return { unlocked: current >= goal, progress: current >= goal ? 1 : 0 };
    }

    case 'self_care_champion': {
      const debtActive = context.energyDebtActivated as boolean;
      const restUsed = context.restModeUsed as boolean;
      return { unlocked: debtActive && restUsed, progress: debtActive && restUsed ? 1 : 0 };
    }

    case 'comeback_king': {
      const comebackDone = context.comebackPlanCompleted as boolean;
      return { unlocked: comebackDone || false, progress: comebackDone ? 1 : 0 };
    }

    case 'energy_stable': {
      const history = (context.energyHistory as Array<{ level: number }>) || [];
      const stableWeeks = history.filter((e) => e.level >= 60).length;
      return { unlocked: stableWeeks >= 4, progress: Math.min(4, stableWeeks) };
    }

    case 'budget_master': {
      const optimizations = (context.optimizationsApplied as number) || 0;
      return { unlocked: optimizations >= 3, progress: Math.min(3, optimizations) };
    }

    case 'skill_arbitrage_pro': {
      const arbitrageUsed = context.skillArbitrageUsed as boolean;
      return { unlocked: arbitrageUsed || false, progress: arbitrageUsed ? 1 : 0 };
    }

    case 'diversified_income': {
      const missions = (context.activeMissions as unknown[]) || [];
      return { unlocked: missions.length >= 3, progress: Math.min(3, missions.length) };
    }

    case 'swipe_master': {
      const swipeDone = context.swipeSessionCompleted as boolean;
      return { unlocked: swipeDone || false, progress: swipeDone ? 1 : 0 };
    }

    case 'profile_complete': {
      const tabs = (context.completedTabs as string[]) || [];
      return { unlocked: tabs.length >= 5, progress: Math.min(5, tabs.length) };
    }

    case 'daily_check': {
      const checks = (context.consecutiveDailyChecks as number) || 0;
      return { unlocked: checks >= 7, progress: Math.min(7, checks) };
    }

    // Karma achievements
    case 'community_helper': {
      const karma = (context.karmaScore as number) || 0;
      return { unlocked: karma >= 2, progress: Math.min(2, karma) };
    }

    case 'sharing_champion': {
      const karma = (context.karmaScore as number) || 0;
      return { unlocked: karma >= 5, progress: Math.min(5, karma) };
    }

    case 'karma_legend': {
      const karma = (context.karmaScore as number) || 0;
      return { unlocked: karma >= 10, progress: Math.min(10, karma) };
    }

    default:
      return { unlocked: false, progress: 0 };
  }
}

/**
 * Update achievements based on current context
 * Returns newly unlocked achievements
 */
export function updateAchievements(context: Record<string, unknown>): {
  state: AchievementsState;
  newlyUnlocked: Achievement[];
} {
  const state = getInitialAchievementsState();
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    const { unlocked, progress } = checkAchievement(achievement.id, context);

    // Update progress
    state.progress[achievement.id] = progress;

    // Check for new unlock
    if (unlocked && !state.unlocked.includes(achievement.id)) {
      state.unlocked.push(achievement.id);
      newlyUnlocked.push({
        ...achievement,
        unlockedAt: new Date().toISOString(),
        progress,
      });
    }
  }

  state.lastChecked = new Date().toISOString();
  saveAchievementsState(state);

  return { state, newlyUnlocked };
}

/**
 * Get all achievements with current state
 */
export function getAllAchievements(): Array<
  Achievement & { isUnlocked: boolean; currentProgress: number }
> {
  const state = getInitialAchievementsState();

  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    isUnlocked: state.unlocked.includes(achievement.id),
    currentProgress: state.progress[achievement.id] || 0,
    unlockedAt: state.unlocked.includes(achievement.id) ? state.lastChecked : undefined,
  }));
}

/**
 * Get unlocked achievements count
 */
export function getUnlockedCount(): { unlocked: number; total: number } {
  const state = getInitialAchievementsState();
  return {
    unlocked: state.unlocked.length,
    total: ACHIEVEMENTS.length,
  };
}

/**
 * Handle achievement unlock - shows toast and triggers celebration for gold tier
 * Call this when an achievement is newly unlocked
 */
export function onAchievementUnlock(
  achievement: Achievement,
  options?: {
    showToast?: (type: 'success' | 'info', title: string, message: string) => void;
    celebrateGold?: () => void;
  }
): void {
  // Show toast notification if toast function provided
  if (options?.showToast) {
    options.showToast(
      'success',
      `${achievement.icon} ${achievement.name}`,
      achievement.description
    );
  }

  // Gold tier = big celebration
  if (achievement.tier === 'gold' && options?.celebrateGold) {
    options.celebrateGold();
  }
}
