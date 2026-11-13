import { type DayKey, addDays, weekdayIndex } from '../domain/dates'
import { dayNumber, formatCompact, weekdayLetter } from '../lib/format'
import { useCapacity, useLoads } from '../lib/hooks'

/**
 * Choix d'un jour avec la charge de chacun, pour placer une tâche là où il reste de la place.
 */
export function DayPicker({
  today,
  min,
  count = 14,
  disabled,
  onPick,
}: {
  today: DayKey
  min: DayKey
  count?: number
  disabled?: (day: DayKey) => boolean
  onPick: (day: DayKey) => void
}) {
  const days = Array.from({ length: count }, (_, i) => addDays(min, i))
  const loads = useLoads(days, today)
  const capacity = useCapacity()

  return (
    <div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((day) => {
          const load = loads[day] ?? 0
          const cap = capacity[weekdayIndex(day)] ?? 0
          const over = cap > 0 && load > cap
          const off = disabled?.(day) ?? false
          return (
            <button
              key={day}
              type="button"
              disabled={off}
              onClick={() => onPick(day)}
              className="flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-line bg-surface py-2 transition active:scale-95 disabled:opacity-35"
            >
              <span className="text-[11px] font-medium text-muted">{weekdayLetter(day)}</span>
              <span className="text-base font-semibold leading-none">{dayNumber(day)}</span>
              <span className={`mt-1 text-[10px] tabular ${over ? 'font-semibold text-bad' : 'text-muted'}`}>
                {formatCompact(load)}
                {over ? '!' : ''}
              </span>
            </button>
          )
        })}
      </div>
      <label className="mt-2 flex items-center justify-between gap-3 text-sm text-muted">
        Autre date
        <input
          type="date"
          min={min}
          className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-ink"
          onChange={(e) => e.target.value && onPick(e.target.value)}
        />
      </label>
    </div>
  )
}
