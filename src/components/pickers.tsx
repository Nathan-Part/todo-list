import { useState } from 'react'
import { db } from '../db'
import { addSession, deleteSession } from '../domain/actions'
import type { Category, Session } from '../domain/types'
import { dayShort, formatMin, formatSec, timeOfDay } from '../lib/format'
import { CategoryDot, Chip, Icon, btnSoft, inputClass } from './ui'

const PRESETS = [15, 30, 45, 60, 90, 120]

/** Durée estimée par raccourcis, ou valeur libre. */
export function EstimateChips({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  const isCustom = value !== undefined && !PRESETS.includes(value)
  const [customOpen, setCustomOpen] = useState(isCustom)
  const showCustom = customOpen || isCustom
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((m) => (
          <Chip
            key={m}
            active={value === m}
            onClick={() => {
              onChange(value === m ? undefined : m)
              setCustomOpen(false)
            }}
          >
            {formatMin(m)}
          </Chip>
        ))}
        <Chip active={showCustom} onClick={() => setCustomOpen((o) => !o)}>
          Autre
        </Chip>
      </div>
      {showCustom && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            placeholder="Minutes"
            className={`${inputClass} w-28`}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : undefined)}
          />
          <span className="text-sm text-muted">min</span>
        </div>
      )}
    </div>
  )
}

export function CategoryChips({
  value,
  onChange,
  categories,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  categories: Category[]
}) {
  if (categories.length === 0) return <div className="text-sm text-muted">Aucune catégorie (à créer dans les réglages).</div>
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((c) => (
        <Chip key={c.id} active={value === c.id} onClick={() => onChange(value === c.id ? undefined : c.id)}>
          <span className="inline-flex items-center gap-1.5">
            <CategoryDot color={c.color} className={`size-2 ${value === c.id ? 'ring-1 ring-on-accent' : ''}`} />
            {c.name}
          </span>
        </Chip>
      ))}
    </div>
  )
}

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

export function WeekdayToggles({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1.5">
      {WEEKDAY_LETTERS.map((l, i) => {
        const on = value.includes(i)
        return (
          <button
            key={i}
            type="button"
            aria-label={WEEKDAY_NAMES[i]}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort((a, b) => a - b))}
            className={`size-10 rounded-full border text-sm font-semibold transition active:scale-90 ${
              on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface'
            }`}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}

/** Sessions de temps d'un passage, avec ajout et suppression manuels (RG-66). */
export function SessionsEditor({ entryId, sessions }: { entryId?: string; sessions: Session[] }) {
  const [minutes, setMinutes] = useState('')
  const total = sessions.reduce((n, s) => n + s.durationSec, 0)
  const add = async () => {
    const m = Number(minutes)
    if (!entryId || !m || m <= 0) return
    await addSession(db, entryId, { durationSec: m * 60 }, 'manual')
    setMinutes('')
  }
  return (
    <div>
      {sessions.length === 0 ? (
        <div className="text-sm text-muted">Aucun temps enregistré.</div>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="text-muted">{dayShort(s.date)}</span>
                {s.startAt && s.endAt ? (
                  <span className="ml-2 tabular text-muted">
                    {timeOfDay(s.startAt)}–{timeOfDay(s.endAt)}
                  </span>
                ) : null}
                {s.running === 1 && <span className="ml-2 text-accent">en cours</span>}
              </span>
              <span className="font-medium tabular">{s.running === 1 ? '…' : formatSec(s.durationSec)}</span>
              {s.running === 0 && (
                <button
                  type="button"
                  aria-label="Supprimer cette session"
                  className="rounded-full p-1.5 text-muted active:bg-bg"
                  onClick={() => void deleteSession(db, s.id)}
                >
                  <Icon name="x" className="size-4" />
                </button>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between py-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular">{formatSec(total)}</span>
          </li>
        </ul>
      )}
      {entryId && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            className={`${inputClass} w-28`}
          />
          <button type="button" className={btnSoft} onClick={() => void add()} disabled={!Number(minutes)}>
            <Icon name="plus" className="size-4" />
            Ajouter du temps
          </button>
        </div>
      )}
    </div>
  )
}
