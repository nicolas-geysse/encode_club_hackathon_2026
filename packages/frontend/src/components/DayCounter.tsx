/**
 * Day Counter Component
 *
 * Shows current day progress with optional advance day button.
 * Used in header for simulation time tracking.
 */

interface DayCounterProps {
  currentDay: number;
  totalDays: number;
  onAdvanceDay?: () => void;
  canAdvance?: boolean;
}

export function DayCounter(props: DayCounterProps) {
  const progressPercent = () => Math.min(100, (props.currentDay / props.totalDays) * 100);

  return (
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
        <span class="text-xs text-slate-500 font-medium">JOUR</span>
        <span class="text-lg font-bold text-primary-600">{props.currentDay}</span>
        <span class="text-slate-400">/</span>
        <span class="text-sm text-slate-500">{props.totalDays}</span>
      </div>

      {/* Mini progress bar */}
      <div class="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-300"
          style={{ width: `${progressPercent()}%` }}
        />
      </div>

      {props.onAdvanceDay && (
        <button
          onClick={props.onAdvanceDay}
          disabled={!props.canAdvance}
          class="px-2 py-1 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          title="Avancer d'un jour"
        >
          + Jour
        </button>
      )}
    </div>
  );
}

export default DayCounter;
