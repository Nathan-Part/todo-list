import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DayPicker } from '../components/DayPicker'
import { SubtaskDropdown } from '../components/ItemRow'
import { SessionsEditor } from '../components/pickers'
import { Field, Icon, Sheet, btnGhost, btnPrimary, btnSoft } from '../components/ui'
import { db } from '../db'
import {
  markDoneOnDay,
  parseRoutineEntryId,
  pauseTimer,
  postponeEntry,
  reopenEntry,
  skipEntry,
  startTimer,
  unskipEntry,
} from '../domain/actions'
import { addDays } from '../domain/dates'
import { loadItem } from '../domain/queries'
import { frequencyLabel, isPaused, isRoutineScheduledOn } from '../domain/routines'
import { dayShort, formatMin } from '../lib/format'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'
import { useNow, useRunningSession } from '../lib/hooks'
import { useToast } from '../lib/toast'

/** Fiche d'une occurrence de routine sur un jour donné. */
export function OccurrenceSheet({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { today, setSheet, setFocus } = useNav()
  const item = useLiveQuery(() => loadItem(db, entryId), [entryId])
  const routine = useLiveQuery(async () => {
    const rid = parseRoutineEntryId(entryId)?.routineId
    return rid ? db.routines.get(rid) : undefined
  }, [entryId])
  const pauses = useLiveQuery(() => db.pauses.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('entryId').equals(entryId).toArray(), [entryId]) ?? []
  const running = useRunningSession()
  const { complete } = useItemActions()
  const toast = useToast()
  const [pickDay, setPickDay] = useState(false)
  const now = useNow(1000)

  if (!item || !routine) return <Sheet title="…" onClose={onClose}>{null}</Sheet>

  const isTodo = item.status === 'todo'
  const moveMin = item.date > today ? today : addDays(today, 1)
  const blocked = (d: string) =>
    d === item.date || (isRoutineScheduledOn(routine, d) && !isPaused(pauses, routine.id, d))
  const canMove = Array.from({ length: 14 }, (_, i) => addDays(moveMin, i)).some((d) => !blocked(d))
  const timerOn = running?.entryId === item.id

  const move = async (target: string) => {
    try {
      await postponeEntry(db, item.id, target, Date.now())
      toast({ text: `Déplacée au ${dayShort(target)}`, duration: 3000 })
      onClose()
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Action impossible', duration: 4000 })
    }
  }

  return (
    <Sheet title={item.name} onClose={onClose}>
      <div className="text-sm text-muted">
        Routine{routine.optional ? ' facultative' : ''} · {frequencyLabel(routine.frequency)}
        {routine.estimateMin ? ` · ${formatMin(routine.estimateMin)}` : ''}
      </div>
      <div className="mt-1 text-sm text-muted">
        {item.date === today ? "Aujourd'hui" : dayShort(item.date)}
        {item.scheduledDate && item.scheduledDate !== item.date ? ` (prévue le ${dayShort(item.scheduledDate)})` : ''}
      </div>

      {item.subtasks.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <SubtaskDropdown
            taskId={item.id}
            item={item}
            now={now}
            subtasks={item.subtasks}
            runningSubtaskId={item.runningSubtaskId}
            timerEntryId={isTodo && !item.virtual && item.date === today ? item.id : undefined}
            canCheck={isTodo && item.date <= today}
            onOpen={() => {}}
          />
        </div>
      )}

      {isTodo && !item.virtual && item.date <= today && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`${btnPrimary} flex-1`}
            onClick={async () => {
              await complete(item)
              onClose()
            }}
          >
            <Icon name="check" className="size-4" strokeWidth={3} />
            Terminer
          </button>
          <button
            type="button"
            className={btnSoft}
            onClick={async () => {
              if (timerOn) await pauseTimer(db, Date.now())
              else {
                await startTimer(db, item.id, Date.now())
                onClose()
                setFocus(item.id)
              }
            }}
          >
            <Icon name={timerOn ? 'pause' : 'play'} fill={!timerOn} className="size-4" />
            {timerOn ? 'Pause' : 'Chrono'}
          </button>
        </div>
      )}

      {item.status === 'done' && (
        <div className="mt-4">
          <button type="button" className={btnGhost} onClick={() => void reopenEntry(db, item.id, Date.now())}>
            <Icon name="undo" className="size-4" />
            Rouvrir
          </button>
        </div>
      )}

      {item.status === 'skipped' && (
        <div className="mt-4">
          <button
            type="button"
            className={btnGhost}
            onClick={async () => {
              await unskipEntry(db, item.id, Date.now())
              toast({ text: 'Saut annulé', duration: 2500 })
            }}
          >
            <Icon name="undo" className="size-4" />
            Annuler le saut
          </button>
        </div>
      )}

      {item.status === 'not_done' && (
        <div className="mt-4">
          <button
            type="button"
            className={btnGhost}
            onClick={async () => {
              await markDoneOnDay(db, item.id, Date.now())
              toast({ text: `Marquée faite le ${dayShort(item.date)}`, duration: 3000 })
              onClose()
            }}
          >
            Fait ce jour-là
          </button>
        </div>
      )}

      {isTodo && (
        <Field label="Sauter ou déplacer">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnSoft}
              onClick={async () => {
                await skipEntry(db, item.id, Date.now())
                toast({ text: 'Occurrence sautée (exclue des statistiques)', duration: 3000 })
                onClose()
              }}
            >
              <Icon name="skip" className="size-4" />
              Sauter
            </button>
            {canMove && (
              <button type="button" className={pickDay ? btnPrimary : btnGhost} onClick={() => setPickDay((v) => !v)}>
                <Icon name="calendar" className="size-4" />
                Déplacer
              </button>
            )}
          </div>
          {canMove && pickDay && (
            <div className="mt-3">
              <DayPicker today={today} min={moveMin} disabled={blocked} onPick={(d) => void move(d)} />
            </div>
          )}
          {!canMove && (
            <p className="mt-2 text-xs text-muted">
              Cette routine revient chaque jour : elle ne se déplace pas, tu peux la sauter.
            </p>
          )}
        </Field>
      )}

      {!item.virtual && (
        <Field label="Temps réel">
          <SessionsEditor entryId={item.id} sessions={sessions} day={item.date} />
        </Field>
      )}

      <div className="mt-6">
        <button type="button" className={btnGhost} onClick={() => setSheet({ type: 'routine', routineId: routine.id })}>
          <Icon name="repeat" className="size-4" />
          Voir la routine
        </button>
      </div>
    </Sheet>
  )
}
