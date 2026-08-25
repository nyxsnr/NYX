import Link from 'next/link';
import type { Metadata } from 'next';
import { getPlatformMetrics } from '@/lib/analytics';
import { formatKes } from '@/lib/i18n';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Faq } from '@/components/marketing/faq';
import { Icon, type IconName } from '@/components/icons';

export const metadata: Metadata = {
  title: 'KaziOS — Turn Your Skills Into Income',
};

// Metrics are live, so nothing on this page is a claim we cannot substantiate.
export const revalidate = 300;

const HOW_IT_WORKS: Array<{ step: string; title: string; body: string; icon: IconName }> = [
  {
    step: '01',
    title: 'Tell us what you have done',
    icon: 'document',
    body: 'Upload or paste your CV, or just answer a few questions. If you are not sure what you can do, say so — that is a normal starting point, and we work from there.',
  },
  {
    step: '02',
    title: 'Find out what you can actually do',
    icon: 'compass',
    body: 'We read your background and identify capabilities you may not have named yourself, including ones that transfer from informal or unpaid work.',
  },
  {
    step: '03',
    title: 'Prove it with real work',
    icon: 'badge-check',
    body: 'Complete a short work simulation — triage an inbox, clean a dataset, handle a difficult customer. It is scored against a rubric employers recognise.',
  },
  {
    step: '04',
    title: 'Get matched to real opportunities',
    icon: 'search',
    body: 'Jobs and paid tasks are matched on evidence, not keywords, and every match tells you exactly why it was made and what is missing.',
  },
  {
    step: '05',
    title: 'Do the work and get paid',
    icon: 'wallet',
    body: 'Money is held in escrow before you start, and released to your balance when the employer approves your work.',
  },
];

/**
 * The evidence ladder.
 *
 * The weights are the real ones from the matching engine. Publishing them is
 * the point: a scoring system nobody can inspect is just an opinion.
 */
const EVIDENCE_TIERS = [
  {
    label: 'Self-reported',
    weight: '0.35',
    icon: 'user' as IconName,
    body: 'You told us. Useful for discovery, weighted lowest in matching.',
  },
  {
    label: 'AI-assessed',
    weight: '0.55',
    icon: 'sparkles' as IconName,
    body: 'Inferred from your CV and answers, with the source line shown to you.',
  },
  {
    label: 'Simulation verified',
    weight: '0.90',
    icon: 'badge-check' as IconName,
    body: 'Demonstrated in a scored exercise against a fixed rubric.',
  },
  {
    label: 'Employer verified',
    weight: '1.00',
    icon: 'shield' as IconName,
    body: 'Confirmed by an employer after real, paid, approved work.',
  },
];

const WORKER_POINTS = [
  ['It is free to find and apply for work', 'You are never charged to access opportunities. The platform is paid for by employers.'],
  ['Your evidence follows you', 'A simulation you pass once counts on every application afterwards.'],
  ['You see why you did not match', 'Rejection without a reason teaches you nothing. Every match shows its gaps.'],
  ['Payment is protected', 'Task payments are locked in escrow before you start work.'],
  ['Built for the phone you have', 'Fast on mid-range Android over mobile data. No app download required.'],
];

const EMPLOYER_POINTS = [
  ['See proof, not claims', 'Candidates arrive with scored work simulations, not just a list of adjectives.'],
  ['Post a job or a task', 'Hire permanently, or get a specific piece of work done without a headcount.'],
  ['Describe an outcome, get a plan', 'Describe a project in plain language and get it broken into scoped, priced tasks for your approval.'],
  ['Explainable shortlists', 'Every ranked candidate comes with the reasons behind their score. You decide; the system never rejects anyone for you.'],
  ['Pay for delivered work', 'Funds are held in escrow and released when you approve the output.'],
];

const AI_CAPABILITIES: Array<{ title: string; body: string; icon: IconName }> = [
  { title: 'CV analysis', icon: 'document', body: 'Extracts your education, experience and skills, and shows you the exact line each one came from.' },
  { title: 'Capability assessment', icon: 'compass', body: 'Identifies what you can do now, including transferable ability from work you were never paid for.' },
  { title: 'Work simulations', icon: 'clipboard', body: 'Generates realistic exercises from human-written templates and scores them against a fixed rubric.' },
  { title: 'Explainable matching', icon: 'search', body: 'Scores every match on evidence, logistics and preferences — and shows its reasoning.' },
  { title: 'Interview practice', icon: 'mic', body: 'Role-specific mock interviews with scored feedback on structure, specificity and ownership.' },
  { title: 'Career agent', icon: 'chat', body: 'Answers "what should I do next?" using your actual profile, not generic advice.' },
];

const TRUST_POINTS: Array<{ title: string; body: string; icon: IconName }> = [
  {
    title: 'Employers are checked',
    icon: 'building',
    body: 'Employers show as unverified, basic verified or business verified. You always see which before you apply.',
  },
  {
    title: 'Scam postings are screened',
    icon: 'shield',
    body: 'Any posting that asks a worker to pay a fee, requests your ID or PIN, or pushes you off-platform is held for human review before it can go live.',
  },
  {
    title: 'Your money is held safely',
    icon: 'lock',
    body: 'Task payments are locked in escrow when you are hired and released when your work is approved. Disputes are decided by a person, not a script.',
  },
];

export default async function LandingPage() {
  // If the database is unreachable the marketing page must still render.
  const metrics = await getPlatformMetrics().catch(() => null);
  const hasTraction = Boolean(metrics && metrics.registeredWorkers > 0);

  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="hero-wash pointer-events-none absolute inset-0" />
          <div aria-hidden="true" className="grid-lines pointer-events-none absolute inset-0 opacity-60" />

          <div className="container-page relative py-16 sm:py-24 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              {/* Sized down a step on the narrowest screens so the label stays
                  on one line — wrapped, it left the dot orphaned mid-pill. */}
              <p className="rise glass eyebrow mx-auto rounded-full px-4 py-1.5 text-[0.6875rem] sm:text-xs">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-jade-500" />
                Employment infrastructure for Kenya
              </p>

              <h1 className="rise rise-1 mt-6 text-4xl font-extrabold leading-[1.05] sm:text-6xl lg:text-7xl">
                Turn your skills into <span className="text-gradient">income</span>.
              </h1>

              <p className="rise rise-2 mx-auto mt-6 max-w-2xl text-lg text-secondary sm:text-xl">
                KaziOS helps you discover what you can do, prove it with real work, and connect with
                employers who need it — with your payment protected from the moment you are hired.
              </p>

              <div className="rise rise-3 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/signup?role=worker" className="btn btn-primary btn-pill btn-lg w-full sm:w-auto">
                  Find work
                  <Icon name="arrow-right" size={18} />
                </Link>
                <Link href="/signup?role=employer" className="btn btn-secondary btn-pill btn-lg w-full sm:w-auto">
                  Hire talent
                </Link>
              </div>

              <p className="rise rise-3 mt-5 text-sm text-muted">
                Free for workers. No fee to apply, ever.
              </p>
            </div>

            {/* Real numbers only. Before there is traction, we describe what the
                platform does rather than inventing social proof. */}
            {hasTraction && metrics ? (
              <dl className="rise rise-3 mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border shadow-[var(--shadow-card)] sm:grid-cols-4" style={{ background: 'var(--border)' }}>
                {[
                  { label: 'Workers registered', value: metrics.registeredWorkers.toLocaleString() },
                  { label: 'Open opportunities', value: (metrics.openJobs + metrics.openTasks).toLocaleString() },
                  { label: 'Employers hiring', value: metrics.registeredEmployers.toLocaleString() },
                  { label: 'Paid to workers', value: formatKes(metrics.workerIncomeTotal, { compact: true }) },
                ].map((item, i) => (
                  <div key={item.label} className="surface stat-hero items-center px-4 py-6 text-center">
                    <dd className={`stat-hero-value ${i === 3 ? 'shimmer text-jade-600 dark:text-jade-300' : ''}`}>
                      {item.value}
                    </dd>
                    <dt className="stat-hero-label">{item.label}</dt>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How it works                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section id="how-it-works" className="section relative">
          <div aria-hidden="true" className="rule-fade" />
          <div className="container-page pt-16 sm:pt-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">How it works</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                We start with the person, not the vacancy
              </h2>
              <p className="mt-4 text-secondary">
                Most job boards begin with a job and search for a candidate. KaziOS begins with what
                you can do and works forward to income.
              </p>
            </div>

            <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {HOW_IT_WORKS.map((item) => (
                <li key={item.step} className="reveal tile p-6">
                  <div className="flex items-start justify-between gap-4">
                    <span className="tile-icon">
                      <Icon name={item.icon} size={22} />
                    </span>
                    <span className="text-sm font-extrabold tabular-nums text-muted">{item.step}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-secondary">{item.body}</p>
                </li>
              ))}

              {/* The chain, stated once, in the slot the grid leaves over. */}
              <li className="reveal card card-raised flex flex-col justify-center gap-3 border-jade-200 bg-jade-50 p-6 dark:border-jade-800 dark:bg-jade-950">
                <p className="text-sm font-semibold text-jade-800 dark:text-jade-200">The whole system, in one line</p>
                <p className="text-sm font-medium leading-relaxed text-jade-900 dark:text-jade-100">
                  Person → capability → proof → work → payment → reputation → better work.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Evidence ladder — the deep band                                   */}
        {/* ---------------------------------------------------------------- */}
        <section id="proof" className="band-deep section">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Proof of work</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Evidence, not adjectives</h2>
              <p className="mt-4 text-secondary">
                Anyone can write &ldquo;excellent communication skills&rdquo; on a CV. KaziOS keeps what
                you said and what you proved in separate columns, and weights them differently when
                matching.
              </p>
            </div>

            <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {EVIDENCE_TIERS.map((tier, i) => (
                <li key={tier.label} className="reveal tile flex flex-col p-6">
                  <span className="tile-icon">
                    <Icon name={tier.icon} size={22} />
                  </span>
                  <h3 className="mt-5 font-semibold">{tier.label}</h3>
                  <p className="mt-2 flex-1 text-sm text-secondary">{tier.body}</p>

                  <div className="mt-5 border-t pt-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted">Matching weight</span>
                      <span className="text-lg font-bold tabular-nums">{tier.weight}</span>
                    </div>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full"
                      style={{ background: 'rgb(255 255 255 / 0.14)' }}
                      role="meter"
                      aria-valuenow={Number(tier.weight) * 100}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${tier.label} matching weight`}
                    >
                      <div
                        className="h-full rounded-full bg-jade-400"
                        style={{ width: `${Number(tier.weight) * 100}%` }}
                      />
                    </div>
                  </div>

                  <span className="sr-only">
                    Tier {i + 1} of {EVIDENCE_TIERS.length}
                  </span>
                </li>
              ))}
            </ol>

            <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-muted">
              Evidence only ever moves up: a later self-report cannot overwrite a proven skill, and no
              one can delete a verified result. We never describe an AI assessment as a certification.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* For workers / for employers                                       */}
        {/* ---------------------------------------------------------------- */}
        <section id="for-workers" className="section">
          <div className="container-page grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="reveal">
              <p className="eyebrow">For workers</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                Whether you have a degree, a trade, or no idea where to start
              </h2>
              <ul className="mt-8 space-y-5">
                {WORKER_POINTS.map(([title, body]) => (
                  <li key={title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-jade-100 text-jade-700 dark:bg-jade-900 dark:text-jade-300"
                    >
                      <Icon name="badge-check" size={15} />
                    </span>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-0.5 text-sm text-secondary">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/signup?role=worker" className="btn btn-primary btn-pill mt-9">
                Find work
                <Icon name="arrow-right" size={18} />
              </Link>
            </div>

            <div id="for-employers" className="reveal">
              <p className="eyebrow" style={{ color: 'var(--color-ochre-600)' }}>
                For employers
              </p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                SMEs, startups and agencies who need work done well
              </h2>
              <ul className="mt-8 space-y-5">
                {EMPLOYER_POINTS.map(([title, body]) => (
                  <li key={title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ochre-100 text-ochre-700 dark:bg-ochre-900/50 dark:text-ochre-300"
                    >
                      <Icon name="badge-check" size={15} />
                    </span>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-0.5 text-sm text-secondary">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/signup?role=employer" className="btn btn-accent btn-pill mt-9">
                Hire talent
                <Icon name="arrow-right" size={18} />
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* AI capabilities                                                   */}
        {/* ---------------------------------------------------------------- */}
        <section id="ai" className="section surface-sunken">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Artificial intelligence</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">What the AI actually does</h2>
              <p className="mt-4 text-secondary">
                Six specific jobs, each with a human check. No opaque scoring, and no automated
                rejections.
              </p>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {AI_CAPABILITIES.map((item) => (
                <article key={item.title} className="reveal tile p-6">
                  <span className="tile-icon">
                    <Icon name={item.icon} size={22} />
                  </span>
                  <h3 className="mt-5 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-secondary">{item.body}</p>
                </article>
              ))}
            </div>

            <div className="reveal card card-raised mt-8 overflow-hidden p-0">
              <div className="border-b bg-jade-50 px-6 py-4 dark:bg-jade-950">
                <h3 className="flex items-center gap-2 font-semibold text-jade-900 dark:text-jade-100">
                  <Icon name="shield" size={18} />
                  What it will never do
                </h3>
              </div>
              <ul className="grid gap-3 p-6 text-sm text-secondary sm:grid-cols-2">
                {[
                  'Invent experience, qualifications or achievements you do not have.',
                  'Promise you a job, an interview or an income.',
                  'Judge anyone on tribe, gender, age, religion, disability or health.',
                  'Reject a candidate on its own. A person always decides.',
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-jade-500" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Trust                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section id="trust" className="section">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Trust and safety</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                The parts that protect you
              </h2>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {TRUST_POINTS.map((item) => (
                <article key={item.title} className="reveal tile p-6">
                  <span className="tile-icon">
                    <Icon name={item.icon} size={22} />
                  </span>
                  <h3 className="mt-5 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-secondary">{item.body}</p>
                </article>
              ))}
            </div>

            <ScamNotice />
          </div>
        </section>

        <Faq />

        {/* ---------------------------------------------------------------- */}
        {/* Closing CTA                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="band-deep section">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <span className="icon-circle mx-auto">
                <Icon name="rocket" size={30} />
              </span>
              <h2 className="mt-8 text-3xl font-bold sm:text-4xl">Find out what you can do.</h2>
              <p className="mt-4 text-secondary">
                About ten minutes to set up a profile, twenty to complete your first work simulation.
                Both are free, and you keep every piece of evidence you earn.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup?role=worker" className="btn btn-primary btn-pill btn-lg">
                  Find work
                  <Icon name="arrow-right" size={18} />
                </Link>
                <Link href="/signup?role=employer" className="btn btn-secondary btn-pill btn-lg">
                  Hire talent
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/** Scam-awareness notice. Placed on the public page, where it protects most. */
function ScamNotice() {
  return (
    <div className="mt-8 flex gap-4 rounded-2xl border border-ochre-300 bg-ochre-50 p-5 text-sm dark:border-ochre-700 dark:bg-ochre-900/30 sm:p-6">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ochre-200 text-ochre-800 dark:bg-ochre-800 dark:text-ochre-100"
      >
        <Icon name="warning" size={20} />
      </span>
      <div>
        <p className="font-semibold text-ochre-900 dark:text-ochre-100">
          No legitimate employer will ever ask you to pay for a job.
        </p>
        <p className="mt-1 text-ochre-800 dark:text-ochre-200">
          KaziOS never charges workers to apply, and no employer on this platform may ask you for a
          registration fee, your M-Pesa PIN or your ID before you are hired. If someone does, report it
          and we will investigate.
        </p>
      </div>
    </div>
  );
}
