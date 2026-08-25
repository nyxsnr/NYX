import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  const role = params.role === 'employer' ? 'EMPLOYER' : 'WORKER';

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">
        {role === 'WORKER' ? 'Find work' : 'Hire talent'}
      </h1>
      <p className="mt-1 text-sm text-secondary">
        {role === 'WORKER'
          ? 'Create your account. It is free, and there is never a fee to apply for work.'
          : 'Create an employer account to post jobs and tasks.'}
      </p>

      <SignupForm initialRole={role} />

      <p className="mt-6 text-sm text-secondary">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-jade-600 hover:underline dark:text-jade-300">
          Sign in
        </Link>
      </p>
    </div>
  );
}
