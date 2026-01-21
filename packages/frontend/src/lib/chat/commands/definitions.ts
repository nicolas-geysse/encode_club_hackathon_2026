/**
 * Slash Command Definitions
 *
 * Interactive MCP-UI triggers that users can type in chat.
 * Each command returns a UIResource that renders with @seed-ship/mcp-ui-solid.
 */

import type { UIResource } from '../../../types/chat';

export interface SlashCommandResult {
  response: string;
  uiResource: UIResource;
  extractedData?: Record<string, unknown>;
}

export type SlashCommandHandler = (
  context: Record<string, unknown>,
  profileId?: string
) => Promise<SlashCommandResult> | SlashCommandResult;

/**
 * Available slash commands
 */
export const SLASH_COMMANDS: Record<string, SlashCommandHandler> = {
  /**
   * /budget - Show budget summary with metrics
   */
  budget: (context) => {
    const income = (context.monthlyIncome as number) || 0;
    const expenses = (context.monthlyExpenses as number) || 0;
    const margin = income - expenses;
    const savingsRate = income > 0 ? Math.round((margin / income) * 100) : 0;

    return {
      response: "Here's your budget overview:",
      uiResource: {
        type: 'composite',
        components: [
          {
            type: 'grid',
            params: {
              columns: 3,
              children: [
                {
                  type: 'metric',
                  params: {
                    title: 'Monthly Income',
                    value: income,
                    unit: '€',
                    trend: { direction: 'up', value: '+0%' },
                  },
                },
                {
                  type: 'metric',
                  params: {
                    title: 'Monthly Expenses',
                    value: expenses,
                    unit: '€',
                    trend: { direction: 'down', value: '-0%' },
                  },
                },
                {
                  type: 'metric',
                  params: {
                    title: 'Savings Rate',
                    value: savingsRate,
                    unit: '%',
                    subtitle: `${margin}€ available`,
                    trend: { direction: margin >= 0 ? 'up' : 'down' },
                  },
                },
              ],
            },
          },
        ],
      },
    };
  },

  /**
   * /goal - Show goal confirmation form
   */
  goal: (context) => {
    return {
      response: "Let's set up your savings goal:",
      uiResource: {
        type: 'form',
        params: {
          title: '🎯 New Savings Goal',
          fields: [
            {
              name: 'goalName',
              label: 'What are you saving for?',
              type: 'text',
              required: true,
              value: (context.goalName as string) || '',
            },
            {
              name: 'goalAmount',
              label: 'Target amount (€)',
              type: 'number',
              required: true,
              value: (context.goalAmount as number) || '',
            },
            {
              name: 'goalDeadline',
              label: 'Target date',
              type: 'date',
              required: true,
              value: (context.goalDeadline as string) || '',
            },
          ],
          submitLabel: 'Set Goal',
        },
      },
    };
  },

  /**
   * /skills - Show skills table with job matching potential
   */
  skills: (context) => {
    const skills = (context.skills as string[]) || [];

    if (skills.length === 0) {
      return {
        response: "You haven't added any skills yet. Tell me what you're good at!",
        uiResource: {
          type: 'text',
          params: {
            content:
              "💡 **Tip:** Share your skills like 'I know Python and Excel' or 'I can do tutoring and photography'",
            markdown: true,
          },
        },
      };
    }

    // Mock job matching data - in real app would call skill arbitrage algo
    const skillsWithScores = skills.map((skill) => ({
      skill,
      demandScore: Math.floor(Math.random() * 40) + 60, // 60-100
      avgRate: Math.floor(Math.random() * 20) + 15, // 15-35€/h
      matchedJobs: Math.floor(Math.random() * 10) + 1,
    }));

    return {
      response: `Found ${skills.length} skills in your profile:`,
      uiResource: {
        type: 'table',
        params: {
          title: '🛠️ Your Skills & Market Potential',
          columns: [
            { key: 'skill', label: 'Skill' },
            { key: 'demandScore', label: 'Demand' },
            { key: 'avgRate', label: 'Avg Rate' },
            { key: 'matchedJobs', label: 'Jobs' },
          ],
          rows: skillsWithScores.map((s) => ({
            skill: s.skill,
            demandScore: `${s.demandScore}%`,
            avgRate: `${s.avgRate}€/h`,
            matchedJobs: `${s.matchedJobs} offers`,
          })),
        },
      },
    };
  },

  /**
   * /swipe - Navigate to swipe scenarios
   */
  swipe: () => {
    return {
      response: 'Ready to explore money-saving scenarios? Swipe right to try, left to skip!',
      uiResource: {
        type: 'composite',
        components: [
          {
            type: 'text',
            params: {
              content:
                "**Swipe Scenarios** help you discover budget strategies through quick decisions. It's like Tinder for your wallet! 💸",
              markdown: true,
            },
          },
          {
            type: 'action',
            params: {
              type: 'button',
              label: '🎴 Start Swiping',
              variant: 'primary',
              action: 'navigate',
              params: { to: '/plan', tab: 'swipe' },
            },
          },
        ],
      },
    };
  },

  /**
   * /summary - Full profile summary
   */
  summary: (context) => {
    const name = (context.name as string) || 'Student';
    const income = (context.monthlyIncome as number) || 0;
    const expenses = (context.monthlyExpenses as number) || 0;
    const goalName = (context.goalName as string) || 'Not set';
    const goalAmount = (context.goalAmount as number) || 0;
    const skills = (context.skills as string[]) || [];

    return {
      response: `Here's your complete profile, ${name}:`,
      uiResource: {
        type: 'composite',
        components: [
          {
            type: 'grid',
            params: {
              columns: 2,
              children: [
                {
                  type: 'metric',
                  params: {
                    title: 'Monthly Budget',
                    value: income - expenses,
                    unit: '€ margin',
                    subtitle: `${income}€ in - ${expenses}€ out`,
                  },
                },
                {
                  type: 'metric',
                  params: {
                    title: 'Savings Goal',
                    value: goalAmount,
                    unit: '€',
                    subtitle: goalName,
                  },
                },
              ],
            },
          },
          {
            type: 'text',
            params: {
              content: `**Skills:** ${skills.length > 0 ? skills.join(', ') : 'None added yet'}`,
              markdown: true,
            },
          },
          {
            type: 'action',
            params: {
              type: 'button',
              label: '📊 View Full Plan',
              variant: 'primary',
              action: 'navigate',
              params: { to: '/plan' },
            },
          },
        ],
      },
    };
  },

  /**
   * /help - Show available commands
   */
  help: () => {
    return {
      response: 'Here are the available commands:',
      uiResource: {
        type: 'table',
        params: {
          title: '⌨️ Chat Commands',
          columns: [
            { key: 'command', label: 'Command' },
            { key: 'description', label: 'What it does' },
          ],
          rows: [
            { command: '/budget', description: 'Show your budget summary' },
            { command: '/goal', description: 'Set or update your savings goal' },
            { command: '/skills', description: 'View your skills & job matching' },
            { command: '/swipe', description: 'Start swipe scenarios' },
            { command: '/summary', description: 'Full profile overview' },
            { command: '/help', description: 'Show this help' },
          ],
        },
      },
    };
  },
};
