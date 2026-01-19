/**
 * Profile Context
 *
 * Provides shared profile state across the app.
 * When profile is updated (e.g., via onboarding chat), all consumers refresh.
 * Also manages goals, skills, inventory, and lifestyle for the active profile.
 */

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  ParentComponent,
  onMount,
} from 'solid-js';
import { profileService, type FullProfile } from './profileService';
import { skillService, type Skill } from './skillService';
import { createLogger } from './logger';

const logger = createLogger('ProfileContext');

/** Goal type from API */
export interface Goal {
  id: string;
  profileId: string;
  name: string;
  amount: number;
  deadline?: string;
  priority: number;
  parentGoalId?: string;
  conditionType: 'none' | 'after_completion' | 'after_date';
  status: 'active' | 'waiting' | 'completed' | 'paused';
  progress: number;
  planData?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** Inventory item type from API */
export interface InventoryItem {
  id: string;
  profileId: string;
  name: string;
  category: 'electronics' | 'clothing' | 'books' | 'furniture' | 'sports' | 'other';
  estimatedValue: number;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  platform?: string;
  status: 'available' | 'sold';
  soldPrice?: number;
  soldAt?: string;
  createdAt?: string;
}

/** Lifestyle item type from API */
export interface LifestyleItem {
  id: string;
  profileId: string;
  name: string;
  category: 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  essential: boolean;
  applied: boolean;
  pausedMonths: number;
  createdAt?: string;
}

/** Income item type from API */
export interface IncomeItem {
  id: string;
  profileId: string;
  name: string;
  amount: number;
  createdAt?: string;
}

/** Trade item type from API */
export interface TradeItem {
  id: string;
  profileId: string;
  type: 'borrow' | 'lend' | 'trade' | 'sell';
  name: string;
  description?: string;
  partner: string;
  value: number;
  status: 'pending' | 'active' | 'completed';
  dueDate?: string;
  inventoryItemId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProfileContextValue {
  /** Current active profile (reactive) */
  profile: () => FullProfile | null;
  /** Goals for the active profile (reactive) */
  goals: () => Goal[];
  /** Skills for the active profile (reactive) */
  skills: () => Skill[];
  /** Inventory items for the active profile (reactive) */
  inventory: () => InventoryItem[];
  /** Lifestyle items for the active profile (reactive) */
  lifestyle: () => LifestyleItem[];
  /** Income items for the active profile (reactive) */
  income: () => IncomeItem[];
  /** Trade items for the active profile (reactive) */
  trades: () => TradeItem[];
  /** Whether profile is loading */
  loading: () => boolean;
  /** Refresh profile from API - call after updates */
  refreshProfile: () => Promise<void>;
  /** Refresh goals from API - call after goal updates */
  refreshGoals: () => Promise<void>;
  /** Refresh skills from API - call after skill updates */
  refreshSkills: () => Promise<void>;
  /** Refresh inventory from API - call after inventory updates */
  refreshInventory: () => Promise<void>;
  /** Refresh lifestyle from API - call after lifestyle updates */
  refreshLifestyle: () => Promise<void>;
  /** Refresh income from API - call after income updates */
  refreshIncome: () => Promise<void>;
  /** Refresh trades from API - call after trade updates */
  refreshTrades: () => Promise<void>;
  /** Refresh all data (profile, goals, skills, inventory, lifestyle, income, trades) */
  refreshAll: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>();

export const ProfileProvider: ParentComponent = (props) => {
  const [profile, setProfile] = createSignal<FullProfile | null>(null);
  const [goals, setGoals] = createSignal<Goal[]>([]);
  const [skills, setSkills] = createSignal<Skill[]>([]);
  const [inventory, setInventory] = createSignal<InventoryItem[]>([]);
  const [lifestyle, setLifestyle] = createSignal<LifestyleItem[]>([]);
  const [income, setIncome] = createSignal<IncomeItem[]>([]);
  const [trades, setTrades] = createSignal<TradeItem[]>([]);
  const [loading, setLoading] = createSignal(true);

  // BUG L FIX: Track previous profile ID to detect profile switches
  let previousProfileId: string | null = null;

  const refreshProfile = async () => {
    setLoading(true);
    try {
      const loaded = await profileService.loadActiveProfile();
      setProfile(loaded);
    } catch (error) {
      logger.error('Failed to load profile', { error });
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshGoals = async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      try {
        const response = await fetch(`/api/goals?profileId=${currentProfile.id}`);
        if (response.ok) {
          const data = await response.json();
          // API returns array directly for profileId queries
          setGoals(Array.isArray(data) ? data : []);
        } else {
          setGoals([]);
        }
      } catch (error) {
        logger.error('Failed to load goals', { error });
        setGoals([]);
      }
    } else {
      setGoals([]);
    }
  };

  const refreshSkills = async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      try {
        const data = await skillService.listSkills(currentProfile.id);
        setSkills(data);
      } catch (error) {
        logger.error('Failed to load skills', { error });
        setSkills([]);
      }
    } else {
      setSkills([]);
    }
  };

  const refreshInventory = async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      try {
        const response = await fetch(`/api/inventory?profileId=${currentProfile.id}`);
        if (response.ok) {
          const data = await response.json();
          setInventory(Array.isArray(data) ? data : []);
        } else {
          setInventory([]);
        }
      } catch (error) {
        logger.error('Failed to load inventory', { error });
        setInventory([]);
      }
    } else {
      setInventory([]);
    }
  };

  const refreshLifestyle = async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      try {
        const response = await fetch(`/api/lifestyle?profileId=${currentProfile.id}`);
        if (response.ok) {
          const data = await response.json();
          setLifestyle(Array.isArray(data) ? data : []);
        } else {
          setLifestyle([]);
        }
      } catch (error) {
        logger.error('Failed to load lifestyle', { error });
        setLifestyle([]);
      }
    } else {
      setLifestyle([]);
    }
  };

  const refreshIncome = async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      try {
        const response = await fetch(`/api/income?profileId=${currentProfile.id}`);
        if (response.ok) {
          const data = await response.json();
          setIncome(Array.isArray(data) ? data : []);
        } else {
          setIncome([]);
        }
      } catch (error) {
        logger.error('Failed to load income', { error });
        setIncome([]);
      }
    } else {
      setIncome([]);
    }
  };

  const refreshTrades = async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      try {
        const response = await fetch(`/api/trades?profileId=${currentProfile.id}`);
        if (response.ok) {
          const data = await response.json();
          setTrades(Array.isArray(data) ? data : []);
        } else {
          setTrades([]);
        }
      } catch (error) {
        logger.error('Failed to load trades', { error });
        setTrades([]);
      }
    } else {
      setTrades([]);
    }
  };

  const refreshAll = async () => {
    await refreshProfile();
    // After profile refreshes, the effect will trigger other refreshes
  };

  // Refresh all data when profile changes
  // BUG L FIX: Clear data IMMEDIATELY when profile ID changes to prevent showing stale data
  createEffect(() => {
    const p = profile();
    const currentProfileId = p?.id || null;

    // Detect profile switch - clear data immediately before fetch
    if (currentProfileId !== previousProfileId) {
      logger.info('Profile switched', {
        from: previousProfileId,
        to: currentProfileId,
      });

      // Clear all data immediately to prevent showing old profile's data
      setGoals([]);
      setSkills([]);
      setInventory([]);
      setLifestyle([]);
      setIncome([]);
      setTrades([]);

      previousProfileId = currentProfileId;
    }

    if (p?.id) {
      // Refresh all related data in parallel
      Promise.all([
        refreshGoals(),
        refreshSkills(),
        refreshInventory(),
        refreshLifestyle(),
        refreshIncome(),
        refreshTrades(),
      ]).catch((err) => {
        logger.error('Failed to refresh data', { error: err });
      });
    }
  });

  // Initial load on mount
  onMount(() => {
    refreshProfile();
  });

  return (
    <ProfileContext.Provider
      value={{
        profile,
        goals,
        skills,
        inventory,
        lifestyle,
        income,
        trades,
        loading,
        refreshProfile,
        refreshGoals,
        refreshSkills,
        refreshInventory,
        refreshLifestyle,
        refreshIncome,
        refreshTrades,
        refreshAll,
      }}
    >
      {props.children}
    </ProfileContext.Provider>
  );
};

/**
 * Hook to access profile context
 * Must be used within a ProfileProvider
 */
export const useProfile = (): ProfileContextValue => {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return ctx;
};

export default ProfileContext;
