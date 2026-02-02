/**
 * Chart.js Setup
 *
 * Centralized registration of all Chart.js components.
 * Import this file once at app startup to ensure all components are registered
 * before any charts are rendered.
 *
 * This fixes "X is not a registered controller" errors caused by module load order.
 */

import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Colors,
  Filler,
} from 'chart.js';

// Register all Chart.js components once at module load
Chart.register(
  // Scales
  CategoryScale,
  LinearScale,
  // Elements
  PointElement,
  LineElement,
  BarElement,
  // Controllers (required for chart types)
  LineController,
  BarController,
  // Plugins
  Title,
  Tooltip,
  Legend,
  Colors,
  Filler
);

// Export Chart for convenience
export { Chart };

// Export a flag to confirm registration happened
export const chartSetupComplete = true;
