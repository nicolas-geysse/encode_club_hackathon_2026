/**
 * What-If Scenario Simulator
 *
 * Allows users to create simulation profiles to explore
 * the impact of changes (new job, reduced expenses) on their goals.
 *
 * FLOW:
 * 1. User adds scenarios (temporary preview in this modal)
 * 2. User sees impact comparison (current vs simulated)
 * 3. User saves as simulation profile (creates new profile in DB)
 * 4. Simulation profile appears in ProfileSelector dropdown
 * 5. User can switch between original and simulation profiles
 */

import { createSignal, onMount, Show, For } from 'solid-js';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
  FlaskConical,
  Plus,
  Trash2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  X,
  Zap,
  Users,
} from 'lucide-solid';
import {
  createSimulationProfile,
  listProfiles,
  type FullProfile,
  type ProfileSummary,
} from '~/lib/profileService';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { createLogger } from '~/lib/logger';
import { toastPopup } from '~/components/ui/Toast';

const logger = createLogger('WhatIfSimulator');

interface WhatIfSimulatorProps {
  profile: FullProfile;
  currency?: Currency;
  onClose?: () => void;
  onSimulationCreated?: (simulation: FullProfile) => void;
}

interface SimulationScenario {
  id: string;
  type: 'job' | 'expense' | 'hours';
  name: string;
  // Job specific
  hourlyRate?: number;
  hoursPerWeek?: number;
  // Expense specific
  reduction?: number;
  // Hours specific
  additionalHours?: number;
}

interface SimulationResult {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyMargin: number;
  weeklyHours: number;
  weeksToGoal: number;
  energyImpact: 'positive' | 'neutral' | 'negative';
}

export function WhatIfSimulator(props: WhatIfSimulatorProps) {
  const [scenarios, setScenarios] = createSignal<SimulationScenario[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [showAddForm, setShowAddForm] = createSignal(true); // Start with form open
  const [newScenarioType, setNewScenarioType] = createSignal<'job' | 'expense' | 'hours'>('job');
  const [existingSimulations, setExistingSimulations] = createSignal<ProfileSummary[]>([]);

  // Form values
  const [jobName, setJobName] = createSignal('');
  const [jobRate, setJobRate] = createSignal(20);
  const [jobHours, setJobHours] = createSignal(10);
  const [expenseReduction, setExpenseReduction] = createSignal(50);
  const [additionalHours, setAdditionalHours] = createSignal(5);

  const currency = () => props.currency || 'EUR';

  // Fetch existing simulation profiles on mount
  onMount(async () => {
    try {
      const profiles = await listProfiles();
      const simulations = profiles.filter((p) => p.profileType === 'simulation');
      setExistingSimulations(simulations);
    } catch {
      // Ignore errors
    }
  });

  // Calculate current state
  const currentState = (): SimulationResult => {
    const profile = props.profile;
    const monthlyIncome = profile.monthlyIncome || 0;
    const monthlyExpenses = profile.monthlyExpenses || 0;
    const monthlyMargin = monthlyIncome - monthlyExpenses;
    const weeklyHours = profile.maxWorkHoursWeekly || 20;
    const goalAmount = profile.goalAmount || 1000;
    const weeksToGoal = monthlyMargin > 0 ? Math.ceil(goalAmount / (monthlyMargin / 4)) : Infinity;

    return {
      monthlyIncome,
      monthlyExpenses,
      monthlyMargin,
      weeklyHours,
      weeksToGoal: weeksToGoal === Infinity ? 999 : weeksToGoal,
      energyImpact: 'neutral',
    };
  };

  // Calculate simulation result with all scenarios applied
  const simulationResult = (): SimulationResult => {
    const current = currentState();
    let income = current.monthlyIncome;
    let expenses = current.monthlyExpenses;
    let hours = current.weeklyHours;

    for (const scenario of scenarios()) {
      if (scenario.type === 'job' && scenario.hourlyRate && scenario.hoursPerWeek) {
        income += scenario.hourlyRate * scenario.hoursPerWeek * 4;
        hours += scenario.hoursPerWeek;
      } else if (scenario.type === 'expense' && scenario.reduction) {
        expenses = Math.max(0, expenses - scenario.reduction);
      } else if (scenario.type === 'hours' && scenario.additionalHours) {
        // Assume current hourly rate for additional hours
        const avgRate = props.profile.minHourlyRate || 15;
        income += avgRate * scenario.additionalHours * 4;
        hours += scenario.additionalHours;
      }
    }

    const margin = income - expenses;
    const goalAmount = props.profile.goalAmount || 1000;
    const weeksToGoal = margin > 0 ? Math.ceil(goalAmount / (margin / 4)) : 999;

    // Energy impact based on hours change
    const hoursChange = hours - current.weeklyHours;
    let energyImpact: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (hoursChange > 10) energyImpact = 'negative';
    else if (hoursChange < 0) energyImpact = 'positive';

    return {
      monthlyIncome: income,
      monthlyExpenses: expenses,
      monthlyMargin: margin,
      weeklyHours: hours,
      weeksToGoal,
      energyImpact,
    };
  };

  const addScenario = () => {
    const type = newScenarioType();
    let scenario: SimulationScenario;

    if (type === 'job') {
      scenario = {
        id: `job_${Date.now()}`,
        type: 'job',
        name: jobName() || 'New Job',
        hourlyRate: jobRate(),
        hoursPerWeek: jobHours(),
      };
    } else if (type === 'expense') {
      scenario = {
        id: `exp_${Date.now()}`,
        type: 'expense',
        name: `Reduce expenses by ${formatCurrency(expenseReduction(), currency())}`,
        reduction: expenseReduction(),
      };
    } else {
      scenario = {
        id: `hrs_${Date.now()}`,
        type: 'hours',
        name: `Work ${additionalHours()} more hours/week`,
        additionalHours: additionalHours(),
      };
    }

    setScenarios([...scenarios(), scenario]);
    toastPopup.success('Scenario added!', scenario.name);
    // Keep form open for adding more, but reset values
    resetForm();
  };

  const removeScenario = (id: string) => {
    setScenarios(scenarios().filter((s) => s.id !== id));
  };

  const resetForm = () => {
    setJobName('');
    setJobRate(20);
    setJobHours(10);
    setExpenseReduction(50);
    setAdditionalHours(5);
  };

  const createSimulation = async () => {
    if (scenarios().length === 0) {
      toastPopup.error('Add scenarios', 'Add at least one scenario before creating simulation');
      return;
    }

    setLoading(true);
    try {
      // Find first job scenario for modification
      const jobScenario = scenarios().find((s) => s.type === 'job');
      const expScenario = scenarios().find((s) => s.type === 'expense');

      const simulation = await createSimulationProfile(props.profile.id, {
        name: `What-If: ${scenarios()
          .map((s) => s.name)
          .join(' + ')}`,
        newJob: jobScenario
          ? {
              name: jobScenario.name,
              hourlyRate: jobScenario.hourlyRate || 20,
              hoursPerWeek: jobScenario.hoursPerWeek || 10,
            }
          : undefined,
        reducedExpense: expScenario
          ? {
              category: 'general',
              reduction: expScenario.reduction || 0,
            }
          : undefined,
        additionalHoursPerWeek: scenarios()
          .filter((s) => s.type === 'hours')
          .reduce((sum, s) => sum + (s.additionalHours || 0), 0),
      });

      if (simulation) {
        toastPopup.success('Simulation active!', 'Reloading to show simulation...');
        props.onSimulationCreated?.(simulation);
        // Reload to switch to the new simulation profile
        setTimeout(() => window.location.reload(), 500);
      } else {
        toastPopup.error('Error', 'Failed to create simulation');
      }
    } catch (error) {
      logger.error('Failed to create simulation', { error });
      toastPopup.error('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const current = currentState;
  const simulated = simulationResult;
  const hasScenarios = () => scenarios().length > 0;

  const marginDiff = () => simulated().monthlyMargin - current().monthlyMargin;
  const weeksDiff = () => current().weeksToGoal - simulated().weeksToGoal;

  return (
    <Card class="border-purple-500/30 bg-background shadow-xl">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="flex items-center gap-2 text-purple-700 dark:text-purple-300">
            <FlaskConical class="h-5 w-5" />
            What-If Simulator
          </CardTitle>
          <Show when={props.onClose}>
            <Button variant="ghost" size="icon" class="h-8 w-8" onClick={props.onClose}>
              <X class="h-4 w-4" />
            </Button>
          </Show>
        </div>
        <p class="text-sm text-muted-foreground">
          Add scenarios below to see their impact, then save as a simulation profile
        </p>
      </CardHeader>

      <CardContent class="space-y-4">
        {/* Existing Simulations */}
        <Show when={existingSimulations().length > 0}>
          <div class="p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
            <div class="flex items-center gap-2 mb-2">
              <Users class="h-4 w-4 text-purple-600" />
              <span class="text-sm font-medium">
                Your Simulations ({existingSimulations().length})
              </span>
            </div>
            <div class="space-y-1">
              <For each={existingSimulations()}>
                {(sim) => (
                  <div class="flex items-center justify-between text-sm p-2 bg-background rounded">
                    <span class="truncate flex-1">{sim.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 text-xs text-purple-600"
                      onClick={() => {
                        // Switch to this simulation profile
                        window.location.href = `/plan?profile=${sim.id}`;
                      }}
                    >
                      Switch
                    </Button>
                  </div>
                )}
              </For>
            </div>
            <p class="text-xs text-muted-foreground mt-2">
              Switch between profiles using the dropdown at the top of the page
            </p>
          </div>
        </Show>
        {/* Create New Simulation */}
        <div class="border-t border-purple-500/20 pt-4">
          <h4 class="text-sm font-medium mb-3 flex items-center gap-2">
            <Plus class="h-4 w-4" />
            Create New Simulation
          </h4>

          {/* Scenarios List */}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-medium">Scenarios</h4>
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-xs border-purple-500/30 text-purple-700 dark:text-purple-300"
                onClick={() => setShowAddForm(true)}
              >
                <Plus class="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>

            <Show
              when={scenarios().length > 0}
              fallback={
                <div class="text-center py-6 border-2 border-dashed border-purple-500/30 rounded-lg">
                  <p class="text-sm text-muted-foreground mb-2">No scenarios yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    class="border-purple-500/30 text-purple-700 dark:text-purple-300"
                    onClick={() => setShowAddForm(true)}
                  >
                    <Plus class="h-4 w-4 mr-1" />
                    Add your first scenario
                  </Button>
                </div>
              }
            >
              <div class="space-y-2">
                <For each={scenarios()}>
                  {(scenario) => (
                    <div class="flex items-center justify-between p-2 bg-muted rounded-lg border border-purple-500/20">
                      <div class="flex items-center gap-2">
                        <span
                          class={`px-2 py-0.5 rounded text-xs font-medium ${
                            scenario.type === 'job'
                              ? 'bg-green-500/10 text-green-600'
                              : scenario.type === 'expense'
                                ? 'bg-blue-500/10 text-blue-600'
                                : 'bg-orange-500/10 text-orange-600'
                          }`}
                        >
                          {scenario.type === 'job'
                            ? 'Job'
                            : scenario.type === 'expense'
                              ? 'Expense'
                              : 'Hours'}
                        </span>
                        <span class="text-sm">{scenario.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeScenario(scenario.id)}
                      >
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Add Scenario Form */}
          <Show when={showAddForm()}>
            <div class="p-3 bg-muted rounded-lg border border-purple-500/20 space-y-3">
              <div class="flex gap-2">
                <Button
                  variant={newScenarioType() === 'job' ? 'default' : 'outline'}
                  size="sm"
                  class="text-xs"
                  onClick={() => setNewScenarioType('job')}
                >
                  New Job
                </Button>
                <Button
                  variant={newScenarioType() === 'expense' ? 'default' : 'outline'}
                  size="sm"
                  class="text-xs"
                  onClick={() => setNewScenarioType('expense')}
                >
                  Cut Expense
                </Button>
                <Button
                  variant={newScenarioType() === 'hours' ? 'default' : 'outline'}
                  size="sm"
                  class="text-xs"
                  onClick={() => setNewScenarioType('hours')}
                >
                  More Hours
                </Button>
              </div>

              <Show when={newScenarioType() === 'job'}>
                <div class="space-y-2">
                  <Input
                    placeholder="Job name (e.g., Freelance React)"
                    value={jobName()}
                    onInput={(e) => setJobName(e.currentTarget.value)}
                    class="h-8 text-sm"
                  />
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="text-xs text-muted-foreground">Hourly Rate</label>
                      <Input
                        type="number"
                        value={jobRate()}
                        onInput={(e) => setJobRate(Number(e.currentTarget.value))}
                        class="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label class="text-xs text-muted-foreground">Hours/Week</label>
                      <Input
                        type="number"
                        value={jobHours()}
                        onInput={(e) => setJobHours(Number(e.currentTarget.value))}
                        class="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </Show>

              <Show when={newScenarioType() === 'expense'}>
                <div>
                  <label class="text-xs text-muted-foreground">Monthly Reduction</label>
                  <Input
                    type="number"
                    value={expenseReduction()}
                    onInput={(e) => setExpenseReduction(Number(e.currentTarget.value))}
                    class="h-8 text-sm"
                  />
                </div>
              </Show>

              <Show when={newScenarioType() === 'hours'}>
                <div>
                  <label class="text-xs text-muted-foreground">Additional Hours/Week</label>
                  <Input
                    type="number"
                    value={additionalHours()}
                    onInput={(e) => setAdditionalHours(Number(e.currentTarget.value))}
                    class="h-8 text-sm"
                  />
                </div>
              </Show>

              <div class="flex gap-2">
                <Button
                  size="sm"
                  class="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={addScenario}
                >
                  <Plus class="h-4 w-4 mr-1" />
                  Add Scenario
                </Button>
                <Show when={scenarios().length > 0}>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-xs"
                    onClick={() => setShowAddForm(false)}
                  >
                    Done
                  </Button>
                </Show>
              </div>
            </div>
          </Show>

          {/* Comparison */}
          <Show when={hasScenarios()}>
            <div class="border-t border-purple-500/20 pt-4">
              <h4 class="text-sm font-medium mb-3">Impact Comparison</h4>
              <div class="grid grid-cols-3 gap-2 text-center">
                {/* Current */}
                <div class="p-2 bg-muted/30 rounded-lg">
                  <div class="text-xs text-muted-foreground mb-1">Current</div>
                  <div class="text-lg font-bold">
                    {formatCurrency(current().monthlyMargin, currency())}
                  </div>
                  <div class="text-xs text-muted-foreground">/month</div>
                </div>

                {/* Arrow */}
                <div class="flex items-center justify-center">
                  <ArrowRight class="h-6 w-6 text-purple-500" />
                </div>

                {/* Simulated */}
                <div
                  class={`p-2 rounded-lg ${marginDiff() > 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}
                >
                  <div class="text-xs text-muted-foreground mb-1">Simulated</div>
                  <div
                    class={`text-lg font-bold ${marginDiff() > 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatCurrency(simulated().monthlyMargin, currency())}
                  </div>
                  <div class="text-xs text-muted-foreground">/month</div>
                </div>
              </div>

              {/* Key metrics */}
              <div class="grid grid-cols-3 gap-2 mt-3">
                <div class="flex items-center gap-2 text-sm">
                  <DollarSign class="h-4 w-4 text-muted-foreground" />
                  <span
                    class={
                      marginDiff() > 0 ? 'text-green-600' : marginDiff() < 0 ? 'text-red-600' : ''
                    }
                  >
                    {marginDiff() >= 0 ? '+' : ''}
                    {formatCurrency(marginDiff(), currency())}
                  </span>
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <Clock class="h-4 w-4 text-muted-foreground" />
                  <span class={weeksDiff() > 0 ? 'text-green-600' : ''}>
                    {weeksDiff() > 0 ? `-${weeksDiff()}` : `+${Math.abs(weeksDiff())}`} weeks
                  </span>
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <Zap class="h-4 w-4 text-muted-foreground" />
                  <span
                    class={
                      simulated().energyImpact === 'positive'
                        ? 'text-green-600'
                        : simulated().energyImpact === 'negative'
                          ? 'text-orange-600'
                          : ''
                    }
                  >
                    {simulated().energyImpact === 'positive'
                      ? 'More rest'
                      : simulated().energyImpact === 'negative'
                        ? 'Intense'
                        : 'Stable'}
                  </span>
                </div>
              </div>

              {/* Energy warning */}
              <Show when={simulated().energyImpact === 'negative'}>
                <div class="mt-3 p-2 bg-orange-500/10 rounded-lg text-sm text-orange-700 dark:text-orange-300">
                  <TrendingDown class="h-4 w-4 inline mr-1" />
                  Warning: This scenario significantly increases your workload. Consider spreading
                  it over time.
                </div>
              </Show>

              {/* Positive outcome */}
              <Show when={weeksDiff() > 4}>
                <div class="mt-3 p-2 bg-green-500/10 rounded-lg text-sm text-green-700 dark:text-green-300">
                  <TrendingUp class="h-4 w-4 inline mr-1" />
                  Great! You'd reach your goal {weeksDiff()} weeks earlier.
                </div>
              </Show>
            </div>
          </Show>

          {/* Action buttons */}
          <Show when={hasScenarios()}>
            <div class="space-y-2 pt-2">
              <div class="flex gap-2">
                <Button
                  class="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={createSimulation}
                  disabled={loading()}
                >
                  {loading() ? 'Creating...' : 'Save as Simulation Profile'}
                </Button>
                <Button variant="outline" onClick={() => setScenarios([])}>
                  Reset
                </Button>
              </div>
              <p class="text-xs text-center text-muted-foreground">
                Saved simulations appear in the profile selector (top of page)
              </p>
            </div>
          </Show>
        </div>{' '}
        {/* Close Create New Simulation section */}
      </CardContent>
    </Card>
  );
}

export default WhatIfSimulator;
