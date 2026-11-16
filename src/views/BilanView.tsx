import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { CategoryDot, Icon, inputClass } from '../components/ui'
import { db } from '../db'
import { addDays, startOfWeek } from '../domain/dates'
import { computeGaps } from '../domain/insights'
import { loadWeekReview } from '../domain/review'
import { dayLabel, dayShort, formatSec, plural, timeOfDay, weekdayLetter } from '../lib/format'
import { useCapacity, useCategories, useDayItems, useNow } from '../lib/hooks'
import { useNav } from '../lib/nav'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

function Search() {
  const { setSheet } = useNav()
  const [q, setQ] = useState('')
  const results = useLiveQuery(async () => {
    const needle = norm(q.trim())
    if (needle.length < 2) return []
    const tasks = (await db.tasks.toArray()).filter((t) => norm(`${t.name} ${t.note ?? ''}`).includes(needle))
    const routines = (await db.routines.toArray()).filter((r) => norm(`${r.name} ${r.note ?? ''}`).includes(needle))
    return [
      ...tasks.map((t) => ({
        key: t.id,
        name: t.name,
        info: t.status === 'done' ? `faite le ${dayShort(t.doneDate ?? '')}` : t.status === 'deleted' ? 'supprimée' : 'à faire',
        open: () => setSheet({ type: 'task', taskId: t.id }),
      })),
      ...routines.map((r) => ({
        key: r.id,
        name: r.name,
        info: r.archivedAt ? 'routine archivée' : 'routine',
        open: () => setSheet({ type: 'routine', routineId: r.id }),
      })),
    ].slice(0, 30)
  }, [q])

  return (
    <div className="mt-4">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une tâche ou une routine"
          className={`${inputClass} pl-10`}
          type="search"
          enterKeyHint="search"
        />
      </div>
      {results && results.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line/70 bg-surface">
          {results.map((r) => (
            <li key={r.key}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-bg" onClick={r.open}>
                <span className="min-w-0 truncate text-[15px]">{r.name}</span>
                <span className="shrink-0 text-xs text-muted">{r.info}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results && results.length === 0 && norm(q.trim()).length >= 2 && (
        <div className="mt-2 px-1 text-sm text-muted">Aucun résultat.</div>
      )}
    </div>
  )
}

/** Résumé d'une journée : ce que tu as fait, à quelle heure, combien de temps. */
function DaySummary() {
  const { today, setSheet } = useNav()
  const [day, setDay] = useState(today)
  const items = useDayItems(day, today)
  const { byId } = useCategories()
  const now = useNow(30_000)
  if (!items) return null

  const timed = items
    .flatMap((i) =>
      i.segments.map((sg) => ({
        item: i,
        start: sg.start,
        end: sg.end ?? now,
        running: sg.end === undefined,
      })),
    )
    .sort((a, b) => a.start - b.start)
  const gaps = computeGaps(
    timed.map((t) => ({ start: t.start, end: t.end, name: t.item.name })),
    day === today && !timed.some((t) => t.running) ? now : undefined,
  )
  const shortGaps = gaps.filter((g) => g.kind === 'short')
  const shortTotal = shortGaps.reduce((n, g) => n + g.minutes, 0)
  const gapTotal = gaps.reduce((n, g) => n + g.minutes, 0)
  const timedIds = new Set(timed.map((t) => t.item.id))
  const untimed = items.filter((i) => i.status === 'done' && !timedIds.has(i.id))
  const done = items.filter((i) => i.status === 'done').length
  const totalSec = items.reduce((n, i) => n + i.spentSec, 0) + timed.filter((t) => t.running).reduce((n, t) => n + (now - t.start) / 1000, 0)
  const open = (i: (typeof items)[number]) =>
    i.kind === 'task' && i.taskId ? setSheet({ type: 'task', taskId: i.taskId, entryId: i.id }) : setSheet({ type: 'occurrence', entryId: i.id })

  return (
    <section className="mt-4 rounded-2xl border border-line/70 bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Ma journée</h3>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Jour précédent" onClick={() => setDay(addDays(day, -1))} className="rounded-full p-1.5 text-muted active:bg-bg">
            <Icon name="left" className="size-4" />
          </button>
          <span className="min-w-24 text-center text-sm font-semibold">{dayLabel(day, today)}</span>
          <button
            type="button"
            aria-label="Jour suivant"
            disabled={day >= today}
            onClick={() => setDay(addDays(day, 1))}
            className="rounded-full p-1.5 text-muted active:bg-bg disabled:opacity-30"
          >
            <Icon name="right" className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-1 text-sm text-muted">
        {plural(done, 'chose faite', 'choses faites')} · {formatSec(totalSec)} de travail enregistré
      </div>

      {timed.length === 0 && untimed.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Rien d'enregistré ce jour-là.</p>
      ) : (
        <ol className="mt-3 space-y-0.5">
          {timed.map((t, idx) => {
            const cat = t.item.categoryId ? byId.get(t.item.categoryId) : undefined
            return (
              <li key={idx}>
                <button type="button" onClick={() => open(t.item)} className="flex w-full items-start gap-3 rounded-xl px-1 py-1.5 text-left active:bg-bg">
                  <span className="w-[5.5rem] shrink-0 pt-0.5 text-xs font-semibold tabular text-muted">
                    {timeOfDay(t.start)}–{t.running ? '…' : timeOfDay(t.end)}
                  </span>
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cat?.color ?? 'var(--accent)' }} />
                  <span className="min-w-0 flex-1 break-words text-sm leading-snug">
                    {t.item.name}
                    {t.item.status === 'done' && <Icon name="check" className="ml-1 inline size-3.5 text-good" strokeWidth={3} />}
                    {t.running && <span className="ml-1 text-xs text-accent">en cours</span>}
                  </span>
                  <span className="shrink-0 pt-0.5 text-xs tabular text-muted">{formatSec((t.end - t.start) / 1000)}</span>
                </button>
              </li>
            )
          })}
          {untimed.length > 0 && (
            <li className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Sans horaire</li>
          )}
          {untimed.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => open(i)} className="flex w-full items-start gap-3 rounded-xl px-1 py-1.5 text-left active:bg-bg">
                <span className="w-[5.5rem] shrink-0 pt-0.5 text-xs text-muted">—</span>
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: (i.categoryId && byId.get(i.categoryId)?.color) || 'var(--muted)' }} />
                <span className="min-w-0 flex-1 break-words text-sm leading-snug">
                  {i.name} <Icon name="check" className="inline size-3.5 text-good" strokeWidth={3} />
                </span>
                <span className="shrink-0 pt-0.5 text-xs tabular text-muted">{i.spentSec > 0 ? formatSec(i.spentSec) : 'durée ?'}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {gaps.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Trous dans la journée</h4>
            <span className="text-sm font-semibold tabular text-warn">{formatSec(gapTotal * 60)}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {gaps.map((g) => (
              <li key={g.start}>
                <button
                  type="button"
                  onClick={() => setSheet({ type: 'gap', startAt: g.start, endAt: g.end })}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left ${
                    g.kind === 'long' ? 'bg-warn-soft' : 'bg-bg'
                  }`}
                >
                  <span className="min-w-0 flex-1 text-sm leading-snug">
                    {g.kind === 'long' ? (
                      <>
                        De <span className="font-semibold tabular">{timeOfDay(g.start)}</span> à{' '}
                        <span className="font-semibold tabular">{g.after ? timeOfDay(g.end) : 'maintenant'}</span> : rien d'enregistré.
                        Tu faisais quoi ?
                      </>
                    ) : (
                      <>
                        <span className="tabular">{timeOfDay(g.start)}–{timeOfDay(g.end)}</span> · coupure entre «&nbsp;{g.before}&nbsp;» et
                        «&nbsp;{g.after}&nbsp;»
                      </>
                    )}
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular ${g.kind === 'long' ? 'text-warn' : 'text-muted'}`}>
                    {formatSec(g.minutes * 60)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {shortGaps.length > 1
              ? `${shortGaps.length} petites coupures entre tes tâches : ${formatSec(shortTotal * 60)} perdues. `
              : shortGaps.length === 1
                ? `Une petite coupure : ${formatSec(shortTotal * 60)} perdues. `
                : ''}
            Touche un trou pour noter ce que tu faisais (pause, repas, trajet…).
          </p>
        </div>
      )}
      {untimed.some((i) => i.spentSec === 0) && (
        <p className="mt-2 text-xs text-muted">Touche une tâche « durée ? » pour indiquer de quand à quand tu l'as faite.</p>
      )}
    </section>
  )
}

export function BilanView() {
  const { today } = useNav()
  const [anchor, setAnchor] = useState(today)
  const capacity = useCapacity()
  const { byId } = useCategories()
  const review = useLiveQuery(() => loadWeekReview(db, anchor, today, capacity), [anchor, today, capacity.join(',')])
  const start = startOfWeek(anchor)
  const end = addDays(start, 6)
  const isCurrent = start === startOfWeek(today)

  const pct = review && review.planned > 0 ? Math.round((review.done / review.planned) * 100) : undefined
  const maxCat = review?.byCategory[0]?.sec ?? 1

  return (
    <div>
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bilan</h1>
          <div className="text-sm text-muted">
            {dayShort(start)} → {dayShort(end)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isCurrent && (
            <button type="button" onClick={() => setAnchor(today)} className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
              Cette semaine
            </button>
          )}
          <button type="button" aria-label="Semaine précédente" onClick={() => setAnchor(addDays(start, -7))} className="rounded-full p-2 text-muted active:bg-surface">
            <Icon name="left" />
          </button>
          <button type="button" aria-label="Semaine suivante" onClick={() => setAnchor(addDays(start, 7))} className="rounded-full p-2 text-muted active:bg-surface">
            <Icon name="right" />
          </button>
        </div>
      </div>

      <Search />

      <DaySummary />

      {review && (
        <>
          <section className="mt-4 rounded-2xl border border-line/70 bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Réalisation</h3>
              <span className="text-2xl font-bold tabular">{pct !== undefined ? `${pct} %` : '–'}</span>
            </div>
            <div className="text-sm text-muted">
              {review.done} / {review.planned} faites jusqu'à aujourd'hui
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {review.days.map((d) => {
                const ratio = d.planned ? d.done / d.planned : 0
                return (
                  <div key={d.day} className={`flex flex-col items-center gap-1 ${d.future ? 'opacity-40' : ''}`}>
                    <div className="flex h-16 w-full items-end overflow-hidden rounded-lg bg-bg">
                      <div className="w-full rounded-lg bg-good" style={{ height: `${ratio * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-muted">{weekdayLetter(d.day)}</span>
                    <span className="text-[10px] tabular text-muted">
                      {d.planned ? `${d.done}/${d.planned}` : '–'}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-line/70 bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Temps passé</h3>
              <span className="text-2xl font-bold tabular">{formatSec(review.spentSec)}</span>
            </div>
            {review.byCategory.length === 0 ? (
              <div className="mt-2 text-sm text-muted">Aucun temps enregistré cette semaine.</div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {review.byCategory.map((c) => {
                  const cat = c.categoryId ? byId.get(c.categoryId) : undefined
                  return (
                    <li key={c.categoryId ?? 'none'}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-2">
                          <CategoryDot color={cat?.color ?? '#94a3b8'} />
                          {cat?.name ?? 'Sans catégorie'}
                        </span>
                        <span className="tabular text-muted">{formatSec(c.sec)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(c.sec / maxCat) * 100}%`, backgroundColor: cat?.color ?? '#94a3b8' }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line/70 bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Estimations</h3>
              <div className="mt-1 text-2xl font-bold tabular">
                {review.accuracy !== undefined ? `${Math.round(review.accuracy * 100)} %` : '–'}
              </div>
              <div className="text-xs text-muted">
                {review.accuracy === undefined
                  ? 'pas assez de données'
                  : review.accuracy > 1.1
                    ? 'tu sous-estimes'
                    : review.accuracy < 0.9
                      ? 'tu sur-estimes'
                      : 'bien calibré'}
              </div>
            </div>
            <div className="rounded-2xl border border-line/70 bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Surcharge</h3>
              <div className={`mt-1 text-2xl font-bold tabular ${review.overloadedDays ? 'text-bad' : ''}`}>
                {review.overloadedDays}
              </div>
              <div className="text-xs text-muted">{plural(review.overloadedDays, 'jour', 'jours')} au-dessus</div>
            </div>
            <div className="rounded-2xl border border-line/70 bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Imprévus</h3>
              <div className="mt-1 text-2xl font-bold tabular">{review.unplanned.count}</div>
              <div className="text-xs text-muted">
                {formatSec(review.unplanned.sec)}
                {review.spentSec > 0 ? ` · ${Math.round((review.unplanned.sec / review.spentSec) * 100)} %` : ''}
              </div>
            </div>
            <div className="rounded-2xl border border-line/70 bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Réserve</h3>
              <div className="mt-1 text-2xl font-bold tabular">{review.reserveCount}</div>
              <div className="text-xs text-muted">{plural(review.reserveCount, 'tâche en attente', 'tâches en attente')}</div>
            </div>
          </section>

          {review.accuracyByCategory.length > 0 && (
            <section className="mt-3 rounded-2xl border border-line/70 bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Prévu ou réel, par catégorie</h3>
              <ul className="mt-2 divide-y divide-line">
                {review.accuracyByCategory.map((c) => {
                  const cat = c.categoryId ? byId.get(c.categoryId) : undefined
                  const pct = Math.round((c.realSec / c.estSec - 1) * 100)
                  return (
                    <li key={c.categoryId ?? 'none'} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <CategoryDot color={cat?.color ?? '#94a3b8'} />
                        <span className="truncate">{cat?.name ?? 'Sans catégorie'}</span>
                        <span className="text-xs text-muted">({c.count})</span>
                      </span>
                      <span
                        className={`shrink-0 text-right text-xs font-semibold ${
                          Math.abs(pct) <= 10 ? 'text-good' : pct > 0 ? 'text-bad' : 'text-accent'
                        }`}
                      >
                        {Math.abs(pct) <= 10 ? 'dans les temps' : pct > 0 ? `${pct} % de plus que prévu` : `${-pct} % de moins que prévu`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {review.routines.length > 0 && (
            <section className="mt-3 rounded-2xl border border-line/70 bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Routines</h3>
              <ul className="mt-2 divide-y divide-line">
                {review.routines.map((r) => (
                  <li key={r.routineId} className="flex items-center justify-between py-2 text-sm">
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="tabular text-muted">
                      {r.done}/{r.total}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
