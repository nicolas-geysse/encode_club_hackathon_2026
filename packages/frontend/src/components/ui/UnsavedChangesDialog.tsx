/**
 * Unsaved Changes Dialog Component
 *
 * A confirmation dialog that appears when trying to close a form with unsaved changes.
 * Asks the user whether to discard changes or keep editing.
 */

import { ConfirmDialog } from './ConfirmDialog';

export interface UnsavedChangesDialogProps {
  /** Whether to show the dialog */
  isOpen: boolean;
  /** Handler for "Discard" button - closes form and discards changes */
  onDiscard: () => void;
  /** Handler for "Keep editing" button - returns to form */
  onKeepEditing: () => void;
  /** Custom message (defaults to "You have unsaved changes that will be lost.") */
  message?: string;
}

export function UnsavedChangesDialog(props: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      isOpen={props.isOpen}
      title="Unsaved changes"
      message={props.message || 'You have unsaved changes that will be lost.'}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      variant="neutral"
      onConfirm={props.onDiscard}
      onCancel={props.onKeepEditing}
    />
  );
}
