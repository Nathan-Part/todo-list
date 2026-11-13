import { useLiveQuery } from 'dexie-react-hooks'
import { CategoryDot, Icon, btnGhost, btnPrimary } from '../components/ui'
import { db } from '../db'
import { endPause } from '../domain/actions'
import { type RoutineDetail, loadRoutineDetail } from '../domain/queries'
import { frequencyLabel } from '../domain/routines'
import type { GridState } from '../domain/queries'
import { dayShort, formatMin, plural } from '../lib/format'
import { useCategories } from '../lib/hooks'
import { useNav } from '../lib/nav'

export const GRID_STYLE: Record<GridState, string> = {
  done: 'bg-good',
  not_done: 'bg-bad/70',
  skipped: 'bg-muted/40',
  postponed: 'bg-warn/50',
  todo: 'bg-accent/30 ring-2 ring-accent',
  pause: 'bg-line',
  none: 'bg-transparent border border-line/60',
  future: 'bg-transparent border border-dashed border-accent/60',
}

export function RoutinesView() {
  const { today, setSheet } = useNav()
  const { byId } = useCategories()
  const data = useLiveQuery(async () => {
    const routines = (await db.routines.toArray())
      .filter((r) => !r.archivedAt)
      .sort((a, b) => a.position - b.position)
    // lectures lancées ensemble pour rester suivies en direct (voir domain/queries.ts)
    const [details, pauses] = await Promise.all([
      Promise.all(routines.map((r) => loadRoutineDetail(db, r.id, today))),
      db.pauses.toArray(),
    ])
    return { details: details.filter((d): d is RoutineDetail => !!d), pauses }
  }, [today])

  const activeAll = data?.pauses.find(
    (p) => p.routineId === undefined && p.fromDate <= today && (p.toDate === undefined || p.toDate >= today),
  )
  const pausedIds = new Set(
    (data?.pauses ?? [])
      .filter((p) => p.routineId && p.fromDate <= today && (p.toDate === undefined || p.toDate >= today))
      .map((p) => p.routineId),
  )

  return (
    <div>
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Routines</h1>
          <div className="text-sm text-muted">
            {data ? plural(data.details.length, 'routine', 'routines') : ' '}
          </div>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setSheet({ type: 'routine', routineId: 'new' })}>
          <Icon name="plus" className="size-4" />
          Nouvelle
        </button>
      </div>

      {activeAll ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-warn">
          <Icon name="pause" className="size-5 shrink-0" />
          <span className="flex-1 text-sm font-medium">
            Toutes les routines sont en pause
            {activeAll.toDate ? ` jusqu'au ${dayShort(activeAll.toDate)}` : ''}
          </span>
          <button type="button" className="text-sm font-semibold" onClick={() => void endPause(db, activeAll.id, Date.now())}>
            Reprendre
          </button>
        </div>
      ) : (
        data &&
        data.details.length > 0 && (
          <div className="mt-4">
            <button type="button" className={btnGhost} onClick={() => setSheet({ type: 'pause' })}>
              <Icon name="pause" className="size-4" />
              Tout mettre en pause
            </button>
          </div>
        )
      )}

      <div className="mt-4 space-y-2">
        {data?.details.map(({ routine: r, month, grid }) => {
          const cat = r.categoryId ? byId.get(r.categoryId) : undefined
          const last7 = grid.filter((g) => g.day <= today).slice(-7)
          const pct = month.total > 0 ? Math.round((month.done / month.total) * 100) : undefined
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSheet({ type: 'routine', routineId: r.id })}
              className="block w-full rounded-2xl border border-line/70 bg-surface p-3.5 text-left active:scale-[.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {cat && <CategoryDot color={cat.color} />}
                    <span className="truncate text-[15px] font-semibold">{r.name}</span>
                    {(pausedIds.has(r.id) || activeAll) && (
                      <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-warn">
                        pause
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {frequencyLabel(r.frequency)}
                    {r.estimateMin ? ` · ${formatMin(r.estimateMin)}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-semibold tabular leading-none">{pct !== undefined ? `${pct} %` : '–'}</div>
                  <div className="mt-0.5 text-[10px] text-muted">30 jours</div>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                {last7.map((g) => (
                  <span key={g.day} className={`h-2.5 flex-1 rounded-full ${GRID_STYLE[g.state]}`} title={g.day} />
                ))}
              </div>
            </button>
          )
        })}
        {data && data.details.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            Aucune routine. Crée-en une pour que tes habitudes reviennent toutes seules dans ta journée.
          </div>
        )}
      </div>
    </div>
  )
}
