/**
 * FAQ.
 *
 * Answers written to be honest rather than reassuring — including the question
 * most job platforms avoid: "will this get me a job?".
 */
const QUESTIONS: Array<{ q: string; a: string }> = [
  {
    q: 'Is KaziOS free for workers?',
    a: 'Yes. Creating a profile, completing simulations, and applying to jobs and tasks are all free. There is no fee to access work. KaziOS is funded by employers, through subscriptions and a fee on task transactions — that fee is shown to you before you take any task.',
  },
  {
    q: 'Will KaziOS get me a job?',
    a: 'No platform can promise that, and we will not pretend otherwise. What KaziOS does is make it far easier to show an employer what you can actually do, and to find the work where your evidence matches what is being asked for. Whether you are hired depends on your work and on employer demand.',
  },
  {
    q: 'I do not know what work I can do. Is this for me?',
    a: 'Yes — that is one of the situations KaziOS is specifically built for. Tell us your background, including informal work, and the assessment identifies capabilities you may never have named. Then a short simulation turns the strongest of them into evidence.',
  },
  {
    q: 'What is a work simulation?',
    a: 'A short, realistic exercise from the kind of work you want: triaging a manager\'s inbox, cleaning a messy customer list, replying to an angry customer. It takes about 20 minutes and is scored against a fixed rubric. Only your best attempt counts, so re-taking one can only help you.',
  },
  {
    q: 'Do I need a laptop?',
    a: 'Not for most of the platform. Your profile, simulations, applications and the career agent all work on a mid-range Android phone. Some individual tasks do require a laptop, and those are labelled clearly so you never waste time applying for work you cannot do.',
  },
  {
    q: 'How do I get paid?',
    a: 'For task work, the employer\'s payment is locked in escrow before you start, so the money is already committed. When your work is approved it is released to your KaziOS balance, which you withdraw to your mobile money account. For permanent jobs, you are paid by the employer directly under your employment contract.',
  },
  {
    q: 'What happens if an employer refuses to pay?',
    a: 'Open a dispute. The escrowed money stays held — neither side can move it — until an administrator reviews the evidence from both parties and decides. Resolutions are made by a person and recorded with a written reason.',
  },
  {
    q: 'Who can see my personal information?',
    a: 'Your phone number, exact location and earnings are private by default. Employers see your capabilities, evidence and work history. You control what else is shared from your privacy settings, and you can remove yourself from search at any time.',
  },
  {
    q: 'Does AI decide whether I get hired?',
    a: 'No. AI helps extract, assess and rank, and every score comes with the reasons behind it. Hiring decisions are made by employers, and no part of this system rejects a candidate automatically.',
  },
  {
    q: 'Which counties do you cover?',
    a: 'All 47 counties in Kenya. Remote and task-based work is available anywhere with a phone and a connection, and location-based roles are filtered to your county so you are not shown work you cannot reach.',
  },
];

export function Faq() {
  return (
    <section id="faq" className="section surface-sunken">
      <div className="container-page max-w-3xl">
        <div className="text-center">
          <p className="eyebrow">Questions</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">The ones worth asking</h2>
          <p className="mt-4 text-secondary">
            Including the one most job platforms avoid.
          </p>
        </div>

        <div className="mt-12 space-y-3">
          {QUESTIONS.map((item) => (
            <details
              key={item.q}
              className="card group overflow-hidden px-5 py-1 transition-[border-color] open:border-jade-300 dark:open:border-jade-700"
            >
              <summary className="tap flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                {/* A plus that rotates into a minus: one glyph, two states, no
                    icon swap and nothing to load. */}
                <span
                  aria-hidden="true"
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jade-50 text-jade-700 transition-transform duration-300 group-open:rotate-45 dark:bg-jade-950 dark:text-jade-300"
                >
                  <span className="absolute h-[1.5px] w-3 rounded bg-current" />
                  <span className="absolute h-3 w-[1.5px] rounded bg-current" />
                </span>
              </summary>
              <p className="pb-5 pr-10 text-sm leading-relaxed text-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
