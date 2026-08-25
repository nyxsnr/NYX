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
    <section id="faq" className="border-b py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Questions</h2>
        <div className="mt-8 divide-y">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="tap flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.q}
                <span aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
