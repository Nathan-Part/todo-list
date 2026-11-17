import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { TimeRangeInput, rangeToMs } from '../components/pickers'
import { Icon, Sheet, btnDanger, btnGhost, btnPrimary } from '../components/ui'
import { db } from '../db'
import { addSession, deleteSession, deleteTask, reopenEntry, toggleItemStep, updateSession } from '../domain/actions'
import { loadItem } from '../domain/queries'
import { formatSec, timeOfDay } from '../lib/format'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'

/** Corriger une ligne du résumé de la journée : heures, temps, ou « pas faite finalement ». */
export function DayLineSheet({
  entryId,
  sessionId,
  subtaskId,
  onClose,
}: {
  entryId: string
  sessionId?: string
  /** Ligne d'une étape (sous-tâche ou étape de routine). */
  subtaskId?: string
  onClose: () => void
}) {
  const { setSheet } = useNav()
  const toast = useToast()
  const item = useLiveQuery(() => loadItem(db, entryId), [entryId])
  const session = useLiveQuery(() => (sessionId ? db.sessions.get(sessionId) : undefined), [sessionId])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [init, setInit] = useState(false)
  useEffect(() => {
    if (init || (sessionId && !session)) return
    if (session?.startAt) {
      setStart(timeOfDay(session.startAt))
      setEnd(timeOfDay(session.endAt ?? Date.now()))
    }
    setInit(true)
  }, [session, sessionId, init])

  if (!item) return <Sheet title="…" onClose={onClose}>{null}</Sheet>
  const step = subtaskId ? item.subtasks.find((x) => x.id === subtaskId) : undefined
  const range = rangeToMs(item.date, start, end)
  const running = session?.running === 1

  const save = async () => {
    if (!range) return
    const durationSec = (range.endAt - range.startAt) / 1000
    if (session) await updateSession(db, session.id, { ...range, durationSec })
    else await addSession(db, entryId, { ...range, durationSec, subtaskId: step?.id }, 'quick')
    toast({ text: 'Heures enregistrées', duration: 2000 })
    onClose()
  }
  const stepNotDone = async () => {
    if (!step) return
    // le temps saisi à la main pour cette étape part avec elle ; le chrono, lui, reste compté
    await db.sessions
      .where('entryId')
      .equals(entryId)
      .filter((s) => s.subtaskId === step.id && s.source !== 'timer')
      .delete()
    if (step.status === 'done') await toggleItemStep(db, item, step.id, Date.now())
    toast({ text: 'Étape remise à faire', duration: 2500 })
    onClose()
  }
  const notDone = async () => {
    if (item.unplanned && item.taskId) await deleteTask(db, item.taskId, Date.now())
    else await reopenEntry(db, entryId, Date.now())
    toast({ text: item.unplanned ? 'Retirée de ta journée' : 'Remise à faire', duration: 2500 })
    onClose()
  }

  return (
    <Sheet title={step ? step.name : item.name} onClose={onClose}>
      {step && (
        <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
          <Icon name="list" className="size-3.5 shrink-0" />
          <span className="truncate">Étape de « {item.name} »</span>
        </div>
      )}
      {running ? (
        <p className="mt-2 text-sm text-muted">Le chrono tourne sur cette tâche : arrête-le avant de corriger ses heures.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{session ? 'Corrige les heures de cette session.' : 'À quelle heure l\'as-tu faite ?'}</p>
          <div className="mt-3">
            <TimeRangeInput start={start} end={end} onChange={(a, b) => (setStart(a), setEnd(b))} />
          </div>
          <button type="button" className={`${btnPrimary} mt-4 w-full`} disabled={!range} onClick={() => void save()}>
            Enregistrer{range ? ` (${formatSec((range.endAt - range.startAt) / 1000)})` : ''}
          </button>
        </>
      )}
      <div className="mt-3 space-y-2">
        {session && !running && (
          <button
            type="button"
            className={`${btnGhost} w-full`}
            onClick={async () => {
              await deleteSession(db, session.id)
              toast({ text: 'Temps supprimé', duration: 2000 })
              onClose()
            }}
          >
            <Icon name="x" className="size-4" />
            Supprimer ce temps (la tâche reste faite)
          </button>
        )}
        {step?.status === 'done' && (
          <button type="button" className={`${btnDanger} w-full`} onClick={() => void stepNotDone()}>
            <Icon name="undo" className="size-4" />
            Finalement, étape pas faite
          </button>
        )}
        {!step && item.status === 'done' && (
          <button type="button" className={`${btnDanger} w-full`} onClick={() => void notDone()}>
            <Icon name="undo" className="size-4" />
            {item.unplanned ? 'Retirer de ma journée' : 'Finalement, pas faite'}
          </button>
        )}
        <button
          type="button"
          className={`${btnGhost} w-full`}
          onClick={() =>
            item.kind === 'task' && item.taskId
              ? setSheet({ type: 'task', taskId: item.taskId, entryId })
              : setSheet({ type: 'occurrence', entryId })
          }
        >
          Ouvrir la fiche
        </button>
      </div>
    </Sheet>
  )
}
