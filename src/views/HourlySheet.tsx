import { useEffect, useRef, useState } from 'react'
import { Icon, Sheet } from '../components/ui'
import { parseDayKey } from '../domain/dates'
import type { DayItem } from '../domain/stats'
import type { DayKey } from '../domain/types'
import { dayLabel, formatSec, timeOfDay } from '../lib/format'
import { useCategories, useDayItems, useNow } from '../lib/hooks'
import { useNav } from '../lib/nav'

const HOUR = 3_600_000

interface Block {
  key: string
  item: DayItem
  sessionId: string
  step?: DayItem['subtasks'][number]
  start: number
  end: number
  running: boolean
}

/** Début de l'heure `h` du jour (h peut dépasser 23 : nuit après minuit). */
function hourStart(day: DayKey, h: number): number {
  const d = parseDayKey(day)
  d.setHours(h, 0, 0, 0)
  return d.getTime()
}

/** Activité heure par heure : ce que tu faisais, par exemple, de 14 h à 15 h. */
export function HourlySheet({ day, onClose }: { day: DayKey; onClose: () => void }) {
  const { today, setSheet } = useNav()
  const items = useDayItems(day, today)
  const { byId } = useCategories()
  const now = useNow(30_000)

  const blocks: Block[] = (items ?? []).flatMap((i) =>
    i.segments.map((sg) => ({
      key: sg.id,
      item: i,
      sessionId: sg.id,
      step: sg.subtaskId ? i.subtasks.find((x) => x.id === sg.subtaskId) : undefined,
      start: sg.start,
      end: sg.end ?? now,
      running: sg.end === undefined,
    })),
  )

  // heures proposées : toute la journée, prolongée après minuit si tu as travaillé tard
  // heure en cours, comptée depuis le début de la journée (25 = 1 h du matin, la journée n'étant pas finie)
  const nowHour = day === today ? Math.floor((now - hourStart(day, 0)) / HOUR) : -1
  const lastEnd = Math.max(
    blocks.reduce((m, b) => Math.max(m, b.end), 0),
    nowHour >= 24 ? now : 0,
  )
  const extra = lastEnd > hourStart(day, 24) ? Math.min(6, Math.ceil((lastEnd - hourStart(day, 24)) / HOUR)) : 0
  // journée close tôt par « Je vais dormir » : ce qui est fait ensuite, la veille au soir, reste visible
  const firstStart = Math.min(blocks.reduce((m, b) => Math.min(m, b.start), Infinity), nowHour < 0 ? now : Infinity)
  const early = firstStart < hourStart(day, 0) ? Math.min(6, Math.ceil((hourStart(day, 0) - firstStart) / HOUR)) : 0
  const hours = Array.from({ length: early + 24 + extra }, (_, i) => i - early)
  const activeHours = new Set(
    hours.filter((h) => blocks.some((b) => b.start < hourStart(day, h + 1) && b.end > hourStart(day, h))),
  )

  const [hour, setHour] = useState(() => {
    if (day === today) return Math.max(-6, Math.floor((Date.now() - hourStart(day, 0)) / HOUR))
    const withActivity = hours.filter((h) => activeHours.has(h))
    return withActivity.length ? withActivity[withActivity.length - 1] : 9
  })
  const [init, setInit] = useState(false)
  useEffect(() => {
    // les données arrivent après l'ouverture : pour un jour passé, on se place sur la dernière heure active
    if (init || !items) return
    setInit(true)
    if (day !== today) {
      const withActivity = hours.filter((h) => activeHours.has(h))
      if (withActivity.length) setHour(withActivity[withActivity.length - 1])
    }
  }, [items, init, day, today, hours, activeHours])

  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-hour="${hour}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [hour])

  const from = hourStart(day, hour)
  const to = from + HOUR
  const inHour = blocks
    .filter((b) => b.start < to && b.end > from)
    .sort((a, b) => a.start - b.start)
  const clip = (b: Block) => ({ s: Math.max(b.start, from), e: Math.min(b.end, to) })

  // minutes occupées (les chevauchements ne comptent qu'une fois)
  const busyMs = (() => {
    const ranges = inHour.map(clip).sort((a, b) => a.s - b.s)
    let total = 0
    let cur: { s: number; e: number } | null = null
    for (const r of ranges) {
      if (!cur || r.s > cur.e) {
        if (cur) total += cur.e - cur.s
        cur = { ...r }
      } else cur.e = Math.max(cur.e, r.e)
    }
    if (cur) total += cur.e - cur.s
    return total
  })()
  const future = day === today && from > now
  const elapsed = day === today ? Math.max(0, Math.min(to, now) - from) : HOUR
  const busyMin = Math.round(busyMs / 60_000)

  // rangées pour les blocs qui se chevauchent
  const lanes: number[] = []
  const laneOf = new Map<string, number>()
  for (const b of inHour) {
    const { s, e } = clip(b)
    let lane = lanes.findIndex((endAt) => endAt <= s)
    if (lane === -1) {
      lane = lanes.length
      lanes.push(e)
    } else lanes[lane] = e
    laneOf.set(b.key, lane)
  }
  const laneCount = Math.max(1, lanes.length)

  const clock = (h: number) => ((h % 24) + 24) % 24
  const hourLabel = (h: number) => `${clock(h)} h`
  const color = (i: DayItem) => (i.categoryId && byId.get(i.categoryId)?.color) || 'var(--accent)'

  return (
    <Sheet title="Activité horaire" onClose={onClose}>
      <p className="-mt-0.5 text-sm text-muted">{dayLabel(day, today)}</p>

      {/* bande des heures */}
      <div ref={stripRef} className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
        {hours.map((h) => {
          const selected = h === hour
          const isNow = h === nowHour
          return (
            <button
              key={h}
              type="button"
              data-hour={h}
              onClick={() => setHour(h)}
              aria-pressed={selected}
              aria-label={`${hourLabel(h)}${h >= 24 ? ' (après minuit)' : h < 0 ? ' (la veille au soir)' : ''}`}
              className={`flex w-12 shrink-0 flex-col items-center gap-1 rounded-2xl py-2 text-sm font-semibold tabular transition ${
                selected ? 'bg-accent text-on-accent shadow' : isNow ? 'bg-accent-soft text-accent' : 'bg-bg text-ink'
              }`}
            >
              <span>{hourLabel(h)}</span>
              <span
                className={`size-1.5 rounded-full ${
                  activeHours.has(h) ? (selected ? 'bg-on-accent' : 'bg-good') : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* titre de l'heure et navigation */}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Heure précédente"
          disabled={hour <= hours[0]}
          onClick={() => setHour(hour - 1)}
          className="flex size-10 items-center justify-center rounded-full bg-bg text-muted disabled:opacity-30"
        >
          <Icon name="left" />
        </button>
        <div className="text-center">
          <div className="text-2xl font-bold tabular tracking-tight">
            {hourLabel(hour)} – {hourLabel(hour + 1)}
          </div>
          <div className="text-xs text-muted">
            {future
              ? 'Pas encore arrivé'
              : `${busyMin} min d'activité sur ${Math.round(elapsed / 60_000)}${elapsed < HOUR ? ' (heure en cours)' : ''}`}
          </div>
        </div>
        <button
          type="button"
          aria-label="Heure suivante"
          disabled={hour >= hours[hours.length - 1]}
          onClick={() => setHour(hour + 1)}
          className="flex size-10 items-center justify-center rounded-full bg-bg text-muted disabled:opacity-30"
        >
          <Icon name="right" />
        </button>
      </div>

      {/* frise des 60 minutes */}
      <div className="mt-4">
        <div
          className="relative overflow-hidden rounded-2xl bg-bg"
          style={{ height: `${laneCount * 2.25 + 0.5}rem`, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--line) 60%, transparent) 6px 7px)' }}
        >
          {day === today && now > from && now < to && (
            <div className="absolute inset-y-0 z-10 w-0.5 bg-bad" style={{ left: `${((now - from) / HOUR) * 100}%` }} />
          )}
          {inHour.map((b) => {
            const { s, e } = clip(b)
            const lane = laneOf.get(b.key) ?? 0
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setSheet({ type: 'dayLine', entryId: b.item.id, sessionId: b.sessionId, subtaskId: b.step?.id })}
                className="absolute flex items-center overflow-hidden rounded-lg px-1.5 text-left text-[11px] font-semibold text-white shadow-sm [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]"
                style={{
                  left: `${((s - from) / HOUR) * 100}%`,
                  width: `max(6px, ${((e - s) / HOUR) * 100}%)`,
                  top: `${lane * 2.25 + 0.25}rem`,
                  height: '2rem',
                  backgroundColor: color(b.item),
                }}
              >
                <span className="truncate">{b.step ? b.step.name : b.item.name}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-1 flex justify-between px-0.5 text-[10px] font-medium tabular text-muted">
          {[0, 15, 30, 45, 60].map((m) => (
            <span key={m}>{m === 60 ? hourLabel(hour + 1) : `${clock(hour)}:${String(m).padStart(2, '0')}`}</span>
          ))}
        </div>
      </div>

      {/* détail */}
      {inHour.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {future ? 'Cette heure n\'est pas encore passée.' : 'Rien d\'enregistré pendant cette heure.'}
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {inHour.map((b) => {
            const { s, e } = clip(b)
            const before = b.start < from
            const after = !b.running && b.end > to
            return (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => setSheet({ type: 'dayLine', entryId: b.item.id, sessionId: b.sessionId, subtaskId: b.step?.id })}
                  className="flex w-full items-start gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-2.5 text-left active:bg-bg"
                >
                  <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: color(b.item) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] font-medium leading-snug">
                      {b.step ? b.step.name : b.item.name}
                      {b.item.status === 'done' && !b.step && (
                        <Icon name="check" className="ml-1 inline size-3.5 text-good" strokeWidth={3} />
                      )}
                    </span>
                    {b.step && <span className="block truncate text-xs text-accent">Étape de « {b.item.name} »</span>}
                    <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-medium">
                      <span className="tabular text-muted">
                        {timeOfDay(s)} → {b.running && e >= now - 60_000 ? 'maintenant' : timeOfDay(e)}
                      </span>
                      {before && (
                        <span className="rounded-full bg-accent-soft px-2 text-accent">commencée à {timeOfDay(b.start)}</span>
                      )}
                      {b.running && <span className="rounded-full bg-good-soft px-2 text-good">en cours</span>}
                      {after && <span className="rounded-full bg-bg px-2 text-muted">jusqu'à {timeOfDay(b.end)}</span>}
                      {!b.running && b.item.status === 'todo' && (
                        <span className="rounded-full bg-warn-soft px-2 text-warn">pas encore finie</span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-sm font-semibold tabular">{formatSec((e - s) / 1000)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
