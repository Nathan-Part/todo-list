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
  /** Heure prévue « HH:MM ». */
  time?: string
  categoryId?: string
  /** À faire sur place (pas faisable partout). */
  onSite?: boolean
  unplanned: boolean
  /** Somme des sessions terminées, en secondes. */
  spentSec: number
  /** Tâche : temps passé dessus les autres jours (passages précédents ou suivants), en secondes. */
  otherDaysSec?: number
  /** Heure de départ du chrono en cours (ms), s'il tourne sur ce passage. */
  runningSince?: number
  hasSessions: boolean
  taskDeleted: boolean
  /** Date de fin de la routine, s'il y en a une. */
  routineEnd?: DayKey
  subtasksDone: number
  /** Étapes (sous-tâches d'une tâche ou étapes d'une routine), dans l'ordre, avec leur temps chronométré terminé. */
  subtasks: {
    id: string
    name: string
    status: 'todo' | 'done'
    estimateMin?: number
    spentSec?: number
    doneDate?: DayKey
    /** Faite en cochant la tâche entière. */
    withTask?: boolean
  }[]
  /** Routine facultative. */
  optional?: boolean
  /** Étape dont le chrono tourne. */
  runningSubtaskId?: string
  subtasksTotal: number
  /** Intervalles chronométrés [début, fin] en ms (fin absente = en cours), pour la frise. */
  segments: { id: string; start: number; end?: number; subtaskId?: string }[]
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

/** Temps passé sur une étape, chrono en cours compris. */
export function liveStepSec(i: DayItem, stepId: string, nowMs: number): number {
  const st = i.subtasks.find((x) => x.id === stepId)
  const base = st?.spentSec ?? 0
  return base + (i.runningSince && i.runningSubtaskId === stepId ? Math.max(0, (nowMs - i.runningSince) / 1000) : 0)
}

/** Étape sur laquelle porte le chrono : celle qui tourne, sinon la prochaine à faire. */
export function currentStep(i: DayItem): DayItem['subtasks'][number] | undefined {
  if (i.runningSince !== undefined) return i.runningSubtaskId ? i.subtasks.find((x) => x.id === i.runningSubtaskId) : undefined
  return i.subtasks.find((x) => x.status === 'todo')
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
