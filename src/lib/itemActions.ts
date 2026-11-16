import { useCallback } from 'react'
import { db } from '../db'
import {
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
import { completionFeedback } from '../domain/insights'
import { type DayItem, liveSpentSec } from '../domain/stats'
import type { Task } from '../domain/types'
import { dayShort } from './format'
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
      const realSec = liveSpentSec(item, nowMs)
      await completeEntry(db, item.id, nowMs)
      if (item.hasSessions) {
        // retour immédiat : temps réel face à l'estimation
        const msg = completionFeedback(realSec, item.estimateMin)
        if (msg) toast({ text: msg, duration: 4500 })
        return
      }
      // Cochée sans chrono : on demande de quand à quand (RG-65)
      const entryId = item.kind === 'task' && item.date > today ? taskEntryId(item.taskId!, today) : item.id
      setSheet({
        type: 'timeEntry',
        entryId,
        name: item.name,
        estimateMin: item.estimateMin,
        day: item.date > today ? today : item.date,
      })
    },
    [toast, setSheet],
  )

  /** Termine une tâche depuis sa fiche (planifiée ou en réserve). */
  const completeTaskById = useCallback(
    async (task: Task, hasSessions: boolean, spentSec = 0) => {
      const nowMs = Date.now()
      const today = dayKeyOf(nowMs)
      await completeTask(db, task.id, nowMs)
      if (hasSessions) {
        const msg = completionFeedback(spentSec, task.estimateMin)
        if (msg) toast({ text: msg, duration: 4500 })
        return
      }
      setSheet({ type: 'timeEntry', entryId: taskEntryId(task.id, today), name: task.name, estimateMin: task.estimateMin, day: today })
    },
    [toast, setSheet],
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
