/**
 * Regex Extractor
 *
 * Extract profile data from user messages using regex patterns.
 * This is the fallback when LLM extraction is unavailable.
 */

import {
  SERVICE_NAMES,
  NAME_PATTERNS,
  DIPLOMA_PATTERNS,
  FIELD_PATTERNS,
  CITY_PATTERNS,
  SKILL_PATTERNS,
  CERTIFICATION_PATTERNS,
  GOAL_PATTERNS,
  SUBSCRIPTION_PATTERNS,
  INVENTORY_PATTERNS,
  ENGLISH_MONTH_NAMES,
  EUR_CITIES,
  GBP_CITIES,
  USD_CITIES,
  detectCurrencyFromCity,
} from './patterns';
import type { ProfileData, OnboardingStep } from '../types';
import { getReferenceDate, type TimeContext } from '../../timeAwareDate';
import { toISODate } from '../../dateUtils';

/**
 * Extract profile data from message using regex patterns
 * Context-aware: uses existing data to avoid duplicate extraction
 */
export function extractWithRegex(
  message: string,
  step: OnboardingStep,
  context?: Record<string, unknown>,
  timeContext?: TimeContext
): ProfileData {
  const extracted: ProfileData = {};
  const msg = message.trim();
  const lower = msg.toLowerCase();
  const original = msg;

  switch (step) {
    case 'greeting':
      extractCity(msg, lower, extracted);
      break;

    case 'currency_confirm':
      extractCurrency(lower, extracted);
      break;

    case 'name':
      extractName(original, extracted);
      break;

    case 'studies':
      extractStudies(msg, lower, extracted);
      break;

    case 'skills':
      extractSkills(lower, extracted);
      break;

    case 'certifications':
      extractCertifications(msg, lower, extracted);
      break;

    case 'budget':
      extractBudget(msg, lower, context, extracted);
      break;

    case 'work_preferences':
      extractWorkPreferences(msg, lower, context, extracted);
      break;

    case 'goal':
      extractGoal(msg, lower, extracted, timeContext);
      break;

    case 'academic_events':
      extractAcademicEvents(msg, lower, extracted);
      break;

    case 'inventory':
      extractInventory(msg, lower, extracted);
      break;

    case 'trade':
      extractTrades(msg, lower, extracted);
      break;

    case 'lifestyle':
      extractSubscriptions(lower, extracted);
      break;

    case 'complete':
      // Nothing to extract at complete step
      break;
  }

  return extracted;
}

// =============================================================================
// Step-Specific Extraction Functions
// =============================================================================

function extractCity(msg: string, lower: string, extracted: ProfileData): void {
  // Try known city patterns first
  for (const [pattern, city] of CITY_PATTERNS) {
    if (pattern.test(lower)) {
      extracted.city = city;
      const currency = detectCurrencyFromCity(city);
      if (currency) {
        extracted.currency = currency;
      }
      return;
    }
  }

  // Clean up punctuation and use as city name
  const cityName = msg.replace(/[!?.,:;]+$/, '').trim();
  if (cityName.length >= 2) {
    extracted.city = cityName
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    // Auto-detect currency from known cities
    if (EUR_CITIES.some((c) => lower.includes(c))) {
      extracted.currency = 'EUR';
    } else if (GBP_CITIES.some((c) => lower.includes(c))) {
      extracted.currency = 'GBP';
    } else if (USD_CITIES.some((c) => lower.includes(c))) {
      extracted.currency = 'USD';
    }
  }
}

function extractCurrency(lower: string, extracted: ProfileData): void {
  if (lower.match(/\b(us|america|dollar|usd|united states)\b/i)) {
    extracted.currency = 'USD';
  } else if (lower.match(/\b(uk|britain|pound|£|gbp|england|scotland|wales)\b/i)) {
    extracted.currency = 'GBP';
  } else if (
    lower.match(
      /\b(euro|europe|€|eur|france|germany|italy|spain|netherlands|belgium|portugal|austria|ireland)\b/i
    )
  ) {
    extracted.currency = 'EUR';
  }
}

function extractName(original: string, extracted: ProfileData): void {
  for (const pattern of NAME_PATTERNS) {
    const match = original.match(pattern);
    if (match && match[1]?.length >= 2) {
      const candidate = match[1];
      if (!SERVICE_NAMES.includes(candidate.toLowerCase())) {
        // Strip trailing punctuation
        extracted.name = candidate
          .trim()
          .replace(/[!?.,:;]+$/, '')
          .trim();
        return;
      }
    }
  }

  // Single word fallback
  const words = original.split(/\s+/);
  if (words.length === 1 && words[0].length >= 2) {
    const word = words[0];
    if (!SERVICE_NAMES.includes(word.toLowerCase())) {
      extracted.name = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  }
}

function extractStudies(msg: string, lower: string, extracted: ProfileData): void {
  // Extract diploma
  for (const [pattern, diploma] of DIPLOMA_PATTERNS) {
    if (pattern.test(lower)) {
      extracted.diploma = diploma;
      break;
    }
  }

  // Extract field
  for (const [pattern, field] of FIELD_PATTERNS) {
    if (pattern.test(lower)) {
      extracted.field = field;
      break;
    }
  }

  // If diploma but no field, try to extract remaining text as field
  if (extracted.diploma && !extracted.field) {
    const remainingText = msg
      .replace(new RegExp(DIPLOMA_PATTERNS.map(([p]) => p.source).join('|'), 'gi'), '')
      .replace(/\bin\b/i, '')
      .trim();
    if (remainingText.length >= 2 && remainingText.length <= 50) {
      extracted.field = remainingText
        .split(/\s+/)
        .slice(0, 4)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // If nothing specific found, accept any text
  if (!extracted.diploma && !extracted.field && msg.length >= 2 && msg.length <= 100) {
    const words = msg.trim().split(/\s+/);
    if (words.length >= 2) {
      extracted.diploma = words[0];
      extracted.field = words.slice(1).join(' ');
    } else {
      extracted.field = msg.trim();
    }
  }
}

function extractSkills(lower: string, extracted: ProfileData): void {
  const skillsList: string[] = [];
  for (const [pattern, skill] of SKILL_PATTERNS) {
    if (pattern.test(lower)) {
      skillsList.push(skill);
    }
  }

  if (skillsList.length > 0) {
    extracted.skills = skillsList;
  }
}

function extractCertifications(msg: string, lower: string, extracted: ProfileData): void {
  if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(lower)) {
    extracted.certifications = [];
    return;
  }

  const detected: string[] = [];
  for (const { pattern, code } of CERTIFICATION_PATTERNS) {
    if (pattern.test(lower) && !detected.includes(code)) {
      detected.push(code);
    }
  }

  if (detected.length > 0) {
    extracted.certifications = detected;
  } else if (msg.length >= 2 && msg.length <= 100) {
    // Accept any comma-separated list
    const customCerts = msg
      .split(/[,;&]|\band\b/i)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length >= 2 && s.length <= 20);
    if (customCerts.length > 0) {
      extracted.certifications = customCerts;
    }
  }
}

function extractBudget(
  msg: string,
  lower: string,
  context: Record<string, unknown> | undefined,
  extracted: ProfileData
): void {
  const incomeMatch = lower.match(/(?:earn|income|receive|make|get|gagne|revenu)[^\d]*(\d+)/i);
  const expenseMatch = lower.match(/(?:spend|expense|pay|cost|dépense|paye)[^\d]*(\d+)/i);
  const numbersMatch = msg.match(/(\d+)/g);

  if (incomeMatch) {
    extracted.income = parseInt(incomeMatch[1], 10);
  }
  if (expenseMatch) {
    extracted.expenses = parseInt(expenseMatch[1], 10);
  }

  // Fallback: use two numbers as income/expenses
  if (!extracted.income && !extracted.expenses && numbersMatch) {
    if (numbersMatch.length >= 2) {
      extracted.income = parseInt(numbersMatch[0], 10);
      extracted.expenses = parseInt(numbersMatch[1], 10);
    } else if (numbersMatch.length === 1) {
      extracted.income = parseInt(numbersMatch[0], 10);
      extracted.expenses = 0;
    }
  }

  // Handle "none" response
  if (/\b(none|nothing|rien|pas|zero|0)\b/i.test(lower)) {
    if (!extracted.income) extracted.income = 0;
    if (!extracted.expenses) extracted.expenses = 0;
  }
}

function extractWorkPreferences(
  msg: string,
  lower: string,
  context: Record<string, unknown> | undefined,
  extracted: ProfileData
): void {
  const hoursMatch = lower.match(/(\d+)\s*(?:hours?|h|heures?)/i);
  const rateMatch = lower.match(/(?:\$|€)?(\d+)\s*(?:\/h|per hour|hourly|de l'heure|€\/h|\$\/h)/i);
  const numbersMatch = msg.match(/(\d+)/g);

  if (hoursMatch) {
    extracted.maxWorkHours = parseInt(hoursMatch[1], 10);
  }
  if (rateMatch) {
    extracted.minHourlyRate = parseInt(rateMatch[1], 10);
  }

  // Fallback: use two numbers
  if (
    !extracted.maxWorkHours &&
    !extracted.minHourlyRate &&
    numbersMatch &&
    numbersMatch.length >= 2
  ) {
    extracted.maxWorkHours = parseInt(numbersMatch[0], 10);
    extracted.minHourlyRate = parseInt(numbersMatch[1], 10);
  } else if (
    !extracted.maxWorkHours &&
    !extracted.minHourlyRate &&
    numbersMatch &&
    numbersMatch.length === 1
  ) {
    extracted.maxWorkHours = parseInt(numbersMatch[0], 10);
    extracted.minHourlyRate = 12; // Default
  }
}

function extractGoal(
  msg: string,
  lower: string,
  extracted: ProfileData,
  timeContext?: TimeContext
): void {
  // Extract amount
  const amountMatch = msg.match(/(?:\$|€)?(\d+)/);
  if (amountMatch) {
    extracted.goalAmount = parseInt(amountMatch[1], 10);
  }

  // Extract goal name
  for (const [pattern, goalName] of GOAL_PATTERNS) {
    if (pattern.test(lower)) {
      extracted.goalName = goalName;
      break;
    }
  }

  // Extract deadline (time-aware for simulation support)
  const refDate = getReferenceDate(timeContext);
  const monthMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (monthMatch) {
    const monthIndex = ENGLISH_MONTH_NAMES.indexOf(monthMatch[1].toLowerCase());
    const yearMatch = msg.match(/20\d{2}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : refDate.getFullYear();

    const targetDate = new Date(year, monthIndex + 1, 0);
    if (targetDate < refDate) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }
    extracted.goalDeadline = toISODate(targetDate);
  }

  // Relative deadline
  const relativeMatch = lower.match(
    /\b(?:in|within|dans|d'ici)\s+(\d+)\s+(months?|mois|weeks?|semaines?|years?|ans?)/i
  );
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const targetDate = new Date(refDate);

    if (unit.startsWith('month') || unit === 'mois') {
      targetDate.setMonth(targetDate.getMonth() + amount);
    } else if (unit.startsWith('week') || unit.startsWith('semaine')) {
      targetDate.setDate(targetDate.getDate() + amount * 7);
    } else if (unit.startsWith('year') || unit.startsWith('an')) {
      targetDate.setFullYear(targetDate.getFullYear() + amount);
    }

    extracted.goalDeadline = toISODate(targetDate);
  }

  // If only amount, add missing info
  if (extracted.goalAmount && !extracted.goalName) {
    extracted.missingInfo = [
      ...(extracted.missingInfo || []),
      'goal purpose (what are you saving for?)',
    ];
  }
}

function extractAcademicEvents(msg: string, lower: string, extracted: ProfileData): void {
  if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(lower)) {
    extracted.academicEvents = [];
    return;
  }

  if (msg.length >= 2) {
    const events = msg
      .split(/[,;&]|\band\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .map((text) => {
        let type: 'exam' | 'vacation' | 'busy' = 'busy';
        if (/\b(exam|test|final|midterm|quiz|partiel|examen)\b/i.test(text)) {
          type = 'exam';
        } else if (/\b(vacation|holiday|break|vacances|congé)\b/i.test(text)) {
          type = 'vacation';
        }

        return { name: text, type };
      });

    if (events.length > 0) {
      extracted.academicEvents = events;
    }
  }
}

function extractInventory(msg: string, lower: string, extracted: ProfileData): void {
  if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(lower)) {
    extracted.inventoryItems = [];
    return;
  }

  const inventoryList: { name: string; category: string; estimatedValue: number }[] = [];
  for (const [pattern, item] of INVENTORY_PATTERNS) {
    if (pattern.test(lower)) {
      inventoryList.push(item);
    }
  }

  if (inventoryList.length > 0) {
    extracted.inventoryItems = inventoryList;
  } else if (msg.length >= 2) {
    // Generic items
    const items = msg
      .split(/[,;&]|\band\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .map((name) => ({ name, category: 'other', estimatedValue: 50 }));
    if (items.length > 0) {
      extracted.inventoryItems = items;
    }
  }
}

function extractTrades(msg: string, lower: string, extracted: ProfileData): void {
  if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(lower)) {
    extracted.tradeOpportunities = [];
    return;
  }

  const trades: {
    type: 'borrow' | 'lend' | 'trade' | 'sell' | 'cut';
    description: string;
    withPerson?: string;
  }[] = [];

  // Borrow patterns
  const borrowMatches = lower.matchAll(/borrow\s+(.+?)\s+from\s+(\w+)/gi);
  for (const match of borrowMatches) {
    trades.push({
      type: 'borrow',
      description: match[1].trim(),
      withPerson: match[2].trim(),
    });
  }

  // Trade patterns
  const tradeMatches = lower.matchAll(/trade\s+(.+?)\s+for\s+(.+)/gi);
  for (const match of tradeMatches) {
    trades.push({
      type: 'trade',
      description: match[1].trim(),
    });
  }

  // Generic if no patterns matched
  if (trades.length === 0 && msg.length >= 2) {
    const items = msg
      .split(/[,;&]|\band\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    for (const item of items) {
      trades.push({
        type: 'trade',
        description: item,
      });
    }
  }

  if (trades.length > 0) {
    extracted.tradeOpportunities = trades;
  }
}

function extractSubscriptions(lower: string, extracted: ProfileData): void {
  if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(lower)) {
    extracted.subscriptions = [];
    return;
  }

  const subscriptionsList: { name: string; currentCost: number }[] = [];
  for (const [pattern, sub] of SUBSCRIPTION_PATTERNS) {
    if (pattern.test(lower)) {
      subscriptionsList.push(sub);
    }
  }

  if (subscriptionsList.length > 0) {
    extracted.subscriptions = subscriptionsList;
  }
}
