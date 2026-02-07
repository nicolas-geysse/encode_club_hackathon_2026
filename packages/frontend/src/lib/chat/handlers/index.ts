/**
 * Chat intent handlers — extracted from the monolithic chat.ts switch.
 *
 * Each handler receives a ChatHandlerContext and returns a ChatHandlerResult.
 * Handlers are wrapped in Opik child spans for tracing.
 */

export { handleProgressSummary } from './progressSummary';
export { handleRecommendFocus } from './recommendFocus';
export { handleCompleteMission } from './completeMission';
export { handleSkipMission } from './skipMission';
export { handleUpdateEnergy } from './updateEnergy';

export type { ChatHandlerContext, ChatHandlerResult, HandlerBudgetContext } from './types';
