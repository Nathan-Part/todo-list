import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { DEFAULT_CAPACITY, META, db, getMeta } from '../db'
import { getSleep, subscribeSleep, todayOf } from '../domain/dates'
import { loadDayItems, loadItem, loadLoads, loadReserve } from '../domain/queries'
import type { DayItem } from '../domain/stats'
import type { Category, DayKey } from '../domain/types'

/** Heure courante, rafraîchie à intervalle régulier et au retour au premier plan. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
  return now
}

/** Jour en cours : change avec « Je vais dormir », ou tout seul à 5 h du matin. */
export function useToday(): DayKey {
  const now = useNow(20_000)
  const sleep = useSyncExternalStore(subscribeSleep, getSleep)
  // `sleep` fait partie du calcul : un appui sur « Je vais dormir » change le jour tout de suite
  return useMemo(() => todayOf(Math.max(now, sleep?.at ?? 0)), [now, sleep])
}

export function useDayItems(date: DayKey, today: DayKey): DayItem[] | undefined {
  return useLiveQuery(() => loadDayItems(db, date, today), [date, today])
}

export function useLoads(days: DayKey[], today: DayKey): Record<DayKey, number> {
  const key = days.join(',')
  return useLiveQuery(() => loadLoads(db, days, today), [key, today]) ?? {}
}

export function useReserve(today: DayKey) {
  return useLiveQuery(() => loadReserve(db, today), [today])
}

export function useCapacity(): number[] {
  return useLiveQuery(() => getMeta<number[]>(db, META.capacity, DEFAULT_CAPACITY), []) ?? DEFAULT_CAPACITY
}

export function useCategories() {
  const all = useLiveQuery(() => db.categories.orderBy('position').toArray(), []) ?? []
  return useMemo(() => {
    const active = all.filter((c) => !c.archivedAt)
    const byId = new Map<string, Category>(all.map((c) => [c.id, c]))
    return { active, byId }
  }, [all])
}

/** Chrono en cours, s'il y en a un. */
export function useRunningSession() {
  return useLiveQuery(() => db.sessions.where('running').equals(1).first(), [])
}

/** Chrono en cours avec le passage concerné. */
export function useRunning() {
  return useLiveQuery(async () => {
    const session = await db.sessions.where('running').equals(1).first()
    if (!session) return null
    const item = await loadItem(db, session.entryId)
    return item ? { session, item } : null
  }, [])
}
