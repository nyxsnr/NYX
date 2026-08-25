'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Field } from '@/components/ui';

interface LoginResponse {
  role: 'WORKER' | 'EMPLOYER' | 'ADMIN';
  homePath: string;
  emailVerified: boolean;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.post<LoginResponse>('/api/auth/login', { email, password });
      // Honour a `next` parameter only when it is a same-site path, so the
      // sign-in page cannot be used as an open redirect.
      const next = params.get('next');
      const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : result.homePath;
      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'INTERNAL_ERROR', 'Something went wrong.'));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      {error && Object.keys(error.fields).length === 0 ? (
        <Alert tone="danger">{error.message}</Alert>
      ) : null}

      <Field label="Email address" htmlFor="email" error={error?.fields.email} required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" htmlFor="password" error={error?.fields.password} required>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
