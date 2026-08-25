import Link from 'next/link';
import type { Metadata } from 'next';
import { getPlatformMetrics } from '@/lib/analytics';
import { formatKes } from '@/lib/i18n';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Faq } from '@/components/marketing/faq';
import { Mesh } from '@/components/marketing/mesh';
import { HeroPanel } from '@/components/marketing/hero-panel';
import { EvidenceLadder } from '@/components/marketing/ladder';
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
    body: 'We read your background and name capabilities you may never have named yourself, including ones that transfer from informal or unpaid work.',
  },
  {
    step: '03',
    title: 'Prove it with real work',
    icon: 'badge-check',
    body: 'Complete a short work simulation — triage an inbox, clean a dataset, handle a difficult customer. Scored against a rubric employers recognise.',
  },
  {
    step: '04',
    title: 'Get matched to real opportunities',
    icon: 'search',
    body: 'Jobs and paid tasks matched on evidence, not keywords, and every match tells you exactly why it was made and what is missing.',
  },
  {
    step: '05',
    title: 'Do the work and get paid',
    icon: 'wallet',
    body: 'Money is locked in escrow before you start, and released to your balance when the employer approves your work.',
  },
];

const WORKER_POINTS: Array<[string, string]> = [
  ['Free to find and apply for work', 'You are never charged to access opportunities. Employers pay for the platform.'],
  ['Your evidence follows you', 'A simulation you pass once counts on every application afterwards.'],
  ['You see why you did not match', 'Rejection without a reason teaches you nothing. Every match shows its gaps.'],
  ['Payment is protected', 'Task payments are locked in escrow before you start work.'],
  ['Built for the phone you have', 'Fast on mid-range Android over mobile data. No app download required.'],
];

const EMPLOYER_POINTS: Array<[string, string]> = [
  ['See proof, not claims', 'Candidates arrive with scored work simulations, not a list of adjectives.'],
  ['Post a job or a task', 'Hire permanently, or get one piece of work done without a headcount.'],
  ['Describe an outcome, get a plan', 'Describe a project in plain language and get it broken into scoped, priced tasks for your approval.'],
  ['Explainable shortlists', 'Every ranked candidate comes with the reasoning. You decide; the system never rejects anyone for you.'],
  ['Pay for delivered work', 'Funds sit in escrow and release when you approve the output.'],
];

/**
 * The AI capabilities, sized for a bento grid rather than a uniform row.
 * `span` drives how many columns each tile claims on wide screens — the point
 * is that the section does not read as another identical card grid.
 */
const AI_CAPABILITIES: Array<{ title: string; body: string; icon: IconName; span: string }> = [
  {
    title: 'Explainable matching',
    icon: 'search',
    span: 'lg:col-span-3',
    body: 'Scores every match on evidence, logistics and preferences, then shows its full reasoning — the strengths that carried it and the requirements you could not evidence.',
  },
  {
    title: 'CV analysis',
    icon: 'document',
    span: 'lg:col-span-3',
    body: 'Extracts your education, experience and skills, and shows you the exact line each one came from.',
  },
  {
    title: 'Capability assessment',
    icon: 'compass',
    span: 'lg:col-span-2',
    body: 'Names what you can do now, including ability that transfers from work you were never paid for.',
  },
  {
    title: 'Work simulations',
    icon: 'clipboard',
    span: 'lg:col-span-2',
    body: 'Realistic exercises from human-written templates, scored against a fixed rubric.',
  },
  {
    title: 'Interview practice',
    icon: 'mic',
    span: 'lg:col-span-2',
    body: 'Role-specific mock interviews with scored feedback on structure and specificity.',
  },
];

const TRUST_POINTS: Array<{ title: string; body: string; icon: IconName }> = [
  {
    title: 'Employers are checked',
    icon: 'building',
    body: 'Every employer shows as unverified, basic verified or business verified. You see which before you apply.',
  },
  {
    title: 'Scam postings are screened',
    icon: 'shield',
    body: 'Any posting that asks a worker for a fee, requests your ID or PIN, or pushes you off-platform is held for human review before it can go live.',
  },
  {
    title: 'Your money is held safely',
    icon: 'lock',
    body: 'Task payments lock in escrow when you are hired and release when your work is approved. Disputes are decided by a person, not a script.',
  },
];

export default async function LandingPage() {
  // If the database is unreachable the marketing page must still render.
  const metrics = await getPlatformMetrics().catch(() => null);
  const hasTraction = Boolean(metrics && metrics.registeredWorkers > 0);

  return (
    <div className="cinema grain relative min-h-dvh">
      <SiteHeader />

      <main id="main" className="relative z-[2]">
        {/* ================================================================ */}
        {/* Hero — mesh, headline, and the product itself                    */}
        {/* ================================================================ */}
        <section className="relative overflow-hidden">
          <Mesh />
          <div aria-hidden="true" className="vignette pointer-events-none absolute inset-0" />

          <div className="container-page relative max-w-6xl pb-20 pt-14 sm:pb-28 sm:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="rise panel eyebrow mx-auto inline-flex rounded-full px-4 py-1.5 text-[0.6875rem] sm:text-xs">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-jade-300" />
                Employment infrastructure for Kenya
              </p>

              <h1 className="rise rise-1 display display-xl mt-7">
                Turn your skills
                <br />
                into <span className="text-gradient">income</span>.
              </h1>

              <p className="rise rise-2 mx-auto mt-7 max-w-xl text-lg text-secondary sm:text-xl">
                Discover what you can do. Prove it with real work. Get matched on evidence — and get
                paid from money that was locked away before you started.
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

              <p className="rise rise-3 mt-5 text-sm text-muted">Free for workers. No fee to apply, ever.</p>
            </div>

            {/* The product, not a picture of the product. */}
            <div className="rise rise-3 relative mx-auto mt-16 max-w-2xl">
              <div
                aria-hidden="true"
                className="absolute -inset-x-8 -inset-y-6 -z-10 rounded-[2.5rem] opacity-70 blur-3xl"
                style={{ background: 'radial-gradient(60% 60% at 50% 50%, rgb(11 129 104 / 0.55), transparent 70%)' }}
              />
              <HeroPanel />
            </div>

            {/* Real numbers only. Before there is traction we describe what the
                platform does rather than inventing social proof. */}
            {hasTraction && metrics ? (
              <dl className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
                {[
                  { label: 'Workers registered', value: metrics.registeredWorkers.toLocaleString() },
                  { label: 'Open opportunities', value: (metrics.openJobs + metrics.openTasks).toLocaleString() },
                  { label: 'Employers hiring', value: metrics.registeredEmployers.toLocaleString() },
                  { label: 'Paid to workers', value: formatKes(metrics.workerIncomeTotal, { compact: true }) },
                ].map((item, i) => (
                  <div key={item.label} className="text-center">
                    <dd
                      className={`font-display text-3xl font-bold leading-none tabular-nums sm:text-4xl ${
                        i === 3 ? 'text-gradient' : ''
                      }`}
                    >
                      {item.value}
                    </dd>
                    <dt className="mt-2 text-xs text-muted">{item.label}</dt>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>

        {/* ================================================================ */}
        {/* How it works — a lit spine, not a card grid                      */}
        {/* ================================================================ */}
        <section id="how-it-works" className="section relative">
          <div className="container-page max-w-5xl">
            <div className="max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 className="display display-lg mt-4">
                We start with the person,
                <br className="hidden sm:block" /> not the vacancy
              </h2>
              <p className="mt-5 text-lg text-secondary">
                A job board starts with a vacancy and hunts for a candidate. KaziOS starts with what
                you can do and works forward to income.
              </p>
            </div>

            <ol className="relative mt-16">
              {/* The spine the steps hang from. */}
              <span
                aria-hidden="true"
                className="absolute bottom-8 left-[1.4375rem] top-3 w-px sm:left-[1.6875rem]"
                style={{ background: 'linear-gradient(180deg, var(--color-jade-400), var(--color-cyan-400) 45%, var(--color-iris-400) 100%)', opacity: 0.5 }}
              />

              {HOW_IT_WORKS.map((item) => (
                <li key={item.step} className="reveal relative flex gap-6 pb-12 last:pb-0 sm:gap-8">
                  <span
                    aria-hidden="true"
                    className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14"
                    style={{
                      background: '#0b1416',
                      border: '1px solid rgb(255 255 255 / 0.14)',
                      boxShadow: '0 0 30px -6px rgb(53 189 154 / 0.5)',
                    }}
                  >
                    <Icon name={item.icon} size={22} className="text-jade-300" />
                  </span>

                  <div className="min-w-0 pt-1.5 sm:pt-2.5">
                    <p className="font-display text-xs font-bold tracking-[0.18em] text-muted">{item.step}</p>
                    <h3 className="font-display mt-2 text-xl font-semibold sm:text-2xl">{item.title}</h3>
                    <p className="mt-2 max-w-xl text-secondary">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-4 font-display text-sm text-muted sm:text-base">
              Person → capability → proof → work → payment → reputation → better work.
            </p>
          </div>
        </section>

        {/* ================================================================ */}
        {/* The evidence ladder — the signature moment                       */}
        {/* ================================================================ */}
        <section id="proof" className="section relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.18), transparent)' }}
          />
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Proof of work</p>
              <h2 className="display display-lg mt-4">Evidence, not adjectives</h2>
              <p className="mt-5 text-lg text-secondary">
                Anyone can type &ldquo;excellent communication skills&rdquo;. KaziOS keeps what you said
                and what you proved in separate columns — and weights them differently. These are the
                real weights.
              </p>
            </div>

            <div className="mt-20">
              <EvidenceLadder />
            </div>

            <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted">
              Evidence only ever moves up. A later self-report cannot overwrite a proven skill, and no
              one can delete a verified result — otherwise every good result would be meaningless.
            </p>
          </div>
        </section>

        {/* ================================================================ */}
        {/* Two audiences — split panels, not a bullet list                  */}
        {/* ================================================================ */}
        <section id="for-workers" className="section relative">
          <div className="container-page grid gap-6 lg:grid-cols-2">
            <div className="panel reveal relative overflow-hidden p-7 sm:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
                style={{ background: 'rgb(11 129 104 / 0.35)' }}
              />
              <div className="relative">
                <p className="eyebrow">For workers</p>
                <h2 className="display display-md mt-4">
                  A degree, a trade, or no idea where to start
                </h2>
                <ul className="mt-8 space-y-5">
                  {WORKER_POINTS.map(([title, body]) => (
                    <li key={title} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-jade-300"
                        style={{ background: 'rgb(53 189 154 / 0.16)' }}
                      >
                        <Icon name="badge-check" size={14} />
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
            </div>

            <div id="for-employers" className="panel reveal relative overflow-hidden p-7 sm:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
                style={{ background: 'rgb(211 130 31 / 0.28)' }}
              />
              <div className="relative">
                <p className="eyebrow" style={{ color: 'var(--color-ochre-300)' }}>
                  For employers
                </p>
                <h2 className="display display-md mt-4">SMEs, startups and agencies who need work done well</h2>
                <ul className="mt-8 space-y-5">
                  {EMPLOYER_POINTS.map(([title, body]) => (
                    <li key={title} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ochre-300"
                        style={{ background: 'rgb(226 156 57 / 0.16)' }}
                      >
                        <Icon name="badge-check" size={14} />
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
          </div>
        </section>

        {/* ================================================================ */}
        {/* AI — a bento grid, deliberately uneven                           */}
        {/* ================================================================ */}
        <section id="ai" className="section relative overflow-hidden">
          <div className="container-page">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <p className="eyebrow">Artificial intelligence</p>
                <h2 className="display display-lg mt-4">What the AI actually does</h2>
              </div>
              <p className="max-w-sm text-secondary">
                Five specific jobs, each with a human check. No opaque scoring, and no automated
                rejections — a person always decides.
              </p>
            </div>

            <div className="mt-14 grid gap-4 lg:grid-cols-6">
              {AI_CAPABILITIES.map((item) => (
                <article key={item.title} className={`panel panel-hover reveal p-6 sm:p-7 ${item.span}`}>
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-jade-300"
                    style={{ background: 'rgb(53 189 154 / 0.13)' }}
                  >
                    <Icon name={item.icon} size={21} />
                  </span>
                  <h3 className="font-display mt-5 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-secondary">{item.body}</p>
                </article>
              ))}

              <div className="panel reveal p-6 sm:p-7 lg:col-span-6">
                <h3 className="font-display flex items-center gap-2.5 text-lg font-semibold">
                  <Icon name="shield" size={19} className="text-jade-300" />
                  What it will never do
                </h3>
                <ul className="mt-5 grid gap-3 text-sm text-secondary sm:grid-cols-2">
                  {[
                    'Invent experience, qualifications or achievements you do not have.',
                    'Promise you a job, an interview or an income.',
                    'Judge anyone on tribe, gender, age, religion, disability or health.',
                    'Reject a candidate on its own. A person always decides.',
                  ].map((line) => (
                    <li key={line} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-jade-400"
                        style={{ boxShadow: '0 0 8px var(--color-jade-400)' }}
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* Trust                                                            */}
        {/* ================================================================ */}
        <section id="trust" className="section relative">
          <div className="container-page">
            <div className="max-w-2xl">
              <p className="eyebrow">Trust and safety</p>
              <h2 className="display display-lg mt-4">The parts that protect you</h2>
            </div>

            <div className="mt-14 grid gap-10 md:grid-cols-3">
              {TRUST_POINTS.map((item, i) => (
                <article key={item.title} className="reveal relative pt-6">
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ background: 'linear-gradient(90deg, var(--color-jade-400), transparent)' }}
                  />
                  <p className="font-display text-xs font-bold tracking-[0.18em] text-muted">
                    {String(i + 1).padStart(2, '0')}
                  </p>
                  <h3 className="font-display mt-4 flex items-center gap-2.5 text-xl font-semibold">
                    <Icon name={item.icon} size={19} className="text-jade-300" />
                    {item.title}
                  </h3>
                  <p className="mt-3 text-secondary">{item.body}</p>
                </article>
              ))}
            </div>

            <ScamNotice />
          </div>
        </section>

        <Faq />

        {/* ================================================================ */}
        {/* Closing                                                          */}
        {/* ================================================================ */}
        <section className="section relative overflow-hidden">
          <Mesh variant="close" />
          <div aria-hidden="true" className="vignette pointer-events-none absolute inset-0" />

          <div className="container-page relative">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="display display-lg">Find out what you can do.</h2>
              <p className="mt-5 text-lg text-secondary">
                Ten minutes to set up a profile, twenty for your first work simulation. Both free — and
                you keep every piece of evidence you earn.
              </p>
              <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
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
    </div>
  );
}

/** Scam-awareness notice. Placed on the public page, where it protects most. */
function ScamNotice() {
  return (
    <div
      className="mt-16 flex gap-5 rounded-2xl p-6 sm:p-7"
      style={{ background: 'rgb(226 156 57 / 0.10)', border: '1px solid rgb(226 156 57 / 0.28)' }}
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ochre-200"
        style={{ background: 'rgb(226 156 57 / 0.18)' }}
      >
        <Icon name="warning" size={21} />
      </span>
      <div>
        <p className="font-display text-lg font-semibold text-ochre-100">
          No legitimate employer will ever ask you to pay for a job.
        </p>
        <p className="mt-2 text-sm text-ochre-100/80">
          KaziOS never charges workers to apply, and no employer here may ask you for a registration
          fee, your M-Pesa PIN or your ID before you are hired. If someone does, report it and we will
          investigate.
        </p>
      </div>
    </div>
  );
}
