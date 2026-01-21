/**
 * Flow Controller
 *
 * Controls the onboarding flow progression - determining next steps,
 * generating clarification messages, and managing step completion.
 */

import type { OnboardingStep, ProfileData } from '../types';
import { ONBOARDING_FLOW, REQUIRED_FIELDS } from '../types';
import { getCurrencySymbol } from '../prompts/interpolator';

/**
 * Get the next step in the onboarding flow
 * Only advances if relevant data was extracted
 */
export function getNextStep(
  currentStep: OnboardingStep,
  extractedData: Record<string, unknown> = {}
): OnboardingStep {
  // Special case: Skip currency_confirm if currency was auto-detected from city
  if (currentStep === 'greeting' && extractedData.currency) {
    return 'name'; // Skip currency_confirm
  }

  const required = REQUIRED_FIELDS[currentStep] || [];

  // Check if at least one required field was extracted (or step has no requirements)
  const hasRequiredData =
    required.length === 0 ||
    required.some(
      (field) =>
        extractedData[field] !== undefined &&
        extractedData[field] !== null &&
        extractedData[field] !== ''
    );

  if (!hasRequiredData) {
    // Stay on current step - didn't get the expected data
    return currentStep;
  }

  const currentIndex = ONBOARDING_FLOW.indexOf(currentStep);
  return ONBOARDING_FLOW[Math.min(currentIndex + 1, ONBOARDING_FLOW.length - 1)];
}

/**
 * Find the first incomplete step in onboarding based on context
 * Used to resume onboarding from where the user left off
 */
export function findFirstIncompleteStep(ctx: Record<string, unknown>): OnboardingStep {
  if (!ctx.city) return 'greeting';
  if (!ctx.currency) return 'currency_confirm';
  if (!ctx.name) return 'name';
  if (!ctx.diploma && !ctx.field) return 'studies';
  if (!ctx.skills || (Array.isArray(ctx.skills) && ctx.skills.length === 0)) return 'skills';
  if (!ctx.income && !ctx.expenses) return 'budget';
  if (!ctx.maxWorkHours && !ctx.minHourlyRate) return 'work_preferences';
  if (!ctx.goalName && !ctx.goalAmount) return 'goal';
  // Optional steps: academic_events, inventory, lifestyle - always allow skipping
  return 'complete';
}

/**
 * Get the question for a specific onboarding step
 */
export function getStepQuestion(step: OnboardingStep, ctx: Record<string, unknown>): string {
  const questions: Record<OnboardingStep, string> = {
    greeting: 'What city do you live in? (e.g., Paris, London, New York)',
    currency_confirm:
      "I couldn't detect your region automatically. Are you in the US (USD), UK (GBP), or Europe (EUR)?",
    name: "What's your name? I'd love to know who I'm helping today!",
    studies: `Nice to meet you${ctx.name ? `, ${ctx.name}` : ''}! What are you studying? (e.g., "Junior CS", "Senior Law")`,
    skills: 'What are your skills? (coding, languages, design, sports...)',
    certifications:
      "Do you have any professional certifications? (BAFA, lifeguard, CPR, TEFL, etc.) Say 'none' if you don't have any.",
    budget: 'How much do you earn and spend per month roughly?',
    work_preferences:
      "How many hours max per week can you work? And what's your minimum hourly rate?",
    goal: "What's your savings goal? What do you want to save for, how much, and by when?",
    academic_events: 'Any important academic events coming up? (exams, vacations, busy periods)',
    inventory: 'Do you have any items you could sell? (old textbooks, electronics, clothes...)',
    trade: "Any trade opportunities? (Borrow a friend's bike, lend your camera, swap textbooks...)",
    lifestyle: 'What subscriptions do you have? (streaming, gym, phone plan...)',
    complete: '',
  };
  return questions[step] || "Let's continue!";
}

/**
 * Clarification messages for each step (when extraction fails)
 */
export function getClarificationMessage(step: OnboardingStep): string {
  const clarifications: Record<OnboardingStep, string> = {
    greeting: 'What city do you live in? (e.g., Paris, London, New York)',
    currency_confirm:
      "I couldn't detect your region automatically. Are you in the US (USD), UK (GBP), or Europe (EUR)?",
    name: "I didn't catch your name. What should I call you?",
    studies:
      "I'd love to know about your studies! What's your education level and field?\n\nExamples: Bachelor 2nd year Computer Science, Master 1 Business, PhD Physics",
    skills: 'What skills do you have? (coding, languages, music, sports...)',
    certifications:
      "Do you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')",
    budget: 'How much do you earn and spend per month? (two numbers, like "800 and 600")',
    work_preferences: "How many hours can you work per week? And what's your minimum hourly rate?",
    goal: "What's your savings goal? What are you saving for, how much, and by when?",
    academic_events: "Any upcoming exams or busy periods? Or say 'none' to continue.",
    inventory: "Any items you could sell? (textbooks, electronics...) Or 'none' to skip.",
    trade:
      "Are there things you could borrow instead of buying, or skills you could trade with friends? Or say 'none'.",
    lifestyle: "What subscriptions do you pay for? (Netflix, Spotify, gym...) Or 'none'.",
    complete: "Your profile is complete! Head to 'My Plan' to see your strategies.",
  };

  return clarifications[step] || 'Tell me more about yourself.';
}

/**
 * Messages when advancing to the next step
 */
export function getAdvanceMessage(nextStep: OnboardingStep, profile: ProfileData): string {
  const name = profile.name || '';
  const city = profile.city || '';
  const currencySymbol = getCurrencySymbol(profile.currency);

  const messages: Record<OnboardingStep, string> = {
    greeting: '', // Not used
    currency_confirm: `I couldn't detect your region from "${city}". Are you in **US** (USD), **UK** (GBP), or **Europe** (EUR)?`,
    name: `Got it! I'll show amounts in ${currencySymbol}. What's your name?`,
    studies: `Nice to meet you${name ? `, ${name}` : ''}! What are you studying?\n\nTell me your education level and field (e.g., "Bachelor 2nd year Computer Science", "Master 1 Business")`,
    skills: `Great${name ? `, ${name}` : ''}! What skills do you have? (coding, languages, tutoring, music...)`,
    certifications: `Awesome skills! Do you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')`,
    budget: `Got it! Now about your budget - how much do you earn and spend per month? (in ${currencySymbol})`,
    work_preferences: `Thanks! How many hours per week can you work, and what's your minimum hourly rate? (in ${currencySymbol}/h)`,
    goal: `Perfect! What's your savings goal? (what, how much in ${currencySymbol}, by when)`,
    academic_events: `Great goal! Any upcoming exams or busy periods to plan around? (or say 'none')`,
    inventory: `Noted! Any items you could sell for extra cash? (textbooks, electronics... or 'none')`,
    trade: `Thanks! Are there things you could borrow instead of buying, or skills you could trade with friends?\n\n📥 "borrow camping gear from Alex"\n🔄 "trade tutoring for web design"\n\n(or say 'none')`,
    lifestyle: `Got it! What subscriptions do you pay for? (Netflix, Spotify, gym... or 'none')`,
    complete: `Your profile is complete${name ? `, ${name}` : ''}! Head to "My Plan" to see your personalized strategies.`,
  };

  return messages[nextStep] || `Great${name ? `, ${name}` : ''}! Let's continue.`;
}

/**
 * Generate completion message
 */
export function generateCompletionMessage(context: Record<string, unknown>): string {
  const name = context.name || 'you';
  return `Perfect ${name}! I have everything I need.

I've created a personalized profile for you. You can now:
- Set a savings goal
- Explore jobs that match your skills
- Optimize your budget

**Ready to go?** Click on "My Plan" to get started!`;
}

/**
 * Fallback responses for each step when LLM is unavailable
 */
export function getFallbackStepResponse(
  step: OnboardingStep,
  context: Record<string, unknown>
): string {
  switch (step) {
    case 'currency_confirm':
      return `I couldn't detect your region automatically.\n\nAre you in **US** (USD), **UK** (GBP), or **Europe** (EUR)?`;
    case 'name':
      return `${context.city || 'Great'}! What's your name?`;
    case 'studies':
      return `Nice to meet you, ${context.name || ''}!\n\nWhat are you studying? (e.g., "Bachelor 2nd year Computer Science", "Master 1 Business")`;
    case 'skills':
      return `${context.diploma || ''} ${context.field || ''}, cool!\n\nWhat are your skills? (coding, languages, design, sports...)`;
    case 'certifications':
      return `Nice skills!\n\nDo you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')`;
    case 'budget':
      return `Got it!\n\nLet's talk budget: how much do you earn and spend per month roughly?`;
    case 'work_preferences':
      return `Got it for the budget!\n\nHow many hours max per week can you work? And what's your minimum hourly rate?`;
    case 'goal':
      return `Perfect, ${context.maxWorkHours || 15}h/week works!\n\nNow, what's your savings goal? What do you want to save for, how much, and by when? (e.g., "emergency fund $1000 by June")`;
    case 'academic_events':
      return `Great goal!\n\nAny important academic events coming up? (exams, vacations, busy periods)`;
    case 'inventory':
      return `Thanks for sharing that!\n\nDo you have any items you could sell? (old textbooks, electronics, clothes, etc.)`;
    case 'trade':
      return `Good to know!\n\nAny trade opportunities? (Borrow a friend's bike, lend your camera, swap textbooks with classmates...)`;
    case 'lifestyle':
      return `Got it!\n\nWhat subscriptions or recurring expenses do you have? (streaming, gym, phone plan, etc.)`;
    case 'complete':
      return generateCompletionMessage(context);
    default:
      return "Let's continue!";
  }
}
