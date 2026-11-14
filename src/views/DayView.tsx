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
import { useEffect, useMemo, useState } from 'react'
import { ItemRow, type RowMode } from '../components/ItemRow'
import { WeekStrip } from '../components/WeekStrip'
import { Icon } from '../components/ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from '../db'
import { reorderDay } from '../domain/actions'
import { addDays, weekdayIndex } from '../domain/dates'
import { type DayItem, computeDayStats } from '../domain/stats'
import { dayLabel, dayTitle, formatMin, formatSec, plural } from '../lib/format'
import { useCapacity, useCategories, useDayItems, useNow, useReserve, useRunningSession } from '../lib/hooks'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'

type RowProps = React.ComponentProps<typeof ItemRow>

function SortableRow(props: Omit<RowProps, 'rootRef' | 'rootProps' | 'dragging'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
  })
  return (
    <ItemRow
      {...props}
      rootRef={setNodeRef}
      dragging={isDragging}
      rootProps={{
        ...attributes,
        ...listeners,
        role: 'listitem',
        style: {
          transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
          transition,
          zIndex: isDragging ? 20 : undefined,
          position: 'relative',
        },
      }}
    />
  )
}

/** Sans sauvegarde automatique, on rappelle d'exporter ses données chaque semaine. */
function ExportReminder() {
  const { setSheet } = useNav()
  const info = useLiveQuery(async () => {
    const last = await getMeta<number | undefined>(db, 'lastExport', undefined)
    const first = await db.entries.orderBy('date').first()
    return { last, first: first?.date }
  }, [])
  const now = Date.now()
  if (!info?.first) return null
  const since = info.last ?? new Date(info.first).getTime()
  if (now - since < 7 * 86_400_000) return null
  return (
    <button
      type="button"
      onClick={() => setSheet({ type: 'settings' })}
      className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-left text-accent"
    >
      <Icon name="inbox" className="size-5 shrink-0" />
      <span className="flex-1 text-sm font-medium">
        {info.last ? 'Dernier export il y a plus de 7 jours' : 'Pense à exporter tes données'} : c'est ta sauvegarde.
      </span>
      <Icon name="right" className="size-4" />
    </button>
  )
}

function Banner() {
  const { today, setSheet } = useNav()
  const reserve = useReserve(today)
  if (!reserve) return null
  const review = reserve.filter((r) => r.task.needsReview).length
  const soon = reserve.filter(
    (r) => !r.task.needsReview && r.task.dueDate && r.task.dueDate <= addDays(today, 3),
  )
  if (review === 0 && soon.length === 0) return null
  const overdue = soon.filter((r) => r.task.dueDate! < today).length
  return (
    <div className="mt-3 space-y-2">
      {review > 0 && (
        <button
          type="button"
          onClick={() => setSheet({ type: 'review' })}
          className="flex w-full items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-left text-warn active:scale-[.99]"
        >
          <Icon name="alert" className="size-5 shrink-0" />
          <span className="flex-1 text-sm font-medium">
            {plural(review, 'tâche', 'tâches')} à replanifier
          </span>
          <span className="text-sm font-semibold">Trier</span>
          <Icon name="right" className="size-4" />
        </button>
      )}
      {soon.length > 0 && (
        <button
          type="button"
          onClick={() => (review > 0 ? setSheet({ type: 'review' }) : setSheet({ type: 'task', taskId: soon[0].task.id }))}
          className="flex w-full items-center gap-3 rounded-2xl bg-bad-soft px-4 py-3 text-left text-bad active:scale-[.99]"
        >
          <Icon name="clock" className="size-5 shrink-0" />
          <span className="flex-1 text-sm font-medium">
            {overdue > 0
              ? `${plural(overdue, 'échéance dépassée', 'échéances dépassées')}`
              : `${plural(soon.length, 'échéance proche', 'échéances proches')}`}
            {overdue > 0 && soon.length > overdue ? ` · ${soon.length - overdue} proche(s)` : ''}
          </span>
          <Icon name="right" className="size-4" />
        </button>
      )}
    </div>
  )
}

/** Frise du temps réel : quand tu as travaillé sur quoi, d'après le chrono. */
function Timeline({ items, day, now }: { items: DayItem[]; day: string; now: number }) {
  const { byId } = useCategories()
  const [y, m, d] = day.split('-').map(Number)
  const dayStart = new Date(y, m - 1, d).getTime()
  const segs = items.flatMap((i) =>
    i.segments.map((s) => ({
      start: (s.start - dayStart) / 3_600_000,
      end: ((s.end ?? now) - dayStart) / 3_600_000,
      color: (i.categoryId && byId.get(i.categoryId)?.color) || 'var(--accent)',
      name: i.name,
    })),
  )
  if (segs.length === 0) return null
  const from = Math.max(0, Math.min(7, Math.floor(Math.min(...segs.map((s) => s.start)))))
  const to = Math.min(24, Math.max(22, Math.ceil(Math.max(...segs.map((s) => s.end)))))
  const pct = (h: number) => `${((Math.min(to, Math.max(from, h)) - from) / (to - from)) * 100}%`
  return (
    <div className="mt-3">
      <div className="text-xs text-muted">Frise</div>
      <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-line" aria-label="Frise du temps réel">
        {segs.map((s, i) => (
          <span
            key={i}
            title={s.name}
            className="absolute inset-y-0 rounded-full"
            style={{ left: pct(s.start), width: `max(3px, calc(${pct(s.end)} - ${pct(s.start)}))`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular text-muted">
        <span>{from} h</span>
        <span>{Math.round((from + to) / 2)} h</span>
        <span>{to} h</span>
      </div>
    </div>
  )
}

function KeyFigures({ items, mode, now, day }: { items: DayItem[]; mode: RowMode; now: number; day: string }) {
  const capacity = useCapacity()
  const [open, setOpen] = useState(false)
  const s = computeDayStats(items, now)
  const cap = capacity[weekdayIndex(day)] ?? 0
  const over = cap > 0 && s.loadMin > cap
  const ratio = cap > 0 ? Math.min(1, s.loadMin / cap) : 0
  const progress = s.planned > 0 ? s.done / s.planned : 0
  const unplannedSec = items.filter((i) => i.unplanned).reduce((n, i) => n + i.spentSec, 0)

  const headline =
    mode === 'future'
      ? `${plural(s.planned, 'élément prévu', 'éléments prévus')}`
      : `${s.done}/${s.planned} faites`
  const sub =
    mode === 'today'
      ? s.planned - s.done > 0
        ? `reste ${formatMin(s.remainingMin)}`
        : s.planned > 0
          ? 'journée terminée'
          : ''
      : mode === 'past'
        ? `${formatSec(s.spentSec)} passées`
        : ''

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="mt-3 block w-full rounded-2xl border border-line/70 bg-surface p-3.5 text-left"
      aria-expanded={open}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold">
          {headline}
          {sub && <span className="ml-2 text-sm font-normal text-muted">· {sub}</span>}
        </span>
        <Icon name="down" className={`size-4 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </div>
      {mode !== 'future' && s.planned > 0 && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {cap === 0 && s.loadMin > 0 && (
        <div className="mt-3 flex items-baseline justify-between text-xs">
          <span className="text-muted">Charge</span>
          <span className="tabular text-muted">{formatMin(s.loadMin)}</span>
        </div>
      )}
      {cap > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Charge</span>
            <span className={`tabular ${over ? 'font-semibold text-bad' : 'text-muted'}`}>
              {formatMin(s.loadMin)} / {formatMin(cap)}
              {over ? ` · dépasse de ${formatMin(s.loadMin - cap)}` : ''}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-all ${over ? 'bg-bad' : 'bg-accent'}`}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>
      )}
      {mode !== 'future' && <Timeline items={items} day={day} now={now} />}
      {open && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs">
          <dt className="text-muted">Temps estimé (total)</dt>
          <dd className="text-right tabular">{formatMin(s.loadMin)}</dd>
          <dt className="text-muted">Temps passé</dt>
          <dd className="text-right tabular">{formatSec(s.spentSec)}</dd>
          <dt className="text-muted">Dont imprévus</dt>
          <dd className="text-right tabular">{formatSec(unplannedSec)}</dd>
          <dt className="text-muted">Sans durée</dt>
          <dd className="text-right tabular">{s.noEstimate}</dd>
          <dt className="text-muted">Reportées</dt>
          <dd className="text-right tabular">{s.postponed}</dd>
          <dt className="text-muted">Temps disponible</dt>
          <dd className="text-right tabular">{cap > 0 ? formatMin(cap) : 'non défini'}</dd>
          <dd className="col-span-2 text-muted">Modifiable dans les réglages (roue dentée en haut à droite).</dd>
        </dl>
      )}
    </button>
  )
}

export function DayView() {
  const { today, selectedDay, setSelectedDay, setSheet } = useNav()
  const items = useDayItems(selectedDay, today)
  const { byId: categories } = useCategories()
  const running = useRunningSession()
  const now = useNow(running ? 1000 : 20_000)
  const actions = useItemActions()
  const [order, setOrder] = useState<string[] | null>(null)
  const [showOther, setShowOther] = useState(false)

  const mode: RowMode = selectedDay === today ? 'today' : selectedDay > today ? 'future' : 'past'

  // l'ordre local n'est qu'un relais le temps que la base se mette à jour
  useEffect(() => setOrder(null), [items])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const groups = useMemo(() => {
    const all = items ?? []
    if (mode === 'past') return { open: [] as DayItem[], done: [] as DayItem[], other: [] as DayItem[], all }
    const byId = new Map(all.map((i) => [i.id, i]))
    let open = all.filter((i) => i.status === 'todo')
    if (order) open = order.map((id) => byId.get(id)).filter((i): i is DayItem => !!i)
    return {
      open,
      done: all.filter((i) => i.status === 'done'),
      other: all.filter((i) => i.status !== 'todo' && i.status !== 'done'),
      all,
    }
  }, [items, mode, order])

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = groups.open.map((i) => i.id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    setOrder(next)
    void reorderDay(db, selectedDay, next)
  }

  const tomorrow = addDays(today, 1)
  const swipeFor = (item: DayItem): RowProps['swipeActions'] => {
    const del = { label: 'Supprimer', tone: 'bad' as const, onClick: () => void actions.remove(item), full: true }
    const recover = { label: 'Récupérer', tone: 'accent' as const, onClick: () => void actions.recover(item) }
    if (item.status === 'deleted') return item.taskId ? [{ ...recover, full: true }] : undefined
    if (item.status === 'skipped') return [recover, del]
    if (item.status === 'postponed') return [del]
    if (mode === 'past' || item.status !== 'todo') return undefined
    if (item.kind === 'routine') return [{ label: 'Sauter', tone: 'muted', onClick: () => void actions.skip(item) }, del]
    const list: NonNullable<RowProps['swipeActions']> = []
    if (item.date !== tomorrow) list.push({ label: 'Demain', tone: 'accent', onClick: () => void actions.postpone(item, tomorrow) })
    list.push({ label: 'Réserve', tone: 'warn', onClick: () => void actions.postpone(item, 'reserve') })
    list.push(del)
    return list
  }

  const rowProps = {
    mode,
    now,
    categories,
    onToggle: actions.toggle,
    onOpen: actions.open,
    onTimer: actions.timer,
  }

  const title = dayTitle(selectedDay)
  const loaded = items !== undefined

  return (
    <div>
      <div className="flex items-start justify-between gap-2 pt-1">
        <h1 className="min-w-0 text-2xl font-bold leading-tight tracking-tight">{title}</h1>
        <button
          type="button"
          aria-label="Réglages"
          onClick={() => setSheet({ type: 'settings' })}
          className="-mr-2 shrink-0 rounded-full p-2 text-muted active:bg-surface"
        >
          <Icon name="gear" />
        </button>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <div className="text-sm text-muted">
          {mode === 'today' ? "Aujourd'hui" : dayLabel(selectedDay, today)}
          {mode === 'past' && ' · bilan'}
        </div>
        <div className="-mr-2 flex shrink-0 items-center gap-0.5">
          {mode !== 'today' && (
            <button
              type="button"
              onClick={() => setSelectedDay(today)}
              className="mr-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent"
            >
              Aujourd'hui
            </button>
          )}
          <button
            type="button"
            aria-label="Jour précédent"
            onClick={() => setSelectedDay(addDays(selectedDay, -1))}
            className="rounded-full p-1.5 text-muted active:bg-surface"
          >
            <Icon name="left" />
          </button>
          <button
            type="button"
            aria-label="Jour suivant"
            onClick={() => setSelectedDay(addDays(selectedDay, 1))}
            className="rounded-full p-1.5 text-muted active:bg-surface"
          >
            <Icon name="right" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <WeekStrip selected={selectedDay} today={today} onSelect={setSelectedDay} />
      </div>

      {mode === 'today' && <Banner />}
      {mode === 'today' && <ExportReminder />}
      {loaded && items.length > 0 && <KeyFigures items={items} mode={mode} now={now} day={selectedDay} />}

      <div className="mt-4 space-y-2" role="list">
        {loaded && mode === 'past' &&
          groups.all.map((item) => <ItemRow key={item.id} item={item} {...rowProps} swipeActions={swipeFor(item)} />)}

        {loaded && mode !== 'past' && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={groups.open.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {groups.open.map((item) => (
                <SortableRow key={item.id} item={item} {...rowProps} swipeActions={swipeFor(item)} />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {loaded && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            {mode === 'past' ? 'Rien n\'a été enregistré ce jour-là.' : 'Rien de prévu. Touche + pour ajouter une tâche.'}
          </div>
        )}
        {loaded && mode !== 'past' && items.length > 0 && groups.open.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Tout est fait pour ce jour. 🎉
          </div>
        )}
      </div>

      {mode !== 'past' && groups.done.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Fait · {groups.done.length}
          </h3>
          <div className="space-y-2" role="list">
            {groups.done.map((item) => (
              <ItemRow key={item.id} item={item} {...rowProps} />
            ))}
          </div>
        </section>
      )}

      {mode !== 'past' && groups.other.length > 0 && (
        <section className="mt-5">
          <button
            type="button"
            onClick={() => setShowOther((o) => !o)}
            className="mb-2 flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Reportées · sautées · {groups.other.length}
            <Icon name="down" className={`size-3.5 transition ${showOther ? 'rotate-180' : ''}`} />
          </button>
          {showOther && (
            <div className="space-y-2" role="list">
              {groups.other.map((item) => (
                <ItemRow key={item.id} item={item} {...rowProps} swipeActions={swipeFor(item)} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
