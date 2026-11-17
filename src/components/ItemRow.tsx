import { type HTMLAttributes, type Ref, useState } from 'react'
import { db } from '../db'
import { pauseTimer, startTimer, toggleItemStep, toggleSubtask } from '../domain/actions'
import { useNav } from '../lib/nav'
import { type SwipeAction, Swipeable } from './Swipe'

const scrollIntoViewRef = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
import { remainingLabel } from './pickers'
import type { DayItem } from '../domain/stats'
import { liveSpentSec, liveStepSec } from '../domain/stats'
import type { Category } from '../domain/types'
import { dayShort, formatClock, formatMin, formatSec, timeOfDay } from '../lib/format'
import { CategoryDot, Icon } from './ui'

export type RowMode = 'today' | 'future' | 'past'

interface Props {
  item: DayItem
  mode: RowMode
  now: number
  categories: Map<string, Category>
  onToggle: (item: DayItem) => void
  onOpen: (item: DayItem) => void
  onTimer: (item: DayItem) => void
  rootRef?: Ref<HTMLDivElement>
  rootProps?: HTMLAttributes<HTMLDivElement>
  dragging?: boolean
  /** Actions révélées en glissant la ligne vers la gauche. */
  swipeActions?: SwipeAction[]
}


function statusText(item: DayItem): string | null {
  switch (item.status) {
    case 'not_done':
      return item.kind === 'routine' ? 'non faite' : 'non terminée'
    case 'postponed':
      return item.movedTo === 'reserve' ? 'reportée en réserve' : `reportée au ${dayShort(item.movedTo ?? '')}`
    case 'skipped':
      return item.optional ? 'facultative · pas faite' : 'sautée'
    case 'deleted':
      return 'supprimée'
    default:
      return null
  }
}

export function ItemRow({
  item,
  mode,
  now,
  categories,
  onToggle,
  onOpen,
  onTimer,
  rootRef,
  rootProps,
  dragging,
  swipeActions,
}: Props) {
  const { highlight } = useNav()
  const lit = !!highlight && (highlight === item.taskId || highlight === item.routineId)
  const isDone = item.status === 'done'
  const isOpen = item.status === 'todo'
  const cat = item.categoryId ? categories.get(item.categoryId) : undefined
  const running = item.runningSince !== undefined
  const spent = liveSpentSec(item, now)
  // chrono sur une étape : on affiche le temps de l'étape, pas le total
  const runningStep = running && item.runningSubtaskId ? item.subtasks.find((x) => x.id === item.runningSubtaskId) : undefined
  const closedLook = !isOpen && !isDone
  const status = statusText(item)

  // Ligne de détails : heure, durée, temps passé, catégorie, nature
  const meta: React.ReactNode[] = []
  if (item.time) {
    const late = mode === 'today' && isOpen && timeOfDay(now) > item.time
    meta.push(
      <span
        key="time"
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold tabular ${
          late ? 'bg-bad-soft text-bad' : 'bg-accent-soft text-accent'
        }`}
      >
        <Icon name="clock" className="size-3" />
        {item.time}
        {late ? ' · en retard' : ''}
      </span>,
    )
  }
  if (isDone) {
    if (spent > 0) meta.push(<span key="t">{formatSec(spent)}{item.estimateMin ? ` (${formatMin(item.estimateMin)})` : ''}</span>)
    else if (item.estimateMin) meta.push(<span key="e">{formatMin(item.estimateMin)}</span>)
    if (item.unplanned) meta.push(<span key="u">imprévu</span>)
  } else if (status) {
    meta.push(<span key="s">{status}</span>)
    if (spent > 0) meta.push(<span key="t">{formatSec(spent)}</span>)
  } else {
    if (item.estimateMin) {
      meta.push(
        <span key="e">
          {spent > 0 ? `${formatSec(spent)} / ` : ''}
          {formatMin(item.estimateMin)}
        </span>,
      )
    } else {
      meta.push(
        <span key="n" className="text-warn">
          {spent > 0 ? `${formatSec(spent)} · ` : ''}sans durée
        </span>,
      )
    }
  }
  if (item.kind === 'routine' && item.optional && isOpen) meta.push(<span key="opt" className="italic">facultative</span>)
  if (item.kind === 'routine' && item.routineEnd && isOpen && mode === 'today') {
    meta.push(
      <span key="end" className="font-medium text-accent">
        {remainingLabel(item.routineEnd, item.date)}
      </span>,
    )
  }
  if (cat) {
    meta.push(
      <span key="c" className="inline-flex items-center gap-1">
        <CategoryDot color={cat.color} className="size-2" />
        {cat.name}
      </span>,
    )
  }

  return (
    <Swipeable
      actions={swipeActions}
      rootRef={rootRef}
      rootProps={rootProps}
      className={`rounded-2xl border bg-surface ${
        dragging ? 'border-accent shadow-lg' : lit ? 'border-accent ring-2 ring-accent' : 'border-line/70'
      }`}
    >
      <div ref={lit ? scrollIntoViewRef : undefined} className="flex items-center gap-3 px-3 py-2.5">
      {/* case à cocher */}
      {mode === 'today' && (isOpen || isDone) ? (
        <button
          type="button"
          aria-label={isDone ? 'Rouvrir' : 'Terminer'}
          onClick={() => onToggle(item)}
          className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90 ${
            isDone ? 'border-good bg-good text-on-accent' : 'border-line text-transparent'
          }`}
        >
          <Icon name="check" className="size-4" strokeWidth={3} />
        </button>
      ) : (
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${
            isDone
              ? 'border-good bg-good text-on-accent'
              : closedLook
                ? 'border-transparent bg-bg text-muted'
                : 'border-line/70 border-dashed'
          }`}
        >
          {isDone ? (
            <Icon name="check" className="size-4" strokeWidth={3} />
          ) : item.status === 'postponed' ? (
            <Icon name="arrow" className="size-4" />
          ) : item.status === 'skipped' ? (
            <Icon name="skip" className="size-3.5" />
          ) : closedLook ? (
            <Icon name="x" className="size-4" />
          ) : null}
        </span>
      )}

      {/* corps de la ligne */}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)}>
        <div className="flex items-center gap-1.5">
          <span
            className={`break-words text-[15px] font-medium leading-snug ${isDone || closedLook ? 'text-muted' : ''} ${
              isDone ? 'line-through decoration-muted/60' : ''
            }`}
          >
            {item.name}
          </span>
          {item.kind === 'routine' && <Icon name="repeat" className="size-3.5 shrink-0 text-muted" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {meta.map((m, i) => (
            <span key={i} className="inline-flex items-center">
              {m}
            </span>
          ))}
        </div>
      </button>

      {/* chrono */}
      {mode === 'today' && isOpen && (
        <div className="flex shrink-0 items-center gap-2">
          {running && (
            <span className="flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold tabular text-accent">
                {formatClock(runningStep ? liveStepSec(item, runningStep.id, now) : spent)}
              </span>
              {runningStep && <span className="max-w-24 truncate text-[10px] text-accent/80">{runningStep.name}</span>}
            </span>
          )}
          <button
            type="button"
            aria-label={running ? 'Mettre en pause' : 'Lancer le chrono'}
            onClick={() => onTimer(item)}
            className={`flex size-9 items-center justify-center rounded-full transition active:scale-90 ${
              running ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'
            }`}
          >
            <Icon name={running ? 'pause' : 'play'} className="size-4" fill={!running} />
          </button>
        </div>
      )}
      </div>
      {item.subtasksTotal > 0 && (
        <SubtaskDropdown
          taskId={item.taskId ?? item.id}
          item={item}
          now={now}
          subtasks={item.subtasks}
          runningSubtaskId={item.runningSubtaskId}
          timerEntryId={mode === 'today' && isOpen ? item.id : undefined}
          canCheck={mode === 'today' && isOpen}
          onOpen={() => onOpen(item)}
        />
      )}
    </Swipeable>
  )
}

/** Étapes ouvertes, mémorisées par tâche le temps de la session. */
const openSubtasks = new Set<string>()

export function SubtaskDropdown({
  taskId,
  item,
  now,
  subtasks,
  runningSubtaskId,
  timerEntryId,
  canCheck,
  onOpen,
}: {
  taskId: string
  /** Passage affiché : sert à cocher une étape de routine et à montrer le temps de chaque étape. */
  item?: DayItem
  now?: number
  subtasks: DayItem['subtasks']
  runningSubtaskId?: string
  /** Passage sur lequel lancer le chrono d'une étape ; absent = pas de chrono. */
  timerEntryId?: string
  canCheck: boolean
  onOpen: () => void
}) {
  const key = taskId
  const [open, setOpen] = useState(() => openSubtasks.has(key))
  const toggle = () => {
    if (open) openSubtasks.delete(key)
    else openSubtasks.add(key)
    setOpen(!open)
  }
  const total = subtasks.length
  const doneCount = subtasks.filter((x) => x.status === 'done').length
  const ratio = total ? doneCount / total : 0
  return (
    <div className="border-t border-line/70">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-accent-soft/60 px-3 py-2.5 text-left text-sm font-semibold text-accent"
      >
        <Icon name="down" className={`size-5 transition ${open ? 'rotate-180' : '-rotate-90'}`} />
        <span className="tabular">
          {doneCount}/{total} étapes
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-good transition-all" style={{ width: `${ratio * 100}%` }} />
        </span>
      </button>
      {open && (
        <ul className="pb-1.5">
          {subtasks.map((st) => {
            const done = st.status === 'done'
            const running = runningSubtaskId === st.id
            return (
              <li key={st.id} className="flex items-start gap-2.5 py-1.5 pl-5 pr-3">
                <button
                  type="button"
                  aria-label={done ? `Décocher ${st.name}` : `Cocher ${st.name}`}
                  disabled={!canCheck && !done}
                  onClick={() => void (item ? toggleItemStep(db, item, st.id, Date.now()) : toggleSubtask(db, st.id, Date.now()))}
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90 ${
                    done ? 'border-good bg-good text-on-accent' : 'border-line text-transparent'
                  }`}
                >
                  <Icon name="check" className="size-3" strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={onOpen}
                  className={`min-w-0 flex-1 break-words text-left text-sm leading-snug ${done ? 'text-muted line-through' : ''} ${running ? 'font-semibold text-accent' : ''}`}
                >
                  {st.name}
                </button>
                <StepTime item={item} step={st} now={now} />
                {timerEntryId && !done && (
                  <button
                    type="button"
                    aria-label={running ? 'Mettre en pause' : `Chrono sur ${st.name}`}
                    onClick={() => void (running ? pauseTimer(db, Date.now()) : startTimer(db, timerEntryId, Date.now(), st.id))}
                    className={`flex size-7 items-center justify-center rounded-full ${running ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'}`}
                  >
                    <Icon name={running ? 'pause' : 'play'} className="size-3" fill={!running} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Temps passé sur une étape face à son estimation (« 4:12 / 10 min »). */
function StepTime({ item, step, now }: { item?: DayItem; step: DayItem['subtasks'][number]; now?: number }) {
  const spent = item ? liveStepSec(item, step.id, now ?? Date.now()) : 0
  if (!spent && !step.estimateMin) return null
  const over = !!step.estimateMin && spent > step.estimateMin * 60
  return (
    <span className={`text-xs tabular ${over ? 'font-semibold text-bad' : 'text-muted'}`}>
      {spent > 0 ? (item?.runningSubtaskId === step.id ? formatClock(spent) : formatSec(spent)) : ''}
      {spent > 0 && step.estimateMin ? ' / ' : ''}
      {step.estimateMin ? formatMin(step.estimateMin) : ''}
    </span>
  )
}
