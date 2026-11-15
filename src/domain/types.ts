/** Jour de calendrier à l'heure locale, au format AAAA-MM-JJ. */
export type DayKey = string

export type Frequency =
  | { type: 'daily' }
  /** 0 = lundi … 6 = dimanche */
  | { type: 'weekdays'; weekdays: number[] }
  | { type: 'interval'; intervalDays: number }

export interface Category {
  id: string
  name: string
  color: string
  position: number
  archivedAt?: number
}

export interface Task {
  id: string
  name: string
  categoryId?: string
  estimateMin?: number
  dueDate?: DayKey
  /** Heure prévue « HH:MM », facultative. */
  time?: string
  note?: string
  status: 'todo' | 'done' | 'deleted'
  /** Arrivée en réserve par le changement de jour, pas encore triée. */
  needsReview: boolean
  reserveSince?: DayKey
  /** Ordre manuel dans la réserve (absent = après les tâches rangées, tri automatique). */
  reservePosition?: number
  isUnplanned: boolean
  doneDate?: DayKey
  createdAt: number
  doneAt?: number
  deletedAt?: number
}

export interface Subtask {
  id: string
  taskId: string
  name: string
  estimateMin?: number
  status: 'todo' | 'done'
  doneDate?: DayKey
  doneAt?: number
  position: number
}

export interface Routine {
  id: string
  name: string
  categoryId?: string
  estimateMin?: number
  /** Heure prévue « HH:MM », facultative. */
  time?: string
  note?: string
  frequency: Frequency
  startDate: DayKey
  endDate?: DayKey
  position: number
  createdAt: number
  archivedAt?: number
}

export interface Pause {
  id: string
  /** Vide = toutes les routines. */
  routineId?: string
  fromDate: DayKey
  /** Vide = jusqu'à reprise manuelle. */
  toDate?: DayKey
  origin: 'manual' | 'absence'
}

export type EntryStatus = 'todo' | 'done' | 'not_done' | 'postponed' | 'skipped' | 'deleted'

/** Un « passage » : la présence d'une tâche ou d'une occurrence de routine sur un jour. */
export interface Entry {
  id: string
  kind: 'task' | 'routine'
  taskId?: string
  routineId?: string
  date: DayKey
  /** Routines : date d'origine fixée par la fréquence. */
  scheduledDate?: DayKey
  status: EntryStatus
  movedTo?: DayKey | 'reserve'
  position: number
  unplanned?: boolean
  nameSnapshot?: string
  estimateMinSnapshot?: number
  categoryIdSnapshot?: string
  closedAt?: number
  doneAt?: number
}

export interface Session {
  id: string
  entryId: string
  subtaskId?: string
  /** Jour auquel le temps est compté. */
  date: DayKey
  startAt?: number
  endAt?: number
  durationSec: number
  source: 'timer' | 'manual' | 'quick'
  /** 1 tant que le chrono tourne (au plus une session). */
  running: 0 | 1
}

export interface MetaRow {
  key: string
  value: unknown
}
