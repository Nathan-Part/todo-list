import { afterEach, describe, expect, it } from 'vitest'
import { naturalDayOf, setSleep, todayOf } from './dates'

const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}

describe('changement de jour', () => {
  afterEach(() => setSleep(null))

  it('avant 5 h du matin, on est encore la veille', () => {
    expect(naturalDayOf(at('2026-11-21', 2))).toBe('2026-11-20')
    expect(todayOf(at('2026-11-21', 4, 59))).toBe('2026-11-20')
    expect(todayOf(at('2026-11-21', 5))).toBe('2026-11-21')
  })

  it('« Je vais dormir » passe tout de suite au lendemain', () => {
    setSleep({ day: '2026-11-20', at: at('2026-11-20', 23) })
    expect(todayOf(at('2026-11-20', 23, 30))).toBe('2026-11-21')
    expect(todayOf(at('2026-11-21', 2))).toBe('2026-11-21')
    expect(todayOf(at('2026-11-21', 14))).toBe('2026-11-21')
    // un instant d'avant l'appui reste sur la journée close
    expect(todayOf(at('2026-11-20', 22))).toBe('2026-11-20')
  })

  it('dormir à 1 h du matin clôt la journée de la veille', () => {
    setSleep({ day: '2026-11-20', at: at('2026-11-21', 1) })
    expect(todayOf(at('2026-11-21', 1, 30))).toBe('2026-11-21')
    expect(todayOf(at('2026-11-22', 3))).toBe('2026-11-21')
  })
})
