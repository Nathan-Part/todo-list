import { type AppDB, META, getMeta, newId, setMeta } from '../db'
import { generateOccurrences } from './actions'
import { addDays, daysBetween, diffDays, todayOf } from './dates'
import { isPaused, isRoutineScheduledOn } from './routines'
import type { DayKey, Entry } from './types'

export interface RolloverOptions {
  /** Réponse à la question posée après une absence de plusieurs jours (RG-07). */
  absence?: 'not_done' | 'pause'
}

async function closeOverdue(d: AppDB, e: Entry, nowMs: number) {
  if (e.kind === 'routine') {
    // routine non faite : archivée « non faite », sans accumulation (RG-03)
    // une routine facultative non faite reste neutre : « sautée », jamais rouge
    const r = await d.routines.get(e.routineId!)
    await d.entries.update(e.id, {
      status: r?.optional ? 'skipped' : 'not_done',
      closedAt: nowMs,
      nameSnapshot: r?.name,
      estimateMinSnapshot: r?.estimateMin,
      categoryIdSnapshot: r?.categoryId,
    })
    return
  }
  // tâche non terminée : elle part en réserve, « à replanifier » (RG-03)
  const t = await d.tasks.get(e.taskId!)
  await d.entries.update(e.id, {
    status: 'not_done',
    closedAt: nowMs,
    nameSnapshot: t?.name,
    estimateMinSnapshot: t?.estimateMin,
    categoryIdSnapshot: t?.categoryId,
  })
  if (t && t.status === 'todo') {
    await d.tasks.update(t.id, { needsReview: true, reserveSince: addDays(e.date, 1) })
  }
}

/**
 * Bascule de jour : clôt les jours écoulés et prépare aujourd'hui.
 * Idempotente et rejouable : on peut l'appeler à chaque ouverture sans rien dupliquer (RG-100/102).
 */
export async function runRollover(d: AppDB, nowMs: number, opts: RolloverOptions = {}): Promise<void> {
  const today = todayOf(nowMs)
  await d.transaction('rw', d.tables, async () => {
    // 1) Clôture des passages en retard. Un chrono en cours garde son passage (RG-04).
    const overdue = await d.entries
      .where('date')
      .below(today)
      .filter((e) => e.status === 'todo')
      .toArray()
    if (overdue.length > 0) {
      const running = await d.sessions.where('running').equals(1).toArray()
      const busy = new Set(running.map((s) => s.entryId))
      for (const e of overdue) {
        if (!busy.has(e.id)) await closeOverdue(d, e, nowMs)
      }
    }

    // 2) Occurrences de routines depuis le dernier jour traité jusqu'à aujourd'hui.
    //    Si la date du téléphone recule, on ne rouvre jamais un jour déjà traité (RG-112).
    const last = await getMeta<DayKey | undefined>(d, META.lastGenerated, undefined)
    const from = last ? addDays(last, 1) : today
    if (from <= today) {
      if (opts.absence === 'pause' && from < today) {
        await d.pauses.add({ id: newId(), fromDate: from, toDate: addDays(today, -1), origin: 'absence' })
      }
      await generateOccurrences(d, from, today, today, nowMs)
      await setMeta(d, META.lastGenerated, today)
    }
  })
}

/**
 * Faut-il demander comment compter les routines des jours sans ouverture ? (RG-07)
 * Oui à partir de 2 journées entières manquées, et seulement si une routine y était prévue.
 */
export async function absenceToConfirm(
  d: AppDB,
  nowMs: number,
): Promise<{ from: DayKey; to: DayKey; days: number } | null> {
  const today = todayOf(nowMs)
  const last = await getMeta<DayKey | undefined>(d, META.lastGenerated, undefined)
  if (!last) return null
  const from = addDays(last, 1)
  const to = addDays(today, -1)
  const days = diffDays(to, from) + 1
  if (days < 2) return null
  const routines = await d.routines.toArray()
  const pauses = await d.pauses.toArray()
  const concerned = daysBetween(from, to).some((day) =>
    routines.some((r) => isRoutineScheduledOn(r, day) && !isPaused(pauses, r.id, day)),
  )
  return concerned ? { from, to, days } : null
}
