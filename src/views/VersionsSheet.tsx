import { Sheet } from '../components/ui'
import { CURRENT_VERSION, RELEASES } from '../changelog'
import { dayShort } from '../lib/format'

/** Toutes les versions de l'application et ce que chacune a apporté. */
export function VersionsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Nouveautés" onClose={onClose}>
      <p className="text-sm text-muted">
        Tu utilises la version <span className="font-semibold text-ink">{CURRENT_VERSION}</span>.
      </p>
      <ol className="mt-4 space-y-3">
        {RELEASES.map((r, i) => (
          <li key={r.version} className={`rounded-2xl border p-3.5 ${i === 0 ? 'border-accent bg-accent-soft/50' : 'border-line/70 bg-surface'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular ${i === 0 ? 'bg-accent text-on-accent' : 'bg-bg text-muted'}`}>
                  {r.version}
                </span>
                {i === 0 && <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">actuelle</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{dayShort(r.date)}</span>
            </div>
            <div className="mt-2 text-[15px] font-semibold leading-snug">{r.title}</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-snug text-muted">
              {r.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Sheet>
  )
}
