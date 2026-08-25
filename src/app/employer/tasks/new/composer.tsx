'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';
import { formatKes } from '@/lib/i18n';

export function TaskComposer({
  regions,
  skills,
  availableBalance,
}: {
  regions: Array<{ id: string; name: string }>;
  skills: Array<{ slug: string; name: string }>;
  availableBalance: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    expectedOutput: '',
    qualityRequirements: '',
    budget: '',
    workersNeeded: 1,
    estimatedHours: '',
    deadline: '',
    requiresLocation: false,
    regionId: '',
    requiresLaptop: false,
  });
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [skillFilter, setSkillFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const set = (key: keyof typeof form, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const budgetMinor = form.budget ? Math.round(Number(form.budget) * 100) : 0;
  const commitment = budgetMinor * form.workersNeeded;
  const canFund = commitment > 0 && commitment <= availableBalance;

  const filtered = skillFilter
    ? skills.filter((s) => s.name.toLowerCase().includes(skillFilter.toLowerCase())).slice(0, 40)
    : skills.slice(0, 40);

  async function submit(publish: boolean, event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ id: string }>('/api/employer/tasks', {
        title: form.title,
        description: form.description,
        category: form.category || 'General',
        expectedOutput: form.expectedOutput,
        qualityRequirements: form.qualityRequirements || undefined,
        budgetAmount: budgetMinor,
        workersNeeded: form.workersNeeded,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
        deadline: form.deadline || undefined,
        requiresLocation: form.requiresLocation,
        regionId: form.requiresLocation && form.regionId ? form.regionId : undefined,
        requiresLaptop: form.requiresLaptop,
        requiredSkills,
        publish,
      });
      router.push(`/employer/tasks/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Could not create the task.'));
      setBusy(false);
    }
  }

  return (
    <Card>
      <form className="space-y-4">
        {error && Object.keys(error.fields).length === 0 ? <Alert tone="danger">{error.message}</Alert> : null}

        <Field label="Task title" htmlFor="title" error={error?.fields.title} required>
          <input id="title" className="input" required placeholder="e.g. Clean 2,000 rows of customer data" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>

        <Field label="What needs doing" htmlFor="description" error={error?.fields.description} required>
          <textarea id="description" className="textarea" rows={6} required value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <Field
          label="What counts as done"
          htmlFor="expectedOutput"
          error={error?.fields.expectedOutput}
          hint="Be specific about the format and the standard. Vague briefs produce vague work and disputes."
          required
        >
          <textarea id="expectedOutput" className="textarea" rows={4} required value={form.expectedOutput} onChange={(e) => set('expectedOutput', e.target.value)} />
        </Field>

        <Field label="Quality requirements" htmlFor="quality">
          <textarea id="quality" className="textarea" rows={3} value={form.qualityRequirements} onChange={(e) => set('qualityRequirements', e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="category" required>
            <input id="category" className="input" required placeholder="e.g. Data" value={form.category} onChange={(e) => set('category', e.target.value)} />
          </Field>

          <Field label="Budget per worker (KES)" htmlFor="budget" error={error?.fields.budgetAmount} required>
            <input id="budget" type="number" inputMode="numeric" min={1} className="input" required value={form.budget} onChange={(e) => set('budget', e.target.value)} />
          </Field>

          <Field label="Workers needed" htmlFor="workers">
            <input
              id="workers"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              className="input"
              value={form.workersNeeded}
              onChange={(e) => set('workersNeeded', Number(e.target.value) || 1)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estimated hours" htmlFor="hours" hint="Helps workers judge whether the pay is fair.">
            <input id="hours" type="number" inputMode="decimal" min={0.5} step={0.5} className="input" value={form.estimatedHours} onChange={(e) => set('estimatedHours', e.target.value)} />
          </Field>

          <Field label="Deadline" htmlFor="deadline">
            <input id="deadline" type="datetime-local" className="input" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">Requirements</legend>
          <label className="flex items-center gap-3 rounded-xl border p-3">
            <input type="checkbox" className="h-4 w-4" checked={form.requiresLaptop} onChange={(e) => set('requiresLaptop', e.target.checked)} />
            <span className="text-sm">This work needs a laptop or computer</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border p-3">
            <input type="checkbox" className="h-4 w-4" checked={form.requiresLocation} onChange={(e) => set('requiresLocation', e.target.checked)} />
            <span className="text-sm">The worker must be in a specific county</span>
          </label>
          {form.requiresLocation ? (
            <select className="select" value={form.regionId} onChange={(e) => set('regionId', e.target.value)} aria-label="County">
              <option value="">Select a county</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="label">Skills required</legend>
          <input className="input mb-2" placeholder="Search skills" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} aria-label="Search skills" />
          <div className="max-h-44 overflow-y-auto rounded-xl border p-2">
            <div className="flex flex-wrap gap-1.5">
              {filtered.map((skill) => (
                <button
                  key={skill.slug}
                  type="button"
                  aria-pressed={requiredSkills.includes(skill.slug)}
                  onClick={() =>
                    setRequiredSkills((prev) => (prev.includes(skill.slug) ? prev.filter((s) => s !== skill.slug) : [...prev, skill.slug]))
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    requiredSkills.includes(skill.slug) ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
                  }`}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* Funding is checked before publishing so a worker is never invited to
            start work that cannot be paid for. */}
        {commitment > 0 ? (
          <Alert tone={canFund ? 'info' : 'warning'} title={canFund ? 'Escrow commitment' : 'Not enough balance'}>
            Publishing commits {formatKes(commitment)} to escrow ({formatKes(budgetMinor)} ×{' '}
            {form.workersNeeded} worker{form.workersNeeded === 1 ? '' : 's'}). Your available balance is{' '}
            {formatKes(availableBalance)}.
            {!canFund ? (
              <>
                {' '}
                <Link href="/employer/billing" className="font-semibold underline">
                  Top up your balance
                </Link>
              </>
            ) : null}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="btn btn-primary flex-1" disabled={busy || !canFund} onClick={(e) => submit(true, e)}>
            {busy ? 'Saving…' : 'Publish task'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={(e) => submit(false, e)}>
            Save as draft
          </button>
        </div>
      </form>
    </Card>
  );
}
