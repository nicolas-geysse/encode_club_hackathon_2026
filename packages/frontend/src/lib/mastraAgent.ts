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

    // Fallback: use regex extraction since Mastra agent import failed
    span.setAttributes({
      'output.method': 'fallback_with_extraction',
    });

    // Do regex-based extraction as fallback
    const extractedData = extractWithRegex(input.message, input.currentStep, input.existingProfile);
    const hasExtracted = Object.keys(extractedData).length > 0;

    // Determine next step
    const nextStep = hasExtracted ? getNextStep(input.currentStep) : input.currentStep;

    // Generate appropriate response
    const response = hasExtracted
      ? getAdvanceMessage(nextStep, { ...input.existingProfile, ...extractedData })
      : getClarificationMessage(input.currentStep);

    span.setAttributes({
      'output.next_step': nextStep,
      'output.extracted_fields': Object.keys(extractedData).length,
    });

    return {
      response,
      extractedData,
      nextStep,
      isComplete: nextStep === 'complete',
      profileData: { ...input.existingProfile, ...extractedData },
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

/**
 * Extract data using regex patterns (fallback when Mastra agent unavailable)
 */
function extractWithRegex(message: string, step: string, existing: ProfileData): ProfileData {
  const extracted: ProfileData = {};
  const msg = message.trim();

  // Service names to exclude from name extraction
  const serviceNames = [
    'netflix',
    'spotify',
    'amazon',
    'disney',
    'apple',
    'google',
    'youtube',
    'hbo',
    'prime',
    'hulu',
  ];
  const isServiceName = (name: string) => serviceNames.some((s) => name.toLowerCase().includes(s));

  switch (step) {
    case 'greeting':
    case 'name': {
      // Extract name - first word that looks like a name
      const words = msg.split(/\s+/);
      const nameCandidate = words.find(
        (w) => w.length >= 2 && /^[A-Z][a-z]+$/.test(w) && !isServiceName(w)
      );
      if (nameCandidate) {
        extracted.name = nameCandidate;
      } else if (words.length === 1 && words[0].length >= 2 && !isServiceName(words[0])) {
        // Single word that's not a service
        extracted.name = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      }
      break;
    }

    case 'studies': {
      // Extract diploma and field
      const diplomaPatterns = [
        /\b(master'?s?|bachelor'?s?|phd|doctorate|freshman|sophomore|junior|senior|l1|l2|l3|m1|m2)\b/i,
      ];
      const fieldPatterns = [
        /\b(computer science|cs|law|business|medicine|engineering|economics|psychology|biology|physics|chemistry|math|arts|music)\b/i,
      ];

      for (const pattern of diplomaPatterns) {
        const match = msg.match(pattern);
        if (match) {
          extracted.diploma = match[1];
          break;
        }
      }

      for (const pattern of fieldPatterns) {
        const match = msg.match(pattern);
        if (match) {
          extracted.field = match[1];
          break;
        }
      }
      break;
    }

    case 'skills': {
      // Extract skills as comma-separated or listed items
      const skillKeywords = [
        'python',
        'javascript',
        'java',
        'sql',
        'react',
        'node',
        'typescript',
        'guitar',
        'piano',
        'music',
        'tutoring',
        'teaching',
        'writing',
        'english',
        'french',
        'spanish',
        'german',
        'translation',
        'data entry',
        'excel',
        'cooking',
        'sports',
        'photography',
        'video editing',
        'graphic design',
      ];

      const foundSkills = skillKeywords.filter((skill) =>
        msg.toLowerCase().includes(skill.toLowerCase())
      );

      if (foundSkills.length > 0) {
        extracted.skills = foundSkills;
      }
      break;
    }

    case 'location': {
      // Extract city name
      const cityPatterns = [
        /\b(paris|lyon|marseille|toulouse|bordeaux|lille|nantes|nice|montpellier|strasbourg|new york|london|berlin|tokyo|los angeles|chicago|boston|san francisco|seattle)\b/i,
      ];

      for (const pattern of cityPatterns) {
        const match = msg.match(pattern);
        if (match) {
          extracted.city = match[1];
          break;
        }
      }

      // If no known city, take the main word
      if (!extracted.city && msg.split(/\s+/).length <= 2) {
        extracted.city = msg.split(/\s+/)[0];
      }
      break;
    }

    case 'budget': {
      // Extract income and expenses
      const incomeMatch = msg.match(/(?:earn|income|receive|make|get)[^\d]*(\d+)/i);
      const expenseMatch = msg.match(/(?:spend|expense|pay|cost)[^\d]*(\d+)/i);
      const numbersMatch = msg.match(/(\d+)/g);

      if (incomeMatch) {
        extracted.income = parseInt(incomeMatch[1], 10);
      }
      if (expenseMatch) {
        extracted.expenses = parseInt(expenseMatch[1], 10);
      }

      // If just two numbers, assume income and expenses
      if (!extracted.income && !extracted.expenses && numbersMatch?.length === 2) {
        extracted.income = parseInt(numbersMatch[0], 10);
        extracted.expenses = parseInt(numbersMatch[1], 10);
      }
      break;
    }

    case 'work_preferences': {
      // Extract max hours and hourly rate
      const hoursMatch = msg.match(/(\d+)\s*(?:hours?|h)/i);
      const rateMatch = msg.match(/(?:\$|€)?(\d+)(?:\/h|per hour|hourly)/i);

      if (hoursMatch) {
        extracted.maxWorkHours = parseInt(hoursMatch[1], 10);
      }
      if (rateMatch) {
        extracted.minHourlyRate = parseInt(rateMatch[1], 10);
      }
      break;
    }

    case 'goal': {
      // Extract goal name, amount, deadline
      const amountMatch = msg.match(/(?:\$|€)?(\d+)/);
      const goalKeywords = ['vacation', 'laptop', 'phone', 'car', 'emergency', 'savings', 'trip'];

      if (amountMatch) {
        extracted.goalAmount = parseInt(amountMatch[1], 10);
      }

      for (const keyword of goalKeywords) {
        if (msg.toLowerCase().includes(keyword)) {
          extracted.goalName = keyword.charAt(0).toUpperCase() + keyword.slice(1);
          break;
        }
      }
      break;
    }
  }

  return extracted;
}

/**
 * Get the next step in the onboarding flow
 */
function getNextStep(currentStep: string): string {
  const flow = [
    'greeting',
    'name',
    'studies',
    'skills',
    'location',
    'budget',
    'work_preferences',
    'goal',
    'academic_events',
    'inventory',
    'lifestyle',
    'complete',
  ];

  const currentIndex = flow.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex >= flow.length - 1) {
    return 'complete';
  }
  return flow[currentIndex + 1];
}

/**
 * Messages when advancing to the next step
 */
function getAdvanceMessage(nextStep: string, profile: ProfileData): string {
  const name = profile.name || '';

  const messages: Record<string, string> = {
    name: `Nice to meet you${name ? `, ${name}` : ''}! What are you studying? (level and field)`,
    studies: `Great${name ? `, ${name}` : ''}! What skills do you have? (coding, languages, tutoring, music...)`,
    skills: `Awesome skills! Where do you live?`,
    location: `Got it! Now about your budget - how much do you earn and spend per month?`,
    budget: `Thanks! How many hours per week can you work, and what's your minimum hourly rate?`,
    work_preferences: `Perfect! What's your savings goal? (what, how much, by when)`,
    goal: `Great goal! Any upcoming exams or busy periods to plan around?`,
    academic_events: `Noted! Any items you could sell for extra cash? (textbooks, electronics...)`,
    inventory: `Thanks! What subscriptions do you pay for? (Netflix, Spotify, gym...)`,
    lifestyle: `Almost done! Anything else to add?`,
    complete: `Your profile is complete${name ? `, ${name}` : ''}! Head to "My Plan" to see your personalized strategies.`,
  };

  return messages[nextStep] || "Let's continue!";
}

export default {
  processWithMastraAgent,
};
