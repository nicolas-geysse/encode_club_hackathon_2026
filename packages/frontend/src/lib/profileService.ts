/**
 * Profile Service
 *
 * Frontend service for profile management with DuckDB persistence.
 * Includes debounced auto-save and profile switching.
 */

import { createLogger } from './logger';
import { normalizeExpenses } from './expenseUtils';
import type { Expense } from '../types/entities';

const logger = createLogger('ProfileService');

/**
 * Trigger embedding for a profile (fire-and-forget)
 * Non-blocking - errors are logged but don't affect save operation
 */
async function triggerProfileEmbedding(profile: Partial<FullProfile>): Promise<void> {
  if (!profile.id) return;

  try {
    const response = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'profile',
        id: profile.id,
        data: {
          diploma: profile.diploma,
          skills: profile.skills,
          monthlyIncome: profile.monthlyIncome,
          monthlyExpenses: profile.monthlyExpenses,
          goals: profile.goalName ? [profile.goalName] : undefined,
        },
      }),
    });

    if (!response.ok) {
      logger.warn('Profile embedding request failed', { status: response.status });
    } else {
      logger.debug('Profile embedding triggered', { profileId: profile.id });
    }
  } catch (error) {
    // Non-blocking - embedding is optional enhancement
    logger.warn('Profile embedding failed', { error });
  }
}

export interface IncomeSource {
  source: string;
  amount: number;
}

// Re-export Expense from canonical source
export type { Expense };

// BUG J FIX: Add swipe preferences type
export interface SwipePreferences {
  effort_sensitivity: number;
  hourly_rate_priority: number;
  time_flexibility: number;
  income_stability: number;
}

export interface FullProfile {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  diploma?: string;
  field?: string;
  currency?: 'USD' | 'EUR' | 'GBP'; // User's preferred currency based on region
  skills?: string[];
  certifications?: string[]; // Professional certifications (BAFA, BNSSA, etc.)
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
  swipePreferences?: SwipePreferences; // BUG J FIX: Add swipe preferences
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
 * Returns null if API fails - NO localStorage fallback to prevent profile contamination
 * (Sprint 2 Bug #8 fix: localStorage fallback caused cross-profile data leakage)
 */
export async function loadActiveProfile(): Promise<FullProfile | null> {
  try {
    const response = await fetch('/api/profiles?active=true');
    if (!response.ok) {
      logger.error('API returned error loading active profile', {
        status: response.status,
      });
      return null;
    }
    const profile = await response.json();
    // API might return null if no profiles exist - this is expected for new users
    if (!profile) {
      logger.debug('No active profile found in database');
      return null;
    }
    // Normalize expenses: handle corrupted data where expenses might be a number
    if (profile.expenses !== undefined) {
      profile.expenses = normalizeExpenses(profile.expenses);
    }
    return profile;
  } catch (error) {
    logger.error('Failed to load active profile from API', { error });
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
      logger.error('Failed to load profile', { profileId });
      return null;
    }
    const profile = await response.json();
    // Normalize expenses: handle corrupted data where expenses might be a number
    if (profile && profile.expenses !== undefined) {
      profile.expenses = normalizeExpenses(profile.expenses);
    }
    return profile;
  } catch (error) {
    logger.error('Error loading profile', { error });
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
      logger.error('Failed to list profiles');
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
    logger.error('Error listing profiles', { error });
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
): Promise<{ success: boolean; profileId?: string; apiSaved: boolean }> {
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
        currency: profile.currency,
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
        return { success: true, profileId: profile.id, apiSaved: false }; // apiSaved: false
      }

      const result = await response.json();
      logger.info('Profile saved to API');

      // Trigger embedding after successful API save (fire-and-forget)
      const profileWithId = { ...profile, id: result.profileId || profile.id };
      triggerProfileEmbedding(profileWithId).catch(() => {
        // Already logged in triggerProfileEmbedding
      });

      return { success: true, profileId: result.profileId, apiSaved: true }; // apiSaved: true
    } catch (error) {
      logger.warn('API unreachable, profile saved to localStorage only', { error });
      return { success: true, profileId: profile.id, apiSaved: false }; // apiSaved: false
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
 * Clears localStorage to prevent profile contamination (Sprint 2 Bug #8 fix)
 */
export async function switchProfile(profileId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/profiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId }),
    });

    if (!response.ok) {
      logger.error('Failed to switch profile');
      return false;
    }

    // Clear localStorage to prevent stale data contamination
    // The new profile will be loaded fresh from API
    try {
      localStorage.removeItem('studentProfile');
      localStorage.removeItem('planData');
      localStorage.removeItem('followupData');
      localStorage.removeItem('achievements');
      logger.debug('Cleared localStorage on profile switch');
    } catch (storageError) {
      logger.warn('Failed to clear localStorage on profile switch', { error: storageError });
    }

    return true;
  } catch (error) {
    logger.error('Error switching profile', { error });
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
      logger.error('Source profile not found', { sourceProfileId });
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
    logger.error('Error duplicating profile', { error });
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
      const errorData = await response.json();
      logger.error('Failed to delete profile', { message: errorData.message });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error deleting profile', { error });
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
      name: localProfile.name || 'My Profile',
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
    logger.error('Error syncing localStorage to DuckDB', { error });
    return false;
  }
}

/**
 * Export a profile as a JSON file download
 */
export async function exportProfile(profileId?: string): Promise<void> {
  try {
    const url = profileId ? `/api/profiles/export?id=${profileId}` : '/api/profiles/export';

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Export failed');
    }

    // Get filename from Content-Disposition header or generate one
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'stride_profile.json';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) filename = match[1];
    }

    // Create blob and trigger download
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    logger.info('Profile exported successfully');
  } catch (error) {
    logger.error('Failed to export profile', { error });
    throw error;
  }
}

/**
 * Import a profile from a JSON file
 */
export async function importProfile(
  file: File,
  options: { setActive?: boolean } = {}
): Promise<{ success: boolean; profileId?: string; message?: string }> {
  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    const response = await fetch('/api/profiles/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...importData,
        options,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Import failed');
    }

    logger.info('Profile imported successfully', { profileId: result.profileId });
    return result;
  } catch (error) {
    logger.error('Failed to import profile', { error });
    throw error;
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
  exportProfile,
  importProfile,
};

export default profileService;
