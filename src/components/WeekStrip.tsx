import { useRef } from 'react'
import { type DayKey, addDays, weekDays, weekdayIndex } from '../domain/dates'
import { dayNumber, formatCompact, weekdayLetter } from '../lib/format'
import { useCapacity, useLoads } from '../lib/hooks'

/** Les 7 jours de la semaine avec leur charge face à la capacité. Glisser pour changer de semaine. */
export function WeekStrip({
  selected,
  today,
  onSelect,
}: {
  selected: DayKey
  today: DayKey
  onSelect: (d: DayKey) => void
}) {
  const days = weekDays(selected)
  const loads = useLoads(days, today)
  const capacity = useCapacity()
  const touch = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className="grid grid-cols-7 gap-1.5"
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        const start = touch.current
        touch.current = null
        if (!start) return
        const dx = e.changedTouches[0].clientX - start.x
        const dy = e.changedTouches[0].clientY - start.y
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSelect(addDays(selected, dx < 0 ? 7 : -7))
      }}
    >
      {days.map((day) => {
        const load = loads[day] ?? 0
        const cap = capacity[weekdayIndex(day)] ?? 0
        const ratio = cap > 0 ? Math.min(1, load / cap) : 0
        const over = cap > 0 && load > cap
        const isSelected = day === selected
        const isToday = day === today
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-label={`${day}${over ? ' — journée surchargée' : ''}`}
            aria-pressed={isSelected}
            className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 transition active:scale-95 ${
              isSelected
                ? 'bg-accent text-on-accent'
                : isToday
                  ? 'bg-accent-soft text-ink'
                  : 'bg-surface text-ink'
            }`}
          >
            <span className={`text-[11px] font-medium ${isSelected ? 'opacity-80' : 'text-muted'}`}>
              {weekdayLetter(day)}
            </span>
            <span className="text-base font-semibold leading-none">{dayNumber(day)}</span>
            <span
              className={`mt-1 h-1 w-7 overflow-hidden rounded-full ${isSelected ? 'bg-on-accent/25' : 'bg-line'}`}
            >
              <span
                className={`block h-full rounded-full ${
                  over ? 'bg-bad' : isSelected ? 'bg-on-accent' : 'bg-accent'
                }`}
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
            <span
              className={`text-[10px] tabular ${
                over ? (isSelected ? 'font-bold' : 'font-semibold text-bad') : isSelected ? 'opacity-80' : 'text-muted'
              }`}
            >
              {formatCompact(load)}
              {over ? '!' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
