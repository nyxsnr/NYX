import { Icon, type IconName } from '../icons';

/**
 * The evidence ladder, drawn as an actual ladder.
 *
 * Four risers whose height, brightness and colour temperature all climb with
 * the matching weight they carry, so the ascent is readable before a word is.
 * The weights are the real ones from `src/lib/matching` — publishing them is
 * the point, since a scoring system nobody can inspect is just an opinion.
 *
 * On a phone the risers stack and the height encoding collapses; the weight
 * bar and the number carry the ordering there instead. The `<ol>` and the
 * per-item position text mean the sequence survives with no visuals at all.
 */
interface Rung {
  label: string;
  weight: number;
  body: string;
  icon: IconName;
  accent: string;
  glow: number;
  /** Riser height at `sm` and up, as a share of the tallest. */
  height: number;
}

const RUNGS: Rung[] = [
  {
    label: 'Self-reported',
    weight: 0.35,
    body: 'You told us. Useful for discovery, weighted lowest.',
    icon: 'user',
    accent: 'var(--color-ink-400)',
    glow: 0.25,
    height: 0.46,
  },
  {
    label: 'AI-assessed',
    weight: 0.55,
    body: 'Inferred from your CV, with the source line shown to you.',
    icon: 'sparkles',
    accent: 'var(--color-cyan-400)',
    glow: 0.45,
    height: 0.62,
  },
  {
    label: 'Simulation verified',
    weight: 0.9,
    body: 'Demonstrated in a scored exercise against a fixed rubric.',
    icon: 'badge-check',
    accent: 'var(--color-jade-400)',
    glow: 0.75,
    height: 0.84,
  },
  {
    label: 'Employer verified',
    weight: 1.0,
    body: 'Confirmed by an employer after real, paid, approved work.',
    icon: 'shield',
    accent: 'var(--color-jade-300)',
    glow: 1,
    height: 1,
  },
];

export function EvidenceLadder() {
  return (
    <div>
      <ol className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {RUNGS.map((rung, index) => (
          <li
            key={rung.label}
            className="rung reveal min-h-[13rem] lg:min-h-0"
            style={{
              // Custom properties drive the lit cap in globals.css.
              ['--rung-accent' as string]: rung.accent,
              ['--rung-glow' as string]: rung.glow,
              // Height encodes the ascent on wide screens only; below `lg` the
              // cards sit side by side where differing heights would just look
              // like a broken grid.
              minHeight: `calc(9rem + ${rung.height} * 9rem)`,
            }}
          >
            <span className="sr-only">
              Tier {index + 1} of {RUNGS.length}.
            </span>

            <span
              aria-hidden="true"
              className="mb-auto flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'rgb(255 255 255 / 0.07)', color: rung.accent }}
            >
              <Icon name={rung.icon} size={20} />
            </span>

            <h3 className="font-display mt-6 text-lg font-semibold">{rung.label}</h3>
            <p className="mt-2 text-sm text-secondary">{rung.body}</p>

            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">Weight</span>
                <span className="font-display text-xl font-bold tabular-nums" style={{ color: rung.accent }}>
                  {rung.weight.toFixed(2)}
                </span>
              </div>
              <div
                className="mt-2 h-1 overflow-hidden rounded-full"
                style={{ background: 'rgb(255 255 255 / 0.10)' }}
                role="meter"
                aria-valuenow={rung.weight * 100}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${rung.label} matching weight`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${rung.weight * 100}%`,
                    background: rung.accent,
                    boxShadow: `0 0 12px ${rung.accent}`,
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* The floor the ladder stands on. */}
      <div
        aria-hidden="true"
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.30) 20%, rgb(255 255 255 / 0.30) 80%, transparent)' }}
      />
    </div>
  );
}
