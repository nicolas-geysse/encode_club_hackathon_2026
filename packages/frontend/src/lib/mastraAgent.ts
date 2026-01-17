/**
 * Mastra Agent Integration
 *
 * Wrapper to call Mastra agents from the frontend server-side code.
 * Handles the import of mcp-server package and provides a clean interface.
 */

import { trace } from './opik';

// Re-export types for convenience
export interface ProfileData {
  name?: string;
  diploma?: string;
  field?: string;
  city?: string;
  skills?: string[];
  income?: number;
  expenses?: number;
  maxWorkHours?: number;
  minHourlyRate?: number;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  academicEvents?: string[];
  inventoryItems?: string[];
  subscriptions?: string[];
}

export interface OnboardingInput {
  message: string;
  currentStep: string;
  existingProfile: ProfileData;
}

export interface OnboardingOutput {
  response: string;
  extractedData: ProfileData;
  nextStep: string;
  isComplete: boolean;
  profileData: ProfileData;
}

// Dynamic import to avoid bundling issues
let processOnboardingMessage: ((input: OnboardingInput) => Promise<OnboardingOutput>) | null = null;

/**
 * Lazy load the Mastra onboarding agent
 */
async function loadOnboardingAgent(): Promise<typeof processOnboardingMessage> {
  if (!processOnboardingMessage) {
    try {
      // Dynamic import from mcp-server
      const module = await import('@stride/mcp-server/agents');
      processOnboardingMessage = module.processOnboardingMessage;
    } catch (error) {
      console.error('Failed to load Mastra onboarding agent:', error);
      return null;
    }
  }
  return processOnboardingMessage;
}

/**
 * Process an onboarding message using the Mastra agent
 * Falls back to simple extraction if agent loading fails
 */
export async function processWithMastraAgent(input: OnboardingInput): Promise<OnboardingOutput> {
  return trace('mastra.onboarding', async (span) => {
    span.setAttributes({
      'input.step': input.currentStep,
      'input.message_length': input.message.length,
    });

    try {
      const processor = await loadOnboardingAgent();

      if (processor) {
        const result = await processor(input);
        span.setAttributes({
          'output.next_step': result.nextStep,
          'output.extracted_fields': Object.keys(result.extractedData).length,
          'output.method': 'mastra_agent',
        });
        return result;
      }
    } catch (error) {
      span.setAttributes({
        error: true,
        'error.message': error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fallback: return empty extraction with clarification
    span.setAttributes({
      'output.method': 'fallback',
    });

    return {
      response: getClarificationMessage(input.currentStep),
      extractedData: {},
      nextStep: input.currentStep,
      isComplete: false,
      profileData: input.existingProfile,
    };
  });
}

/**
 * Clarification messages for each step (fallback)
 */
function getClarificationMessage(step: string): string {
  const clarifications: Record<string, string> = {
    greeting: "I didn't catch your name. What should I call you?",
    name: "I need to know about your studies. What's your level (Bachelor, Master, PhD) and field?",
    studies: 'What skills do you have? (coding languages, spoken languages, music, sports...)',
    skills: 'Where do you live? Just tell me the city name.',
    location: 'I need to understand your budget. How much do you earn and spend per month?',
    budget: "How many hours can you work per week? And what's your minimum hourly rate?",
    work_preferences: "What's your savings goal? What are you saving for, how much, and by when?",
    goal: "Any upcoming exams or busy periods? Or say 'none' to continue.",
    academic_events: "Any items you could sell? (textbooks, electronics...) Or 'nothing' to skip.",
    inventory: "What subscriptions do you pay for? (Netflix, Spotify, gym...) Or 'none'.",
    lifestyle: 'Anything else to add, or shall we wrap up?',
    complete: "Your profile is complete! Head to 'My Plan' to see your strategies.",
  };

  return clarifications[step] || "Let's continue! Tell me more about yourself.";
}

export default {
  processWithMastraAgent,
};
