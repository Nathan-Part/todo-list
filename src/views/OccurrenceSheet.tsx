import { useLiveQuery } from 'dexie-react-hooks'
import { DayPicker } from '../components/DayPicker'
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
} from '../domain/actions'
import { addDays } from '../domain/dates'
import { loadItem } from '../domain/queries'
import { frequencyLabel, isPaused, isRoutineScheduledOn } from '../domain/routines'
import { dayShort, formatMin } from '../lib/format'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'
import { useRunningSession } from '../lib/hooks'
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

  if (!item || !routine) return <Sheet title="…" onClose={onClose}>{null}</Sheet>

  const isTodo = item.status === 'todo'
  const timerOn = running?.entryId === item.id
  const tomorrow = addDays(today, 1)

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
        Routine · {frequencyLabel(routine.frequency)}
        {routine.estimateMin ? ` · ${formatMin(routine.estimateMin)}` : ''}
      </div>
      <div className="mt-1 text-sm text-muted">
        {item.date === today ? "Aujourd'hui" : dayShort(item.date)}
        {item.scheduledDate && item.scheduledDate !== item.date ? ` (prévue le ${dayShort(item.scheduledDate)})` : ''}
      </div>

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
        <>
          <Field label="Sauter ou déplacer">
            <div className="mb-3">
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
                Sauter cette occurrence
              </button>
            </div>
            <DayPicker
              today={today}
              min={item.date > today ? today : tomorrow}
              disabled={(d) =>
                d === item.date || (isRoutineScheduledOn(routine, d) && !isPaused(pauses, routine.id, d))
              }
              onPick={(d) => void move(d)}
            />
            <p className="mt-2 text-xs text-muted">
              Une routine ne se déplace que vers un jour où elle n'a pas déjà son occurrence.
            </p>
          </Field>
        </>
      )}

      {!item.virtual && (
        <Field label="Temps réel">
          <SessionsEditor entryId={item.id} sessions={sessions} />
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
