/**
 * Academic Events Section Component
 *
 * Extracted from GoalsTab to reduce component size.
 * Manages academic events like exam periods, vacations, internships, etc.
 */

import { Show, For, type Accessor, type Setter } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { DatePicker } from '~/components/ui/DatePicker';
import { GraduationCap, Pencil, Trash2, Plus, Check, X } from 'lucide-solid';
import { todayISO } from '~/lib/dateUtils';

export interface AcademicEvent {
  id: string;
  type:
    | 'exam_period'
    | 'class_intensive'
    | 'vacation'
    | 'vacation_rest'
    | 'vacation_available'
    | 'internship'
    | 'project_deadline';
  name: string;
  startDate: string;
  endDate: string;
}

interface AcademicEventsSectionProps {
  /** Current list of academic events */
  events: Accessor<AcademicEvent[]>;
  /** Set events list */
  setEvents: Setter<AcademicEvent[]>;
  /** New event form state */
  newEvent: Accessor<Partial<AcademicEvent>>;
  /** Set new event form state */
  setNewEvent: Setter<Partial<AcademicEvent>>;
  /** Currently editing event ID (null if adding new) */
  editingEventId: Accessor<string | null>;
  /** Set editing event ID */
  setEditingEventId: Setter<string | null>;
  /** Whether start and end dates are the same */
  isSameDay: Accessor<boolean>;
  /** Set same day flag */
  setIsSameDay: Setter<boolean>;
  /** Callback when user clicks delete on an event */
  onDeleteRequest: (event: { id: string; name: string }) => void;
}

/**
 * Get emoji icon for event type
 */
const getEventIcon = (type: AcademicEvent['type']): string => {
  switch (type) {
    case 'exam_period':
      return '📝';
    case 'vacation':
    case 'vacation_available':
      return '🏖️';
    case 'vacation_rest':
      return '📵';
    case 'internship':
      return '💼';
    case 'project_deadline':
      return '⏰';
    case 'class_intensive':
      return '📚';
    default:
      return '📅';
  }
};

export function AcademicEventsSection(props: AcademicEventsSectionProps) {
  // Add or update an academic event
  const addOrUpdateAcademicEvent = () => {
    const event = props.newEvent();
    if (!event.name || !event.startDate || !event.endDate) return;

    const editingId = props.editingEventId();
    if (editingId) {
      // Update existing event
      props.setEvents(
        props
          .events()
          .map((e) => (e.id === editingId ? ({ ...event, id: editingId } as AcademicEvent) : e))
      );
      props.setEditingEventId(null);
    } else {
      // Add new event
      props.setEvents([
        ...props.events(),
        { ...event, id: `event_${Date.now()}` } as AcademicEvent,
      ]);
    }
    // Reset form
    props.setNewEvent({ type: 'exam_period', name: '', startDate: '', endDate: '' });
    props.setIsSameDay(false);
  };

  // Cancel editing
  const cancelEditEvent = () => {
    props.setEditingEventId(null);
    props.setNewEvent({ type: 'exam_period', name: '', startDate: '', endDate: '' });
    props.setIsSameDay(false);
  };

  // Start editing an event
  const editAcademicEvent = (event: AcademicEvent) => {
    props.setEditingEventId(event.id);
    props.setNewEvent({
      type: event.type,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
    });
    props.setIsSameDay(event.startDate === event.endDate);
  };

  return (
    <Card>
      <CardContent class="p-6">
        <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <GraduationCap class="h-5 w-5 text-primary" /> Academic events
        </h3>
        <p class="text-sm text-muted-foreground mb-4">
          Add your exam periods or vacations to adapt your goals
        </p>

        {/* Events List */}
        <Show when={props.events().length > 0}>
          <div class="space-y-2 mb-4">
            <For each={props.events()}>
              {(event) => {
                const isEditing = () => props.editingEventId() === event.id;
                return (
                  <div
                    class={`flex items-center justify-between rounded-lg p-3 border transition-colors ${
                      isEditing()
                        ? 'bg-primary/10 border-primary ring-2 ring-primary/20'
                        : 'bg-muted/50 border-border'
                    }`}
                  >
                    <div class="flex items-center gap-3">
                      <span class="text-xl">{getEventIcon(event.type)}</span>
                      <div>
                        <p class="font-medium text-foreground">
                          {event.name}
                          {isEditing() && (
                            <span class="ml-2 text-xs text-primary font-normal">(editing)</span>
                          )}
                        </p>
                        <p class="text-xs text-muted-foreground">
                          {new Date(event.startDate).toLocaleDateString()} -{' '}
                          {new Date(event.endDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        class={`h-8 w-8 ${
                          isEditing()
                            ? 'text-primary bg-primary/10'
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                        }`}
                        onClick={() => (isEditing() ? cancelEditEvent() : editAcademicEvent(event))}
                        title={isEditing() ? 'Cancel edit' : 'Edit event'}
                      >
                        {isEditing() ? <X class="h-4 w-4" /> : <Pencil class="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                        onClick={() => props.onDeleteRequest({ id: event.id, name: event.name })}
                        title="Delete event"
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Add/Edit Form */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            value={props.newEvent().type}
            onChange={(e: Event & { currentTarget: HTMLSelectElement }) =>
              props.setNewEvent({
                ...props.newEvent(),
                type: e.currentTarget.value as AcademicEvent['type'],
              })
            }
            options={[
              { value: 'exam_period', label: '📝 Exam period' },
              { value: 'vacation_rest', label: '📵 Vacation (rest)' },
              { value: 'vacation_available', label: '🏖️ Vacation (available)' },
              { value: 'internship', label: '💼 Internship' },
              { value: 'class_intensive', label: '📚 Intensive class' },
              { value: 'project_deadline', label: '⏰ Deadline' },
            ]}
            class="w-full"
          />
          <Input
            type="text"
            placeholder="Event name"
            value={props.newEvent().name}
            onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
              props.setNewEvent({ ...props.newEvent(), name: e.currentTarget.value })
            }
          />

          {/* Dates Section - Range DatePicker with "Same day" checkbox */}
          <div class="col-span-1 md:col-span-2">
            <div class="flex items-end gap-3">
              <div class="flex-1">
                <label class="block text-sm font-medium text-muted-foreground mb-1">Dates</label>
                <DatePicker
                  mode="range"
                  startValue={props.newEvent().startDate}
                  endValue={
                    props.isSameDay() ? props.newEvent().startDate : props.newEvent().endDate
                  }
                  onRangeChange={(start, end) => {
                    props.setNewEvent({
                      ...props.newEvent(),
                      startDate: start,
                      endDate: props.isSameDay() ? start : end,
                    });
                  }}
                  min={todayISO()}
                />
              </div>
              <label
                class="flex flex-col items-center gap-1 cursor-pointer pb-2"
                title="The event ends on the same day"
              >
                <input
                  type="checkbox"
                  class="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                  checked={props.isSameDay()}
                  onChange={(e) => {
                    props.setIsSameDay(e.currentTarget.checked);
                    if (e.currentTarget.checked) {
                      props.setNewEvent({
                        ...props.newEvent(),
                        endDate: props.newEvent().startDate,
                      });
                    }
                  }}
                />
                <span class="text-[10px] text-muted-foreground whitespace-nowrap">Same day</span>
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div class="flex gap-2 mt-3">
          <Button
            variant={props.editingEventId() ? 'default' : 'outline'}
            size="sm"
            class={`flex-1 ${props.editingEventId() ? '' : 'border-dashed'}`}
            onClick={addOrUpdateAcademicEvent}
          >
            {props.editingEventId() ? (
              <>
                <Check class="h-4 w-4 mr-2" /> Update event
              </>
            ) : (
              <>
                <Plus class="h-4 w-4 mr-2" /> Add event
              </>
            )}
          </Button>
          <Show when={props.editingEventId()}>
            <Button variant="outline" size="sm" onClick={cancelEditEvent}>
              Cancel
            </Button>
          </Show>
        </div>
      </CardContent>
    </Card>
  );
}
