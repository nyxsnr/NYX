'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, EvidenceBadge, Field, SectionHeading } from '@/components/ui';

/** The subset of the profile this editor reads. */
interface Profile {
  headline: string | null;
  summary: string | null;
  regionId: string | null;
  town: string | null;
  isAvailable: boolean;
  hoursPerWeek: number | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  phone: string | null;
  privacy: {
    isSearchable: boolean;
    showPhone: boolean;
    showExactLocation: boolean;
    showEarnings: boolean;
  };
  skills: Array<{
    slug: string;
    name: string;
    level: string | null;
    evidenceLevel: 'SELF_REPORTED' | 'AI_INFERRED' | 'SIMULATION_VERIFIED' | 'EMPLOYER_VERIFIED';
    isVerified: boolean;
  }>;
}

export function ProfileEditor({
  profile,
  regions,
}: {
  profile: Profile;
  regions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    headline: profile.headline ?? '',
    summary: profile.summary ?? '',
    regionId: profile.regionId ?? '',
    town: profile.town ?? '',
    isAvailable: profile.isAvailable,
    hoursPerWeek: profile.hoursPerWeek ?? '',
    isSearchable: profile.privacy.isSearchable,
    showPhone: profile.privacy.showPhone,
    showExactLocation: profile.privacy.showExactLocation,
    showEarnings: profile.privacy.showEarnings,
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      await api.patch('/api/worker/profile', {
        headline: form.headline || undefined,
        summary: form.summary || undefined,
        regionId: form.regionId || undefined,
        town: form.town || undefined,
        isAvailable: form.isAvailable,
        hoursPerWeek: form.hoursPerWeek === '' ? undefined : Number(form.hoursPerWeek),
        isSearchable: form.isSearchable,
        showPhone: form.showPhone,
        showExactLocation: form.showExactLocation,
        showEarnings: form.showEarnings,
      });
      setStatus('saved');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
      setStatus('idle');
    }
  }

  const verified = profile.skills.filter((s) => s.isVerified);
  const unverified = profile.skills.filter((s) => !s.isVerified);

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading title="How you present" />
        <div className="space-y-4">
          <Field label="Headline" htmlFor="headline" hint="One line an employer reads first. e.g. 'Customer support agent with verified Excel and data cleaning'">
            <input id="headline" className="input" maxLength={140} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
          </Field>

          <Field label="About you" htmlFor="summary" hint="What you can do and what you are looking for. Two or three sentences is plenty.">
            <textarea id="summary" className="textarea" rows={5} maxLength={2000} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="County" htmlFor="region">
              <select id="region" className="select" value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })}>
                <option value="">Select</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Town or area" htmlFor="town">
              <input id="town" className="input" value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Availability" />
        <label className="flex items-center gap-3 rounded-xl border p-4">
          <input type="checkbox" className="h-4 w-4" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} />
          <span>
            <span className="block font-medium">I am available for work</span>
            <span className="block text-sm text-secondary">Turn this off to pause matching without losing your profile.</span>
          </span>
        </label>

        <div className="mt-4">
          <Field label="Hours per week you can work" htmlFor="hours">
            <input
              id="hours"
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              className="input"
              value={form.hoursPerWeek}
              onChange={(e) => setForm({ ...form, hoursPerWeek: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Your capabilities" />
        {verified.length > 0 ? (
          <>
            <h3 className="text-sm font-semibold">Proven</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {verified.map((skill) => (
                <li key={skill.slug} className="flex items-center gap-2 rounded-full border border-jade-300 px-3 py-1.5 text-sm dark:border-jade-800">
                  <span className="font-medium">{skill.name}</span>
                  <EvidenceBadge level={skill.evidenceLevel} />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {unverified.length > 0 ? (
          <>
            <h3 className="mt-4 text-sm font-semibold">Not yet proven</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {unverified.map((skill) => (
                <li key={skill.slug} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
                  <span>{skill.name}</span>
                  <EvidenceBadge level={skill.evidenceLevel} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-secondary">
              Unproven skills still make you discoverable, but they carry about a third of the weight of
              a verified one when employers search.
            </p>
          </>
        ) : null}

        {profile.skills.length === 0 ? (
          <p className="text-sm text-secondary">
            No skills yet. Upload your CV and we will extract them, or add them by hand from your
            dashboard.
          </p>
        ) : null}
      </Card>

      <Card>
        <SectionHeading title="Privacy" />
        <p className="mb-3 text-sm text-secondary">
          You decide what is shared. These settings default to private.
        </p>
        <div className="space-y-3">
          {(
            [
              ['isSearchable', 'Let employers find me in talent search', 'Turn off to remove yourself from employer searches entirely.'],
              ['showExactLocation', 'Show my town, not just my county', 'Some local employers filter on this.'],
              ['showPhone', 'Show my phone number to employers I have applied to', 'Only employers whose jobs you applied to can see it.'],
              ['showEarnings', 'Show my total earnings on my public profile', 'Some workers use this as proof of track record.'],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3 rounded-xl border p-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-secondary">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Verification" />
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between gap-3 rounded-lg surface-sunken p-3">
            <span>Email address</span>
            <span className={profile.emailVerified ? 'font-semibold text-jade-600 dark:text-jade-300' : 'text-muted'}>
              {profile.emailVerified ? 'Verified' : 'Not verified'}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 rounded-lg surface-sunken p-3">
            <span>Phone number{profile.phone ? ` (${profile.phone})` : ''}</span>
            <span className={profile.phoneVerified ? 'font-semibold text-jade-600 dark:text-jade-300' : 'text-muted'}>
              {profile.phoneVerified ? 'Verified' : 'Not verified'}
            </span>
          </li>
        </ul>
        <p className="mt-3 text-sm text-secondary">
          A verified phone number is required before you can withdraw earnings — it makes sure your
          money reaches you and not someone else.
        </p>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {status === 'saved' ? <Alert tone="success">Profile saved.</Alert> : null}

      <div className="sticky bottom-20 lg:bottom-4">
        <button type="button" className="btn btn-primary w-full" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}
