/**
 * Simulation Tools
 *
 * MCP tools for time simulation:
 * - advance_day: Advance simulation by N days
 * - get_simulation_date: Get current simulated date
 * - reset_simulation: Reset to real date
 * - simulate_week_progress: Simulate goal progress with variance
 */

import { query, execute, getSimulationState } from '../services/duckdb.js';
import { trace, getCurrentTraceId } from '../services/opik.js';

// Tool definitions
export const SIMULATION_TOOLS = {
  advance_day: {
    description: 'Advance the simulation by N days',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to advance (default: 1)', default: 1 },
      },
    },
  },

  get_simulation_date: {
    description: 'Get the current simulated date and offset information',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  reset_simulation: {
    description: 'Reset simulation to real date (offset = 0)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  simulate_week_progress: {
    description: 'Simulate goal progress for N weeks with realistic variance',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id: { type: 'string', description: 'Goal ID to simulate progress for' },
        weeks: {
          type: 'number',
          description: 'Number of weeks to simulate (default: 1)',
          default: 1,
        },
        variance: {
          type: 'number',
          description: 'Variance factor 0-1 (default: 0.2)',
          default: 0.2,
        },
        energy_pattern: {
          type: 'string',
          enum: ['stable', 'declining', 'improving', 'variable'],
          description: 'Energy pattern for simulation',
          default: 'variable',
        },
      },
      required: ['goal_id'],
    },
  },
};

// Tool handlers
export async function handleSimulationTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'advance_day':
      return handleAdvanceDay(args);
    case 'get_simulation_date':
      return handleGetSimulationDate();
    case 'reset_simulation':
      return handleResetSimulation();
    case 'simulate_week_progress':
      return handleSimulateWeekProgress(args);
    default:
      throw new Error(`Unknown simulation tool: ${name}`);
  }
}

// Handler implementations
async function handleAdvanceDay(args: Record<string, unknown>) {
  return trace('simulation_advance_day', async (span) => {
    const days = (args.days as number) || 1;

    span.setAttributes({
      'simulation.days_to_advance': days,
    });

    // Get current state
    const currentState = await getSimulationState();
    const newOffsetDays = currentState.offsetDays + days;

    // Calculate new simulated date
    const realDate = new Date();
    const newSimulatedDate = new Date(realDate);
    newSimulatedDate.setDate(newSimulatedDate.getDate() + newOffsetDays);

    // Update simulation state
    await execute(`
      UPDATE simulation_state SET
        simulated_date = '${newSimulatedDate.toISOString().split('T')[0]}',
        real_date = '${realDate.toISOString().split('T')[0]}',
        offset_days = ${newOffsetDays},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 'global'
    `);

    span.setAttributes({
      'simulation.new_offset_days': newOffsetDays,
      'simulation.simulated_date': newSimulatedDate.toISOString().split('T')[0],
      'simulation.is_simulating': newOffsetDays > 0,
    });

    const formattedDate = newSimulatedDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'date-info',
          type: 'metric',
          params: {
            title: 'Date simulée',
            value: formattedDate,
            subtitle: `+${newOffsetDays} jours`,
          },
        },
        {
          id: 'status',
          type: 'text',
          params: {
            content: `Avancé de **${days} jour${days > 1 ? 's' : ''}**. Offset total: **+${newOffsetDays}j**`,
            markdown: true,
          },
        },
      ],
      data: {
        simulatedDate: newSimulatedDate.toISOString().split('T')[0],
        realDate: realDate.toISOString().split('T')[0],
        offsetDays: newOffsetDays,
        isSimulating: true,
      },
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}

async function handleGetSimulationDate() {
  return trace('simulation_get_date', async (span) => {
    const state = await getSimulationState();

    span.setAttributes({
      'simulation.offset_days': state.offsetDays,
      'simulation.is_simulating': state.isSimulating,
    });

    const formattedSimDate = state.simulatedDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formattedRealDate = state.realDate.toLocaleDateString('fr-FR', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'simulated-date',
          type: 'metric',
          params: {
            title: state.isSimulating ? 'Date simulée' : 'Date actuelle',
            value: formattedSimDate,
            subtitle: state.isSimulating
              ? `Réelle: ${formattedRealDate} (+${state.offsetDays}j)`
              : 'Temps réel',
          },
        },
      ],
      data: {
        simulatedDate: state.simulatedDate.toISOString().split('T')[0],
        realDate: state.realDate.toISOString().split('T')[0],
        offsetDays: state.offsetDays,
        isSimulating: state.isSimulating,
      },
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}

async function handleResetSimulation() {
  return trace('simulation_reset', async (span) => {
    const realDate = new Date();

    await execute(`
      UPDATE simulation_state SET
        simulated_date = '${realDate.toISOString().split('T')[0]}',
        real_date = '${realDate.toISOString().split('T')[0]}',
        offset_days = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 'global'
    `);

    span.setAttributes({
      'simulation.reset': true,
      'simulation.offset_days': 0,
    });

    return {
      type: 'text',
      params: {
        content: 'Simulation reset to real time.',
        markdown: true,
      },
      data: {
        simulatedDate: realDate.toISOString().split('T')[0],
        realDate: realDate.toISOString().split('T')[0],
        offsetDays: 0,
        isSimulating: false,
      },
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}

async function handleSimulateWeekProgress(args: Record<string, unknown>) {
  return trace('simulation_week_progress', async (span) => {
    const goalId = args.goal_id as string;
    const weeks = (args.weeks as number) || 1;
    const variance = (args.variance as number) || 0.2;
    const energyPattern = (args.energy_pattern as string) || 'variable';

    span.setAttributes({
      'simulation.goal_id': goalId,
      'simulation.weeks': weeks,
      'simulation.variance': variance,
      'simulation.energy_pattern': energyPattern,
    });

    // Get goal info
    const goals = await query<{
      goal_name: string;
      goal_amount: number;
      weekly_target: number;
      status: string;
    }>(`SELECT goal_name, goal_amount, weekly_target, status FROM goals WHERE id = '${goalId}'`);

    if (goals.length === 0) {
      return {
        type: 'text',
        params: {
          content: `Goal not found: ${goalId}`,
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    const goal = goals[0];
    const weeklyTarget = goal.weekly_target || goal.goal_amount / 12;

    // Get current progress
    const currentProgress = await query<{ week_number: number; earned_amount: number }>(
      `SELECT week_number, earned_amount FROM goal_progress WHERE goal_id = '${goalId}' ORDER BY week_number DESC LIMIT 1`
    );

    const startWeek = currentProgress.length > 0 ? currentProgress[0].week_number + 1 : 1;
    let totalEarned = currentProgress.length > 0 ? Number(currentProgress[0].earned_amount) : 0;

    // Generate energy based on pattern
    const generateEnergy = (week: number): number => {
      const baseEnergy = 3;
      switch (energyPattern) {
        case 'stable':
          return Math.max(1, Math.min(5, baseEnergy + Math.random() * 0.5 - 0.25));
        case 'declining':
          return Math.max(1, Math.min(5, baseEnergy - week * 0.3 + Math.random() * 0.5));
        case 'improving':
          return Math.max(1, Math.min(5, baseEnergy + week * 0.2 + Math.random() * 0.5 - 0.25));
        case 'variable':
        default:
          return Math.max(1, Math.min(5, baseEnergy + Math.random() * 2 - 1));
      }
    };

    const weekResults: Array<{
      week: number;
      target: number;
      earned: number;
      energy: number;
      status: string;
    }> = [];

    // Simulate each week
    for (let i = 0; i < weeks; i++) {
      const weekNum = startWeek + i;
      const energy = generateEnergy(i);

      // Calculate earned with variance based on energy
      const energyMultiplier = 0.6 + (energy / 5) * 0.6; // 0.6 to 1.2 based on energy
      const varianceFactor = 1 + (Math.random() * 2 - 1) * variance;
      const earned = Math.round(weeklyTarget * energyMultiplier * varianceFactor);

      totalEarned += earned;

      // Determine status
      let status = 'on_track';
      const expectedTotal = weeklyTarget * weekNum;
      const paceRatio = totalEarned / expectedTotal;
      if (paceRatio < 0.7) status = 'behind';
      else if (paceRatio < 0.9) status = 'at_risk';
      else if (paceRatio > 1.1) status = 'ahead';

      // Insert progress record
      const progressId = `${goalId}-week-${weekNum}`;
      await execute(`
        INSERT INTO goal_progress (id, goal_id, week_number, target_amount, earned_amount, pace_ratio, risk_alert)
        VALUES ('${progressId}', '${goalId}', ${weekNum}, ${weeklyTarget}, ${earned}, ${paceRatio.toFixed(2)}, '${status}')
        ON CONFLICT (goal_id, week_number) DO UPDATE SET
          earned_amount = ${earned},
          pace_ratio = ${paceRatio.toFixed(2)},
          risk_alert = '${status}'
      `);

      weekResults.push({
        week: weekNum,
        target: weeklyTarget,
        earned,
        energy: Math.round(energy),
        status,
      });
    }

    // Advance simulation date
    const daysToAdvance = weeks * 7;
    const currentState = await getSimulationState();
    const newOffsetDays = currentState.offsetDays + daysToAdvance;
    const realDate = new Date();
    const newSimulatedDate = new Date(realDate);
    newSimulatedDate.setDate(newSimulatedDate.getDate() + newOffsetDays);

    await execute(`
      UPDATE simulation_state SET
        simulated_date = '${newSimulatedDate.toISOString().split('T')[0]}',
        offset_days = ${newOffsetDays},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 'global'
    `);

    span.setAttributes({
      'simulation.total_earned': totalEarned,
      'simulation.weeks_simulated': weeks,
      'simulation.new_offset_days': newOffsetDays,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'summary',
          type: 'metric',
          params: {
            title: `Progression ${goal.goal_name}`,
            value: `${totalEarned}€ / ${goal.goal_amount}€`,
            subtitle: `${Math.round((totalEarned / goal.goal_amount) * 100)}% complété`,
          },
        },
        {
          id: 'week-results',
          type: 'table',
          params: {
            title: `Semaines simulées (+${weeks})`,
            columns: [
              { key: 'week', label: 'Sem.' },
              { key: 'target', label: 'Cible' },
              { key: 'earned', label: 'Gagné' },
              { key: 'energy', label: 'Énergie' },
              { key: 'status', label: 'Status' },
            ],
            rows: weekResults.map((w) => ({
              week: `S${w.week}`,
              target: `${w.target}€`,
              earned: `${w.earned}€`,
              energy: '⚡'.repeat(w.energy),
              status:
                w.status === 'ahead'
                  ? '🟢'
                  : w.status === 'on_track'
                    ? '🔵'
                    : w.status === 'at_risk'
                      ? '🟡'
                      : '🔴',
            })),
          },
        },
        {
          id: 'date-status',
          type: 'text',
          params: {
            content: `Date simulée avancée de **${daysToAdvance}j** → **${newSimulatedDate.toLocaleDateString('fr-FR')}**`,
            markdown: true,
          },
        },
      ],
      data: {
        goalId,
        totalEarned,
        goalAmount: goal.goal_amount,
        progressPercent: Math.round((totalEarned / goal.goal_amount) * 100),
        weekResults,
        simulatedDate: newSimulatedDate.toISOString().split('T')[0],
        offsetDays: newOffsetDays,
      },
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}
