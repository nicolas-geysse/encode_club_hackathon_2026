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
    contextId: string
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

    // Context for hydration (Profile, Goal)
    // We assume extractedData includes context if passed from chat.ts, allows access to profile props
    // Ideally we should pass context explicitly to dispatch, but for now we might rely on it being merged or passed separately
    // Let's assume extractedData MIGHT have hidden context or we pass it via a separate argument in future refactor.
    // CURRENT HACK: We expect context to be passed in extractedData._context for now, or access global/closure if possible.
    // WAIT: The user request implies we SHOULD pass context.
    // Let's update the signature of `dispatch` slightly or assume `extractedData` contains profile info if updated in chat.ts
    const context = extractedData._context || {};

    for (const fieldDefinition of definition.fields) {
      // Hydrate field (options, etc)
      const field = this.hydrateFields(fieldDefinition, context);

      // Hydrate default values if missing
      this.hydrateDefaultValues(field, extractedData, context);

      if (
        field.required &&
        (extractedData[field.name] === undefined || extractedData[field.name] === null)
      ) {
        missingFields.push(field.name);
        fieldsToCollect.push(field);
      }
    }

    // 3. Result Construction
    if (missingFields.length > 0) {
      // Create Input Form UI
      const uiResource: UIResource = {
        type: 'input_form', // This is a new type we need to add to UIResource definition
        params: {
          actionId: contextId, // Correlation ID
          actionType: actionType,
          fields: fieldsToCollect.map((f) => ({
            name: f.name,
            label: f.label,
            type: f.type,
            options: f.options,
            currentValue: extractedData[f.name],
          })),
        },
      };

      return {
        status: 'missing_info',
        actionType,
        data: extractedData,
        uiResource,
        missingFields,
      };
    }

    // 4. Ready to Execute
    return {
      status: 'ready',
      actionType,
      data: extractedData,
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

    return hydrated;
  }

  /**
   * Helper to calculate dynamic default values
   */
  private static hydrateDefaultValues(
    field: ActionField,
    extractedData: Record<string, any>,
    context: Record<string, any>
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
  }
}
