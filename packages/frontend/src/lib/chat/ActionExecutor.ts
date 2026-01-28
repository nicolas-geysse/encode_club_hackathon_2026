import type { ActionType } from '~/types/actions';
import * as lifestyleService from '~/lib/lifestyleService';
import * as profileService from '~/lib/profileService';
import { createLogger } from '~/lib/logger';

const logger = createLogger('ActionExecutor');

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
}

export class ActionExecutor {
  static async execute(
    actionType: ActionType,
    data: Record<string, any>,
    profileId: string
  ): Promise<ExecutionResult> {
    logger.info(`Executing action: ${actionType}`, { data, profileId });

    try {
      switch (actionType) {
        case 'pause_subscription':
          return await this.executePauseSubscription(data, profileId);

        case 'add_expense':
          // TODO: Implement generic add expense
          return { success: false, message: 'Add expense not implemented yet' };

        case 'update_budget':
          return await this.executeUpdateBudget(data, profileId);

        case 'create_goal':
          // TODO: Implement create goal
          return { success: false, message: 'Create goal not implemented yet' };

        default:
          return { success: false, message: `Unknown action type: ${actionType}` };
      }
    } catch (error) {
      logger.error('Action execution failed', { error });
      return {
        success: false,
        message: 'An error occurred while executing the action.',
      };
    }
  }

  private static async executePauseSubscription(
    data: Record<string, any>,
    profileId: string
  ): Promise<ExecutionResult> {
    const { resourceName, durationMonths } = data;

    if (!resourceName || !durationMonths) {
      return { success: false, message: 'Missing required fields for pause_subscription' };
    }

    // 1. Find the subscription item
    const items = await lifestyleService.listItems(profileId);

    const targetItem = items.find(
      (i) => i.name.toLowerCase() === resourceName.toLowerCase() && i.category === 'subscriptions'
    );

    if (!targetItem) {
      return {
        success: false,
        message: `I couldn't find a subscription named "${resourceName}". Please check your "Budget" tab.`,
      };
    }

    // 2. Update the item
    await lifestyleService.updateItem({
      id: targetItem.id,
      pausedMonths: durationMonths,
    });

    const saving = targetItem.currentCost * durationMonths;

    return {
      success: true,
      message: `Done! I've paused **${targetItem.name}** for ${durationMonths} months. You'll save roughly **${saving}€**! 💸`,
    };
  }

  private static async executeUpdateBudget(
    data: Record<string, any>,
    profileId: string
  ): Promise<ExecutionResult> {
    const { income, expenses } = data;

    if (income === undefined && expenses === undefined) {
      return { success: false, message: 'No income or expenses provided to update.' };
    }

    const profile = await profileService.loadProfile(profileId);
    if (!profile) {
      return { success: false, message: 'Profile not found.' };
    }

    const update: any = {
      id: profileId,
      name: profile.name,
    };

    const changes: string[] = [];

    if (income !== undefined) {
      update.monthlyIncome = Number(income);
      changes.push(`Income: ${income}€`);
    }

    if (expenses !== undefined) {
      update.monthlyExpenses = Number(expenses);
      changes.push(`Expenses: ${expenses}€`);
    }

    await profileService.saveProfile(update);

    return {
      success: true,
      message: `Updated your budget! 📉\n${changes.join('\n')}`,
    };
  }
}
