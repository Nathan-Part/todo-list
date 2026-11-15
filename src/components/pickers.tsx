import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { type ReactNode, useEffect, useState } from 'react'
import { db } from '../db'
import {
  addSession,
  addSubtask,
  deleteSession,
  deleteSubtask,
  reorderSubtasks,
  updateSubtask,
  pauseTimer,
  startTimer,
  toggleSubtask,
} from '../domain/actions'
import { diffDays } from '../domain/dates'
import type { Category, DayKey, Session, Subtask } from '../domain/types'
import { dayShort, formatMin, formatSec, timeOfDay } from '../lib/format'
import { CategoryDot, Chip, Icon, btnGhost, btnPrimary, btnSoft, inputBase } from './ui'

const PRESETS = [15, 30, 45, 60, 90, 120]

/** Saisie d'une durée en heures et minutes ; la valeur est en minutes. */
export function DurationInput({
  value,
  onChange,
  onEnter,
}: {
  value: number | undefined
  onChange: (min: number | undefined) => void
  onEnter?: () => void
}) {
  const split = (v?: number) => (v ? { h: v >= 60 ? String(Math.floor(v / 60)) : '', m: v % 60 ? String(v % 60) : '' } : { h: '', m: '' })
  const [f, setF] = useState(split(value))
  const total = (x: { h: string; m: string }) => (Number(x.h) || 0) * 60 + (Number(x.m) || 0)
  useEffect(() => {
    if ((value ?? 0) !== total(f)) setF(split(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const set = (patch: Partial<typeof f>) => {
    const next = { ...f, ...patch }
    setF(next)
    const t = Math.round(total(next))
    onChange(t > 0 ? t : undefined)
  }
  const field = (k: 'h' | 'm', label: string, max: number) => (
    <label className="flex items-center gap-1.5">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        placeholder="0"
        aria-label={k === 'h' ? 'Heures' : 'Minutes'}
        value={f[k]}
        onChange={(e) => set({ [k]: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        className={`${inputBase} w-16 shrink-0 text-center`}
      />
      <span className="text-sm text-muted">{label}</span>
    </label>
  )
  return (
    <div className="flex items-center gap-3">
      {field('h', 'h', 24)}
      {field('m', 'min', 59)}
    </div>
  )
}

/** Durée estimée par raccourcis, ou valeur libre. */
export function EstimateChips({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  const isCustom = value !== undefined && !PRESETS.includes(value)
  const [customOpen, setCustomOpen] = useState(isCustom)
  const showCustom = customOpen || isCustom
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((m) => (
          <Chip
            key={m}
            active={value === m}
            onClick={() => {
              onChange(value === m ? undefined : m)
              setCustomOpen(false)
            }}
          >
            {formatMin(m)}
          </Chip>
        ))}
        <Chip active={showCustom} onClick={() => setCustomOpen((o) => !o)}>
          Autre
        </Chip>
      </div>
      {showCustom && (
        <div className="mt-2">
          <DurationInput value={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

export function CategoryChips({
  value,
  onChange,
  categories,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  categories: Category[]
}) {
  if (categories.length === 0) return <div className="text-sm text-muted">Aucune catégorie (à créer dans les réglages).</div>
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((c) => (
        <Chip key={c.id} active={value === c.id} onClick={() => onChange(value === c.id ? undefined : c.id)}>
          <span className="inline-flex items-center gap-1.5">
            <CategoryDot color={c.color} className={`size-2 ${value === c.id ? 'ring-1 ring-on-accent' : ''}`} />
            {c.name}
          </span>
        </Chip>
      ))}
    </div>
  )
}

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

export function WeekdayToggles({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1.5">
      {WEEKDAY_LETTERS.map((l, i) => {
        const on = value.includes(i)
        return (
          <button
            key={i}
            type="button"
            aria-label={WEEKDAY_NAMES[i]}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort((a, b) => a - b))}
            className={`size-10 rounded-full border text-sm font-semibold transition active:scale-90 ${
              on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface'
            }`}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}

/** Sessions de temps d'un passage, avec ajout et suppression manuels (RG-66). */
export function SessionsEditor({ entryId, sessions }: { entryId?: string; sessions: Session[] }) {
  const [minutes, setMinutes] = useState<number | undefined>()
  const total = sessions.reduce((n, s) => n + s.durationSec, 0)
  const add = async () => {
    if (!entryId || !minutes) return
    await addSession(db, entryId, { durationSec: minutes * 60 }, 'manual')
    setMinutes(undefined)
  }
  return (
    <div>
      {sessions.length === 0 ? (
        <div className="text-sm text-muted">Aucun temps enregistré.</div>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="text-muted">{dayShort(s.date)}</span>
                {s.startAt && s.endAt ? (
                  <span className="ml-2 tabular text-muted">
                    {timeOfDay(s.startAt)}–{timeOfDay(s.endAt)}
                  </span>
                ) : null}
                {s.running === 1 && <span className="ml-2 text-accent">en cours</span>}
              </span>
              <span className="font-medium tabular">{s.running === 1 ? '…' : formatSec(s.durationSec)}</span>
              {s.running === 0 && (
                <button
                  type="button"
                  aria-label="Supprimer cette session"
                  className="rounded-full p-1.5 text-muted active:bg-bg"
                  onClick={() => void deleteSession(db, s.id)}
                >
                  <Icon name="x" className="size-4" />
                </button>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between py-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular">{formatSec(total)}</span>
          </li>
        </ul>
      )}
      {entryId && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <DurationInput value={minutes} onChange={setMinutes} onEnter={() => void add()} />
          <button type="button" className={btnSoft} onClick={() => void add()} disabled={!minutes}>
            <Icon name="plus" className="size-4" />
            Ajouter
          </button>
        </div>
      )}
    </div>
  )
}

/** Ligne d'étape déplaçable par sa poignée. */
function SortableStep({ id, children, disabled }: { id: string; children: ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
      className={`flex items-center gap-2 bg-surface py-2 pl-1 pr-3 ${isDragging ? 'rounded-xl shadow-lg ring-2 ring-accent' : ''}`}
    >
      {!disabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Déplacer l'étape"
          style={{ touchAction: 'none' }}
          className="cursor-grab rounded p-1 text-muted active:cursor-grabbing"
        >
          <Icon name="grip" className="size-4" strokeWidth={3} />
        </button>
      )}
      {children}
    </li>
  )
}

/** Étapes d'une tâche, chacune avec sa durée et son chrono (RG-50 à 54). */
export function SubtasksEditor({
  taskId,
  subtasks,
  timerEntryId,
  runningSubtaskId,
  onStart,
}: {
  taskId: string
  subtasks: Subtask[]
  /** Passage du jour sur lequel lancer le chrono ; absent = chrono indisponible. */
  timerEntryId?: string
  runningSubtaskId?: string
  onStart?: (entryId: string) => void
}) {
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState<number | undefined>()
  const [editing, setEditing] = useState<{ id: string; name: string; minutes?: number } | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  useEffect(() => setOrder(null), [subtasks])
  const list = order
    ? order.map((id) => subtasks.find((x) => x.id === id)).filter((x): x is Subtask => !!x)
    : subtasks
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 6 } }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = list.map((x) => x.id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    setOrder(next)
    void reorderSubtasks(db, next)
  }
  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return
    await updateSubtask(db, editing.id, { name: editing.name.trim(), estimateMin: editing.minutes })
    setEditing(null)
  }
  const add = async () => {
    if (!name.trim()) return
    await addSubtask(db, taskId, { name, estimateMin: minutes })
    setName('')
    setMinutes(undefined)
  }
  return (
    <div>
      {subtasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <ul className="mb-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {list.map((st) => {
            const done = st.status === 'done'
            const running = runningSubtaskId === st.id
            if (editing?.id === st.id) {
              return (
                <li key={st.id} className="space-y-2 bg-bg px-3 py-3">
                  <input
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && void saveEdit()}
                    aria-label="Nom de l'étape"
                    className={`${inputBase} w-full bg-surface`}
                  />
                  <DurationInput value={editing.minutes} onChange={(m) => setEditing({ ...editing, minutes: m })} />
                  <div className="flex gap-2">
                    <button type="button" className={btnPrimary} disabled={!editing.name.trim()} onClick={() => void saveEdit()}>
                      Enregistrer
                    </button>
                    <button type="button" className={btnGhost} onClick={() => setEditing(null)}>
                      Annuler
                    </button>
                  </div>
                </li>
              )
            }
            return (
              <SortableStep key={st.id} id={st.id} disabled={!!editing || list.length < 2}>
                <button
                  type="button"
                  aria-label={done ? 'Décocher' : 'Cocher'}
                  onClick={() => void toggleSubtask(db, st.id, Date.now())}
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    done ? 'border-good bg-good text-on-accent' : 'border-line text-transparent'
                  }`}
                >
                  <Icon name="check" className="size-3" strokeWidth={3} />
                </button>
                <button
                  type="button"
                  aria-label={`Modifier ${st.name}`}
                  onClick={() => setEditing({ id: st.id, name: st.name, minutes: st.estimateMin })}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className={`min-w-0 flex-1 break-words text-[15px] leading-snug ${done ? 'text-muted line-through' : ''}`}>
                    {st.name}
                  </span>
                  <span className="text-xs text-muted tabular">{st.estimateMin ? formatMin(st.estimateMin) : 'durée ?'}</span>
                </button>
                {timerEntryId && !done && (
                  <button
                    type="button"
                    aria-label={running ? 'Mettre en pause' : `Chrono sur ${st.name}`}
                    onClick={async () => {
                      if (running) await pauseTimer(db, Date.now())
                      else {
                        await startTimer(db, timerEntryId, Date.now(), st.id)
                        onStart?.(timerEntryId)
                      }
                    }}
                    className={`flex size-7 items-center justify-center rounded-full ${running ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'}`}
                  >
                    <Icon name={running ? 'pause' : 'play'} className="size-3" fill={!running} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Supprimer ${st.name}`}
                  onClick={() => void deleteSubtask(db, st.id, Date.now())}
                  className="rounded-full p-1 text-muted"
                >
                  <Icon name="x" className="size-4" />
                </button>
              </SortableStep>
            )
          })}
        </ul>
        </SortableContext>
        </DndContext>
      )}
      {subtasks.length > 0 && <p className="mb-2 text-xs text-muted">Touche une étape pour la modifier ; tiens ⋮⋮ et glisse pour changer l'ordre.</p>}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle étape" className={`${inputBase} w-full`} />
        <div className="flex flex-wrap items-center gap-3">
          <DurationInput value={minutes} onChange={setMinutes} onEnter={() => void add()} />
          <button type="submit" className={btnSoft} aria-label="Ajouter l'étape" disabled={!name.trim()}>
            <Icon name="plus" className="size-4" />
            Ajouter
          </button>
        </div>
      </form>
    </div>
  )
}

/** « encore 20 j », « dernier jour », ou « terminée ». */
export function remainingLabel(endDate: DayKey, today: DayKey): string {
  const n = diffDays(endDate, today)
  if (n < 0) return 'terminée'
  if (n === 0) return 'dernier jour'
  return `encore ${n} j`
}

/** Date de fin facultative d'une routine, avec le nombre de jours restants. */
export function EndDateField({
  value,
  onChange,
  min,
  today,
}: {
  value: DayKey | undefined
  onChange: (v: DayKey | undefined) => void
  min: DayKey
  today: DayKey
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span>Jusqu'au</span>
      <input
        type="date"
        min={min}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={`${inputBase} w-auto`}
        aria-label="Date de fin de la routine"
      />
      {value ? (
        <>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            {remainingLabel(value, today)}
          </span>
          <button type="button" className="text-xs text-muted underline" onClick={() => onChange(undefined)}>
            Sans fin
          </button>
        </>
      ) : (
        <span className="text-xs text-muted">facultatif, sans fin par défaut</span>
      )}
    </div>
  )
}
