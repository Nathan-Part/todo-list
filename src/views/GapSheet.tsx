import { useState } from 'react'
import { CategoryChips, TimeRangeInput, rangeToMs } from '../components/pickers'
import { Chip, Field, Sheet, btnPrimary, inputClass } from '../components/ui'
import { db } from '../db'
import { addUnplanned } from '../domain/actions'
import { dayKeyOf } from '../domain/dates'
import { formatSec, timeOfDay } from '../lib/format'
import { useCategories } from '../lib/hooks'
import { useToast } from '../lib/toast'

const QUICK = ['Pause', 'Repas', 'Trajet', 'Téléphone', 'Imprévu']

/** Combler un trou de la journée : noter ce qu'on faisait vraiment à ce moment-là. */
export function GapSheet({ startAt, endAt, onClose }: { startAt: number; endAt: number; onClose: () => void }) {
  const { active: categories } = useCategories()
  const toast = useToast()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [start, setStart] = useState(timeOfDay(startAt))
  const [end, setEnd] = useState(timeOfDay(endAt))
  const range = rangeToMs(dayKeyOf(startAt), start, end)

  const save = async () => {
    if (!name.trim() || !range) return
    await addUnplanned(
      db,
      { name, categoryId, durationMin: (range.endAt - range.startAt) / 60_000, startAt: range.startAt, endAt: range.endAt },
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
        <button type="button" className={`${btnPrimary} w-full`} disabled={!name.trim() || !range} onClick={() => void save()}>
          Enregistrer{range ? ` (${formatSec((range.endAt - range.startAt) / 1000)})` : ''}
        </button>
      }
    >
      <div className="mt-3">
        <TimeRangeInput start={start} end={end} onChange={(a, b) => (setStart(a), setEnd(b))} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <Chip key={q} active={name === q} onClick={() => setName(q)}>
            {q}
          </Chip>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ou écris ce que tu faisais"
        className={`${inputClass} mt-3`}
      />
      <Field label="Catégorie">
        <CategoryChips value={categoryId} onChange={setCategoryId} categories={categories} />
      </Field>
    </Sheet>
  )
}
