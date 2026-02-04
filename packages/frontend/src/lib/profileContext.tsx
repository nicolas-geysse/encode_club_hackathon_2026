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
import { eventBus } from './eventBus';
import type { Lead } from './prospectionTypes';

const logger = createLogger('ProfileContext');

/** Goal component for sub-tasks within a goal */
export interface GoalComponent {
  id?: string;
  goalId?: string;
  name: string;
  type: 'exam' | 'time_allocation' | 'purchase' | 'milestone' | 'other';
  estimatedHours?: number;
  estimatedCost?: number;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: string;
  dependsOn?: string[];
  createdAt?: string;
}

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
  components?: GoalComponent[];
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
  /** Leads from prospection (for Swipe integration) */
  leads: () => Lead[];
  /** Whether profile is loading */
  loading: () => boolean;
  /** Refresh profile from API - call after updates */
  refreshProfile: (options?: { silent?: boolean }) => Promise<void>;
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
  /** Refresh leads from API - call after lead updates */
  refreshLeads: () => Promise<void>;
  /** Set leads directly (for ProspectionTab integration) */
  setLeads: (leads: Lead[]) => void;
  /** Add a single lead (avoids duplicates by place_id) */
  addLead: (lead: Lead) => void;
  /** Update lead status */
  updateLeadStatus: (leadId: string, status: Lead['status']) => void;
  /** Refresh all data (profile, goals, skills, inventory, lifestyle, income, trades, leads) */
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
  const [leads, setLeads] = createSignal<Lead[]>([]);
  const [loading, setLoading] = createSignal(true);

  // BUG L FIX: Track previous profile ID to detect profile switches
  let previousProfileId: string | null = null;

  const refreshProfile = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const loaded = await profileService.loadActiveProfile();
      setProfile(loaded);
    } catch (error) {
      logger.error('Failed to load profile', { error });
      setProfile(null);
    } finally {
      if (!options.silent) setLoading(false);
    }
  };

  const refreshGoals = async () => {
    const currentProfile = profile();
    const pid = currentProfile?.id;

    logger.info('refreshGoals called', { profileId: pid, hasProfile: !!currentProfile });

    if (!pid) {
      // NE PAS effacer les goals si pas de profile ID - garde les goals existants
      logger.warn('refreshGoals: No profile ID, skipping refresh');
      return;
    }

    try {
      logger.info('Fetching goals from API', { profileId: pid });
      const response = await fetch(`/api/goals?profileId=${pid}`);
      if (response.ok) {
        const data = await response.json();
        logger.info('Goals fetched successfully', {
          count: Array.isArray(data) ? data.length : 0,
          data,
        });
        // API returns array directly for profileId queries
        setGoals(Array.isArray(data) ? data : []);
      } else {
        logger.warn('Goals API returned non-OK status', { status: response.status });
      }
      // NE PAS effacer sur erreur HTTP - garde les goals existants
    } catch (error) {
      logger.error('Failed to load goals', { error });
      // NE PAS faire setGoals([]) ici - garde les goals existants
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

  // Phase 1: Leads management for Swipe integration
  const refreshLeads = async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      try {
        const response = await fetch(`/api/leads?profileId=${currentProfile.id}`);
        if (response.ok) {
          const data = await response.json();
          setLeads(Array.isArray(data) ? data : []);
        } else {
          setLeads([]);
        }
      } catch (error) {
        logger.error('Failed to load leads', { error });
        setLeads([]);
      }
    } else {
      setLeads([]);
    }
  };

  const addLead = (lead: Lead) => {
    setLeads((prev) => {
      // Avoid duplicates by checking id or place_id
      if (prev.some((l) => l.id === lead.id)) {
        return prev;
      }
      return [...prev, lead];
    });
  };

  const updateLeadStatus = (leadId: string, status: Lead['status']) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));
  };

  const refreshAll = async () => {
    // Silent refresh to avoid flickering
    await refreshProfile({ silent: true });
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
      setLeads([]);

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
        refreshLeads(),
      ]).catch((err) => {
        logger.error('Failed to refresh data', { error: err });
      });
    }
  });

  // Initial load on mount & Event Bus subscription
  onMount(() => {
    refreshProfile();

    // Event Bus Subscriptions (Quickwin Realtime)
    // Debounce refreshAll to prevent flickering from rapid-fire events
    let refreshTimeout: ReturnType<typeof setTimeout>;
    const debouncedRefreshAll = () => {
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        refreshAll();
      }, 150); // 150ms debounce
    };

    const unsubData = eventBus.on('DATA_CHANGED', () => {
      debouncedRefreshAll();
    });

    const unsubProfile = eventBus.on('PROFILE_SWITCHED', () => {
      // Force reload of active profile
      refreshProfile();
    });

    const unsubSim = eventBus.on('SIMULATION_UPDATED', () => {
      // Simulation changes might affect goal progress/deadlines
      refreshAll();
    });

    return () => {
      unsubData();
      unsubProfile();
      unsubSim();
    };
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
        leads,
        loading,
        refreshProfile,
        refreshGoals,
        refreshSkills,
        refreshInventory,
        refreshLifestyle,
        refreshIncome,
        refreshTrades,
        refreshLeads,
        setLeads,
        addLead,
        updateLeadStatus,
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
