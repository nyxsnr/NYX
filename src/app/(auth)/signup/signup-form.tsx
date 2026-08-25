'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Field } from '@/components/ui';

interface SignupResponse {
  role: 'WORKER' | 'EMPLOYER';
  redirectTo: string;
}

export function SignupForm({ initialRole }: { initialRole: 'WORKER' | 'EMPLOYER' }) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [values, setValues] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    companyName: '',
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.post<SignupResponse>('/api/auth/signup', {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
        role,
        companyName: role === 'EMPLOYER' ? values.companyName || undefined : undefined,
        acceptedTerms,
      });
      router.push(result.redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Something went wrong.'));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      {error && Object.keys(error.fields).length === 0 ? <Alert tone="danger">{error.message}</Alert> : null}

      {/* Role is chosen explicitly. The MVP keeps one role per account so the
          experience stays unambiguous. */}
      <fieldset>
        <legend className="label">I want to</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['WORKER', 'Find work'],
              ['EMPLOYER', 'Hire talent'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              aria-pressed={role === value}
              className={`tap rounded-xl border px-3 py-2 text-sm font-semibold ${
                role === value ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Full name" htmlFor="fullName" error={error?.fields.fullName} required>
        <input id="fullName" className="input" autoComplete="name" required value={values.fullName} onChange={set('fullName')} />
      </Field>

      {role === 'EMPLOYER' ? (
        <Field label="Company name" htmlFor="companyName" error={error?.fields.companyName} hint="You can change this later.">
          <input id="companyName" className="input" autoComplete="organization" value={values.companyName} onChange={set('companyName')} />
        </Field>
      ) : null}

      <Field label="Email address" htmlFor="email" error={error?.fields.email} required>
        <input id="email" type="email" inputMode="email" className="input" autoComplete="email" required value={values.email} onChange={set('email')} />
      </Field>

      <Field
        label="Phone number"
        htmlFor="phone"
        error={error?.fields.phone}
        hint="Optional now, required before you can be paid. e.g. 0712 345 678"
      >
        <input id="phone" type="tel" inputMode="tel" className="input" autoComplete="tel" value={values.phone} onChange={set('phone')} placeholder="0712 345 678" />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={error?.fields.password}
        hint="At least 10 characters. A short phrase you will remember is stronger than a short jumble."
        required
      >
        <input id="password" type="password" className="input" autoComplete="new-password" required value={values.password} onChange={set('password')} />
      </Field>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          required
        />
        <span className="text-secondary">
          I agree to the KaziOS terms and privacy policy. I understand KaziOS does not guarantee
          employment or income.
        </span>
      </label>
      {error?.fields.acceptedTerms ? <p className="field-error">{error.fields.acceptedTerms[0]}</p> : null}

      <button type="submit" className="btn btn-primary w-full" disabled={submitting || !acceptedTerms}>
        {submitting ? 'Creating your account…' : 'Create account'}
      </button>

      <p className="text-center text-xs text-muted">
        By continuing you agree that KaziOS will never ask you to pay to apply for work.{' '}
        <Link href="/#faq" className="underline">
          Read more
        </Link>
      </p>
    </form>
  );
}
