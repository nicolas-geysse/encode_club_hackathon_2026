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
import { profileService } from '~/lib/profileService';
import { goalService } from '~/lib/goalService';

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
  | 'location'
  | 'budget'
  | 'work_preferences'
  | 'goal'
  | 'academic_events'
  | 'inventory'
  | 'lifestyle'
  | 'complete';

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
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [step, setStep] = createSignal<OnboardingStep>('greeting');
  const [chatMode, setChatMode] = createSignal<ChatMode>('onboarding');
  const [profile, setProfile] = createSignal<Partial<ProfileData>>({
    skills: [],
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

  // Check for existing profile on mount
  // Priority: 1. API (DuckDB), 2. localStorage fallback
  onMount(async () => {
    try {
      // First, try to load from API (DuckDB)
      const apiProfile = await profileService.loadActiveProfile();

      if (apiProfile && apiProfile.name) {
        // Profile exists in DB - switch to conversation mode
        setProfileId(apiProfile.id);
        setChatMode('conversation');
        setStep('complete');
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
        setMessages([
          {
            id: 'welcome-back',
            role: 'assistant',
            content: getWelcomeBackMessage(apiProfile.name),
          },
        ]);
        setIsComplete(true);
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
        setChatMode('conversation');
        setStep('complete');
        // If profile exists, show welcome back message with conversation options
        setMessages([
          {
            id: 'welcome-back',
            role: 'assistant',
            content: getWelcomeBackMessage(existingProfile.name || 'there'),
          },
        ]);
        setIsComplete(true);

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
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        content: GREETING_MESSAGE,
      },
    ]);
    setStep('name');
  });

  // Call LLM API for chat
  const callChatAPI = async (
    message: string,
    currentStep: OnboardingStep,
    context: Record<string, unknown>,
    mode: ChatMode
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
      name: `Great ${extractedData.name || message.trim()}! Nice to meet you.\n\nWhat are you studying? (Ex: "CS Junior", "Law Senior")`,
      studies: `Cool!\n\nWhat are your skills? (coding, languages, design, sports...)`,
      skills: `Nice!\n\nWhere do you live? What city?`,
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
    // Reset profile to defaults
    setProfile({
      skills: [],
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
    setStep('name');
    setIsComplete(false);
    // Generate new thread for Opik
    setThreadId(generateThreadId());
  };

  // Reset state for UPDATE profile (keep same profile ID)
  const resetForUpdateProfile = () => {
    // Keep current profile data (can be overwritten during re-onboarding)
    // KEEP profile ID - will UPDATE existing profile on completion
    // Switch to onboarding mode
    setChatMode('onboarding');
    setStep('name');
    setIsComplete(false);
    // Generate new thread for Opik (new conversation)
    setThreadId(generateThreadId());
  };

  // Update profile from extracted data
  const updateProfileFromExtracted = (data: Record<string, unknown>) => {
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

    const currentProfile = profile();
    const updates: Partial<ProfileData> = {};

    if (data.name) updates.name = String(data.name);
    if (data.diploma) updates.diploma = String(data.diploma);
    if (data.field) updates.field = String(data.field);
    if (data.city) updates.city = String(data.city);
    if (data.skills && Array.isArray(data.skills)) updates.skills = data.skills as string[];
    if (data.maxWorkHours) updates.maxWorkHours = Number(data.maxWorkHours);
    if (data.minHourlyRate) updates.minHourlyRate = Number(data.minHourlyRate);

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

    // NEW: Handle newGoal object from conversation mode
    if (data.newGoal && typeof data.newGoal === 'object') {
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

    // NEW: Handle academic events
    if (data.academicEvents && Array.isArray(data.academicEvents)) {
      updates.academicEvents = data.academicEvents as AcademicEvent[];
    }

    // NEW: Handle inventory items
    if (data.inventoryItems && Array.isArray(data.inventoryItems)) {
      updates.inventoryItems = data.inventoryItems as InventoryItem[];
    }

    // NEW: Handle subscriptions
    if (data.subscriptions && Array.isArray(data.subscriptions)) {
      updates.subscriptions = data.subscriptions as Subscription[];
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

      // Call LLM API with current mode
      const currentStep = step();
      const currentMode = chatMode();
      const result = await callChatAPI(text, currentStep, context, currentMode);

      // Handle mode changes based on detected intent
      if (result.intent?.mode && result.intent.mode !== currentMode) {
        setChatMode(result.intent.mode);
      }

      // Update profile with extracted data
      if (result.extractedData && Object.keys(result.extractedData).length > 0) {
        updateProfileFromExtracted(result.extractedData);

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
          skills: finalProfile.skills,
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
          const result = await profileService.saveProfile(normalizedProfile, {
            immediate: true,
            setActive: true,
          });
          // Store the profile ID for future updates
          if (result.profileId && !existingProfileId) {
            setProfileId(result.profileId);
          }
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
