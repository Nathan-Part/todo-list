import 'fake-indexeddb/auto'
import { liveQuery } from 'dexie'
import { expect, it } from 'vitest'
import { AppDB } from '../db'
import { addTask, createRoutine, startTimer, taskEntryId, pauseTimer } from './actions'
import { weekDays } from './dates'
import { loadDayItems, loadItem, loadLoads } from './queries'
import { loadWeekReview } from './review'
import { runRollover } from './rollover'

const at = (day: string, h = 9, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}
const TODAY = '2026-11-13'
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms))

/** Les lectures « en direct » doivent se mettre à jour quand les données changent. */
async function emissions<T>(querier: () => Promise<T>, act: () => Promise<void>): Promise<T[]> {
  const out: T[] = []
  const sub = liveQuery(querier).subscribe({ next: (v) => out.push(v) })
  await wait()
  await act()
  await wait()
  sub.unsubscribe()
  return out
}

it('la charge de la semaine se met à jour quand une tâche est ajoutée', async () => {
  const db = new AppDB('live-loads-' + Math.random())
  const out = await emissions(
    () => loadLoads(db, weekDays(TODAY), TODAY),
    async () => void (await addTask(db, { name: 'A', estimateMin: 60, plan: TODAY }, at(TODAY))),
  )
  expect(out.at(-1)![TODAY]).toBe(60)
})

it('la charge se met à jour pour un jour futur de la semaine (routine à venir + tâche)', async () => {
  const db = new AppDB('live-future-' + Math.random())
  const out = await emissions(
    () => loadLoads(db, weekDays(TODAY), TODAY),
    async () => {
      await addTask(db, { name: 'A', estimateMin: 30, plan: '2026-11-15' }, at(TODAY))
      await createRoutine(db, { name: 'Sport', estimateMin: 60, frequency: { type: 'daily' }, startDate: TODAY }, at(TODAY))
    },
  )
  const last = out.at(-1)!
  expect(last['2026-11-15']).toBe(90)
  expect(last[TODAY]).toBe(60)
})

it('la liste du jour suit les sessions de temps', async () => {
  const db = new AppDB('live-day-' + Math.random())
  await runRollover(db, at(TODAY))
  const id = await addTask(db, { name: 'A', estimateMin: 60, plan: TODAY }, at(TODAY))
  const out = await emissions(
    () => loadDayItems(db, TODAY, TODAY),
    async () => {
      await startTimer(db, taskEntryId(id, TODAY), at(TODAY, 9))
      await wait()
      await pauseTimer(db, at(TODAY, 9, 30))
    },
  )
  expect(out.at(-1)![0].spentSec).toBe(1800)
})

it('le passage en cours de chrono suit ses changements', async () => {
  const db = new AppDB('live-item-' + Math.random())
  await runRollover(db, at(TODAY))
  const id = await addTask(db, { name: 'A', plan: TODAY }, at(TODAY))
  const entryId = taskEntryId(id, TODAY)
  const out = await emissions(
    () => loadItem(db, entryId),
    async () => {
      await db.tasks.update(id, { name: 'Renommée', estimateMin: 45 })
    },
  )
  expect(out.at(-1)).toMatchObject({ name: 'Renommée', estimateMin: 45 })
})

it('le bilan hebdomadaire se met à jour (jours futurs et réserve compris)', async () => {
  const db = new AppDB('live-review-' + Math.random())
  const out = await emissions(
    () => loadWeekReview(db, TODAY, TODAY, [240, 240, 240, 240, 240, 360, 360]),
    async () => {
      await addTask(db, { name: 'A', estimateMin: 600, plan: '2026-11-14' }, at(TODAY))
      await addTask(db, { name: 'R', plan: 'reserve' }, at(TODAY))
    },
  )
  const last = out.at(-1)!
  expect(last.reserveCount).toBe(1)
  expect(last.days.find((d) => d.day === '2026-11-14')!.overloaded).toBe(true)
})
