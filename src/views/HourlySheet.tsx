import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, Sheet, inputClass } from '../components/ui'
import { addDays, parseDayKey } from '../domain/dates'
import type { DayItem } from '../domain/stats'
import type { DayKey } from '../domain/types'
import { dayLabel, formatMin, formatSec, timeOfDay } from '../lib/format'
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

/** Début de l'heure `h` du jour (h peut dépasser 23 : nuit après minuit ; ou être négatif : la veille au soir). */
function hourStart(day: DayKey, h: number): number {
  const d = parseDayKey(day)
  d.setHours(h, 0, 0, 0)
  return d.getTime()
}

const clock = (h: number) => ((h % 24) + 24) % 24
const hourLabel = (h: number) => `${clock(h)} h`

/** Les intervalles chronométrés d'un jour. */
function useBlocks(day: DayKey, today: DayKey, now: number): Block[] | undefined {
  const items = useDayItems(day, today)
  return useMemo(
    () =>
      items?.flatMap((i) =>
        i.segments.map((sg) => ({
          key: sg.id,
          item: i,
          sessionId: sg.id,
          step: sg.subtaskId ? i.subtasks.find((x) => x.id === sg.subtaskId) : undefined,
          start: sg.start,
          end: sg.end ?? now,
          running: sg.end === undefined,
        })),
      ),
    [items, now],
  )
}

/** Heures proposées pour un jour : la journée entière, prolongée la nuit ou la veille au soir s'il y a eu de l'activité. */
function hoursRange(day: DayKey, blocks: Block[], nowHour: number, now: number): [number, number] {
  const lastEnd = Math.max(blocks.reduce((m, b) => Math.max(m, b.end), 0), nowHour >= 24 ? now : 0)
  const extra = lastEnd > hourStart(day, 24) ? Math.min(6, Math.ceil((lastEnd - hourStart(day, 24)) / HOUR)) : 0
  const firstStart = Math.min(blocks.reduce((m, b) => Math.min(m, b.start), Infinity), nowHour < 0 && nowHour !== -99 ? now : Infinity)
  const early = firstStart < hourStart(day, 0) ? Math.min(6, Math.ceil((hourStart(day, 0) - firstStart) / HOUR)) : 0
  return [-early, 23 + extra]
}

const overlaps = (b: Block, from: number, to: number) => b.start < to && b.end > from

/** Minutes occupées dans [from, to] ; les chevauchements ne comptent qu'une fois. */
function busyMs(blocks: Block[], from: number, to: number): number {
  const ranges = blocks
    .filter((b) => overlaps(b, from, to))
    .map((b) => ({ s: Math.max(b.start, from), e: Math.min(b.end, to) }))
    .sort((a, b) => a.s - b.s)
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
}

/** Choix d'un jour : flèches, et calendrier en touchant le bouton. */
function DayPickerRow({
  day,
  today,
  onChange,
  accent,
  onRemove,
}: {
  day: DayKey
  today: DayKey
  onChange: (d: DayKey) => void
  accent?: boolean
  onRemove?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Jour précédent"
          onClick={() => onChange(addDays(day, -1))}
          className="flex size-9 items-center justify-center rounded-full text-muted active:bg-bg"
        >
          <Icon name="left" className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={`Choisir un jour (${dayLabel(day, today)})`}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            accent ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent'
          }`}
        >
          <Icon name="calendar" className="size-4 shrink-0" />
          <span className="truncate">{dayLabel(day, today)}</span>
        </button>
        <button
          type="button"
          aria-label="Jour suivant"
          disabled={day >= today}
          onClick={() => onChange(addDays(day, 1))}
          className="flex size-9 items-center justify-center rounded-full text-muted active:bg-bg disabled:opacity-30"
        >
          <Icon name="right" className="size-4" />
        </button>
        {onRemove && (
          <button
            type="button"
            aria-label="Arrêter la comparaison"
            onClick={onRemove}
            className="flex size-9 items-center justify-center rounded-full text-muted active:bg-bg"
          >
            <Icon name="x" className="size-4" />
          </button>
        )}
      </div>
      {open && (
        <input
          type="date"
          max={today}
          value={day}
          aria-label="Jour"
          onChange={(e) => {
            if (e.target.value && e.target.value <= today) {
              onChange(e.target.value)
              setOpen(false)
            }
          }}
          className={`${inputClass} mt-2`}
        />
      )}
    </div>
  )
}

/** Une heure d'un jour : résumé, frise des 60 minutes et liste des tâches. */
function HourPanel({
  day,
  hour,
  blocks,
  now,
  today,
  compact,
  title,
}: {
  day: DayKey
  hour: number
  blocks: Block[]
  now: number
  today: DayKey
  compact?: boolean
  title?: string
}) {
  const { setSheet } = useNav()
  const { byId } = useCategories()
  const from = hourStart(day, hour)
  const to = from + HOUR
  const inHour = blocks.filter((b) => overlaps(b, from, to)).sort((a, b) => a.start - b.start)
  const clip = (b: Block) => ({ s: Math.max(b.start, from), e: Math.min(b.end, to) })
  const future = from > now
  const elapsed = Math.max(0, Math.min(to, now) - from)
  const elapsedMin = Math.max(1, Math.round(Math.min(elapsed, HOUR) / 60_000))
  const busy = busyMs(blocks, from, to)
  const busyMin = busy > 0 ? Math.min(elapsedMin, Math.max(1, Math.round(busy / 60_000))) : 0
  const color = (i: DayItem) => (i.categoryId && byId.get(i.categoryId)?.color) || 'var(--accent)'
  const open = (b: Block) => setSheet({ type: 'dayLine', entryId: b.item.id, sessionId: b.sessionId, subtaskId: b.step?.id })

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

  return (
    <div>
      {title !== undefined && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs tabular text-muted">
            {future ? 'pas encore arrivé' : `${busyMin} min sur ${elapsedMin}`}
          </span>
        </div>
      )}
      <div
        className="relative overflow-hidden rounded-2xl bg-bg"
        style={{
          height: `${laneCount * 2.25 + 0.5}rem`,
          backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--line) 60%, transparent) 6px 7px)',
        }}
      >
        {day === today && now > from && now < to && (
          <div className="absolute inset-y-0 z-10 w-0.5 bg-bad" style={{ left: `${((now - from) / HOUR) * 100}%` }} />
        )}
        {inHour.map((b) => {
          const { s, e } = clip(b)
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => open(b)}
              className="absolute flex items-center overflow-hidden rounded-lg px-1.5 text-left text-[11px] font-semibold text-white shadow-sm [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]"
              style={{
                left: `${((s - from) / HOUR) * 100}%`,
                width: `max(6px, ${((e - s) / HOUR) * 100}%)`,
                top: `${(laneOf.get(b.key) ?? 0) * 2.25 + 0.25}rem`,
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

      {inHour.length === 0 ? (
        <div className={`${compact ? 'mt-2 py-3' : 'mt-6 py-6'} rounded-2xl border border-dashed border-line px-4 text-center text-sm text-muted`}>
          {future ? "Cette heure n'est pas encore passée." : "Rien d'enregistré pendant cette heure."}
        </div>
      ) : (
        <ul className={`${compact ? 'mt-2' : 'mt-5'} space-y-2`}>
          {inHour.map((b) => {
            const { s, e } = clip(b)
            const before = b.start < from
            const after = !b.running && b.end > to
            return (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => open(b)}
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
                      {before && <span className="rounded-full bg-accent-soft px-2 text-accent">commencée à {timeOfDay(b.start)}</span>}
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
    </div>
  )
}

/** Activité heure par heure : ce que tu faisais, par exemple, de 14 h à 15 h ; et la même heure un autre jour. */
export function HourlySheet({ day: initialDay, onClose }: { day: DayKey; onClose: () => void }) {
  const { today } = useNav()
  const now = useNow(30_000)
  const [day, setDay] = useState(initialDay)
  const [other, setOther] = useState<DayKey | null>(null)
  const blocks = useBlocks(day, today, now)
  const otherBlocks = useBlocks(other ?? day, today, now)

  const nowHour = day === today ? Math.floor((now - hourStart(day, 0)) / HOUR) : -99
  const [minH, maxH] = hoursRange(day, blocks ?? [], nowHour, now)
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => i + minH)
  const active = (b: Block[] | undefined, d: DayKey) =>
    new Set(hours.filter((h) => (b ?? []).some((x) => overlaps(x, hourStart(d, h), hourStart(d, h + 1)))))
  const activeHours = active(blocks, day)
  const otherActive = other ? active(otherBlocks, other) : new Set<number>()

  const [hour, setHour] = useState(() =>
    initialDay === today ? Math.max(-6, Math.floor((Date.now() - hourStart(initialDay, 0)) / HOUR)) : 9,
  )
  // à l'ouverture d'un jour passé, on se place sur sa dernière heure active ; ensuite l'heure choisie est gardée
  const placed = useRef(false)
  useEffect(() => {
    if (!blocks || placed.current) return
    placed.current = true
    if (day === today) return
    const withActivity = [...activeHours].sort((a, b) => a - b)
    if (withActivity.length) setHour(withActivity[withActivity.length - 1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks])
  const h = Math.min(Math.max(hour, minH), maxH)

  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-hour="${h}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [h])

  // comparaison : minutes occupées pendant la même heure, les deux jours
  const minutesOf = (d: DayKey, b: Block[] | undefined) => {
    const from = hourStart(d, h)
    return from > now ? undefined : Math.round(busyMs(b ?? [], from, from + HOUR) / 60_000)
  }
  const mainMin = minutesOf(day, blocks)
  const otherMin = other ? minutesOf(other, otherBlocks) : undefined
  const diff = mainMin !== undefined && otherMin !== undefined ? mainMin - otherMin : undefined

  const from = hourStart(day, h)
  const elapsed = day === today ? Math.max(0, Math.min(from + HOUR, now) - from) : HOUR
  const elapsedMin = Math.max(1, Math.round(elapsed / 60_000))

  return (
    <Sheet title="Activité horaire" onClose={onClose}>
      <div className="mt-1 space-y-2">
        <DayPickerRow day={day} today={today} onChange={setDay} />
        {other ? (
          <DayPickerRow day={other} today={today} onChange={setOther} accent onRemove={() => setOther(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setOther(addDays(day, -7) <= today ? addDays(day, -7) : addDays(today, -1))}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2 text-sm font-medium text-muted active:bg-bg"
          >
            <Icon name="plus" className="size-4" />
            Comparer avec un autre jour
          </button>
        )}
      </div>

      {/* bande des heures */}
      <div ref={stripRef} className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
        {hours.map((x) => {
          const selected = x === h
          const isNow = x === nowHour
          return (
            <button
              key={x}
              type="button"
              data-hour={x}
              onClick={() => setHour(x)}
              aria-pressed={selected}
              aria-label={`${hourLabel(x)}${x >= 24 ? ' (après minuit)' : x < 0 ? ' (la veille au soir)' : ''}`}
              className={`flex w-12 shrink-0 flex-col items-center gap-1 rounded-2xl py-2 text-sm font-semibold tabular transition ${
                selected ? 'bg-accent text-on-accent shadow' : isNow ? 'bg-accent-soft text-accent' : 'bg-bg text-ink'
              }`}
            >
              <span>{hourLabel(x)}</span>
              <span className="flex gap-0.5">
                <span className={`size-1.5 rounded-full ${activeHours.has(x) ? (selected ? 'bg-on-accent' : 'bg-good') : 'bg-transparent'}`} />
                {other && <span className={`size-1.5 rounded-full ${otherActive.has(x) ? 'bg-warn' : 'bg-transparent'}`} />}
              </span>
            </button>
          )
        })}
      </div>

      {/* titre de l'heure et navigation */}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Heure précédente"
          disabled={h <= minH}
          onClick={() => setHour(h - 1)}
          className="flex size-10 items-center justify-center rounded-full bg-bg text-muted disabled:opacity-30"
        >
          <Icon name="left" />
        </button>
        <div className="text-center">
          <div className="text-2xl font-bold tabular tracking-tight">
            {hourLabel(h)} – {hourLabel(h + 1)}
          </div>
          {!other && (
            <div className="text-xs text-muted">
              {mainMin === undefined
                ? 'Pas encore arrivé'
                : `${mainMin ? Math.min(elapsedMin, Math.max(1, mainMin)) : 0} min d'activité sur ${elapsedMin}${elapsed < HOUR ? ' (heure en cours)' : ''}`}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Heure suivante"
          disabled={h >= maxH}
          onClick={() => setHour(h + 1)}
          className="flex size-10 items-center justify-center rounded-full bg-bg text-muted disabled:opacity-30"
        >
          <Icon name="right" />
        </button>
      </div>

      {other ? (
        <>
          {diff !== undefined && (
            <div
              className={`mt-3 rounded-2xl px-4 py-2.5 text-center text-sm font-medium ${
                diff > 0 ? 'bg-good-soft text-good' : diff < 0 ? 'bg-warn-soft text-warn' : 'bg-bg text-muted'
              }`}
            >
              {diff === 0
                ? `Autant d'activité les deux jours (${formatMin(mainMin!)})`
                : `${dayLabel(day, today)} : ${formatMin(Math.abs(diff))} d'activité ${diff > 0 ? 'de plus' : 'de moins'} que ${dayLabel(other, today).toLowerCase()}`}
            </div>
          )}
          <div className="mt-4 space-y-5">
            <HourPanel day={day} hour={h} blocks={blocks ?? []} now={now} today={today} compact title={dayLabel(day, today)} />
            <HourPanel day={other} hour={h} blocks={otherBlocks ?? []} now={now} today={today} compact title={dayLabel(other, today)} />
          </div>
        </>
      ) : (
        <div className="mt-4">
          <HourPanel day={day} hour={h} blocks={blocks ?? []} now={now} today={today} />
        </div>
      )}
    </Sheet>
  )
}
