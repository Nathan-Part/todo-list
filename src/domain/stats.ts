import type { DayKey, EntryStatus } from './types'

/** Une ligne de la liste d'un jour : passage stocké, ou occurrence de routine à venir (virtuelle). */
export interface DayItem {
  id: string
  virtual: boolean
  kind: 'task' | 'routine'
  taskId?: string
  routineId?: string
  date: DayKey
  scheduledDate?: DayKey
  status: EntryStatus
  movedTo?: DayKey | 'reserve'
  position: number
  name: string
  estimateMin?: number
  categoryId?: string
  unplanned: boolean
  /** Somme des sessions terminées, en secondes. */
  spentSec: number
  /** Heure de départ du chrono en cours (ms), s'il tourne sur ce passage. */
  runningSince?: number
  hasSessions: boolean
  taskDeleted: boolean
  /** Date de fin de la routine, s'il y en a une. */
  routineEnd?: DayKey
  subtasksDone: number
  subtasksTotal: number
  /** Intervalles chronométrés [début, fin] en ms (fin absente = en cours), pour la frise. */
  segments: { start: number; end?: number }[]
}

export interface DayStats {
  /** Éléments prévus (hors imprévus, reportés, sautés). */
  planned: number
  done: number
  /** Charge : somme des durées estimées des éléments prévus (RG-71). */
  loadMin: number
  /** Reste estimé : estimation moins temps déjà passé, par élément à faire. */
  remainingMin: number
  spentSec: number
  noEstimate: number
  postponed: number
}

export function isPlanned(i: Pick<DayItem, 'unplanned' | 'status'>): boolean {
  return !i.unplanned && (i.status === 'todo' || i.status === 'done' || i.status === 'not_done')
}

export function liveSpentSec(i: DayItem, nowMs: number): number {
  return i.spentSec + (i.runningSince ? Math.max(0, (nowMs - i.runningSince) / 1000) : 0)
}

export function computeDayStats(items: DayItem[], nowMs: number): DayStats {
  const s: DayStats = {
    planned: 0,
    done: 0,
    loadMin: 0,
    remainingMin: 0,
    spentSec: 0,
    noEstimate: 0,
    postponed: 0,
  }
  for (const i of items) {
    const spent = liveSpentSec(i, nowMs)
    s.spentSec += spent
    if (i.status === 'postponed') {
      s.postponed++
      continue
    }
    if (!isPlanned(i)) continue
    s.planned++
    if (i.status === 'done') s.done++
    s.loadMin += i.estimateMin ?? 0
    if (i.status === 'todo') {
      if (i.estimateMin == null) s.noEstimate++
      else s.remainingMin += Math.max(0, i.estimateMin - spent / 60)
    }
  }
  return s
}

/** Régularité d'une routine : faites / (faites + non faites) ; sautées, reportées et pauses sont neutres. */
export function regularity(
  entries: { date: DayKey; status: EntryStatus }[],
  from: DayKey,
  to: DayKey,
): { done: number; total: number } {
  let done = 0
  let notDone = 0
  for (const e of entries) {
    if (e.date < from || e.date > to) continue
    if (e.status === 'done') done++
    else if (e.status === 'not_done') notDone++
  }
  return { done, total: done + notDone }
}
