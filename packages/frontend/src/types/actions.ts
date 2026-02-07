export type ActionType =
  | 'pause_subscription'
  | 'add_expense'
  | 'update_budget'
  | 'create_goal'
  | 'update_goal'
  | 'update_income'
  | 'update_expenses'
  | 'add_skill'
  | 'sell_item';

export interface ActionField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'duration';
  options?: string[]; // For select type
  required: boolean;
}

export interface ActionDefinition {
  intent: ActionType;
  description: string;
  fields: ActionField[];
  uiComponent: string; // The component name to render for parameter collection
}

export const ACTIONS: Record<ActionType, ActionDefinition> = {
  pause_subscription: {
    intent: 'pause_subscription',
    description: 'Pause a recurring subscription for a set duration',
    fields: [
      {
        name: 'resourceName',
        label: 'Subscription Name',
        type: 'select', // Changed from text to select
        options: ['dynamic:subscriptions'], // Marker for dynamic population
        required: true,
      },
      {
        name: 'durationMonths',
        label: 'Duration (Months)',
        type: 'duration',
        required: true,
        // We'll handle default value injection in the dispatcher
      },
    ],
    uiComponent: 'DurationSelector',
  },
  add_expense: {
    intent: 'add_expense',
    description: 'Add a new expense item',
    fields: [
      { name: 'name', label: 'Item Name', type: 'text', required: true },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        options: ['housing', 'food', 'transport', 'subscriptions', 'other'],
        required: true,
      },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
    ],
    uiComponent: 'ExpenseForm',
  },
  update_budget: {
    intent: 'update_budget',
    description: 'Adjust the budget for a specific category',
    fields: [
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        options: ['housing', 'food', 'transport', 'subscriptions', 'other'],
        required: true,
      },
      { name: 'amount', label: 'New Amount', type: 'number', required: true },
    ],
    uiComponent: 'BudgetStepper',
  },
  create_goal: {
    intent: 'create_goal',
    description: 'Manage savings goal',
    fields: [
      { name: 'name', label: 'Goal Name', type: 'text', required: true },
      { name: 'amount', label: 'Target Amount', type: 'number', required: true },
      { name: 'deadline', label: 'Deadline', type: 'date', required: true },
    ],
    uiComponent: 'GoalForm',
  },
  update_goal: {
    intent: 'update_goal',
    description: 'Update existing goal',
    fields: [
      { name: 'name', label: 'Goal Name', type: 'text', required: false },
      { name: 'amount', label: 'New Target', type: 'number', required: false },
      { name: 'deadline', label: 'New Deadline', type: 'date', required: false },
    ],
    uiComponent: 'GoalForm',
  },
  update_income: {
    intent: 'update_income',
    description: 'Update monthly income',
    fields: [
      { name: 'source', label: 'Source', type: 'text', required: false },
      { name: 'amount', label: 'Monthly Amount', type: 'number', required: true },
    ],
    uiComponent: 'IncomeForm',
  },
  update_expenses: {
    intent: 'update_expenses',
    description: 'Update monthly expenses',
    fields: [
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        options: ['housing', 'food', 'transport', 'subscriptions', 'other'],
        required: false,
      },
      { name: 'amount', label: 'Monthly Amount', type: 'number', required: true },
    ],
    uiComponent: 'ExpenseForm',
  },
  add_skill: {
    intent: 'add_skill',
    description: 'Add a new skill to profile',
    fields: [{ name: 'skill', label: 'Skill Name', type: 'text', required: true }],
    uiComponent: 'SkillForm',
  },
  sell_item: {
    intent: 'sell_item',
    description: 'Add an item to sell',
    fields: [
      { name: 'name', label: 'Item Name', type: 'text', required: true },
      { name: 'estimatedValue', label: 'Estimated Price', type: 'number', required: true },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        options: ['electronics', 'clothing', 'books', 'furniture', 'sports', 'other'],
        required: false,
      },
    ],
    uiComponent: 'InventoryForm',
  },
};

export type ActionContext = {
  profileId: string;
  actionType: ActionType;
  extractedData: Record<string, any>;
};
