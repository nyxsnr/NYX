'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';

/**
 * Worker onboarding.
 *
 * Five short steps rather than one long form: each screen fits on a phone
 * without scrolling much, and every step saves as you go, so a dropped
 * connection never costs someone their answers.
 *
 * "I don't know what I can do" is a first-class answer, not an edge case.
 */
interface Initial {
  regionId: string | null;
  town: string | null;
  ageBracket: string | null;
  educationLevel: string | null;
  yearsExperience: number;
  employmentStatus: string | null;
  languages: string[];
  hasSmartphone: boolean;
  hasLaptop: boolean;
  internetAccess: string;
  desiredIncomeMin: number | null;
  preferredWorkTypes: string[];
  workArrangement: string;
  openToDiscovery: boolean;
}

const STEPS = ['Where you are', 'Your background', 'What you have', 'What you want', 'Your skills'] as const;

const EDUCATION = [
  ['NONE', 'No formal schooling'],
  ['PRIMARY', 'Primary'],
  ['SECONDARY', 'Secondary / KCSE'],
  ['CERTIFICATE', 'Certificate'],
  ['DIPLOMA', 'Diploma'],
  ['BACHELORS', "Bachelor's degree"],
  ['MASTERS', "Master's degree"],
  ['DOCTORATE', 'Doctorate'],
] as const;

const EMPLOYMENT = [
  ['UNEMPLOYED', 'Not working right now'],
  ['UNDEREMPLOYED', 'Working, but not enough'],
  ['CASUAL_WORKER', 'Casual / day work'],
  ['SELF_EMPLOYED', 'Self-employed'],
  ['EMPLOYED_PART_TIME', 'Employed part-time'],
  ['EMPLOYED_FULL_TIME', 'Employed full-time'],
  ['STUDENT', 'Student'],
] as const;

const WORK_TYPES = [
  ['FULL_TIME', 'Full-time job'],
  ['PART_TIME', 'Part-time job'],
  ['CONTRACT', 'Contract'],
  ['GIG', 'Paid tasks'],
  ['CASUAL', 'Casual work'],
  ['INTERNSHIP', 'Internship'],
  ['ATTACHMENT', 'Attachment'],
] as const;

const LANGUAGES = [
  ['en', 'English'],
  ['sw', 'Kiswahili'],
  ['so', 'Somali'],
  ['ki', 'Kikuyu'],
  ['luo', 'Dholuo'],
  ['kam', 'Kamba'],
  ['guz', 'Kisii'],
  ['mer', 'Meru'],
] as const;

export function OnboardingWizard({
  regions,
  skills,
  initial,
}: {
  regions: Array<{ id: string; name: string }>;
  skills: Array<{ slug: string; name: string; category: string }>;
  initial: Initial;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [form, setForm] = useState(initial);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillFilter, setSkillFilter] = useState('');

  const set = <K extends keyof Initial>(key: K, value: Initial[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleInArray = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const filteredSkills = useMemo(() => {
    const needle = skillFilter.trim().toLowerCase();
    const matching = needle
      ? skills.filter((s) => s.name.toLowerCase().includes(needle) || s.category.toLowerCase().includes(needle))
      : skills;
    return matching.slice(0, 60);
  }, [skills, skillFilter]);

  async function saveStep(nextStep: number) {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/worker/profile', {
        regionId: form.regionId ?? undefined,
        town: form.town ?? undefined,
        ageBracket: form.ageBracket ?? undefined,
        educationLevel: form.educationLevel ?? undefined,
        yearsExperience: form.yearsExperience,
        employmentStatus: form.employmentStatus ?? undefined,
        languages: form.languages,
        hasSmartphone: form.hasSmartphone,
        hasLaptop: form.hasLaptop,
        internetAccess: form.internetAccess,
        desiredIncomeMin: form.desiredIncomeMin ?? undefined,
        preferredWorkTypes: form.preferredWorkTypes,
        workArrangement: form.workArrangement,
        openToDiscovery: form.openToDiscovery,
        onboardingStep: (['BASICS', 'BACKGROUND', 'PREFERENCES', 'SKILLS', 'CV'] as const)[nextStep] ?? 'SKILLS',
      });
      setStep(nextStep);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Could not save.'));
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      if (selectedSkills.length > 0) {
        await api.post('/api/worker/skills', {
          skills: selectedSkills.map((slug) => ({ slug, level: 'INTERMEDIATE' })),
        });
      }
      await api.patch('/api/worker/profile', { onboardingStep: 'DONE' });
      // The CV step is where extraction happens, so that is the natural
      // next stop rather than dropping someone on an empty dashboard.
      router.push('/worker/cv');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Could not save.'));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <p className="text-sm font-semibold text-jade-600 dark:text-jade-300">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{STEPS[step]}</h1>
        <div className="mt-3 flex gap-1" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((label, index) => (
            <span key={label} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-jade-600' : 'surface-sunken'}`} />
          ))}
        </div>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error.message}</Alert>
        </div>
      ) : null}

      <Card>
        {step === 0 ? (
          <div className="space-y-4">
            <Field label="Which county are you in?" htmlFor="region" required>
              <select id="region" className="select" value={form.regionId ?? ''} onChange={(e) => set('regionId', e.target.value || null)}>
                <option value="">Select your county</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Town or area" htmlFor="town" hint="Optional. Only shown to employers if you choose to share it.">
              <input id="town" className="input" value={form.town ?? ''} onChange={(e) => set('town', e.target.value || null)} />
            </Field>

            <Field label="Age group" htmlFor="age" hint="Used for anonymous statistics only. Never shown to employers, and never used in matching.">
              <select id="age" className="select" value={form.ageBracket ?? ''} onChange={(e) => set('ageBracket', e.target.value || null)}>
                <option value="">Prefer not to say</option>
                {['18-24', '25-34', '35-44', '45-54', '55+'].map((bracket) => (
                  <option key={bracket} value={bracket}>
                    {bracket}
                  </option>
                ))}
              </select>
            </Field>

            <fieldset>
              <legend className="label">Languages you can work in</legend>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={form.languages.includes(code)}
                    onClick={() => set('languages', toggleInArray(form.languages, code))}
                    className={`tap rounded-full border px-4 py-2 text-sm font-medium ${
                      form.languages.includes(code) ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <Field label="Highest level of education" htmlFor="education">
              <select id="education" className="select" value={form.educationLevel ?? ''} onChange={(e) => set('educationLevel', e.target.value || null)}>
                <option value="">Select</option>
                {EDUCATION.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Years of work experience"
              htmlFor="years"
              hint="Count everything: formal jobs, family business, casual work, volunteering."
            >
              <input
                id="years"
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                className="input"
                value={form.yearsExperience}
                onChange={(e) => set('yearsExperience', Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>

            <Field label="What is your situation right now?" htmlFor="employment">
              <select id="employment" className="select" value={form.employmentStatus ?? ''} onChange={(e) => set('employmentStatus', e.target.value || null)}>
                <option value="">Select</option>
                {EMPLOYMENT.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            {/* The question nobody else asks. */}
            <label className="flex items-start gap-3 rounded-xl border border-jade-300 bg-jade-50 p-4 dark:border-jade-800 dark:bg-jade-950">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={form.openToDiscovery}
                onChange={(e) => set('openToDiscovery', e.target.checked)}
              />
              <span className="text-sm">
                <span className="block font-semibold">I don&rsquo;t really know what work I can do.</span>
                <span className="mt-0.5 block text-secondary">
                  Tick this and we will focus on helping you find out, starting from what you have
                  already done — including work you were never paid for.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              This decides which work is realistic for you. Being honest here means we stop showing you
              work you cannot actually do.
            </p>

            {(
              [
                ['hasSmartphone', 'I have a smartphone'],
                ['hasLaptop', 'I have a laptop or computer'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-xl border p-4">
                <input type="checkbox" className="h-4 w-4" checked={form[key]} onChange={(e) => set(key, e.target.checked)} />
                <span className="font-medium">{label}</span>
              </label>
            ))}

            <Field label="Internet access" htmlFor="internet">
              <select id="internet" className="select" value={form.internetAccess} onChange={(e) => set('internetAccess', e.target.value)}>
                <option value="BROADBAND">Home or office wifi</option>
                <option value="MOBILE_DATA">Mobile data</option>
                <option value="OCCASIONAL">Occasional access only</option>
                <option value="NONE">No reliable access</option>
              </select>
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <fieldset>
              <legend className="label">What kind of work are you looking for?</legend>
              <div className="flex flex-wrap gap-2">
                {WORK_TYPES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={form.preferredWorkTypes.includes(value)}
                    onClick={() => set('preferredWorkTypes', toggleInArray(form.preferredWorkTypes, value))}
                    className={`tap rounded-full border px-4 py-2 text-sm font-medium ${
                      form.preferredWorkTypes.includes(value) ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <Field label="Where would you like to work?" htmlFor="arrangement">
              <select id="arrangement" className="select" value={form.workArrangement} onChange={(e) => set('workArrangement', e.target.value)}>
                <option value="ANY">Anywhere — I am flexible</option>
                <option value="REMOTE">Remote only</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">On-site</option>
              </select>
            </Field>

            <Field
              label="What do you hope to earn per month?"
              htmlFor="income"
              hint="A rough figure in KES. This helps us avoid showing you work that pays far below what you need."
            >
              <input
                id="income"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                className="input"
                placeholder="e.g. 30000"
                value={form.desiredIncomeMin !== null ? form.desiredIncomeMin / 100 : ''}
                onChange={(e) => set('desiredIncomeMin', e.target.value ? Math.round(Number(e.target.value) * 100) : null)}
              />
            </Field>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Pick anything you can already do. These start as <strong>self-reported</strong> — a work
              simulation later turns the important ones into proven evidence.
            </p>

            <Field label="Search skills" htmlFor="skill-filter">
              <input
                id="skill-filter"
                className="input"
                placeholder="e.g. Excel, customer support, design"
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
              />
            </Field>

            <div className="max-h-80 overflow-y-auto rounded-xl border p-2">
              <div className="flex flex-wrap gap-2">
                {filteredSkills.map((skill) => (
                  <button
                    key={skill.slug}
                    type="button"
                    aria-pressed={selectedSkills.includes(skill.slug)}
                    onClick={() => setSelectedSkills((prev) => toggleInArray(prev, skill.slug))}
                    className={`tap rounded-full border px-3 py-1.5 text-sm ${
                      selectedSkills.includes(skill.slug) ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
                    }`}
                  >
                    {skill.name}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-sm text-muted">
              {selectedSkills.length} selected. If you are not sure, pick nothing — the next step reads
              your CV and works them out for you.
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          {step > 0 ? (
            <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={saving}>
              Back
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={saving}
            onClick={() => (step === STEPS.length - 1 ? finish() : saveStep(step + 1))}
          >
            {saving ? 'Saving…' : step === STEPS.length - 1 ? 'Finish and add my CV' : 'Continue'}
          </button>
        </div>
      </Card>
    </div>
  );
}
