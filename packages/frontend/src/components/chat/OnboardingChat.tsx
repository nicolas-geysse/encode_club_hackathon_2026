/**
 * Onboarding Chat Component
 *
 * Conversational onboarding with Bruno avatar.
 * Uses LLM API for intelligent responses and data extraction.
 */

import { createSignal, createEffect, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { profileService, type FullProfile } from '~/lib/profileService';
import { goalService } from '~/lib/goalService';
import { skillService } from '~/lib/skillService';
import { lifestyleService } from '~/lib/lifestyleService';
import { inventoryService } from '~/lib/inventoryService';
import { useProfile } from '~/lib/profileContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'mastra' | 'groq' | 'fallback';
}

interface AcademicEvent {
  name: string;
  type: 'exam' | 'vacation' | 'busy';
  startDate?: string;
  endDate?: string;
}

interface InventoryItem {
  name: string;
  category: string;
  estimatedValue?: number;
}

interface Subscription {
  name: string;
  currentCost: number;
}

interface ProfileData {
  name: string;
  diploma: string;
  field: string;
  yearsRemaining: number;
  skills: string[];
  certifications?: string[]; // Professional certifications (BAFA, PSC1, TEFL, etc.)
  city: string;
  citySize: string;
  incomes: { source: string; amount: number }[];
  expenses: { category: string; amount: number }[];
  maxWorkHours: number;
  minHourlyRate: number;
  hasLoan: boolean;
  loanAmount: number;
  // New fields for extended onboarding
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  academicEvents?: AcademicEvent[];
  inventoryItems?: InventoryItem[];
  subscriptions?: Subscription[];
}

type OnboardingStep =
  | 'greeting'
  | 'name'
  | 'studies'
  | 'skills'
  | 'certifications'
  | 'location'
  | 'budget'
  | 'work_preferences'
  | 'goal'
  | 'academic_events'
  | 'inventory'
  | 'lifestyle'
  | 'complete';

/**
 * Smart merge for arrays that handles:
 * - undefined incoming → keep existing
 * - empty array at the step that collects this field → "none" explicitly (clear)
 * - empty array at other steps → keep existing
 * - non-empty array → merge and deduplicate
 */
function smartMergeArrays<T>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
  currentStep: OnboardingStep,
  stepForField: OnboardingStep
): T[] | undefined {
  // If incoming is undefined, keep existing
  if (incoming === undefined) return existing;

  // If empty array AND we're at the step that collects this field → user said "none"
  if (incoming.length === 0 && currentStep === stepForField) {
    return [];
  }

  // If empty array but not at this step → keep existing (don't overwrite)
  if (incoming.length === 0) return existing;

  // Non-empty array: merge with existing and deduplicate
  if (!existing || existing.length === 0) return incoming;

  // For simple types (strings), use Set for deduplication
  if (typeof incoming[0] === 'string') {
    return [...new Set([...(existing as string[]), ...(incoming as string[])])] as T[];
  }

  // For objects, merge by checking name field
  const merged = [...existing];
  for (const item of incoming) {
    const itemName = (item as { name?: string }).name;
    if (itemName) {
      const existsIdx = merged.findIndex((e) => (e as { name?: string }).name === itemName);
      if (existsIdx === -1) {
        merged.push(item);
      }
    } else {
      merged.push(item);
    }
  }
  return merged;
}

/**
 * Chat modes:
 * - onboarding: Initial guided flow for new users
 * - conversation: Free-form chat after onboarding is complete
 * - profile-edit: User wants to update their profile
 */
type ChatMode = 'onboarding' | 'conversation' | 'profile-edit';

/**
 * Intent detection result from API
 */
interface DetectedIntent {
  mode: ChatMode;
  action?: string;
  field?: string;
}

// Initial greeting message
const GREETING_MESSAGE = `Hey! I'm **Bruno**, your personal financial coach.

I'll help you navigate student life and reach your goals.

To start, **what's your name?**`;

// Welcome back message for returning users (conversation mode)
const getWelcomeBackMessage = (name: string) => `Hey **${name}**! What can I help you with?

You can:
- **Ask about your plan** - "How's my progress?"
- **Update your profile** - "Change my city to Paris"
- **Add a new goal** - "I want to save for a new laptop"
- **Get savings advice** - "How can I save more?"
- **Start fresh** - "Restart onboarding" or "New profile"`;

// Profile edit mode message
const PROFILE_EDIT_MESSAGE = `Sure, I can help you update your profile.

What would you like to change?
- Name, diploma, city, skills
- Work preferences (hours, hourly rate)
- Budget (income, expenses)`;

// Generate a unique thread ID for Opik conversation grouping
function generateThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function OnboardingChat() {
  const navigate = useNavigate();
  const { profile: contextProfile, refreshProfile } = useProfile();
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [step, setStep] = createSignal<OnboardingStep>('greeting');
  const [chatMode, setChatMode] = createSignal<ChatMode>('onboarding');
  const [profile, setProfile] = createSignal<Partial<ProfileData>>({
    skills: [],
    certifications: [],
    incomes: [],
    expenses: [],
    maxWorkHours: 15,
    minHourlyRate: 12,
    hasLoan: false,
    loanAmount: 0,
    academicEvents: [],
    inventoryItems: [],
    subscriptions: [],
  });
  const [isComplete, setIsComplete] = createSignal(false);
  const [threadId, setThreadId] = createSignal<string>(generateThreadId());
  const [profileId, setProfileId] = createSignal<string | undefined>(undefined);

  // Ref for auto-focusing input after response
  let chatInputRef: { focus: () => void } | null = null;

  // Ref for auto-scrolling chat to bottom
  let messagesContainerRef: HTMLDivElement | null = null;

  // Auto-scroll to bottom when messages change or loading state changes
  createEffect(() => {
    // Track dependencies
    messages();
    loading();
    // Scroll to bottom
    if (messagesContainerRef) {
      setTimeout(() => {
        messagesContainerRef?.scrollTo({
          top: messagesContainerRef.scrollHeight,
          behavior: 'smooth',
        });
      }, 50);
    }
  });

  // Handle profile switch from context (when user switches profiles in header)
  const handleProfileSwitch = (newProfile: FullProfile) => {
    // Update local profile ID
    setProfileId(newProfile.id);

    // Map context profile data to local state
    setProfile({
      name: newProfile.name || '',
      diploma: newProfile.diploma || '',
      field: newProfile.field || '',
      skills: newProfile.skills || [],
      city: newProfile.city || '',
      citySize: newProfile.citySize || '',
      incomes: newProfile.incomeSources || [],
      expenses: newProfile.expenses || [],
      maxWorkHours: newProfile.maxWorkHoursWeekly || 15,
      minHourlyRate: newProfile.minHourlyRate || 12,
      hasLoan: newProfile.hasLoan || false,
      loanAmount: newProfile.loanAmount || 0,
      goalName: newProfile.goalName || '',
      goalAmount: newProfile.goalAmount || 0,
      goalDeadline: newProfile.goalDeadline || '',
      academicEvents: [],
      inventoryItems: [],
      subscriptions: [],
    });

    // Check profile completeness - need key fields to skip onboarding
    const isProfileComplete =
      newProfile.name &&
      newProfile.diploma &&
      newProfile.city &&
      newProfile.skills &&
      newProfile.skills.length > 0 &&
      newProfile.goalName &&
      newProfile.goalAmount;

    // Reset chat state based on profile completeness
    if (isProfileComplete) {
      // Complete profile -> conversation mode
      setChatMode('conversation');
      setStep('complete');
      setIsComplete(true);
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: getWelcomeBackMessage(newProfile.name),
        },
      ]);
    } else {
      // Incomplete or empty profile -> start full onboarding
      setChatMode('onboarding');
      setStep('greeting'); // Start at greeting to collect name first
      setIsComplete(false);
      setMessages([
        {
          id: 'greeting',
          role: 'assistant',
          content: GREETING_MESSAGE,
        },
      ]);
    }

    // New Opik thread for this profile session
    setThreadId(generateThreadId());
  };

  // Effect to watch for context profile changes (e.g., user switches profile in header)
  createEffect(() => {
    const newProfile = contextProfile();
    const currentId = profileId();
    const currentMode = chatMode();

    // Only switch profiles if:
    // 1. Context profile exists and has a different ID than current
    // 2. AND we're not in the middle of onboarding (user explicitly switched in header)
    // This prevents race conditions where context loads after onMount starts fresh onboarding
    if (newProfile && newProfile.id && newProfile.id !== currentId) {
      // If we're in onboarding mode with no profile ID yet, don't switch
      // (user just started fresh, context might have stale data)
      if (currentMode === 'onboarding' && !currentId) {
        return;
      }
      handleProfileSwitch(newProfile);
    }
  });

  // Helper to check if a profile has enough data to skip onboarding
  const isProfileComplete = (p: {
    name?: string;
    diploma?: string;
    city?: string;
    skills?: string[];
    goalName?: string;
    goalAmount?: number;
  }) => {
    return (
      p.name && p.diploma && p.city && p.skills && p.skills.length > 0 && p.goalName && p.goalAmount
    );
  };

  // Check for existing profile on mount
  // Priority: 1. API (DuckDB), 2. localStorage fallback
  onMount(async () => {
    try {
      // First, try to load from API (DuckDB)
      const apiProfile = await profileService.loadActiveProfile();

      if (apiProfile) {
        // Profile exists in DB - check if complete
        setProfileId(apiProfile.id);
        setProfile({
          name: apiProfile.name,
          diploma: apiProfile.diploma,
          city: apiProfile.city,
          citySize: apiProfile.citySize,
          skills: apiProfile.skills,
          incomes: apiProfile.incomeSources,
          expenses: apiProfile.expenses,
          maxWorkHours: apiProfile.maxWorkHoursWeekly,
          minHourlyRate: apiProfile.minHourlyRate,
          hasLoan: apiProfile.hasLoan,
          loanAmount: apiProfile.loanAmount,
          goalName: apiProfile.goalName,
          goalAmount: apiProfile.goalAmount,
          goalDeadline: apiProfile.goalDeadline,
        });

        if (isProfileComplete(apiProfile)) {
          // Complete profile -> conversation mode
          setChatMode('conversation');
          setStep('complete');
          setMessages([
            {
              id: 'welcome-back',
              role: 'assistant',
              content: getWelcomeBackMessage(apiProfile.name!),
            },
          ]);
          setIsComplete(true);
        } else {
          // Incomplete profile -> start onboarding
          setChatMode('onboarding');
          setStep('greeting'); // Start at greeting to collect name first
          setIsComplete(false);
          setMessages([
            {
              id: 'greeting',
              role: 'assistant',
              content: GREETING_MESSAGE,
            },
          ]);
        }
        return;
      }
    } catch (error) {
      console.warn('[Onboarding] API check failed, trying localStorage:', error);
    }

    // Fallback: check localStorage
    const stored = localStorage.getItem('studentProfile');
    if (stored) {
      try {
        const existingProfile = JSON.parse(stored);
        setProfile(existingProfile);

        if (isProfileComplete(existingProfile)) {
          // Complete profile -> conversation mode
          setChatMode('conversation');
          setStep('complete');
          setMessages([
            {
              id: 'welcome-back',
              role: 'assistant',
              content: getWelcomeBackMessage(existingProfile.name || 'there'),
            },
          ]);
          setIsComplete(true);
        } else {
          // Incomplete profile -> start onboarding
          setChatMode('onboarding');
          setStep('greeting'); // Start at greeting to collect name first
          setIsComplete(false);
          setMessages([
            {
              id: 'greeting',
              role: 'assistant',
              content: GREETING_MESSAGE,
            },
          ]);
        }

        // Try to sync localStorage to DB in background
        profileService.syncLocalToDb().catch((err) => {
          console.warn('[Onboarding] Background sync failed:', err);
        });
        return;
      } catch {
        console.warn('[Onboarding] localStorage parse failed');
      }
    }

    // No profile found - start fresh onboarding
    setChatMode('onboarding'); // Explicitly set mode (fixes race with contextProfile effect)
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        content: GREETING_MESSAGE,
      },
    ]);
    setStep('greeting'); // Start at 'greeting' step - we'll collect name first
  });

  // Call LLM API for chat
  const callChatAPI = async (
    message: string,
    currentStep: OnboardingStep,
    context: Record<string, unknown>,
    mode: ChatMode,
    recentHistory?: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<{
    response: string;
    extractedData: Record<string, unknown>;
    nextStep: OnboardingStep;
    intent?: DetectedIntent;
    traceId?: string;
    source?: 'mastra' | 'groq' | 'fallback';
  }> => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          step: currentStep,
          mode, // NEW: Include chat mode for intent detection
          context,
          threadId: threadId(), // For Opik conversation grouping
          profileId: profileId(), // For trace metadata
          conversationHistory: recentHistory, // For context awareness in LLM
        }),
      });

      if (!response.ok) {
        throw new Error('Chat API error');
      }

      return response.json();
    } catch (error) {
      console.error('Chat API error:', error);
      // Return fallback response
      return getFallbackResponse(message, currentStep, context, mode);
    }
  };

  // Fallback response when API fails
  const getFallbackResponse = (
    message: string,
    currentStep: OnboardingStep,
    _context: Record<string, unknown>,
    mode: ChatMode
  ): {
    response: string;
    extractedData: Record<string, unknown>;
    nextStep: OnboardingStep;
    intent?: DetectedIntent;
    traceId?: string;
    source?: 'mastra' | 'groq' | 'fallback';
  } => {
    // Handle conversation mode
    if (mode === 'conversation' || mode === 'profile-edit') {
      const lowerMessage = message.toLowerCase();

      // Simple intent detection for fallback
      if (lowerMessage.match(/change|update|edit|modify/)) {
        return {
          response: PROFILE_EDIT_MESSAGE,
          extractedData: {},
          nextStep: 'complete',
          intent: { mode: 'profile-edit', action: 'update' },
          source: 'fallback' as const,
        };
      }

      if (lowerMessage.match(/new goal|save for|want to buy|save \$|save €/)) {
        return {
          response: `Great! What would you like to save for? Tell me the goal name, target amount, and when you need it by.`,
          extractedData: {},
          nextStep: 'complete',
          intent: { mode: 'conversation', action: 'new_goal' },
          source: 'fallback' as const,
        };
      }

      if (lowerMessage.match(/progress|how.*doing|status/)) {
        return {
          response: `You're making good progress! Head to **My Plan** to see your detailed status and timeline.`,
          extractedData: {},
          nextStep: 'complete',
          intent: { mode: 'conversation', action: 'check_progress' },
          source: 'fallback' as const,
        };
      }

      // Default conversation response
      return {
        response: `I can help with that! For detailed changes, go to **My Plan** or tell me specifically what you'd like to update.`,
        extractedData: {},
        nextStep: 'complete',
        intent: { mode: 'conversation' },
        source: 'fallback' as const,
      };
    }

    // Onboarding mode flow
    const flow: OnboardingStep[] = [
      'greeting',
      'name',
      'studies',
      'skills',
      'certifications',
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
    const nextStep = flow[Math.min(currentIndex + 1, flow.length - 1)] as OnboardingStep;

    // Basic extraction
    const extractedData: Record<string, unknown> = {};
    if (currentStep === 'name') {
      extractedData.name = message.trim().split(/\s+/)[0];
    }

    const fallbackResponses: Record<OnboardingStep, string> = {
      greeting: GREETING_MESSAGE,
      name: `Great ${extractedData.name || message.trim()}! Nice to meet you.\n\nWhat are you studying? (e.g., "Bachelor 2nd year Computer Science", "Master 1 Business")`,
      studies: `Cool!\n\nWhat are your skills? (coding, languages, design, sports...)`,
      skills: `Nice skills!\n\nDo you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')`,
      certifications: `Got it!\n\nWhere do you live? What city?`,
      location: `Got it.\n\nLet's talk budget: how much do you earn and spend per month roughly?`,
      budget: `OK for the budget!\n\nHow many hours max per week can you work? And what's your minimum hourly rate?`,
      work_preferences: `Great work preferences!\n\nNow, what's your savings goal? What do you want to save for, how much, and by when?`,
      goal: `Great goal!\n\nAny important academic events coming up? (exams, vacations, busy periods)`,
      academic_events: `Thanks for sharing!\n\nDo you have any items you could sell? (textbooks, electronics, etc.)`,
      inventory: `Good to know!\n\nWhat subscriptions do you have? (streaming, gym, phone plan...)`,
      lifestyle: `Perfect! I have everything I need.\n\nClick on "My Plan" to get started!`,
      complete: '',
    };

    return {
      response: fallbackResponses[nextStep] || "Let's continue!",
      extractedData,
      nextStep,
      source: 'fallback' as const,
    };
  };

  // Reset state for NEW profile (completely fresh)
  const resetForNewProfile = () => {
    // IMPORTANT: Clear localStorage FIRST to prevent stale data from being loaded
    // This fixes the "profile bleeding" bug where old data appeared in new sessions
    localStorage.removeItem('studentProfile');

    // Reset profile to defaults
    setProfile({
      skills: [],
      certifications: [],
      incomes: [],
      expenses: [],
      maxWorkHours: 15,
      minHourlyRate: 12,
      hasLoan: false,
      loanAmount: 0,
      academicEvents: [],
      inventoryItems: [],
      subscriptions: [],
    });
    // Clear profile ID - will create NEW profile on completion
    setProfileId(undefined);
    // Switch to onboarding mode
    setChatMode('onboarding');
    setStep('greeting'); // Start at greeting to collect name first
    setIsComplete(false);
    // Generate new thread for Opik
    setThreadId(generateThreadId());
  };

  // Reset state for UPDATE profile (keep same profile ID)
  const resetForUpdateProfile = () => {
    // Clear localStorage to prevent stale data during re-onboarding
    localStorage.removeItem('studentProfile');

    // Reset profile state to defaults (like new profile)
    // This ensures old data is completely replaced, not merged
    setProfile({
      skills: [],
      certifications: [],
      incomes: [],
      expenses: [],
      maxWorkHours: 15,
      minHourlyRate: 12,
      hasLoan: false,
      loanAmount: 0,
      academicEvents: [],
      inventoryItems: [],
      subscriptions: [],
    });

    // KEEP profile ID - will UPDATE existing profile on completion
    // (don't call setProfileId(undefined))

    // Switch to onboarding mode
    setChatMode('onboarding');
    setStep('greeting'); // Start from greeting to ask name first
    setIsComplete(false);
    // Generate new thread for Opik (new conversation)
    setThreadId(generateThreadId());
  };

  // Update profile from extracted data
  // currentStep is used for smart merging of arrays
  const updateProfileFromExtracted = (
    data: Record<string, unknown>,
    currentStep: OnboardingStep
  ) => {
    // Handle restart with NEW profile signal
    if (data._restartNewProfile) {
      resetForNewProfile();
      return; // Don't process other fields on restart
    }

    // Handle restart with UPDATE profile signal
    if (data._restartUpdateProfile) {
      resetForUpdateProfile();
      return; // Don't process other fields on restart
    }

    // Handle continue onboarding signal - resume from incomplete step
    if (data._continueOnboarding && data._resumeAtStep) {
      setChatMode('onboarding');
      setStep(data._resumeAtStep as OnboardingStep);
      setIsComplete(false);
      return; // Don't process other fields
    }

    const currentProfile = profile();
    const updates: Partial<ProfileData> = {};

    if (data.name) updates.name = String(data.name);
    if (data.diploma) updates.diploma = String(data.diploma);
    if (data.field) updates.field = String(data.field);
    if (data.city) updates.city = String(data.city);
    if (data.maxWorkHours) updates.maxWorkHours = Number(data.maxWorkHours);
    if (data.minHourlyRate) updates.minHourlyRate = Number(data.minHourlyRate);

    // Smart merge for skills - collected at 'studies' step
    if (data.skills !== undefined && Array.isArray(data.skills)) {
      const merged = smartMergeArrays(
        currentProfile.skills,
        data.skills as string[],
        currentStep,
        'studies'
      );
      if (merged !== undefined) updates.skills = merged;
    }

    // Smart merge for certifications - collected at 'skills' step
    if (data.certifications !== undefined && Array.isArray(data.certifications)) {
      const merged = smartMergeArrays(
        currentProfile.certifications,
        data.certifications as string[],
        currentStep,
        'skills'
      );
      if (merged !== undefined) updates.certifications = merged;
    }

    // Handle income/expenses
    if (data.income) {
      const income = Number(data.income);
      updates.incomes = [{ source: 'total', amount: income }];
    }
    if (data.expenses) {
      const expenses = Number(data.expenses);
      updates.expenses = [
        { category: 'rent', amount: Math.round(expenses * 0.5) },
        { category: 'food', amount: Math.round(expenses * 0.25) },
        { category: 'transport', amount: Math.round(expenses * 0.1) },
        { category: 'other', amount: Math.round(expenses * 0.15) },
      ];
    }

    // NEW: Handle goal data (from onboarding)
    if (data.goalName) updates.goalName = String(data.goalName);
    if (data.goalAmount) updates.goalAmount = Number(data.goalAmount);
    if (data.goalDeadline) updates.goalDeadline = String(data.goalDeadline);

    // NEW: Handle newGoal object from conversation mode ONLY
    // During onboarding, goals are created at completion (lines 970-987)
    // This block handles goals added via conversation after onboarding
    if (data.newGoal && typeof data.newGoal === 'object') {
      const currentMode = chatMode();

      // Only create goals in conversation mode, NOT during onboarding
      // This prevents duplicate goals (onboarding creates goals at completion)
      if (currentMode === 'conversation') {
        const newGoal = data.newGoal as {
          name?: string;
          amount?: number;
          deadline?: string;
          status?: string;
          priority?: number;
        };
        const currentProfileId = profileId();

        // IMPORTANT: Only create goal if we have a valid profile ID
        // This prevents orphaned goals that aren't linked to any profile
        if (!currentProfileId) {
          console.error(
            '[OnboardingChat] Cannot create goal: No profile ID available. Complete onboarding first.'
          );
          return;
        }

        // Create goal via goalService
        goalService
          .createGoal({
            profileId: currentProfileId,
            name: newGoal.name || 'New Goal',
            amount: newGoal.amount || 100,
            deadline: newGoal.deadline,
            status: (newGoal.status as 'active' | 'waiting' | 'completed' | 'paused') || 'active',
            priority: newGoal.priority || 1,
          })
          .then((_createdGoal) => {
            // Goal created successfully
          })
          .catch((err) => {
            console.error('[OnboardingChat] Failed to create goal:', err);
          });
      }
    }

    // Smart merge for academic events - collected at 'goal' step
    if (data.academicEvents !== undefined && Array.isArray(data.academicEvents)) {
      const merged = smartMergeArrays(
        currentProfile.academicEvents,
        data.academicEvents as AcademicEvent[],
        currentStep,
        'goal'
      );
      if (merged !== undefined) updates.academicEvents = merged;
    }

    // Smart merge for inventory items - collected at 'academic_events' step
    if (data.inventoryItems !== undefined && Array.isArray(data.inventoryItems)) {
      const merged = smartMergeArrays(
        currentProfile.inventoryItems,
        data.inventoryItems as InventoryItem[],
        currentStep,
        'academic_events'
      );
      if (merged !== undefined) updates.inventoryItems = merged;
    }

    // Smart merge for subscriptions - collected at 'inventory' step
    if (data.subscriptions !== undefined && Array.isArray(data.subscriptions)) {
      const merged = smartMergeArrays(
        currentProfile.subscriptions,
        data.subscriptions as Subscription[],
        currentStep,
        'inventory'
      );
      if (merged !== undefined) updates.subscriptions = merged;
    }

    // Determine city size
    if (data.city) {
      const cityLower = String(data.city).toLowerCase();
      const bigCities = [
        'paris',
        'lyon',
        'marseille',
        'toulouse',
        'bordeaux',
        'lille',
        'nantes',
        'nice',
        'new york',
        'los angeles',
        'chicago',
        'boston',
        'san francisco',
        'seattle',
        'london',
      ];
      const smallCities = ['village', 'campagne', 'rural', 'town'];
      if (bigCities.some((c) => cityLower.includes(c))) {
        updates.citySize = 'large';
      } else if (smallCities.some((c) => cityLower.includes(c))) {
        updates.citySize = 'small';
      } else {
        updates.citySize = 'medium';
      }
    }

    setProfile({ ...currentProfile, ...updates });
  };

  const handleSend = async (text: string) => {
    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages([...messages(), userMsg]);
    setLoading(true);

    try {
      // Build context from current profile
      const currentProfile = profile();
      const context: Record<string, unknown> = {
        name: currentProfile.name,
        diploma: currentProfile.diploma,
        field: currentProfile.field,
        city: currentProfile.city,
        skills: currentProfile.skills,
        income: currentProfile.incomes?.[0]?.amount,
        expenses: currentProfile.expenses?.reduce((sum, e) => sum + e.amount, 0),
        maxWorkHours: currentProfile.maxWorkHours,
        minHourlyRate: currentProfile.minHourlyRate,
        // Goal data for conversation mode
        goalName: currentProfile.goalName,
        goalAmount: currentProfile.goalAmount,
        goalDeadline: currentProfile.goalDeadline,
      };

      // Collect recent conversation history (last 4 turns = 8 messages) for context
      const recentHistory = messages()
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      // Call LLM API with current mode and conversation history
      const currentStep = step();
      const currentMode = chatMode();
      const result = await callChatAPI(text, currentStep, context, currentMode, recentHistory);

      // Handle mode changes based on detected intent
      if (result.intent?.mode && result.intent.mode !== currentMode) {
        setChatMode(result.intent.mode);
      }

      // Update profile with extracted data
      if (result.extractedData && Object.keys(result.extractedData).length > 0) {
        updateProfileFromExtracted(result.extractedData, currentStep);

        // In conversation mode, save profile updates immediately to DuckDB
        if (currentMode === 'conversation' || currentMode === 'profile-edit') {
          const currentProfileId = profileId();
          const updatedProfile = profile();
          if (currentProfileId && updatedProfile.name) {
            profileService
              .saveProfile(
                {
                  id: currentProfileId,
                  name: updatedProfile.name,
                  diploma: updatedProfile.diploma,
                  field: updatedProfile.field,
                  city: updatedProfile.city,
                  citySize: updatedProfile.citySize,
                  skills: updatedProfile.skills,
                  incomeSources: updatedProfile.incomes,
                  expenses: updatedProfile.expenses,
                  maxWorkHoursWeekly: updatedProfile.maxWorkHours,
                  minHourlyRate: updatedProfile.minHourlyRate,
                  hasLoan: updatedProfile.hasLoan,
                  loanAmount: updatedProfile.loanAmount,
                  goalName: updatedProfile.goalName,
                  goalAmount: updatedProfile.goalAmount,
                  goalDeadline: updatedProfile.goalDeadline,
                },
                { immediate: true }
              )
              .then(() => {
                // Refresh shared profile context so header updates
                refreshProfile();
              })
              .catch((err) => {
                console.error('[OnboardingChat] Failed to save profile update:', err);
              });
          }
        }
      }

      // Update step
      setStep(result.nextStep);

      // Handle completion
      if (result.nextStep === 'complete') {
        // Save profile to API (DuckDB)
        const finalProfile = profile() as ProfileData;

        // Build planData structure for all tabs
        const planData = {
          setup: {
            goalName: finalProfile.goalName || 'Savings Goal',
            goalAmount: finalProfile.goalAmount || 1000,
            goalDeadline:
              finalProfile.goalDeadline ||
              new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            academicEvents: finalProfile.academicEvents || [],
            commitments: [],
          },
          skills: (finalProfile.skills || []).map((skill, idx) => ({
            id: `skill_${idx}`,
            name: skill,
            hourlyRate: finalProfile.minHourlyRate || 15,
            marketDemand: 3,
            cognitiveEffort: 3,
            restNeeded: 1,
          })),
          inventory: (finalProfile.inventoryItems || []).map((item, idx) => ({
            id: `item_${idx}`,
            name: item.name,
            category: item.category,
            estimatedValue: item.estimatedValue || 50,
            status: 'available',
          })),
          lifestyle: (finalProfile.subscriptions || []).map((sub, idx) => ({
            id: `sub_${idx}`,
            name: sub.name,
            currentCost: sub.currentCost,
            category: 'subscription',
            essential: false,
          })),
          trades: [],
          selectedScenarios: [],
        };

        // Normalize field names for API
        // Include existing profile ID to UPDATE instead of creating new
        const existingProfileId = profileId();
        const normalizedProfile = {
          ...(existingProfileId && { id: existingProfileId }),
          name: finalProfile.name || 'My Profile',
          diploma: finalProfile.diploma,
          field: finalProfile.field, // Bug fix: field of study was missing
          skills: finalProfile.skills,
          certifications: finalProfile.certifications, // Bug fix: certifications were missing
          city: finalProfile.city,
          citySize: finalProfile.citySize,
          incomeSources: finalProfile.incomes,
          expenses: finalProfile.expenses,
          maxWorkHoursWeekly: finalProfile.maxWorkHours,
          minHourlyRate: finalProfile.minHourlyRate,
          hasLoan: finalProfile.hasLoan,
          loanAmount: finalProfile.loanAmount,
          profileType: 'main',
          goalName: finalProfile.goalName,
          goalAmount: finalProfile.goalAmount,
          goalDeadline: finalProfile.goalDeadline,
          planData, // Include planData for all tabs
        };

        // Save to API first
        try {
          const saveResult = await profileService.saveProfile(normalizedProfile, {
            immediate: true,
            setActive: true,
          });
          // Store the profile ID for future updates
          const savedProfileId = saveResult.profileId || existingProfileId;
          if (savedProfileId && !existingProfileId) {
            setProfileId(savedProfileId);
          }

          // Create goal in dedicated goals table if we have goal data
          if (savedProfileId && finalProfile.goalName && finalProfile.goalAmount) {
            try {
              await fetch('/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  profileId: savedProfileId,
                  name: finalProfile.goalName,
                  amount: finalProfile.goalAmount,
                  deadline: finalProfile.goalDeadline || null,
                  priority: 1,
                  status: 'active',
                }),
              });
            } catch (goalError) {
              console.error('[OnboardingChat] Failed to create goal in table:', goalError);
              // Non-fatal: profile still saved with embedded goal data
            }
          }

          // Persist extracted data to dedicated tables for tab population
          // This ensures SkillsTab, LifestyleTab, InventoryTab show the onboarding data
          if (savedProfileId) {
            // Bulk create skills in skills table
            if (finalProfile.skills && finalProfile.skills.length > 0) {
              try {
                await skillService.bulkCreateSkills(
                  savedProfileId,
                  finalProfile.skills.map((name) => ({
                    name,
                    level: 'intermediate' as const,
                    hourlyRate: finalProfile.minHourlyRate || 15,
                  }))
                );
              } catch (skillsError) {
                console.error('[OnboardingChat] Failed to persist skills:', skillsError);
              }
            }

            // Bulk create inventory items in inventory_items table
            if (finalProfile.inventoryItems && finalProfile.inventoryItems.length > 0) {
              try {
                await inventoryService.bulkCreateItems(
                  savedProfileId,
                  finalProfile.inventoryItems.map((item) => ({
                    name: item.name,
                    category:
                      (item.category as
                        | 'electronics'
                        | 'clothing'
                        | 'books'
                        | 'furniture'
                        | 'sports'
                        | 'other') || 'other',
                    estimatedValue: item.estimatedValue || 50,
                  }))
                );
              } catch (inventoryError) {
                console.error('[OnboardingChat] Failed to persist inventory:', inventoryError);
              }
            }

            // Bulk create lifestyle items (subscriptions) in lifestyle_items table
            if (finalProfile.subscriptions && finalProfile.subscriptions.length > 0) {
              try {
                await lifestyleService.bulkCreateItems(
                  savedProfileId,
                  finalProfile.subscriptions.map((sub) => ({
                    name: sub.name,
                    category: 'subscriptions' as const,
                    currentCost: sub.currentCost,
                  }))
                );
              } catch (lifestyleError) {
                console.error('[OnboardingChat] Failed to persist lifestyle:', lifestyleError);
              }
            }
          }

          // Refresh shared profile context so header updates with new name
          await refreshProfile();
        } catch (error) {
          console.error('Failed to save profile to API:', error);
        }

        // Keep localStorage as fallback
        localStorage.setItem('studentProfile', JSON.stringify(finalProfile));
        setIsComplete(true);
      }

      // Add assistant message with source indicator
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        source: result.source,
      };
      setMessages([...messages(), assistantMsg]);

      // Source available on badge in UI (no console logging needed)
    } catch (error) {
      console.error('Chat error:', error);
      // Add error message
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Oops, I had a small issue. Can you try again?',
      };
      setMessages([...messages(), errorMsg]);
    } finally {
      setLoading(false);
      // Auto-focus input for seamless conversation flow
      setTimeout(() => chatInputRef?.focus(), 50);
    }
  };

  const goToPlan = () => {
    navigate('/plan');
  };

  return (
    <div class="flex flex-col h-[calc(100vh-180px)] max-w-3xl mx-auto">
      {/* Chat messages */}
      <div
        ref={(el) => (messagesContainerRef = el)}
        class="flex-1 overflow-y-auto px-4 py-6 space-y-1"
      >
        <For each={messages()}>
          {(msg) => (
            <ChatMessage
              role={msg.role}
              content={msg.content}
              avatar="B"
              name={msg.role === 'assistant' ? 'Bruno' : undefined}
              badge={msg.source}
            />
          )}
        </For>

        <Show when={loading()}>
          <div class="flex justify-start mb-4">
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-lg shadow-sm">
                B
              </div>
              <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 shadow-sm">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                  <div
                    class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                    style={{ 'animation-delay': '0.1s' }}
                  />
                  <div
                    class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                    style={{ 'animation-delay': '0.2s' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* Action buttons when complete */}
      <Show when={isComplete()}>
        <div class="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
          <div class="flex items-center justify-center gap-3 max-w-3xl mx-auto">
            <button class="btn-primary px-6 py-2" onClick={goToPlan}>
              Start My Plan
            </button>
            <button
              class="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              onClick={() => {
                // Clear profile completely for fresh start
                setProfile({
                  skills: [],
                  certifications: [],
                  incomes: [],
                  expenses: [],
                  maxWorkHours: 15,
                  minHourlyRate: 12,
                  hasLoan: false,
                  loanAmount: 0,
                  academicEvents: [],
                  inventoryItems: [],
                  subscriptions: [],
                });
                // Clear localStorage
                localStorage.removeItem('studentProfile');
                // Generate new threadId for new conversation
                setThreadId(generateThreadId());
                setProfileId(undefined);
                setIsComplete(false);
                setStep('greeting');
                setMessages([{ id: 'restart', role: 'assistant', content: GREETING_MESSAGE }]);
              }}
            >
              Restart onboarding
            </button>
          </div>
        </div>
      </Show>

      {/* Chat input - always visible */}
      <ChatInput
        ref={(el) => (chatInputRef = el)}
        onSend={handleSend}
        placeholder={isComplete() ? 'Ask Bruno anything...' : 'Type your response...'}
        disabled={loading()}
      />
    </div>
  );
}
