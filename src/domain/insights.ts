import type { AppDB } from '../db'
import type { Task } from './types'

/** Statistiques sur des durées réelles (en minutes), de la plus ancienne à la plus récente. */
export interface TimeStats {
  count: number
  /** Durée habituelle (médiane), insensible à une séance exceptionnelle. */
  typical: number
  avg: number
  min: number
  max: number
  /** Régularité du temps passé. */
  spread: 'stable' | 'variable' | 'very_variable'
  /** Évolution des dernières fois par rapport aux précédentes. */
  trend: 'faster' | 'slower' | 'steady' | 'unknown'
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function timeStats(samples: number[]): TimeStats | undefined {
  const xs = samples.filter((x) => x > 0)
  if (xs.length === 0) return undefined
  const avg = mean(xs)
  const sd = Math.sqrt(mean(xs.map((x) => (x - avg) ** 2)))
  const cv = avg > 0 ? sd / avg : 0
  let trend: TimeStats['trend'] = 'unknown'
  if (xs.length >= 6) {
    const recent = mean(xs.slice(-3))
    const before = mean(xs.slice(-6, -3))
    const change = (recent - before) / before
    trend = change < -0.15 ? 'faster' : change > 0.15 ? 'slower' : 'steady'
  }
  return {
    count: xs.length,
    typical: median(xs),
    avg,
    min: Math.min(...xs),
    max: Math.max(...xs),
    spread: xs.length < 3 ? 'stable' : cv < 0.2 ? 'stable' : cv < 0.4 ? 'variable' : 'very_variable',
    trend,
  }
}

/** Écart entre réel et prévu, en pourcentage (positif = plus long que prévu). */
export function deviationPct(realMin: number, estimateMin: number): number {
  return Math.round(((realMin - estimateMin) / estimateMin) * 100)
}

/** Retour après une tâche terminée : « 10 min au lieu de 15 · 5 min d'avance ». */
export function completionFeedback(realSec: number, estimateMin: number | undefined): string | undefined {
  if (!estimateMin || realSec <= 0) return undefined
  const real = Math.max(1, Math.round(realSec / 60))
  const fmt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`)
  const diff = real - estimateMin
  if (Math.abs(diff) <= Math.max(1, estimateMin * 0.05)) return `Pile dans les temps (${fmt(real)})`
  return diff < 0
    ? `${fmt(real)} au lieu de ${fmt(estimateMin)} · ${fmt(-diff)} d'avance`
    : `${fmt(real)} au lieu de ${fmt(estimateMin)} · ${fmt(diff)} de plus que prévu`
}

/** Normalise un nom pour retrouver les tâches semblables. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similar(a: string, b: string): boolean {
  if (a === b) return true
  const wa = new Set(a.split(' ').filter((w) => w.length >= 3))
  const wb = new Set(b.split(' ').filter((w) => w.length >= 3))
  if (wa.size === 0 || wb.size === 0) return false
  let common = 0
  for (const w of wa) if (wb.has(w)) common++
  return common / Math.max(wa.size, wb.size) >= 0.6
}

/**
 * Durée réellement passée sur les tâches déjà faites qui ressemblent à ce nom.
 * Sert à proposer une estimation réaliste à la création.
 */
export async function suggestEstimate(d: AppDB, name: string): Promise<TimeStats | undefined> {
  const key = normName(name)
  if (key.length < 3) return undefined
  const done = (await d.tasks.where('status').equals('done').toArray()).filter((t: Task) => similar(normName(t.name), key))
  if (done.length === 0) return undefined
  const entries = await d.entries.where('taskId').anyOf(done.map((t) => t.id)).toArray()
  const sessions = entries.length ? await d.sessions.where('entryId').anyOf(entries.map((e) => e.id)).toArray() : []
  const byTask = new Map<string, number>()
  const taskOfEntry = new Map(entries.map((e) => [e.id, e.taskId!] as const))
  for (const s of sessions) {
    const t = taskOfEntry.get(s.entryId)
    if (t) byTask.set(t, (byTask.get(t) ?? 0) + s.durationSec)
  }
  const ordered = done
    .filter((t) => (byTask.get(t.id) ?? 0) > 0)
    .sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0))
    .map((t) => byTask.get(t.id)! / 60)
  return timeStats(ordered)
}

export function spreadLabel(s: TimeStats): string {
  return s.spread === 'stable' ? 'régulier' : s.spread === 'variable' ? 'varie un peu' : 'varie beaucoup'
}

export function trendLabel(s: TimeStats): string | undefined {
  return s.trend === 'faster' ? 'de plus en plus rapide' : s.trend === 'slower' ? 'de plus en plus long' : undefined
}

export interface Gap {
  start: number
  end: number
  minutes: number
  /** Petite coupure entre deux tâches (20 min ou moins), ou vrai trou. */
  kind: 'short' | 'long'
  before?: string
  after?: string
}

/**
 * Temps non enregistré entre les sessions d'une journée.
 * `until` (maintenant, pour aujourd'hui) ajoute le trou depuis la dernière session.
 */
export function computeGaps(
  segments: { start: number; end: number; name: string }[],
  until?: number,
): Gap[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  const gaps: Gap[] = []
  let curEnd = -Infinity
  let curName: string | undefined
  for (const s of sorted) {
    if (curEnd !== -Infinity && s.start - curEnd >= 2 * 60_000) {
      const minutes = Math.round((s.start - curEnd) / 60_000)
      gaps.push({ start: curEnd, end: s.start, minutes, kind: minutes <= 20 ? 'short' : 'long', before: curName, after: s.name })
    }
    if (s.end > curEnd) {
      curEnd = s.end
      curName = s.name
    }
  }
  if (until !== undefined && curEnd !== -Infinity && until - curEnd >= 15 * 60_000) {
    const minutes = Math.round((until - curEnd) / 60_000)
    gaps.push({ start: curEnd, end: until, minutes, kind: 'long', before: curName })
  }
  return gaps
}
