/**
 * Confirm Change Buttons Component
 *
 * Part of Bruno Chat 2.0 - Coach Financier Intelligent (Checkpoint B.1)
 *
 * Displays a confirmation prompt when Bruno detects a change to a sensitive
 * profile field. Shows the old and new values with Yes/No buttons.
 */

import { type Component } from 'solid-js';
import { Button } from '~/components/ui/Button';
import { FIELD_LABELS, type SensitiveField, looksLikeTypo } from '~/lib/chat/fieldValidation';

export interface ConfirmChangeButtonsProps {
  field: SensitiveField;
  oldValue: string;
  newValue: string;
  onConfirm: () => void;
  onReject: () => void;
}

/**
 * Inline confirmation component for sensitive profile field changes.
 * Renders in the chat flow when a change is detected.
 */
export const ConfirmChangeButtons: Component<ConfirmChangeButtonsProps> = (props) => {
  const fieldLabel = () => FIELD_LABELS[props.field] || props.field;
  const isTypoLikely = () => looksLikeTypo(props.newValue);

  return (
    <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 my-2">
      {/* Question */}
      <p class="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
        Change your <strong>{fieldLabel()}</strong>?
      </p>

      {/* Value comparison */}
      <p class="text-xs text-amber-700 dark:text-amber-300 mb-3 font-mono">
        "{props.oldValue}" → "{props.newValue}"
      </p>

      {/* Typo warning */}
      {isTypoLikely() && (
        <p class="text-xs text-amber-600 dark:text-amber-400 mb-3 italic">
          (This looks like a typo... are you sure?)
        </p>
      )}

      {/* Action buttons */}
      <div class="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={props.onReject}
          class="flex-1 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600 hover:bg-amber-100 dark:hover:bg-amber-800/50"
        >
          No, keep it
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={props.onConfirm}
          class="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
        >
          Yes, change it
        </Button>
      </div>
    </div>
  );
};

export default ConfirmChangeButtons;
