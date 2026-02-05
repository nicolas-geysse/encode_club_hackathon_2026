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
    greeting: '🌍 What city do you live in?',
    currency_confirm:
      "I couldn't detect your region automatically. Are you in the US (USD), UK (GBP), or Europe (EUR)?",
    name: "👋 What's your name?",
    studies: `📚 Nice to meet you${ctx.name ? `, ${ctx.name}` : ''}! What are you studying?`,
    skills: '💪 What are your skills?',
    certifications: '📜 Any professional certifications?',
    budget: '💰 Monthly budget: how much do you earn and spend?',
    income_timing: '📅 When does your income arrive each month?',
    work_preferences: '⏰ Max hours/week you can work? Minimum hourly rate?',
    goal: "🎯 What's your savings goal?",
    academic_events: '📆 Any busy periods coming up? (exams, projects, vacations)',
    inventory: '🏷️ Items you could sell for extra cash?',
    trade: '🔄 Things you could borrow or trade with friends?',
    lifestyle: '📱 What subscriptions do you pay for?',
    complete: '',
  };
  return questions[step] || "Let's continue!";
}

/**
 * Clarification messages for each step (when extraction fails)
 */
export function getClarificationMessage(step: OnboardingStep): string {
  const clarifications: Record<OnboardingStep, string> = {
    greeting: '🌍 What city do you live in?',
    currency_confirm:
      "I couldn't detect your region. Are you in the US (USD), UK (GBP), or Europe (EUR)?",
    name: '👋 What should I call you?',
    studies: '📚 What are you studying? (e.g., Bachelor 2 Computer Science)',
    skills: '💪 What skills do you have? (coding, languages, tutoring...)',
    certifications:
      '📜 Any professional certifications?\n🇫🇷 BAFA, BNSSA, PSC1 · 🇬🇧 DBS, First Aid · 🇺🇸 CPR, Lifeguard · 🌍 PADI, TEFL\n(or "none")',
    budget: '💰 How much do you earn and spend per month?',
    income_timing: '📅 When does your income arrive? (beginning, mid-month, or end)',
    work_preferences: '⏰ Max hours/week? Minimum hourly rate?',
    goal: '🎯 What are you saving for, how much, and by when?',
    academic_events: '📆 Any busy periods coming up? (or "none")',
    inventory: '🏷️ Items you could sell? (or "none")',
    trade: '🔄 Things you could borrow or trade? (or "none")',
    lifestyle: '📱 What subscriptions do you pay for? (or "none")',
    complete: '✅ Your profile is complete! Head to "Me" to see your strategies.',
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
    name: `✓ Got it! Amounts will be in ${currencySymbol}.\n\n👋 What's your name?`,
    studies: `📚 Nice to meet you${name ? `, ${name}` : ''}! What are you studying?`,
    skills: `💪 Great${name ? `, ${name}` : ''}! What are your skills?`,
    certifications: `📜 Any professional certifications?\n🇫🇷 BAFA, BNSSA, PSC1 · 🇬🇧 DBS, First Aid · 🇺🇸 CPR, Lifeguard · 🌍 PADI, TEFL\n(or "none")`,
    budget: `💰 Monthly budget: how much do you earn and spend? (in ${currencySymbol})`,
    income_timing: `📅 When does your income arrive each month?`,
    work_preferences: `⏰ Max hours/week you can work? Minimum hourly rate? (in ${currencySymbol}/h)`,
    goal: `🎯 What's your savings goal?`,
    academic_events: `📆 Any busy periods coming up? (exams, projects, vacations) or "none"`,
    inventory: `🏷️ Items you could sell for extra cash? (or "none")`,
    trade: `🔄 Things you could borrow or trade with friends?\n📥 Borrow gear · 🔄 Trade skills\n(or "none")`,
    lifestyle: `📱 What subscriptions do you pay for? (or "none")`,
    complete: `✅ All set${name ? `, ${name}` : ''}! Your profile is ready.\n\n👉 Click **"Me"** to see your personalized strategies.`,
  };

  return messages[nextStep] || `Great${name ? `, ${name}` : ''}! Let's continue.`;
}

/**
 * Generate completion message
 */
export function generateCompletionMessage(context: Record<string, unknown>): string {
  const name = context.name || '';
  return `✅ All set${name ? `, ${name}` : ''}! Your profile is ready.

👉 Click **"Me"** to see your personalized strategies.`;
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
      return `I couldn't detect your region. Are you in **US** (USD), **UK** (GBP), or **Europe** (EUR)?`;
    case 'name':
      return `✓ Got it!\n\n👋 What's your name?`;
    case 'studies':
      return `📚 Nice to meet you${context.name ? `, ${context.name}` : ''}! What are you studying?`;
    case 'skills':
      return `💪 Great! What are your skills?`;
    case 'certifications':
      return `📜 Any professional certifications?\n🇫🇷 BAFA, BNSSA, PSC1 · 🇬🇧 DBS, First Aid · 🇺🇸 CPR, Lifeguard · 🌍 PADI, TEFL\n(or "none")`;
    case 'budget':
      return `💰 Monthly budget: how much do you earn and spend?`;
    case 'work_preferences':
      return `⏰ Max hours/week you can work? Minimum hourly rate?`;
    case 'goal':
      return `🎯 What's your savings goal?`;
    case 'academic_events':
      return `📆 Any busy periods coming up? (exams, projects, vacations) or "none"`;
    case 'inventory':
      return `🏷️ Items you could sell for extra cash? (or "none")`;
    case 'trade':
      return `🔄 Things you could borrow or trade with friends? (or "none")`;
    case 'lifestyle':
      return `📱 What subscriptions do you pay for? (or "none")`;
    case 'complete':
      return generateCompletionMessage(context);
    default:
      return "Let's continue!";
  }
}
