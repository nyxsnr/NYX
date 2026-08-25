'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api.post('/api/auth/logout');
    } finally {
      // Navigate regardless: a failed request must not trap someone signed in.
      router.push('/');
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className={compact ? 'btn btn-ghost px-3 text-sm' : 'btn btn-ghost mt-2 w-full justify-start'}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
