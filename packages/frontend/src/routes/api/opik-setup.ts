/**
 * Opik Setup API
 *
 * Initialize Opik with all evaluators, feedback definitions, and annotation queues.
 * Call POST /api/opik-setup to set up everything programmatically.
 */

import type { APIEvent } from '@solidjs/start/server';
import {
  initializeStrideOpikSetup,
  isOpikRestAvailable,
  listEvaluators,
  listFeedbackDefinitions,
  listAnnotationQueues,
} from '../../lib/opikRest';

// Get project ID from environment or use default
const OPIK_PROJECT_ID = process.env.OPIK_PROJECT_ID;

/**
 * GET /api/opik-setup
 * Check current Opik setup status
 */
export async function GET(_event: APIEvent) {
  try {
    const available = await isOpikRestAvailable();

    if (!available) {
      return new Response(
        JSON.stringify({
          status: 'unavailable',
          message: 'Opik REST API not available. Check OPIK_API_KEY.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch current setup
    const [evaluators, feedbackDefinitions, annotationQueues] = await Promise.all([
      listEvaluators().catch(() => []),
      listFeedbackDefinitions().catch(() => []),
      listAnnotationQueues().catch(() => []),
    ]);

    return new Response(
      JSON.stringify({
        status: 'ok',
        setup: {
          evaluators: evaluators.length,
          feedbackDefinitions: feedbackDefinitions.length,
          annotationQueues: annotationQueues.length,
        },
        details: {
          evaluators: evaluators.map((e) => ({ id: e.id, name: e.name, enabled: e.enabled })),
          feedbackDefinitions: feedbackDefinitions.map((f) => ({ id: f.id, name: f.name })),
          annotationQueues: annotationQueues.map((q) => ({ id: q.id, name: q.name })),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /api/opik-setup
 * Initialize all Stride Opik configuration
 *
 * Body (optional):
 * {
 *   "projectId": "uuid" // Override default project ID
 * }
 */
export async function POST(event: APIEvent) {
  try {
    const available = await isOpikRestAvailable();

    if (!available) {
      return new Response(
        JSON.stringify({
          status: 'unavailable',
          message: 'Opik REST API not available. Check OPIK_API_KEY.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse optional project ID from body
    let projectId = OPIK_PROJECT_ID;
    try {
      const body = await event.request.json();
      if (body.projectId) {
        projectId = body.projectId;
      }
    } catch {
      // No body or invalid JSON, use default
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'No project ID provided. Set OPIK_PROJECT_ID or pass projectId in body.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize everything
    const result = await initializeStrideOpikSetup(projectId);

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'Stride Opik setup initialized successfully',
        created: {
          evaluators: result.evaluators.length,
          feedbackDefinitions: result.feedbackDefinitions.length,
          annotationQueue: result.annotationQueue.name,
        },
        details: result,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
