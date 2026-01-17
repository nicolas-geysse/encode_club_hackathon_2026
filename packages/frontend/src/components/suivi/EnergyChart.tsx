/**
 * Energy Chart Component
 *
 * Chart.js-powered visualization of energy levels over time.
 * Shows trend lines, thresholds, and energy debt zones.
 */

// Note: solid-js reactivity is handled by solid-chartjs internally
import { Chart, Title, Tooltip, Legend, Colors, Filler } from 'chart.js';
import { Line } from 'solid-chartjs';

// Register Chart.js components
Chart.register(Title, Tooltip, Legend, Colors, Filler);

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
          label: 'Energie',
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
          label: 'Seuil Energy Debt',
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
            if (label === 'Seuil Energy Debt') {
              return `Seuil: ${level}%`;
            }
            const status =
              level >= 80
                ? 'Au top !'
                : level >= 60
                  ? 'Ca va'
                  : level >= 40
                    ? 'Fatigue'
                    : 'Energy Debt';
            return `Energie: ${level}% (${status})`;
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
    <div class="card">
      <h3 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
        <span>📊</span> Evolution de l'energie
      </h3>

      <div class="h-64">
        {props.history.length > 0 ? (
          <Line data={chartData()} options={chartOptions} />
        ) : (
          <div class="h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
            <div class="text-center">
              <div class="text-4xl mb-2">📈</div>
              <p>Pas encore de donnees</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats summary */}
      {props.history.length > 0 && (
        <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {Math.round(
                props.history.reduce((sum, e) => sum + e.level, 0) / props.history.length
              )}
              %
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Moyenne</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">
              {Math.max(...props.history.map((e) => e.level))}%
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Max</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-red-600 dark:text-red-400">
              {Math.min(...props.history.map((e) => e.level))}%
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Min</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnergyChart;
