/**
 * Onboarding Page (index.tsx)
 *
 * Conversational onboarding with Bruno avatar.
 * Progressive questions to build student profile.
 */

import { OnboardingChat } from '~/components/chat/OnboardingChat';

export default function OnboardingPage() {
  return (
    <div class="h-full">
      <OnboardingChat />
    </div>
  );
}
