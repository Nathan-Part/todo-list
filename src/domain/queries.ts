import type { AppDB } from '../db'
import { parseRoutineEntryId, routineEntryId } from './actions'
import { addDays, daysBetween, diffDays, weekdayIndex } from './dates'
import { isPaused, isRoutineScheduledOn } from './routines'
import { type DayItem, computeDayStats, regularity } from './stats'
import type { DayKey, Entry, Routine, Session, Subtask, Task } from './types'

async function buildItems(d: AppDB, entries: Entry[]): Promise<DayItem[]> {
  if (entries.length === 0) return []
  const taskIds = [...new Set(entries.map((e) => e.taskId).filter((x): x is string => !!x))]
  const tasks = new Map(
    (await d.tasks.bulkGet(taskIds)).filter((t): t is Task => !!t).map((t) => [t.id, t] as const),
  )
  const routines = new Map((await d.routines.toArray()).map((r) => [r.id, r] as const))
  const sessions = await d.sessions
    .where('entryId')
    .anyOf(entries.map((e) => e.id))
    .toArray()
  const byEntry = new Map<string, Session[]>()
  for (const s of sessions) {
    const list = byEntry.get(s.entryId)
    if (list) list.push(s)
    else byEntry.set(s.entryId, [s])
  }

  return entries.map((e) => {
    const task = e.taskId ? tasks.get(e.taskId) : undefined
    const routine = e.routineId ? routines.get(e.routineId) : undefined
    const live = task ?? routine
    const snapped = e.status !== 'todo' && e.nameSnapshot !== undefined
    const own = byEntry.get(e.id) ?? []
    const running = own.find((s) => s.running === 1)
    return {
      id: e.id,
      virtual: false,
      kind: e.kind,
      taskId: e.taskId,
      routineId: e.routineId,
      date: e.date,
      scheduledDate: e.scheduledDate,
      status: e.status,
      movedTo: e.movedTo,
      position: e.position,
      name: (snapped ? e.nameSnapshot : live?.name) ?? e.nameSnapshot ?? 'Sans titre',
      estimateMin: snapped ? e.estimateMinSnapshot : live?.estimateMin,
      categoryId: snapped ? e.categoryIdSnapshot : live?.categoryId,
      unplanned: !!e.unplanned,
      spentSec: own.filter((s) => s.running === 0).reduce((n, s) => n + s.durationSec, 0),
      runningSince: running?.startAt,
      hasSessions: own.length > 0,
      taskDeleted: task?.status === 'deleted',
    } satisfies DayItem
  })
}

function sortItems(items: DayItem[]): DayItem[] {
  return items.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

function virtualItem(r: Routine, date: DayKey): DayItem {
  return {
    id: routineEntryId(r.id, date, date),
    virtual: true,
    kind: 'routine',
    routineId: r.id,
    date,
    scheduledDate: date,
    status: 'todo',
    position: r.position,
    name: r.name,
    estimateMin: r.estimateMin,
    categoryId: r.categoryId,
    unplanned: false,
    spentSec: 0,
    hasSessions: false,
    taskDeleted: false,
  }
}

/** Liste d'un jour. Les occurrences de routines à venir sont calculées, pas stockées. */
export async function loadDayItems(d: AppDB, date: DayKey, today: DayKey): Promise<DayItem[]> {
  const entries = await d.entries.where('date').equals(date).toArray()
  const items = await buildItems(d, entries)
  if (date > today) {
    const routines = await d.routines.toArray()
    const pauses = await d.pauses.toArray()
    for (const r of routines) {
      if (!isRoutineScheduledOn(r, date) || isPaused(pauses, r.id, date)) continue
      const exists = await d.entries.where('[routineId+scheduledDate]').equals([r.id, date]).count()
      if (exists === 0) items.push(virtualItem(r, date))
    }
  }
  return sortItems(items)
}

/** Un passage par son identifiant, y compris une occurrence virtuelle. */
export async function loadItem(d: AppDB, entryId: string): Promise<DayItem | null> {
  const entry = await d.entries.get(entryId)
  if (entry) return (await buildItems(d, [entry]))[0] ?? null
  const p = parseRoutineEntryId(entryId)
  if (!p) return null
  const r = await d.routines.get(p.routineId)
  return r ? virtualItem(r, p.date) : null
}

/** Charge estimée de chaque jour (en minutes), pour la bande semaine. */
export async function loadLoads(d: AppDB, days: DayKey[], today: DayKey): Promise<Record<DayKey, number>> {
  const out: Record<DayKey, number> = {}
  for (const day of days) out[day] = computeDayStats(await loadDayItems(d, day, today), 0).loadMin
  return out
}

export interface ReserveItem {
  task: Task
  postponedCount: number
  /** Jours passés en réserve. */
  ageDays: number
}

/** Tâches à faire sans jour prévu. Tri : à replanifier, puis échéance, puis ancienneté (RG-24). */
export async function loadReserve(d: AppDB, today: DayKey): Promise<ReserveItem[]> {
  const todos = await d.tasks.where('status').equals('todo').toArray()
  const open = await d.entries.where('status').equals('todo').toArray()
  const planned = new Set(open.map((e) => e.taskId).filter((x): x is string => !!x))
  const history = await d.entries.where('status').anyOf('not_done', 'postponed').toArray()
  const counts = new Map<string, number>()
  for (const e of history) if (e.taskId) counts.set(e.taskId, (counts.get(e.taskId) ?? 0) + 1)

  return todos
    .filter((t) => !planned.has(t.id))
    .map((task) => ({
      task,
      postponedCount: counts.get(task.id) ?? 0,
      ageDays: task.reserveSince ? Math.max(0, diffDays(today, task.reserveSince)) : 0,
    }))
    .sort((a, b) => {
      if (a.task.needsReview !== b.task.needsReview) return a.task.needsReview ? -1 : 1
      if (a.task.dueDate !== b.task.dueDate) {
        if (!a.task.dueDate) return 1
        if (!b.task.dueDate) return -1
        return a.task.dueDate.localeCompare(b.task.dueDate)
      }
      return b.ageDays - a.ageDays
    })
}

export interface TaskDetail {
  task: Task
  /** Tous les passages de la tâche, du plus ancien au plus récent. */
  history: Entry[]
  sessions: Session[]
  subtasks: Subtask[]
  openEntry?: Entry
}

export async function loadTaskDetail(d: AppDB, taskId: string): Promise<TaskDetail | null> {
  const task = await d.tasks.get(taskId)
  if (!task) return null
  const history = (await d.entries.where('taskId').equals(taskId).toArray()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  const ids = history.map((e) => e.id)
  const sessions = ids.length
    ? (await d.sessions.where('entryId').anyOf(ids).toArray()).sort(
        (a, b) => (a.startAt ?? 0) - (b.startAt ?? 0) || a.date.localeCompare(b.date),
      )
    : []
  const subtasks = (await d.subtasks.where('taskId').equals(taskId).toArray()).sort(
    (a, b) => a.position - b.position,
  )
  return { task, history, sessions, subtasks, openEntry: history.find((e) => e.status === 'todo') }
}

export type GridState = 'done' | 'not_done' | 'skipped' | 'postponed' | 'todo' | 'pause' | 'none' | 'future'

export interface RoutineDetail {
  routine: Routine
  week: { done: number; total: number }
  month: { done: number; total: number }
  /** 28 jours, alignés sur des semaines du lundi au dimanche. */
  grid: { day: DayKey; state: GridState }[]
  avgRealMin?: number
  /** Suggestion d'ajustement de l'estimation (RG-68). */
  suggestedMin?: number
}

export async function loadRoutineDetail(d: AppDB, routineId: string, today: DayKey): Promise<RoutineDetail | null> {
  const routine = await d.routines.get(routineId)
  if (!routine) return null
  const entries = await d.entries.where('routineId').equals(routineId).toArray()
  const pauses = await d.pauses.toArray()

  const sunday = addDays(today, 6 - weekdayIndex(today)) // dimanche de la semaine courante
  const days = daysBetween(addDays(sunday, -27), sunday)
  const grid = days.map((day) => {
    const e = entries.find((x) => x.date === day && x.status !== 'postponed') ?? entries.find((x) => x.date === day)
    let state: GridState = 'none'
    if (e) state = e.status === 'deleted' ? 'none' : (e.status as GridState)
    else if (day > today) state = isRoutineScheduledOn(routine, day) && !isPaused(pauses, routine.id, day) ? 'future' : 'none'
    else if (isPaused(pauses, routine.id, day)) state = 'pause'
    return { day, state }
  })

  // temps réel moyen sur les 10 dernières réalisations chronométrées
  const doneEntries = entries.filter((e) => e.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
  const timed: number[] = []
  for (const e of doneEntries) {
    if (timed.length >= 10) break
    const ss = await d.sessions.where('entryId').equals(e.id).toArray()
    const sec = ss.reduce((n, s) => n + s.durationSec, 0)
    if (sec > 0) timed.push(sec / 60)
  }
  const avgRealMin = timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : undefined
  let suggestedMin: number | undefined
  if (
    avgRealMin !== undefined &&
    timed.length >= 5 &&
    routine.estimateMin &&
    Math.abs(avgRealMin - routine.estimateMin) / routine.estimateMin > 0.2
  ) {
    suggestedMin = Math.max(5, Math.round(avgRealMin / 5) * 5)
  }

  return {
    routine,
    week: regularity(entries, addDays(today, -6), today),
    month: regularity(entries, addDays(today, -29), today),
    grid,
    avgRealMin,
    suggestedMin,
  }
}
