import type { DayKey } from './types'

export type { DayKey }

const pad = (n: number) => String(n).padStart(2, '0')

export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date à midi local, pour éviter les effets de bord des changements d'heure. */
export function parseDayKey(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function dayKeyOf(ms: number): DayKey {
  return toDayKey(new Date(ms))
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = parseDayKey(k)
  d.setDate(d.getDate() + n)
  return toDayKey(d)
}

/** Nombre de jours entre a et b (a - b). */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((parseDayKey(a).getTime() - parseDayKey(b).getTime()) / 86_400_000)
}

/** Lundi = 0 … dimanche = 6. */
export function weekdayIndex(k: DayKey): number {
  return (parseDayKey(k).getDay() + 6) % 7
}

export function startOfWeek(k: DayKey): DayKey {
  return addDays(k, -weekdayIndex(k))
}

export function weekDays(k: DayKey): DayKey[] {
  const start = startOfWeek(k)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Tous les jours de `from` à `to` inclus. */
export function daysBetween(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
