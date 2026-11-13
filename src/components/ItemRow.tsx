import type { HTMLAttributes, Ref } from 'react'
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
  if (cat) {
    meta.push(
      <span key="c" className="inline-flex items-center gap-1">
        <CategoryDot color={cat.color} className="size-2" />
        {cat.name}
      </span>,
    )
  }

  return (
    <div
      ref={rootRef}
      {...rootProps}
      className={`flex items-center gap-3 rounded-2xl border bg-surface px-3 py-2.5 ${
        dragging ? 'border-accent shadow-lg' : 'border-line/70'
      } ${rootProps?.className ?? ''}`}
    >
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
  )
}
