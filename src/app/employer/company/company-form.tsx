'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';

interface Initial {
  name: string;
  description: string;
  industry: string;
  sizeBracket: string;
  website: string;
  regionId: string;
  town: string;
  jobTitle: string;
}

export function CompanyForm({
  regions,
  initial,
  redirectTo,
  submitLabel,
}: {
  regions: Array<{ id: string; name: string }>;
  initial: Initial;
  redirectTo: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof Initial) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch('/api/employer/company', {
        name: form.name || undefined,
        description: form.description || undefined,
        industry: form.industry || undefined,
        sizeBracket: form.sizeBracket || undefined,
        website: form.website || undefined,
        regionId: form.regionId || undefined,
        town: form.town || undefined,
        jobTitle: form.jobTitle || undefined,
      });
      setSaved(true);
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        {error && Object.keys(error.fields).length === 0 ? <Alert tone="danger">{error.message}</Alert> : null}
        {saved ? <Alert tone="success">Saved.</Alert> : null}

        <Field label="Company name" htmlFor="name" error={error?.fields.name} required>
          <input id="name" className="input" required value={form.name} onChange={set('name')} />
        </Field>

        <Field label="Your role at the company" htmlFor="jobTitle" hint="e.g. Operations Manager">
          <input id="jobTitle" className="input" value={form.jobTitle} onChange={set('jobTitle')} />
        </Field>

        <Field label="What the company does" htmlFor="description" hint="Two or three sentences. Workers read this before applying.">
          <textarea id="description" className="textarea" rows={4} maxLength={3000} value={form.description} onChange={set('description')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry" htmlFor="industry">
            <input id="industry" className="input" value={form.industry} onChange={set('industry')} placeholder="e.g. Retail, Logistics" />
          </Field>

          <Field label="Company size" htmlFor="sizeBracket">
            <select id="sizeBracket" className="select" value={form.sizeBracket} onChange={set('sizeBracket')}>
              <option value="">Select</option>
              {['1-10', '11-50', '51-200', '201-500', '500+'].map((bracket) => (
                <option key={bracket} value={bracket}>
                  {bracket} people
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="County" htmlFor="regionId">
            <select id="regionId" className="select" value={form.regionId} onChange={set('regionId')}>
              <option value="">Select</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Town" htmlFor="town">
            <input id="town" className="input" value={form.town} onChange={set('town')} />
          </Field>
        </div>

        <Field label="Website" htmlFor="website" error={error?.fields.website}>
          <input id="website" type="url" className="input" placeholder="https://" value={form.website} onChange={set('website')} />
        </Field>

        <button type="submit" className="btn btn-primary w-full" disabled={busy || !form.name.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </form>
    </Card>
  );
}
