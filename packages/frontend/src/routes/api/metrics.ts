/* eslint-disable no-console */
/**
 * Metrics API Route
 *
 * Provides aggregated observability metrics from Opik for the Stride dashboard.
 * Returns trace counts, token usage, costs, latency, and daily breakdowns.
 */

import type { APIEvent } from '@solidjs/start/server';
import {
  getProjectStats,
  getMetricDailyData,
  isOpikRestAvailable,
  listEvaluators,
  listFeedbackDefinitions,
  listTraces,
  aggregateTracesByTags,
  type MetricDataPoint,
} from '../../lib/opikRest';

// Configuration
const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';

/**
 * Aggregated metrics response
 */
export interface MetricsResponse {
  /** Whether Opik API is available */
  available: boolean;

  /** Project identifier */
  project: string;

  /** Time range for metrics */
  timeRange: {
    start: string;
    end: string;
    days: number;
  };

  /** Summary statistics */
  summary: {
    totalTraces: number;
    totalSpans: number;
    totalTokens: number;
    totalCost: number;
    avgLatencyMs: number;
  };

  /** Daily breakdown for charts */
  daily: {
    traces: MetricDataPoint[];
    tokens: MetricDataPoint[];
    cost: MetricDataPoint[];
    latency: MetricDataPoint[];
  };

  /** Top level metrics by category */
  byCategory: {
    /** Traces by action type */
    byAction: Record<string, number>;
    /** Traces by tab */
    byTab: Record<string, number>;
    /** Token usage by model */
    byModel: Record<string, number>;
  };

  /** Evaluation metrics */
  evaluation: {
    /** Number of active evaluators */
    evaluatorCount: number;
    /** Feedback definitions configured */
    feedbackDefinitions: string[];
    /** Average scores (if available) */
    avgScores: Record<string, number>;
  };

  /** Error rate */
  errorRate: number;

  /** Timestamp of this report */
  generatedAt: string;
}

/**
 * GET /api/metrics
 *
 * Query params:
 * - days: Number of days to look back (default: 7)
 * - projectId: Project ID (optional, defaults to OPIK_PROJECT)
 */
export async function GET(event: APIEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const days = parseInt(url.searchParams.get('days') || '7', 10);
  const projectId = url.searchParams.get('projectId') || OPIK_PROJECT;

  // Check if Opik is available
  const available = await isOpikRestAvailable();
  if (!available) {
    return new Response(
      JSON.stringify({
        available: false,
        error: 'Opik API not available. Check OPIK_API_KEY configuration.',
        project: projectId,
        generatedAt: new Date().toISOString(),
      }),
      {
        status: 200, // Return 200 even when unavailable - it's valid state
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Calculate time range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch all metrics in parallel
    const [
      projectStats,
      evaluators,
      feedbackDefs,
      tracesDaily,
      tokensDaily,
      costDaily,
      tracesResponse,
    ] = await Promise.all([
      getProjectStats(projectId, startDate, endDate).catch((e) => {
        console.error('[Metrics] getProjectStats error:', e);
        return null;
      }),
      listEvaluators(projectId).catch(() => []),
      listFeedbackDefinitions().catch(() => []),
      getMetricDailyData('trace_count', startDate, endDate, [projectId]).catch(() => []),
      getMetricDailyData('total_tokens', startDate, endDate, [projectId]).catch(() => []),
      getMetricDailyData('total_cost', startDate, endDate, [projectId]).catch(() => []),
      listTraces({
        projectName: projectId,
        startDate,
        endDate,
        size: 500, // Get recent traces for aggregation
      }).catch((e) => {
        console.error('[Metrics] listTraces error:', e);
        return { content: [], page: 1, size: 0, total: 0 };
      }),
    ]);

    // Aggregate traces by tags for detailed breakdowns
    const traceAggregation = aggregateTracesByTags(tracesResponse.content);

    // Calculate feedback score averages
    const avgScores: Record<string, number> = {};
    const scoreAggregates: Record<string, { sum: number; count: number }> = {};

    for (const trace of tracesResponse.content) {
      if (trace.feedbackScores) {
        for (const score of trace.feedbackScores) {
          if (!scoreAggregates[score.name]) {
            scoreAggregates[score.name] = { sum: 0, count: 0 };
          }
          scoreAggregates[score.name].sum += score.value;
          scoreAggregates[score.name].count++;
        }
      }
    }

    for (const [name, agg] of Object.entries(scoreAggregates)) {
      avgScores[name] = agg.count > 0 ? agg.sum / agg.count : 0;
    }

    // Build response
    const response: MetricsResponse = {
      available: true,
      project: projectId,
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days,
      },
      summary: {
        totalTraces:
          projectStats?.traceCount || tracesResponse.total || sumMetricValues(tracesDaily),
        totalSpans: projectStats?.spanCount || 0,
        totalTokens:
          projectStats?.totalTokens || traceAggregation.totalTokens || sumMetricValues(tokensDaily),
        totalCost:
          projectStats?.totalCost || traceAggregation.totalCost || sumMetricValues(costDaily),
        avgLatencyMs: projectStats?.avgDuration || traceAggregation.avgDurationMs || 0,
      },
      daily: {
        traces: tracesDaily,
        tokens: tokensDaily,
        cost: costDaily,
        latency: [], // Latency daily not available via basic API
      },
      byCategory: {
        byAction: traceAggregation.byAction,
        byTab: traceAggregation.byTab,
        byModel: {}, // Would need span-level aggregation with model tags
      },
      evaluation: {
        evaluatorCount: evaluators.length,
        feedbackDefinitions: feedbackDefs.map((fd) => fd.name),
        avgScores,
      },
      errorRate: traceAggregation.errorRate,
      generatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Metrics] Error fetching metrics:', error);
    return new Response(
      JSON.stringify({
        available: true,
        error: error instanceof Error ? error.message : 'Failed to fetch metrics',
        project: projectId,
        generatedAt: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Helper to sum metric values
 */
function sumMetricValues(dataPoints: MetricDataPoint[]): number {
  return dataPoints.reduce((sum, dp) => sum + dp.value, 0);
}

/**
 * POST /api/metrics/initialize
 *
 * Initialize Stride evaluators and feedback definitions in Opik.
 * Call this once to set up the observability infrastructure.
 */
export async function POST(event: APIEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const action = url.searchParams.get('action');

  if (action !== 'initialize') {
    return new Response(JSON.stringify({ error: 'Unknown action. Use ?action=initialize' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const available = await isOpikRestAvailable();
  if (!available) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Opik API not available',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Import the initialization function
    const { initializeStrideOpikSetup } = await import('../../lib/opikRest');
    const body = await event.request.json().catch(() => ({}));
    const projectId = body.projectId || OPIK_PROJECT;

    const result = await initializeStrideOpikSetup(projectId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Stride Opik setup initialized',
        evaluatorsCreated: result.evaluators.length,
        feedbackDefinitionsCreated: result.feedbackDefinitions.length,
        annotationQueueId: result.annotationQueue.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Metrics] Initialization error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Initialization failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
