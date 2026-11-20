import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDB } from '../db'
import * as A from './actions'
import { addDays, naturalDayOf, setSleep, todayOf } from './dates'
import { loadDayItems, loadReserve, loadTaskDetail } from './queries'
import { loadWeekReview } from './review'
import { runRollover } from './rollover'

/** Générateur pseudo-aléatoire reproductible. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

afterEach(() => setSleep(null))

async function invariants(db: AppDB, now: number, log: string[]) {
  const ctx = () => `\n--- derniers gestes ---\n${log.slice(-12).join('\n')}`
  const today = todayOf(now)
  const tasks = await db.tasks.toArray()
  const entries = await db.entries.toArray()
  const sessions = await db.sessions.toArray()
  const subtasks = await db.subtasks.toArray()
  const entryIds = new Set(entries.map((e) => e.id))

  // un seul chrono à la fois
  expect(sessions.filter((s) => s.running === 1).length, `un seul chrono${ctx()}`).toBeLessThanOrEqual(1)
  // aucun temps orphelin, aucune durée négative
  for (const s of sessions) {
    expect(entryIds.has(s.entryId), `session sans passage ${s.id}${ctx()}`).toBe(true)
    expect(s.durationSec, `durée négative${ctx()}`).toBeGreaterThanOrEqual(0)
    if (s.startAt !== undefined && s.endAt !== undefined) expect(s.endAt, `fin avant début${ctx()}`).toBeGreaterThanOrEqual(s.startAt)
    const e = entries.find((x) => x.id === s.entryId)!
    expect(s.date, `jour de la session ≠ jour du passage${ctx()}`).toBe(e.date)
  }
  for (const t of tasks) {
    const mine = entries.filter((e) => e.taskId === t.id)
    const open = mine.filter((e) => e.status === 'todo')
    const done = mine.filter((e) => e.status === 'done')
    const subs = subtasks.filter((s) => s.taskId === t.id)
    if (t.status === 'done') {
      // une tâche rouverte un autre jour garde l'historique de son premier « fait » : il peut y en avoir plusieurs
      expect(done.filter((e) => e.date === t.doneDate).length, `tâche faite « ${t.name} » : un passage fait le ${t.doneDate}${ctx()}`).toBe(1)
      expect(open.length, `tâche faite sans passage ouvert${ctx()}`).toBe(0)
      expect(t.doneDate! <= today, `faite dans le futur ${t.doneDate} > ${today}${ctx()}`).toBe(true)
      expect(subs.every((s) => s.status === 'done'), `tâche faite, étapes toutes faites${ctx()}`).toBe(true)
    }
    if (t.status === 'todo') {
      expect(open.length, `au plus un passage ouvert pour « ${t.name} »${ctx()}`).toBeLessThanOrEqual(1)
      // seul un jour passé peut garder la trace d'un ancien « fait » (tâche rouverte plus tard)
      expect(done.filter((e) => e.date >= today).length, `tâche à faire sans passage « fait » aujourd'hui (${t.name}, doneDate=${t.doneDate} : ${mine.map((e) => `${e.date}:${e.status}`).join(' ')})${ctx()}`).toBe(0)
      expect(subs.some((s) => s.withTask), `étape « avec la tâche » sur une tâche à faire${ctx()}`).toBe(false)
    }
    for (const s of subs) if (s.withTask) expect(s.status, `withTask ⇒ faite${ctx()}`).toBe('done')
    // le total affiché = toutes les sessions terminées de la tâche, quel que soit le jour
    const total = sessions.filter((s) => s.running === 0 && mine.some((e) => e.id === s.entryId)).reduce((n, s) => n + s.durationSec, 0)
    for (const e of mine) {
      const items = await loadDayItems(db, e.date, today)
      const item = items.find((i) => i.id === e.id)
      expect(item, `passage introuvable dans son jour${ctx()}`).toBeTruthy()
      expect(item!.spentSec + (item!.otherDaysSec ?? 0), `total de temps de « ${t.name} »${ctx()}`).toBe(total)
    }
    const detail = await loadTaskDetail(db, t.id)
    expect(detail!.sessions.length).toBe(sessions.filter((s) => mine.some((e) => e.id === s.entryId)).length)
  }
  // les lectures d'écran ne plantent pas
  await loadReserve(db, today)
  await loadWeekReview(db, today, today, [0, 0, 0, 0, 0, 0, 0])
  // une tâche à faire est soit planifiée, soit en réserve (jamais perdue)
  const reserve = new Set((await loadReserve(db, today)).map((r) => r.task.id))
  for (const t of tasks.filter((x) => x.status === 'todo')) {
    const planned = entries.some((e) => e.taskId === t.id && e.status === 'todo')
    expect(planned || reserve.has(t.id), `tâche à faire perdue : « ${t.name} »${ctx()}`).toBe(true)
  }
}

async function run(seed: number, steps: number) {
  const r = rng(seed)
  const pick = <T,>(a: T[]): T | undefined => (a.length ? a[Math.floor(r() * a.length)] : undefined)
  const db = new AppDB(`hasard-${seed}-${Math.random().toString(36).slice(2)}`)
  let now = new Date(2026, 10, 9, 8, 0).getTime()
  const log: string[] = []
  await A.createRoutine(db, { name: 'Routine', frequency: { type: 'daily' }, steps: r() < 0.5 ? [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }] : undefined }, now)
  await runRollover(db, now)
  let n = 0

  for (let i = 0; i < steps; i++) {
    const today = todayOf(now)
    const tasks = await db.tasks.toArray()
    const entries = await db.entries.toArray()
    const subs = await db.subtasks.toArray()
    const todo = tasks.filter((t) => t.status === 'todo')

    const openToday = entries.filter((e) => e.status === 'todo' && e.date <= today)
    const k = Math.floor(r() * 20)
    const say = (s: string) => log.push(`${new Date(now).toLocaleString('fr-FR')} [${today}] ${s}`)
    try {
      switch (k) {
        case 0: {
          const plan = pick([today, today, addDays(today, 1), 'reserve' as const])!
          say(`ajouter une tâche (${plan})`)
          const id = await A.addTask(db, { name: `T${++n}`, plan, onSite: r() < 0.3, estimateMin: r() < 0.5 ? 30 : undefined }, now)
          if (r() < 0.5) for (let j = 0; j < 1 + Math.floor(r() * 3); j++) await A.addSubtask(db, id, { name: `e${j}`, estimateMin: r() < 0.5 ? 10 : undefined })
          break
        }
        case 1: {
          say('tâche notée « hier »')
          const y = addDays(today, -1)
          const id = await A.addTask(db, { name: `H${++n}`, plan: y }, now)
          if (r() < 0.5) await A.addSubtask(db, id, { name: 'e' })
          await A.markDoneOnDay(db, A.taskEntryId(id, y), now)
          break
        }
        case 2: {
          const t = pick(tasks.filter((x) => x.status !== 'deleted'))
          if (t) { say(`ajouter une étape à ${t.name} (${t.status})`); await A.addSubtask(db, t.id, { name: 'x' }, now) }
          break
        }
        case 3:
        case 4: {
          const s = pick(subs)
          if (s) { say(`cocher/décocher l'étape ${s.name} de ${tasks.find((t) => t.id === s.taskId)?.name} (${s.status})`); await A.toggleSubtask(db, s.id, now) }
          break
        }
        case 5:
        case 6: {
          const e = pick(openToday)
          if (e) { say(`terminer le passage ${e.id.slice(-10)} (${e.kind})`); await A.completeEntry(db, e.id, now) }
          break
        }
        case 7: {
          const t = pick(todo)
          if (t) { say(`terminer ${t.name} (fiche/réserve)`); await A.completeTask(db, t.id, now) }
          break
        }
        case 8: {
          const e = pick(entries.filter((x) => x.status === 'done'))
          if (e) { say(`rouvrir ${e.id.slice(-10)} (${e.kind}, ${e.date})`); await A.reopenEntry(db, e.id, now) }
          break
        }
        case 9:
        case 10: {
          const e = pick(openToday)
          if (e) {
            const own = subs.filter((s) => s.taskId === e.taskId && s.status === 'todo')
            say(`lancer le chrono sur ${e.id.slice(-10)}`)
            await A.startTimer(db, e.id, now, r() < 0.5 ? pick(own)?.id : undefined)
          }
          break
        }
        case 11:
          say('pause')
          await A.pauseTimer(db, now)
          break
        case 12: {
          const e = pick(entries.filter((x) => x.date <= today && x.status !== 'deleted'))
          if (e) { say(`ajouter 10 min à ${e.id.slice(-10)}`); await A.addSession(db, e.id, { durationSec: 600, startAt: now - 600_000, endAt: now }, 'manual') }
          break
        }
        case 13: {
          const e = pick(openToday.filter((x) => x.kind === 'task'))
          if (e) { const target = pick([addDays(today, 1), addDays(today, 3), 'reserve' as const])!; say(`reporter ${e.id.slice(-10)} → ${target}`); await A.postponeEntry(db, e.id, target, now) }
          break
        }
        case 14: {
          const t = pick(todo)
          if (t) { const target = pick([today, addDays(today, 1), 'reserve' as const])!; say(`planifier ${t.name} → ${target}`); await A.planTask(db, t.id, target, now) }
          break
        }
        case 15: {
          const e = pick(entries.filter((x) => x.status === 'done' && x.kind === 'task'))
          if (e) { const target = addDays(today, -Math.floor(r() * 4)); say(`déplacer la tâche faite ${e.id.slice(-10)} → ${target}`); await A.moveDoneTask(db, e.id, target, now) }
          break
        }
        case 16: {
          const e = pick(entries.filter((x) => (x.status === 'not_done' || x.status === 'todo') && x.date < today))
          if (e) { say(`« fait ce jour-là » ${e.id.slice(-10)}`); await A.markDoneOnDay(db, e.id, now) }
          break
        }
        case 17: {
          const t = pick(tasks.filter((x) => x.status !== 'deleted'))
          if (t && r() < 0.3) { say(`supprimer ${t.name}`); await A.deleteTask(db, t.id, now) }
          else { const s = pick(subs); if (s) { say(`supprimer l'étape ${s.name}`); await A.deleteSubtask(db, s.id, now) } }
          break
        }
        case 18: {
          const h = new Date(now).getHours()
          if ((h >= 20 || h < 5) && naturalDayOf(now) === today && r() < 0.6) { say('« Je vais dormir »'); setSleep({ day: today, at: now }); await runRollover(db, now) }
          break
        }
        default: {
          const e = pick(entries.filter((x) => x.kind === 'routine' && x.status === 'todo' && x.date <= today))
          if (e) { say(`cocher une étape de routine ${e.id.slice(-10)}`); await A.toggleRoutineStep(db, e.id, pick(['a', 'b'])!, now) }
        }
      }
    } catch (err) {
      // les refus voulus (« action impossible ») sont normaux ; un plantage ne l'est pas
      if (!(err instanceof Error) || err instanceof TypeError || err instanceof RangeError) throw new Error(`plantage : ${err}\n${log.slice(-12).join('\n')}`)
      log.push(`   ↳ refusé : ${err.message}`)
    }
    // le temps avance de quelques minutes à quelques heures, puis l'app « s'ouvre »
    now += Math.floor(r() * (r() < 0.2 ? 6 * 3_600_000 : 50 * 60_000)) + 60_000
    await runRollover(db, now)
    if (i % 4 === 0 || i === steps - 1) await invariants(db, now, log)
  }
  db.close()
}

describe('utilisation au hasard', () => {
  // HASARD_LOTS et HASARD_GESTES permettent une campagne plus longue à la demande
  const lots = Number(process.env.HASARD_LOTS ?? 6)
  const gestes = Number(process.env.HASARD_GESTES ?? 80)
  for (let batch = 0; batch < lots; batch++) {
    it(`lot ${batch + 1} : 10 histoires de ${gestes} gestes, données toujours cohérentes`, async () => {
      for (let seed = batch * 10 + 1; seed <= batch * 10 + 10; seed++) await run(seed, gestes)
    }, 600_000)
  }
})
