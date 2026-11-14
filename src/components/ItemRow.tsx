import { type HTMLAttributes, type Ref, useRef, useState } from 'react'
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
  swipeActions?: { label: string; tone: 'accent' | 'warn' | 'muted' | 'bad'; onClick: () => void }[]
}

const ACTION_W = 78
const TONES = { accent: 'bg-accent text-on-accent', warn: 'bg-warn text-surface', muted: 'bg-muted text-surface', bad: 'bg-bad text-surface' }

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
  const [dx, setDx] = useState(0)
  const [anim, setAnim] = useState(false)
  const start = useRef<{ x: number; y: number; base: number; dir?: 'h' | 'v' } | null>(null)
  const maxOpen = (swipeActions?.length ?? 0) * ACTION_W
  const swipeHandlers = swipeActions?.length
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: dx }
          setAnim(false)
        },
        onTouchMove: (e: React.TouchEvent) => {
          const st = start.current
          if (!st) return
          const mx = e.touches[0].clientX - st.x
          const my = e.touches[0].clientY - st.y
          if (!st.dir && (Math.abs(mx) > 10 || Math.abs(my) > 10)) st.dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
          if (st.dir === 'h') setDx(Math.max(-maxOpen - 24, Math.min(0, st.base + mx)))
        },
        onTouchEnd: () => {
          const st = start.current
          start.current = null
          if (!st || st.dir !== 'h') return
          setAnim(true)
          setDx((cur) => (cur < -maxOpen / 2 ? -maxOpen : 0))
        },
      }
    : {}
  const close = () => {
    setAnim(true)
    setDx(0)
  }
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
  if (item.subtasksTotal > 0) {
    meta.push(
      <span key="st" className="tabular">
        {item.subtasksDone}/{item.subtasksTotal} étapes
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
    <div ref={rootRef} {...rootProps} className={`relative overflow-hidden rounded-2xl ${rootProps?.className ?? ''}`}>
      {swipeActions && dx < 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {swipeActions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                close()
                a.onClick()
              }}
              className={`flex items-center justify-center text-sm font-semibold ${TONES[a.tone]}`}
              style={{ width: ACTION_W }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    <div
      {...swipeHandlers}
      onClickCapture={(e) => {
        if (dx !== 0) {
          e.stopPropagation()
          e.preventDefault()
          close()
        }
      }}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
      className={`relative flex items-center gap-3 rounded-2xl border bg-surface px-3 py-2.5 ${
        anim ? 'transition-transform duration-200' : ''
      } ${dragging ? 'border-accent shadow-lg' : 'border-line/70'}`}
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
    </div>
  )
}
