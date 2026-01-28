export type ActionType = 'pause_subscription' | 'add_expense' | 'update_budget' | 'create_goal';

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
        type: 'text',
        required: true,
      },
      {
        name: 'durationMonths',
        label: 'Duration (Months)',
        type: 'duration',
        required: true,
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
    description: 'Create a new savings goal',
    fields: [
      { name: 'name', label: 'Goal Name', type: 'text', required: true },
      { name: 'amount', label: 'Target Amount', type: 'number', required: true },
      { name: 'deadline', label: 'Deadline', type: 'date', required: false },
    ],
    uiComponent: 'GoalForm',
  },
};

export type ActionContext = {
  profileId: string;
  actionType: ActionType;
  extractedData: Record<string, any>;
};
