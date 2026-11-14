import { formatMin } from '../lib/format'
import { Icon } from './ui'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const STEP = 30
const MAX = 16 * 60

/** Temps disponible pour chaque jour de la semaine (RG-70). */
export function CapacityEditor({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const set = (i: number, v: number) => {
    const next = [...value]
    next[i] = Math.min(MAX, Math.max(0, v))
    onChange(next)
  }
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {DAYS.map((d, i) => (
        <li key={d} className="flex items-center justify-between px-4 py-2">
          <span className="text-[15px]">{d}</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Moins pour ${d}`}
              className="flex size-9 items-center justify-center rounded-full bg-bg text-lg active:scale-90"
              onClick={() => set(i, (value[i] ?? 0) - STEP)}
            >
              <span className="text-xl leading-none">−</span>
            </button>
            <span className="w-16 text-center text-[15px] font-semibold tabular">
              {value[i] ? formatMin(value[i]) : '–'}
            </span>
            <button
              type="button"
              aria-label={`Plus pour ${d}`}
              className="flex size-9 items-center justify-center rounded-full bg-bg active:scale-90"
              onClick={() => set(i, (value[i] ?? 0) + STEP)}
            >
              <Icon name="plus" className="size-4" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
