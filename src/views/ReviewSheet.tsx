import { useState } from 'react'
import { DayPicker } from '../components/DayPicker'
import { Icon, Sheet, btnDanger, btnGhost, btnPrimary, btnSoft } from '../components/ui'
import { db } from '../db'
import { completeTask, deleteTask, markDoneOnDay, planTask } from '../domain/actions'
import { addDays } from '../domain/dates'
import { dayLabel, dayShort, formatMin } from '../lib/format'
import { useReserve } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'

/**
 * Revue des tâches « à replanifier » (E5) : une carte à la fois, un geste par tâche (RG-23).
 */
export function ReviewSheet({ onClose }: { onClose: () => void }) {
  const { today } = useNav()
  const reserve = useReserve(today)
  const toast = useToast()
  const [other, setOther] = useState(false)
  const [total, setTotal] = useState<number | null>(null)

  const pending = (reserve ?? []).filter((r) => r.task.needsReview)
  if (total === null && reserve) setTotal(pending.length)
  const current = pending[0]
  const done = total !== null ? total - pending.length : 0
  const tomorrow = addDays(today, 1)

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      setOther(false)
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Action impossible', duration: 4000 })
    }
  }

  if (!current) {
    return (
      <Sheet title="Revue terminée" onClose={onClose}>
        <p className="mt-2 text-muted">Toutes les tâches sont triées. Rien n'a disparu : tout est planifié ou en réserve.</p>
        <button type="button" className={`${btnPrimary} mt-5 w-full`} onClick={onClose}>
          Fermer
        </button>
      </Sheet>
    )
  }

  const { task, postponedCount } = current

  return (
    <Sheet title={`À replanifier · ${done + 1}/${total ?? pending.length}`} onClose={onClose}>
      <div className="mt-2 rounded-2xl bg-bg p-4">
        <div className="text-lg font-semibold">{task.name}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          {task.reserveSince && <span>non terminée {dayLabel(addDays(task.reserveSince, -1), today).toLowerCase()}</span>}
          {postponedCount > 1 && <span>déjà reportée {postponedCount}×</span>}
          {task.estimateMin ? <span>{formatMin(task.estimateMin)}</span> : <span className="text-warn">sans durée</span>}
          {task.dueDate && (
            <span className={task.dueDate <= addDays(today, 3) ? 'font-semibold text-bad' : ''}>
              échéance {dayShort(task.dueDate)}
            </span>
          )}
        </div>
        {task.note && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{task.note}</p>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className={btnPrimary} onClick={() => run(() => planTask(db, task.id, today, Date.now()))}>
          Aujourd'hui
        </button>
        <button type="button" className={btnSoft} onClick={() => run(() => planTask(db, task.id, tomorrow, Date.now()))}>
          Demain
        </button>
        <button type="button" className={btnSoft} onClick={() => setOther((o) => !o)}>
          <Icon name="calendar" className="size-4" />
          Autre jour
        </button>
        <button type="button" className={btnGhost} onClick={() => run(() => planTask(db, task.id, 'reserve', Date.now()))}>
          Garder en réserve
        </button>
      </div>

      {other && (
        <div className="mt-3">
          <DayPicker today={today} min={tomorrow} onPick={(d) => void run(() => planTask(db, task.id, d, Date.now()))} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={btnGhost}
          onClick={() =>
            run(async () => {
              // « déjà faite » : on la date du jour où elle n'avait pas été cochée
              const last = (await db.entries.where('taskId').equals(task.id).toArray())
                .filter((e) => e.status === 'not_done')
                .sort((a, b) => b.date.localeCompare(a.date))[0]
              if (last) await markDoneOnDay(db, last.id, Date.now())
              else await completeTask(db, task.id, Date.now())
            })
          }
        >
          <Icon name="check" className="size-4" />
          Déjà faite
        </button>
        <button type="button" className={btnDanger} onClick={() => run(() => deleteTask(db, task.id, Date.now()))}>
          <Icon name="trash" className="size-4" />
          Supprimer
        </button>
      </div>
    </Sheet>
  )
}
