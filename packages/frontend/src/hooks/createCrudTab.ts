/**
 * createCrudTab Hook
 *
 * Reusable hook for CRUD operations in tab components.
 * Provides common state management patterns:
 * - Items list management
 * - Add/Edit form visibility
 * - Delete confirmation dialog
 * - Loading state
 *
 * Supports two modes:
 * 1. Service-based: CRUD through async service methods
 * 2. Local-only: CRUD with onChange callback for parent sync
 */

import { createSignal, type Accessor, type Setter } from 'solid-js';

// ============================================
// TYPES
// ============================================

/**
 * Service interface for async CRUD operations
 * All methods are optional - pass only what you need
 */
export interface CrudService<T, TCreate = unknown, TUpdate = unknown> {
  list?: (profileId: string) => Promise<T[]>;
  create?: (profileId: string, data: TCreate) => Promise<T | null>;
  update?: (id: string, data: TUpdate) => Promise<T | null>;
  delete?: (id: string) => Promise<boolean>;
}

/**
 * Configuration for createCrudTab hook
 */
export interface CrudTabConfig<T> {
  /** Function to extract item name (for delete confirmation) */
  getItemName: (item: T) => string;
  /** Function to extract item ID */
  getItemId: (item: T) => string;
  /** Optional service for async CRUD (if not provided, uses local state) */
  service?: CrudService<T>;
  /** Callback when items change (for local-only mode or parent sync) */
  onItemsChange?: (items: T[]) => void;
  /** Optional callback after successful create */
  onAfterCreate?: (item: T) => void;
  /** Optional callback after successful update */
  onAfterUpdate?: (item: T) => void;
  /** Optional callback after successful delete */
  onAfterDelete?: (id: string) => void;
}

/**
 * State and handlers returned by createCrudTab
 */
export interface CrudTabState<T> {
  // Reactive state
  items: Accessor<T[]>;
  setItems: Setter<T[]>;
  editingId: Accessor<string | null>;
  setEditingId: Setter<string | null>;
  showAddForm: Accessor<boolean>;
  setShowAddForm: Setter<boolean>;
  deleteConfirm: Accessor<{ id: string; name: string } | null>;
  setDeleteConfirm: Setter<{ id: string; name: string } | null>;
  isLoading: Accessor<boolean>;
  setIsLoading: Setter<boolean>;

  // CRUD handlers
  handleLoad: (profileId: string) => Promise<void>;
  handleAdd: (item: T) => void;
  handleAddAsync: (profileId: string, createData: unknown) => Promise<T | null>;
  handleUpdate: (id: string, updatedItem: T) => void;
  handleUpdateAsync: (id: string, updateData: unknown) => Promise<T | null>;
  handleDelete: (id: string) => void;
  handleDeleteAsync: (id: string) => Promise<boolean>;

  // UI helpers
  confirmDelete: (item: T) => void;
  cancelDelete: () => void;
  startEdit: (id: string) => void;
  cancelEdit: () => void;
  openAddForm: () => void;
  closeAddForm: () => void;
  resetForm: () => void;

  // Utility
  findItem: (id: string) => T | undefined;
  isEditing: (id: string) => boolean;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Create CRUD state and handlers for a tab component
 *
 * @example
 * // Service-based mode (async CRUD with DB)
 * const crud = createCrudTab<Skill>({
 *   getItemId: (s) => s.id,
 *   getItemName: (s) => s.name,
 *   service: skillService,
 * });
 *
 * @example
 * // Local-only mode (sync CRUD with parent callback)
 * const crud = createCrudTab<TradeItem>({
 *   getItemId: (t) => t.id,
 *   getItemName: (t) => t.name,
 *   onItemsChange: props.onTradesChange,
 * });
 */
export function createCrudTab<T>(config: CrudTabConfig<T>): CrudTabState<T> {
  // Core state
  const [items, setItems] = createSignal<T[]>([]);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [deleteConfirm, setDeleteConfirm] = createSignal<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);

  // Notify parent of changes (if callback provided)
  const notifyChange = (newItems: T[]) => {
    config.onItemsChange?.(newItems);
  };

  // ==========================================
  // CRUD Handlers (Sync - for local-only mode)
  // ==========================================

  /**
   * Add an item locally (sync)
   */
  const handleAdd = (item: T) => {
    const newItems = [...items(), item];
    setItems(newItems);
    notifyChange(newItems);
    config.onAfterCreate?.(item);
    setShowAddForm(false);
  };

  /**
   * Update an item locally (sync)
   */
  const handleUpdate = (id: string, updatedItem: T) => {
    const newItems = items().map((item) => (config.getItemId(item) === id ? updatedItem : item));
    setItems(newItems);
    notifyChange(newItems);
    config.onAfterUpdate?.(updatedItem);
    setEditingId(null);
    setShowAddForm(false);
  };

  /**
   * Delete an item locally (sync)
   */
  const handleDelete = (id: string) => {
    const newItems = items().filter((item) => config.getItemId(item) !== id);
    setItems(newItems);
    notifyChange(newItems);
    config.onAfterDelete?.(id);
    setDeleteConfirm(null);
  };

  // ==========================================
  // CRUD Handlers (Async - for service mode)
  // ==========================================

  /**
   * Load items from service
   */
  const handleLoad = async (profileId: string) => {
    if (!config.service?.list) return;

    setIsLoading(true);
    try {
      const data = await config.service.list(profileId);
      setItems(data);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Add an item via service (async)
   */
  const handleAddAsync = async (profileId: string, createData: unknown): Promise<T | null> => {
    if (!config.service?.create) return null;

    setIsLoading(true);
    try {
      const newItem = await config.service.create(profileId, createData);
      if (newItem) {
        const newItems = [...items(), newItem];
        setItems(newItems);
        notifyChange(newItems);
        config.onAfterCreate?.(newItem);
        setShowAddForm(false);
      }
      return newItem;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update an item via service (async)
   */
  const handleUpdateAsync = async (id: string, updateData: unknown): Promise<T | null> => {
    if (!config.service?.update) return null;

    setIsLoading(true);
    try {
      const updated = await config.service.update(id, updateData);
      if (updated) {
        const newItems = items().map((item) => (config.getItemId(item) === id ? updated : item));
        setItems(newItems);
        notifyChange(newItems);
        config.onAfterUpdate?.(updated);
        setEditingId(null);
        setShowAddForm(false);
      }
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete an item via service (async)
   */
  const handleDeleteAsync = async (id: string): Promise<boolean> => {
    if (!config.service?.delete) return false;

    setIsLoading(true);
    try {
      const success = await config.service.delete(id);
      if (success) {
        const newItems = items().filter((item) => config.getItemId(item) !== id);
        setItems(newItems);
        notifyChange(newItems);
        config.onAfterDelete?.(id);
        setDeleteConfirm(null);
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // UI Helpers
  // ==========================================

  /** Show delete confirmation dialog */
  const confirmDelete = (item: T) => {
    setDeleteConfirm({
      id: config.getItemId(item),
      name: config.getItemName(item),
    });
  };

  /** Cancel delete confirmation */
  const cancelDelete = () => setDeleteConfirm(null);

  /** Start editing an item */
  const startEdit = (id: string) => {
    setEditingId(id);
    setShowAddForm(true);
  };

  /** Cancel editing */
  const cancelEdit = () => {
    setEditingId(null);
  };

  /** Open add form */
  const openAddForm = () => {
    setEditingId(null);
    setShowAddForm(true);
  };

  /** Close add form */
  const closeAddForm = () => {
    setShowAddForm(false);
    setEditingId(null);
  };

  /** Reset form state */
  const resetForm = () => {
    setEditingId(null);
    setShowAddForm(false);
  };

  /** Find an item by ID */
  const findItem = (id: string): T | undefined => {
    return items().find((item) => config.getItemId(item) === id);
  };

  /** Check if an item is being edited */
  const isEditing = (id: string): boolean => {
    return editingId() === id;
  };

  return {
    // State
    items,
    setItems,
    editingId,
    setEditingId,
    showAddForm,
    setShowAddForm,
    deleteConfirm,
    setDeleteConfirm,
    isLoading,
    setIsLoading,

    // CRUD handlers
    handleLoad,
    handleAdd,
    handleAddAsync,
    handleUpdate,
    handleUpdateAsync,
    handleDelete,
    handleDeleteAsync,

    // UI helpers
    confirmDelete,
    cancelDelete,
    startEdit,
    cancelEdit,
    openAddForm,
    closeAddForm,
    resetForm,

    // Utility
    findItem,
    isEditing,
  };
}

export default createCrudTab;
