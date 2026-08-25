'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, EmptyState, EvidenceBadge, Field } from '@/components/ui';

interface Item {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  externalUrl: string | null;
  completedOn: string | null;
  evidenceLevel: 'SELF_REPORTED' | 'AI_INFERRED' | 'SIMULATION_VERIFIED' | 'EMPLOYER_VERIFIED';
  skills: string[];
}

const KINDS = [
  ['TEXT', 'Written description'],
  ['WEBSITE', 'Website'],
  ['GITHUB', 'Code repository'],
  ['DOCUMENT', 'Document'],
  ['IMAGE', 'Image'],
  ['VIDEO', 'Video'],
] as const;

export function PortfolioManager({
  items,
  availableSkills,
}: {
  items: Item[];
  availableSkills: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(items.length === 0);
  const [form, setForm] = useState({ title: '', description: '', kind: 'TEXT', externalUrl: '', completedOn: '' });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/worker/portfolio', {
        title: form.title,
        description: form.description || undefined,
        kind: form.kind,
        externalUrl: form.externalUrl || undefined,
        completedOn: form.completedOn || undefined,
        skills: selectedSkills,
      });
      setForm({ title: '', description: '', kind: 'TEXT', externalUrl: '', completedOn: '' });
      setSelectedSkills([]);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that item.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/api/worker/portfolio/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that item.');
    }
  }

  return (
    <div className="space-y-6">
      {items.length === 0 && !adding ? (
        <EmptyState
          icon="🗂"
          title="Your portfolio is empty."
          description="Add two pieces of real work. Describe what you did and what changed as a result — that is what an employer is looking for."
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{item.title}</h2>
                  <EvidenceBadge level={item.evidenceLevel} />
                </div>
                {item.description ? <p className="mt-2 flex-1 text-sm text-secondary">{item.description}</p> : <div className="flex-1" />}
                {item.externalUrl ? (
                  <a
                    href={item.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-2 truncate text-sm font-medium text-jade-600 hover:underline dark:text-jade-300"
                  >
                    {item.externalUrl}
                  </a>
                ) : null}
                {item.skills.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.skills.map((slug) => (
                      <span key={slug} className="badge border surface-sunken">
                        {slug.replace(/-/g, ' ')}
                      </span>
                    ))}
                  </div>
                ) : null}
                <button type="button" className="btn btn-ghost mt-3 self-start px-2 text-sm" onClick={() => remove(item.id)}>
                  Remove
                </button>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {adding ? (
        <Card>
          <h2 className="text-lg font-semibold">Add work to your portfolio</h2>
          <form onSubmit={add} className="mt-4 space-y-4">
            <Field label="Title" htmlFor="title" required>
              <input id="title" className="input" required maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>

            <Field
              label="What did you do?"
              htmlFor="description"
              hint="Say what the situation was, what you did, and what resulted. Numbers make it credible."
            >
              <textarea id="description" className="textarea" rows={5} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="kind">
                <select id="kind" className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {KINDS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="When" htmlFor="completedOn">
                <input id="completedOn" type="date" className="input" value={form.completedOn} onChange={(e) => setForm({ ...form, completedOn: e.target.value })} />
              </Field>
            </div>

            <Field label="Link" htmlFor="externalUrl" hint="Optional. A website, repository or shared document.">
              <input id="externalUrl" type="url" className="input" placeholder="https://" value={form.externalUrl} onChange={(e) => setForm({ ...form, externalUrl: e.target.value })} />
            </Field>

            <fieldset>
              <legend className="label">Skills this demonstrates</legend>
              <div className="max-h-40 overflow-y-auto rounded-xl border p-2">
                <div className="flex flex-wrap gap-1.5">
                  {availableSkills.map((skill) => (
                    <button
                      key={skill.slug}
                      type="button"
                      aria-pressed={selectedSkills.includes(skill.slug)}
                      onClick={() =>
                        setSelectedSkills((prev) =>
                          prev.includes(skill.slug) ? prev.filter((s) => s !== skill.slug) : [...prev, skill.slug],
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        selectedSkills.includes(skill.slug) ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
                      }`}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>

            <div className="flex gap-3">
              <button type="submit" className="btn btn-primary" disabled={busy || form.title.trim().length === 0}>
                {busy ? 'Adding…' : 'Add to portfolio'}
              </button>
              {items.length > 0 ? (
                <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Add work
        </button>
      )}
    </div>
  );
}
