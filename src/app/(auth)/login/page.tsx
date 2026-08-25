import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-secondary">Welcome back.</p>
      {/* LoginForm reads `next` from the query string. Suspense keeps the rest
          of the page statically prerenderable instead of forcing the whole
          route to render dynamically. */}
      <Suspense fallback={<div className="mt-6 h-64" aria-hidden="true" />}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-sm text-secondary">
        New to KaziOS?{' '}
        <Link href="/signup?role=worker" className="font-semibold text-jade-600 hover:underline dark:text-jade-300">
          Create an account
        </Link>
      </p>
    </div>
  );
}
