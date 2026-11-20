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

/**
 * La journée ne change pas à minuit : elle change quand tu appuies sur « Je vais dormir »,
 * ou toute seule à 5 h du matin si tu as oublié. Avant 5 h, on est donc encore la veille.
 */
export const DAY_START_HOUR = 5

/** Dernier « Je vais dormir » : la journée close et l'instant de l'appui. */
export interface Sleep {
  day: DayKey
  at: number
}

const SLEEP_STORAGE = 'ma-journee:sleep'
let sleep: Sleep | null = (() => {
  try {
    const raw = globalThis.localStorage?.getItem(SLEEP_STORAGE)
    return raw ? (JSON.parse(raw) as Sleep) : null
  } catch {
    return null
  }
})()
const sleepListeners = new Set<() => void>()

export function getSleep(): Sleep | null {
  return sleep
}

export function setSleep(s: Sleep | null): void {
  sleep = s
  try {
    if (s) globalThis.localStorage?.setItem(SLEEP_STORAGE, JSON.stringify(s))
    else globalThis.localStorage?.removeItem(SLEEP_STORAGE)
  } catch {
    // stockage indisponible : la valeur reste en mémoire (et dans la base)
  }
  for (const fn of sleepListeners) fn()
}

export function subscribeSleep(fn: () => void): () => void {
  sleepListeners.add(fn)
  return () => sleepListeners.delete(fn)
}

/** Jour « naturel » d'un instant : avant 5 h du matin, c'est encore la veille. */
export function naturalDayOf(ms: number): DayKey {
  const d = new Date(ms)
  const cal = toDayKey(d)
  return d.getHours() < DAY_START_HOUR ? addDays(cal, -1) : cal
}

/** Jour en cours : le jour naturel, ou le lendemain si tu as déjà dit « Je vais dormir ». */
export function todayOf(ms: number): DayKey {
  const base = naturalDayOf(ms)
  if (sleep && ms >= sleep.at && sleep.day >= base) return addDays(sleep.day, 1)
  return base
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
