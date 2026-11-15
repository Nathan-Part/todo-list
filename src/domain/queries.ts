import type { AppDB } from '../db'
import { parseRoutineEntryId, routineEntryId } from './actions'
import { addDays, daysBetween, diffDays, weekdayIndex } from './dates'
import { isPaused, isRoutineScheduledOn } from './routines'
import { type TimeStats, timeStats } from './insights'
import { type DayItem, computeDayStats, regularity } from './stats'
import type { DayKey, Entry, Pause, Routine, Session, Subtask, Task } from './types'

/*
 * Règle d'écriture des lectures « en direct » (useLiveQuery / liveQuery) :
 * Dexie ne suit les tables lues que tant que l'on enchaîne des `await` sur ses propres requêtes.
 * Après l'`await` d'une autre fonction asynchrone, le suivi est perdu et l'écran ne se met plus à jour.
 * Donc : une fonction de lecture charge tout en un bloc (`fetchRaw`), puis calcule en synchrone.
 */

export interface Raw {
  entries: Entry[]
  /** `routineId|date d'origine` de tous les passages déjà créés : évite d'afficher une occurrence en double. */
  scheduledKeys: Set<string>
  tasks: Map<string, Task>
  routines: Routine[]
  pauses: Pause[]
  sessions: Map<string, Session[]>
  subtasks: Map<string, Subtask[]>
}

export async function fetchRaw(
  d: AppDB,
  opts: { from: DayKey; to: DayKey } | { entries: Entry[] },
): Promise<Raw> {
  const entries =
    'entries' in opts ? opts.entries : await d.entries.where('date').between(opts.from, opts.to, true, true).toArray()
  const scheduled =
    'entries' in opts ? [] : await d.entries.where('scheduledDate').between(opts.from, opts.to, true, true).toArray()
  const routines = await d.routines.toArray()
  const pauses = await d.pauses.toArray()
  const taskIds = [...new Set(entries.map((e) => e.taskId).filter((x): x is string => !!x))]
  const taskList = taskIds.length ? await d.tasks.bulkGet(taskIds) : []
  const sessionList = entries.length
    ? await d.sessions
        .where('entryId')
        .anyOf(entries.map((e) => e.id))
        .toArray()
    : []

  const subtaskList = taskIds.length ? await d.subtasks.where('taskId').anyOf(taskIds).toArray() : []
  const subtasks = new Map<string, Subtask[]>()
  for (const st of subtaskList) {
    const list = subtasks.get(st.taskId)
    if (list) list.push(st)
    else subtasks.set(st.taskId, [st])
  }
  const sessions = new Map<string, Session[]>()
  for (const s of sessionList) {
    const list = sessions.get(s.entryId)
    if (list) list.push(s)
    else sessions.set(s.entryId, [s])
  }
  return {
    entries,
    scheduledKeys: new Set(scheduled.filter((e) => e.routineId).map((e) => `${e.routineId}|${e.scheduledDate}`)),
    tasks: new Map(taskList.filter((t): t is Task => !!t).map((t) => [t.id, t] as const)),
    routines,
    pauses,
    sessions,
    subtasks,
  }
}

function toItem(e: Entry, raw: Raw): DayItem {
  const task = e.taskId ? raw.tasks.get(e.taskId) : undefined
  const routine = e.routineId ? raw.routines.find((r) => r.id === e.routineId) : undefined
  const live = task ?? routine
  const snapped = e.status !== 'todo' && e.nameSnapshot !== undefined
  const own = raw.sessions.get(e.id) ?? []
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
    time: live?.time,
    categoryId: snapped ? e.categoryIdSnapshot : live?.categoryId,
    unplanned: !!e.unplanned,
    spentSec: own.filter((s) => s.running === 0).reduce((n, s) => n + s.durationSec, 0),
    runningSince: running?.startAt,
    hasSessions: own.length > 0,
    taskDeleted: task?.status === 'deleted',
    routineEnd: routine && !routine.archivedAt ? routine.endDate : undefined,
    subtasks: (e.taskId ? (raw.subtasks.get(e.taskId) ?? []) : [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((st) => ({ id: st.id, name: st.name, status: st.status, estimateMin: st.estimateMin })),
    runningSubtaskId: running?.subtaskId,
    subtasksDone: e.taskId ? (raw.subtasks.get(e.taskId) ?? []).filter((s) => s.status === 'done').length : 0,
    subtasksTotal: e.taskId ? (raw.subtasks.get(e.taskId) ?? []).length : 0,
    segments: own
      .filter((s) => s.startAt !== undefined)
      .map((s) => ({ start: s.startAt!, end: s.running === 1 ? undefined : (s.endAt ?? s.startAt! + s.durationSec * 1000) })),
  }
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
    time: r.time,
    categoryId: r.categoryId,
    unplanned: false,
    spentSec: 0,
    hasSessions: false,
    taskDeleted: false,
    routineEnd: r.endDate,
    subtasks: [],
    subtasksDone: 0,
    subtasksTotal: 0,
    segments: [],
  }
}

/** Liste d'un jour, en synchrone. Les occurrences de routines à venir sont calculées, pas stockées. */
export function dayItemsFromRaw(raw: Raw, date: DayKey, today: DayKey): DayItem[] {
  const items = raw.entries.filter((e) => e.date === date).map((e) => toItem(e, raw))
  if (date > today) {
    for (const r of raw.routines) {
      if (!isRoutineScheduledOn(r, date) || isPaused(raw.pauses, r.id, date)) continue
      if (!raw.scheduledKeys.has(`${r.id}|${date}`)) items.push(virtualItem(r, date))
    }
  }
  return items.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

export async function loadDayItems(d: AppDB, date: DayKey, today: DayKey): Promise<DayItem[]> {
  const raw = await fetchRaw(d, { from: date, to: date })
  return dayItemsFromRaw(raw, date, today)
}

/** Un passage par son identifiant, y compris une occurrence virtuelle. */
export async function loadItem(d: AppDB, entryId: string): Promise<DayItem | null> {
  const entry = await d.entries.get(entryId)
  if (entry) {
    const raw = await fetchRaw(d, { entries: [entry] })
    return toItem(entry, raw)
  }
  const p = parseRoutineEntryId(entryId)
  if (!p) return null
  const r = await d.routines.get(p.routineId)
  return r ? virtualItem(r, p.date) : null
}

/** Charge estimée de chaque jour (en minutes), pour la bande semaine. */
export async function loadLoads(d: AppDB, days: DayKey[], today: DayKey): Promise<Record<DayKey, number>> {
  const raw = await fetchRaw(d, { from: days[0], to: days[days.length - 1] })
  const out: Record<DayKey, number> = {}
  for (const day of days) out[day] = computeDayStats(dayItemsFromRaw(raw, day, today), 0).loadMin
  return out
}

export interface ReserveItem {
  task: Task
  postponedCount: number
  /** Jours passés en réserve. */
  ageDays: number
  subtasks: { id: string; name: string; status: 'todo' | 'done'; estimateMin?: number }[]
}

/** Tâches à faire sans jour prévu. Tri : à replanifier, puis échéance, puis ancienneté (RG-24). */
export async function loadReserve(d: AppDB, today: DayKey): Promise<ReserveItem[]> {
  const todos = await d.tasks.where('status').equals('todo').toArray()
  const open = await d.entries.where('status').equals('todo').toArray()
  const history = await d.entries.where('status').anyOf('not_done', 'postponed').toArray()
  const allSubtasks = await d.subtasks.toArray()
  const subsByTask = new Map<string, Subtask[]>()
  for (const st of allSubtasks) subsByTask.set(st.taskId, [...(subsByTask.get(st.taskId) ?? []), st])
  const planned = new Set(open.map((e) => e.taskId).filter((x): x is string => !!x))
  const counts = new Map<string, number>()
  for (const e of history) if (e.taskId) counts.set(e.taskId, (counts.get(e.taskId) ?? 0) + 1)

  return todos
    .filter((t) => !planned.has(t.id))
    .map((task) => ({
      task,
      postponedCount: counts.get(task.id) ?? 0,
      ageDays: task.reserveSince ? Math.max(0, diffDays(today, task.reserveSince)) : 0,
      subtasks: (subsByTask.get(task.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((st) => ({ id: st.id, name: st.name, status: st.status, estimateMin: st.estimateMin })),
    }))
    .sort((a, b) => {
      if (a.task.needsReview !== b.task.needsReview) return a.task.needsReview ? -1 : 1
      // ordre manuel d'abord, puis les tâches jamais rangées selon le tri automatique
      const pa = a.task.reservePosition
      const pb = b.task.reservePosition
      if (pa !== undefined || pb !== undefined) {
        if (pa === undefined) return 1
        if (pb === undefined) return -1
        if (pa !== pb) return pa - pb
      }
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
  /** Durée habituelle, mini, maxi, régularité et tendance sur les 20 dernières fois chronométrées. */
  stats?: TimeStats
}

export async function loadRoutineDetail(d: AppDB, routineId: string, today: DayKey): Promise<RoutineDetail | null> {
  const routine = await d.routines.get(routineId)
  if (!routine) return null
  const entries = await d.entries.where('routineId').equals(routineId).toArray()
  const pauses = await d.pauses.toArray()
  const doneEntries = entries.filter((e) => e.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
  const sessionList = doneEntries.length
    ? await d.sessions
        .where('entryId')
        .anyOf(doneEntries.map((e) => e.id))
        .toArray()
    : []

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
  const secByEntry = new Map<string, number>()
  for (const s of sessionList) secByEntry.set(s.entryId, (secByEntry.get(s.entryId) ?? 0) + s.durationSec)
  const timed: number[] = []
  for (const e of doneEntries) {
    if (timed.length >= 10) break
    const sec = secByEntry.get(e.id) ?? 0
    if (sec > 0) timed.push(sec / 60)
  }
  const avgRealMin = timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : undefined
  const last20 = doneEntries
    .map((e) => (secByEntry.get(e.id) ?? 0) / 60)
    .filter((m) => m > 0)
    .slice(0, 20)
    .reverse()
  const stats = timeStats(last20)
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
    stats,
    suggestedMin,
  }
}
