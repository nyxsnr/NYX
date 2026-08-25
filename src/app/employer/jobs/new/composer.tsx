'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field, SectionHeading } from '@/components/ui';

interface Draft {
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  suggestedSkills: string[];
  suggestedApplicationQuestions: string[];
  warnings: string[];
  notice: string;
}

const EMPLOYMENT_TYPES = [
  ['FULL_TIME', 'Full-time'],
  ['PART_TIME', 'Part-time'],
  ['CONTRACT', 'Contract'],
  ['INTERNSHIP', 'Internship'],
  ['ATTACHMENT', 'Attachment'],
  ['CASUAL', 'Casual'],
] as const;

export function JobComposer({
  regions,
  skills,
}: {
  regions: Array<{ id: string; name: string }>;
  skills: Array<{ slug: string; name: string; category: string }>;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [skillFilter, setSkillFilter] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    responsibilities: '',
    category: '',
    regionId: '',
    town: '',
    workArrangement: 'ONSITE',
    employmentType: 'FULL_TIME',
    salaryMin: '',
    salaryMax: '',
    salaryPeriod: 'MONTHLY',
    salaryIsPublic: true,
    minYearsExperience: 0,
    openings: 1,
    deadline: '',
  });

  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [aiAssisted, setAiAssisted] = useState(false);

  const set = (key: keyof typeof form, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const filteredSkills = skillFilter
    ? skills.filter((s) => s.name.toLowerCase().includes(skillFilter.toLowerCase())).slice(0, 40)
    : skills.slice(0, 40);

  async function generate() {
    setDrafting(true);
    setError(null);
    try {
      const result = await api.post<Draft>('/api/employer/ai/job-description', {
        title: form.title || 'Team member',
        notes,
        employmentType: form.employmentType,
        workArrangement: form.workArrangement,
        salaryHint: form.salaryMin ? `${form.salaryMin}-${form.salaryMax}` : undefined,
        location: form.town || undefined,
      });

      setDraft(result);
      setAiAssisted(true);
      setForm((prev) => ({
        ...prev,
        title: result.title,
        description: result.summary,
        responsibilities: result.responsibilities.map((line) => `• ${line}`).join('\n'),
      }));
      setRequiredSkills(result.suggestedSkills.slice(0, 6));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Could not draft the job.'));
    } finally {
      setDrafting(false);
    }
  }

  async function submit(publish: boolean, event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ id: string; status: string; moderation: { reason: string } | null }>(
        '/api/employer/jobs',
        {
          title: form.title,
          description: form.description,
          responsibilities: form.responsibilities || undefined,
          category: form.category || 'General',
          regionId: form.regionId || undefined,
          town: form.town || undefined,
          workArrangement: form.workArrangement,
          employmentType: form.employmentType,
          salaryMin: form.salaryMin ? Math.round(Number(form.salaryMin) * 100) : undefined,
          salaryMax: form.salaryMax ? Math.round(Number(form.salaryMax) * 100) : undefined,
          salaryPeriod: form.salaryPeriod,
          salaryIsPublic: form.salaryIsPublic,
          minYearsExperience: form.minYearsExperience,
          openings: form.openings,
          deadline: form.deadline || undefined,
          requiredSkills: requiredSkills.map((slug) => ({ slug })),
          applicationQuestions: (draft?.suggestedApplicationQuestions ?? []).slice(0, 3).map((prompt, index) => ({
            id: `q${index + 1}`,
            prompt,
            required: false,
          })),
          aiAssisted,
          publish,
        },
      );
      router.push(`/employer/jobs/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Could not save the job.'));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading title="Describe the role" />
        <Field
          label="Your notes"
          htmlFor="notes"
          hint="Write however you like — what the person will do, what you need, anything relevant. We turn it into a proper posting you can edit."
        >
          <textarea
            id="notes"
            className="textarea"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Need someone to handle customer enquiries on WhatsApp and email for our Nairobi shop. Must be good with people, reply fast, and keep records in a spreadsheet. Full-time, 35k a month."
          />
        </Field>
        <button type="button" className="btn btn-secondary mt-3" onClick={generate} disabled={drafting || notes.trim().length < 20}>
          {drafting ? 'Drafting…' : 'Draft the posting for me'}
        </button>
      </Card>

      {draft?.warnings && draft.warnings.length > 0 ? (
        <Alert tone="warning" title="Wording we left out">
          <ul className="list-inside list-disc">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {draft ? <Alert tone="info">{draft.notice}</Alert> : null}

      <Card>
        <SectionHeading title="The posting" />
        <form className="space-y-4">
          {error && Object.keys(error.fields).length === 0 ? <Alert tone="danger">{error.message}</Alert> : null}

          <Field label="Job title" htmlFor="title" error={error?.fields.title} required>
            <input id="title" className="input" required value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Field>

          <Field label="Description" htmlFor="description" error={error?.fields.description} required>
            <textarea id="description" className="textarea" rows={7} required value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>

          <Field label="Responsibilities" htmlFor="responsibilities">
            <textarea id="responsibilities" className="textarea" rows={6} value={form.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category" required>
              <input id="category" className="input" required placeholder="e.g. Customer Support" value={form.category} onChange={(e) => set('category', e.target.value)} />
            </Field>

            <Field label="Employment type" htmlFor="employmentType">
              <select id="employmentType" className="select" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
                {EMPLOYMENT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Work arrangement" htmlFor="workArrangement">
              <select id="workArrangement" className="select" value={form.workArrangement} onChange={(e) => set('workArrangement', e.target.value)}>
                <option value="ONSITE">On-site</option>
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Remote</option>
              </select>
            </Field>

            <Field label="County" htmlFor="regionId">
              <select id="regionId" className="select" value={form.regionId} onChange={(e) => set('regionId', e.target.value)}>
                <option value="">Select</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Town" htmlFor="town">
              <input id="town" className="input" value={form.town} onChange={(e) => set('town', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Salary from (KES)" htmlFor="salaryMin" hint="Postings with a range get more qualified applicants.">
              <input id="salaryMin" type="number" inputMode="numeric" min={0} className="input" value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} />
            </Field>

            <Field label="Salary to (KES)" htmlFor="salaryMax" error={error?.fields.salaryMax}>
              <input id="salaryMax" type="number" inputMode="numeric" min={0} className="input" value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} />
            </Field>

            <Field label="Per" htmlFor="salaryPeriod">
              <select id="salaryPeriod" className="select" value={form.salaryPeriod} onChange={(e) => set('salaryPeriod', e.target.value)}>
                <option value="MONTHLY">Month</option>
                <option value="DAILY">Day</option>
                <option value="HOURLY">Hour</option>
                <option value="ANNUAL">Year</option>
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-4 w-4" checked={form.salaryIsPublic} onChange={(e) => set('salaryIsPublic', e.target.checked)} />
            <span className="text-sm">Show the salary range publicly</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum years of experience" htmlFor="minYears">
              <input
                id="minYears"
                type="number"
                inputMode="numeric"
                min={0}
                max={40}
                className="input"
                value={form.minYearsExperience}
                onChange={(e) => set('minYearsExperience', Number(e.target.value) || 0)}
              />
            </Field>

            <Field label="Openings" htmlFor="openings">
              <input id="openings" type="number" inputMode="numeric" min={1} className="input" value={form.openings} onChange={(e) => set('openings', Number(e.target.value) || 1)} />
            </Field>

            <Field label="Closing date" htmlFor="deadline">
              <input id="deadline" type="date" className="input" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
            </Field>
          </div>

          <fieldset>
            <legend className="label">Skills required</legend>
            <input
              className="input mb-2"
              placeholder="Search skills"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              aria-label="Search skills"
            />
            <div className="max-h-44 overflow-y-auto rounded-xl border p-2">
              <div className="flex flex-wrap gap-1.5">
                {filteredSkills.map((skill) => (
                  <button
                    key={skill.slug}
                    type="button"
                    aria-pressed={requiredSkills.includes(skill.slug)}
                    onClick={() =>
                      setRequiredSkills((prev) =>
                        prev.includes(skill.slug) ? prev.filter((s) => s !== skill.slug) : [...prev, skill.slug],
                      )
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
            <p className="hint">
              These drive matching. Candidates who can evidence them rank higher, and applicants see
              exactly which ones they are missing.
            </p>
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" className="btn btn-primary flex-1" disabled={busy} onClick={(e) => submit(true, e)}>
              {busy ? 'Saving…' : 'Publish job'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={(e) => submit(false, e)}>
              Save as draft
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
