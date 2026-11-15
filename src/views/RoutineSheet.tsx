import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { CategoryChips, EndDateField, EstimateChips, TimeField, TimeInsight, WeekdayToggles } from '../components/pickers'
import { Chip, Field, Icon, Sheet, btnDanger, btnGhost, btnPrimary, btnSoft, inputBase, inputClass } from '../components/ui'
import { db } from '../db'
import {
  archiveRoutine,
  createRoutine,
  deleteRoutine,
  restoreRoutine,
  snapshotRoutine,
  unarchiveRoutine,
  updateRoutine,
} from '../domain/actions'
import { loadRoutineDetail } from '../domain/queries'
import type { Frequency, Routine } from '../domain/types'
import { dayShort, formatMin } from '../lib/format'
import { useCategories } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'
import { GRID_STYLE } from './RoutinesView'

type Kind = Frequency['type']

interface Form {
  name: string
  kind: Kind
  weekdays: number[]
  interval: number
  estimate?: number
  categoryId?: string
  note: string
  endDate?: string
  time?: string
}

const empty: Form = { name: '', kind: 'daily', weekdays: [0, 2, 4], interval: 2, note: '' }

function fromRoutine(r: Routine): Form {
  return {
    name: r.name,
    kind: r.frequency.type,
    weekdays: r.frequency.type === 'weekdays' ? r.frequency.weekdays : [0, 2, 4],
    interval: r.frequency.type === 'interval' ? r.frequency.intervalDays : 2,
    estimate: r.estimateMin,
    categoryId: r.categoryId,
    note: r.note ?? '',
    endDate: r.archivedAt ? undefined : r.endDate,
    time: r.time,
  }
}

function toFrequency(f: Form): Frequency {
  if (f.kind === 'daily') return { type: 'daily' }
  if (f.kind === 'weekdays') return { type: 'weekdays', weekdays: f.weekdays }
  return { type: 'interval', intervalDays: f.interval }
}

const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function RoutineSheet({ routineId, onClose }: { routineId: string | 'new'; onClose: () => void }) {
  const { today, setSheet } = useNav()
  const isNew = routineId === 'new'
  const detail = useLiveQuery(() => (isNew ? null : loadRoutineDetail(db, routineId, today)), [routineId, today])
  const { active: categories } = useCategories()
  const toast = useToast()
  const [form, setForm] = useState<Form | null>(isNew ? empty : null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!isNew && detail && !form) setForm(fromRoutine(detail.routine))
  }, [detail, form, isNew])

  if (!form) return <Sheet title="…" onClose={onClose}>{null}</Sheet>

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const valid =
    form.name.trim().length > 0 &&
    (form.kind !== 'weekdays' || form.weekdays.length > 0) &&
    (form.kind !== 'interval' || form.interval >= 2)

  async function save() {
    if (!valid || !form) return
    const nowMs = Date.now()
    if (isNew) {
      await createRoutine(
        db,
        {
          name: form.name,
          frequency: toFrequency(form),
          estimateMin: form.estimate,
          categoryId: form.categoryId,
          note: form.note,
          endDate: form.endDate,
          time: form.time,
        },
        nowMs,
      )
      toast({ text: 'Routine créée', duration: 3000 })
    } else {
      await updateRoutine(
        db,
        routineId,
        {
          name: form.name.trim(),
          frequency: toFrequency(form),
          estimateMin: form.estimate,
          categoryId: form.categoryId,
          note: form.note.trim() || undefined,
          time: form.time,
          ...(detail?.routine.archivedAt ? {} : { endDate: form.endDate }),
        },
        nowMs,
      )
      toast({ text: 'Routine modifiée à partir d\'aujourd\'hui', duration: 3000 })
    }
    onClose()
  }

  return (
    <Sheet
      title={isNew ? 'Nouvelle routine' : form.name || 'Routine'}
      onClose={onClose}
      footer={
        <button type="button" className={`${btnPrimary} w-full`} disabled={!valid} onClick={() => void save()}>
          {isNew ? 'Créer la routine' : 'Enregistrer'}
        </button>
      }
    >
      <Field label="Nom">
        <input
          autoFocus={isNew}
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Ex. Sport, Étudier, Emails…"
          className={inputClass}
        />
      </Field>

      <Field label="Fréquence">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={form.kind === 'daily'} onClick={() => set({ kind: 'daily' })}>
            Tous les jours
          </Chip>
          <Chip active={form.kind === 'weekdays'} onClick={() => set({ kind: 'weekdays' })}>
            Jours choisis
          </Chip>
          <Chip active={form.kind === 'interval'} onClick={() => set({ kind: 'interval' })}>
            Tous les N jours
          </Chip>
        </div>
        {form.kind === 'weekdays' && (
          <div className="mt-3">
            <WeekdayToggles value={form.weekdays} onChange={(weekdays) => set({ weekdays })} />
          </div>
        )}
        {form.kind === 'interval' && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            Tous les
            <input
              type="number"
              inputMode="numeric"
              min={2}
              max={365}
              value={form.interval}
              onChange={(e) => set({ interval: Math.max(2, Math.round(Number(e.target.value) || 2)) })}
              className={`${inputBase} w-20 shrink-0`}
            />
            jours, depuis le début de la routine
          </div>
        )}
        <EndDateField value={form.endDate} onChange={(endDate) => set({ endDate })} min={today} today={today} />
      </Field>

      <Field label="Heure">
        <TimeField value={form.time} onChange={(time) => set({ time })} />
      </Field>

      <Field label="Durée estimée">
        <EstimateChips value={form.estimate} onChange={(estimate) => set({ estimate })} />
      </Field>
      <Field label="Catégorie">
        <CategoryChips value={form.categoryId} onChange={(categoryId) => set({ categoryId })} categories={categories} />
      </Field>
      <Field label="Note">
        <textarea
          rows={2}
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Précision, lien…"
          className={inputClass}
        />
      </Field>

      {!isNew && detail && (
        <>
          <Field label="Régularité">
            <div className="flex gap-6 text-sm">
              <div>
                <div className="text-2xl font-semibold tabular">
                  {detail.week.total ? `${detail.week.done}/${detail.week.total}` : '–'}
                </div>
                <div className="text-xs text-muted">7 derniers jours</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular">
                  {detail.month.total
                    ? `${detail.month.done}/${detail.month.total} · ${Math.round((detail.month.done / detail.month.total) * 100)} %`
                    : '–'}
                </div>
                <div className="text-xs text-muted">30 derniers jours</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {DAY_HEADERS.map((l, i) => (
                <div key={i} className="text-center text-[10px] font-medium text-muted">
                  {l}
                </div>
              ))}
              {detail.grid.map((g) => (
                <div
                  key={g.day}
                  title={`${dayShort(g.day)} — ${g.state}`}
                  className={`h-7 rounded-lg ${GRID_STYLE[g.state]}`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded bg-good" /> faite</span>
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded bg-bad/70" /> non faite</span>
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded bg-muted/40" /> sautée</span>
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded bg-line" /> pause</span>
            </div>
          </Field>

          {detail.stats ? (
            <Field label="Ton temps réel">
              <TimeInsight stats={detail.stats} estimateMin={detail.routine.estimateMin} />
              {detail.suggestedMin !== undefined && (
                <button
                  type="button"
                  className={`${btnSoft} mt-2`}
                  onClick={async () => {
                    await updateRoutine(db, routineId, { estimateMin: detail.suggestedMin }, Date.now())
                    set({ estimate: detail.suggestedMin })
                    toast({ text: `Estimation ajustée à ${formatMin(detail.suggestedMin!)}`, duration: 3000 })
                  }}
                >
                  Ajuster l'estimation à {formatMin(detail.suggestedMin)}
                </button>
              )}
            </Field>
          ) : (
            <Field label="Ton temps réel">
              <p className="text-sm text-muted">
                Lance le chrono (ou indique la durée en cochant) : l'app calculera combien de temps cette routine te prend vraiment.
              </p>
            </Field>
          )}

          <div className="mt-8 flex flex-wrap gap-2">
            {detail.routine.archivedAt ? (
              <button
                type="button"
                className={btnSoft}
                onClick={async () => {
                  await unarchiveRoutine(db, routineId, Date.now())
                  toast({ text: 'Routine réactivée', duration: 2500 })
                  onClose()
                }}
              >
                <Icon name="undo" className="size-4" />
                Réactiver
              </button>
            ) : (
              <>
                <button type="button" className={btnGhost} onClick={() => setSheet({ type: 'pause', routineId })}>
                  <Icon name="pause" className="size-4" />
                  Pause
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={async () => {
                    await archiveRoutine(db, routineId, Date.now())
                    toast({
                      text: 'Routine archivée (visible dans « Archivées »)',
                      actionLabel: 'Annuler',
                      onAction: () => void unarchiveRoutine(db, routineId, Date.now()),
                    })
                    onClose()
                  }}
                >
                  Archiver
                </button>
              </>
            )}
            {confirmArchive ? (
              <button
                type="button"
                className={btnDanger}
                onClick={async () => {
                  const snap = await snapshotRoutine(db, routineId)
                  await deleteRoutine(db, routineId)
                  if (snap) toast({ text: 'Routine supprimée', actionLabel: 'Annuler', onAction: () => void restoreRoutine(db, snap) })
                  onClose()
                }}
              >
                Confirmer la suppression
              </button>
            ) : (
              <button type="button" className={btnDanger} onClick={() => setConfirmArchive(true)}>
                <Icon name="trash" className="size-4" />
                Supprimer
              </button>
            )}
          </div>
          {confirmArchive && (
            <p className="mt-2 text-xs text-muted">Supprimer efface aussi tout son historique. Pour la garder sans qu'elle revienne, archive-la.</p>
          )}
        </>
      )}
    </Sheet>
  )
}
