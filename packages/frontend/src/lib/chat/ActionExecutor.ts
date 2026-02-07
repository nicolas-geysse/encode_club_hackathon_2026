import type { ActionType } from '~/types/actions';
import * as lifestyleService from '~/lib/lifestyleService';
import * as profileService from '~/lib/profileService';
import { goalService } from '~/lib/goalService';
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

        case 'update_income':
          return await this.executeUpdateIncome(data, profileId);

        case 'update_expenses':
          return await this.executeUpdateExpenses(data, profileId);

        case 'create_goal':
          return await this.executeCreateGoal(data, profileId);

        case 'update_goal':
          return await this.executeUpdateGoal(data, profileId);

        case 'add_skill':
          // TODO: Implement generic add skill
          return { success: false, message: 'Add skill not implemented yet' };

        default:
          return { success: false, message: `Unknown action type: ${actionType}` };
      }
    } catch (error) {
      logger.error('Action execution failed', { error, profileId, actionType });
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
      logger.error('Profile not found in executeUpdateBudget', { profileId });
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

  private static async executeCreateGoal(
    data: Record<string, any>,
    profileId: string
  ): Promise<ExecutionResult> {
    const { name, amount, deadline } = data;

    if (!name || !amount) {
      return { success: false, message: 'Missing goal name or amount.' };
    }

    // Check if goal already exists to prevent duplicates or offer update
    const existingGoals = await goalService.listGoals(profileId);
    const duplicate = existingGoals.find(
      (g) => g.name.toLowerCase() === String(name).toLowerCase()
    );
    if (duplicate) {
      return this.executeUpdateGoal({ ...data, oldName: name }, profileId);
    }

    const goal = await goalService.createGoal({
      profileId,
      name,
      amount: Number(amount),
      deadline: deadline || undefined,
      status: 'active',
    });

    if (!goal) {
      logger.error('Failed to create goal', { profileId, data });
      return { success: false, message: 'Failed to create goal.' };
    }

    return {
      success: true,
      message: `Goal "${name}" created with a target of ${amount}€! \uD83C\uDFAF`,
    };
  }

  private static async executeUpdateGoal(
    data: Record<string, any>,
    profileId: string
  ): Promise<ExecutionResult> {
    const { name, amount, deadline, oldName } = data;

    // We need at least a name (current or new) to find the goal, OR existing goal in context
    // For now, assume name is passed or we find the active goal
    const goals = await goalService.listGoals(profileId, { status: 'active' });

    if (goals.length === 0) {
      return { success: false, message: 'No active goal found to update.' };
    }

    // Attempt to match by name if provided, otherwise pick the first active one
    let targetGoal = goals[0];
    if (name || oldName) {
      const searchName = (oldName || name).toLowerCase();
      const found = goals.find((g) => g.name.toLowerCase().includes(searchName));
      if (found) targetGoal = found;
    }

    const update: any = { id: targetGoal.id };
    const changes: string[] = [];

    if (name && name !== targetGoal.name) {
      update.name = name;
      changes.push(`Name: ${name}`);
    }
    if (amount) {
      update.amount = Number(amount);
      changes.push(`Target: ${amount}€`);
    }
    if (deadline) {
      update.deadline = deadline;
      changes.push(`Deadline: ${deadline}`);
    }

    if (changes.length === 0) {
      return { success: true, message: 'No changes detected.' };
    }

    const updated = await goalService.updateGoal(update);
    if (!updated) {
      return { success: false, message: 'Failed to update goal.' };
    }

    return {
      success: true,
      message: `Goal updated! \uD83D\uDCCC\n${changes.join('\n')}`,
    };
  }

  private static async executeUpdateIncome(
    data: Record<string, any>,
    profileId: string
  ): Promise<ExecutionResult> {
    const { amount } = data;
    if (!amount) {
      return { success: false, message: 'Missing income amount.' };
    }

    logger.debug('Loading profile for income update', { profileId });
    const profile = await profileService.loadProfile(profileId);
    if (!profile) {
      logger.error('Profile not found in executeUpdateIncome', { profileId });
      return { success: false, message: 'Profile not found.' };
    }

    await profileService.saveProfile({
      id: profileId,
      name: profile.name,
      monthlyIncome: Number(amount),
    });

    return {
      success: true,
      message: `Income updated to ${amount}€! \uD83D\uDCB8`,
    };
  }

  private static async executeUpdateExpenses(
    data: Record<string, any>,
    profileId: string
  ): Promise<ExecutionResult> {
    const { amount } = data;
    if (!amount) {
      return { success: false, message: 'Missing expense amount.' };
    }

    logger.debug('Loading profile for expense update', { profileId });
    const profile = await profileService.loadProfile(profileId);
    if (!profile) {
      logger.error('Profile not found in executeUpdateExpenses', { profileId });
      return { success: false, message: 'Profile not found.' };
    }

    await profileService.saveProfile({
      id: profileId,
      name: profile.name,
      monthlyExpenses: Number(amount),
    });

    return {
      success: true,
      message: `Expenses updated to ${amount}€! \uD83D\uDCC9`,
    };
  }
}
