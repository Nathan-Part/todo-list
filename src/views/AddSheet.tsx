import { useState } from 'react'
import { CategoryChips, EstimateChips, WeekdayToggles } from '../components/pickers'
import { Chip, Field, Sheet, btnGhost, btnPrimary, inputBase, inputClass } from '../components/ui'
import { db } from '../db'
import { addTask, addUnplanned, createRoutine } from '../domain/actions'
import { addDays } from '../domain/dates'
import type { DayKey, Frequency } from '../domain/types'
import { dayShort } from '../lib/format'
import { useCategories } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'

type Plan = 'today' | 'tomorrow' | 'date' | 'reserve'
type Repeat = 'never' | 'daily' | 'weekdays' | 'interval'

export function AddSheet({ plan: initialPlan, onClose }: { plan?: DayKey | 'reserve'; onClose: () => void }) {
  const { today, selectedDay } = useNav()
  const { active: categories } = useCategories()
  const toast = useToast()
  const tomorrow = addDays(today, 1)

  const start = initialPlan ?? (selectedDay >= today ? selectedDay : today)
  const [plan, setPlan] = useState<Plan>(
    start === 'reserve' ? 'reserve' : start === today ? 'today' : start === tomorrow ? 'tomorrow' : 'date',
  )
  const [date, setDate] = useState<DayKey>(start === 'reserve' || start < today ? tomorrow : start)
  const [name, setName] = useState('')
  const [estimate, setEstimate] = useState<number | undefined>()
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [more, setMore] = useState(false)
  const [repeat, setRepeat] = useState<Repeat>('never')
  const [weekdays, setWeekdays] = useState<number[]>([0, 2, 4])
  const [interval, setIntervalDays] = useState(2)
  const [busy, setBusy] = useState(false)

  const repeating = repeat !== 'never'
  const day: DayKey = plan === 'today' ? today : plan === 'tomorrow' ? tomorrow : date
  const valid =
    name.trim().length > 0 &&
    (repeat !== 'weekdays' || weekdays.length > 0) &&
    (repeat !== 'interval' || interval >= 2)

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    try {
      const nowMs = Date.now()
      if (repeating) {
        const frequency: Frequency =
          repeat === 'daily'
            ? { type: 'daily' }
            : repeat === 'weekdays'
              ? { type: 'weekdays', weekdays }
              : { type: 'interval', intervalDays: interval }
        await createRoutine(
          db,
          { name, frequency, estimateMin: estimate, categoryId, note, startDate: plan === 'reserve' ? today : day },
          nowMs,
        )
        toast({ text: 'Routine créée', duration: 3000 })
      } else {
        await addTask(
          db,
          {
            name,
            estimateMin: estimate,
            categoryId,
            note,
            dueDate: dueDate || undefined,
            plan: plan === 'reserve' ? 'reserve' : day,
          },
          nowMs,
        )
        if (plan === 'reserve') toast({ text: 'Ajoutée à la réserve', duration: 3000 })
        else if (day !== today) toast({ text: `Ajoutée pour le ${dayShort(day)}`, duration: 3000 })
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function submitUnplanned() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await addUnplanned(db, { name, durationMin: estimate ?? 0, categoryId }, Date.now())
      toast({ text: 'Imprévu enregistré', duration: 3000 })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={repeating ? 'Nouvelle routine' : 'Nouvelle tâche'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {!repeating && (
            <button type="button" className={btnGhost} disabled={!name.trim() || busy} onClick={() => void submitUnplanned()}>
              Imprévu déjà fait
            </button>
          )}
          <button type="button" className={`${btnPrimary} flex-1`} disabled={!valid || busy} onClick={() => void submit()}>
            {repeating ? 'Créer la routine' : 'Ajouter'}
          </button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Que dois-tu faire ?"
          enterKeyHint="done"
          className={`${inputClass} mt-2 py-3 text-lg`}
        />
      </form>

      <Field label="Durée estimée">
        <EstimateChips value={estimate} onChange={setEstimate} />
      </Field>

      <Field label={repeating ? 'À partir de' : 'Quand'}>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={plan === 'today'} onClick={() => setPlan('today')}>
            Aujourd'hui
          </Chip>
          <Chip active={plan === 'tomorrow'} onClick={() => setPlan('tomorrow')}>
            Demain
          </Chip>
          <Chip active={plan === 'date'} onClick={() => setPlan('date')}>
            {plan === 'date' ? dayShort(date) : 'Date…'}
          </Chip>
          {!repeating && (
            <Chip active={plan === 'reserve'} onClick={() => setPlan('reserve')}>
              Réserve
            </Chip>
          )}
        </div>
        {plan === 'date' && (
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className={`${inputClass} mt-2 w-auto`}
          />
        )}
      </Field>

      <Field label="Catégorie">
        <CategoryChips value={categoryId} onChange={setCategoryId} categories={categories} />
      </Field>

      {!more ? (
        <button type="button" className="mt-5 text-sm font-medium text-accent" onClick={() => setMore(true)}>
          Plus d'options (répéter, échéance, note)
        </button>
      ) : (
        <>
      <Field label="Répéter">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={repeat === 'never'} onClick={() => setRepeat('never')}>
            Jamais
          </Chip>
          <Chip active={repeat === 'daily'} onClick={() => setRepeat('daily')}>
            Tous les jours
          </Chip>
          <Chip active={repeat === 'weekdays'} onClick={() => setRepeat('weekdays')}>
            Jours choisis
          </Chip>
          <Chip active={repeat === 'interval'} onClick={() => setRepeat('interval')}>
            Tous les N jours
          </Chip>
        </div>
        {repeat === 'weekdays' && (
          <div className="mt-3">
            <WeekdayToggles value={weekdays} onChange={setWeekdays} />
          </div>
        )}
        {repeat === 'interval' && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            Tous les
            <input
              type="number"
              inputMode="numeric"
              min={2}
              max={365}
              value={interval}
              onChange={(e) => setIntervalDays(Math.max(2, Math.round(Number(e.target.value) || 2)))}
              className={`${inputBase} w-20 shrink-0`}
            />
            jours
          </div>
        )}
      </Field>

          {!repeating && (
            <Field label="Échéance (date limite)">
              <input
                type="date"
                min={today}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`${inputBase} w-auto`}
              />
            </Field>
          )}
          <Field label="Note">
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Référence, lien, précision…"
              className={inputClass}
            />
          </Field>
        </>
      )}
    </Sheet>
  )
}
