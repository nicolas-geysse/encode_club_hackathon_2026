/**
 * Chat Types
 *
 * Centralized type definitions for chat components and API routes.
 * Single source of truth to avoid duplication across files.
 *
 * @module types/chat
 * @see OnboardingChat.tsx - Main consumer for ChatMessage
 * @see api/chat.ts - API route using ChatResponse/ChatRequest
 */

import type { UIResource } from '../components/chat/MCPUIRenderer';

/**
 * Chat message displayed in the UI
 *
 * Used by OnboardingChat to render conversation bubbles.
 * Supports optional MCP-UI interactive components via uiResource.
 *
 * @example
 * const message: ChatMessage = {
 *   id: 'msg-123',
 *   role: 'assistant',
 *   content: 'What is your savings goal?',
 *   source: 'groq',
 *   uiResource: { type: 'form', params: { ... } }
 * };
 */
export interface ChatMessage {
  /** Unique identifier for the message */
  id: string;
  /** Message sender: 'user' or 'assistant' (Bruno) */
  role: 'user' | 'assistant';
  /** Text content of the message (supports markdown) */
  content: string;
  /** LLM source that generated the response */
  source?: 'mastra' | 'groq' | 'fallback';
  /** Optional MCP-UI interactive component (form, table, metric, etc.) */
  uiResource?: UIResource;
  /** When the message was created */
  timestamp?: Date;
  /** Opik trace ID for feedback API */
  traceId?: string;
  /** Opik trace URL for "Explain This" feature - links to AI reasoning */
  traceUrl?: string;
}

/**
 * Chat API response from /api/chat
 *
 * Returned by the chat endpoint after processing a user message.
 * Contains the assistant's response and any extracted profile data.
 *
 * @example
 * // Response when user says "I want to save $500 for a laptop"
 * {
 *   response: "Great goal! When do you need it by?",
 *   extractedData: { goalName: "laptop", goalAmount: 500 },
 *   source: 'groq',
 *   uiResource: { type: 'form', params: { title: 'Confirm Goal', ... } }
 * }
 */
export interface ChatResponse {
  /** Assistant's text response */
  response: string;
  /** Data extracted from user message (name, skills, budget, etc.) */
  extractedData?: Record<string, unknown>;
  /** LLM source: 'mastra', 'groq', or 'fallback' (regex-only) */
  source?: 'mastra' | 'groq' | 'fallback';
  /** Optional MCP-UI component to render below the message */
  uiResource?: UIResource;
  /** Opik trace URL for "Explain This" feature */
  traceUrl?: string;
  /** Error message if request failed */
  error?: string;
}

/**
 * Chat request body sent to /api/chat
 *
 * Payload for the chat API endpoint during onboarding.
 *
 * @example
 * const request: ChatRequest = {
 *   message: "My name is Alex",
 *   profile: { skills: ['coding'], city: 'Paris' },
 *   currentStep: 'name',
 *   conversationHistory: [{ role: 'assistant', content: 'What is your name?' }]
 * };
 */
export interface ChatRequest {
  /** User's input message */
  message: string;
  /** Current profile data (context for extraction) */
  profile: Record<string, unknown>;
  /** Current onboarding step (greeting, name, skills, budget, etc.) */
  currentStep: string;
  /** Recent conversation history for context awareness */
  conversationHistory?: Array<{ role: string; content: string }>;
}

// Re-export UIResource for convenience
export type { UIResource };
