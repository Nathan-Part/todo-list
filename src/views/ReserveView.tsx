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
import { useEffect, useState } from 'react'
import { SubtaskDropdown } from '../components/ItemRow'
import { Swipeable } from '../components/Swipe'
import { CategoryDot, Icon, btnSoft } from '../components/ui'
import { db } from '../db'
import { deleteTask, planTask, reorderReserve, restoreTask, snapshotTask } from '../domain/actions'
import { useToast } from '../lib/toast'
import { addDays, diffDays } from '../domain/dates'
import type { ReserveItem } from '../domain/queries'
import { dayLabel, dayShort, formatMin, plural } from '../lib/format'
import { useCategories, useReserve } from '../lib/hooks'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'

function ReserveRow({ r }: { r: ReserveItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.task.id })
  const { today, setSheet, highlight } = useNav()
  const lit = highlight === r.task.id
  const { byId } = useCategories()
  const { completeTaskById } = useItemActions()
  const toast = useToast()
  const t = r.task
  const plan = async (day: string, label: string) => {
    await planTask(db, t.id, day, Date.now())
    toast({ text: `Planifiée ${label}`, duration: 2500 })
  }
  const remove = async () => {
    const snap = await snapshotTask(db, t.id)
    await deleteTask(db, t.id, Date.now())
    if (snap) toast({ text: 'Tâche supprimée', actionLabel: 'Annuler', onAction: () => void restoreTask(db, snap) })
  }
  const cat = t.categoryId ? byId.get(t.categoryId) : undefined
  const dueIn = t.dueDate ? diffDays(t.dueDate, today) : undefined
  const dueClass = dueIn !== undefined && dueIn <= 3 ? 'font-semibold text-bad' : 'text-muted'

  return (
    <Swipeable
      rootRef={setNodeRef}
      rootProps={{
        ...attributes,
        ...listeners,
        role: 'listitem',
        className: isDragging ? 'shadow-lg ring-2 ring-accent' : '',
        style: {
          transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
          transition,
          zIndex: isDragging ? 20 : undefined,
          position: 'relative',
        },
      }}
      actions={[
        { label: "Aujourd'hui", tone: 'accent', onClick: () => void plan(today, "aujourd'hui") },
        { label: 'Demain', tone: 'warn', onClick: () => void plan(addDays(today, 1), 'demain') },
        { label: 'Supprimer', tone: 'bad', onClick: () => void remove(), full: true },
      ]}
      className={`rounded-2xl border bg-surface ${lit ? 'border-accent ring-2 ring-accent' : 'border-line/70'}`}
    >
      <div
        ref={lit ? (el) => el?.scrollIntoView({ block: 'center', behavior: 'smooth' }) : undefined}
        className="flex items-center gap-3 px-3 py-2.5"
      >
      <button
        type="button"
        aria-label="Terminer"
        onClick={() => void completeTaskById(t, false)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-line text-transparent active:scale-90"
      >
        <Icon name="check" className="size-4" strokeWidth={3} />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => setSheet({ type: 'task', taskId: t.id })}
      >
        <div className="break-words text-[15px] font-medium leading-snug">{t.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {t.needsReview && t.reserveSince ? (
            <span className="font-medium text-warn">
              non terminée {dayLabel(addDays(t.reserveSince, -1), today).toLowerCase()}
            </span>
          ) : (
            <span>{r.ageDays === 0 ? 'ajoutée aujourd\'hui' : r.ageDays === 1 ? 'en réserve depuis hier' : `en réserve depuis ${r.ageDays} j`}</span>
          )}
          {r.postponedCount > 0 && <span>reportée {r.postponedCount}×</span>}
          {t.estimateMin ? <span>{formatMin(t.estimateMin)}</span> : <span className="text-warn">sans durée</span>}
          {t.dueDate && (
            <span className={dueClass}>
              échéance {dayShort(t.dueDate)}
              {dueIn !== undefined && dueIn < 0 ? ' (dépassée)' : dueIn !== undefined && dueIn <= 3 ? ` (dans ${dueIn} j)` : ''}
            </span>
          )}
          {cat && (
            <span className="inline-flex items-center gap-1">
              <CategoryDot color={cat.color} className="size-2" />
              {cat.name}
            </span>
          )}
        </div>
      </button>
      </div>
      {r.subtasks.length > 0 && (
        <SubtaskDropdown
          taskId={t.id}
          subtasks={r.subtasks}
          canCheck
          onOpen={() => setSheet({ type: 'task', taskId: t.id })}
        />
      )}
    </Swipeable>
  )
}

/** Section de la réserve dont on range les tâches par appui long puis glisser. */
function SortableSection({ items }: { items: ReserveItem[] }) {
  const [order, setOrder] = useState<string[] | null>(null)
  useEffect(() => setOrder(null), [items])
  const list = order
    ? order.map((id) => items.find((r) => r.task.id === id)).filter((r): r is ReserveItem => !!r)
    : items
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = list.map((r) => r.task.id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    setOrder(next)
    void reorderReserve(db, next)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={list.map((r) => r.task.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2" role="list">
          {list.map((r) => (
            <ReserveRow key={r.task.id} r={r} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export function ReserveView() {
  const { today, setSheet } = useNav()
  const reserve = useReserve(today)
  const review = (reserve ?? []).filter((r) => r.task.needsReview)
  const rest = (reserve ?? []).filter((r) => !r.task.needsReview)

  return (
    <div>
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Réserve</h1>
          <div className="text-sm text-muted">
            {reserve ? plural(reserve.length, 'tâche sans jour prévu', 'tâches sans jour prévu') : ' '}
          </div>
        </div>
        <button type="button" className={btnSoft} onClick={() => setSheet({ type: 'add', plan: 'reserve' })}>
          <Icon name="plus" className="size-4" />
          Ajouter
        </button>
      </div>

      {review.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-warn">À replanifier · {review.length}</h3>
            <button type="button" className="text-sm font-semibold text-accent" onClick={() => setSheet({ type: 'review' })}>
              Trier une par une
            </button>
          </div>
          <SortableSection items={review} />
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">En réserve · {rest.length}</h3>
          <SortableSection items={rest} />
          {rest.length > 1 && (
            <p className="mt-2 px-1 text-xs text-muted">Appui long sur une tâche puis glisse pour changer l'ordre.</p>
          )}
        </section>
      )}

      {reserve && reserve.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          La réserve est vide. Les tâches non terminées en fin de journée viendront ici, sans jamais disparaître.
        </div>
      )}
    </div>
  )
}
