import { useState } from 'react'
import { CategoryChips, TimeRangeInput, rangeToMs } from '../components/pickers'
import { Chip, Field, Icon, Sheet, btnPrimary, inputClass } from '../components/ui'
import { db } from '../db'
import { addSession, addUnplanned } from '../domain/actions'
import { naturalDayOf } from '../domain/dates'
import type { DayKey } from '../domain/types'
import { formatSec, timeOfDay } from '../lib/format'
import { useCategories, useDayItems } from '../lib/hooks'
import { useNav } from '../lib/nav'
import type { DayItem } from '../domain/stats'
import { useToast } from '../lib/toast'

const QUICK = ['Pause', 'Repas', 'Trajet', 'Téléphone', 'Imprévu']

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/** Combler un trou de la journée : noter ce qu'on faisait vraiment à ce moment-là. */
export function GapSheet({
  startAt,
  endAt,
  day: dayProp,
  onClose,
}: {
  startAt: number
  endAt: number
  /** Journée du résumé (une journée peut finir après minuit). */
  day?: DayKey
  onClose: () => void
}) {
  const { active: categories } = useCategories()
  const toast = useToast()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [start, setStart] = useState(timeOfDay(startAt))
  const [end, setEnd] = useState(timeOfDay(endAt))
  const day = dayProp ?? naturalDayOf(startAt)
  const range = rangeToMs(day, start, end)
  const { today } = useNav()
  const items = useDayItems(day, today)
  // tâches de la journée pas encore faites : le temps du trou peut leur être compté
  const [picked, setPicked] = useState<DayItem | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const needle = norm(name.trim())
  const candidates = (items ?? []).filter(
    (i) => !i.virtual && (i.status === 'todo' || i.status === 'not_done') && (!needle || norm(i.name).includes(needle)),
  )

  const save = async () => {
    if (!range) return
    if (picked) {
      await addSession(db, picked.id, { durationSec: (range.endAt - range.startAt) / 1000, ...range }, 'manual')
      toast({ text: `Temps compté pour « ${picked.name} »`, duration: 2500 })
      onClose()
      return
    }
    if (!name.trim()) return
    await addUnplanned(
      db,
      { name, categoryId, durationMin: (range.endAt - range.startAt) / 60_000, startAt: range.startAt, endAt: range.endAt, day },
      Date.now(),
    )
    toast({ text: 'Noté dans ta journée', duration: 2500 })
    onClose()
  }

  return (
    <Sheet
      title="Que faisais-tu ?"
      onClose={onClose}
      footer={
        <button type="button" className={`${btnPrimary} w-full`} disabled={(!picked && !name.trim()) || !range} onClick={() => void save()}>
          Enregistrer{range ? ` (${formatSec((range.endAt - range.startAt) / 1000)})` : ''}
        </button>
      }
    >
      <div className="mt-3">
        <TimeRangeInput start={start} end={end} onChange={(a, b) => (setStart(a), setEnd(b))} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <Chip key={q} active={!picked && name === q} onClick={() => (setPicked(null), setName(q))}>
            {q}
          </Chip>
        ))}
      </div>
      <div className="relative mt-3">
        <input
          value={picked ? picked.name : name}
          onChange={(e) => {
            setPicked(null)
            setName(e.target.value)
            setListOpen(true)
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => setTimeout(() => setListOpen(false), 150)}
          placeholder="Une tâche de ta journée, ou écris ce que tu faisais"
          role="combobox"
          aria-expanded={listOpen}
          aria-autocomplete="list"
          className={`${inputClass} pr-10`}
        />
        {(picked || name) && (
          <button
            type="button"
            aria-label="Effacer"
            onClick={() => (setPicked(null), setName(''))}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted"
          >
            <Icon name="x" className="size-4" />
          </button>
        )}
        {listOpen && !picked && candidates.length > 0 && (
          <ul
            role="listbox"
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-lg"
          >
            {candidates.map((i) => (
              <li key={i.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPicked(i)
                    setListOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] active:bg-bg"
                >
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  {i.kind === 'routine' && <Icon name="repeat" className="size-3.5 shrink-0 text-muted" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {picked ? (
        <p className="mt-2 text-xs text-muted">Ce temps sera compté pour cette tâche (elle reste à faire).</p>
      ) : (
        <Field label="Catégorie">
          <CategoryChips value={categoryId} onChange={setCategoryId} categories={categories} />
        </Field>
      )}
    </Sheet>
  )
}
