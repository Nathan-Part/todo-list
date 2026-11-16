import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB, META, getMeta } from '../db'
import {
  addTask,
  addUnplanned,
  archiveRoutine,
  completeEntry,
  completeTask,
  createRoutine,
  deleteTask,
  endPause,
  pauseRoutines,
  pauseTimer,
  planTask,
  postponeEntry,
  reopenEntry,
  reorderDay,
  routineEntryId,
  skipEntry,
  startTimer,
  taskEntryId,
  updateRoutine,
} from './actions'
import { addDays, diffDays, startOfWeek, weekdayIndex } from './dates'
import { loadDayItems, loadReserve, loadRoutineDetail } from './queries'
import { absenceToConfirm, runRollover } from './rollover'
import { isRoutineScheduledOn } from './routines'
import { computeDayStats } from './stats'
import type { Routine } from './types'

let db: AppDB
let n = 0
beforeEach(() => {
  db = new AppDB(`test-${n++}-${Math.random().toString(36).slice(2)}`)
})

/** Instant local : jour AAAA-MM-JJ à l'heure h:m. */
const at = (day: string, h = 9, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}

// 2026-11-09 est un lundi
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'
const THU = '2026-11-12'
const FRI = '2026-11-13'

describe('dates', () => {
  it('lundi = 0, dimanche = 6', () => {
    expect(weekdayIndex(MON)).toBe(0)
    expect(weekdayIndex(FRI)).toBe(4)
    expect(weekdayIndex('2026-11-15')).toBe(6)
  })
  it('addDays traverse les fins de mois et d\'année', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('diffDays ignore les changements d\'heure', () => {
    expect(diffDays('2026-03-29', '2026-03-28')).toBe(1)
    expect(diffDays('2026-10-26', '2026-10-24')).toBe(2)
  })
  it('startOfWeek renvoie le lundi', () => {
    expect(startOfWeek(FRI)).toBe(MON)
    expect(startOfWeek(MON)).toBe(MON)
    expect(startOfWeek('2026-11-15')).toBe(MON)
  })
})

describe('fréquences des routines', () => {
  const base: Routine = {
    id: 'r',
    name: 'x',
    frequency: { type: 'daily' },
    startDate: MON,
    position: 1000,
    createdAt: 0,
  }
  it('tous les jours, à partir de la date de début', () => {
    expect(isRoutineScheduledOn(base, MON)).toBe(true)
    expect(isRoutineScheduledOn(base, '2026-11-08')).toBe(false)
  })
  it('jours de la semaine choisis', () => {
    const r: Routine = { ...base, frequency: { type: 'weekdays', weekdays: [0, 2, 4] } }
    expect(isRoutineScheduledOn(r, MON)).toBe(true)
    expect(isRoutineScheduledOn(r, TUE)).toBe(false)
    expect(isRoutineScheduledOn(r, WED)).toBe(true)
    expect(isRoutineScheduledOn(r, FRI)).toBe(true)
  })
  it('tous les N jours : calendrier fixe depuis la date de début', () => {
    const r: Routine = { ...base, frequency: { type: 'interval', intervalDays: 3 } }
    expect(isRoutineScheduledOn(r, MON)).toBe(true)
    expect(isRoutineScheduledOn(r, TUE)).toBe(false)
    expect(isRoutineScheduledOn(r, '2026-11-12')).toBe(true)
    expect(isRoutineScheduledOn(r, '2026-11-15')).toBe(true)
  })
  it('respecte la date de fin', () => {
    const r: Routine = { ...base, endDate: TUE }
    expect(isRoutineScheduledOn(r, TUE)).toBe(true)
    expect(isRoutineScheduledOn(r, WED)).toBe(false)
  })
})

describe('bascule de jour', () => {
  it('premier lancement : génère seulement les routines du jour', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    const items = await loadDayItems(db, MON, MON)
    expect(items.map((i) => i.name)).toEqual(['Sport'])
    expect(await getMeta(db, META.lastGenerated, '')).toBe(MON)
  })

  it('rejouée plusieurs fois le même jour : aucun doublon', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    for (let i = 0; i < 4; i++) await runRollover(db, at(MON, 9 + i))
    expect(await db.entries.count()).toBe(1)
  })

  it('tâche non terminée : part en réserve « à replanifier », sans disparaître', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Appeler la banque', estimateMin: 15, plan: MON }, at(MON))
    await runRollover(db, at(TUE))

    const task = (await db.tasks.get(id))!
    expect(task.status).toBe('todo')
    expect(task.needsReview).toBe(true)
    expect(task.reserveSince).toBe(TUE)
    const entry = (await db.entries.get(taskEntryId(id, MON)))!
    expect(entry.status).toBe('not_done')
    expect(entry.nameSnapshot).toBe('Appeler la banque')
    // elle n'est plus sur aucun jour, elle est en réserve
    expect((await loadDayItems(db, TUE, TUE)).length).toBe(0)
    const reserve = await loadReserve(db, TUE)
    expect(reserve.map((r) => r.task.id)).toEqual([id])
    expect(reserve[0].postponedCount).toBe(1)
  })

  it('routine non faite : archivée « non faite », la suivante repart sans accumulation', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await runRollover(db, at(TUE))

    const monday = await loadDayItems(db, MON, TUE)
    expect(monday.map((i) => i.status)).toEqual(['not_done'])
    const tuesday = await loadDayItems(db, TUE, TUE)
    expect(tuesday.map((i) => i.status)).toEqual(['todo'])
    // jamais deux « Sport » à faire
    const open = await db.entries.where('status').equals('todo').toArray()
    expect(open.length).toBe(1)
  })

  it('tâches faites et tâches futures ne bougent pas', async () => {
    await runRollover(db, at(MON))
    const done = await addTask(db, { name: 'Courses', plan: MON }, at(MON))
    const future = await addTask(db, { name: 'Impôts', plan: FRI }, at(MON))
    await completeEntry(db, taskEntryId(done, MON), at(MON, 18))
    await runRollover(db, at(TUE))
    expect((await db.tasks.get(done))!.needsReview).toBe(false)
    expect((await db.entries.get(taskEntryId(future, FRI)))!.status).toBe('todo')
    expect((await db.tasks.get(future))!.needsReview).toBe(false)
  })

  it('absence de 3 jours : routines « non faites » et tâches en réserve', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    const t = await addTask(db, { name: 'Dossier', plan: TUE }, at(MON))

    const ask = await absenceToConfirm(db, at(FRI))
    expect(ask).toEqual({ from: TUE, to: THU, days: 3 })
    await runRollover(db, at(FRI), { absence: 'not_done' })

    const statuses = (await db.entries.where('routineId').notEqual('').toArray())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => `${e.date}:${e.status}`)
    expect(statuses).toEqual([
      `${MON}:not_done`,
      `${TUE}:not_done`,
      `${WED}:not_done`,
      `${THU}:not_done`,
      `${FRI}:todo`,
    ])
    expect((await db.tasks.get(t))!.needsReview).toBe(true)
  })

  it('absence avec « pause » : ces jours sont exclus, aucune occurrence créée', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await runRollover(db, at(FRI), { absence: 'pause' })

    const dates = (await db.entries.where('routineId').notEqual('').toArray()).map((e) => e.date).sort()
    expect(dates).toEqual([MON, FRI])
    const pauses = await db.pauses.toArray()
    expect(pauses).toHaveLength(1)
    expect(pauses[0]).toMatchObject({ fromDate: TUE, toDate: THU, origin: 'absence' })
  })

  it('une seule journée manquée : pas de question', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    expect(await absenceToConfirm(db, at(WED))).toBeNull() // seul mardi est manqué
    expect(await absenceToConfirm(db, at(THU))).not.toBeNull() // mardi et mercredi
  })

  it('un chrono en cours à minuit garde son passage jusqu\'à l\'arrêt (RG-04)', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Étudier', plan: MON }, at(MON))
    await startTimer(db, taskEntryId(id, MON), at(MON, 23, 30))
    await runRollover(db, at(TUE, 0, 30))
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('todo')
    expect((await db.tasks.get(id))!.needsReview).toBe(false)

    await pauseTimer(db, at(TUE, 0, 45))
    await runRollover(db, at(TUE, 0, 46))
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('not_done')
    const s = (await db.sessions.toArray())[0]
    expect(s.durationSec).toBe(75 * 60)
    expect(s.date).toBe(MON) // le temps est compté sur le jour de départ
  })

  it('si la date du téléphone recule, rien n\'est rouvert ni dupliqué (RG-112)', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(WED))
    const before = await db.entries.count()
    await runRollover(db, at(TUE))
    expect(await db.entries.count()).toBe(before)
    expect(await getMeta(db, META.lastGenerated, '')).toBe(WED)
  })
})

describe('tâches : report et réalisation', () => {
  it('cocher une tâche la termine aujourd\'hui', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    await completeEntry(db, taskEntryId(id, MON), at(MON, 15))
    const t = (await db.tasks.get(id))!
    expect(t).toMatchObject({ status: 'done', doneDate: MON })
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('done')
  })

  it('tâche prévue un jour futur cochée aujourd\'hui : faite aujourd\'hui, sans trace sur le jour futur', async () => {
    const id = await addTask(db, { name: 'A', plan: FRI }, at(MON))
    await completeEntry(db, taskEntryId(id, FRI), at(MON, 10))
    expect(await db.entries.get(taskEntryId(id, FRI))).toBeUndefined()
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('done')
    expect((await db.tasks.get(id))!.doneDate).toBe(MON)
  })

  it('tâche en réserve cochée : faite aujourd\'hui', async () => {
    const id = await addTask(db, { name: 'A', plan: 'reserve' }, at(MON))
    await completeTask(db, id, at(MON, 10))
    expect((await db.tasks.get(id))!.status).toBe('done')
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('done')
  })

  it('report d\'une tâche du jour : le jour garde la trace (RG-13)', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    await postponeEntry(db, taskEntryId(id, MON), TUE, at(MON, 17))
    const today = (await db.entries.get(taskEntryId(id, MON)))!
    expect(today).toMatchObject({ status: 'postponed', movedTo: TUE })
    expect((await db.entries.get(taskEntryId(id, TUE)))!.status).toBe('todo')
  })

  it('report d\'une tâche d\'un jour futur : simple changement de date, sans trace', async () => {
    const id = await addTask(db, { name: 'A', plan: WED }, at(MON))
    await postponeEntry(db, taskEntryId(id, WED), FRI, at(MON))
    expect(await db.entries.get(taskEntryId(id, WED))).toBeUndefined()
    expect((await db.entries.get(taskEntryId(id, FRI)))!.status).toBe('todo')
  })

  it('renvoyer en réserve puis replanifier', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    await postponeEntry(db, taskEntryId(id, MON), 'reserve', at(MON))
    expect((await loadReserve(db, MON)).map((r) => r.task.id)).toEqual([id])
    await planTask(db, id, WED, at(MON))
    expect(await loadReserve(db, MON)).toHaveLength(0)
    expect((await db.entries.get(taskEntryId(id, WED)))!.status).toBe('todo')
  })

  it('on peut remettre une tâche reportée sur le jour d\'origine sans doublon', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    await postponeEntry(db, taskEntryId(id, MON), TUE, at(MON))
    await planTask(db, id, MON, at(MON, 18))
    const entries = await db.entries.where('taskId').equals(id).toArray()
    expect(entries.filter((e) => e.status === 'todo').map((e) => e.date)).toEqual([MON])
    expect(entries.filter((e) => e.date === MON)).toHaveLength(1)
  })

  it('on ne planifie pas dans le passé', async () => {
    const id = await addTask(db, { name: 'B', plan: TUE }, at(TUE))
    await expect(postponeEntry(db, taskEntryId(id, TUE), MON, at(TUE))).rejects.toThrow()
    await expect(planTask(db, id, MON, at(TUE))).rejects.toThrow()
    // l'entrée reste intacte après un refus
    expect((await db.entries.get(taskEntryId(id, TUE)))!.status).toBe('todo')
  })

  it('rouvrir une tâche cochée le jour même', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    await completeEntry(db, taskEntryId(id, MON), at(MON, 11))
    await reopenEntry(db, taskEntryId(id, MON), at(MON, 12))
    expect((await db.tasks.get(id))!.status).toBe('todo')
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('todo')
  })

  it('suppression sans temps : tout est effacé', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    await deleteTask(db, id, at(MON))
    expect(await db.tasks.get(id)).toBeUndefined()
    expect(await db.entries.count()).toBe(0)
  })

  it('suppression avec temps : la tâche disparaît complètement', async () => {
    const id = await addTask(db, { name: 'Étudier', plan: MON }, at(MON))
    await startTimer(db, taskEntryId(id, MON), at(MON, 9))
    await pauseTimer(db, at(MON, 10))
    await deleteTask(db, id, at(MON, 11))
    expect(await db.tasks.get(id)).toBeUndefined()
    expect(await loadDayItems(db, MON, MON)).toHaveLength(0)
    expect(await db.sessions.count()).toBe(0)
  })
})

describe('routines : déplacer, sauter, pause', () => {
  it('déplacer une occurrence vers un jour libre ; pas de régénération à l\'origine', async () => {
    const rid = await createRoutine(
      db,
      { name: 'Ménage', frequency: { type: 'weekdays', weekdays: [5] }, startDate: MON }, // samedi
      at(MON),
    )
    const sat = '2026-11-14'
    const sun = '2026-11-15'
    await runRollover(db, at(sat))
    const origin = routineEntryId(rid, sat, sat)
    await postponeEntry(db, origin, sun, at(sat))

    expect((await db.entries.get(origin))!).toMatchObject({ status: 'postponed', movedTo: sun })
    const moved = (await db.entries.get(routineEntryId(rid, sat, sun)))!
    expect(moved).toMatchObject({ date: sun, scheduledDate: sat, status: 'todo' })
    await runRollover(db, at(sun)) // ne recrée pas l'occurrence du samedi
    expect(await db.entries.where('routineId').equals(rid).count()).toBe(2)
  })

  it('refuse de déplacer vers un jour où la routine a déjà son occurrence, ou en réserve', async () => {
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await expect(postponeEntry(db, routineEntryId(rid, MON, MON), TUE, at(MON))).rejects.toThrow()
    await expect(postponeEntry(db, routineEntryId(rid, MON, MON), 'reserve', at(MON))).rejects.toThrow()
  })

  it('sauter une occurrence, y compris une occurrence à venir', async () => {
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await skipEntry(db, routineEntryId(rid, WED, WED), at(MON))
    const wed = await loadDayItems(db, WED, MON)
    expect(wed.map((i) => i.status)).toEqual(['skipped'])
    expect(computeDayStats(wed, 0).planned).toBe(0)
  })

  it('pause : aucune occurrence pendant la pause, puis reprise', async () => {
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await pauseRoutines(db, { fromDate: MON, toDate: WED }, at(MON))
    expect(await loadDayItems(db, MON, MON)).toHaveLength(0)
    expect(await loadDayItems(db, TUE, MON)).toHaveLength(0)
    expect(await loadDayItems(db, THU, MON)).toHaveLength(1)

    await endPause(db, (await db.pauses.toArray())[0].id, at(MON))
    expect((await loadDayItems(db, MON, MON)).map((i) => i.routineId)).toEqual([rid])
  })

  it('archiver : plus d\'occurrence, historique conservé', async () => {
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await runRollover(db, at(TUE))
    await archiveRoutine(db, rid, at(TUE))
    await runRollover(db, at(WED))
    const dates = (await db.entries.where('routineId').equals(rid).toArray()).map((e) => e.date).sort()
    expect(dates).toEqual([MON]) // l'occurrence de mardi, ouverte, est retirée ; lundi reste
    expect(await loadDayItems(db, THU, WED)).toHaveLength(0)
  })

  it('modifier la fréquence retire les occurrences devenues inutiles', async () => {
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    expect(await loadDayItems(db, MON, MON)).toHaveLength(1)
    await updateRoutine(db, rid, { frequency: { type: 'weekdays', weekdays: [4] } }, at(MON)) // vendredi seulement
    expect(await loadDayItems(db, MON, MON)).toHaveLength(0)
    expect(await loadDayItems(db, FRI, MON)).toHaveLength(1)
  })

  it('occurrences à venir : calculées, non stockées', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'weekdays', weekdays: [4] }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    const fri = await loadDayItems(db, FRI, MON)
    expect(fri).toHaveLength(1)
    expect(fri[0].virtual).toBe(true)
    expect(await db.entries.count()).toBe(0)
  })
})

describe('chrono et temps réel', () => {
  it('un seul chrono actif : en lancer un autre met le précédent en pause', async () => {
    await runRollover(db, at(MON))
    const a = await addTask(db, { name: 'A', plan: MON }, at(MON))
    const b = await addTask(db, { name: 'B', plan: MON }, at(MON))
    await startTimer(db, taskEntryId(a, MON), at(MON, 9, 0))
    await startTimer(db, taskEntryId(b, MON), at(MON, 9, 30))
    const running = await db.sessions.where('running').equals(1).toArray()
    expect(running).toHaveLength(1)
    expect(running[0].entryId).toBe(taskEntryId(b, MON))
    const closed = (await db.sessions.where('running').equals(0).toArray())[0]
    expect(closed).toMatchObject({ entryId: taskEntryId(a, MON), durationSec: 1800 })
  })

  it('pause puis reprise : deux sessions, temps réel = somme', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    const e = taskEntryId(id, MON)
    await startTimer(db, e, at(MON, 9, 0))
    await pauseTimer(db, at(MON, 9, 20))
    await startTimer(db, e, at(MON, 14, 0))
    await completeEntry(db, e, at(MON, 14, 10)) // cocher arrête le chrono (RG-64)
    const items = await loadDayItems(db, MON, MON)
    expect(items[0].spentSec).toBe(30 * 60)
    expect(items[0].runningSince).toBeUndefined()
    expect(await db.sessions.where('running').equals(1).count()).toBe(0)
  })

  it('imprévu : compté dans le temps passé, pas dans la progression ni la charge', async () => {
    await runRollover(db, at(MON))
    const planned = await addTask(db, { name: 'Prévue', estimateMin: 60, plan: MON }, at(MON))
    await addUnplanned(db, { name: 'Dépannage', durationMin: 35 }, at(MON, 16))
    const stats = computeDayStats(await loadDayItems(db, MON, MON), 0)
    expect(stats).toMatchObject({ planned: 1, done: 0, loadMin: 60, spentSec: 35 * 60 })
    await completeEntry(db, taskEntryId(planned, MON), at(MON, 17))
    expect(computeDayStats(await loadDayItems(db, MON, MON), 0)).toMatchObject({ planned: 1, done: 1 })
  })
})

describe('charge et indicateurs', () => {
  it('charge = estimations des éléments prévus ; reste = estimation - temps passé', async () => {
    await runRollover(db, at(MON))
    const a = await addTask(db, { name: 'A', estimateMin: 90, plan: MON }, at(MON))
    const b = await addTask(db, { name: 'B', estimateMin: 30, plan: MON }, at(MON))
    await addTask(db, { name: 'C', plan: MON }, at(MON)) // sans durée
    await startTimer(db, taskEntryId(a, MON), at(MON, 9))
    await pauseTimer(db, at(MON, 9, 30))
    await completeEntry(db, taskEntryId(b, MON), at(MON, 10))
    const s = computeDayStats(await loadDayItems(db, MON, MON), at(MON, 11))
    expect(s.planned).toBe(3)
    expect(s.done).toBe(1)
    expect(s.loadMin).toBe(120)
    expect(s.remainingMin).toBe(60) // A : 90 - 30
    expect(s.noEstimate).toBe(1)
  })

  it('un élément reporté sort de la charge du jour', async () => {
    const a = await addTask(db, { name: 'A', estimateMin: 60, plan: MON }, at(MON))
    await postponeEntry(db, taskEntryId(a, MON), TUE, at(MON))
    expect(computeDayStats(await loadDayItems(db, MON, MON), 0)).toMatchObject({ loadMin: 0, postponed: 1 })
    expect(computeDayStats(await loadDayItems(db, TUE, MON), 0).loadMin).toBe(60)
  })

  it('la charge d\'un jour futur inclut les routines à venir (RG-73)', async () => {
    await createRoutine(db, { name: 'Sport', estimateMin: 60, frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await addTask(db, { name: 'A', estimateMin: 30, plan: FRI }, at(MON))
    expect(computeDayStats(await loadDayItems(db, FRI, MON), 0).loadMin).toBe(90)
  })
})

describe('ordre manuel', () => {
  it('réordonner met à jour les positions et la place des routines', async () => {
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    const t = await addTask(db, { name: 'Tâche', plan: MON }, at(MON))
    const route = routineEntryId(rid, MON, MON)
    const task = taskEntryId(t, MON)
    expect((await loadDayItems(db, MON, MON)).map((i) => i.id)).toEqual([route, task])

    await reorderDay(db, MON, [task, route])
    expect((await loadDayItems(db, MON, MON)).map((i) => i.id)).toEqual([task, route])
    expect((await db.routines.get(rid))!.position).toBe(2000)
  })

  it('réordonner un jour futur matérialise les occurrences sans les dupliquer', async () => {
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    const t = await addTask(db, { name: 'Tâche', plan: WED }, at(MON))
    const route = routineEntryId(rid, WED, WED)
    await reorderDay(db, WED, [taskEntryId(t, WED), route])
    expect((await loadDayItems(db, WED, MON)).map((i) => i.id)).toEqual([taskEntryId(t, WED), route])
    await runRollover(db, at(WED))
    expect(await db.entries.where('[routineId+scheduledDate]').equals([rid, WED]).count()).toBe(1)
  })
})

describe('réserve', () => {
  it('tri : à replanifier d\'abord, puis échéance, puis ancienneté', async () => {
    await runRollover(db, at(MON))
    const old = await addTask(db, { name: 'ancienne', plan: 'reserve' }, at('2026-10-01'))
    const due = await addTask(db, { name: 'échéance', plan: 'reserve', dueDate: '2026-11-20' }, at('2026-11-05'))
    const overdue = await addTask(db, { name: 'à replanifier', plan: MON }, at(MON))
    await runRollover(db, at(TUE))
    const order = (await loadReserve(db, TUE)).map((r) => r.task.id)
    expect(order).toEqual([overdue, due, old])
  })

  it('ancienneté en jours', async () => {
    const id = await addTask(db, { name: 'A', plan: 'reserve' }, at('2026-11-01'))
    const [item] = await loadReserve(db, MON)
    expect(item.task.id).toBe(id)
    expect(item.ageDays).toBe(8)
  })
})

describe('calibrage et régularité', () => {
  it('suggère d\'ajuster l\'estimation après 5 réalisations chronométrées trop éloignées', async () => {
    const rid = await createRoutine(
      db,
      { name: 'Sport', estimateMin: 60, frequency: { type: 'daily' }, startDate: '2026-11-01' },
      at('2026-11-01'),
    )
    for (let i = 0; i < 6; i++) {
      const day = addDays('2026-11-01', i)
      await runRollover(db, at(day))
      const e = routineEntryId(rid, day, day)
      await startTimer(db, e, at(day, 18, 0))
      await completeEntry(db, e, at(day, 19, 20)) // 80 min
    }
    const detail = (await loadRoutineDetail(db, rid, '2026-11-06'))!
    expect(detail.avgRealMin).toBe(80)
    expect(detail.suggestedMin).toBe(80)
    expect(detail.week).toEqual({ done: 6, total: 6 })
    expect(detail.grid).toHaveLength(28)
    expect(detail.grid.length % 7).toBe(0)
  })
})

describe('sous-tâches', () => {
  it('durée = somme des sous-tâches ; la dernière cochée termine la tâche', async () => {
    const { addSubtask, toggleSubtask } = await import('./actions')
    const id = await addTask(db, { name: 'Dossier CAF', estimateMin: 10, plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'Pièces', estimateMin: 10 })
    const b = await addSubtask(db, id, { name: 'Formulaire', estimateMin: 15 })
    expect((await db.tasks.get(id))!.estimateMin).toBe(25)
    expect(await toggleSubtask(db, a, at(MON, 10))).toBe(false)
    expect((await db.tasks.get(id))!.status).toBe('todo')
    expect(await toggleSubtask(db, b, at(MON, 11))).toBe(true)
    expect((await db.tasks.get(id))!.status).toBe('done')
    // décocher rouvre la tâche
    await toggleSubtask(db, b, at(MON, 12))
    expect((await db.tasks.get(id))!.status).toBe('todo')
  })

  it('le chrono porte sur la première sous-tâche à faire, et le temps compte pour la tâche', async () => {
    const { addSubtask, toggleSubtask } = await import('./actions')
    const id = await addTask(db, { name: 'T', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A', estimateMin: 20 })
    await addSubtask(db, id, { name: 'B', estimateMin: 20 })
    const e = taskEntryId(id, MON)
    await startTimer(db, e, at(MON, 9))
    expect((await db.sessions.where('running').equals(1).first())!.subtaskId).toBe(a)
    await toggleSubtask(db, a, at(MON, 9, 15)) // cocher arrête son chrono
    expect(await db.sessions.where('running').equals(1).count()).toBe(0)
    const items = await loadDayItems(db, MON, MON)
    expect(items[0].spentSec).toBe(15 * 60)
    expect(items[0]).toMatchObject({ subtasksDone: 1, subtasksTotal: 2 })
  })

  it('tâche partiellement faite : part en réserve avec ce qui reste ; cocher la tâche termine tout', async () => {
    const { addSubtask, toggleSubtask } = await import('./actions')
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'T', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    const b = await addSubtask(db, id, { name: 'B' })
    await toggleSubtask(db, a, at(MON, 10))
    await runRollover(db, at(TUE))
    expect((await db.tasks.get(id))!.needsReview).toBe(true)
    expect((await db.subtasks.get(a))!.doneDate).toBe(MON)
    await completeTask(db, id, at(TUE, 9))
    expect((await db.subtasks.get(b))!.status).toBe('done')
  })
})

describe('chrono oublié', () => {
  it('arrêter à une heure passée enregistre la bonne durée', async () => {
    const { stopTimerAt } = await import('./actions')
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    await startTimer(db, taskEntryId(id, MON), at(MON, 9))
    await stopTimerAt(db, at(MON, 10, 30))
    const s = (await db.sessions.toArray())[0]
    expect(s).toMatchObject({ running: 0, durationSec: 90 * 60 })
  })
})

describe('annuler un saut', () => {
  it('une occurrence sautée redevient à faire', async () => {
    const { unskipEntry } = await import('./actions')
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    const e = routineEntryId(rid, MON, MON)
    await skipEntry(db, e, at(MON))
    await unskipEntry(db, e, at(MON, 10))
    expect((await db.entries.get(e))!.status).toBe('todo')
  })
})

describe('annuler une suppression', () => {
  it('restaure la tâche, son passage, son temps et ses étapes', async () => {
    const { snapshotTask, restoreTask, addSubtask } = await import('./actions')
    const id = await addTask(db, { name: 'A', estimateMin: 30, plan: MON }, at(MON))
    await addSubtask(db, id, { name: 'étape', estimateMin: 30 })
    await startTimer(db, taskEntryId(id, MON), at(MON, 9))
    await pauseTimer(db, at(MON, 9, 10))
    const snap = (await snapshotTask(db, id))!
    await deleteTask(db, id, at(MON, 10))
    await restoreTask(db, snap)
    const [item] = await loadDayItems(db, MON, MON)
    expect(item).toMatchObject({ name: 'A', status: 'todo', spentSec: 600, subtasksTotal: 1 })
  })
})

describe('supprimer, archiver, réactiver une routine', () => {
  it('supprimer efface tout l\'historique, et peut être annulé', async () => {
    const { snapshotRoutine, restoreRoutine, deleteRoutine } = await import('./actions')
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await runRollover(db, at(TUE))
    const snap = (await snapshotRoutine(db, rid))!
    await deleteRoutine(db, rid)
    expect(await db.routines.get(rid)).toBeUndefined()
    expect(await db.entries.where('routineId').equals(rid).count()).toBe(0)
    await restoreRoutine(db, snap)
    expect(await db.entries.where('routineId').equals(rid).count()).toBe(2)
  })

  it('une routine archivée peut être réactivée', async () => {
    const { unarchiveRoutine } = await import('./actions')
    const rid = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await archiveRoutine(db, rid, at(MON))
    expect(await loadDayItems(db, MON, MON)).toHaveLength(0)
    await unarchiveRoutine(db, rid, at(MON, 12))
    expect((await db.routines.get(rid))!.archivedAt).toBeUndefined()
    expect(await loadDayItems(db, MON, MON)).toHaveLength(1)
    expect(await loadDayItems(db, WED, MON)).toHaveLength(1)
  })
})

describe('routine avec date de fin', () => {
  it('s\'arrête après la date choisie', async () => {
    await createRoutine(db, { name: 'Cure', frequency: { type: 'daily' }, startDate: MON, endDate: WED }, at(MON))
    await runRollover(db, at(MON))
    expect((await loadDayItems(db, WED, MON))[0]).toMatchObject({ name: 'Cure', routineEnd: WED })
    expect(await loadDayItems(db, THU, MON)).toHaveLength(0)
  })
})

describe('ordre des routines', () => {
  it('le nouvel ordre s\'applique aux routines et aux occurrences du jour', async () => {
    const { reorderRoutines } = await import('./actions')
    const a = await createRoutine(db, { name: 'A', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    const b = await createRoutine(db, { name: 'B', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    expect((await loadDayItems(db, MON, MON)).map((i) => i.name)).toEqual(['A', 'B'])
    await reorderRoutines(db, [b, a], at(MON))
    expect((await loadDayItems(db, MON, MON)).map((i) => i.name)).toEqual(['B', 'A'])
    expect((await loadDayItems(db, WED, MON)).map((i) => i.name)).toEqual(['B', 'A'])
  })
})

describe('ordre manuel de la réserve', () => {
  it('l\'ordre choisi est gardé', async () => {
    const { reorderReserve } = await import('./actions')
    const a = await addTask(db, { name: 'A', plan: 'reserve' }, at(MON))
    const b = await addTask(db, { name: 'B', plan: 'reserve' }, at(MON))
    const c = await addTask(db, { name: 'C', plan: 'reserve' }, at(MON))
    await reorderReserve(db, [c, a, b])
    expect((await loadReserve(db, MON)).map((r) => r.task.name)).toEqual(['C', 'A', 'B'])
    await addTask(db, { name: 'D', plan: 'reserve' }, at(MON))
    expect((await loadReserve(db, MON)).map((r) => r.task.name)).toEqual(['C', 'A', 'B', 'D'])
  })
})

describe('rouvrir une tâche cochée par erreur', () => {
  it('retire le temps indiqué en cochant, garde celui du chrono', async () => {
    const { addSession } = await import('./actions')
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    const e = taskEntryId(id, MON)
    await startTimer(db, e, at(MON, 9))
    await pauseTimer(db, at(MON, 9, 10))
    await completeEntry(db, e, at(MON, 12))
    await addSession(db, e, { durationSec: 1800, startAt: at(MON, 11), endAt: at(MON, 11, 30) }, 'manual')
    await reopenEntry(db, e, at(MON, 12, 5))
    const [item] = await loadDayItems(db, MON, MON)
    expect(item).toMatchObject({ status: 'todo', spentSec: 600 })
    expect(item.segments).toHaveLength(1)
  })
})

describe('rattrapage des tâches rouvertes avant la correction', () => {
  it('retire une seule fois le temps resté sur une tâche à faire', async () => {
    const { addSession, cleanupReopenedTimes } = await import('./actions')
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    const e = taskEntryId(id, MON)
    await addSession(db, e, { durationSec: 1800, startAt: at(MON, 11), endAt: at(MON, 11, 30) }, 'manual')
    await cleanupReopenedTimes(db)
    expect(await db.sessions.count()).toBe(0)
    await addSession(db, e, { durationSec: 600, startAt: at(MON, 12), endAt: at(MON, 12, 10) }, 'manual')
    await cleanupReopenedTimes(db)
    expect(await db.sessions.count()).toBe(1)
  })
})

describe('semaine d\'une routine : couleurs et rattrapage', () => {
  it('dimanche → samedi ; verte, jaune si plus longue que prévu, rouge puis rattrapée', async () => {
    const { addSession, markDoneOnDay } = await import('./actions')
    const SUN = '2026-11-08'
    const rid = await createRoutine(db, { name: 'Sport', estimateMin: 20, frequency: { type: 'daily' }, startDate: SUN }, at(SUN))
    await runRollover(db, at(SUN))
    await addSession(db, routineEntryId(rid, SUN, SUN), { durationSec: 20 * 60 }, 'quick')
    await completeEntry(db, routineEntryId(rid, SUN, SUN), at(SUN, 20))
    await runRollover(db, at(MON))
    await addSession(db, routineEntryId(rid, MON, MON), { durationSec: 40 * 60 }, 'quick')
    await completeEntry(db, routineEntryId(rid, MON, MON), at(MON, 20))
    await runRollover(db, at(WED)) // mardi oublié
    const week = async () => (await loadRoutineDetail(db, rid, WED))!.grid.slice(-7)
    let w = await week()
    expect(w.map((g) => g.day)[0]).toBe(SUN)
    expect(w.map((g) => g.state)).toEqual(['done', 'late', 'not_done', 'todo', 'future', 'future', 'future'])
    // rattrapage du mardi en 15 min : redevient vert
    await markDoneOnDay(db, w[2].entryId!, at(WED, 10))
    await addSession(db, w[2].entryId!, { durationSec: 15 * 60 }, 'quick')
    w = await week()
    expect(w[2].state).toBe('done')
  })
})
