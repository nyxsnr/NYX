/**
 * Shared UI primitives.
 *
 * Deliberately small and unstyled-by-props: the visual system lives in
 * globals.css, so these components stay readable and the design stays
 * consistent. Every interactive element meets a 44px tap target and carries
 * accessible labelling.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Component className={`card p-4 sm:p-5 ${className}`}>{children}</Component>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-secondary text-sm sm:text-base">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  info: 'bg-jade-50 text-jade-900 border-jade-200 dark:bg-jade-950 dark:text-jade-100 dark:border-jade-800',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
  warning: 'bg-ochre-50 text-ochre-900 border-ochre-200 dark:bg-ochre-900/30 dark:text-ochre-100 dark:border-ochre-700',
  danger: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800',
  neutral: 'surface-sunken text-secondary',
};

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 text-sm sm:p-4 ${TONE_CLASSES[tone]}`} role={tone === 'danger' ? 'alert' : undefined}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge border ${TONE_CLASSES[tone]}`}>{children}</span>;
}

/**
 * The evidence badge.
 *
 * This is the most important two square centimetres in the product: it is what
 * stops a claim from looking like a proof. The wording is fixed and never
 * says "certified".
 */
export function EvidenceBadge({
  level,
}: {
  level: 'SELF_REPORTED' | 'AI_INFERRED' | 'SIMULATION_VERIFIED' | 'EMPLOYER_VERIFIED';
}) {
  const config = {
    SELF_REPORTED: { tone: 'neutral' as const, label: 'Self-reported', icon: '○' },
    AI_INFERRED: { tone: 'info' as const, label: 'AI-assessed', icon: '◐' },
    SIMULATION_VERIFIED: { tone: 'success' as const, label: 'Simulation verified', icon: '●' },
    EMPLOYER_VERIFIED: { tone: 'success' as const, label: 'Employer verified', icon: '★' },
  }[level];

  return (
    <Badge tone={config.tone}>
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </Badge>
  );
}

export function MatchBadge({ score, band }: { score: number; band?: string }) {
  const tone: Tone = score >= 80 ? 'success' : score >= 65 ? 'info' : score >= 45 ? 'warning' : 'neutral';
  return (
    <Badge tone={tone}>
      {score}% match{band ? ` · ${band.replace(/_/g, ' ').toLowerCase()}` : ''}
    </Badge>
  );
}

export function VerificationBadge({ tier }: { tier: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'BUSINESS_VERIFIED' }) {
  if (tier === 'UNVERIFIED') return <Badge tone="warning">Unverified employer</Badge>;
  return <Badge tone="success">{tier === 'BUSINESS_VERIFIED' ? 'Business verified' : 'Verified'}</Badge>;
}

/**
 * Empty states are never blank. Each one names the situation and gives the
 * single most useful next action.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon = '◇',
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: string;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <span aria-hidden="true" className="mb-3 text-3xl text-muted">
        {icon}
      </span>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-secondary">{description}</p>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="btn btn-primary mt-4">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded surface-sunken ${className}`} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

/** Horizontal score bar with an accessible value. */
export function ScoreBar({
  value,
  label,
  max = 100,
  tone,
}: {
  value: number;
  label?: string;
  max?: number;
  tone?: 'jade' | 'ochre' | 'neutral';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colour =
    tone === 'ochre' ? 'bg-ochre-500' : tone === 'neutral' ? 'bg-ink-400' : pct >= 70 ? 'bg-jade-600' : pct >= 45 ? 'bg-ochre-500' : 'bg-ink-400';

  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-secondary">{label}</span>
          <span className="font-semibold tabular-nums">{Math.round(value)}</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full surface-sunken"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? 'Score'}
      >
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The big readiness number. Deliberately paired with its band, never alone. */
export function ScoreRing({ score, size = 120, band }: { score: number; size?: number; band?: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const stroke = score >= 70 ? 'var(--color-jade-600)' : score >= 45 ? 'var(--color-ochre-500)' : 'var(--color-ink-400)';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth="8" fill="none" className="stroke-ink-200 dark:stroke-ink-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth="8"
          fill="none"
          stroke={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{Math.round(score)}</span>
        {band ? <span className="text-[0.65rem] uppercase tracking-wide text-muted">{band.replace(/_/g, ' ')}</span> : null}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'jade' | 'ochre';
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          tone === 'jade' ? 'text-jade-600 dark:text-jade-300' : tone === 'ochre' ? 'text-ochre-600 dark:text-ochre-300' : ''
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | string[];
  required?: boolean;
  children: ReactNode;
}) {
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {hint && messages.length === 0 ? <p className="hint">{hint}</p> : null}
      {messages.map((message) => (
        <p key={message} className="field-error" role="alert">
          {message}
        </p>
      ))}
    </div>
  );
}

/** Simple demo-data marker, so seeded content is never mistaken for real. */
export function DemoBadge() {
  return <Badge tone="warning">Demo data</Badge>;
}

export function AiDisclosure({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-2 text-xs text-muted">
      {children ??
        'AI-assessed from the information provided. This is not a formal qualification or certification.'}
    </p>
  );
}
