/**
 * API Response Utilities
 *
 * Standardized response helpers for all API routes.
 * Reduces duplication across 21+ API files.
 */

/**
 * Create a successful JSON response
 *
 * @example
 * return jsonResponse({ users: [...] });
 * return jsonResponse({ id: '123' }, 201);
 */
export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create an error response with consistent structure
 *
 * @example
 * return errorResponse('Profile not found', 404);
 * return errorResponse('Server error');
 */
export function errorResponse(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle API errors consistently
 * Logs error and returns appropriate response
 *
 * @example
 * catch (error) {
 *   return handleApiError(error, logger, 'GET');
 * }
 */
export function handleApiError(
  error: unknown,
  logger?: { error: (msg: string, meta?: Record<string, unknown>) => void },
  operation?: string
): Response {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (logger) {
    logger.error(`${operation || 'API'} error`, { error: message });
  }

  return errorResponse(message, 500);
}

/**
 * Create a 400 Bad Request response for missing parameters
 *
 * @example
 * if (!profileId) return badRequest('profileId is required');
 */
export function badRequest(message: string): Response {
  return errorResponse(message, 400);
}

/**
 * Create a 404 Not Found response
 *
 * @example
 * if (!skill) return notFound('Skill not found');
 */
export function notFound(message: string): Response {
  return errorResponse(message, 404);
}

/**
 * Create a 201 Created response with the created resource
 *
 * @example
 * return created(newSkill);
 */
export function created<T>(data: T): Response {
  return jsonResponse(data, 201);
}

/**
 * Create a 204 No Content response (for DELETE operations)
 *
 * @example
 * return noContent();
 */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}
