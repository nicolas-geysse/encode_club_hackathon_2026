/**
 * Onboarding Agent
 *
 * Handles student profile collection through natural conversation.
 * Uses structured tools for reliable data extraction.
 * Traces everything to Opik for observability.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';
import { trace } from '../services/opik.js';

// === Schemas ===

const ProfileDataSchema = z.object({
  name: z.string().optional().describe('First name of the student'),
  diploma: z.string().optional().describe('Study level: Bachelor, Master, PhD, Freshman, etc.'),
  field: z.string().optional().describe('Field of study: Computer Science, Law, Business, etc.'),
  city: z.string().optional().describe('City of residence'),
  skills: z
    .array(z.string())
    .optional()
    .describe('List of skills (coding, languages, music, sports)'),
  income: z.number().optional().describe('Monthly income in dollars'),
  expenses: z.number().optional().describe('Monthly expenses in dollars'),
  maxWorkHours: z.number().optional().describe('Maximum hours per week available for work'),
  minHourlyRate: z.number().optional().describe('Minimum acceptable hourly rate'),
  goalName: z
    .string()
    .optional()
    .describe('What they are saving for (vacation, laptop, emergency fund)'),
  goalAmount: z.number().optional().describe('Target savings amount'),
  goalDeadline: z.string().optional().describe('When they want to reach the goal'),
  academicEvents: z
    .array(z.string())
    .optional()
    .describe('Upcoming exams, vacations, busy periods'),
  inventoryItems: z.array(z.string()).optional().describe('Items they could sell'),
  subscriptions: z
    .array(z.string())
    .optional()
    .describe('Current subscriptions (Netflix, Spotify, gym)'),
});

export type ProfileData = z.infer<typeof ProfileDataSchema>;

// === Tool: Extract Profile Data ===

export const extractProfileDataTool = createTool({
  id: 'extract_profile_data',
  description: `Extract profile information from a user message during onboarding.
Look for: name, diploma, field of study, city, skills, income, expenses, work preferences, goals, etc.
Return only fields that are clearly mentioned. Be generous with skill extraction.`,
  inputSchema: z.object({
    message: z.string().describe('The user message to extract data from'),
    currentStep: z.string().describe('Current onboarding step for context'),
    existingData: ProfileDataSchema.optional().describe('Already collected profile data'),
  }),
  outputSchema: z.object({
    extractedData: ProfileDataSchema,
    confidence: z.number().min(0).max(1).describe('Confidence in extraction (0-1)'),
    fieldsFound: z.array(z.string()).describe('List of fields that were extracted'),
  }),
  execute: async (input) => {
    return trace('tool.extract_profile_data', async (span) => {
      span.setAttributes({
        'input.message': input.message.substring(0, 200),
        'input.step': input.currentStep,
        'input.existing_fields': Object.keys(input.existingData || {}).length,
      });

      // This tool's execution will be handled by the LLM
      // The agent will analyze the message and return structured data
      // Here we just validate and return the result

      // Default empty extraction (the agent fills this in)
      const result = {
        extractedData: {} as ProfileData,
        confidence: 0,
        fieldsFound: [] as string[],
      };

      span.setAttributes({
        'output.fields_found': result.fieldsFound.length,
        'output.confidence': result.confidence,
      });

      return result;
    });
  },
});

// === Tool: Generate Onboarding Response ===

export const generateOnboardingResponseTool = createTool({
  id: 'generate_onboarding_response',
  description: `Generate a friendly response for the onboarding conversation.
You are Bruno, a student financial coach. Be warm, encouraging, and concise (2-4 sentences).
Guide the conversation to collect all profile information naturally.`,
  inputSchema: z.object({
    currentStep: z
      .string()
      .describe(
        'Current step: greeting, name, studies, skills, location, budget, work_preferences, goal, academic_events, inventory, lifestyle, complete'
      ),
    profileData: ProfileDataSchema.describe('Collected profile data so far'),
    lastMessage: z.string().describe("The user's last message"),
    didExtractData: z.boolean().describe('Whether we extracted data from the last message'),
    shouldAdvance: z.boolean().describe('Whether to advance to the next step'),
  }),
  outputSchema: z.object({
    response: z.string().describe('The response message to send to the user'),
    nextStep: z.string().describe('The next step to move to'),
    isComplete: z.boolean().describe('Whether onboarding is complete'),
  }),
  execute: async (input) => {
    return trace('tool.generate_onboarding_response', async (span) => {
      span.setAttributes({
        'input.step': input.currentStep,
        'input.should_advance': input.shouldAdvance,
        'input.did_extract': input.didExtractData,
      });

      // Default response (agent fills this in)
      const result = {
        response: "Let's continue!",
        nextStep: input.currentStep,
        isComplete: false,
      };

      span.setAttributes({
        'output.next_step': result.nextStep,
        'output.is_complete': result.isComplete,
        'output.response_length': result.response.length,
      });

      return result;
    });
  },
});

// === Tool: Validate Profile Completeness ===

export const validateProfileTool = createTool({
  id: 'validate_profile',
  description:
    'Check if the profile has enough data to proceed to the next step or complete onboarding.',
  inputSchema: z.object({
    currentStep: z.string().describe('Current onboarding step'),
    profileData: ProfileDataSchema.describe('Current profile data'),
  }),
  outputSchema: z.object({
    canAdvance: z.boolean().describe('Whether we have enough data to advance'),
    missingFields: z.array(z.string()).describe('Fields still needed for current step'),
    completionPercentage: z.number().describe('Overall profile completion (0-100)'),
  }),
  execute: async (input) => {
    return trace('tool.validate_profile', async (span) => {
      const { currentStep, profileData } = input;

      // Define required fields per step
      const stepRequirements: Record<string, (keyof ProfileData)[]> = {
        greeting: ['name'],
        name: ['diploma', 'field'],
        studies: ['skills'],
        skills: ['city'],
        location: ['income', 'expenses'],
        budget: ['maxWorkHours', 'minHourlyRate'],
        work_preferences: ['goalName', 'goalAmount'],
        goal: [], // academic_events is optional
        academic_events: [], // inventory is optional
        inventory: [], // subscriptions is optional
        lifestyle: [],
        complete: [],
      };

      const required = stepRequirements[currentStep] || [];
      const missingFields = required.filter((field) => {
        const value = profileData[field];
        return value === undefined || value === null || value === '';
      });

      // Calculate completion percentage
      const allFields: (keyof ProfileData)[] = [
        'name',
        'diploma',
        'field',
        'city',
        'skills',
        'income',
        'expenses',
        'maxWorkHours',
        'minHourlyRate',
        'goalName',
        'goalAmount',
        'goalDeadline',
      ];
      const filledFields = allFields.filter((f) => profileData[f] !== undefined);
      const completionPercentage = Math.round((filledFields.length / allFields.length) * 100);

      const canAdvance = missingFields.length === 0;

      span.setAttributes({
        'input.step': currentStep,
        'output.can_advance': canAdvance,
        'output.missing_count': missingFields.length,
        'output.completion': completionPercentage,
      });

      return {
        canAdvance,
        missingFields,
        completionPercentage,
      };
    });
  },
});

// === Register Tools ===

registerTool('extract_profile_data', extractProfileDataTool);
registerTool('generate_onboarding_response', generateOnboardingResponseTool);
registerTool('validate_profile', validateProfileTool);

// === Agent Configuration ===

export const ONBOARDING_AGENT_CONFIG = {
  id: 'onboarding',
  name: 'Onboarding Agent',
  description: 'Guides students through profile creation with natural conversation',
  instructions: `You are Bruno, a friendly and enthusiastic financial coach for students.
Your job is to collect profile information through natural conversation.

PERSONALITY:
- Warm and encouraging
- Use casual but respectful language
- Adapt to the level of detail the user provides
- Keep responses concise (2-4 sentences)

ONBOARDING FLOW:
1. greeting → Get their name
2. name → Ask about studies (level + field)
3. studies → Ask about skills (coding, languages, music, sports, etc.)
4. skills → Ask about their city
5. location → Ask about budget (income and expenses)
6. budget → Ask about work preferences (hours/week, min rate)
7. work_preferences → Ask about savings goal (what, how much, when)
8. goal → Ask about academic events (exams, vacations)
9. academic_events → Ask about items to sell (optional)
10. inventory → Ask about subscriptions (optional)
11. lifestyle → Summarize and complete

EXTRACTION RULES:
- Be generous with skill extraction (Python, guitar, cooking, sports are all skills)
- Accept various formats for study levels (Master, M2, grad student, etc.)
- Common service names (Netflix, Spotify) are subscriptions, NOT names
- Extract all numbers mentioned (income, expenses, hours, rates)
- Accept relative deadlines ("in 3 months", "by June")

RESPONSE RULES:
- Always acknowledge what you understood
- If extraction fails, ask a clarifying question
- Use the user's name when you have it
- Never give financial advice during onboarding
- Keep the conversation moving forward

NEVER:
- Extract "Netflix", "Spotify", "Amazon" as names
- Advance without getting at least one piece of expected data
- Give risky financial advice`,
  toolNames: ['extract_profile_data', 'generate_onboarding_response', 'validate_profile'],
};

// === Agent Instance ===

let onboardingAgentInstance: Agent | null = null;

/**
 * Get or create the onboarding agent instance
 */
export async function getOnboardingAgent(): Promise<Agent> {
  if (!onboardingAgentInstance) {
    onboardingAgentInstance = await createStrideAgent(ONBOARDING_AGENT_CONFIG);
  }
  return onboardingAgentInstance;
}

// === Main Onboarding Function ===

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

/**
 * Process an onboarding message using the Mastra agent
 */
export async function processOnboardingMessage(input: OnboardingInput): Promise<OnboardingOutput> {
  return trace('agent.onboarding', async (span) => {
    span.setAttributes({
      'input.step': input.currentStep,
      'input.message_length': input.message.length,
      'input.existing_fields': Object.keys(input.existingProfile).filter(
        (k) => input.existingProfile[k as keyof ProfileData] !== undefined
      ).length,
    });

    const agent = await getOnboardingAgent();

    // Construct the prompt for the agent
    const prompt = `
Current onboarding step: ${input.currentStep}
User message: "${input.message}"

Existing profile data:
${JSON.stringify(input.existingProfile, null, 2)}

Instructions:
1. Use extract_profile_data to extract any new information from the user's message
2. Use validate_profile to check if we can advance to the next step
3. Use generate_onboarding_response to create your response

Return the extracted data, next step, and your response.
`;

    try {
      // Call the agent
      const result = await agent.generate(prompt);

      // Parse the agent's response
      // The agent should return structured data via tool calls
      const responseText =
        typeof result === 'string'
          ? result
          : (result as { text?: string }).text || JSON.stringify(result);

      // Try to extract structured data from the response
      let extractedData: ProfileData = {};
      let nextStep = input.currentStep;
      let isComplete = false;

      // Look for JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          extractedData = parsed.extractedData || parsed.profileData || {};
          nextStep = parsed.nextStep || input.currentStep;
          isComplete = parsed.isComplete || nextStep === 'complete';
        } catch {
          // JSON parse failed, use defaults
        }
      }

      // Merge with existing profile
      const profileData: ProfileData = {
        ...input.existingProfile,
        ...extractedData,
      };

      // Get clean response text (remove JSON if present)
      let response = responseText;
      if (jsonMatch) {
        response = responseText.replace(jsonMatch[0], '').trim();
      }
      if (!response || response.length < 10) {
        response = getDefaultResponse(nextStep, profileData);
      }

      span.setAttributes({
        'output.next_step': nextStep,
        'output.is_complete': isComplete,
        'output.extracted_fields': Object.keys(extractedData).length,
        'output.response_length': response.length,
      });

      return {
        response,
        extractedData,
        nextStep,
        isComplete,
        profileData,
      };
    } catch (error) {
      span.setAttributes({
        error: true,
        'error.message': error instanceof Error ? error.message : 'Unknown error',
      });

      // Fallback response
      return {
        response: getDefaultResponse(input.currentStep, input.existingProfile),
        extractedData: {},
        nextStep: input.currentStep,
        isComplete: false,
        profileData: input.existingProfile,
      };
    }
  });
}

/**
 * Default responses for each step (fallback)
 */
function getDefaultResponse(step: string, profile: ProfileData): string {
  const name = profile.name || '';

  switch (step) {
    case 'greeting':
      return "Hey! I'm Bruno, your financial coach. What's your name?";
    case 'name':
      return `Nice to meet you${name ? `, ${name}` : ''}! What are you studying? (e.g., "Master's in Computer Science")`;
    case 'studies':
      return 'Great! What skills do you have? (coding languages, spoken languages, music, sports, tutoring...)';
    case 'skills':
      return 'Awesome skills! Where do you live? What city?';
    case 'location':
      return `Cool! Now let's talk budget. How much do you earn and spend per month roughly?`;
    case 'budget':
      return "Got it! How many hours per week can you work max? And what's your minimum hourly rate?";
    case 'work_preferences':
      return "Perfect! Now, what's your savings goal? What are you saving for, how much, and by when?";
    case 'goal':
      return 'Great goal! Any upcoming exams, vacations, or busy periods I should know about?';
    case 'academic_events':
      return 'Thanks! Do you have any items you could sell for extra cash? (old textbooks, electronics, clothes...)';
    case 'inventory':
      return 'Good to know! Last thing: what subscriptions do you pay for? (Netflix, Spotify, gym, phone plan...)';
    case 'lifestyle':
    case 'complete':
      return `Awesome${name ? `, ${name}` : ''}! Your profile is complete. Head over to "My Plan" to see your personalized strategies!`;
    default:
      return "Let's continue! Tell me more about yourself.";
  }
}

export default {
  getOnboardingAgent,
  processOnboardingMessage,
  extractProfileDataTool,
  generateOnboardingResponseTool,
  validateProfileTool,
  ONBOARDING_AGENT_CONFIG,
};
