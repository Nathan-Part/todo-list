import { type AppDB, newId } from '../db'
import { addDays, dayKeyOf } from './dates'
import { isPaused, isRoutineScheduledOn } from './routines'
import type { Category, DayKey, Entry, Frequency, Pause, Routine, Session, Task } from './types'

/* ------------------------------------------------------------------ */
/* Identifiants déterministes : empêchent les doublons (RG-100/101)    */
/* ------------------------------------------------------------------ */

export const taskEntryId = (taskId: string, date: DayKey) => `t:${taskId}:${date}`
export const routineEntryId = (routineId: string, scheduledDate: DayKey, date: DayKey) =>
  `r:${routineId}:${scheduledDate}:${date}`

export function parseRoutineEntryId(id: string) {
  const [kind, routineId, scheduledDate, date] = id.split(':')
  if (kind !== 'r' || !routineId || !scheduledDate || !date) return null
  return { routineId, scheduledDate, date }
}

type Named = { name: string; estimateMin?: number; categoryId?: string }

function snap(src?: Named) {
  return src
    ? { nameSnapshot: src.name, estimateMinSnapshot: src.estimateMin, categoryIdSnapshot: src.categoryId }
    : {}
}

/** Toutes les opérations multi-enregistrements passent par une transaction (RG-102). */
function tx<T>(d: AppDB, fn: () => Promise<T>): Promise<T> {
  return d.transaction('rw', d.tables, fn)
}

/* ------------------------------------------------------------------ */
/* Briques internes                                                    */
/* ------------------------------------------------------------------ */

async function nextPosition(d: AppDB, date: DayKey): Promise<number> {
  const entries = await d.entries.where('date').equals(date).toArray()
  return entries.reduce((m, e) => Math.max(m, e.position), 0) + 1000
}

/** Crée (ou rouvre) le passage d'une tâche sur un jour. */
async function ensureTaskEntry(d: AppDB, task: Task, date: DayKey): Promise<Entry> {
  const id = taskEntryId(task.id, date)
  const existing = await d.entries.get(id)
  if (existing) {
    if (existing.status !== 'todo') {
      await d.entries.update(id, {
        status: 'todo',
        movedTo: undefined,
        closedAt: undefined,
        doneAt: undefined,
      })
    }
    return (await d.entries.get(id))!
  }
  const entry: Entry = {
    id,
    kind: 'task',
    taskId: task.id,
    date,
    status: 'todo',
    position: await nextPosition(d, date),
    unplanned: task.isUnplanned || undefined,
  }
  await d.entries.add(entry)
  return entry
}

/** Matérialise l'occurrence (virtuelle) d'une routine pour un jour. */
export async function ensureRoutineEntry(d: AppDB, routineId: string, date: DayKey): Promise<Entry | undefined> {
  const id = routineEntryId(routineId, date, date)
  const existing = await d.entries.get(id)
  if (existing) return existing
  const r = await d.routines.get(routineId)
  if (!r) return undefined
  const entry: Entry = {
    id,
    kind: 'routine',
    routineId,
    date,
    scheduledDate: date,
    status: 'todo',
    position: r.position,
  }
  await d.entries.add(entry)
  return entry
}

async function closeSession(d: AppDB, s: Session, nowMs: number) {
  const durationSec = Math.max(0, Math.round((nowMs - (s.startAt ?? nowMs)) / 1000))
  await d.sessions.update(s.id, { endAt: nowMs, durationSec, running: 0 })
}

async function hasSessions(d: AppDB, entryId: string) {
  return (await d.sessions.where('entryId').equals(entryId).count()) > 0
}

/* ------------------------------------------------------------------ */
/* Tâches ponctuelles                                                  */
/* ------------------------------------------------------------------ */

export interface NewTask {
  name: string
  estimateMin?: number
  categoryId?: string
  dueDate?: DayKey
  time?: string
  note?: string
  /** Jour prévu, ou « reserve » (RG-11). */
  plan: DayKey | 'reserve'
}

export function addTask(d: AppDB, input: NewTask, nowMs: number): Promise<string> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const task: Task = {
      id: newId(),
      name: input.name.trim(),
      categoryId: input.categoryId,
      estimateMin: input.estimateMin,
      dueDate: input.dueDate,
      time: input.time || undefined,
      note: input.note?.trim() || undefined,
      status: 'todo',
      needsReview: false,
      isUnplanned: false,
      createdAt: nowMs,
    }
    if (input.plan === 'reserve') task.reserveSince = today
    await d.tasks.add(task)
    if (input.plan !== 'reserve') await ensureTaskEntry(d, task, input.plan)
    return task.id
  })
}

export type TaskChanges = Partial<
  Pick<Task, 'name' | 'categoryId' | 'estimateMin' | 'dueDate' | 'note' | 'time'>
>

export async function updateTask(d: AppDB, taskId: string, changes: TaskChanges) {
  await d.tasks.update(taskId, changes)
}

/** Enregistre après coup une tâche non prévue déjà faite (RG-17). */
export function addUnplanned(
  d: AppDB,
  input: { name: string; durationMin: number; categoryId?: string; startAt?: number; endAt?: number },
  nowMs: number,
): Promise<string> {
  return tx(d, async () => {
    // avec des heures précises, l'imprévu est rangé sur le jour où il a eu lieu
    const today = dayKeyOf(input.startAt ?? nowMs)
    const task: Task = {
      id: newId(),
      name: input.name.trim(),
      categoryId: input.categoryId,
      status: 'done',
      needsReview: false,
      isUnplanned: true,
      doneDate: today,
      createdAt: nowMs,
      doneAt: nowMs,
    }
    await d.tasks.add(task)
    const entryId = taskEntryId(task.id, today)
    await d.entries.add({
      id: entryId,
      kind: 'task',
      taskId: task.id,
      date: today,
      status: 'done',
      position: await nextPosition(d, today),
      unplanned: true,
      doneAt: nowMs,
      closedAt: nowMs,
      ...snap(task),
    })
    if (input.durationMin > 0) {
      await d.sessions.add({
        id: newId(),
        entryId,
        date: today,
        startAt: input.startAt,
        endAt: input.endAt,
        durationSec: Math.round(input.durationMin * 60),
        source: 'manual',
        running: 0,
      })
    }
    return task.id
  })
}

/**
 * Termine un passage. Une tâche cochée est « faite aujourd'hui », d'où qu'on la coche (RG-14).
 */
export function completeEntry(d: AppDB, entryId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const entry = await d.entries.get(entryId)
    if (!entry || entry.status !== 'todo') return

    const running = await d.sessions.where('running').equals(1).first()
    if (running && running.entryId === entryId) await closeSession(d, running, nowMs) // RG-64

    if (entry.kind === 'routine') {
      const r = await d.routines.get(entry.routineId!)
      await d.entries.update(entry.id, { status: 'done', doneAt: nowMs, closedAt: nowMs, ...snap(r) })
      return
    }

    const task = await d.tasks.get(entry.taskId!)
    if (!task) return
    let target = entry
    if (entry.date > today) {
      // prévue un jour futur : le jour réel est aujourd'hui, sans trace sur le jour futur
      await d.entries.delete(entry.id)
      target = await ensureTaskEntry(d, task, today)
    }
    await d.entries.update(target.id, {
      status: 'done',
      doneAt: nowMs,
      closedAt: nowMs,
      movedTo: undefined,
      ...snap(task),
    })
    await d.tasks.update(task.id, {
      status: 'done',
      doneDate: today,
      doneAt: nowMs,
      needsReview: false,
      reserveSince: undefined,
    })
    await d.subtasks
      .where('taskId')
      .equals(task.id)
      .filter((s) => s.status === 'todo')
      .modify({ status: 'done', doneDate: today, doneAt: nowMs })
  })
}

/** Coche une tâche, qu'elle soit planifiée ou en réserve. */
export function completeTask(d: AppDB, taskId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const task = await d.tasks.get(taskId)
    if (!task || task.status !== 'todo') return
    const open = await d.entries.where('[taskId+status]').equals([taskId, 'todo']).first()
    const entry = open ?? (await ensureTaskEntry(d, task, dayKeyOf(nowMs)))
    await completeEntry(d, entry.id, nowMs)
  })
}

/** Rouvre un passage terminé (RG-15). */
export function reopenEntry(d: AppDB, entryId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const e = await d.entries.get(entryId)
    if (!e || e.status !== 'done') return
    // le temps indiqué en cochant (« de… à… ») est retiré : il sera redemandé à la prochaine validation.
    // Le temps du chrono, lui, est du vrai travail : on le garde.
    await d.sessions
      .where('entryId')
      .equals(e.id)
      .filter((s) => s.source === 'quick')
      .delete()
    if (e.kind === 'routine') {
      await d.entries.update(e.id, {
        status: e.date >= today ? 'todo' : 'not_done',
        doneAt: undefined,
        closedAt: e.date >= today ? undefined : nowMs,
      })
      return
    }
    const task = await d.tasks.get(e.taskId!)
    if (!task) return
    if (e.date === today) {
      await d.entries.update(e.id, { status: 'todo', doneAt: undefined, closedAt: undefined })
      await d.tasks.update(task.id, { status: 'todo', doneDate: undefined, doneAt: undefined })
    } else {
      // rouverte plus tard : retour en réserve, l'historique du jour d'origine est conservé
      await d.tasks.update(task.id, {
        status: 'todo',
        doneDate: undefined,
        doneAt: undefined,
        reserveSince: today,
        needsReview: false,
      })
    }
  })
}

/** Correction d'un jour passé : « fait ce jour-là » (RG-83). */
export function markDoneOnDay(d: AppDB, entryId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const e = await d.entries.get(entryId)
    if (!e || (e.status !== 'not_done' && e.status !== 'todo')) return
    if (e.kind === 'routine') {
      const r = await d.routines.get(e.routineId!)
      await d.entries.update(e.id, { status: 'done', doneAt: nowMs, closedAt: nowMs, ...snap(r) })
      return
    }
    const task = await d.tasks.get(e.taskId!)
    if (!task) return
    // la tâche n'est plus à faire : on retire ses passages ouverts
    const open = await d.entries.where('[taskId+status]').equals([task.id, 'todo']).toArray()
    for (const o of open) if (o.id !== e.id) await d.entries.delete(o.id)
    await d.entries.update(e.id, { status: 'done', doneAt: nowMs, closedAt: nowMs, ...snap(task) })
    await d.tasks.update(task.id, {
      status: 'done',
      doneDate: e.date,
      doneAt: nowMs,
      needsReview: false,
      reserveSince: undefined,
    })
  })
}

/**
 * Report manuel d'un passage (RG-13 pour les tâches, RG-35 pour les routines).
 */
export function postponeEntry(
  d: AppDB,
  entryId: string,
  target: DayKey | 'reserve',
  nowMs: number,
): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const entry = await d.entries.get(entryId)
    if (!entry || entry.status !== 'todo') return
    if (target !== 'reserve' && target < today) throw new Error('Impossible de planifier dans le passé')
    if (target === entry.date) return

    if (entry.kind === 'task') {
      const task = await d.tasks.get(entry.taskId!)
      if (!task || task.status !== 'todo') return
      if (entry.date > today) {
        // simple changement de date, sans trace sur le jour futur
        await d.entries.delete(entry.id)
        await d.entries
          .where('taskId')
          .equals(task.id)
          .filter((e) => e.status === 'postponed' && e.movedTo === entry.date)
          .modify({ movedTo: target })
      } else {
        await d.entries.update(entry.id, {
          status: 'postponed',
          movedTo: target,
          closedAt: nowMs,
          ...snap(task),
        })
      }
      if (target === 'reserve') {
        await d.tasks.update(task.id, { reserveSince: today, needsReview: false })
      } else {
        await ensureTaskEntry(d, task, target)
        await d.tasks.update(task.id, { reserveSince: undefined, needsReview: false })
      }
      return
    }

    // routine : on ne va jamais en réserve, et jamais vers un jour qui a déjà son occurrence
    if (target === 'reserve') throw new Error('Une routine ne va pas en réserve')
    const routine = await d.routines.get(entry.routineId!)
    if (!routine) return
    const pauses = await d.pauses.toArray()
    const occupied =
      (await d.entries
        .where('routineId')
        .equals(routine.id)
        .filter((e) => e.date === target && e.status !== 'postponed')
        .count()) > 0 ||
      (isRoutineScheduledOn(routine, target) && !isPaused(pauses, routine.id, target))
    if (occupied) throw new Error('Cette routine a déjà une occurrence ce jour-là')

    await d.entries.update(entry.id, { status: 'postponed', movedTo: target, closedAt: nowMs, ...snap(routine) })
    const scheduledDate = entry.scheduledDate ?? entry.date
    const id = routineEntryId(routine.id, scheduledDate, target)
    const existing = await d.entries.get(id)
    if (existing) {
      await d.entries.update(id, { status: 'todo', movedTo: undefined, closedAt: undefined })
    } else {
      await d.entries.add({
        id,
        kind: 'routine',
        routineId: routine.id,
        date: target,
        scheduledDate,
        status: 'todo',
        position: routine.position,
      })
    }
  })
}

/** Replanifie une tâche (en réserve ou déjà planifiée) sur un jour, ou la renvoie en réserve. */
export function planTask(d: AppDB, taskId: string, target: DayKey | 'reserve', nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const open = await d.entries.where('[taskId+status]').equals([taskId, 'todo']).first()
    if (open) return postponeEntry(d, open.id, target, nowMs)
    const task = await d.tasks.get(taskId)
    if (!task || task.status !== 'todo') return
    if (target === 'reserve') {
      await d.tasks.update(taskId, { needsReview: false, reserveSince: task.reserveSince ?? today })
      return
    }
    if (target < today) throw new Error('Impossible de planifier dans le passé')
    await ensureTaskEntry(d, task, target)
    await d.tasks.update(taskId, { needsReview: false, reserveSince: undefined })
  })
}

/** Saute une occurrence de routine (RG-36). */
export function skipEntry(d: AppDB, entryId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    let entry = await d.entries.get(entryId)
    if (!entry) {
      const p = parseRoutineEntryId(entryId)
      if (p) entry = await ensureRoutineEntry(d, p.routineId, p.date)
    }
    if (!entry || entry.kind !== 'routine' || entry.status !== 'todo') return
    const r = await d.routines.get(entry.routineId!)
    await d.entries.update(entry.id, { status: 'skipped', closedAt: nowMs, ...snap(r) })
  })
}

/** Annule le saut d'une occurrence : à faire si le jour n'est pas passé, sinon « non faite ». */
export function unskipEntry(d: AppDB, entryId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const e = await d.entries.get(entryId)
    if (!e || e.status !== 'skipped') return
    const today = dayKeyOf(nowMs)
    await d.entries.update(e.id, e.date >= today ? { status: 'todo', closedAt: undefined } : { status: 'not_done', closedAt: nowMs })
  })
}

export interface TaskSnapshot {
  task: Task
  entries: Entry[]
  sessions: Session[]
  subtasks: import('./types').Subtask[]
}

/** Copie complète d'une tâche, pour pouvoir annuler sa suppression. */
export async function snapshotTask(d: AppDB, taskId: string): Promise<TaskSnapshot | null> {
  const task = await d.tasks.get(taskId)
  if (!task) return null
  const entries = await d.entries.where('taskId').equals(taskId).toArray()
  const sessions = entries.length ? await d.sessions.where('entryId').anyOf(entries.map((e) => e.id)).toArray() : []
  const subtasks = await d.subtasks.where('taskId').equals(taskId).toArray()
  return { task, entries, sessions, subtasks }
}

export function restoreTask(d: AppDB, snap: TaskSnapshot): Promise<void> {
  return tx(d, async () => {
    await d.tasks.put(snap.task)
    await d.entries.bulkPut(snap.entries)
    await d.sessions.bulkPut(snap.sessions.map((s) => ({ ...s, running: 0 as const })))
    await d.subtasks.bulkPut(snap.subtasks)
  })
}

/** Récupère une tâche supprimée dont l'historique avait été gardé : elle revient à faire. */
export function undeleteTask(d: AppDB, taskId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const task = await d.tasks.get(taskId)
    if (!task || task.status !== 'deleted') return
    const deleted = (await d.entries.where('taskId').equals(taskId).toArray())
      .filter((e) => e.status === 'deleted')
      .sort((a, b) => b.date.localeCompare(a.date))
    const current = deleted.find((e) => e.date >= today)
    for (const e of deleted) {
      if (e === current) await d.entries.update(e.id, { status: 'todo', closedAt: undefined })
      else await d.entries.update(e.id, { status: 'not_done' })
    }
    await d.tasks.update(taskId, {
      status: 'todo',
      deletedAt: undefined,
      needsReview: false,
      reserveSince: current ? undefined : today,
    })
  })
}

/** Supprime une tâche et tout ce qui la concerne (passages, temps, étapes). Annulable via snapshotTask/restoreTask. */
export function deleteTask(d: AppDB, taskId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const running = await d.sessions.where('running').equals(1).first()
    const entries = await d.entries.where('taskId').equals(taskId).toArray()
    if (running && entries.some((e) => e.id === running.entryId)) await closeSession(d, running, nowMs)
    if (entries.length) await d.sessions.where('entryId').anyOf(entries.map((e) => e.id)).delete()
    await d.entries.where('taskId').equals(taskId).delete()
    await d.subtasks.where('taskId').equals(taskId).delete()
    await d.tasks.delete(taskId)
  })
}

/* ------------------------------------------------------------------ */
/* Ordre manuel                                                        */
/* ------------------------------------------------------------------ */

export function reorderDay(d: AppDB, date: DayKey, orderedIds: string[]): Promise<void> {
  return tx(d, async () => {
    let pos = 1000
    for (const id of orderedIds) {
      let e = await d.entries.get(id)
      if (!e) {
        const p = parseRoutineEntryId(id)
        if (p) e = await ensureRoutineEntry(d, p.routineId, p.date)
      }
      if (!e || e.date !== date) continue
      await d.entries.update(e.id, { position: pos })
      // une routine garde d'un jour à l'autre la place donnée en dernier (RG-41)
      if (e.kind === 'routine' && e.status === 'todo') await d.routines.update(e.routineId!, { position: pos })
      pos += 1000
    }
  })
}

/** Ordre manuel des tâches de la réserve. */
export function reorderReserve(d: AppDB, orderedTaskIds: string[]): Promise<void> {
  return tx(d, async () => {
    let pos = 1000
    for (const id of orderedTaskIds) {
      await d.tasks.update(id, { reservePosition: pos })
      pos += 1000
    }
  })
}

/* ------------------------------------------------------------------ */
/* Chrono et temps réel                                                */
/* ------------------------------------------------------------------ */

/**
 * Lance le chrono ; en lancer un autre met le précédent en pause (RG-61).
 * Sur une tâche découpée, le chrono porte sur une sous-tâche : la première à faire par défaut (RG-53).
 */
export function startTimer(d: AppDB, entryId: string, nowMs: number, subtaskId?: string): Promise<void> {
  return tx(d, async () => {
    const e = await d.entries.get(entryId)
    if (!e || e.status !== 'todo') return
    let sub = subtaskId
    if (!sub && e.taskId) {
      const subs = (await d.subtasks.where('taskId').equals(e.taskId).toArray())
        .filter((s) => s.status === 'todo')
        .sort((a, b) => a.position - b.position)
      sub = subs[0]?.id
    }
    const running = await d.sessions.where('running').equals(1).first()
    if (running) {
      if (running.entryId === entryId && running.subtaskId === sub) return
      await closeSession(d, running, nowMs)
    }
    await d.sessions.add({
      id: newId(),
      entryId,
      subtaskId: sub,
      date: e.date,
      startAt: nowMs,
      durationSec: 0,
      source: 'timer',
      running: 1,
    })
  })
}

/** Met le chrono en pause : la session se termine (RG-62). */
export function pauseTimer(d: AppDB, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const running = await d.sessions.where('running').equals(1).first()
    if (running) await closeSession(d, running, nowMs)
  })
}

/** Chrono oublié : on l'arrête à l'heure indiquée (RG-67). */
export function stopTimerAt(d: AppDB, endMs: number): Promise<void> {
  return tx(d, async () => {
    const running = await d.sessions.where('running').equals(1).first()
    if (!running) return
    await closeSession(d, running, Math.max(running.startAt ?? endMs, endMs))
  })
}

export function addSession(
  d: AppDB,
  entryId: string,
  input: { durationSec: number; startAt?: number; endAt?: number },
  source: 'manual' | 'quick',
): Promise<void> {
  return tx(d, async () => {
    const e = await d.entries.get(entryId)
    if (!e) return
    await d.sessions.add({
      id: newId(),
      entryId,
      date: e.date,
      startAt: input.startAt,
      endAt: input.endAt,
      durationSec: Math.max(0, Math.round(input.durationSec)),
      source,
      running: 0,
    })
  })
}

export async function updateSession(d: AppDB, id: string, changes: Partial<Pick<Session, 'durationSec' | 'startAt' | 'endAt'>>) {
  await d.sessions.update(id, changes)
}

export async function deleteSession(d: AppDB, id: string) {
  await d.sessions.delete(id)
}

/* ------------------------------------------------------------------ */
/* Sous-tâches (RG-50 à RG-55)                                         */
/* ------------------------------------------------------------------ */

/** La durée d'une tâche découpée est la somme de celles de ses sous-tâches (RG-52). */
async function syncTaskEstimate(d: AppDB, taskId: string) {
  const subs = await d.subtasks.where('taskId').equals(taskId).toArray()
  if (subs.length === 0) return
  const withEstimate = subs.filter((s) => s.estimateMin)
  await d.tasks.update(taskId, {
    estimateMin: withEstimate.length ? withEstimate.reduce((n, s) => n + (s.estimateMin ?? 0), 0) : undefined,
  })
}

export function addSubtask(
  d: AppDB,
  taskId: string,
  input: { name: string; estimateMin?: number },
): Promise<string> {
  return tx(d, async () => {
    const subs = await d.subtasks.where('taskId').equals(taskId).toArray()
    const id = newId()
    await d.subtasks.add({
      id,
      taskId,
      name: input.name.trim(),
      estimateMin: input.estimateMin,
      status: 'todo',
      position: subs.reduce((m, s) => Math.max(m, s.position), 0) + 1000,
    })
    await syncTaskEstimate(d, taskId)
    // une sous-tâche ajoutée à une tâche faite la rouvre
    const task = await d.tasks.get(taskId)
    if (task?.status === 'done') {
      const done = (await d.entries.where('taskId').equals(taskId).toArray()).find((e) => e.status === 'done')
      if (done) await reopenEntry(d, done.id, Date.now())
    }
    return id
  })
}

export function updateSubtask(d: AppDB, id: string, changes: { name?: string; estimateMin?: number }): Promise<void> {
  return tx(d, async () => {
    const sub = await d.subtasks.get(id)
    if (!sub) return
    await d.subtasks.update(id, changes)
    await syncTaskEstimate(d, sub.taskId)
  })
}

/** Ordre des étapes d'une tâche. */
export function reorderSubtasks(d: AppDB, orderedIds: string[]): Promise<void> {
  return tx(d, async () => {
    let pos = 1000
    for (const id of orderedIds) {
      await d.subtasks.update(id, { position: pos })
      pos += 1000
    }
  })
}

/** Le temps déjà passé sur une sous-tâche supprimée reste compté sur la tâche. */
export function deleteSubtask(d: AppDB, id: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const sub = await d.subtasks.get(id)
    if (!sub) return
    const running = await d.sessions.where('running').equals(1).first()
    if (running?.subtaskId === id) await closeSession(d, running, nowMs)
    await d.subtasks.delete(id)
    const left = await d.subtasks.where('taskId').equals(sub.taskId).count()
    if (left > 0) await syncTaskEstimate(d, sub.taskId)
  })
}

/**
 * Coche ou décoche une sous-tâche. La dernière cochée termine la tâche (RG-54).
 * Retourne true si la tâche vient d'être terminée.
 */
export function toggleSubtask(d: AppDB, id: string, nowMs: number): Promise<boolean> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const sub = await d.subtasks.get(id)
    if (!sub) return false
    const running = await d.sessions.where('running').equals(1).first()
    if (sub.status === 'todo') {
      if (running?.subtaskId === id) await closeSession(d, running, nowMs)
      await d.subtasks.update(id, { status: 'done', doneDate: today, doneAt: nowMs })
      const subs = await d.subtasks.where('taskId').equals(sub.taskId).toArray()
      if (subs.every((s) => s.status === 'done')) {
        const task = await d.tasks.get(sub.taskId)
        if (task?.status === 'todo') {
          await completeTask(d, sub.taskId, nowMs)
          return true
        }
      }
      return false
    }
    await d.subtasks.update(id, { status: 'todo', doneDate: undefined, doneAt: undefined })
    const task = await d.tasks.get(sub.taskId)
    if (task?.status === 'done') {
      const done = (await d.entries.where('taskId').equals(sub.taskId).toArray()).find((e) => e.status === 'done')
      if (done) await reopenEntry(d, done.id, nowMs)
    }
    return false
  })
}

/* ------------------------------------------------------------------ */
/* Routines                                                            */
/* ------------------------------------------------------------------ */

export interface RoutineInput {
  name: string
  frequency: Frequency
  startDate?: DayKey
  endDate?: DayKey
  estimateMin?: number
  categoryId?: string
  note?: string
  time?: string
}

/**
 * Génère les occurrences des routines pour les jours de `from` à `to`.
 * Les jours passés (absence) reçoivent directement l'issue « non faite ».
 * Une occurrence n'est créée que s'il n'existe aucun passage pour (routine, date d'origine).
 */
export async function generateOccurrences(
  d: AppDB,
  from: DayKey,
  to: DayKey,
  today: DayKey,
  nowMs: number,
): Promise<void> {
  const routines = await d.routines.toArray()
  const pauses = await d.pauses.toArray()
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (const r of routines) {
      if (!isRoutineScheduledOn(r, day) || isPaused(pauses, r.id, day)) continue
      const already = await d.entries.where('[routineId+scheduledDate]').equals([r.id, day]).count()
      if (already > 0) continue
      const past = day < today
      await d.entries.add({
        id: routineEntryId(r.id, day, day),
        kind: 'routine',
        routineId: r.id,
        date: day,
        scheduledDate: day,
        status: past ? 'not_done' : 'todo',
        position: r.position,
        ...(past ? { closedAt: nowMs, ...snap(r) } : {}),
      })
    }
  }
}

export function createRoutine(d: AppDB, input: RoutineInput, nowMs: number): Promise<string> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const all = await d.routines.toArray()
    const routine: Routine = {
      id: newId(),
      name: input.name.trim(),
      categoryId: input.categoryId,
      estimateMin: input.estimateMin,
      time: input.time || undefined,
      note: input.note?.trim() || undefined,
      frequency: input.frequency,
      startDate: input.startDate ?? today,
      endDate: input.endDate,
      position: all.reduce((m, r) => Math.max(m, r.position), 0) + 1000,
      createdAt: nowMs,
    }
    await d.routines.add(routine)
    await generateOccurrences(d, today, today, today, nowMs)
    return routine.id
  })
}

export type RoutineChanges = Partial<
  Pick<Routine, 'name' | 'categoryId' | 'estimateMin' | 'note' | 'frequency' | 'endDate' | 'time'>
>

/** Une modification s'applique à partir d'aujourd'hui ; le passé ne change jamais (RG-38). */
export function updateRoutine(d: AppDB, id: string, changes: RoutineChanges, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    await d.routines.update(id, changes)
    const r = await d.routines.get(id)
    if (!r) return
    const stale = await d.entries
      .where('routineId')
      .equals(id)
      .filter((e) => e.status === 'todo' && e.date >= today && e.scheduledDate === e.date)
      .toArray()
    for (const e of stale) {
      if (!isRoutineScheduledOn(r, e.date) && !(await hasSessions(d, e.id))) await d.entries.delete(e.id)
    }
    await generateOccurrences(d, today, today, today, nowMs)
  })
}

export interface RoutineSnapshot {
  routine: Routine
  entries: Entry[]
  sessions: Session[]
  pauses: Pause[]
}

/** Copie complète d'une routine (occurrences, temps, pauses), pour annuler une suppression. */
export async function snapshotRoutine(d: AppDB, id: string): Promise<RoutineSnapshot | null> {
  const routine = await d.routines.get(id)
  if (!routine) return null
  const entries = await d.entries.where('routineId').equals(id).toArray()
  const sessions = entries.length ? await d.sessions.where('entryId').anyOf(entries.map((e) => e.id)).toArray() : []
  const pauses = await d.pauses.where('routineId').equals(id).toArray()
  return { routine, entries, sessions, pauses }
}

export function restoreRoutine(d: AppDB, snap: RoutineSnapshot): Promise<void> {
  return tx(d, async () => {
    await d.routines.put(snap.routine)
    await d.entries.bulkPut(snap.entries)
    await d.sessions.bulkPut(snap.sessions.map((s) => ({ ...s, running: 0 as const })))
    await d.pauses.bulkPut(snap.pauses)
  })
}

/** Supprime définitivement une routine et tout son historique. */
export function deleteRoutine(d: AppDB, id: string): Promise<void> {
  return tx(d, async () => {
    const entries = await d.entries.where('routineId').equals(id).toArray()
    if (entries.length) await d.sessions.where('entryId').anyOf(entries.map((e) => e.id)).delete()
    await d.entries.where('routineId').equals(id).delete()
    await d.pauses.where('routineId').equals(id).delete()
    await d.routines.delete(id)
  })
}

/** Réactive une routine archivée : elle revient à partir d'aujourd'hui. */
export function unarchiveRoutine(d: AppDB, id: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    await d.routines.update(id, { archivedAt: undefined, endDate: undefined })
    await generateOccurrences(d, today, today, today, nowMs)
  })
}

/**
 * Ordre des routines. Il sert d'ordre par défaut pour leurs occurrences ;
 * on l'applique aussi aux occurrences encore à faire à partir d'aujourd'hui.
 */
export function reorderRoutines(d: AppDB, orderedIds: string[], nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    let pos = 1000
    for (const id of orderedIds) {
      await d.routines.update(id, { position: pos })
      await d.entries
        .where('routineId')
        .equals(id)
        .filter((e) => e.status === 'todo' && e.date >= today)
        .modify({ position: pos })
      pos += 1000
    }
  })
}

/** Archive la routine : plus aucune occurrence, historique conservé (RG-39). */
export function archiveRoutine(d: AppDB, id: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    await d.routines.update(id, { archivedAt: nowMs, endDate: addDays(today, -1) })
    const open = await d.entries
      .where('routineId')
      .equals(id)
      .filter((e) => e.date >= today && (e.status === 'todo' || e.status === 'skipped' || e.status === 'postponed'))
      .toArray()
    for (const e of open) if (!(await hasSessions(d, e.id))) await d.entries.delete(e.id)
  })
}

/** Pause d'une routine, ou de toutes (RG-37). */
export function pauseRoutines(
  d: AppDB,
  input: { routineId?: string; fromDate: DayKey; toDate?: DayKey },
  nowMs: number,
): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const pause: Pause = { id: newId(), origin: 'manual', ...input }
    await d.pauses.add(pause)
    const open = await d.entries
      .filter(
        (e) =>
          e.kind === 'routine' &&
          e.status === 'todo' &&
          e.date >= pause.fromDate &&
          e.date >= today &&
          (pause.toDate === undefined || e.date <= pause.toDate) &&
          (pause.routineId === undefined || e.routineId === pause.routineId) &&
          e.scheduledDate === e.date,
      )
      .toArray()
    for (const e of open) if (!(await hasSessions(d, e.id))) await d.entries.delete(e.id)
  })
}

/** Reprise : les occurrences redeviennent normales dès aujourd'hui. */
export function endPause(d: AppDB, pauseId: string, nowMs: number): Promise<void> {
  return tx(d, async () => {
    const today = dayKeyOf(nowMs)
    const p = await d.pauses.get(pauseId)
    if (!p) return
    if (p.fromDate >= today) await d.pauses.delete(pauseId)
    else await d.pauses.update(pauseId, { toDate: addDays(today, -1) })
    await generateOccurrences(d, today, today, today, nowMs)
  })
}

/* ------------------------------------------------------------------ */
/* Catégories                                                          */
/* ------------------------------------------------------------------ */

export async function saveCategory(d: AppDB, cat: Pick<Category, 'name' | 'color'> & { id?: string }) {
  if (cat.id) {
    await d.categories.update(cat.id, { name: cat.name.trim(), color: cat.color })
    return cat.id
  }
  const all = await d.categories.toArray()
  const id = newId()
  await d.categories.add({
    id,
    name: cat.name.trim(),
    color: cat.color,
    position: all.reduce((m, c) => Math.max(m, c.position), 0) + 1,
  })
  return id
}

/** Une catégorie supprimée est archivée : elle reste affichée sur les éléments passés (RG-93). */
export async function archiveCategory(d: AppDB, id: string, nowMs: number) {
  await d.categories.update(id, { archivedAt: nowMs })
}
