/**
 * Canonical Entity Types
 *
 * Single source of truth for all entity types.
 * Services and components should import from here.
 */

// === COMMON TYPES ===

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type LifestyleCategory = 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
export type InventoryCategory =
  | 'electronics'
  | 'clothing'
  | 'books'
  | 'furniture'
  | 'sports'
  | 'other';
export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
export type ItemStatus = 'available' | 'sold';

// === SKILL ===

export interface Skill {
  id: string;
  profileId: string;
  name: string;
  level: SkillLevel;
  hourlyRate: number;
  marketDemand: number; // 1-5
  cognitiveEffort: number; // 1-5
  restNeeded: number; // hours
  score?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateSkillInput {
  profileId: string;
  name: string;
  level?: SkillLevel;
  hourlyRate?: number;
  marketDemand?: number;
  cognitiveEffort?: number;
  restNeeded?: number;
}

// === LIFESTYLE ===

export interface LifestyleItem {
  id: string;
  profileId: string;
  name: string;
  category: LifestyleCategory;
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  essential: boolean;
  applied: boolean;
  pausedMonths: number;
  createdAt?: string;
}

export interface CreateLifestyleItemInput {
  profileId: string;
  name: string;
  category?: LifestyleCategory;
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  essential?: boolean;
}

// === INVENTORY ===

export interface InventoryItem {
  id: string;
  profileId: string;
  name: string;
  category: InventoryCategory;
  estimatedValue: number;
  condition: ItemCondition;
  platform?: string;
  status: ItemStatus;
  soldPrice?: number;
  soldAt?: string;
  createdAt?: string;
}

export interface CreateInventoryItemInput {
  profileId: string;
  name: string;
  category?: InventoryCategory;
  estimatedValue?: number;
  condition?: ItemCondition;
  platform?: string;
}

// === INCOME ===

export interface IncomeItem {
  id: string;
  profileId: string;
  name: string;
  amount: number;
  createdAt?: string;
}

export interface CreateIncomeItemInput {
  profileId: string;
  name: string;
  amount: number;
}

// === LEGACY SHIMS (for backward compatibility with plan.tsx props) ===

/** Skill without profileId/timestamps - for plan.tsx props */
export type LegacySkill = Omit<Skill, 'profileId' | 'createdAt' | 'updatedAt'>;

/** Minimal lifestyle item - for plan.tsx props */
export interface LegacyLifestyleItem {
  id: string;
  category: LifestyleCategory;
  name: string;
  currentCost: number;
  pausedMonths?: number;
}

// === CONVERSION HELPERS ===

/** Convert full Skill to legacy format (drops profileId, timestamps) */
export function skillToLegacy(skill: Skill): LegacySkill {
  return {
    id: skill.id,
    name: skill.name,
    level: skill.level,
    hourlyRate: skill.hourlyRate,
    marketDemand: skill.marketDemand,
    cognitiveEffort: skill.cognitiveEffort,
    restNeeded: skill.restNeeded,
    score: skill.score,
  };
}

/** Convert full LifestyleItem to legacy format (minimal fields) */
export function itemToLegacy(item: LifestyleItem): LegacyLifestyleItem {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    currentCost: item.currentCost,
    pausedMonths: item.pausedMonths,
  };
}

/** Convert legacy lifestyle item to full format */
export function legacyToItem(legacy: LegacyLifestyleItem, profileId: string): LifestyleItem {
  return {
    id: legacy.id,
    profileId,
    name: legacy.name,
    category: legacy.category,
    currentCost: legacy.currentCost,
    essential: false,
    applied: false,
    pausedMonths: legacy.pausedMonths || 0,
  };
}
