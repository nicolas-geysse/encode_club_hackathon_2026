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

// Define UIResource here as the single source of truth
export type UIResource =
  | {
      type: 'text';
      params: { content: string; markdown?: boolean };
    }
  | {
      type: 'confirmation';
      params: {
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        data?: Record<string, unknown>;
      };
    }
  | {
      type: 'input_form'; // Generative UI Form (Agentic)
      params: {
        actionId: string;
        actionType: string;
        fields: {
          name: string;
          label: string;
          type: string;
          options?: string[];
          currentValue?: any;
          required?: boolean;
        }[];
        title?: string;
        submitLabel?: string;
      };
    }
  | {
      type: 'form'; // Legacy Form
      params: Record<string, unknown>;
    }
  | {
      type: 'selector';
      params: { title?: string; options: string[] };
    }
  | {
      type: 'table' | 'metric';
      params: any;
    }
  | {
      type: 'chart';
      params: {
        /** Chart type: bar, line, or comparison */
        type: 'bar' | 'line' | 'comparison';
        /** Chart title */
        title?: string;
        /** Chart.js data structure */
        data: {
          labels: string[];
          datasets: Array<{
            label: string;
            data: number[];
            backgroundColor?: string | string[];
            borderColor?: string | string[];
          }>;
        };
        /** Summary for comparison charts */
        summary?: {
          currentWeeks: number | null;
          scenarioWeeks: number | null;
          weeksSaved: number;
        };
      };
    }
  | {
      type: 'grid';
      params: { columns?: number; children: UIResource[] };
    }
  | {
      type: 'link';
      params: { label: string; url: string; description?: string };
    }
  | {
      type: 'action';
      params: { type?: string; label?: string; variant?: string; action?: string; params?: any };
    }
  | {
      type: 'composite';
      components: UIResource[];
    };

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
/**
 * Time context for simulation support
 *
 * When simulation is active, the chat uses simulatedDate
 * instead of real date for all time-based calculations.
 */
export interface TimeContext {
  /** ISO string of simulated date */
  simulatedDate: string;
  /** Whether simulation is active */
  isSimulating: boolean;
  /** Number of days offset from real date */
  offsetDays: number;
  /** Pre-computed: whether goal deadline has passed */
  deadlinePassed?: boolean;
}

export interface ChatRequest {
  /** User's input message */
  message: string;
  /** Current profile data (context for extraction) */
  profile: Record<string, unknown>;
  /** Current onboarding step (greeting, name, skills, budget, etc.) */
  currentStep: string;
  /** Recent conversation history for context awareness */
  conversationHistory?: Array<{ role: string; content: string }>;
  /** Time context for simulation support */
  timeContext?: TimeContext;
}
