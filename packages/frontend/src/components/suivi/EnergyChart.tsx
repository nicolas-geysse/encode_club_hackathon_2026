/**
 * Energy Chart Component
 *
 * Chart.js-powered visualization of each week's energy level.
 * Shows trend lines, thresholds, and energy debt zones.
 */

// Note: solid-js reactivity is handled by solid-chartjs internally
import {
  Chart,
  Title,
  Tooltip,
  Legend,
  Colors,
  Filler,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
} from 'chart.js';
import { Line } from 'solid-chartjs';
import { Card, CardContent } from '~/components/ui/Card';
import { BarChart3, TrendingUp } from 'lucide-solid';
import { Show } from 'solid-js';

// Register Chart.js components - must include all required for Line chart
Chart.register(
  Title,
  Tooltip,
  Legend,
  Colors,
  Filler,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController
);

interface EnergyEntry {
  week: number;
  level: number;
  date: string;
}

interface EnergyChartProps {
  history: EnergyEntry[];
  threshold?: number;
  showTrend?: boolean;
}

export function EnergyChart(props: EnergyChartProps) {
  const threshold = () => props.threshold ?? 40;

  // Chart data reactive to history changes
  const chartData = () => {
    const labels = props.history.map((e) => `S${e.week}`);
    const data = props.history.map((e) => e.level);

    return {
      labels,
      datasets: [
        {
          label: 'Energy',
          data,
          borderColor: '#6366f1', // primary color
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: data.map((level) =>
            level < threshold() ? '#ef4444' : level < 60 ? '#f59e0b' : '#22c55e'
          ),
          pointRadius: 6,
          pointHoverRadius: 8,
        },
        {
          label: 'Threshold',
          data: Array(labels.length).fill(threshold()),
          borderColor: '#ef4444',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: { dataset: { label: string }; parsed: { y: number } }) => {
            const level = context.parsed.y;
            const label = context.dataset.label;
            if (label === 'Threshold') {
              return `Threshold: ${level}%`;
            }
            const status =
              level >= 80 ? 'Excellent' : level >= 60 ? 'Good' : level >= 40 ? 'Fair' : 'Critical';
            return `Energy: ${level}% (${status})`;
          },
        },
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          callback: (value: number) => `${value}%`,
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  };

  return (
    <Card>
      <CardContent class="p-6">
        <h3 class="font-semibold text-foreground mb-4 flex items-center gap-2">
          <BarChart3 class="h-5 w-5 text-primary" /> Energy Evolution
        </h3>

        <div class="h-64 w-full">
          <Show
            when={props.history.length > 0}
            fallback={
              <div class="h-full flex items-center justify-center text-muted-foreground flex-col gap-2">
                <TrendingUp class="h-8 w-8 opacity-50" />
                <p>No data yet</p>
              </div>
            }
          >
            <Line data={chartData()} options={chartOptions} width={100} height={100} />
          </Show>
        </div>

        {/* Stats summary */}
        <Show when={props.history.length > 0}>
          <div class="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold text-primary">
                {Math.round(
                  props.history.reduce((sum, e) => sum + e.level, 0) / props.history.length
                )}
                %
              </div>
              <div class="text-xs text-muted-foreground">Average</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-green-600 dark:text-green-400">
                {Math.max(...props.history.map((e) => e.level))}%
              </div>
              <div class="text-xs text-muted-foreground">Max</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-destructive">
                {Math.min(...props.history.map((e) => e.level))}%
              </div>
              <div class="text-xs text-muted-foreground">Min</div>
            </div>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}

export default EnergyChart;
