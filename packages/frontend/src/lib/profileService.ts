/**
 * Profile Service
 *
 * Frontend service for profile management with DuckDB persistence.
 * Includes debounced auto-save and profile switching.
 */

import { createLogger } from './logger';

const logger = createLogger('ProfileService');

export interface IncomeSource {
  source: string;
  amount: number;
}

export interface Expense {
  category: string;
  amount: number;
}

export interface FullProfile {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  diploma?: string;
  skills?: string[];
  city?: string;
  citySize?: string;
  incomeSources?: IncomeSource[];
  expenses?: Expense[];
  maxWorkHoursWeekly?: number;
  minHourlyRate?: number;
  hasLoan?: boolean;
  loanAmount?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlyMargin?: number;
  profileType: string;
  parentProfileId?: string;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  planData?: Record<string, unknown>;
  followupData?: Record<string, unknown>;
  achievements?: string[];
  isActive: boolean;
}

export interface ProfileSummary {
  id: string;
  name: string;
  profileType: string;
  goalName?: string;
  goalAmount?: number;
  isActive: boolean;
  createdAt?: string;
}

// Debounce timer
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 500;

/**
 * Load the active profile from DuckDB
 * Falls back to localStorage if API fails
 */
export async function loadActiveProfile(): Promise<FullProfile | null> {
  try {
    const response = await fetch('/api/profiles?active=true');
    if (!response.ok) {
      logger.warn('API returned error, trying localStorage fallback');
      return loadFromLocalStorage();
    }
    const profile = await response.json();
    // API might return null if no profiles exist
    if (!profile) {
      return loadFromLocalStorage();
    }
    return profile;
  } catch (error) {
    logger.warn('API unreachable, using localStorage fallback', { error });
    return loadFromLocalStorage();
  }
}

/**
 * Load profile from localStorage (fallback)
 */
function loadFromLocalStorage(): FullProfile | null {
  try {
    const stored = localStorage.getItem('studentProfile');
    if (!stored) return null;

    const local = JSON.parse(stored);
    // Map localStorage format to FullProfile format
    return {
      id: local.id || 'local-profile',
      name: local.name || 'Mon Profil',
      profileType: 'main',
      isActive: true,
      diploma: local.diploma,
      skills: local.skills,
      city: local.city,
      citySize: local.citySize,
      incomeSources: local.incomes || local.incomeSources,
      expenses: local.expenses,
      maxWorkHoursWeekly: local.maxWorkHours,
      minHourlyRate: local.minHourlyRate,
      hasLoan: local.hasLoan,
      loanAmount: local.loanAmount,
    };
  } catch {
    return null;
  }
}

/**
 * Load a specific profile by ID
 */
export async function loadProfile(profileId: string): Promise<FullProfile | null> {
  try {
    const response = await fetch(`/api/profiles?id=${profileId}`);
    if (!response.ok) {
      console.error('Failed to load profile:', profileId);
      return null;
    }
    return response.json();
  } catch (error) {
    console.error('Error loading profile:', error);
    return null;
  }
}

/**
 * List all profiles
 */
export async function listProfiles(): Promise<ProfileSummary[]> {
  try {
    const response = await fetch('/api/profiles?list=true');
    if (!response.ok) {
      console.error('Failed to list profiles');
      return [];
    }
    const profiles = await response.json();
    return profiles.map((p: FullProfile) => ({
      id: p.id,
      name: p.name,
      profileType: p.profileType,
      goalName: p.goalName,
      goalAmount: p.goalAmount,
      isActive: p.isActive,
      createdAt: p.createdAt,
    }));
  } catch (error) {
    console.error('Error listing profiles:', error);
    return [];
  }
}

/**
 * Save a profile (debounced)
 * Saves to both API and localStorage for redundancy
 */
export async function saveProfile(
  profile: Partial<FullProfile> & { name: string },
  options: { immediate?: boolean; setActive?: boolean } = {}
): Promise<{ success: boolean; profileId?: string }> {
  const { immediate = false, setActive = true } = options;

  // Clear existing timer
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const doSave = async () => {
    // Always save to localStorage as backup
    try {
      const localProfile = {
        id: profile.id,
        name: profile.name,
        diploma: profile.diploma,
        skills: profile.skills,
        city: profile.city,
        citySize: profile.citySize,
        incomes: profile.incomeSources,
        expenses: profile.expenses,
        maxWorkHours: profile.maxWorkHoursWeekly,
        minHourlyRate: profile.minHourlyRate,
        hasLoan: profile.hasLoan,
        loanAmount: profile.loanAmount,
      };
      localStorage.setItem('studentProfile', JSON.stringify(localProfile));
      logger.debug('Profile saved to localStorage');
    } catch (localError) {
      logger.warn('Failed to save to localStorage', { error: localError });
    }

    // Try API save
    try {
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, setActive }),
      });

      if (!response.ok) {
        logger.warn('API save failed, but localStorage backup succeeded');
        return { success: true, profileId: profile.id }; // Still success due to localStorage
      }

      const result = await response.json();
      logger.info('Profile saved to API');
      return { success: true, profileId: result.profileId };
    } catch (error) {
      logger.warn('API unreachable, profile saved to localStorage only', { error });
      return { success: true, profileId: profile.id }; // Still success due to localStorage
    }
  };

  if (immediate) {
    return doSave();
  }

  // Debounced save
  return new Promise((resolve) => {
    saveTimer = setTimeout(async () => {
      const result = await doSave();
      resolve(result);
    }, SAVE_DEBOUNCE_MS);
  });
}

/**
 * Switch to a different profile
 */
export async function switchProfile(profileId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/profiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId }),
    });

    if (!response.ok) {
      console.error('Failed to switch profile');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error switching profile:', error);
    return false;
  }
}

/**
 * Duplicate a profile for a new goal
 */
export async function duplicateProfileForGoal(
  sourceProfileId: string,
  goalConfig: {
    goalName: string;
    goalAmount: number;
    goalDeadline?: string;
  }
): Promise<FullProfile | null> {
  try {
    // Load source profile
    const source = await loadProfile(sourceProfileId);
    if (!source) {
      console.error('Source profile not found');
      return null;
    }

    // Create new profile with goal data
    const newProfile: Partial<FullProfile> & { name: string } = {
      name: `${source.name} - ${goalConfig.goalName}`,
      diploma: source.diploma,
      skills: source.skills,
      city: source.city,
      citySize: source.citySize,
      incomeSources: source.incomeSources,
      expenses: source.expenses,
      maxWorkHoursWeekly: source.maxWorkHoursWeekly,
      minHourlyRate: source.minHourlyRate,
      hasLoan: source.hasLoan,
      loanAmount: source.loanAmount,
      profileType: 'goal-clone',
      parentProfileId: sourceProfileId,
      goalName: goalConfig.goalName,
      goalAmount: goalConfig.goalAmount,
      goalDeadline: goalConfig.goalDeadline,
      // Reset plan/followup data for new goal
      planData: undefined,
      followupData: undefined,
      achievements: undefined,
    };

    const result = await saveProfile(newProfile, { immediate: true, setActive: true });
    if (result.success && result.profileId) {
      return loadProfile(result.profileId);
    }

    return null;
  } catch (error) {
    console.error('Error duplicating profile:', error);
    return null;
  }
}

/**
 * Delete a profile
 */
export async function deleteProfile(profileId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/profiles?id=${profileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to delete profile:', error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting profile:', error);
    return false;
  }
}

/**
 * Sync localStorage data to DuckDB (migration helper)
 */
export async function syncLocalToDb(): Promise<boolean> {
  try {
    // Load data from localStorage
    const storedProfile = localStorage.getItem('studentProfile');
    const storedPlanData = localStorage.getItem('planData');
    const storedFollowupData = localStorage.getItem('followupData');

    if (!storedProfile) {
      logger.info('No localStorage profile to sync');
      return true;
    }

    const localProfile = JSON.parse(storedProfile);
    const planData = storedPlanData ? JSON.parse(storedPlanData) : undefined;
    const followupData = storedFollowupData ? JSON.parse(storedFollowupData) : undefined;

    // Check if we already have profiles in DB
    const existing = await listProfiles();
    if (existing.length > 0) {
      logger.info('Profiles already exist in DB, skipping sync');
      return true;
    }

    // Create profile in DuckDB
    const profile: Partial<FullProfile> & { name: string } = {
      name: localProfile.name || 'Mon Profil',
      diploma: localProfile.diploma,
      skills: localProfile.skills,
      city: localProfile.city,
      citySize: localProfile.citySize,
      incomeSources: localProfile.incomes || localProfile.incomeSources,
      expenses: localProfile.expenses,
      maxWorkHoursWeekly: localProfile.maxWorkHoursWeekly,
      minHourlyRate: localProfile.minHourlyRate,
      hasLoan: localProfile.hasLoan,
      loanAmount: localProfile.loanAmount,
      profileType: 'main',
      goalName: planData?.setup?.goalName,
      goalAmount: planData?.setup?.goalAmount,
      goalDeadline: planData?.setup?.goalDeadline,
      planData,
      followupData,
    };

    const result = await saveProfile(profile, { immediate: true, setActive: true });
    if (result.success) {
      logger.info('Successfully synced localStorage to DuckDB');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error syncing localStorage to DuckDB:', error);
    return false;
  }
}

export const profileService = {
  loadActiveProfile,
  loadProfile,
  listProfiles,
  saveProfile,
  switchProfile,
  duplicateProfileForGoal,
  deleteProfile,
  syncLocalToDb,
};

export default profileService;
