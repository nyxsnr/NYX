import { Icon } from '../icons';

/**
 * The product panel under the hero headline.
 *
 * A real match explanation, built from the same primitives the signed-in
 * product uses — not a screenshot. That matters three ways: it weighs a few
 * kilobytes instead of a few hundred, it stays sharp on any display, and it
 * cannot drift out of date the way a captured image does.
 *
 * The content is illustrative and labelled as such. It shows the one thing
 * that actually distinguishes this product: a score with its reasoning and
 * its gaps visible, rather than a number with nothing behind it.
 */
const REASONS = [
  { label: 'Customer support', detail: 'Simulation verified · scored 82', weight: 0.9, kind: 'strong' as const },
  { label: 'Written English', detail: 'Employer verified · 3 approved tasks', weight: 1.0, kind: 'strong' as const },
  { label: 'Data entry', detail: 'AI-assessed from your CV', weight: 0.55, kind: 'partial' as const },
];

const GAPS = [{ label: 'Zoho Desk', detail: 'Not evidenced — the employer asked for it' }];

export function HeroPanel() {
  return (
    <div className="panel lit-edge overflow-hidden p-5 text-left sm:p-7">
      {/* Header: the opportunity and the score */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Matched to you</p>
          <h3 className="font-display mt-2 text-xl font-semibold sm:text-2xl">Customer Support Agent</h3>
          <p className="mt-1 text-sm text-secondary">Sokoni Online · Nairobi · remote · KES 50,000–70,000</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-display text-3xl font-bold leading-none tabular-nums text-jade-300">85%</p>
            <p className="mt-1 text-xs text-muted">strong match</p>
          </div>
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full text-jade-300"
            style={{ background: 'rgb(53 189 154 / 0.14)', boxShadow: '0 0 24px -4px rgb(53 189 154 / 0.6)' }}
          >
            <Icon name="badge-check" size={22} />
          </span>
        </div>
      </div>

      <div className="my-5 h-px" style={{ background: 'rgb(255 255 255 / 0.10)' }} />

      {/* Why — the part a job board never shows you */}
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Why you matched</p>
      <ul className="mt-3 space-y-3">
        {REASONS.map((reason) => (
          <li key={reason.label} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                reason.kind === 'strong' ? 'text-jade-300' : 'text-cyan-300'
              }`}
              style={{ background: reason.kind === 'strong' ? 'rgb(53 189 154 / 0.16)' : 'rgb(53 196 218 / 0.16)' }}
            >
              <Icon name={reason.kind === 'strong' ? 'badge-check' : 'sparkles'} size={13} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{reason.label}</span>
              <span className="block truncate text-xs text-muted">{reason.detail}</span>
            </span>

            <span
              className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full sm:block"
              style={{ background: 'rgb(255 255 255 / 0.10)' }}
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${reason.weight * 100}%`,
                  background: reason.kind === 'strong' ? 'var(--color-jade-400)' : 'var(--color-cyan-400)',
                }}
              />
            </span>
          </li>
        ))}
      </ul>

      {/* And the gap, stated as plainly as the strengths */}
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted">What is missing</p>
      <ul className="mt-3">
        {GAPS.map((gap) => (
          <li key={gap.label} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ochre-300"
              style={{ background: 'rgb(226 156 57 / 0.16)' }}
            >
              <Icon name="warning" size={13} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{gap.label}</span>
              <span className="block text-xs text-muted">{gap.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-muted">Illustrative example. Every real match shows its reasons and its gaps.</p>
    </div>
  );
}
