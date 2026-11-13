import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { AppDB } from '../db'
import { addTask, createRoutine } from './actions'
import { weekDays } from './dates'
import { loadLoads } from './queries'
import { runRollover } from './rollover'

const at = (day: string, h = 9) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, h).getTime()
}

it('charge de chaque jour de la semaine (bande semaine)', async () => {
  const db = new AppDB('loads-' + Math.random())
  const MON = '2026-11-09'
  await createRoutine(db, { name: 'Sport', estimateMin: 60, frequency: { type: 'daily' }, startDate: MON }, at(MON))
  await runRollover(db, at(MON))
  await addTask(db, { name: 'A', estimateMin: 45, plan: MON }, at(MON))
  await addTask(db, { name: 'B', estimateMin: 30, plan: '2026-11-11' }, at(MON))
  const loads = await loadLoads(db, weekDays(MON), MON)
  expect(loads).toEqual({
    '2026-11-09': 105,
    '2026-11-10': 60,
    '2026-11-11': 90,
    '2026-11-12': 60,
    '2026-11-13': 60,
    '2026-11-14': 60,
    '2026-11-15': 60,
  })
})
