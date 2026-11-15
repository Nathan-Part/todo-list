import { useCallback } from 'react'
import { db } from '../db'
import {
  addSession,
  completeEntry,
  deleteRoutine,
  completeTask,
  restoreRoutine,
  snapshotRoutine,
  deleteTask,
  restoreTask,
  snapshotTask,
  pauseTimer,
  postponeEntry,
  reopenEntry,
  skipEntry,
  undeleteTask,
  unskipEntry,
  startTimer,
  taskEntryId,
} from '../domain/actions'
import { dayKeyOf } from '../domain/dates'
import type { DayItem } from '../domain/stats'
import type { Task } from '../domain/types'
import { dayShort, formatMin } from './format'
import { useNav } from './nav'
import { useToast } from './toast'

/** Gestes communs sur une ligne : cocher, lancer le chrono, ouvrir la fiche. */
export function useItemActions() {
  const toast = useToast()
  const { setSheet, setFocus } = useNav()

  const complete = useCallback(
    async (item: DayItem) => {
      const nowMs = Date.now()
      const today = dayKeyOf(nowMs)
      await completeEntry(db, item.id, nowMs)
      if (item.hasSessions || item.unplanned) return
      // Cochée sans chrono : proposition discrète de durée réelle (RG-65)
      const entryId = item.kind === 'task' && item.date > today ? taskEntryId(item.taskId!, today) : item.id
      if (item.estimateMin) {
        const sec = item.estimateMin * 60
        toast({
          text: `Durée réelle : ${formatMin(item.estimateMin)} ?`,
          actionLabel: 'OK',
          onAction: () => void addSession(db, entryId, { durationSec: sec }, 'quick'),
        })
      } else if (item.kind === 'task') {
        toast({
          text: 'Terminée. Ajouter la durée réelle ?',
          actionLabel: 'Ajouter',
          onAction: () => setSheet({ type: 'task', taskId: item.taskId!, entryId }),
        })
      }
    },
    [toast, setSheet],
  )

  /** Termine une tâche depuis sa fiche (planifiée ou en réserve). */
  const completeTaskById = useCallback(
    async (task: Task, hasSessions: boolean) => {
      const nowMs = Date.now()
      const today = dayKeyOf(nowMs)
      await completeTask(db, task.id, nowMs)
      if (hasSessions || !task.estimateMin) return
      const sec = task.estimateMin * 60
      toast({
        text: `Durée réelle : ${formatMin(task.estimateMin)} ?`,
        actionLabel: 'OK',
        onAction: () => void addSession(db, taskEntryId(task.id, today), { durationSec: sec }, 'quick'),
      })
    },
    [toast],
  )

  const toggle = useCallback(
    async (item: DayItem) => {
      if (item.status === 'done') await reopenEntry(db, item.id, Date.now())
      else await complete(item)
    },
    [complete],
  )

  const timer = useCallback(
    async (item: DayItem) => {
      if (item.runningSince !== undefined) {
        await pauseTimer(db, Date.now())
      } else {
        await startTimer(db, item.id, Date.now())
        setFocus(item.id)
      }
    },
    [setFocus],
  )

  const open = useCallback(
    (item: DayItem) => {
      if (item.kind === 'task' && item.taskId) {
        setSheet({ type: 'task', taskId: item.taskId, entryId: item.virtual ? undefined : item.id })
      } else {
        setSheet({ type: 'occurrence', entryId: item.id })
      }
    },
    [setSheet],
  )

  const postpone = useCallback(
    async (item: DayItem, target: string) => {
      try {
        await postponeEntry(db, item.id, target, Date.now())
        toast({ text: target === 'reserve' ? 'Renvoyée en réserve' : `Reportée au ${dayShort(target)}`, duration: 2500 })
      } catch (e) {
        toast({ text: e instanceof Error ? e.message : 'Action impossible', duration: 3500 })
      }
    },
    [toast],
  )

  const skip = useCallback(
    async (item: DayItem) => {
      await skipEntry(db, item.id, Date.now())
      toast({
        text: 'Occurrence sautée',
        actionLabel: 'Annuler',
        onAction: () => void unskipEntry(db, item.id, Date.now()),
      })
    },
    [toast],
  )

  const remove = useCallback(
    async (item: DayItem) => {
      if (item.kind === 'routine' && item.routineId) {
        const snap = await snapshotRoutine(db, item.routineId)
        await deleteRoutine(db, item.routineId)
        if (snap) toast({ text: 'Routine supprimée', actionLabel: 'Annuler', onAction: () => void restoreRoutine(db, snap) })
        return
      }
      if (!item.taskId) return
      const snap = await snapshotTask(db, item.taskId)
      await deleteTask(db, item.taskId, Date.now())
      if (snap) toast({ text: 'Tâche supprimée', actionLabel: 'Annuler', onAction: () => void restoreTask(db, snap) })
    },
    [toast],
  )

  const recover = useCallback(
    async (item: DayItem) => {
      if (item.status === 'skipped') await unskipEntry(db, item.id, Date.now())
      else if (item.status === 'deleted' && item.taskId) await undeleteTask(db, item.taskId, Date.now())
      else return
      toast({ text: 'Récupérée', duration: 2500 })
    },
    [toast],
  )

  return { complete, completeTaskById, toggle, timer, open, postpone, skip, remove, recover }
}
