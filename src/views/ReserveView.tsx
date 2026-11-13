import { CategoryDot, Icon, btnSoft } from '../components/ui'
import { addDays, diffDays } from '../domain/dates'
import type { ReserveItem } from '../domain/queries'
import { dayLabel, dayShort, formatMin, plural } from '../lib/format'
import { useCategories, useReserve } from '../lib/hooks'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'

function ReserveRow({ r }: { r: ReserveItem }) {
  const { today, setSheet } = useNav()
  const { byId } = useCategories()
  const { completeTaskById } = useItemActions()
  const t = r.task
  const cat = t.categoryId ? byId.get(t.categoryId) : undefined
  const dueIn = t.dueDate ? diffDays(t.dueDate, today) : undefined
  const dueClass = dueIn !== undefined && dueIn <= 3 ? 'font-semibold text-bad' : 'text-muted'

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-2.5">
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
        <div className="truncate text-[15px] font-medium">{t.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {t.needsReview && t.reserveSince ? (
            <span className="font-medium text-warn">
              non terminée {dayLabel(addDays(t.reserveSince, -1), today).toLowerCase()}
            </span>
          ) : (
            <span>en réserve depuis {r.ageDays} j</span>
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
          <div className="space-y-2">
            {review.map((r) => (
              <ReserveRow key={r.task.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">En réserve · {rest.length}</h3>
          <div className="space-y-2">
            {rest.map((r) => (
              <ReserveRow key={r.task.id} r={r} />
            ))}
          </div>
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
