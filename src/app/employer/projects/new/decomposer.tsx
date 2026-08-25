'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field, SectionHeading } from '@/components/ui';
import { formatKes } from '@/lib/i18n';

interface ProposedTask {
  title: string;
  description: string;
  expectedOutput: string;
  category: string;
  requiredSkills: string[];
  estimatedHours: number;
  suggestedBudgetKes: number;
  suggestedBudgetMinor: number;
  workersNeeded: number;
  qualityRequirements: string;
  include: boolean;
}

interface Decomposition {
  projectId: string;
  projectTitle: string;
  interpretation: string;
  tasks: ProposedTask[];
  totalEstimatedHours: number;
  suggestedWorkerProfiles: string[];
  assumptions: string[];
  clarifyingQuestions: string[];
  notice: string;
}

const EXAMPLES = [
  "I need my restaurant's social media managed for the next month.",
  'Clean up our customer database — about 3,000 records with duplicates and bad phone numbers.',
  'Build a simple landing page for our new product.',
  'Research 100 potential customers in the logistics sector.',
];

export function ProjectDecomposer({ availableBalance }: { availableBalance: number }) {
  const router = useRouter();
  const [brief, setBrief] = useState('');
  const [budget, setBudget] = useState('');
  const [result, setResult] = useState<Decomposition | null>(null);
  const [tasks, setTasks] = useState<ProposedTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decompose(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<Decomposition>('/api/employer/ai/decompose', {
        brief,
        budgetKes: budget ? Math.round(Number(budget) * 100) : undefined,
      });
      setResult(response);
      setTasks(response.tasks.map((task) => ({ ...task, include: true })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not analyse the project.');
    } finally {
      setBusy(false);
    }
  }

  function updateTask(index: number, patch: Partial<ProposedTask>) {
    setTasks((prev) => prev.map((task, i) => (i === index ? { ...task, ...patch } : task)));
  }

  const included = tasks.filter((task) => task.include);
  const commitment = included.reduce((acc, task) => acc + task.suggestedBudgetMinor * task.workersNeeded, 0);
  const canFund = commitment > 0 && commitment <= availableBalance;

  async function approve(publish: boolean) {
    if (!result) return;
    setPublishing(true);
    setError(null);
    try {
      await api.post(`/api/employer/projects/${result.projectId}/approve`, {
        tasks: tasks.map((task) => ({
          title: task.title,
          description: task.description,
          expectedOutput: task.expectedOutput,
          category: task.category,
          qualityRequirements: task.qualityRequirements || undefined,
          budgetMinor: task.suggestedBudgetMinor,
          workersNeeded: task.workersNeeded,
          estimatedHours: task.estimatedHours,
          requiredSkills: task.requiredSkills,
          include: task.include,
        })),
        publish,
      });
      router.push('/employer/tasks');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not approve the project.');
      setPublishing(false);
    }
  }

  if (!result) {
    return (
      <Card>
        <form onSubmit={decompose} className="space-y-4">
          <Field
            label="What do you need done?"
            htmlFor="brief"
            hint="Write it however you would explain it to a colleague. No need to structure it."
            required
          >
            <textarea
              id="brief"
              className="textarea"
              rows={6}
              required
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              maxLength={8000}
              placeholder="e.g. I run a small restaurant in Westlands. I need someone to handle our Instagram and Facebook — posting regularly, replying to messages, and telling me what is actually working."
            />
          </Field>

          <div>
            <p className="mb-2 text-sm text-muted">Or start from an example:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="rounded-full border px-3 py-1.5 text-left text-xs" onClick={() => setBrief(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>

          <Field label="Your budget (KES)" htmlFor="budget" hint="Optional. If given, we split it across tasks by effort rather than proposing a larger number.">
            <input id="budget" type="number" inputMode="numeric" min={0} step={1000} className="input" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <button type="submit" className="btn btn-primary w-full" disabled={busy || brief.trim().length < 20}>
            {busy ? 'Working out the tasks…' : 'Break this into tasks'}
          </button>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Alert tone="info" title={result.projectTitle}>
        {result.interpretation}
      </Alert>

      {result.clarifyingQuestions.length > 0 ? (
        <Card>
          <h2 className="font-semibold">Worth deciding before you publish</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
            {result.clarifyingQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div>
        <SectionHeading title={`Proposed tasks (${included.length} of ${tasks.length} selected)`} />
        <ul className="space-y-3">
          {tasks.map((task, index) => (
            <li key={index}>
              <Card className={task.include ? '' : 'opacity-60'}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5 h-4 w-4 shrink-0"
                    checked={task.include}
                    onChange={(e) => updateTask(index, { include: e.target.checked })}
                    aria-label={`Include ${task.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <input
                      className="input font-semibold"
                      value={task.title}
                      onChange={(e) => updateTask(index, { title: e.target.value })}
                      aria-label="Task title"
                    />

                    <textarea
                      className="textarea mt-2 text-sm"
                      rows={3}
                      value={task.description}
                      onChange={(e) => updateTask(index, { description: e.target.value })}
                      aria-label="Task description"
                    />

                    <p className="mt-2 text-sm text-secondary">
                      <span className="font-medium">Done when: </span>
                      {task.expectedOutput}
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="label text-xs" htmlFor={`budget-${index}`}>
                          Budget per worker (KES)
                        </label>
                        <input
                          id={`budget-${index}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          className="input"
                          value={task.suggestedBudgetMinor / 100}
                          onChange={(e) => updateTask(index, { suggestedBudgetMinor: Math.round((Number(e.target.value) || 0) * 100) })}
                        />
                      </div>
                      <div>
                        <label className="label text-xs" htmlFor={`workers-${index}`}>
                          Workers
                        </label>
                        <input
                          id={`workers-${index}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={50}
                          className="input"
                          value={task.workersNeeded}
                          onChange={(e) => updateTask(index, { workersNeeded: Number(e.target.value) || 1 })}
                        />
                      </div>
                      <div>
                        <p className="label text-xs">Estimated effort</p>
                        <p className="pt-2 text-sm tabular-nums">{task.estimatedHours} hours</p>
                      </div>
                    </div>

                    {task.requiredSkills.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {task.requiredSkills.map((slug) => (
                          <span key={slug} className="badge border surface-sunken">
                            {slug.replace(/-/g, ' ')}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      {result.assumptions.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold">Assumptions we made</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
            {result.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Alert tone={canFund ? 'info' : 'warning'} title={canFund ? 'Total commitment' : 'Not enough balance to publish'}>
        Publishing all selected tasks commits {formatKes(commitment)} to escrow. Your available balance
        is {formatKes(availableBalance)}.
        {!canFund ? (
          <>
            {' '}
            <Link href="/employer/billing" className="font-semibold underline">
              Top up
            </Link>{' '}
            or save as drafts for now.
          </>
        ) : null}
      </Alert>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className="btn btn-primary flex-1" disabled={publishing || !canFund || included.length === 0} onClick={() => approve(true)}>
          {publishing ? 'Publishing…' : `Approve and publish ${included.length} task${included.length === 1 ? '' : 's'}`}
        </button>
        <button type="button" className="btn btn-secondary" disabled={publishing || included.length === 0} onClick={() => approve(false)}>
          Save as drafts
        </button>
      </div>

      <p className="text-xs text-muted">{result.notice}</p>
    </div>
  );
}
