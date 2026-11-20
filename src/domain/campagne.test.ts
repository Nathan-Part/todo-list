import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDB, META, getMeta } from '../db'
import {
  addSession,
  addSubtask,
  addTask,
  addUnplanned,
  completeEntry,
  completeTask,
  createRoutine,
  deleteSubtask,
  markDoneOnDay,
  moveDoneTask,
  pauseTimer,
  planTask,
  postponeEntry,
  reopenEntry,
  routineEntryId,
  startTimer,
  taskEntryId,
  toggleRoutineStep,
  toggleSubtask,
  updateRoutine,
  updateTask,
} from './actions'
import { exportData, importData } from './backup'
import { CopiesDB, copiesToPrune, listCopies, pruneCopies, restoreCopy, takeDailyCopy } from './copies'
import { addDays, naturalDayOf, rangeToMs, setSleep, startOfWeek, todayOf } from './dates'
import { loadDayItems, loadItem, loadReserve, loadRoutineDetail, loadTaskDetail } from './queries'
import { loadWeekReview } from './review'
import { absenceToConfirm, runRollover } from './rollover'

let db: AppDB
const uid = () => Math.random().toString(36).slice(2)
beforeEach(() => {
  db = new AppDB(`camp-${uid()}`)
})
afterEach(() => setSleep(null))

// 2026-11-09 est un lundi
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'
const THU = '2026-11-12'
const at = (day: string, h = 9, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}
const hm = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ */
describe('le jour en cours', () => {
  it('toutes les heures de la journée, sans « Je vais dormir »', () => {
    for (let h = 0; h < 24; h++) {
      expect(todayOf(at(TUE, h)), `à ${h} h`).toBe(h < 5 ? MON : TUE)
    }
  })

  it('un vieux « Je vais dormir » ne décale plus rien les jours suivants', () => {
    setSleep({ day: MON, at: at(MON, 23) })
    expect(todayOf(at(WED, 10))).toBe(WED)
    expect(todayOf(at(THU, 3))).toBe(WED)
    expect(todayOf(at(THU, 5))).toBe(THU)
  })

  it('dormir deux soirs de suite', () => {
    setSleep({ day: MON, at: at(MON, 22) })
    expect(todayOf(at(MON, 22, 1))).toBe(TUE)
    setSleep({ day: TUE, at: at(TUE, 23, 30) })
    expect(todayOf(at(TUE, 23, 31))).toBe(WED)
    expect(todayOf(at(WED, 4))).toBe(WED)
    expect(todayOf(at(WED, 20))).toBe(WED)
  })

  it('dormir après minuit puis veiller la nuit suivante', () => {
    setSleep({ day: MON, at: at(TUE, 2) }) // 2 h du matin : on clôt lundi
    expect(todayOf(at(TUE, 2, 1))).toBe(TUE)
    expect(todayOf(at(WED, 1))).toBe(TUE) // nuit suivante, pas encore dormi
    expect(todayOf(at(WED, 5))).toBe(WED)
  })

  it('le passage de mois et d\'année', () => {
    expect(todayOf(new Date(2027, 0, 1, 3).getTime())).toBe('2026-12-31')
    expect(todayOf(new Date(2027, 0, 1, 5).getTime())).toBe('2027-01-01')
    expect(naturalDayOf(new Date(2026, 2, 1, 4, 59).getTime())).toBe('2026-02-28')
  })
})

describe('heures saisies → instants', () => {
  const now = at(WED, 14)
  it('cas simple', () => {
    const r = rangeToMs(TUE, '09:15', '10:00', now)!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${TUE} 09:15`, `${TUE} 10:00`])
  })
  it('fin après minuit', () => {
    const r = rangeToMs(MON, '23:30', '00:45', now)!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${MON} 23:30`, `${TUE} 00:45`])
  })
  it('début après minuit : c\'est la nuit de la journée, donc le lendemain au calendrier', () => {
    const r = rangeToMs(MON, '01:30', '02:00', now)!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${TUE} 01:30`, `${TUE} 02:00`])
  })
  it('à cheval sur 5 h', () => {
    const r = rangeToMs(MON, '04:30', '05:30', now)!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${TUE} 04:30`, `${TUE} 05:30`])
  })
  it('juste après 5 h, une tâche commencée avant 5 h le matin même', () => {
    const r = rangeToMs(WED, '04:40', '05:10', at(WED, 5, 10))!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${WED} 04:40`, `${WED} 05:10`])
  })
  it('journée close par « Je vais dormir » : le soir même reste le soir même', () => {
    // on a dormi mardi à 21 h, on est donc « mercredi » ; on saisit 21:10 → 21:40 à 21 h 40 mardi
    const r = rangeToMs(WED, '21:10', '21:40', at(TUE, 21, 40))!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${TUE} 21:10`, `${TUE} 21:40`])
  })
  it('même cas, à cheval sur minuit', () => {
    const r = rangeToMs(WED, '23:50', '00:20', at(WED, 0, 20))!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${TUE} 23:50`, `${WED} 00:20`])
  })
  it('la nuit, sans avoir dormi : 1 h du matin compte pour la veille', () => {
    // mercredi 1 h 30 : la journée est encore mardi
    const r = rangeToMs(TUE, '01:00', '01:30', at(WED, 1, 30))!
    expect([hm(r.startAt), hm(r.endAt)]).toEqual([`${WED} 01:00`, `${WED} 01:30`])
  })
  it('champs vides', () => {
    expect(rangeToMs(TUE, '', '10:00', now)).toBeNull()
    expect(rangeToMs(TUE, '09:00', '', now)).toBeNull()
  })
  it('début = fin : 24 h (comportement historique)', () => {
    const r = rangeToMs(MON, '10:00', '10:00', now)!
    expect(r.endAt - r.startAt).toBe(86_400_000)
  })
})

/* ------------------------------------------------------------------ */
describe('« Je vais dormir » et bascule de jour', () => {
  it('dormir le soir : les tâches pas faites partent en réserve, les routines du lendemain arrivent', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    setSleep({ day: MON, at: at(MON, 23) })
    await runRollover(db, at(MON, 23, 0))
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('not_done')
    expect((await db.tasks.get(id))!).toMatchObject({ needsReview: true, reserveSince: TUE })
    const routineEntries = (await db.entries.toArray()).filter((e) => e.kind === 'routine')
    expect(routineEntries.map((e) => `${e.date}:${e.status}`).sort()).toEqual([`${MON}:not_done`, `${TUE}:todo`])
    expect(await getMeta(db, META.lastGenerated, '')).toBe(TUE)

    // au réveil : rien n'est dupliqué
    await runRollover(db, at(TUE, 8))
    expect((await db.entries.toArray()).filter((e) => e.kind === 'routine')).toHaveLength(2)
  })

  it('sans dormir, à 4 h 59 rien ne bascule ; à 5 h tout bascule', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await runRollover(db, at(TUE, 4, 59))
    expect((await db.entries.toArray()).map((e) => e.status)).toEqual(['todo'])
    await runRollover(db, at(TUE, 5, 0))
    expect((await db.entries.toArray()).map((e) => `${e.date}:${e.status}`).sort()).toEqual([`${MON}:not_done`, `${TUE}:todo`])
  })

  it('une routine cochée à 2 h du matin compte pour la veille', async () => {
    const r = await createRoutine(db, { name: 'Lecture', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await completeEntry(db, routineEntryId(r, MON, MON), at(TUE, 2))
    await runRollover(db, at(TUE, 9))
    const detail = await loadRoutineDetail(db, r, TUE)
    expect(detail!.grid.find((g) => g.day === MON)!.state).toBe('done')
    expect(detail!.grid.find((g) => g.day === TUE)!.state).toBe('todo')
  })

  it('une tâche ajoutée à 1 h du matin « aujourd\'hui » va sur la journée en cours (la veille)', async () => {
    const today = todayOf(at(TUE, 1))
    expect(today).toBe(MON)
    const id = await addTask(db, { name: 'Note', plan: today }, at(TUE, 1))
    expect((await loadDayItems(db, MON, MON)).map((i) => i.taskId)).toEqual([id])
  })

  it('après « dormir » à 22 h, une tâche cochée à 22 h 30 est faite le lendemain', async () => {
    const id = await addTask(db, { name: 'Lire', plan: 'reserve' }, at(MON))
    setSleep({ day: MON, at: at(MON, 22) })
    await runRollover(db, at(MON, 22))
    await completeTask(db, id, at(MON, 22, 30))
    expect((await db.tasks.get(id))!.doneDate).toBe(TUE)
    expect((await db.entries.get(taskEntryId(id, TUE)))!.status).toBe('done')
  })

  it('un chrono lancé avant « dormir » garde son passage, puis il est clos à l\'arrêt', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Étudier', plan: MON }, at(MON))
    await startTimer(db, taskEntryId(id, MON), at(MON, 21, 30))
    setSleep({ day: MON, at: at(MON, 22) })
    await runRollover(db, at(MON, 22))
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('todo')
    await pauseTimer(db, at(MON, 22, 15))
    await runRollover(db, at(MON, 22, 16))
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('not_done')
    const s = (await db.sessions.toArray())[0]
    expect(s).toMatchObject({ date: MON, durationSec: 45 * 60 })
  })

  it('plusieurs jours sans ouvrir : la question d\'absence tient compte de la règle des 5 h', async () => {
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    // jeudi 3 h du matin = encore mercredi : mardi seulement est manqué en entier → pas de question
    expect(await absenceToConfirm(db, at(THU, 3))).toBeNull()
    // jeudi 9 h : mardi et mercredi manqués
    expect(await absenceToConfirm(db, at(THU, 9))).toMatchObject({ from: TUE, to: WED, days: 2 })
  })

  it('dormir deux fois de suite par erreur ne saute pas un jour de routines', async () => {
    const r = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    setSleep({ day: MON, at: at(MON, 22) })
    await runRollover(db, at(MON, 22))
    setSleep({ day: TUE, at: at(MON, 22, 5) })
    await runRollover(db, at(MON, 22, 5))
    const days = (await db.entries.where('routineId').equals(r).toArray()).map((e) => `${e.date}:${e.status}`).sort()
    expect(days).toEqual([`${MON}:not_done`, `${TUE}:not_done`, `${WED}:todo`])
  })
})

/* ------------------------------------------------------------------ */
describe('tiroir de copies : conservation', () => {
  it('lundi : la semaine d\'avant ne garde que sa dernière copie', () => {
    const days = ['2026-11-02', '2026-11-05', '2026-11-08', MON]
    expect(copiesToPrune(days, MON).sort()).toEqual(['2026-11-02', '2026-11-05'])
  })
  it('dimanche : rien de la semaine en cours n\'est supprimé', () => {
    const week = Array.from({ length: 7 }, (_, i) => addDays(MON, i))
    expect(copiesToPrune(week, addDays(MON, 6))).toEqual([])
  })
  it('une seule copie dans une semaine passée : elle reste', () => {
    expect(copiesToPrune(['2026-10-14', MON], MON)).toEqual([])
  })
  it('passage d\'année', () => {
    const days = ['2026-12-28', '2026-12-31', '2027-01-02', '2027-01-04']
    expect(copiesToPrune(days, '2027-01-05').sort()).toEqual(['2026-12-28', '2026-12-31'])
  })
  it('liste vide', () => {
    expect(copiesToPrune([], MON)).toEqual([])
  })

  it('40 jours d\'ouverture quotidienne : toute la semaine en cours + une copie par semaine passée', async () => {
    const c = new CopiesDB(`cc-${uid()}`)
    await addTask(db, { name: 'A', plan: 'reserve' }, at(MON))
    const start = '2026-10-01' // jeudi
    let last = start
    for (let i = 0; i < 40; i++) {
      last = addDays(start, i)
      expect(await takeDailyCopy(db, c, last, at(last, 8))).toBe(true)
    }
    const kept = (await listCopies(c)).map((x) => x.day).sort()
    const currentWeek = startOfWeek(last)
    const past = kept.filter((d) => d < currentWeek)
    // une seule copie par semaine passée, et c'est un dimanche
    expect(new Set(past.map(startOfWeek)).size).toBe(past.length)
    for (const d of past) expect(addDays(startOfWeek(d), 6)).toBe(d)
    // semaine en cours : tous les jours depuis lundi
    const cur = kept.filter((d) => d >= currentWeek)
    expect(cur).toHaveLength(Math.round((at(last) - at(currentWeek)) / 86_400_000) + 1)
  })

  it('jours sautés : la dernière copie de la semaine est le dernier jour ouvert', async () => {
    const c = new CopiesDB(`cc-${uid()}`)
    await addTask(db, { name: 'A', plan: 'reserve' }, at(MON))
    for (const d of ['2026-11-02', '2026-11-04', '2026-11-07', MON, WED]) await takeDailyCopy(db, c, d, at(d))
    expect((await listCopies(c)).map((x) => x.day).sort()).toEqual(['2026-11-07', MON, WED])
  })

  it('on ne garde que 3 états « avant restauration »', async () => {
    const c = new CopiesDB(`cc-${uid()}`)
    await addTask(db, { name: 'A', plan: 'reserve' }, at(MON))
    await takeDailyCopy(db, c, MON, at(MON))
    for (let i = 1; i <= 5; i++) await restoreCopy(db, c, `daily-${MON}`, MON, at(MON, 10, i))
    const kinds = (await listCopies(c)).map((x) => x.kind)
    expect(kinds.filter((k) => k === 'beforeRestore')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'daily')).toHaveLength(1)
  })

  it('restaurer rend tout : tâches, étapes, routines, temps, réglages', async () => {
    const c = new CopiesDB(`cc-${uid()}`)
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Dossier', plan: MON, onSite: true }, at(MON))
    const st = await addSubtask(db, id, { name: 'Étape', estimateMin: 20 })
    await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON, onSite: true }, at(MON))
    await addSession(db, taskEntryId(id, MON), { durationSec: 600, startAt: at(MON, 10), endAt: at(MON, 10, 10), subtaskId: st }, 'manual')
    const before = await exportData(db)
    await takeDailyCopy(db, c, MON, at(MON, 12))

    // dégâts
    await db.tasks.clear()
    await db.sessions.clear()
    await db.routines.clear()
    await restoreCopy(db, c, `daily-${MON}`, MON, at(MON, 13))
    const after = await exportData(db)
    const strip = (j: string) => JSON.stringify({ ...JSON.parse(j), exportedAt: 0 })
    expect(strip(after)).toBe(strip(before))
    expect((await db.tasks.get(id))!.onSite).toBe(true)
  })

  it('une copie illisible ne casse pas les données en place', async () => {
    const c = new CopiesDB(`cc-${uid()}`)
    await addTask(db, { name: 'A', plan: 'reserve' }, at(MON))
    await c.copies.put({ id: 'daily-x', day: MON, createdAt: 1, kind: 'daily', data: '{pas du json' })
    await expect(restoreCopy(db, c, 'daily-x', MON, at(MON))).rejects.toThrow()
    expect(await db.tasks.count()).toBe(1)
    await expect(restoreCopy(db, c, 'absente', MON, at(MON))).rejects.toThrow('introuvable')
  })

  it('pruneCopies seul ne touche pas la semaine en cours', async () => {
    const c = new CopiesDB(`cc-${uid()}`)
    for (const d of [MON, TUE, WED]) await c.copies.put({ id: `daily-${d}`, day: d, createdAt: at(d), kind: 'daily', data: '{}' })
    await pruneCopies(c, WED)
    expect(await c.copies.count()).toBe(3)
  })

  it('l\'import d\'un fichier garde « sur place » et les étapes cochées avec la tâche', async () => {
    const id = await addTask(db, { name: 'Machine', plan: MON, onSite: true }, at(MON))
    const st = await addSubtask(db, id, { name: 'Étendre' })
    await completeEntry(db, taskEntryId(id, MON), at(MON, 10))
    const json = await exportData(db)
    const other = new AppDB(`camp-${uid()}`)
    await importData(other, json)
    expect((await other.tasks.get(id))!.onSite).toBe(true)
    expect((await other.subtasks.get(st))!.withTask).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
describe('sur place / partout', () => {
  it('une tâche est « partout » par défaut, et le choix se modifie', async () => {
    const id = await addTask(db, { name: 'Appeler', plan: MON }, at(MON))
    expect((await loadDayItems(db, MON, MON))[0].onSite).toBe(false)
    await updateTask(db, id, { onSite: true })
    expect((await loadDayItems(db, MON, MON))[0].onSite).toBe(true)
    await updateTask(db, id, { onSite: undefined })
    expect((await loadDayItems(db, MON, MON))[0].onSite).toBe(false)
  })

  it('routine sur place : occurrences d\'aujourd\'hui et à venir', async () => {
    const r = await createRoutine(db, { name: 'Lit', frequency: { type: 'daily' }, startDate: MON, onSite: true }, at(MON))
    await runRollover(db, at(MON))
    expect((await loadDayItems(db, MON, MON))[0].onSite).toBe(true)
    const future = await loadDayItems(db, WED, MON)
    expect(future[0]).toMatchObject({ virtual: true, onSite: true })
    await updateRoutine(db, r, { onSite: undefined }, at(MON, 10))
    expect((await loadDayItems(db, WED, MON))[0].onSite).toBe(false)
  })

  it('la réserve garde l\'information', async () => {
    await addTask(db, { name: 'Machine', plan: 'reserve', onSite: true }, at(MON))
    expect((await loadReserve(db, MON))[0].task.onSite).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
describe('étapes : parcours complets', () => {
  it('étape par étape : la dernière cochée termine la tâche, sans regroupement', async () => {
    const id = await addTask(db, { name: 'CV', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A', estimateMin: 10 })
    const b = await addSubtask(db, id, { name: 'B', estimateMin: 20 })
    expect((await db.tasks.get(id))!.estimateMin).toBe(30)
    expect(await toggleSubtask(db, a, at(MON, 10))).toBe(false)
    expect(await toggleSubtask(db, b, at(MON, 11))).toBe(true)
    expect((await db.tasks.get(id))!.status).toBe('done')
    for (const s of await db.subtasks.toArray()) expect(s.withTask).toBeUndefined()
  })

  it('chrono sur une étape, tâche cochée en entier : le chrono s\'arrête, les autres étapes sont regroupées', async () => {
    const id = await addTask(db, { name: 'CV', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    const b = await addSubtask(db, id, { name: 'B' })
    const c = await addSubtask(db, id, { name: 'C' })
    await startTimer(db, taskEntryId(id, MON), at(MON, 10), a)
    await completeEntry(db, taskEntryId(id, MON), at(MON, 10, 20))
    expect(await db.sessions.where('running').equals(1).count()).toBe(0)
    const item = (await loadDayItems(db, MON, MON))[0]
    expect(item.status).toBe('done')
    expect(item.subtasks.map((s) => [s.status, !!s.withTask])).toEqual([
      ['done', true],
      ['done', true],
      ['done', true],
    ])
    expect(item.subtasks.find((s) => s.id === a)!.spentSec).toBe(20 * 60)
    void b
    void c
  })

  it('décocher une étape d\'une tâche cochée en entier : elle seule redevient à faire', async () => {
    const id = await addTask(db, { name: 'CV', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    const b = await addSubtask(db, id, { name: 'B' })
    await completeEntry(db, taskEntryId(id, MON), at(MON, 10))
    await toggleSubtask(db, b, at(MON, 11))
    expect((await db.tasks.get(id))!.status).toBe('todo')
    expect((await db.subtasks.get(a))!.status).toBe('done')
    expect((await db.subtasks.get(b))!.status).toBe('todo')
    // on la recoche : la tâche est de nouveau finie
    expect(await toggleSubtask(db, b, at(MON, 12))).toBe(true)
    expect((await db.tasks.get(id))!.status).toBe('done')
  })

  it('tâche sur deux jours : étapes d\'hier gardées, total calculé, puis terminée aujourd\'hui', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    const b = await addSubtask(db, id, { name: 'B' })
    await startTimer(db, taskEntryId(id, MON), at(MON, 14), a)
    await toggleSubtask(db, a, at(MON, 14, 40))
    await runRollover(db, at(TUE, 9))
    expect((await db.tasks.get(id))!.needsReview).toBe(true)
    await planTask(db, id, TUE, at(TUE, 9))
    await startTimer(db, taskEntryId(id, TUE), at(TUE, 10), b)
    await pauseTimer(db, at(TUE, 10, 25))
    const item = (await loadDayItems(db, TUE, TUE))[0]
    expect(item.spentSec).toBe(25 * 60)
    expect(item.otherDaysSec).toBe(40 * 60)
    expect(await toggleSubtask(db, b, at(TUE, 10, 26))).toBe(true)
    const detail = await loadTaskDetail(db, id)
    expect(detail!.sessions.reduce((n, s) => n + s.durationSec, 0)).toBe(65 * 60)
    expect(detail!.task.doneDate).toBe(TUE)
    // hier garde son étape
    expect((await db.subtasks.get(a))!.doneDate).toBe(MON)
  })

  it('le total « autres jours » ignore un chrono en cours et les autres tâches', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    const other = await addTask(db, { name: 'B', plan: MON }, at(MON))
    await addSession(db, taskEntryId(other, MON), { durationSec: 999 }, 'manual')
    await addSession(db, taskEntryId(id, MON), { durationSec: 300 }, 'manual')
    await postponeEntry(db, taskEntryId(id, MON), TUE, at(MON, 12))
    const tue = await loadDayItems(db, TUE, MON)
    expect(tue.find((i) => i.taskId === id)!.otherDaysSec).toBe(300)
    const mon = await loadDayItems(db, MON, MON)
    expect(mon.find((i) => i.taskId === other)!.otherDaysSec).toBeUndefined()
    const single = await loadItem(db, taskEntryId(id, TUE))
    expect(single!.otherDaysSec).toBe(300)
  })

  it('« fait ce jour-là » sur un jour passé coche aussi les étapes restantes', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    await runRollover(db, at(TUE))
    await markDoneOnDay(db, taskEntryId(id, MON), at(TUE, 10))
    expect((await db.subtasks.get(a))!).toMatchObject({ status: 'done', doneDate: MON, withTask: true })
    expect((await db.tasks.get(id))!).toMatchObject({ status: 'done', doneDate: MON, needsReview: false })
  })

  it('tâche notée « hier » à la création, avec des étapes', async () => {
    await runRollover(db, at(TUE))
    const id = await addTask(db, { name: 'Courses', plan: MON }, at(TUE, 10))
    await addSubtask(db, id, { name: 'Liste', estimateMin: 5 })
    await addSubtask(db, id, { name: 'Acheter', estimateMin: 40 })
    await markDoneOnDay(db, taskEntryId(id, MON), at(TUE, 10))
    await addSession(db, taskEntryId(id, MON), { durationSec: 2700, startAt: at(MON, 17), endAt: at(MON, 17, 45) }, 'quick')
    const mon = await loadDayItems(db, MON, TUE)
    expect(mon[0]).toMatchObject({ status: 'done', spentSec: 2700, estimateMin: 45 })
    expect(await loadDayItems(db, TUE, TUE)).toHaveLength(0)
    expect(await loadReserve(db, TUE)).toHaveLength(0)
    // une nouvelle bascule ne la rouvre pas
    await runRollover(db, at(WED))
    expect((await db.tasks.get(id))!.status).toBe('done')
  })

  it('supprimer la dernière étape à faire', async () => {
    const id = await addTask(db, { name: 'CV', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    const b = await addSubtask(db, id, { name: 'B' })
    await toggleSubtask(db, a, at(MON, 10))
    await deleteSubtask(db, b, at(MON, 11))
    expect(await db.subtasks.count()).toBe(1)
  })

  it('routine découpée : étape par étape, puis décocher rouvre', async () => {
    const steps = [
      { id: 's1', name: 'Échauffement', estimateMin: 5 },
      { id: 's2', name: 'Course', estimateMin: 20 },
    ]
    const r = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON, steps }, at(MON))
    await runRollover(db, at(MON))
    const eid = routineEntryId(r, MON, MON)
    expect(await toggleRoutineStep(db, eid, 's1', at(MON, 7))).toBe(false)
    await startTimer(db, eid, at(MON, 7, 5))
    expect((await db.sessions.toArray())[0].subtaskId).toBe('s2')
    expect(await toggleRoutineStep(db, eid, 's2', at(MON, 7, 25))).toBe(true)
    expect(await db.sessions.where('running').equals(1).count()).toBe(0)
    expect((await db.entries.get(eid))!.status).toBe('done')
    await toggleRoutineStep(db, eid, 's1', at(MON, 8))
    expect((await db.entries.get(eid))!.status).toBe('todo')
  })
})

/* ------------------------------------------------------------------ */
describe('déplacer une tâche faite : cas limites', () => {
  it('vers un jour où elle était « non terminée » : ce passage devient « faite », les temps se cumulent', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Vélo', plan: MON }, at(MON))
    await addSession(db, taskEntryId(id, MON), { durationSec: 600, startAt: at(MON, 10), endAt: at(MON, 10, 10) }, 'manual')
    await runRollover(db, at(TUE))
    await completeTask(db, id, at(TUE, 15))
    await addSession(db, taskEntryId(id, TUE), { durationSec: 1200, startAt: at(TUE, 14), endAt: at(TUE, 14, 20) }, 'quick')
    await moveDoneTask(db, taskEntryId(id, TUE), MON, at(TUE, 16))
    const entries = await db.entries.where('taskId').equals(id).toArray()
    expect(entries.map((e) => `${e.date}:${e.status}`)).toEqual([`${MON}:done`])
    const sessions = await db.sessions.where('entryId').equals(taskEntryId(id, MON)).toArray()
    expect(sessions.map((s) => hm(s.startAt!)).sort()).toEqual([`${MON} 10:00`, `${MON} 14:00`])
    expect((await db.tasks.get(id))!).toMatchObject({ status: 'done', doneDate: MON })
    expect((await loadDayItems(db, MON, TUE))[0].spentSec).toBe(1800)
  })

  it('les étapes faites ce jour-là suivent', async () => {
    const id = await addTask(db, { name: 'CV', plan: TUE }, at(TUE))
    const a = await addSubtask(db, id, { name: 'A' })
    await completeEntry(db, taskEntryId(id, TUE), at(TUE, 10))
    await moveDoneTask(db, taskEntryId(id, TUE), MON, at(TUE, 11))
    expect((await db.subtasks.get(a))!.doneDate).toBe(MON)
  })

  it('un imprévu déjà fait se déplace aussi', async () => {
    const id = await addUnplanned(db, { name: 'Dépannage', durationMin: 30, startAt: at(TUE, 9), endAt: at(TUE, 9, 30) }, at(TUE, 10))
    await moveDoneTask(db, taskEntryId(id, TUE), MON, at(TUE, 11))
    const item = (await loadDayItems(db, MON, TUE))[0]
    expect(item).toMatchObject({ status: 'done', unplanned: true, spentSec: 1800 })
    expect(hm(item.segments[0].start)).toBe(`${MON} 09:00`)
  })

  it('une session après minuit garde son heure', async () => {
    const id = await addTask(db, { name: 'Nuit', plan: TUE }, at(TUE))
    await addSession(db, taskEntryId(id, TUE), { durationSec: 1800, startAt: at(WED, 0, 30), endAt: at(WED, 1) }, 'manual')
    await completeEntry(db, taskEntryId(id, TUE), at(WED, 1))
    await moveDoneTask(db, taskEntryId(id, TUE), MON, at(WED, 10))
    const s = (await db.sessions.toArray())[0]
    expect([hm(s.startAt!), hm(s.endAt!), s.date]).toEqual([`${TUE} 00:30`, `${TUE} 01:00`, MON])
  })

  it('même jour : rien ne change ; routine ou tâche à faire : refusé', async () => {
    const id = await addTask(db, { name: 'A', plan: MON }, at(MON))
    expect(await moveDoneTask(db, taskEntryId(id, MON), TUE, at(MON))).toBeUndefined() // pas faite
    await completeEntry(db, taskEntryId(id, MON), at(MON, 10))
    expect(await moveDoneTask(db, taskEntryId(id, MON), MON, at(MON, 11))).toBe(taskEntryId(id, MON))
    const r = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' }, startDate: MON }, at(MON))
    await runRollover(db, at(MON))
    await completeEntry(db, routineEntryId(r, MON, MON), at(MON, 12))
    expect(await moveDoneTask(db, routineEntryId(r, MON, MON), '2026-11-08', at(MON, 13))).toBeUndefined()
    expect(await moveDoneTask(db, 'inconnu', MON, at(MON))).toBeUndefined()
  })

  it('déplacée puis rouverte : elle revient en réserve proprement', async () => {
    const id = await addTask(db, { name: 'A', plan: TUE }, at(TUE))
    await completeEntry(db, taskEntryId(id, TUE), at(TUE, 10))
    await moveDoneTask(db, taskEntryId(id, TUE), MON, at(TUE, 11))
    await reopenEntry(db, taskEntryId(id, MON), at(TUE, 12))
    expect((await db.tasks.get(id))!.status).toBe('todo')
    expect((await loadReserve(db, TUE)).map((r) => r.task.id)).toEqual([id])
  })

  it('le bilan de la semaine suit le déplacement', async () => {
    await runRollover(db, at(TUE))
    const id = await addTask(db, { name: 'A', plan: TUE }, at(TUE))
    await completeEntry(db, taskEntryId(id, TUE), at(TUE, 10))
    await addSession(db, taskEntryId(id, TUE), { durationSec: 3600, startAt: at(TUE, 9), endAt: at(TUE, 10) }, 'quick')
    await moveDoneTask(db, taskEntryId(id, TUE), MON, at(TUE, 11))
    const review = await loadWeekReview(db, TUE, TUE, [0, 0, 0, 0, 0, 0, 0])
    expect(review.days.find((d) => d.day === MON)).toMatchObject({ done: 1 })
    expect(review.days.find((d) => d.day === TUE)).toMatchObject({ done: 0, planned: 0 })
    expect(review.spentSec).toBe(3600)
  })
})

/* ------------------------------------------------------------------ */
describe('trou dans la journée', () => {
  it('le temps d\'un trou compté sur une tâche du jour : elle reste à faire, avec son temps', async () => {
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    await addSession(db, taskEntryId(id, MON), { durationSec: 1800, startAt: at(MON, 11), endAt: at(MON, 11, 30) }, 'manual')
    const item = (await loadDayItems(db, MON, MON))[0]
    expect(item).toMatchObject({ status: 'todo', spentSec: 1800, hasSessions: true })
    expect(item.segments).toHaveLength(1)
  })

  it('un imprévu noté à 1 h du matin est rangé sur la journée demandée', async () => {
    const id = await addUnplanned(
      db,
      { name: 'Insomnie', durationMin: 30, startAt: at(TUE, 1), endAt: at(TUE, 1, 30), day: MON },
      at(TUE, 9),
    )
    expect((await db.tasks.get(id))!.doneDate).toBe(MON)
    expect((await loadDayItems(db, MON, TUE)).map((i) => i.taskId)).toEqual([id])
    // sans jour précisé, la règle des 5 h donne le même résultat
    const id2 = await addUnplanned(db, { name: 'Autre', durationMin: 10, startAt: at(TUE, 2), endAt: at(TUE, 2, 10) }, at(TUE, 9))
    expect((await db.tasks.get(id2))!.doneDate).toBe(MON)
  })
})

/* ------------------------------------------------------------------ */
describe('défauts trouvés par les tests au hasard (ne doivent pas revenir)', () => {
  /** Tâche faite lundi, rouverte mardi, refaite mardi : lundi garde une ancienne trace « faite ». */
  async function redone() {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' }, at(MON))
    await completeEntry(db, taskEntryId(id, MON), at(MON, 10))
    await runRollover(db, at(TUE))
    await reopenEntry(db, taskEntryId(id, MON), at(TUE, 9)) // retour en réserve, lundi garde sa trace
    await completeTask(db, id, at(TUE, 10))
    return { id, a }
  }

  it('« pas faite » sur l\'ancienne trace ne rouvre pas la tâche refaite depuis', async () => {
    const { id } = await redone()
    await reopenEntry(db, taskEntryId(id, MON), at(TUE, 11))
    expect((await db.tasks.get(id))!).toMatchObject({ status: 'done', doneDate: TUE })
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('not_done')
    expect((await db.entries.get(taskEntryId(id, TUE)))!.status).toBe('done')
  })

  it('décocher une étape rouvre le bon passage (celui du jour où la tâche est faite)', async () => {
    const { id, a } = await redone()
    await toggleSubtask(db, a, at(TUE, 11))
    expect((await db.tasks.get(id))!.status).toBe('todo')
    expect((await db.entries.get(taskEntryId(id, TUE)))!.status).toBe('todo')
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('done') // l'historique de lundi ne bouge pas
  })

  it('ajouter une étape rouvre aussi le bon passage', async () => {
    const { id } = await redone()
    await addSubtask(db, id, { name: 'B' }, at(TUE, 11))
    expect((await db.tasks.get(id))!.status).toBe('todo')
    expect((await db.entries.get(taskEntryId(id, TUE)))!.status).toBe('todo')
  })

  it('une ancienne trace « faite » ne se déplace pas sur un autre jour', async () => {
    const { id } = await redone()
    expect(await moveDoneTask(db, taskEntryId(id, MON), '2026-11-08', at(TUE, 11))).toBeUndefined()
    expect((await db.tasks.get(id))!.doneDate).toBe(TUE)
    expect(await db.entries.get(taskEntryId(id, '2026-11-08'))).toBeUndefined()
  })

  it('chrono resté ouvert après le changement de jour : la tâche terminée ensuite est faite sur sa journée de départ', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Étudier', plan: MON }, at(MON))
    await startTimer(db, taskEntryId(id, MON), at(MON, 23))
    setSleep({ day: MON, at: at(MON, 23, 30) })
    await runRollover(db, at(MON, 23, 30))
    await completeEntry(db, taskEntryId(id, MON), at(TUE, 0, 15))
    expect((await db.tasks.get(id))!).toMatchObject({ status: 'done', doneDate: MON })
    // et on peut la rouvrir normalement
    await reopenEntry(db, taskEntryId(id, MON), at(TUE, 9))
    expect((await db.tasks.get(id))!.status).toBe('todo')
  })

  it('« fait ce jour-là » est refusé pour une tâche déjà faite un autre jour', async () => {
    const { id } = await redone()
    await reopenEntry(db, taskEntryId(id, MON), at(TUE, 11)) // lundi : non terminée
    await markDoneOnDay(db, taskEntryId(id, MON), at(TUE, 12))
    expect((await db.tasks.get(id))!.doneDate).toBe(TUE)
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('not_done')
  })

  it('« fait ce jour-là » garde le temps déjà passé aujourd\'hui, chrono en cours compris', async () => {
    await runRollover(db, at(MON))
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    await runRollover(db, at(TUE))
    await planTask(db, id, TUE, at(TUE, 9))
    await addSession(db, taskEntryId(id, TUE), { durationSec: 600 }, 'manual')
    await startTimer(db, taskEntryId(id, TUE), at(TUE, 10))
    await markDoneOnDay(db, taskEntryId(id, MON), at(TUE, 10, 30))
    const sessions = await db.sessions.toArray()
    expect(sessions.every((s) => s.entryId === taskEntryId(id, MON) && s.date === MON && s.running === 0)).toBe(true)
    expect(sessions.reduce((n, s) => n + s.durationSec, 0)).toBe(600 + 1800)
    expect(await db.entries.get(taskEntryId(id, TUE))).toBeUndefined()
  })
})
