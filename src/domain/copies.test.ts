import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { AppDB } from '../db'
import { addTask } from './actions'
import { CopiesDB, copiesToPrune, listCopies, restoreCopy, takeDailyCopy } from './copies'

const uid = () => Math.random().toString(36).slice(2)

describe('tiroir de copies', () => {
  it('garde tous les jours de la semaine en cours et la dernière copie des semaines passées', () => {
    // vendredi 20 novembre 2026 : la semaine en cours commence le lundi 16
    const days = [
      '2026-11-02', '2026-11-04', '2026-11-07', // semaine du 2 : on garde le 7
      '2026-11-09', '2026-11-12', '2026-11-15', // semaine du 9 : on garde le 15
      '2026-11-16', '2026-11-17', '2026-11-20', // semaine en cours : tout
    ]
    expect(copiesToPrune(days, '2026-11-20').sort()).toEqual(['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-12'])
  })

  it('ne copie rien sans tâche, puis une seule fois par jour', async () => {
    const db = new AppDB(`c-${uid()}`)
    const c = new CopiesDB(`cc-${uid()}`)
    expect(await takeDailyCopy(db, c, '2026-11-20', Date.now())).toBe(false)
    await addTask(db, { name: 'Machine', plan: 'reserve' }, Date.now())
    expect(await takeDailyCopy(db, c, '2026-11-20', Date.now())).toBe(true)
    expect(await takeDailyCopy(db, c, '2026-11-20', Date.now())).toBe(false)
    expect(await listCopies(c)).toHaveLength(1)
  })

  it("restaure une copie et garde l'état d'avant dans le tiroir", async () => {
    const db = new AppDB(`c-${uid()}`)
    const c = new CopiesDB(`cc-${uid()}`)
    await addTask(db, { name: 'Faire le lit', plan: 'reserve' }, Date.now())
    await takeDailyCopy(db, c, '2026-11-20', Date.now())
    await addTask(db, { name: 'Envoyer CV', plan: 'reserve' }, Date.now())
    expect(await db.tasks.count()).toBe(2)
    await restoreCopy(db, c, 'daily-2026-11-20', '2026-11-20', Date.now())
    expect((await db.tasks.toArray()).map((t) => t.name)).toEqual(['Faire le lit'])
    const kinds = (await listCopies(c)).map((x) => x.kind).sort()
    expect(kinds).toEqual(['beforeRestore', 'daily'])
  })
})
