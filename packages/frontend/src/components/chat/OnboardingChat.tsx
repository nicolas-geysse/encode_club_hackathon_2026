/**
 * Onboarding Chat Component
 *
 * Conversational onboarding with Bruno avatar.
 * Uses LLM API for intelligent responses and data extraction.
 */

import { createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { profileService } from '~/lib/profileService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
}

type OnboardingStep =
  | 'greeting'
  | 'name'
  | 'studies'
  | 'skills'
  | 'location'
  | 'budget'
  | 'work_preferences'
  | 'complete';

// Initial greeting message
const GREETING_MESSAGE = `Hey! I'm **Bruno**, your personal financial coach.

I'll help you navigate student life and reach your goals.

To start, **what's your name?**`;

export function OnboardingChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [step, setStep] = createSignal<OnboardingStep>('greeting');
  const [profile, setProfile] = createSignal<Partial<ProfileData>>({
    skills: [],
    incomes: [],
    expenses: [],
    maxWorkHours: 15,
    minHourlyRate: 12,
    hasLoan: false,
    loanAmount: 0,
  });
  const [isComplete, setIsComplete] = createSignal(false);

  // Check for existing profile on mount
  // Priority: 1. API (DuckDB), 2. localStorage fallback
  onMount(async () => {
    try {
      // First, try to load from API (DuckDB)
      const apiProfile = await profileService.loadActiveProfile();

      if (apiProfile && apiProfile.name) {
        // Profile exists in DB - show welcome back
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
        });
        setMessages([
          {
            id: 'welcome-back',
            role: 'assistant',
            content: `Hey **${apiProfile.name}**! Good to see you again.

Want to update your profile or go straight to your plan?`,
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
        // If profile exists, show welcome back message
        setMessages([
          {
            id: 'welcome-back',
            role: 'assistant',
            content: `Hey **${existingProfile.name}**! Good to see you again.

Want to update your profile or go straight to your plan?`,
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
    context: Record<string, unknown>
  ): Promise<{
    response: string;
    extractedData: Record<string, unknown>;
    nextStep: OnboardingStep;
  }> => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, step: currentStep, context }),
      });

      if (!response.ok) {
        throw new Error('Chat API error');
      }

      return response.json();
    } catch (error) {
      console.error('Chat API error:', error);
      // Return fallback response
      return getFallbackResponse(message, currentStep, context);
    }
  };

  // Fallback response when API fails
  const getFallbackResponse = (
    message: string,
    currentStep: OnboardingStep,
    _context: Record<string, unknown>
  ): { response: string; extractedData: Record<string, unknown>; nextStep: OnboardingStep } => {
    const flow: OnboardingStep[] = [
      'greeting',
      'name',
      'studies',
      'skills',
      'location',
      'budget',
      'work_preferences',
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
      budget: `OK for the budget!\n\nLast question: how many hours max per week can you work? And what's your minimum hourly rate?`,
      work_preferences: `Perfect! I have everything I need.\n\nClick on "My Plan" to get started!`,
      complete: '',
    };

    return {
      response: fallbackResponses[nextStep] || "Let's continue!",
      extractedData,
      nextStep,
    };
  };

  // Update profile from extracted data
  const updateProfileFromExtracted = (data: Record<string, unknown>) => {
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
      ];
      const smallCities = ['village', 'campagne', 'rural'];
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
      };

      // Call LLM API
      const currentStep = step();
      const result = await callChatAPI(text, currentStep, context);

      // Update profile with extracted data
      if (result.extractedData && Object.keys(result.extractedData).length > 0) {
        updateProfileFromExtracted(result.extractedData);
      }

      // Update step
      setStep(result.nextStep);

      // Handle completion
      if (result.nextStep === 'complete') {
        // Save profile to API (DuckDB)
        const finalProfile = profile() as ProfileData;

        // Normalize field names for API
        const normalizedProfile = {
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
        };

        // Save to API first
        try {
          await profileService.saveProfile(normalizedProfile, { immediate: true, setActive: true });
        } catch (error) {
          console.error('Failed to save profile to API:', error);
        }

        // Keep localStorage as fallback
        localStorage.setItem('studentProfile', JSON.stringify(finalProfile));
        setIsComplete(true);
      }

      // Add assistant message
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
      };
      setMessages([...messages(), assistantMsg]);
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
    }
  };

  const goToPlan = () => {
    navigate('/plan');
  };

  return (
    <div class="flex flex-col h-[calc(100vh-180px)] max-w-3xl mx-auto">
      {/* Chat messages */}
      <div class="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        <For each={messages()}>
          {(msg) => (
            <ChatMessage
              role={msg.role}
              content={msg.content}
              avatar="B"
              name={msg.role === 'assistant' ? 'Bruno' : undefined}
            />
          )}
        </For>

        <Show when={loading()}>
          <div class="flex justify-start mb-4">
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-lg shadow-sm">
                B
              </div>
              <div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
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

      {/* Input or action buttons */}
      <Show
        when={!isComplete()}
        fallback={
          <div class="border-t border-slate-200 bg-white p-6 text-center">
            <button class="btn-primary text-lg px-8 py-3" onClick={goToPlan}>
              Start My Plan
            </button>
            <p class="text-sm text-slate-500 mt-3">
              Or{' '}
              <button
                class="text-primary-600 underline"
                onClick={() => {
                  setIsComplete(false);
                  setStep('name');
                  setMessages([{ id: 'restart', role: 'assistant', content: GREETING_MESSAGE }]);
                }}
              >
                restart onboarding
              </button>
            </p>
          </div>
        }
      >
        <ChatInput onSend={handleSend} placeholder="Type your response..." disabled={loading()} />
      </Show>
    </div>
  );
}
