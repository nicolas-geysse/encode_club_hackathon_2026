/**
 * Shared types for extracted chat intent handlers.
 *
 * Each handler receives a ChatHandlerContext (bundled closure from chat.ts)
 * and returns a ChatHandlerResult consumed by the conversation handler.
 */

import type { DetectedIntent } from '../types';
import type { UIResource } from '~/types/chat';
import type { TimeContext } from '~/lib/timeAwareDate';
import type { TraceContext } from '~/lib/opik';

/** Subset of BudgetContext relevant to handlers */
export interface HandlerBudgetContext {
  totalIncome: number;
  activeExpenses: number;
  netMargin: number;
  adjustedMargin: number;
  goalProgress: number;
  monthsUntilDeadline: number;
}

/** Context passed to every handler — mirrors the closure in handleConversationMode */
export interface ChatHandlerContext {
  profileId?: string;
  context: Record<string, unknown>;
  budgetContext: HandlerBudgetContext | null;
  intent: DetectedIntent;
  timeCtx: TimeContext;
  ctx: TraceContext;
}

/** What a handler returns to the conversation handler */
export interface ChatHandlerResult {
  response: string;
  uiResource?: UIResource;
  extractedData?: Record<string, unknown>;
}
