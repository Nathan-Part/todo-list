import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DayPicker } from '../components/DayPicker'
import { CategoryChips, EstimateChips, PlaceChips, SessionsEditor, SubtasksEditor, TimeField } from '../components/pickers'
import { Field, Icon, Sheet, btnDanger, btnGhost, btnPrimary, btnSoft, inputBase, inputClass } from '../components/ui'
import { db } from '../db'
import {
  deleteTask,
  restoreTask,
  snapshotTask,
  markDoneOnDay,
  pauseTimer,
  planTask,
  reopenEntry,
  startTimer,
  updateTask,
} from '../domain/actions'
import { addDays, diffDays } from '../domain/dates'
import { loadTaskDetail } from '../domain/queries'
import type { Entry } from '../domain/types'
import { dayLabel, dayShort, dayTitle, formatMin, plural } from '../lib/format'
import { useCategories, useRunningSession } from '../lib/hooks'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'

function historyText(e: Entry): string {
  switch (e.status) {
    case 'todo':
      return 'prévue'
    case 'done':
      return 'faite'
    case 'not_done':
      return 'non terminée → réserve'
    case 'postponed':
      return e.movedTo === 'reserve' ? 'reportée en réserve' : `reportée au ${dayShort(e.movedTo ?? '')}`
    case 'skipped':
      return 'sautée'
    case 'deleted':
      return 'supprimée'
  }
}

export function TaskSheet({ taskId, entryId, onClose }: { taskId: string; entryId?: string; onClose: () => void }) {
  const { today, setFocus } = useNav()
  const detail = useLiveQuery(() => loadTaskDetail(db, taskId), [taskId])
  const running = useRunningSession()
  const { active: categories } = useCategories()
  const { completeTaskById } = useItemActions()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickDay, setPickDay] = useState(false)

  if (!detail) return <Sheet title="…" onClose={onClose}>{null}</Sheet>
  const { task, history, sessions, openEntry } = detail
  const ctx =
    (entryId ? history.find((e) => e.id === entryId) : undefined) ?? openEntry ?? history[history.length - 1]
  const isTodo = task.status === 'todo'
  const tomorrow = addDays(today, 1)
  const timerOn = !!openEntry && running?.entryId === openEntry.id
  const pastCtx = !!ctx && ctx.date < today && ctx.status === 'not_done' && isTodo

  const status = !isTodo
    ? task.status === 'done'
      ? `Faite le ${dayShort(task.doneDate ?? today)}`
      : 'Supprimée'
    : openEntry
      ? `Prévue ${dayLabel(openEntry.date, today).toLowerCase()}`
      : task.needsReview
        ? 'À replanifier'
        : task.reserveSince
          ? `En réserve depuis ${plural(Math.max(0, diffDays(today, task.reserveSince)), 'jour', 'jours')}`
          : 'En réserve'

  const move = async (target: string) => {
    try {
      await planTask(db, task.id, target, Date.now())
      toast({
        text: target === 'reserve' ? 'Renvoyée en réserve' : `Planifiée ${dayLabel(target, today).toLowerCase()}`,
        duration: 3000,
      })
      onClose()
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Action impossible', duration: 4000 })
    }
  }

  return (
    <Sheet
      title={
        <input
          key={task.id + task.name}
          defaultValue={task.name}
          aria-label="Nom de la tâche"
          disabled={task.status === 'deleted'}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== task.name) void updateTask(db, task.id, { name: v })
            else e.target.value = task.name
          }}
          className="w-full bg-transparent text-xl font-semibold outline-none"
        />
      }
      onClose={onClose}
    >
      <div className={`text-sm ${task.needsReview && isTodo && !openEntry ? 'font-medium text-warn' : 'text-muted'}`}>
        {status}
        {task.isUnplanned && ' · imprévu'}
        {ctx && ctx.date !== openEntry?.date && ctx.status !== 'todo' && ` · ${dayTitle(ctx.date)}`}
      </div>

      {/* actions principales */}
      {isTodo && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`${btnPrimary} flex-1`}
            onClick={async () => {
              await completeTaskById(
                task,
                sessions.length > 0,
                sessions.reduce((n, s) => n + (s.running ? Math.max(0, (Date.now() - (s.startAt ?? Date.now())) / 1000) : s.durationSec), 0),
              )
              onClose()
            }}
          >
            <Icon name="check" className="size-4" strokeWidth={3} />
            Terminer
          </button>
          {openEntry && openEntry.date <= today && (
            <button
              type="button"
              className={btnSoft}
              onClick={async () => {
                if (timerOn) await pauseTimer(db, Date.now())
                else {
                  await startTimer(db, openEntry.id, Date.now())
                  onClose()
                  setFocus(openEntry.id)
                }
              }}
            >
              <Icon name={timerOn ? 'pause' : 'play'} fill={!timerOn} className="size-4" />
              {timerOn ? 'Pause' : 'Chrono'}
            </button>
          )}
        </div>
      )}
      {task.status === 'done' && (
        <div className="mt-4">
          <button
            type="button"
            className={btnGhost}
            onClick={async () => {
              const doneEntry = [...history].reverse().find((e) => e.status === 'done')
              if (doneEntry) await reopenEntry(db, doneEntry.id, Date.now())
            }}
          >
            <Icon name="undo" className="size-4" />
            Rouvrir
          </button>
        </div>
      )}
      {pastCtx && ctx && (
        <div className="mt-3">
          <button
            type="button"
            className={btnGhost}
            onClick={async () => {
              await markDoneOnDay(db, ctx.id, Date.now())
              toast({ text: `Marquée faite le ${dayShort(ctx.date)}`, duration: 3000 })
              onClose()
            }}
          >
            Fait ce jour-là ({dayShort(ctx.date)})
          </button>
        </div>
      )}

      {task.status !== 'deleted' && (
        <>
          {detail.subtasks.length === 0 ? (
            <Field label="Durée estimée">
              <EstimateChips value={task.estimateMin} onChange={(v) => void updateTask(db, task.id, { estimateMin: v })} />
            </Field>
          ) : null}
          <Field label={detail.subtasks.length ? `Sous-tâches · ${detail.subtasks.filter((x) => x.status === 'done').length}/${detail.subtasks.length}${task.estimateMin ? ` · ${formatMin(task.estimateMin)}` : ''}` : 'Sous-tâches'}>
            <SubtasksEditor
              taskId={task.id}
              subtasks={detail.subtasks}
              timerEntryId={isTodo && openEntry && openEntry.date <= today ? openEntry.id : undefined}
              stepEntryId={openEntry && openEntry.date <= today ? openEntry.id : undefined}
              parentName={task.name}
              runningSubtaskId={timerOn ? running?.subtaskId : undefined}
              onStart={(id) => {
                onClose()
                setFocus(id)
              }}
            />
          </Field>
          <Field label="Où ?">
            <PlaceChips value={!!task.onSite} onChange={(v) => void updateTask(db, task.id, { onSite: v || undefined })} />
          </Field>
          <Field label="Catégorie">
            <CategoryChips
              value={task.categoryId}
              onChange={(v) => void updateTask(db, task.id, { categoryId: v })}
              categories={categories}
            />
          </Field>
        </>
      )}

      {/* report / planification */}
      {isTodo && (
        <Field label={openEntry ? 'Reporter' : 'Planifier'}>
          <div className="mb-2 flex flex-wrap gap-2">
            {openEntry?.date !== today && (
              <button type="button" className={btnSoft} onClick={() => void move(today)}>
                Aujourd'hui
              </button>
            )}
            {openEntry?.date !== tomorrow && (
              <button type="button" className={btnSoft} onClick={() => void move(tomorrow)}>
                Demain
              </button>
            )}
            {openEntry && (
              <button type="button" className={btnSoft} onClick={() => void move('reserve')}>
                Réserve
              </button>
            )}
            <button type="button" className={pickDay ? btnPrimary : btnGhost} onClick={() => setPickDay((v) => !v)}>
              <Icon name="calendar" className="size-4" />
              Autre jour
            </button>
          </div>
          {pickDay && (
            <DayPicker
              today={today}
              min={tomorrow}
              disabled={(d) => d === openEntry?.date}
              onPick={(d) => void move(d)}
            />
          )}
        </Field>
      )}

      {task.status !== 'deleted' && (
        <>
          <Field label="Heure">
            <TimeField value={task.time} onChange={(v) => void updateTask(db, task.id, { time: v })} />
          </Field>
          <Field label="Échéance">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={task.dueDate ?? ''}
                onChange={(e) => void updateTask(db, task.id, { dueDate: e.target.value || undefined })}
                className={`${inputBase} w-auto`}
              />
              {task.dueDate && (
                <button type="button" className="text-sm text-muted underline" onClick={() => void updateTask(db, task.id, { dueDate: undefined })}>
                  Retirer
                </button>
              )}
            </div>
          </Field>
          <Field label="Note">
            <textarea
              key={task.id + (task.note ?? '')}
              rows={3}
              defaultValue={task.note ?? ''}
              placeholder="Référence, lien, précision…"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (task.note ?? '')) void updateTask(db, task.id, { note: v || undefined })
              }}
              className={inputClass}
            />
          </Field>
        </>
      )}

      <Field label="Temps réel">
        <SessionsEditor entryId={ctx?.id} sessions={sessions} day={ctx?.date} />
      </Field>

      {history.length > 0 && (
        <Field label="Parcours">
          <ul className="space-y-1.5 text-sm">
            {history.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-muted">{dayShort(e.date)}</span>
                <span className="text-right">{historyText(e)}</span>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {task.status !== 'deleted' && (
        <div className="mt-8">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                className={`${btnDanger} flex-1`}
                onClick={async () => {
                  const snap = await snapshotTask(db, task.id)
                  await deleteTask(db, task.id, Date.now())
                  if (snap) toast({ text: 'Tâche supprimée', actionLabel: 'Annuler', onAction: () => void restoreTask(db, snap) })
                  onClose()
                }}
              >
                <Icon name="trash" className="size-4" />
                Confirmer la suppression
              </button>
              <button type="button" className={btnGhost} onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" className={btnDanger} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" className="size-4" />
              Supprimer
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}
