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

    for (const field of definition.fields) {
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
}
