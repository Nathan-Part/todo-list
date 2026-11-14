import Dexie, { type EntityTable } from 'dexie'
import type { Category, Entry, MetaRow, Pause, Routine, Session, Subtask, Task } from './domain/types'

export class AppDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  tasks!: EntityTable<Task, 'id'>
  subtasks!: EntityTable<Subtask, 'id'>
  routines!: EntityTable<Routine, 'id'>
  pauses!: EntityTable<Pause, 'id'>
  entries!: EntityTable<Entry, 'id'>
  sessions!: EntityTable<Session, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'ma-journee') {
    super(name)
    this.version(1).stores({
      categories: 'id, position',
      tasks: 'id, status, dueDate',
      subtasks: 'id, taskId',
      routines: 'id',
      pauses: 'id, routineId',
      entries: 'id, date, scheduledDate, status, taskId, routineId, [taskId+status], [routineId+scheduledDate]',
      sessions: 'id, entryId, date, running',
      meta: 'key',
    })
  }
}

export const db = new AppDB()

export const META = {
  lastGenerated: 'lastGeneratedDay',
  capacity: 'capacityMin',
  onboarded: 'onboarded',
} as const

/** Capacité par défaut, du lundi au dimanche (en minutes) : 0 = non définie, pas de limite. */
export const DEFAULT_CAPACITY = [0, 0, 0, 0, 0, 0, 0]

export async function getMeta<T>(d: AppDB, key: string, fallback: T): Promise<T> {
  const row = await d.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(d: AppDB, key: string, value: unknown): Promise<void> {
  await d.meta.put({ key, value })
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
