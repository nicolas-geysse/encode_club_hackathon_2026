/**
 * Onboarding Chat Component
 *
 * Conversational onboarding with Bruno avatar.
 * Uses LLM API for intelligent responses and data extraction.
 */

import { createSignal, createEffect, For, Show, onMount, onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { MCPUIRenderer, type ActionCallback } from './MCPUIRenderer';
import type { ChatMessage as Message, UIResource } from '~/types/chat';
import { Repeat, Wallet, Target, Zap, PiggyBank } from 'lucide-solid';
import type { Component } from 'solid-js';
import { profileService, type FullProfile } from '~/lib/profileService';
import { lifestyleService } from '~/lib/lifestyleService';
import { createLogger } from '~/lib/logger';

const logger = createLogger('OnboardingChat');
import { goalService } from '~/lib/goalService';
import { useProfile } from '~/lib/profileContext';
import { persistAllOnboardingData, verifyProfileInDb } from '~/lib/onboardingPersistence';
import { toast } from '~/lib/notificationStore';
import { toastPopup } from '~/components/ui/Toast';
import { GlassButton } from '~/components/ui/GlassButton';
import { detectCityMetadata } from '~/lib/cityUtils';
import { smartMergeArrays } from '~/lib/arrayMergeUtils';
import { forwardGeocode } from '~/lib/geolocation';
import { eventBus } from '~/lib/eventBus';
import { OnboardingProgress } from './OnboardingProgress';
import { ScrollArea } from '~/components/ui/ScrollArea';
import OnboardingFormStep from './OnboardingFormStep';
import { hasStepForm } from '~/lib/chat/stepForms';
import { useSimulation } from '~/lib/simulationContext';
import { isDeadlinePassed } from '~/lib/timeAwareDate';
import { onboardingIsComplete, persistOnboardingComplete } from '~/lib/onboardingStateStore';

// Message type imported from ~/types/chat

// Quick links shown after onboarding completion - trigger charts in chat
const QUICK_LINKS = [
  { label: 'Budget', chartType: 'budget_breakdown', icon: 'wallet' },
  { label: 'Goals', chartType: 'projection', icon: 'target' },
  { label: 'Energy', chartType: 'energy', icon: 'zap' },
  { label: 'Savings', chartType: 'progress', icon: 'piggy-bank' },
] as const;

const quickLinkIcons: Record<string, Component<{ class?: string }>> = {
  wallet: Wallet,
  target: Target,
  zap: Zap,
  'piggy-bank': PiggyBank,
};

// Must match the retroplan API types
type AcademicEventType =
  | 'exam_period'
  | 'class_intensive'
  | 'vacation'
  | 'vacation_rest'
  | 'vacation_available'
  | 'internship'
  | 'project_deadline';

interface AcademicEvent {
  name: string;
  type: AcademicEventType;
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

interface TradeOpportunity {
  type: 'borrow' | 'lend' | 'trade' | 'sell' | 'cut';
  description: string;
  withPerson?: string;
  forWhat?: string;
  estimatedValue?: number;
}

// BUG J FIX: Add swipePreferences type
interface SwipePreferences {
  effort_sensitivity: number;
  hourly_rate_priority: number;
  time_flexibility: number;
  income_stability: number;
}

interface ProfileData {
  name: string;
  diploma: string;
  field: string;
  yearsRemaining: number;
  currency?: 'USD' | 'EUR' | 'GBP'; // User's preferred currency based on region
  skills: string[];
  certifications?: string[]; // Professional certifications (BAFA, PSC1, TEFL, etc.)
  city: string;
  citySize: string;
  latitude?: number; // Location coordinates from geolocation/map picker
  longitude?: number;
  address?: string; // Full address from reverse geocoding
  incomes: { source: string; amount: number }[];
  expenses: { category: string; amount: number }[];
  maxWorkHours: number;
  minHourlyRate: number;
  incomeDay?: number; // Day of month when income arrives (1-31)
  hasLoan: boolean;
  loanAmount: number;
  // New fields for extended onboarding
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  academicEvents?: AcademicEvent[];
  inventoryItems?: InventoryItem[];
  subscriptions?: Subscription[];
  tradeOpportunities?: TradeOpportunity[];
  swipePreferences?: SwipePreferences; // BUG J FIX: Add swipe preferences to profile
  // Sprint Graphiques: Include followupData for energy history
  followupData?: Record<string, unknown>;
}

type OnboardingStep =
  | 'greeting' // Now asks for city first (enables background fetching early)
  | 'currency_confirm' // Only shown if currency not auto-detected from city
  | 'name'
  | 'studies'
  | 'skills'
  | 'certifications'
  | 'budget'
  | 'income_timing' // When income arrives (day of month)
  | 'work_preferences'
  | 'goal'
  | 'academic_events'
  | 'inventory'
  | 'trade' // Trade opportunities
  | 'lifestyle'
  | 'complete';

// smartMergeArrays is now imported from ~/lib/arrayMergeUtils

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

// Initial greeting message - asks for city first to enable early background data fetching
const GREETING_MESSAGE = `Hey! I'm **Bruno**, your personal financial coach.

This app will help you reach any savings goal - whether it's a vacation, a new laptop, or anything else you're dreaming of!

**How it works:**
- Set an objective, an amount, and a deadline
- I'll help you find ways to achieve it (skills, selling items, cutting expenses)

First, **what city do you live in?** (e.g., Paris, London, New York)`;

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
  const {
    profile: contextProfile,
    refreshProfile,
    refreshSkills,
    refreshInventory,
    refreshLifestyle,
    refreshIncome,
    refreshTrades,
    refreshGoals,
  } = useProfile();

  // Simulation context for time-aware responses
  const { currentDate, simulationState } = useSimulation();

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
    tradeOpportunities: [],
    // BUG J FIX: Initialize swipePreferences with neutral defaults (0.5 = balanced)
    swipePreferences: {
      effort_sensitivity: 0.5,
      hourly_rate_priority: 0.5,
      time_flexibility: 0.5,
      income_stability: 0.5,
    },
  });
  // Use shared store - isComplete reads from store, setIsComplete updates store + persists
  const isComplete = onboardingIsComplete;
  const setIsComplete = (value: boolean) => {
    persistOnboardingComplete(value); // This updates store AND localStorage
  };
  const [threadId, setThreadId] = createSignal<string>(generateThreadId());
  const [profileId, setProfileId] = createSignal<string | undefined>(undefined);

  // Ref for auto-focusing input after response
  let chatInputRef: { focus: () => void } | null = null;

  // Ref for auto-scrolling chat to bottom
  let messagesContainerRef: HTMLDivElement | null = null;

  // BUG 9 FIX (UPGRADED): Persist chat history to DuckDB with localStorage fallback
  const CHAT_STORAGE_KEY_PREFIX = 'stride_chat_history_';
  const ONBOARDING_TEMP_KEY = 'stride_chat_onboarding_temp';

  // Load chat history from DuckDB when profileId becomes available
  createEffect(() => {
    const pid = profileId();
    const tid = threadId();
    if (pid && messages().length === 0) {
      // Try DuckDB first
      fetch(`/api/chat-history?profileId=${pid}&threadId=${tid}&limit=50`)
        .then((res) => (res.ok ? res.json() : Promise.reject('API failed')))
        .then((dbMessages: Message[]) => {
          if (Array.isArray(dbMessages) && dbMessages.length > 0) {
            setMessages(dbMessages);
            // Check if onboarding is complete based on stored state
            if (dbMessages.some((m: Message) => m.role === 'assistant')) {
              const lastAssistantMsg = dbMessages
                .filter((m: Message) => m.role === 'assistant')
                .pop();
              if (
                lastAssistantMsg?.content?.includes('setup is complete') ||
                lastAssistantMsg?.content?.includes('your dashboard')
              ) {
                setIsComplete(true);
                setChatMode('conversation');
              }
            }
          }
        })
        .catch(() => {
          // Fallback to localStorage if DuckDB fails
          const stored = localStorage.getItem(`${CHAT_STORAGE_KEY_PREFIX}${pid}`);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setMessages(parsed);
                if (parsed.some((m: Message) => m.role === 'assistant')) {
                  const lastAssistantMsg = parsed
                    .filter((m: Message) => m.role === 'assistant')
                    .pop();
                  if (
                    lastAssistantMsg?.content?.includes('setup is complete') ||
                    lastAssistantMsg?.content?.includes('your dashboard')
                  ) {
                    setIsComplete(true);
                    setChatMode('conversation');
                  }
                }
              }
            } catch (e) {
              logger.warn('Failed to parse stored chat history', { error: e });
            }
          }
        });
    }
  });

  // Save new messages to DuckDB (with localStorage backup)
  // During onboarding (no profileId yet), save to temp localStorage key
  const saveMessageToDb = async (msg: Message) => {
    const pid = profileId();
    const tid = threadId();
    const msgs = messages();
    const toStore = msgs.slice(-50);

    if (!pid) {
      // During onboarding: save to temp localStorage only
      // Will be migrated to DuckDB when profile is created
      localStorage.setItem(ONBOARDING_TEMP_KEY, JSON.stringify(toStore));
      logger.info('Chat saved to temp storage (onboarding)', { messageCount: toStore.length });
      return;
    }

    // Profile exists: save to DuckDB
    try {
      await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msg.id,
          profile_id: pid,
          thread_id: tid,
          role: msg.role,
          content: msg.content,
          source: msg.source,
        }),
      });
      logger.info('Chat message saved to DB', { messageId: msg.id, profileId: pid });
    } catch (e) {
      logger.warn('Failed to save message to DB, using localStorage fallback', { error: e });
    }

    // Always update localStorage as backup
    localStorage.setItem(`${CHAT_STORAGE_KEY_PREFIX}${pid}`, JSON.stringify(toStore));
  };

  // Migrate temp onboarding messages to DuckDB when profileId becomes available
  const migrateOnboardingMessages = async (newProfileId: string) => {
    const tempMessages = localStorage.getItem(ONBOARDING_TEMP_KEY);
    if (!tempMessages) return;

    try {
      const msgs = JSON.parse(tempMessages) as Message[];
      const tid = threadId();

      // Save all messages to DuckDB
      for (const msg of msgs) {
        try {
          // Sprint 13.12: Cast to access optional fields that may have been stored
          const msgWithData = msg as Message & {
            extractedData?: Record<string, unknown>;
          };

          // Sprint 13.15 Fix: Regenerate ID for static messages like 'greeting' to prevent PK collisions
          // Also regenerate strictly temp IDs to ensure global uniqueness in DB
          let safeId = msg.id;
          if (
            safeId === 'greeting' ||
            safeId.startsWith('welcome-') ||
            safeId.startsWith('temp_')
          ) {
            safeId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          }

          await fetch('/api/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: safeId,
              profile_id: newProfileId,
              thread_id: tid,
              role: msg.role,
              content: msg.content,
              source: msg.source,
              // Sprint 13.12: Include all message fields for complete migration
              extracted_data: msgWithData.extractedData || null,
              ui_resource: msg.uiResource || null,
            }),
          });
        } catch (e) {
          logger.warn('Failed to migrate message', { messageId: msg.id, error: e });
        }
      }

      // Clear temp storage after successful migration
      localStorage.removeItem(ONBOARDING_TEMP_KEY);
      // Also save to profile-specific localStorage as backup
      localStorage.setItem(`${CHAT_STORAGE_KEY_PREFIX}${newProfileId}`, tempMessages);
      logger.info('Onboarding messages migrated to DB', {
        count: msgs.length,
        profileId: newProfileId,
      });
    } catch (e) {
      logger.error('Failed to migrate onboarding messages', { error: e });
    }
  };

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

  /**
   * Handle MCP-UI actions from interactive components
   * Called when user interacts with forms, buttons, etc.
   */
  const handleUIAction: ActionCallback = (action: string, data: unknown) => {
    logger.info('MCP-UI Action', { action, data });

    switch (action) {
      case 'form-submit': {
        // Handle form submissions from MCP-UI forms
        const formData = data as Record<string, unknown>;
        if (formData.goalName && formData.goalAmount) {
          // 1. Update local state (always do this)
          setProfile((prev) => ({
            ...prev,
            goalName: String(formData.goalName),
            goalAmount: Number(formData.goalAmount),
            goalDeadline: formData.goalDeadline ? String(formData.goalDeadline) : prev.goalDeadline,
          }));

          // 2. During onboarding, DON'T create goal via goalService yet
          // The goal will be created at onboarding completion (persistAllOnboardingData)
          // This prevents the "No profileId available" error
          const currentMode = chatMode();
          if (currentMode === 'onboarding') {
            logger.info('Onboarding mode: Goal stored locally, will be persisted at completion', {
              goalName: formData.goalName,
              goalAmount: formData.goalAmount,
            });
            // Show a subtle confirmation that goal was captured
            toastPopup.info('Goal captured!', 'It will be saved when you complete setup');
            break; // Exit early - goal persists at completion
          }

          // 3. For conversation mode: Create the goal via goalService immediately
          const currentProfileId = profileId() || contextProfile()?.id;

          if (currentProfileId) {
            logger.info('Creating goal via form-submit', {
              profileId: currentProfileId,
              goalName: formData.goalName,
            });

            // Single-goal policy: Archive existing active goals, then create new one
            (async () => {
              try {
                // Archive existing active goals first
                const existingGoalsResponse = await fetch(
                  `/api/goals?profileId=${currentProfileId}&status=active`
                );
                if (existingGoalsResponse.ok) {
                  const existingGoals = await existingGoalsResponse.json();
                  for (const goal of existingGoals) {
                    await fetch('/api/goals', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: goal.id, status: 'paused' }),
                    });
                    logger.info('Archived existing goal', { goalId: goal.id, name: goal.name });
                  }
                }
              } catch (err) {
                logger.warn('Failed to archive existing goals', { error: err });
                // Continue anyway - better to create the new goal
              }

              // Now create the new goal
              try {
                const createdGoal = await goalService.createGoal({
                  profileId: currentProfileId,
                  name: String(formData.goalName),
                  amount: Number(formData.goalAmount),
                  deadline: formData.goalDeadline ? String(formData.goalDeadline) : undefined,
                  priority: 1,
                  status: 'active',
                });
                logger.info('createGoal returned', { createdGoal, hasGoal: !!createdGoal });
                if (createdGoal) {
                  logger.info('Goal created successfully, calling refreshGoals');
                  // Visible toast popup
                  toastPopup.success('Goal Created!', `"${formData.goalName}" added to your goals`);
                  // Also add to notification bell
                  toast.success('Goal Created', `"${formData.goalName}" added to your goals`);
                  // FIX: Force refresh après un petit délai pour laisser la DB commiter
                  setTimeout(() => {
                    logger.info('Calling refreshGoals now');
                    refreshGoals().then(() => {
                      logger.info('refreshGoals completed');
                    });
                  }, 100);
                } else {
                  logger.warn('createGoal returned null/undefined');
                  toastPopup.error('Failed to create goal', 'Please try again');
                }
              } catch (err) {
                logger.error('Failed to create goal', { error: err });
                toastPopup.error('Failed to create goal', 'Please try again');
              }
            })();
          } else {
            // Fallback: essayer de charger le profil actif
            logger.info('No profileId available, loading active profile as fallback');
            profileService.loadActiveProfile().then((p) => {
              if (p?.id) {
                logger.info('Fallback: Creating goal with loaded profile', { profileId: p.id });
                goalService
                  .createGoal({
                    profileId: p.id,
                    name: String(formData.goalName),
                    amount: Number(formData.goalAmount),
                    deadline: formData.goalDeadline ? String(formData.goalDeadline) : undefined,
                    priority: 1,
                    status: 'active',
                  })
                  .then((createdGoal) => {
                    if (createdGoal) {
                      toastPopup.success(
                        'Goal Created!',
                        `"${formData.goalName}" added to your goals`
                      );
                      setTimeout(() => refreshGoals(), 100);
                    } else {
                      toastPopup.error('Failed to create goal', 'Please try again');
                    }
                  });
              } else {
                logger.error('No profile found in fallback');
                toastPopup.error('No active profile', 'Please complete onboarding first');
              }
            });
          }
        }
        break;
      }

      case 'confirm_budget':
        // Budget confirmation action
        toast.info('Budget', 'Budget settings confirmed');
        break;

      case 'navigate': {
        // Navigation action
        const target = data as { to?: string };
        if (target.to) {
          navigate(target.to);
        }
        break;
      }

      case 'confirm': {
        // Handle HITL confirmation (e.g. adding Netflix)
        const confirmData = data as Record<string, unknown>;
        const currentProfileId = profileId();

        if (currentProfileId && confirmData) {
          // 1. Update Profile directly
          (async () => {
            try {
              const fullProfile = await profileService.loadProfile(currentProfileId);
              if (fullProfile) {
                const updatedProfile = { ...fullProfile };

                // Merge subscriptions (Save as Lifestyle Items for Budget Tab)
                if (confirmData.subscriptions && Array.isArray(confirmData.subscriptions)) {
                  const currentSubs = fullProfile.subscriptions || [];
                  const newSubs = confirmData.subscriptions as {
                    name: string;
                    currentCost?: number;
                  }[];

                  const merged = [...currentSubs];

                  // Use Promise.all to create items in parallel
                  await Promise.all(
                    newSubs.map(async (newSub) => {
                      const exists = merged.some(
                        (s) => s.name.toLowerCase() === newSub.name.toLowerCase()
                      );
                      if (!exists) {
                        merged.push({
                          name: newSub.name,
                          currentCost: newSub.currentCost || 10,
                        });

                        // CRITICAL: Create as LifestyleItem so it appears in Budget Tab
                        try {
                          await lifestyleService.createItem({
                            profileId: currentProfileId,
                            name: newSub.name,
                            category: 'subscriptions',
                            currentCost: newSub.currentCost || 10,
                          });
                          logger.info('Created lifestyle item for subscription', {
                            name: newSub.name,
                          });
                        } catch (err) {
                          logger.error('Failed to create lifestyle item', { error: err });
                        }
                      }
                    })
                  );

                  updatedProfile.subscriptions = merged;
                }

                // Merge inventory
                if (confirmData.inventoryItems && Array.isArray(confirmData.inventoryItems)) {
                  const currentInv = fullProfile.inventoryItems || [];
                  const newInv = confirmData.inventoryItems as {
                    name: string;
                    category?: string;
                  }[];
                  const merged = [...currentInv];
                  newInv.forEach((newItem) => {
                    if (!merged.some((i) => i.name.toLowerCase() === newItem.name.toLowerCase())) {
                      merged.push({
                        name: newItem.name,
                        category: newItem.category || 'other',
                        estimatedValue: 0,
                      });
                    }
                  });
                  updatedProfile.inventoryItems = merged;
                }

                await profileService.saveProfile(updatedProfile, { immediate: true });

                // 2. Add visual feedback in chat
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `user-confirm-${Date.now()}`,
                    role: 'user',
                    content: 'Yes, add it.',
                    source: 'fallback',
                  },
                  {
                    id: `assistant-confirm-${Date.now()}`,
                    role: 'assistant',
                    content: `Done! I've added it to your profile. ✅\n\nIs there anything else?`,
                    source: 'fallback',
                  },
                ]);

                if (confirmData.subscriptions) refreshLifestyle();
                if (confirmData.inventoryItems) refreshInventory();
              }
            } catch (err) {
              logger.error('Failed to confirm action', { error: err });
              toastPopup.error('Error', 'Failed to update profile');
            }
          })();
        }
        break;
      }

      case 'cancel': {
        // User rejected the suggestion
        setMessages((prev) => [
          ...prev,
          {
            id: `user-cancel-${Date.now()}`,
            role: 'user',
            content: "No, that's not it.",
            source: 'fallback',
          },
          {
            id: `assistant-cancel-${Date.now()}`,
            role: 'assistant',
            content: `Got it. What would you like to do instead?`,
            source: 'fallback',
          },
        ]);
        break;
      }

      case 'show_chart': {
        // Handle chart gallery button clicks - use direct action to bypass intent detection
        const chartData = data as { chartType?: string };
        const chartType = chartData?.chartType;
        if (chartType) {
          logger.info('Chart button clicked', { chartType });

          // Map chartType directly to chat API action
          const chartActionMap: Record<string, string> = {
            budget_breakdown: 'show_budget_chart',
            progress: 'show_progress_chart',
            projection: 'show_projection_chart',
            energy: 'show_energy_chart',
            comparison: 'show_comparison_chart',
          };

          const action = chartActionMap[chartType] || 'show_chart_gallery';

          // Add user message showing what was requested
          setMessages((prev) => [
            ...prev,
            {
              id: `user-chart-${Date.now()}`,
              role: 'user',
              content: `Show me my ${chartType.replace('_', ' ')} chart`,
              source: 'fallback',
            },
          ]);

          // Call API with explicit action to bypass intent detection
          setLoading(true);
          fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `__action:${action}`, // Special prefix for direct action
              step: step(),
              mode: 'conversation',
              context: profile(),
              threadId: threadId(),
              profileId: profileId(),
            }),
          })
            .then((res) => res.json())
            .then((result) => {
              setMessages((prev) => [
                ...prev,
                {
                  id: `assistant-chart-${Date.now()}`,
                  role: 'assistant',
                  content: result.response || 'Here is your chart:',
                  source: result.source || 'groq',
                  uiResource: result.uiResource,
                  traceId: result.traceId,
                  traceUrl: result.traceUrl,
                },
              ]);
            })
            .catch((err) => {
              logger.error('Chart request failed', { error: err });
              toastPopup.error('Error', 'Failed to load chart');
            })
            .finally(() => {
              setLoading(false);
            });
        }
        break;
      }

      default:
        logger.info('Unhandled UI action', { action });
    }
  };

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
      latitude: newProfile.latitude,
      longitude: newProfile.longitude,
      address: newProfile.address,
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
      // Sprint Graphiques: Include followupData for energy history
      followupData: newProfile.followupData,
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
    const complete = isComplete();

    // Only switch profiles if:
    // 1. Context profile exists and has a different ID than current
    // 2. AND we're not in the middle of onboarding (user explicitly switched in header)
    // 3. AND we haven't just completed onboarding (to avoid resetting after save)
    // This prevents race conditions where context loads after onMount starts fresh onboarding
    if (newProfile && newProfile.id && newProfile.id !== currentId) {
      // If we're in onboarding mode with no profile ID yet, don't switch
      // (user just started fresh, context might have stale data)
      if (currentMode === 'onboarding' && !currentId) {
        return;
      }
      // If we just completed onboarding and saved, the context refresh should not reset chat
      // The profile IDs will match after setProfileId is called, but there's a brief window
      // where the effect fires before the local state updates
      if (complete && currentMode === 'conversation') {
        // Already in conversation mode with complete profile - just update the ID silently
        setProfileId(newProfile.id);
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

  // Helper to determine which step to resume from based on existing profile data
  // Returns the first step that is missing data
  const determineResumeStep = (p: {
    city?: string;
    currency?: string;
    name?: string;
    diploma?: string;
    skills?: string[];
    certifications?: string[];
    incomeSources?: { source: string; amount: number }[];
    expenses?: { category: string; amount: number }[];
    maxWorkHoursWeekly?: number;
    minHourlyRate?: number;
    goalName?: string;
    goalAmount?: number;
  }): OnboardingStep => {
    // Check each step in order and return the first incomplete one
    if (!p.city) return 'greeting'; // greeting asks for city
    // currency_confirm is handled automatically by detectCityMetadata, skip it
    if (!p.name) return 'name';
    if (!p.diploma) return 'studies';
    if (!p.skills || p.skills.length === 0) return 'skills';
    // certifications are optional, skip check
    if (!p.incomeSources || p.incomeSources.length === 0) return 'budget';
    // work_preferences have defaults, check if they're non-default
    if (!p.goalName || !p.goalAmount) return 'goal';
    // academic_events, inventory, trade, lifestyle are optional
    // If we have goal data, go to academic_events to continue
    return 'academic_events';
  };

  // Helper to get the appropriate welcome back message for resuming onboarding
  const getResumeMessage = (resumeStep: OnboardingStep, name?: string): string => {
    const greeting = name ? `Welcome back, **${name}**!` : 'Welcome back!';

    const stepMessages: Record<OnboardingStep, string> = {
      greeting: GREETING_MESSAGE,
      currency_confirm: `${greeting} I need to confirm your region.\n\nAre you in **US** (USD), **UK** (GBP), or **Europe** (EUR)?`,
      name: `${greeting} Let's continue where we left off.\n\nWhat's your name?`,
      studies: `${greeting} Let's continue setting up your profile.\n\nWhat are you studying? (e.g., "Bachelor 2nd year Computer Science")`,
      skills: `${greeting} Let's continue.\n\nWhat are your skills? (coding, languages, design, sports...)`,
      certifications: `${greeting}\n\nDo you have any professional certifications? (BAFA, First Aid, TEFL, etc.) Say 'none' if not.`,
      budget: `${greeting} Let's talk about your budget.\n\nHow much do you earn and spend per month roughly?`,
      income_timing: `${greeting}\n\nWhen does your income arrive? (beginning, mid-month, or end of month)`,
      work_preferences: `${greeting}\n\nHow many hours max per week can you work? And what's your minimum hourly rate?`,
      goal: `${greeting} Almost there!\n\nWhat's your savings goal? What do you want to save for, how much, and by when?`,
      academic_events: `${greeting}\n\nAny important academic events coming up? (exams, vacations, busy periods)`,
      inventory: `${greeting}\n\nDo you have any items you could sell? (textbooks, electronics, etc.)`,
      trade: `${greeting}\n\nAre there things you could borrow instead of buying, or skills you could trade with friends?`,
      lifestyle: `${greeting}\n\nWhat subscriptions do you have? (streaming, gym, phone plan...)`,
      complete: getWelcomeBackMessage(name || 'there'),
    };

    return stepMessages[resumeStep] || GREETING_MESSAGE;
  };

  // Check for existing profile on mount
  // Priority: 1. Check forceNewProfile flag, 2. API (DuckDB), 3. localStorage fallback
  onMount(async () => {
    // Phase 5: Listen for swipe_completed messages from embed iframe
    const handleSwipeMessage = (event: MessageEvent) => {
      if (event.data?.type === 'swipe_completed') {
        const { direction, scenarioTitle } = event.data;

        // Generate acknowledgment based on direction
        let acknowledgment: string;
        switch (direction) {
          case 'right':
          case 'up':
            acknowledgment = `Strategy accepted: ${scenarioTitle}`;
            break;
          case 'left':
            acknowledgment = `Skipped: ${scenarioTitle}`;
            break;
          case 'down':
            acknowledgment = `Noted: ${scenarioTitle} isn't for you`;
            break;
          default:
            acknowledgment = `Swipe recorded: ${scenarioTitle}`;
        }

        // Add acknowledgment as assistant message
        const ackMsg: Message = {
          id: `swipe-ack-${Date.now()}`,
          role: 'assistant',
          content: acknowledgment,
        };
        setMessages((prev) => [...prev, ackMsg]);
      }
    };

    window.addEventListener('message', handleSwipeMessage);

    onCleanup(() => {
      window.removeEventListener('message', handleSwipeMessage);
    });

    // Check if user requested a completely fresh start
    const forceNew = localStorage.getItem('forceNewProfile');
    if (forceNew === 'true') {
      // Clear the flag immediately
      localStorage.removeItem('forceNewProfile');
      // Also clear temp onboarding messages
      localStorage.removeItem(ONBOARDING_TEMP_KEY);
      // Start fresh onboarding - don't load any existing profile
      setChatMode('onboarding');
      setStep('greeting');
      setIsComplete(false);
      setMessages([
        {
          id: 'greeting',
          role: 'assistant',
          content: GREETING_MESSAGE,
        },
      ]);
      return;
    }

    try {
      // First, try to load from API (DuckDB)
      const apiProfile = await profileService.loadActiveProfile();

      if (apiProfile) {
        // Profile exists in DB - check if complete
        setProfileId(apiProfile.id);
        setProfile({
          name: apiProfile.name,
          diploma: apiProfile.diploma,
          field: apiProfile.field,
          city: apiProfile.city,
          citySize: apiProfile.citySize,
          latitude: apiProfile.latitude,
          longitude: apiProfile.longitude,
          address: apiProfile.address,
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
          // Include followupData for energy chart (Sprint Graphiques)
          followupData: apiProfile.followupData,
        });

        if (isProfileComplete(apiProfile)) {
          // Complete profile -> conversation mode
          setChatMode('conversation');
          setStep('complete');
          setIsComplete(true);

          // Try to load chat history from DuckDB first
          try {
            const historyRes = await fetch(`/api/chat-history?profileId=${apiProfile.id}&limit=50`);
            if (historyRes.ok) {
              const dbMessages = await historyRes.json();
              if (Array.isArray(dbMessages) && dbMessages.length > 0) {
                setMessages(dbMessages);
                logger.info('Loaded chat history from DB for returning user', {
                  count: dbMessages.length,
                });
              } else {
                // No history in DB, show welcome back
                setMessages([
                  {
                    id: 'welcome-back',
                    role: 'assistant',
                    content: getWelcomeBackMessage(apiProfile.name!),
                  },
                ]);
              }
            } else {
              throw new Error('Failed to fetch chat history');
            }
          } catch (e) {
            logger.warn('Could not load chat history, showing welcome message', { error: e });
            setMessages([
              {
                id: 'welcome-back',
                role: 'assistant',
                content: getWelcomeBackMessage(apiProfile.name!),
              },
            ]);
          }
        } else {
          // Incomplete profile -> resume onboarding at the right step
          const resumeStep = determineResumeStep(apiProfile);
          setChatMode('onboarding');
          setStep(resumeStep);
          setIsComplete(false);
          setMessages([
            {
              id: 'resume',
              role: 'assistant',
              content: getResumeMessage(resumeStep, apiProfile.name),
            },
          ]);
        }
        return;
      }
    } catch (error) {
      logger.warn('API check failed, trying localStorage', { error });
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
          // Incomplete profile -> resume onboarding at the right step
          // Note: localStorage profile uses different field names
          const resumeStep = determineResumeStep({
            city: existingProfile.city,
            name: existingProfile.name,
            diploma: existingProfile.diploma,
            skills: existingProfile.skills,
            incomeSources: existingProfile.incomes, // localStorage uses 'incomes'
            goalName: existingProfile.goalName,
            goalAmount: existingProfile.goalAmount,
          });
          setChatMode('onboarding');
          setStep(resumeStep);
          setIsComplete(false);
          setMessages([
            {
              id: 'resume',
              role: 'assistant',
              content: getResumeMessage(resumeStep, existingProfile.name),
            },
          ]);
        }

        // Try to sync localStorage to DB in background
        profileService.syncLocalToDb().catch((err) => {
          logger.warn('Background sync failed', { error: err });
        });
        return;
      } catch {
        logger.warn('localStorage parse failed');
      }
    }

    // No profile found - check for temp onboarding messages (user refreshed during onboarding)
    setChatMode('onboarding'); // Explicitly set mode (fixes race with contextProfile effect)

    const tempMessages = localStorage.getItem(ONBOARDING_TEMP_KEY);
    if (tempMessages) {
      try {
        const savedMsgs = JSON.parse(tempMessages) as Message[];
        if (Array.isArray(savedMsgs) && savedMsgs.length > 0) {
          // Resume onboarding with saved messages
          setMessages(savedMsgs);
          // Try to determine the step from the last message
          const lastAssistantMsg = savedMsgs.filter((m) => m.role === 'assistant').pop();
          if (lastAssistantMsg?.content) {
            // Simple heuristic to determine current step from last message content
            const content = lastAssistantMsg.content.toLowerCase();
            if (content.includes('what city') || content.includes('greeting')) {
              setStep('greeting');
            } else if (content.includes('your name') || content.includes('call you')) {
              setStep('name');
            } else if (content.includes('studying') || content.includes('diploma')) {
              setStep('studies');
            } else if (content.includes('skills') || content.includes('superpowers')) {
              setStep('skills');
            } else if (content.includes('certifications') || content.includes('bafa')) {
              setStep('certifications');
            } else if (content.includes('budget') || content.includes('earn and spend')) {
              setStep('budget');
            } else if (content.includes('hours') || content.includes('hourly rate')) {
              setStep('work_preferences');
            } else if (content.includes('goal') || content.includes('saving for')) {
              setStep('goal');
            } else if (content.includes('academic') || content.includes('exam')) {
              setStep('academic_events');
            } else if (content.includes('inventory') || content.includes('sell')) {
              setStep('inventory');
            } else if (content.includes('trade') || content.includes('borrow')) {
              setStep('trade');
            } else if (content.includes('subscription') || content.includes('streaming')) {
              setStep('lifestyle');
            } else {
              setStep('greeting'); // Default fallback
            }
          } else {
            setStep('greeting');
          }
          logger.info('Resumed onboarding from temp storage', { messageCount: savedMsgs.length });
          return;
        }
      } catch (e) {
        logger.warn('Failed to parse temp onboarding messages', { error: e });
      }
    }

    // Start fresh onboarding
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        content: GREETING_MESSAGE,
      },
    ]);
    setStep('greeting'); // Start at 'greeting' step - we'll collect name first
  });

  // Listen for explicit data reset (e.g., "Reset all data" from ProfileSelector)
  // This ensures the chat resets when user explicitly resets all data
  // NOTE: We use DATA_RESET event, NOT DATA_CHANGED (which fires for any data update)
  createEffect(() => {
    const unsubDataReset = eventBus.on('DATA_RESET', () => {
      logger.info('DATA_RESET received - resetting onboarding chat');

      // Clear temp onboarding messages
      localStorage.removeItem(ONBOARDING_TEMP_KEY);

      // Reset to initial state
      setMessages([{ id: 'greeting', role: 'assistant', content: GREETING_MESSAGE }]);
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
        tradeOpportunities: [],
        swipePreferences: {
          effort_sensitivity: 0.5,
          hourly_rate_priority: 0.5,
          time_flexibility: 0.5,
          income_stability: 0.5,
        },
      });
      setStep('greeting');
      setChatMode('onboarding');
      setIsComplete(false);
      setProfileId(undefined);
      setThreadId(generateThreadId());
    });

    onCleanup(() => {
      unsubDataReset();
    });
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
    traceUrl?: string; // Opik trace URL for "Explain This" feature
    source?: 'mastra' | 'groq' | 'fallback';
  }> => {
    try {
      // Build time context for simulation support
      const simState = simulationState();
      const simDate = currentDate();
      const goalDeadline = context.goalDeadline as string | undefined;
      const timeContext = {
        simulatedDate: simDate.toISOString(),
        isSimulating: simState.isSimulating,
        offsetDays: simState.offsetDays,
        deadlinePassed: goalDeadline
          ? isDeadlinePassed(goalDeadline, { simulatedDate: simDate.toISOString() })
          : false,
      };

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
          timeContext, // NEW: Time context for simulation support
        }),
      });

      if (!response.ok) {
        throw new Error('Chat API error');
      }

      return response.json();
    } catch (error) {
      logger.error('Chat API error', { error });
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
    traceUrl?: string;
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

    // Onboarding mode flow - city first for early background data fetching
    // Note: currency_confirm is conditionally skipped if currency auto-detected
    const flow: OnboardingStep[] = [
      'greeting', // Now asks for city
      'currency_confirm', // Only if currency not auto-detected
      'name',
      'studies',
      'skills',
      'certifications',
      'budget',
      'work_preferences',
      'goal',
      'academic_events',
      'inventory',
      'trade', // Trade opportunities
      'lifestyle',
      'complete',
    ];
    const currentIndex = flow.indexOf(currentStep);
    let nextStep = flow[Math.min(currentIndex + 1, flow.length - 1)] as OnboardingStep;

    // Basic extraction
    const extractedData: Record<string, unknown> = {};
    if (currentStep === 'name') {
      extractedData.name = message.trim().split(/\s+/)[0];
    }
    // Extract city from greeting step and auto-detect currency
    if (currentStep === 'greeting') {
      extractedData.city = message.trim();
      const metadata = detectCityMetadata(message);
      extractedData.citySize = metadata.size;
      if (metadata.currency) {
        extractedData.currency = metadata.currency;
        // Skip currency_confirm step if currency was auto-detected
        nextStep = 'name';
      }
    }

    const fallbackResponses: Record<OnboardingStep, string> = {
      greeting: GREETING_MESSAGE,
      currency_confirm: `I couldn't detect your region automatically.\n\nAre you in **US** (USD), **UK** (GBP), or **Europe** (EUR)?`,
      name: `Great! What's your name?`,
      studies: `Nice to meet you, ${extractedData.name || message.trim()}!\n\nWhat are you studying? (e.g., "Bachelor 2nd year Computer Science", "Master 1 Business")`,
      skills: `Cool!\n\nWhat are your skills? (coding, languages, design, sports...)`,
      certifications: `Nice skills!\n\nDo you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')`,
      budget: `Got it!\n\nLet's talk budget: how much do you earn and spend per month roughly?`,
      income_timing: `Nice!\n\nWhen does your income usually arrive each month? (beginning, mid-month, or end)`,
      work_preferences: `OK for the budget!\n\nHow many hours max per week can you work? And what's your minimum hourly rate?`,
      goal: `Great work preferences!\n\nNow, what's your savings goal? What do you want to save for, how much, and by when?`,
      academic_events: `Great goal!\n\nAny important academic events coming up? (exams, vacations, busy periods)`,
      inventory: `Thanks for sharing!\n\nDo you have any items you could sell? (textbooks, electronics, etc.)`,
      trade: `Good to know!\n\nAre there things you could borrow instead of buying, or skills you could trade with friends? (or say 'none')`,
      lifestyle: `Thanks!\n\nWhat subscriptions do you have? (streaming, gym, phone plan...)`,
      complete: `Perfect! I have everything I need.\n\nClick on "My Plan" to get started!`,
    };

    return {
      response: fallbackResponses[nextStep] || "Let's continue!",
      extractedData,
      nextStep,
      source: 'fallback' as const,
    };
  };

  // Reset state for NEW profile (completely fresh)
  const resetForNewProfile = async () => {
    // Get current profile ID before clearing
    const currentProfileId = profileId();

    // If we have a current profile, clean up its data in the database
    if (currentProfileId) {
      try {
        await fetch('/api/profiles/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: currentProfileId }),
        });
      } catch (err) {
        logger.warn('Failed to reset profile data in DB', { error: err });
        // Continue anyway - localStorage will be cleared
      }
    }

    // IMPORTANT: Clear localStorage FIRST to prevent stale data from being loaded
    // This fixes the "profile bleeding" bug where old data appeared in new sessions
    localStorage.removeItem('studentProfile');
    localStorage.removeItem('followupData');
    localStorage.removeItem('achievements');
    localStorage.removeItem(ONBOARDING_TEMP_KEY); // Clear temp chat messages

    // Reset profile to defaults
    setProfile({
      name: undefined,
      diploma: undefined,
      field: undefined, // Reset field to get fresh skill suggestions
      city: undefined,
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
      tradeOpportunities: [],
      // BUG J FIX: Include swipePreferences in reset
      swipePreferences: {
        effort_sensitivity: 0.5,
        hourly_rate_priority: 0.5,
        time_flexibility: 0.5,
        income_stability: 0.5,
      },
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
      name: undefined,
      diploma: undefined,
      field: undefined, // Reset field to get fresh skill suggestions
      city: undefined,
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
      tradeOpportunities: [],
      // BUG J FIX: Include swipePreferences in reset
      swipePreferences: {
        effort_sensitivity: 0.5,
        hourly_rate_priority: 0.5,
        time_flexibility: 0.5,
        income_stability: 0.5,
      },
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
    // Extract coordinates from form data (captured by MapPicker in OnboardingFormStep)
    if (data.coordinates && typeof data.coordinates === 'object') {
      const coords = data.coordinates as { latitude?: number; longitude?: number };
      if (coords.latitude != null) updates.latitude = Number(coords.latitude);
      if (coords.longitude != null) updates.longitude = Number(coords.longitude);
    }
    if (data.address) updates.address = String(data.address);
    if (data.maxWorkHours) updates.maxWorkHours = Number(data.maxWorkHours);
    if (data.minHourlyRate) updates.minHourlyRate = Number(data.minHourlyRate);
    if (data.currency) updates.currency = String(data.currency) as 'USD' | 'EUR' | 'GBP';

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
      // 5 categories breakdown: rent 50%, food 25%, transport 10%, subscriptions 5%, other 10%
      updates.expenses = [
        { category: 'rent', amount: Math.round(expenses * 0.5) },
        { category: 'food', amount: Math.round(expenses * 0.25) },
        { category: 'transport', amount: Math.round(expenses * 0.1) },
        { category: 'subscriptions', amount: Math.round(expenses * 0.05) },
        { category: 'other', amount: Math.round(expenses * 0.1) },
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
          logger.error('Cannot create goal: No profile ID available. Complete onboarding first.');
          return;
        }

        // BUG 1 FIX: Enforce single active goal policy in conversation mode
        // Archive existing active goals before creating a new one
        (async () => {
          try {
            // Fetch existing active goals for this profile
            const existingGoalsResponse = await fetch(
              `/api/goals?profileId=${currentProfileId}&status=active`
            );
            if (existingGoalsResponse.ok) {
              const existingGoals = await existingGoalsResponse.json();
              // Archive each active goal (set status to 'paused')
              for (const goal of existingGoals) {
                await fetch('/api/goals', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: goal.id, status: 'paused' }),
                });
              }
            }

            // Now create the new goal
            await goalService.createGoal({
              profileId: currentProfileId,
              name: newGoal.name || 'New Goal',
              amount: newGoal.amount || 100,
              deadline: newGoal.deadline,
              status: (newGoal.status as 'active' | 'waiting' | 'completed' | 'paused') || 'active',
              priority: newGoal.priority || 1,
            });
            // Goal created successfully - existing goals were archived
          } catch (err) {
            logger.error('Failed to create goal', { error: err });
          }
        })();
      }
    }

    // Smart merge for academic events - collected at 'academic_events' step
    // BUG P FIX: Changed step parameter from 'goal' to 'academic_events'
    if (data.academicEvents !== undefined && Array.isArray(data.academicEvents)) {
      // BUG K FIX: Normalize dates - ensure endDate defaults to startDate if missing
      const normalizedEvents = (data.academicEvents as AcademicEvent[]).map((event) => ({
        ...event,
        endDate: event.endDate || event.startDate, // Default endDate to startDate
      }));
      const merged = smartMergeArrays(
        currentProfile.academicEvents,
        normalizedEvents,
        currentStep,
        'academic_events'
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

    // BUG H FIX: Handle trade opportunities (borrow/lend/trade/sell)
    // This was missing, causing Trade tab Borrow section to be empty
    if (data.tradeOpportunities !== undefined && Array.isArray(data.tradeOpportunities)) {
      const merged = smartMergeArrays(
        currentProfile.tradeOpportunities,
        data.tradeOpportunities as TradeOpportunity[],
        currentStep,
        'trade'
      );
      if (merged !== undefined) updates.tradeOpportunities = merged;
    }

    // Also handle borrowItems if extracted separately (some LLM responses use this)
    // BUG R FIX: Include estimatedValue for borrow items (e.g., "borrow camping gear worth $150")
    if (data.borrowItems !== undefined && Array.isArray(data.borrowItems)) {
      const borrowTrades: TradeOpportunity[] = (
        data.borrowItems as Array<{
          name?: string;
          item?: string;
          from?: string;
          value?: number;
          estimatedValue?: number;
          worth?: number;
        }>
      ).map((item) => ({
        type: 'borrow' as const,
        description: typeof item === 'string' ? item : item.name || item.item || 'Item',
        withPerson: typeof item === 'string' ? 'Friend' : item.from || 'Friend',
        // BUG R FIX: Extract value from various possible field names
        estimatedValue:
          typeof item === 'string' ? undefined : item.value || item.estimatedValue || item.worth,
      }));
      updates.tradeOpportunities = [
        ...(updates.tradeOpportunities || currentProfile.tradeOpportunities || []),
        ...borrowTrades,
      ];
    }

    // Handle sellItems if extracted separately
    if (data.sellItems !== undefined && Array.isArray(data.sellItems)) {
      const sellTrades: TradeOpportunity[] = (
        data.sellItems as Array<{
          name?: string;
          item?: string;
          value?: number;
          estimatedValue?: number;
        }>
      ).map((item) => ({
        type: 'sell' as const,
        description: typeof item === 'string' ? item : item.name || item.item || 'Item',
        estimatedValue: typeof item === 'string' ? undefined : item.value || item.estimatedValue,
      }));
      updates.tradeOpportunities = [
        ...(updates.tradeOpportunities || currentProfile.tradeOpportunities || []),
        ...sellTrades,
      ];
    }

    // Determine city size AND currency based on city/region
    if (data.city) {
      const { size, currency } = detectCityMetadata(String(data.city));
      updates.citySize = size;

      // Auto-detect currency from city (if not already set)
      if (!currentProfile.currency && currency) {
        updates.currency = currency;
      }

      // Auto-fill address and coordinates via geocoding (non-blocking)
      // Only fill MISSING data - don't overwrite existing address/coordinates from geolocation
      forwardGeocode(String(data.city)).then((geoResult) => {
        if (geoResult) {
          setProfile((prev) => ({
            ...prev,
            // Keep existing address (from reverse geocoding) if available
            address: prev.address || geoResult.address,
            // Keep existing coordinates if available
            latitude: prev.latitude ?? geoResult.coordinates.latitude,
            longitude: prev.longitude ?? geoResult.coordinates.longitude,
            // Also update currency from geocoding if not already set
            currency: prev.currency || geoResult.currency,
          }));
        }
      });
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
    saveMessageToDb(userMsg); // BUG 9 FIX: Persist to DuckDB

    // VALIDATION: Currency confirmation (only shown if city wasn't auto-detected)
    if (step() === 'currency_confirm') {
      const lower = text.toLowerCase();
      const validRegions = ['us', 'usa', 'usd', 'uk', 'gbp', 'europe', 'eu', 'eur'];
      const isValid = validRegions.some((r) => lower.includes(r));

      if (!isValid) {
        setTimeout(() => {
          const errorMsg: Message = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content:
              "I didn't catch that.\n\nPlease select **US** (USD), **UK** (GBP), or **Europe** (EUR).",
          };
          setMessages((prev) => [...prev, errorMsg]);
          saveMessageToDb(errorMsg);
        }, 600);
        return;
      }
    }

    setLoading(true);

    try {
      // Build context from current profile
      const currentProfile = profile();
      // Cast to any for extended profile properties not in simplified ProfileData type
      const fullProfile = currentProfile as Record<string, unknown>;
      const context: Record<string, unknown> = {
        name: currentProfile.name,
        diploma: currentProfile.diploma,
        field: currentProfile.field,
        city: currentProfile.city,
        skills: currentProfile.skills,
        income: currentProfile.incomes?.[0]?.amount,
        incomes: currentProfile.incomes, // Full array for chart handlers
        expenses: currentProfile.expenses?.reduce((sum, e) => sum + e.amount, 0),
        maxWorkHours: currentProfile.maxWorkHours,
        minHourlyRate: currentProfile.minHourlyRate,
        // Goal data for conversation mode
        goalName: currentProfile.goalName,
        goalAmount: currentProfile.goalAmount,
        goalDeadline: currentProfile.goalDeadline,
        currentSaved: (fullProfile.currentSaved as number) || 0,
        // Currency for dynamic formatting
        currency: currentProfile.currency || 'USD',
        // Energy history for energy chart (from Suivi page's followupData)
        energyHistory: (fullProfile.followupData as Record<string, unknown>)?.energyHistory || [],
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
                  latitude: updatedProfile.latitude,
                  longitude: updatedProfile.longitude,
                  address: updatedProfile.address,
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
                logger.error('Failed to save profile update', { error: err });
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
          currency: finalProfile.currency || 'USD', // User's currency preference
          skills: finalProfile.skills,
          certifications: finalProfile.certifications, // Bug fix: certifications were missing
          city: finalProfile.city,
          citySize: finalProfile.citySize,
          latitude: finalProfile.latitude, // Location coordinates from map picker
          longitude: finalProfile.longitude,
          address: finalProfile.address,
          incomeSources: finalProfile.incomes,
          expenses: finalProfile.expenses,
          maxWorkHoursWeekly: finalProfile.maxWorkHours,
          minHourlyRate: finalProfile.minHourlyRate,
          incomeDay: finalProfile.incomeDay || 15, // Day of month when income arrives
          hasLoan: finalProfile.hasLoan,
          loanAmount: finalProfile.loanAmount,
          profileType: 'main',
          goalName: finalProfile.goalName,
          goalAmount: finalProfile.goalAmount,
          goalDeadline: finalProfile.goalDeadline,
          planData, // Include planData for all tabs
          followupData: {}, // Explicitly initialize to prevent localStorage fallback
          // BUG J FIX: Include swipePreferences with defaults
          swipePreferences: finalProfile.swipePreferences || {
            effort_sensitivity: 0.5,
            hourly_rate_priority: 0.5,
            time_flexibility: 0.5,
            income_stability: 0.5,
          },
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
            // Migrate onboarding chat messages to DB now that we have a profile ID
            await migrateOnboardingMessages(savedProfileId);
          }

          // BUG F & G FIX: Verify profile actually exists in DB before creating goals/skills
          // saveProfile can return success:true even if only localStorage saved (API failed)
          const profileExistsInDb = savedProfileId
            ? await verifyProfileInDb(savedProfileId)
            : false;

          if (!profileExistsInDb) {
            logger.warn(
              'Profile not saved to DB, skipping goals/skills persistence. Data is only in localStorage.'
            );
            // Show toast notification instead of chat message
            toast.warning(
              'Offline mode',
              'Your profile was saved locally. Goals and skills will sync when the connection is restored.'
            );
          }

          // Persist all onboarding data to dedicated tables using the extracted persistence module
          // This ensures SkillsTab, BudgetTab, InventoryTab show the onboarding data
          if (profileExistsInDb && savedProfileId) {
            const persistResult = await persistAllOnboardingData(savedProfileId, {
              goal:
                finalProfile.goalName && finalProfile.goalAmount
                  ? {
                      name: finalProfile.goalName,
                      amount: finalProfile.goalAmount,
                      deadline: finalProfile.goalDeadline,
                      academicEvents: finalProfile.academicEvents,
                    }
                  : undefined,
              skills: finalProfile.skills,
              inventoryItems: finalProfile.inventoryItems,
              expenses: finalProfile.expenses,
              subscriptions: finalProfile.subscriptions,
              incomes: finalProfile.incomes,
              tradeOpportunities: finalProfile.tradeOpportunities,
              minHourlyRate: finalProfile.minHourlyRate,
            });

            // Show toast for partial failures instead of chat message
            if (!persistResult.success) {
              logger.warn('Some data could not be saved to dedicated tables', {
                failures: persistResult.failures,
                profileId: savedProfileId,
              });
              toast.warning(
                'Partial sync',
                `Some details (${persistResult.failures.join(', ')}) couldn't be synced. You can add them manually in the Plan page.`
              );
            }
          }

          // Mark onboarding as complete BEFORE refreshing context
          // This prevents the createEffect from resetting the chat when it detects profile change
          setChatMode('conversation');
          setStep('complete');
          setIsComplete(true);

          // Refresh shared profile context so header updates with new name
          await refreshProfile();
          // Also refresh skills, inventory, lifestyle, income, trades to ensure data is loaded before navigating
          await Promise.all([
            refreshSkills(),
            refreshInventory(),
            refreshLifestyle(),
            refreshIncome(),
            refreshIncome(),
            refreshTrades(),
            refreshGoals(),
          ]);

          // Show success toast for onboarding completion
          toast.success(
            'Profile complete!',
            'Your profile has been saved. Ready to start your plan!'
          );
        } catch (error) {
          logger.error('Failed to save profile to API', { error });
          toast.error('Save failed', 'Could not save profile. Your data is stored locally.');
        }

        // Keep localStorage as fallback
        localStorage.setItem('studentProfile', JSON.stringify(finalProfile));
      }

      // Add assistant message with source indicator, trace ID, and trace URL
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        source: result.source,
        uiResource: (result as { uiResource?: UIResource }).uiResource, // MCP-UI interactive component if present
        traceId: (result as { traceId?: string }).traceId, // Opik trace ID for feedback
        traceUrl: (result as { traceUrl?: string }).traceUrl, // Opik trace URL for "Explain This" feature
      };
      setMessages([...messages(), assistantMsg]);
      saveMessageToDb(assistantMsg); // BUG 9 FIX: Persist to DuckDB

      // Source available on badge in UI (no console logging needed)
    } catch (error) {
      logger.error('Chat error', { error });
      // Show toast for visibility + add chat message
      toast.error('Connection issue', 'Something went wrong. Please try again.');
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Oops, I had a small issue. Can you try again?',
      };
      setMessages([...messages(), errorMsg]);
      saveMessageToDb(errorMsg); // BUG 9 FIX: Persist to DuckDB
    } finally {
      setLoading(false);
      // Auto-focus input for seamless conversation flow
      setTimeout(() => chatInputRef?.focus(), 50);
    }
  };

  const goToPlan = () => {
    navigate('/plan');
  };

  /**
   * Handle form submission from OnboardingFormStep
   * For dynamic-list fields, directly updates profile with structured data.
   * For other fields, converts to natural language message for LLM processing.
   */
  const handleFormSubmit = (data: Record<string, unknown>) => {
    const currentStep = step();

    // Handle dynamic-list steps specially - directly update profile
    if (currentStep === 'academic_events' && Array.isArray(data.academicEvents)) {
      // Map old types to new API types
      const mapEventType = (type: string): AcademicEventType => {
        switch (type) {
          case 'exam':
          case 'exam_period':
            return 'exam_period';
          case 'busy':
          case 'class_intensive':
            return 'class_intensive';
          case 'vacation':
          case 'vacation_available':
            return 'vacation_available';
          case 'vacation_rest':
            return 'vacation_rest';
          case 'internship':
            return 'internship';
          case 'project_deadline':
            return 'project_deadline';
          default:
            return 'class_intensive'; // Default fallback
        }
      };

      const events = (data.academicEvents as Array<Record<string, unknown>>).map((item) => ({
        name: (item.name as string) || '',
        type: mapEventType((item.type as string) || ''),
        startDate: item.startDate as string,
        endDate: item.endDate as string,
      }));
      // Directly update profile and advance
      setProfile((prev) => ({ ...prev, academicEvents: events }));
      // Generate simple message for chat history
      const message =
        events.length > 0 ? events.map((e) => `${e.name} (${e.type})`).join(', ') : 'none';
      handleSend(message);
      return;
    }

    if (currentStep === 'inventory' && Array.isArray(data.inventoryItems)) {
      const items = (data.inventoryItems as Array<Record<string, unknown>>).map((item) => ({
        name: (item.name as string) || '',
        category: (item.category as string) || 'other',
        estimatedValue: (item.estimatedValue as number) || 0,
      }));
      // Directly update profile
      setProfile((prev) => ({ ...prev, inventoryItems: items }));
      const message =
        items.length > 0
          ? items
              .map(
                (i) =>
                  `${i.name}${i.estimatedValue ? ` (${getCurrencySymbolForForm()}${i.estimatedValue})` : ''}`
              )
              .join(', ')
          : 'none';
      handleSend(message);
      return;
    }

    if (currentStep === 'trade' && Array.isArray(data.tradeOpportunities)) {
      const trades = (data.tradeOpportunities as Array<Record<string, unknown>>).map((item) => ({
        type: (item.type as 'borrow' | 'lend' | 'trade') || 'borrow',
        description: (item.name as string) || '',
        withPerson: (item.partner as string) || '',
        estimatedValue: (item.estimatedSavings as number) || 0,
      }));
      // Directly update profile
      setProfile((prev) => ({ ...prev, tradeOpportunities: trades }));
      const message =
        trades.length > 0
          ? trades
              .map(
                (t) =>
                  `${t.type} ${t.description}${t.withPerson ? ` from ${t.withPerson}` : ''}${t.estimatedValue ? ` (saves ${getCurrencySymbolForForm()}${t.estimatedValue})` : ''}`
              )
              .join(', ')
          : 'none';
      handleSend(message);
      return;
    }

    // Convert form data to a natural message based on step
    let message = '';

    switch (currentStep) {
      case 'greeting':
        message = data.city as string;
        // BUG FIX: Save coordinates immediately from MapPicker form data
        // Without this, coordinates from geolocation were being lost
        if (data.coordinates && typeof data.coordinates === 'object') {
          const coords = data.coordinates as { latitude?: number; longitude?: number };
          if (coords.latitude != null && coords.longitude != null) {
            setProfile((prev) => ({
              ...prev,
              latitude: coords.latitude,
              longitude: coords.longitude,
            }));
          }
        }
        // Also save address if available from reverse geocoding
        if (data.address && typeof data.address === 'string') {
          setProfile((prev) => ({
            ...prev,
            address: data.address as string,
          }));
        }
        break;
      case 'currency_confirm':
        message = data.currency as string;
        break;
      case 'name':
        message = data.name as string;
        break;
      case 'studies': {
        // Directly update profile with diploma and field for immediate use (e.g., skills suggestions)
        const diploma = data.diploma as string | undefined;
        const field = data.field as string | undefined;
        const fieldOther = data.fieldOther as string | undefined;

        setProfile((prev) => ({
          ...prev,
          diploma,
          field,
        }));

        // Build message for LLM
        const fieldDisplay = field === 'other' && fieldOther ? fieldOther : field;
        message = `${diploma || ''} in ${fieldDisplay || ''}`.trim();
        break;
      }
      case 'skills':
        message = Array.isArray(data.skills) ? (data.skills as string[]).join(', ') : 'none';
        break;
      case 'certifications':
        message =
          Array.isArray(data.certifications) && data.certifications.length > 0
            ? (data.certifications as string[]).join(', ')
            : 'none';
        break;
      case 'budget':
        message = `income ${data.income || 0}, expenses ${data.expenses || 0}`;
        break;
      case 'income_timing': {
        // Directly update profile with incomeDay and advance
        const parsedIncomeDay = parseInt(data.incomeDay as string) || 15;
        setProfile((prev) => ({ ...prev, incomeDay: parsedIncomeDay }));
        message =
          parsedIncomeDay <= 5
            ? 'beginning of month'
            : parsedIncomeDay >= 25
              ? 'end of month'
              : 'mid-month';
        break;
      }
      case 'work_preferences':
        message = `${data.maxWorkHours || 15} hours per week, minimum ${data.minHourlyRate || 12}/h`;
        break;
      case 'goal':
        message = `${data.goalName} - ${data.goalAmount} by ${data.goalDeadline}`;
        break;
      case 'lifestyle': {
        const subs = data.subscriptions as Array<{ name: string; currentCost?: number }>;
        if (Array.isArray(subs) && subs.length > 0) {
          message = subs
            .map(
              (sub) =>
                `${sub.name}${sub.currentCost ? ` (${getCurrencySymbolForForm()}${sub.currentCost}/month)` : ''}`
            )
            .join(', ');
        } else {
          message = 'none';
        }
        break;
      }
      default:
        message = JSON.stringify(data);
    }

    if (message) {
      handleSend(message);
    }
  };

  /**
   * Get currency symbol for form display
   */
  const getCurrencySymbolForForm = (): string => {
    const curr = profile().currency || 'USD';
    switch (curr) {
      case 'EUR':
        return '€';
      case 'GBP':
        return '£';
      default:
        return '$';
    }
  };

  // Helper for left sidebar context (reserved for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getStepContext = (s: OnboardingStep) => {
    const contextMap: Record<string, { title: string; description: string }> = {
      greeting: {
        title: 'Welcome!',
        description: "I'm Bruno, your AI financial coach. Let's get to know each other.",
      },
      region: {
        title: 'Location',
        description: 'This helps me set the right currency and suggestions.',
      },
      name: { title: 'About You', description: 'What should I call you?' },
      studies: {
        title: 'Education',
        description: 'Your studies help me match you with relevant student jobs.',
      },
      skills: {
        title: 'Your Superpowers',
        description: "Skills are your biggest asset. Don't be shy!",
      },
      certifications: {
        title: 'Qualifications',
        description: 'Official certs can boost your hourly rate significantly.',
      },
      location: { title: 'City', description: 'Job opportunities vary by location.' },
      budget: {
        title: 'Money Talk',
        description: 'Understanding your cash flow is key to saving.',
      },
      work_preferences: {
        title: 'Availability',
        description: 'Balancing work and studies is crucial.',
      },
      goal: { title: 'The Dream', description: 'What are we saving for? Make it inspiring!' },
      academic_events: {
        title: 'Schedule',
        description: "We'll plan around your exams and holidays.",
      },
      inventory: {
        title: 'Hidden Assets',
        description: 'You might be sitting on extra cash without knowing it.',
      },
      trade: {
        title: 'Smart Trades',
        description: 'Bartering can save you money without spending.',
      },
      lifestyle: { title: 'Subscriptions', description: 'Small recurring costs add up fast.' },
      complete: { title: 'All Set!', description: "Your profile is ready. Let's make a plan." },
    };
    return contextMap[s] || { title: 'Chat', description: 'Ask me anything about your finance.' };
  };

  return (
    <>
      <style>{`
        @keyframes orbital-pulse {
          0%, 100% {
            transform: scale(0.95);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.7;
          }
        }
      `}</style>
      <div class="fixed inset-x-0 top-16 md:pl-64 bottom-16 md:bottom-0 z-30 bg-background">
        <div class="grid grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[380px_1fr] h-full">
          {/* Left Sidebar (Desktop Only) */}
          <div class="hidden md:flex flex-col border-r border-border bg-muted/10 p-6 h-full">
            <div class="flex flex-col items-center text-center mb-10">
              {/* Bruno Avatar with Orbital Pulse */}
              <div class="relative w-36 h-36 flex items-center justify-center mb-4">
                {/* Orbital Rings */}
                <div
                  class="absolute w-[104px] h-[104px] rounded-full border border-primary/30"
                  style={{
                    animation: 'orbital-pulse 3s ease-in-out infinite',
                    'animation-delay': '0s',
                  }}
                />
                <div
                  class="absolute w-[116px] h-[116px] rounded-full border border-primary/20"
                  style={{
                    animation: 'orbital-pulse 3s ease-in-out infinite',
                    'animation-delay': '0.5s',
                  }}
                />
                <div
                  class="absolute w-[128px] h-[128px] rounded-full border border-primary/10"
                  style={{
                    animation: 'orbital-pulse 3s ease-in-out infinite',
                    'animation-delay': '1s',
                  }}
                />

                {/* Bruno Avatar (centered, above rings) */}
                <div class="relative z-10 w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-3xl font-bold shadow-xl ring-4 ring-background">
                  B
                </div>
              </div>
              <h2 class="text-2xl font-bold text-foreground">Bruno</h2>
              <p class="text-muted-foreground font-medium">Financial Coach</p>

              {/* Quick Links - Show after onboarding, trigger charts in chat */}
              <Show when={isComplete()}>
                <div class="mt-6 flex flex-col gap-2 w-full max-w-[180px]">
                  <For each={QUICK_LINKS}>
                    {(link, i) => {
                      const Icon = quickLinkIcons[link.icon];
                      return (
                        <button
                          onClick={() =>
                            handleUIAction('show_chart', { chartType: link.chartType })
                          }
                          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/30 shadow-sm hover:shadow text-sm text-muted-foreground hover:text-foreground transition-all duration-200"
                          style={{
                            animation: 'fade-in 0.3s ease-out forwards',
                            'animation-delay': `${i() * 75}ms`,
                            opacity: 0,
                          }}
                        >
                          <Icon class="h-4 w-4" />
                          <span>{link.label}</span>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>

            <div
              class="flex-1 overflow-y-auto min-h-0 w-full transition-all duration-1000"
              classList={{
                'opacity-0': ['greeting', 'currency_confirm'].includes(step()) || isComplete(),
                'opacity-100': !['greeting', 'currency_confirm'].includes(step()) && !isComplete(),
                'pointer-events-none': isComplete(),
              }}
            >
              <Show when={!['greeting', 'currency_confirm'].includes(step())}>
                <OnboardingProgress currentStepId={step()} />
              </Show>
            </div>

            <div class="mt-auto p-6 w-full flex items-center justify-center gap-4">
              {/* Restart Button - Always Visible */}
              <GlassButton
                class="icon-mode group transform-gpu"
                title="Restart Onboarding"
                // eslint-disable-next-line solid/reactivity
                onClick={async () => {
                  setProfile({
                    name: undefined,
                    diploma: undefined,
                    field: undefined, // Reset field to get fresh skill suggestions
                    city: undefined,
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
                    tradeOpportunities: [],
                    swipePreferences: {
                      effort_sensitivity: 0.5,
                      hourly_rate_priority: 0.5,
                      time_flexibility: 0.5,
                      income_stability: 0.5,
                    },
                  });
                  localStorage.removeItem('studentProfile');
                  localStorage.removeItem('planData');
                  localStorage.removeItem('activeProfileId');
                  localStorage.removeItem('followupData');
                  localStorage.removeItem('achievements');

                  const oldProfileId = profileId();
                  if (oldProfileId) {
                    try {
                      await Promise.all([
                        fetch(`/api/goals?profileId=${oldProfileId}`, { method: 'DELETE' }),
                        fetch(`/api/skills?profileId=${oldProfileId}`, { method: 'DELETE' }),
                        fetch(`/api/inventory?profileId=${oldProfileId}`, { method: 'DELETE' }),
                        fetch(`/api/lifestyle?profileId=${oldProfileId}`, { method: 'DELETE' }),
                        fetch(`/api/income?profileId=${oldProfileId}`, { method: 'DELETE' }),
                      ]);
                      await Promise.all([
                        refreshSkills(),
                        refreshInventory(),
                        refreshLifestyle(),
                        refreshIncome(),
                      ]);
                    } catch (e) {
                      logger.warn('Failed to clear old data', { error: e });
                    }
                  }
                  setThreadId(generateThreadId());
                  setProfileId(undefined);
                  setIsComplete(false);
                  setChatMode('onboarding');
                  setStep('greeting');
                  setMessages([{ id: 'restart', role: 'assistant', content: GREETING_MESSAGE }]);
                }}
              >
                <Repeat class="h-6 w-6 text-muted-foreground group-hover:text-primary group-hover:rotate-180 transition-all duration-500" />
              </GlassButton>

              {/* Start My Plan - Fades In Next to it */}
              <div
                class={`transition-all duration-1000 transform overflow-hidden whitespace-nowrap ${
                  isComplete() ? 'w-auto opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-4'
                }`}
              >
                <GlassButton onClick={goToPlan}>
                  Start My Plan
                  <svg
                    class="animate-bounce-x ml-2"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </GlassButton>
              </div>
            </div>
          </div>

          {/* Right Chat Area */}
          <div class="flex flex-col h-full min-h-0 relative bg-background/50">
            {/* Messages */}

            {/* Messages */}
            <ScrollArea
              class="flex-1 min-h-0"
              viewportClass="p-4 md:p-8"
              viewportRef={(el) => (messagesContainerRef = el)}
            >
              <div class="max-w-3xl space-y-6 pb-40">
                <For each={messages()}>
                  {(msg) => (
                    <>
                      <ChatMessage
                        role={msg.role}
                        content={msg.content}
                        avatar="B"
                        name={msg.role === 'assistant' ? 'Bruno' : undefined}
                        badge={msg.source}
                        traceId={msg.traceId}
                        traceUrl={msg.traceUrl}
                      />
                      {/* MCP-UI interactive component (forms, tables, etc.) */}
                      <Show when={msg.uiResource}>
                        <div class="ml-12 mb-4">
                          <MCPUIRenderer resource={msg.uiResource!} onAction={handleUIAction} />
                        </div>
                      </Show>
                    </>
                  )}
                </For>

                <Show when={loading()}>
                  <div class="flex justify-start mb-4 pl-2">
                    <div class="flex items-center gap-2 px-4 py-3 bg-muted/50 rounded-2xl rounded-tl-none">
                      <div class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" />
                      <div
                        class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                        style={{ 'animation-delay': '0.1s' }}
                      />
                      <div
                        class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                        style={{ 'animation-delay': '0.2s' }}
                      />
                    </div>
                  </div>
                </Show>

                {/* Contextual form for current step */}
                <Show
                  when={
                    !loading() &&
                    !isComplete() &&
                    chatMode() === 'onboarding' &&
                    hasStepForm(step())
                  }
                >
                  <div class="ml-12 mb-4 max-w-md">
                    <OnboardingFormStep
                      step={step()}
                      initialValues={profile() as Record<string, unknown>}
                      currencySymbol={getCurrencySymbolForForm()}
                      fieldOfStudy={profile().field}
                      onSubmit={handleFormSubmit}
                      onSkip={() => handleSend('none')}
                    />
                  </div>
                </Show>

                {/* Spacer for bottom scroll */}
                <div class="h-4" />
              </div>
            </ScrollArea>

            {/* Action buttons (Restart / Start Plan) */}
            {/* Action buttons (Restart / Start Plan) */}
            {/* Action buttons (Restart / Start Plan) */}
            {/* Restart button removed from top right, moved to sidebar */}

            {/* Input Area */}
            <div class="p-4 md:p-6 bg-background/80 backdrop-blur-xl border-t border-border z-20">
              <div class="max-w-3xl w-full relative">
                <Show
                  when={isComplete()}
                  fallback={
                    <ChatInput
                      ref={(el) => (chatInputRef = el)}
                      onSend={handleSend}
                      placeholder="Type your response..."
                      disabled={loading()}
                    />
                  }
                >
                  <div class="flex gap-4">
                    <ChatInput
                      ref={(el) => (chatInputRef = el)}
                      onSend={handleSend}
                      placeholder="Ask Bruno anything..."
                      disabled={loading()}
                    />
                    <div class="hidden md:flex items-center justify-center">
                      {/* Desktop CTA moved to sidebar */}
                    </div>
                  </div>
                  {/* Mobile CTA */}
                  <div class="md:hidden mt-3 animate-in slide-in-from-bottom-4 duration-500 w-full flex justify-center">
                    <GlassButton onClick={goToPlan}>
                      Start My Plan
                      <svg
                        class="animate-bounce-x"
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </GlassButton>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
