# Ma journée — daily planner & time tracker (PWA)

A personal, offline-first Progressive Web App that combines a **to-do list**, a **habit tracker** and a **time tracker** around a single idea: *the day*.

It answers three questions every morning:

1. **What do I have to do today, and does it actually fit in my day?**
2. **Where does my time really go?**
3. **What did I actually get done?**

> The user interface is in French (it was built for my own daily use). The code, tests and documentation are commented in French as well.

---

## Features

**Daily planning**
- Day view with a week strip showing each day's planned workload against the time available (overloaded days turn red).
- One-tap add: name, estimated duration, day or "backlog", category, optional deadline and note.
- Manual ordering with long-press & drag; swipe left to push a task to tomorrow or back to the backlog.
- Past days are read-only summaries; future days can be planned ahead.

**Tasks that never silently disappear**
- An unfinished task is never lost: at midnight it moves to a *backlog* and is flagged "to reschedule".
- A one-card-at-a-time review lets you triage them: today, tomorrow, another day, keep, already done, delete.
- Subtasks with their own estimate and timer; the parent's estimate is the sum of its steps.

**Recurring routines (habits)**
- Every day, specific weekdays, or every N days (fixed calendar).
- A missed occurrence is recorded as "not done" — routines never pile up.
- Skip or move a single occurrence, pause one or all routines (holidays), completion rate over 7 and 30 days.
- Suggests adjusting a routine's estimate when the real time keeps drifting from it.

**Time tracking**
- One running timer at a time, full-screen focus mode, mini player on every tab.
- Real time vs. estimate on every task, timeline of the day, "forgotten timer?" prompt after 3 hours.
- Weekly review: completion rate, time per category, estimate accuracy, overloaded days, unplanned work.

**Reliable history**
- Postponing a task leaves a trace on the original day; nothing is ever overwritten.
- Handles midnight with a running timer, several days without opening the app, and clock changes — without duplicates.

---

## Tech stack

| | |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS 4 |
| Build | Vite 8, `vite-plugin-pwa` (installable, works offline) |
| Storage | IndexedDB through Dexie 4 — data never leaves the device |
| Drag & drop | dnd-kit |
| Tests | Vitest + fake-indexeddb (57 tests on business rules), Playwright for end-to-end checks |
| CI/CD | GitHub Actions: type-check, tests and build on every push; optional SFTP deployment |

No backend, no account, no tracking.

## Architecture

```
src/
├── domain/        # Business logic, framework-free and fully tested
│   ├── actions.ts     # every write: add, complete, postpone, timers, routines…
│   ├── rollover.ts    # end-of-day processing (idempotent, duplicate-proof)
│   ├── queries.ts     # read models used by the UI (live queries)
│   ├── routines.ts    # recurrence rules
│   └── *.test.ts
├── views/         # Screens and bottom sheets
├── components/    # Reusable UI (rows, timer, pickers…)
└── lib/           # Hooks, formatting, navigation, toasts
```

The data model separates three things that a naive to-do app mixes up:

- **the item** — what to do (`Task`, or a `Routine` with its recurrence rule);
- **the entry** — its presence on a given day and what happened that day (done, not done, postponed, skipped);
- **the session** — time actually spent, from the timer or entered by hand.

Entries have deterministic IDs (`routine + scheduled date + day`), which is what makes the midnight rollover safe to replay any number of times without creating duplicates.

The full functional specification (in French) is in [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Getting started

Requirements: Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # business-rule tests
npm run typecheck
npm run build      # production build in dist/
```

To use it on an iPhone: deploy `dist/` to any static host over HTTPS, open it in Safari, then **Share → Add to Home Screen**.

### Optional deployment

`.github/workflows/deploy.yml` uploads the build over SFTP when `main` changes. It stays disabled until you set the repository variable `DEPLOY_ENABLED=true` and the secrets `SFTP_HOST`, `SFTP_USER`, `SFTP_PASSWORD` and `SFTP_DIR`.

## Roadmap

- Encrypted automatic backup (manual JSON export/import is available today)
- Notifications
- Multi-device sync

## License

[MIT](LICENSE)
