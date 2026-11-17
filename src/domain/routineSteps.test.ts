import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from '../db'
import {
  addSubtask,
  addTask,
  createRoutine,
  pauseTimer,
  routineEntryId,
  startTimer,
  taskEntryId,
  toggleRoutineStep,
} from './actions'
import { loadDayItems, loadItem, loadRoutineDetail } from './queries'
import { runRollover } from './rollover'
import { currentStep, liveStepSec } from './stats'

let db: AppDB
let n = 0
beforeEach(() => {
  db = new AppDB(`steps-${n++}-${Math.random().toString(36).slice(2)}`)
})

const at = (day: string, h = 9, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'

describe('chrono par sous-tâche', () => {
  it('le temps est compté par étape, pas seulement au total', async () => {
    const id = await addTask(db, { name: 'Rapport', plan: MON }, at(MON))
    const a = await addSubtask(db, id, { name: 'Plan', estimateMin: 10 })
    const b = await addSubtask(db, id, { name: 'Rédaction', estimateMin: 30 })
    const entryId = taskEntryId(id, MON)
    await startTimer(db, entryId, at(MON, 9, 0)) // première étape par défaut
    await pauseTimer(db, at(MON, 9, 5))
    await startTimer(db, entryId, at(MON, 9, 10), b)
    const item = (await loadItem(db, entryId))!
    expect(item.runningSubtaskId).toBe(b)
    expect(currentStep(item)?.id).toBe(b)
    expect(liveStepSec(item, a, at(MON, 9, 12))).toBe(300)
    expect(liveStepSec(item, b, at(MON, 9, 12))).toBe(120)
  })
})

describe('étapes de routine', () => {
  it('la durée est la somme des étapes, cochées par occurrence ; la dernière termine', async () => {
    const rid = await createRoutine(
      db,
      {
        name: 'Matin',
        frequency: { type: 'daily' },
        steps: [
          { id: 's1', name: 'Étirements', estimateMin: 5 },
          { id: 's2', name: 'Douche', estimateMin: 10 },
        ],
      },
      at(MON),
    )
    expect((await db.routines.get(rid))?.estimateMin).toBe(15)
    const eid = routineEntryId(rid, MON, MON)
    let item = (await loadDayItems(db, MON, MON))[0]
    expect(item.subtasks.map((s) => s.name)).toEqual(['Étirements', 'Douche'])

    await startTimer(db, eid, at(MON, 7))
    expect((await db.sessions.toArray())[0].subtaskId).toBe('s1')
    expect(await toggleRoutineStep(db, eid, 's1', at(MON, 7, 5))).toBe(false)
    item = (await loadItem(db, eid))!
    expect(item.subtasksDone).toBe(1)
    expect(item.runningSince).toBeUndefined()
    expect(item.subtasks[0].spentSec).toBe(300)
    expect(await toggleRoutineStep(db, eid, 's2', at(MON, 7, 20))).toBe(true)
    expect((await db.entries.get(eid))?.status).toBe('done')

    // décocher une étape rouvre l'occurrence
    await toggleRoutineStep(db, eid, 's2', at(MON, 7, 21))
    expect((await db.entries.get(eid))?.status).toBe('todo')

    // le lendemain, les étapes repartent de zéro
    await runRollover(db, at(TUE))
    const tue = (await loadDayItems(db, TUE, TUE)).find((i) => i.routineId === rid)!
    expect(tue.subtasksDone).toBe(0)
  })
})

describe('routine facultative', () => {
  it('non faite, elle reste neutre : sautée, case vide, régularité intacte', async () => {
    await runRollover(db, at(MON))
    const rid = await createRoutine(db, { name: 'Lecture', frequency: { type: 'daily' }, optional: true }, at(MON))
    const normal = await createRoutine(db, { name: 'Sport', frequency: { type: 'daily' } }, at(MON))
    await runRollover(db, at(WED)) // lundi et mardi manqués
    expect((await db.entries.get(routineEntryId(rid, MON, MON)))?.status).toBe('skipped')
    expect((await db.entries.get(routineEntryId(rid, TUE, TUE)))?.status).toBe('skipped')
    expect((await db.entries.get(routineEntryId(normal, MON, MON)))?.status).toBe('not_done')

    const detail = (await loadRoutineDetail(db, rid, WED))!
    expect(detail.grid.find((g) => g.day === MON)?.state).toBe('none')
    expect(detail.month.total).toBe(0)
    const other = (await loadRoutineDetail(db, normal, WED))!
    expect(other.grid.find((g) => g.day === MON)?.state).toBe('not_done')
  })
})
