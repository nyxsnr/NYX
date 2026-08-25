import Link from 'next/link';
import type { Metadata } from 'next';
import { getPlatformMetrics } from '@/lib/analytics';
import { formatKes } from '@/lib/i18n';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Faq } from '@/components/marketing/faq';

export const metadata: Metadata = {
  title: 'KaziOS — Turn Your Skills Into Income',
};

// Metrics are live, so nothing on this page is a claim we cannot substantiate.
export const revalidate = 300;

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Tell us what you have done',
    body: 'Upload or paste your CV, or just answer a few questions. If you are not sure what you can do, say so — that is a normal starting point, and we work from there.',
  },
  {
    step: '02',
    title: 'Find out what you can actually do',
    body: 'We read your background and identify capabilities you may not have named yourself, including ones that transfer from informal or unpaid work.',
  },
  {
    step: '03',
    title: 'Prove it with real work',
    body: 'Complete a short work simulation — triage an inbox, clean a dataset, handle a difficult customer. It is scored against a rubric employers recognise.',
  },
  {
    step: '04',
    title: 'Get matched to real opportunities',
    body: 'Jobs and paid tasks are matched on evidence, not keywords, and every match tells you exactly why it was made and what is missing.',
  },
  {
    step: '05',
    title: 'Do the work and get paid',
    body: 'Money is held in escrow before you start, and released to your balance when the employer approves your work.',
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

const AI_CAPABILITIES = [
  ['CV analysis', 'Extracts your education, experience and skills, and shows you the exact line each one came from.'],
  ['Capability assessment', 'Identifies what you can do now, including transferable ability from work you were never paid for.'],
  ['Work simulations', 'Generates realistic exercises from human-written templates and scores them against a fixed rubric.'],
  ['Explainable matching', 'Scores every match on evidence, logistics and preferences — and shows its reasoning.'],
  ['Interview practice', 'Role-specific mock interviews with scored feedback on structure, specificity and ownership.'],
  ['Career agent', 'Answers "what should I do next?" using your actual profile, not generic advice.'],
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
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_15%_-10%,var(--color-jade-100),transparent),radial-gradient(40rem_20rem_at_90%_10%,var(--color-ochre-100),transparent)] opacity-70 dark:opacity-20"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-jade-700 dark:text-jade-300">
              Employment infrastructure for Kenya
            </p>
            <h1 className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              Turn Your Skills Into Income.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-secondary sm:text-xl">
              KaziOS helps you discover what you can do, prove your skills and connect with real work.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup?role=worker" className="btn btn-primary px-7 text-base sm:w-auto">
                Find Work
              </Link>
              <Link href="/signup?role=employer" className="btn btn-secondary px-7 text-base sm:w-auto">
                Hire Talent
              </Link>
            </div>

            <p className="mt-4 text-sm text-muted">
              Free for workers. No fee to apply, ever.
            </p>

            {/* Real numbers only. Before there is traction, we describe what the
                platform does rather than inventing social proof. */}
            {hasTraction && metrics ? (
              <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'Workers registered', value: metrics.registeredWorkers.toLocaleString() },
                  { label: 'Open opportunities', value: (metrics.openJobs + metrics.openTasks).toLocaleString() },
                  { label: 'Employers hiring', value: metrics.registeredEmployers.toLocaleString() },
                  { label: 'Paid to workers', value: formatKes(metrics.workerIncomeTotal, { compact: true }) },
                ].map((item) => (
                  <div key={item.label} className="card p-4">
                    <dt className="text-xs uppercase tracking-wide text-muted">{item.label}</dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How it works                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section id="how-it-works" className="border-b py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-2 max-w-2xl text-secondary">
              Most job boards start with the job. We start with the person, and work forward to income.
            </p>

            <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {HOW_IT_WORKS.map((item) => (
                <li key={item.step} className="card p-5">
                  <span className="text-sm font-bold text-jade-600 dark:text-jade-300">{item.step}</span>
                  <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-secondary">{item.body}</p>
                </li>
              ))}
            </ol>

            <p className="mt-8 rounded-xl border-l-4 border-jade-600 surface-sunken p-4 text-sm font-medium">
              Person → capability → proof → work → payment → reputation → better work.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* For workers / for employers                                       */}
        {/* ---------------------------------------------------------------- */}
        <section id="for-workers" className="border-b py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">For workers</h2>
              <p className="mt-2 text-secondary">
                Whether you have a degree, a trade, informal experience, or no idea where to start.
              </p>
              <ul className="mt-6 space-y-4">
                {WORKER_POINTS.map(([title, body]) => (
                  <li key={title} className="flex gap-3">
                    <span aria-hidden="true" className="mt-0.5 text-jade-600 dark:text-jade-300">
                      ✓
                    </span>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-sm text-secondary">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/signup?role=worker" className="btn btn-primary mt-7">
                Find Work
              </Link>
            </div>

            <div id="for-employers">
              <h2 className="text-3xl font-bold tracking-tight">For employers</h2>
              <p className="mt-2 text-secondary">
                SMEs, startups, agencies and organisations who need work done well.
              </p>
              <ul className="mt-6 space-y-4">
                {EMPLOYER_POINTS.map(([title, body]) => (
                  <li key={title} className="flex gap-3">
                    <span aria-hidden="true" className="mt-0.5 text-ochre-600 dark:text-ochre-300">
                      ✓
                    </span>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-sm text-secondary">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/signup?role=employer" className="btn btn-accent mt-7">
                Hire Talent
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Proof of work                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section id="proof" className="border-b py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Proof of work, not claims</h2>
            <p className="mt-2 max-w-3xl text-secondary">
              Anyone can write &ldquo;excellent communication skills&rdquo; on a CV. KaziOS separates what
              you said from what you proved, and shows employers the difference.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Self-reported', body: 'You told us. Useful for discovery, weighted lowest in matching.', tone: 'border-ink-300' },
                { label: 'AI-assessed', body: 'Inferred from your CV and answers, with the source shown to you.', tone: 'border-jade-300' },
                { label: 'Simulation verified', body: 'Demonstrated in a scored exercise against a fixed rubric.', tone: 'border-jade-600' },
                { label: 'Employer verified', body: 'Confirmed by an employer after real, paid, approved work.', tone: 'border-ochre-500' },
              ].map((tier) => (
                <div key={tier.label} className={`card border-l-4 p-5 ${tier.tone}`}>
                  <p className="font-semibold">{tier.label}</p>
                  <p className="mt-1 text-sm text-secondary">{tier.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 text-sm text-muted">
              We never describe an AI assessment as a certification. It is evidence, labelled honestly for what it is.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* AI capabilities                                                   */}
        {/* ---------------------------------------------------------------- */}
        <section id="ai" className="border-b py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">What the AI actually does</h2>
            <p className="mt-2 max-w-3xl text-secondary">
              Specific jobs, each with a human check. No opaque scoring, and no automated rejections.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AI_CAPABILITIES.map(([title, body]) => (
                <div key={title} className="card p-5">
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-secondary">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 card border-l-4 border-jade-600 p-5">
              <h3 className="font-semibold">What it will never do</h3>
              <ul className="mt-2 grid gap-2 text-sm text-secondary sm:grid-cols-2">
                <li>Invent experience, qualifications or achievements you do not have.</li>
                <li>Promise you a job, an interview or an income.</li>
                <li>Judge anyone on tribe, gender, age, religion, disability or health.</li>
                <li>Reject a candidate on its own. A person always decides.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Trust                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section id="trust" className="border-b py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Trust and verification</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: 'Employers are checked',
                  body: 'Employers show as unverified, basic verified or business verified. You always see which before you apply.',
                },
                {
                  title: 'Scam postings are screened',
                  body: 'Any posting that asks a worker to pay a fee, requests your ID or PIN, or pushes you off-platform is held for human review before it can go live.',
                },
                {
                  title: 'Your money is held safely',
                  body: 'Task payments are locked in escrow when you are hired and released when your work is approved. Disputes are decided by a person, not a script.',
                },
              ].map((item) => (
                <div key={item.title} className="card p-5">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-secondary">{item.body}</p>
                </div>
              ))}
            </div>

            <Alert />
          </div>
        </section>

        <Faq />

        {/* ---------------------------------------------------------------- */}
        {/* Closing CTA                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Find out what you can do.
            </h2>
            <p className="mt-3 text-secondary">
              It takes about ten minutes to set up a profile and twenty to complete your first work
              simulation. Both are free.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup?role=worker" className="btn btn-primary px-8 text-base">
                Find Work
              </Link>
              <Link href="/signup?role=employer" className="btn btn-secondary px-8 text-base">
                Hire Talent
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/** Scam-awareness notice. Placed on the public page, where it protects most. */
function Alert() {
  return (
    <div className="mt-6 rounded-xl border border-ochre-300 bg-ochre-50 p-4 text-sm dark:border-ochre-700 dark:bg-ochre-900/30">
      <p className="font-semibold text-ochre-900 dark:text-ochre-100">
        No legitimate employer will ever ask you to pay for a job.
      </p>
      <p className="mt-1 text-ochre-800 dark:text-ochre-200">
        KaziOS never charges workers to apply, and no employer on this platform may ask you for a
        registration fee, your M-Pesa PIN or your ID before you are hired. If someone does, report it
        and we will investigate.
      </p>
    </div>
  );
}
