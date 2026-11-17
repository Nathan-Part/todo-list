import { describe, expect, it } from 'vitest'
import { RELEASES } from './changelog'

describe('historique des versions', () => {
  it('va de la plus récente à la 0.1, par pas de 0.1, chaque entrée expliquée', () => {
    const tenths = RELEASES.map((r) => Math.round(Number(r.version) * 10))
    expect(tenths[tenths.length - 1]).toBe(1)
    for (let i = 0; i < tenths.length - 1; i++) expect(tenths[i]).toBe(tenths[i + 1] + 1)
    for (const r of RELEASES) {
      expect(r.version).toMatch(/^\d+\.\d$/)
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.changes.length).toBeGreaterThan(0)
    }
  })
})
