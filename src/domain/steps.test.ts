import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from '../db'
import {
  addSession,
  addSubtask,
  addTask,
  completeEntry,
  moveDoneTask,
  pauseTimer,
  reopenEntry,
  startTimer,
  taskEntryId,
  toggleSubtask,
} from './actions'
import { loadDayItems } from './queries'

let db: AppDB
beforeEach(() => {
  db = new AppDB(`steps-${Math.random().toString(36).slice(2)}`)
})

const MON = '2026-11-16'
const TUE = '2026-11-17'
const at = (day: string, h = 9, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}

describe('tâche découpée', () => {
  it('cocher la tâche entière marque les étapes restantes « avec la tâche », pas celles déjà faites', async () => {
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    const b = await addSubtask(db, id, { name: 'B' })
    await toggleSubtask(db, a, at(MON, 10))
    await completeEntry(db, taskEntryId(id, MON), at(MON, 11))
    expect((await db.subtasks.get(a))!.withTask).toBeUndefined()
    expect((await db.subtasks.get(b))!).toMatchObject({ status: 'done', withTask: true })

    // rouvrir la tâche : seule l'étape cochée avec elle redevient à faire
    await reopenEntry(db, taskEntryId(id, MON), at(MON, 12))
    expect((await db.subtasks.get(a))!.status).toBe('done')
    expect((await db.subtasks.get(b))!).toMatchObject({ status: 'todo' })
    expect((await db.subtasks.get(b))!.withTask).toBeUndefined()
  })

  it('ajouter une étape à une tâche faite la rouvre sans défaire les étapes déjà faites', async () => {
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    await completeEntry(db, taskEntryId(id, MON), at(MON, 11))
    await addSubtask(db, id, { name: 'B' })
    expect((await db.tasks.get(id))!.status).toBe('todo')
    expect((await db.subtasks.get(a))!.status).toBe('done')
  })

  it('cocher une étape arrête son chrono sans lancer la suivante', async () => {
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'A' })
    await addSubtask(db, id, { name: 'B' })
    await startTimer(db, taskEntryId(id, MON), at(MON, 10), a)
    await toggleSubtask(db, a, at(MON, 10, 30))
    expect(await db.sessions.where('running').equals(1).count()).toBe(0)
    expect((await db.tasks.get(id))!.status).toBe('todo')
  })

  it('le temps des autres jours est compté dans le total de la tâche', async () => {
    const id = await addTask(db, { name: 'Dossier', plan: MON }, at(MON))
    await startTimer(db, taskEntryId(id, MON), at(MON, 10))
    await pauseTimer(db, at(MON, 10, 40))
    const { planTask } = await import('./actions')
    await planTask(db, id, TUE, at(MON, 18))
    const items = await loadDayItems(db, TUE, TUE)
    expect(items[0].spentSec).toBe(0)
    expect(items[0].otherDaysSec).toBe(40 * 60)
  })
})

describe('déplacer une tâche faite', () => {
  it('la tâche, son passage et ses heures passent sur le nouveau jour', async () => {
    const id = await addTask(db, { name: 'Vélo', plan: TUE }, at(TUE))
    await addSession(db, taskEntryId(id, TUE), { durationSec: 1800, startAt: at(TUE, 14), endAt: at(TUE, 14, 30) }, 'manual')
    await completeEntry(db, taskEntryId(id, TUE), at(TUE, 15))
    const moved = await moveDoneTask(db, taskEntryId(id, TUE), MON, at(TUE, 16))
    expect(moved).toBe(taskEntryId(id, MON))
    expect(await db.entries.get(taskEntryId(id, TUE))).toBeUndefined()
    expect((await db.entries.get(taskEntryId(id, MON)))!.status).toBe('done')
    expect((await db.tasks.get(id))!.doneDate).toBe(MON)
    const s = (await db.sessions.toArray())[0]
    expect(s).toMatchObject({ date: MON, entryId: taskEntryId(id, MON), startAt: at(MON, 14), endAt: at(MON, 14, 30) })
  })

  it('refuse un jour futur', async () => {
    const id = await addTask(db, { name: 'Vélo', plan: MON }, at(MON))
    await completeEntry(db, taskEntryId(id, MON), at(MON, 15))
    expect(await moveDoneTask(db, taskEntryId(id, MON), TUE, at(MON, 16))).toBeUndefined()
    expect((await db.tasks.get(id))!.doneDate).toBe(MON)
  })
})
