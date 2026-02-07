import { ACTIONS, type ActionType, type ActionField } from '~/types/actions';
import type { UIResource } from '~/types/chat';

export interface DispatchResult {
  status: 'ready' | 'missing_info';
  actionType: ActionType;
  data: Record<string, any>;
  uiResource?: UIResource;
  missingFields?: string[];
}

export class ActionDispatcher {
  /**
   * Evaluates if the extracted data is sufficient for the given action.
   * returns 'ready' or 'missing_info' with a UIResource to collect the data.
   */
  static dispatch(
    intent: string,
    extractedData: Record<string, any>,
    contextId: string,
    context: Record<string, any> = {}
  ): DispatchResult {
    // 1. Validate Intent
    const actionType = intent as ActionType;
    const definition = ACTIONS[actionType];

    if (!definition) {
      // Fallback or Unknown intent - treat as "ready" but with caution, or handle error
      // For now, we assume if it's not in our registry, it's not an Action
      throw new Error(`Unknown action type: ${intent}`);
    }

    // 2. Check Required Fields
    const missingFields: string[] = [];
    const fieldsToCollect: ActionField[] = [];

    for (const fieldDefinition of definition.fields) {
      // Hydrate field (options, etc)
      const field = this.hydrateFields(fieldDefinition, context);

      // Hydrate default values if missing
      this.hydrateDefaultValues(field, extractedData, context, actionType);

      if (
        field.required &&
        (extractedData[field.name] === undefined || extractedData[field.name] === null)
      ) {
        missingFields.push(field.name);
        fieldsToCollect.push(field);
      }
    }

    // 3. Result Construction — Always generate a form for HITL confirmation
    // When fields are missing: form collects them. When all provided: prefilled confirmation.
    const allFields = definition.fields.map((fd) => {
      const field = this.hydrateFields(fd, context);
      return {
        name: field.name,
        label: field.label,
        type: field.type,
        options: field.options,
        max: field.max,
        currentValue: extractedData[field.name],
      };
    });

    const uiResource: UIResource = {
      type: 'input_form',
      params: {
        actionId: contextId,
        actionType: actionType,
        uiComponent: definition.uiComponent,
        fields:
          missingFields.length > 0
            ? fieldsToCollect.map((f) => ({
                name: f.name,
                label: f.label,
                type: f.type,
                options: f.options,
                max: f.max,
                currentValue: extractedData[f.name],
              }))
            : allFields,
      },
    };

    if (missingFields.length > 0) {
      return {
        status: 'missing_info',
        actionType,
        data: extractedData,
        uiResource,
        missingFields,
      };
    }

    // 4. Ready — all fields provided, form is prefilled for confirmation
    return {
      status: 'ready',
      actionType,
      data: extractedData,
      uiResource,
    };
  }

  /**
   * Helper to hydrate dynamic fields with data from context (Profile, Goal)
   */
  private static hydrateFields(field: ActionField, context: Record<string, any>): ActionField {
    const hydrated = { ...field };

    // Hydrate Options (e.g. "dynamic:subscriptions")
    if (field.options?.some((opt) => opt.startsWith('dynamic:'))) {
      const dynamicSource = field.options.find((opt) => opt.startsWith('dynamic:'));

      if (dynamicSource === 'dynamic:subscriptions') {
        const subscriptions = (context.subscriptions || []) as { name: string }[];
        // Extract names
        hydrated.options = subscriptions.map((s) => s.name);

        // Fallback if no subscriptions
        if (hydrated.options.length === 0) {
          hydrated.options = ['Netflix', 'Spotify', 'Amazon Prime', 'Gym']; // Fallback common ones
        }
      }
    }

    // Hydrate max for duration fields (months until goal deadline)
    if (field.type === 'duration' && field.name === 'durationMonths' && context.goalDeadline) {
      const now = new Date();
      const deadline = new Date(context.goalDeadline);
      const months =
        (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
      if (months > 0) {
        hydrated.max = months;
      }
    }

    return hydrated;
  }

  /**
   * Helper to calculate dynamic default values
   */
  private static hydrateDefaultValues(
    field: ActionField,
    extractedData: Record<string, any>,
    context: Record<string, any>,
    actionType?: ActionType
  ): void {
    // Logic for "Smart Duration" (Pause until goal deadline)
    if (field.name === 'durationMonths' && !extractedData['durationMonths']) {
      // Check if we have a goal deadline
      if (context.goalDeadline) {
        const now = new Date();
        const deadline = new Date(context.goalDeadline);
        const months =
          (deadline.getFullYear() - now.getFullYear()) * 12 +
          (deadline.getMonth() - now.getMonth());

        if (months > 0) {
          extractedData['durationMonths'] = months;
        }
      }
    }

    // Income pre-fill: use current income for update_income
    if (actionType === 'update_income' && field.name === 'amount' && !extractedData['amount']) {
      if (context.income) {
        extractedData['amount'] = context.income;
      }
    }

    // Expenses pre-fill: use current expenses for update_expenses
    if (actionType === 'update_expenses' && field.name === 'amount' && !extractedData['amount']) {
      if (context.expenses) {
        extractedData['amount'] = context.expenses;
      }
    }

    // Goal Pre-filling — ONLY for goal-related actions (create_goal, update_goal)
    // Do NOT pre-fill income/expense amount from goalAmount (different semantics!)
    const isGoalAction = actionType === 'create_goal' || actionType === 'update_goal';
    if (isGoalAction && field.name === 'name' && !extractedData['name'] && context.goalName) {
      extractedData['name'] = context.goalName;
    }
    if (isGoalAction && field.name === 'amount' && !extractedData['amount'] && context.goalAmount) {
      extractedData['amount'] = context.goalAmount;
    }
    if (
      isGoalAction &&
      field.name === 'deadline' &&
      !extractedData['deadline'] &&
      context.goalDeadline
    ) {
      extractedData['deadline'] = context.goalDeadline;
    }
  }
}
