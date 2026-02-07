import { type ActionCallback } from './MCPUIRenderer';
import OnboardingFormStep from './OnboardingFormStep';
import type { OnboardingStep } from '~/lib/chat/types';

interface WrapperProps {
  step: OnboardingStep;
  initialData: Record<string, unknown>;
  onAction?: ActionCallback;
  submitLabel?: string;
}

export function OnboardingFormStepWrapper(props: WrapperProps) {
  const handleSubmit = (data: Record<string, unknown>) => {
    if (props.onAction) {
      // Add required goal fields format if needed (OnboardingFormStep returns { goalName, goalAmount, goalDeadline })
      // ActionDispatcher expects these same fields.

      // Inject actionType for handling in OnboardingChat
      // For GoalForm, the actionType is implicit or needs to be passed.
      // The parent FormResource has params.actionType. We should pass it down.
      // But for now, OnboardingChat handles "form-submit" with data.
      // If we look at OnboardingChat.tsx handleUIAction:
      // if (formData.goalName && formData.goalAmount) -> it handles it.

      props.onAction('form-submit', data);
    }
  };

  return (
    <OnboardingFormStep
      step={props.step}
      initialValues={props.initialData}
      onSubmit={handleSubmit}
      currencySymbol="$" // Default, should ideally come from profile context
      submitLabel={props.submitLabel}
    />
  );
}
