import { type HTMLAttributes, type Ref, useState } from 'react'
import { db } from '../db'
import { pauseTimer, startTimer, toggleSubtask } from '../domain/actions'
import { type SwipeAction, Swipeable } from './Swipe'
import { remainingLabel } from './pickers'
import type { DayItem } from '../domain/stats'
import { liveSpentSec } from '../domain/stats'
import type { Category } from '../domain/types'
import { dayShort, formatClock, formatMin, formatSec } from '../lib/format'
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
      return 'sautée'
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
  const isDone = item.status === 'done'
  const isOpen = item.status === 'todo'
  const cat = item.categoryId ? categories.get(item.categoryId) : undefined
  const running = item.runningSince !== undefined
  const spent = liveSpentSec(item, now)
  const closedLook = !isOpen && !isDone
  const status = statusText(item)

  // Ligne de détails : durée, temps passé, catégorie, nature
  const meta: React.ReactNode[] = []
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
      className={`rounded-2xl border bg-surface ${dragging ? 'border-accent shadow-lg' : 'border-line/70'}`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
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
            className={`truncate text-[15px] font-medium ${isDone || closedLook ? 'text-muted' : ''} ${
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
          {running && <span className="text-sm font-semibold tabular text-accent">{formatClock(spent)}</span>}
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
        <SubtaskDropdown item={item} canAct={mode === 'today' && isOpen} onOpen={() => onOpen(item)} />
      )}
    </Swipeable>
  )
}

/** Étapes ouvertes, mémorisées par tâche le temps de la session. */
const openSubtasks = new Set<string>()

function SubtaskDropdown({ item, canAct, onOpen }: { item: DayItem; canAct: boolean; onOpen: () => void }) {
  const key = item.taskId ?? item.id
  const [open, setOpen] = useState(() => openSubtasks.has(key))
  const toggle = () => {
    if (open) openSubtasks.delete(key)
    else openSubtasks.add(key)
    setOpen(!open)
  }
  const ratio = item.subtasksTotal ? item.subtasksDone / item.subtasksTotal : 0
  return (
    <div className="border-t border-line/70">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-accent"
      >
        <Icon name="down" className={`size-4 transition ${open ? 'rotate-180' : '-rotate-90'}`} />
        <span className="tabular">
          {item.subtasksDone}/{item.subtasksTotal} étapes
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-good transition-all" style={{ width: `${ratio * 100}%` }} />
        </span>
      </button>
      {open && (
        <ul className="pb-1.5">
          {item.subtasks.map((st) => {
            const done = st.status === 'done'
            const running = item.runningSubtaskId === st.id
            return (
              <li key={st.id} className="flex items-center gap-2.5 py-1.5 pl-5 pr-3">
                <button
                  type="button"
                  aria-label={done ? `Décocher ${st.name}` : `Cocher ${st.name}`}
                  disabled={!canAct && !done}
                  onClick={() => void toggleSubtask(db, st.id, Date.now())}
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90 ${
                    done ? 'border-good bg-good text-on-accent' : 'border-line text-transparent'
                  }`}
                >
                  <Icon name="check" className="size-3" strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={onOpen}
                  className={`min-w-0 flex-1 truncate text-left text-sm ${done ? 'text-muted line-through' : ''} ${running ? 'font-semibold text-accent' : ''}`}
                >
                  {st.name}
                </button>
                {st.estimateMin ? <span className="text-xs text-muted tabular">{formatMin(st.estimateMin)}</span> : null}
                {canAct && !done && (
                  <button
                    type="button"
                    aria-label={running ? 'Mettre en pause' : `Chrono sur ${st.name}`}
                    onClick={() => void (running ? pauseTimer(db, Date.now()) : startTimer(db, item.id, Date.now(), st.id))}
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
