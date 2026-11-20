import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { ForgottenTimer } from './components/ForgottenTimer'
import { backfillStepTimes, cleanupReopenedTimes } from './domain/actions'
import { CatchUpSheet } from './views/CatchUpSheet'
import { DayLineSheet } from './views/DayLineSheet'
import { FocusScreen, MiniPlayer } from './components/Timer'
import { Icon, type IconName, btnGhost, btnPrimary } from './components/ui'
import { META, db, getMeta } from './db'
import { type Sleep, getSleep, setSleep } from './domain/dates'
import { copiesDb, takeDailyCopy } from './domain/copies'
import { useToast } from './lib/toast'
import { absenceToConfirm, runRollover } from './domain/rollover'
import { dayShort, plural } from './lib/format'
import { useReserve, useRunning, useRunningSession, useToday } from './lib/hooks'
import { NavContext, type SheetState, type Tab } from './lib/nav'
import { AddSheet } from './views/AddSheet'
import { BilanView } from './views/BilanView'
import { DayView } from './views/DayView'
import { OccurrenceSheet } from './views/OccurrenceSheet'
import { PauseSheet } from './views/PauseSheet'
import { ReserveView } from './views/ReserveView'
import { ReviewSheet } from './views/ReviewSheet'
import { RoutineSheet } from './views/RoutineSheet'
import { RoutinesView } from './views/RoutinesView'
import { SettingsSheet } from './views/SettingsSheet'
import { VersionsSheet } from './views/VersionsSheet'
import { GapSheet } from './views/GapSheet'
import { HourlySheet } from './views/HourlySheet'
import { TaskSheet } from './views/TaskSheet'
import { TimeEntrySheet } from './views/TimeEntrySheet'
import { Welcome } from './views/Welcome'

/** Sur iPhone, les données d'une app installée sont séparées de celles de Safari : on impose l'installation. */
function needsInstall(): boolean {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua)
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  const testing = new URLSearchParams(location.search).has('test')
  return ios && !standalone && !testing
}

function InstallScreen() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" className="size-20 rounded-[22px] shadow-lg" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Installe l'app</h1>
      <p className="mt-2 text-muted">
        Tes données sont enregistrées dans l'app installée sur ton écran d'accueil, pas dans Safari. Installe-la d'abord, puis ouvre-la depuis son icône.
      </p>
      <ol className="mt-6 space-y-4 text-[15px]">
        <li className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">1</span>
          <span>Touche le bouton <strong>Partager</strong> (le carré avec une flèche) dans la barre de Safari.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">2</span>
          <span>Choisis <strong>« Sur l'écran d'accueil »</strong>, puis <strong>Ajouter</strong>.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">3</span>
          <span>Ferme Safari et ouvre <strong>Ma journée</strong> depuis l'icône.</span>
        </li>
      </ol>
    </div>
  )
}

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'day', label: 'Jour', icon: 'calendar' },
  { id: 'reserve', label: 'Réserve', icon: 'inbox' },
  { id: 'routines', label: 'Routines', icon: 'repeat' },
  { id: 'bilan', label: 'Bilan', icon: 'chart' },
]

function TabBar({ tab, setTab, today }: { tab: Tab; setTab: (t: Tab) => void; today: string }) {
  const reserve = useReserve(today)
  const review = (reserve ?? []).filter((r) => r.task.needsReview).length
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium transition ${
              tab === t.id ? 'text-accent' : 'text-muted'
            }`}
          >
            <span className="relative">
              <Icon name={t.icon} className="size-6" strokeWidth={tab === t.id ? 2.4 : 2} />
              {t.id === 'reserve' && review > 0 && (
                <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-warn px-1 text-center text-[10px] font-bold leading-4 text-surface">
                  {review}
                </span>
              )}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function Shell() {
  const today = useToday()
  const onboarded = useLiveQuery(() => getMeta<boolean>(db, META.onboarded, false), [])
  const running = useRunningSession()
  const { needRefresh, updateServiceWorker } = useRegisterSW()

  const [ready, setReady] = useState(false)
  const [absence, setAbsence] = useState<Awaited<ReturnType<typeof absenceToConfirm>>>(null)
  const [tab, setTab] = useState<Tab>('day')
  const [selectedDay, setSelectedDay] = useState(today)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [focusEntryId, setFocus] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  useEffect(() => {
    if (!highlight) return
    const id = setTimeout(() => setHighlight(null), 3500)
    return () => clearTimeout(id)
  }, [highlight])
  const [okTimer, setOkTimer] = useState<string | null>(null)
  const runningItem = useRunning()

  // quand le jour change, la vue suit si l'on regardait « aujourd'hui »
  const prevToday = useRef(today)
  useEffect(() => {
    if (prevToday.current !== today) {
      const before = prevToday.current
      setSelectedDay((d) => (d === before ? today : d))
      prevToday.current = today
    }
  }, [today])

  // bascule de jour : à l'ouverture, au retour au premier plan, à minuit (RG-02)
  const rollover = useCallback(async () => {
    const nowMs = Date.now()
    const ask = await absenceToConfirm(db, nowMs)
    if (ask) {
      setAbsence(ask)
      return
    }
    await runRollover(db, nowMs)
    setReady(true)
  }, [])
  useEffect(() => {
    void rollover()
  }, [today, rollover])

  // un chrono qui tournait à minuit garde son passage ; on clôt à son arrêt (RG-04)
  const prevRunning = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prevRunning.current && !running) void runRollover(db, Date.now())
    prevRunning.current = running?.id
  }, [running])

  // « Je vais dormir » est aussi gardé dans la base : on le reprend s'il est plus récent
  useEffect(() => {
    void getMeta<Sleep | null>(db, 'sleep', null).then((s) => {
      if (s && (!getSleep() || s.at > getSleep()!.at)) setSleep(s)
    })
  }, [])

  // demande un stockage durable (limite l'effacement par iOS)
  useEffect(() => {
    void navigator.storage?.persist?.()
    void cleanupReopenedTimes(db)
    void backfillStepTimes(db)
  }, [])

  // le tiroir : une copie automatique par jour, dès qu'il existe une tâche
  const toast = useToast()
  useEffect(() => {
    if (!ready) return
    takeDailyCopy(db, copiesDb, today, Date.now())
      .then((made) => made && toast({ text: '✓ Copie du jour enregistrée', duration: 2000 }))
      .catch(() => undefined)
  }, [ready, today, toast])

  const nav = useMemo(
    () => ({ today, tab, setTab, selectedDay, setSelectedDay, sheet, setSheet, focusEntryId, setFocus, highlight, setHighlight }),
    [today, tab, selectedDay, sheet, focusEntryId, highlight],
  )

  if (onboarded === undefined) return null

  if (absence) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Content de te revoir</h1>
        <p className="mt-3 text-muted">
          Tu n'as pas ouvert l'app pendant {plural(absence.days, 'jour', 'jours')} ({dayShort(absence.from)} → {dayShort(absence.to)}).
          Comment compter tes routines de ces jours-là ?
        </p>
        <div className="mt-6 space-y-3">
          <button
            type="button"
            className={`${btnPrimary} w-full py-3.5 text-base`}
            onClick={async () => {
              await runRollover(db, Date.now(), { absence: 'not_done' })
              setAbsence(null)
              setReady(true)
            }}
          >
            Non faites
          </button>
          <button
            type="button"
            className={`${btnGhost} w-full py-3.5 text-base`}
            onClick={async () => {
              await runRollover(db, Date.now(), { absence: 'pause' })
              setAbsence(null)
              setReady(true)
            }}
          >
            En pause (exclues des statistiques)
          </button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Les tâches prévues ces jours-là t'attendent dans la réserve, à replanifier.
        </p>
      </div>
    )
  }

  if (!ready) return null
  if (!onboarded) return <Welcome onDone={() => undefined} />

  const close = () => setSheet(null)
  const withPlayer = !!running

  return (
    <NavContext.Provider value={nav}>
      {needRefresh[0] && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-lg">
            <span className="flex-1">Nouvelle version disponible</span>
            <button type="button" className="font-semibold text-accent" onClick={() => void updateServiceWorker(true)}>
              Recharger
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto min-h-dvh max-w-md px-4 pb-44 pt-4">
        {tab === 'day' && <DayView />}
        {tab === 'reserve' && <ReserveView />}
        {tab === 'routines' && <RoutinesView />}
        {tab === 'bilan' && <BilanView />}
      </main>

      {(tab === 'day' || tab === 'reserve') && (
        <div
          className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4"
          style={{ bottom: `calc(env(safe-area-inset-bottom) + ${withPlayer ? 8.25 : 5}rem)` }}
        >
          <div className="flex w-full max-w-md justify-end">
            <button
              type="button"
              aria-label="Ajouter une tâche"
              onClick={() => setSheet({ type: 'add', plan: tab === 'reserve' ? 'reserve' : undefined })}
              className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-xl transition active:scale-90"
            >
              <Icon name="plus" className="size-7" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}

      <MiniPlayer />
      <TabBar tab={tab} setTab={setTab} today={today} />

      {sheet?.type === 'add' && <AddSheet plan={sheet.plan} onClose={close} />}
      {sheet?.type === 'task' && <TaskSheet key={sheet.taskId} taskId={sheet.taskId} entryId={sheet.entryId} onClose={close} />}
      {sheet?.type === 'occurrence' && <OccurrenceSheet key={sheet.entryId} entryId={sheet.entryId} onClose={close} />}
      {sheet?.type === 'routine' && <RoutineSheet key={sheet.routineId} routineId={sheet.routineId} onClose={close} />}
      {sheet?.type === 'pause' && <PauseSheet routineId={sheet.routineId} onClose={close} />}
      {sheet?.type === 'review' && <ReviewSheet onClose={close} />}
      {sheet?.type === 'settings' && <SettingsSheet onClose={close} />}
      {sheet?.type === 'versions' && <VersionsSheet onClose={close} />}
      {sheet?.type === 'gap' && <GapSheet key={sheet.startAt} startAt={sheet.startAt} endAt={sheet.endAt} day={sheet.day} onClose={close} />}
      {sheet?.type === 'dayLine' && (
        <DayLineSheet
          key={sheet.entryId + (sheet.sessionId ?? '') + (sheet.subtaskId ?? '')}
          entryId={sheet.entryId}
          sessionId={sheet.sessionId}
          subtaskId={sheet.subtaskId}
          onClose={close}
        />
      )}
      {sheet?.type === 'hourly' && <HourlySheet key={sheet.day} day={sheet.day} onClose={close} />}
      {sheet?.type === 'catchUp' && <CatchUpSheet key={sheet.entryId} entryId={sheet.entryId} onClose={close} />}
      {sheet?.type === 'timeEntry' && (
        <TimeEntrySheet
          key={sheet.entryId}
          entryId={sheet.entryId}
          name={sheet.name}
          estimateMin={sheet.estimateMin}
          day={sheet.day}
          subtaskId={sheet.subtaskId}
          parentName={sheet.parentName}
          onClose={close}
        />
      )}
      {runningItem &&
        okTimer !== runningItem.session.id &&
        runningItem.session.startAt !== undefined &&
        (Date.now() - runningItem.session.startAt > 3 * 3_600_000 || runningItem.session.date < today) && (
          <ForgottenTimer
            session={runningItem.session}
            name={runningItem.item.name}
            onDone={() => setOkTimer(runningItem.session.id)}
          />
        )}
      {focusEntryId && <FocusScreen entryId={focusEntryId} onClose={() => setFocus(null)} />}
    </NavContext.Provider>
  )
}

export default function App() {
  if (needsInstall()) return <InstallScreen />
  return <Shell />
}
