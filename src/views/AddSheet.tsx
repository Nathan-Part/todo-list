import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { CategoryChips, EndDateField, EstimateChips, PlaceChips, TimeField, WeekdayToggles } from '../components/pickers'
import { Chip, Field, Icon, Sheet, btnGhost, btnPrimary, inputBase, inputClass } from '../components/ui'
import { db } from '../db'
import { addSubtask, addTask, addUnplanned, createRoutine, markDoneOnDay, taskEntryId } from '../domain/actions'
import { suggestEstimate } from '../domain/insights'
import { addDays } from '../domain/dates'
import type { DayKey, Frequency, RoutineStep } from '../domain/types'
import { dayShort, formatMin } from '../lib/format'
import { useCategories } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'
import { RoutineStepsEditor, stepsTotal } from './RoutineSheet'

type Plan = 'yesterday' | 'today' | 'tomorrow' | 'date' | 'reserve'
type Repeat = 'never' | 'daily' | 'weekdays' | 'interval'

export function AddSheet({ plan: initialPlan, onClose }: { plan?: DayKey | 'reserve'; onClose: () => void }) {
  const { today, selectedDay, setSheet } = useNav()
  const { active: categories } = useCategories()
  const toast = useToast()
  const tomorrow = addDays(today, 1)
  const yesterday = addDays(today, -1)

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
  const [endDate, setEndDate] = useState<DayKey | undefined>()
  const [time, setTime] = useState<string | undefined>()
  const [onSite, setOnSite] = useState(false)
  const [steps, setSteps] = useState<RoutineStep[]>([])
  const suggestion = useLiveQuery(() => suggestEstimate(db, name), [name])
  const [busy, setBusy] = useState(false)

  const repeating = repeat !== 'never'
  // « Hier » n'a de sens que pour une tâche ponctuelle déjà faite
  const effectivePlan: Plan = repeating && plan === 'yesterday' ? 'today' : plan
  const day: DayKey =
    effectivePlan === 'yesterday' ? yesterday : effectivePlan === 'today' ? today : effectivePlan === 'tomorrow' ? tomorrow : date
  const stepsSum = stepsTotal(steps)
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
          {
            name,
            frequency,
            estimateMin: estimate,
            categoryId,
            note,
            time,
            onSite,
            steps,
            startDate: plan === 'reserve' ? today : day,
            endDate: endDate && endDate >= (plan === 'reserve' ? today : day) ? endDate : undefined,
          },
          nowMs,
        )
        toast({ text: 'Routine créée', duration: 3000 })
      } else {
        const id = await addTask(
          db,
          {
            name,
            estimateMin: estimate,
            categoryId,
            note,
            time,
            onSite,
            dueDate: dueDate || undefined,
            plan: plan === 'reserve' ? 'reserve' : day,
          },
          nowMs,
        )
        for (const st of steps) await addSubtask(db, id, { name: st.name, estimateMin: st.estimateMin })
        if (effectivePlan === 'yesterday') {
          // tâche oubliée d'hier : elle est déjà faite, on demande juste les heures
          const entryId = taskEntryId(id, yesterday)
          await markDoneOnDay(db, entryId, Date.now())
          setSheet({ type: 'timeEntry', entryId, name: name.trim(), estimateMin: stepsSum ?? estimate, day: yesterday })
          return
        }
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
      // l'imprévu est créé comme une tâche faite, puis on demande de quand à quand (comme pour toute tâche cochée)
      const id = await addUnplanned(db, { name, durationMin: 0, categoryId }, Date.now())
      setSheet({ type: 'timeEntry', entryId: taskEntryId(id, today), name: name.trim(), estimateMin: estimate, day: today })
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
        {suggestion && suggestion.count >= 1 && estimate !== Math.round(suggestion.typical) && (
          <button
            type="button"
            onClick={() => setEstimate(Math.max(1, Math.round(suggestion.typical)))}
            className="mb-2 flex w-full items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm text-accent"
          >
            <Icon name="clock" className="size-4 shrink-0" />
            <span className="flex-1">
              D'après tes {suggestion.count > 1 ? `${suggestion.count} dernières fois` : 'dernière fois'} :{' '}
              <span className="font-semibold">{formatMin(suggestion.typical)}</span>
            </span>
            <span className="font-semibold">Utiliser</span>
          </button>
        )}
        {stepsSum !== undefined ? (
          <p className="text-sm">
            <span className="font-semibold">{formatMin(stepsSum)}</span>
            <span className="text-muted"> · somme des étapes</span>
          </p>
        ) : (
          <EstimateChips value={estimate} onChange={setEstimate} />
        )}
      </Field>

      <Field label={steps.length ? `Sous-tâches · ${steps.length}` : 'Sous-tâches'}>
        <RoutineStepsEditor steps={steps} onChange={setSteps} />
      </Field>

      <Field label={repeating ? 'À partir de' : 'Quand'}>
        <div className="flex flex-wrap gap-1.5">
          {!repeating && (
            <Chip active={plan === 'yesterday'} onClick={() => setPlan('yesterday')}>
              Hier
            </Chip>
          )}
          <Chip active={effectivePlan === 'today'} onClick={() => setPlan('today')}>
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
        {effectivePlan === 'yesterday' && (
          <p className="mt-2 text-xs text-muted">Une tâche d'hier est notée comme déjà faite : on te demandera juste les heures.</p>
        )}
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

      {plan !== 'reserve' && effectivePlan !== 'yesterday' && (
        <Field label="Heure">
          <TimeField value={time} onChange={setTime} />
        </Field>
      )}

      <Field label="Où ?">
        <PlaceChips value={onSite} onChange={setOnSite} />
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
        {repeating && <EndDateField value={endDate} onChange={setEndDate} min={day < today ? today : day} today={today} />}
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
