import type { AppDB } from '../db'
import { weekDays, weekdayIndex } from './dates'
import { dayItemsFromRaw, fetchRaw, loadReserve } from './queries'
import { computeDayStats } from './stats'
import type { DayKey } from './types'

export interface WeekReview {
  days: {
    day: DayKey
    planned: number
    done: number
    loadMin: number
    capacityMin: number
    overloaded: boolean
    /** Jour à venir : affiché, mais pas compté dans le taux de réalisation. */
    future: boolean
  }[]
  /** Éléments prévus jusqu'à aujourd'hui inclus. */
  planned: number
  done: number
  spentSec: number
  byCategory: { categoryId?: string; sec: number }[]
  /** Temps réel / temps estimé, sur les éléments faits qui ont les deux. */
  accuracy?: number
  overloadedDays: number
  unplanned: { count: number; sec: number }
  routines: { routineId: string; name: string; done: number; total: number }[]
  reserveCount: number
}

/** Bilan d'une semaine du lundi au dimanche (E9). */
export async function loadWeekReview(
  d: AppDB,
  anyDayOfWeek: DayKey,
  today: DayKey,
  capacity: number[],
): Promise<WeekReview> {
  const days = weekDays(anyDayOfWeek)
  // les deux lectures démarrent ensemble pour rester suivies en direct (voir queries.ts)
  const [raw, reserve] = await Promise.all([
    fetchRaw(d, { from: days[0], to: days[6] }),
    loadReserve(d, today),
  ])

  const byCat = new Map<string | undefined, number>()
  const routines = new Map<string, { name: string; done: number; total: number }>()
  let planned = 0
  let done = 0
  let spentSec = 0
  let estSec = 0
  let realSec = 0
  let unplannedCount = 0
  let unplannedSec = 0
  let overloadedDays = 0
  const rows: WeekReview['days'] = []

  for (const day of days) {
    const items = dayItemsFromRaw(raw, day, today)
    const st = computeDayStats(items, 0)
    const capacityMin = capacity[weekdayIndex(day)] ?? 0
    const overloaded = capacityMin > 0 && st.loadMin > capacityMin
    const future = day > today
    if (overloaded) overloadedDays++
    rows.push({ day, planned: st.planned, done: st.done, loadMin: st.loadMin, capacityMin, overloaded, future })
    if (!future) {
      planned += st.planned
      done += st.done
    }
    spentSec += st.spentSec
    for (const i of items) {
      if (i.spentSec > 0) byCat.set(i.categoryId, (byCat.get(i.categoryId) ?? 0) + i.spentSec)
      if (i.unplanned) {
        unplannedCount++
        unplannedSec += i.spentSec
      }
      if (i.status === 'done' && i.estimateMin && i.spentSec > 0) {
        estSec += i.estimateMin * 60
        realSec += i.spentSec
      }
      if (i.kind === 'routine' && i.routineId && (i.status === 'done' || i.status === 'not_done')) {
        const cur = routines.get(i.routineId) ?? { name: i.name, done: 0, total: 0 }
        cur.total++
        if (i.status === 'done') cur.done++
        routines.set(i.routineId, cur)
      }
    }
  }

  return {
    days: rows,
    planned,
    done,
    spentSec,
    byCategory: [...byCat.entries()].map(([categoryId, sec]) => ({ categoryId, sec })).sort((a, b) => b.sec - a.sec),
    accuracy: estSec > 0 ? realSec / estSec : undefined,
    overloadedDays,
    unplanned: { count: unplannedCount, sec: unplannedSec },
    routines: [...routines.entries()].map(([routineId, v]) => ({ routineId, ...v })),
    reserveCount: reserve.length,
  }
}
