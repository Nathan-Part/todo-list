import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { AppDB } from '../db'
import { addSession, addTask, completeTask, taskEntryId } from './actions'
import { completionFeedback, suggestEstimate, timeStats } from './insights'

const at = (day: string, h = 9) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, h).getTime()
}

describe('statistiques de durée', () => {
  it('durée habituelle, mini, maxi, régularité', () => {
    const s = timeStats([50, 55, 60, 52, 58])!
    expect(s).toMatchObject({ count: 5, typical: 55, min: 50, max: 60, spread: 'stable' })
    expect(timeStats([30, 90, 40, 100, 35])!.spread).toBe('very_variable')
  })
  it('tendance sur les dernières fois', () => {
    expect(timeStats([60, 62, 58, 45, 44, 46])!.trend).toBe('faster')
    expect(timeStats([40, 42, 41, 55, 56, 54])!.trend).toBe('slower')
    expect(timeStats([40, 42])!.trend).toBe('unknown')
  })
})

describe('retour après une tâche', () => {
  it('avance, retard, pile', () => {
    expect(completionFeedback(10 * 60, 15)).toBe("10 min au lieu de 15 min · 5 min d'avance")
    expect(completionFeedback(80 * 60, 60)).toBe('1 h 20 au lieu de 1 h · 20 min de plus que prévu')
    expect(completionFeedback(15 * 60, 15)).toBe('Pile dans les temps (15 min)')
    expect(completionFeedback(600, undefined)).toBeUndefined()
  })
})

describe('estimation proposée pour une tâche semblable', () => {
  it('retrouve le temps réel des tâches déjà faites au nom proche', async () => {
    const db = new AppDB('ins-' + Math.random())
    for (const [i, min] of [[1, 20], [2, 30], [3, 25]] as const) {
      const day = `2026-11-0${i}`
      const id = await addTask(db, { name: 'Faire les courses', plan: day }, at(day))
      await addSession(db, taskEntryId(id, day), { durationSec: min * 60 }, 'manual')
      await completeTask(db, id, at(day, 18))
    }
    const s = (await suggestEstimate(db, 'faire les Courses'))!
    expect(s).toMatchObject({ count: 3, typical: 25 })
    expect(await suggestEstimate(db, 'Réviser les maths')).toBeUndefined()
  })
})
