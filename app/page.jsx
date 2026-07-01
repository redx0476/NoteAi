'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/client/api';

// Entry point — routes to the app or the login screen based on auth state.
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(auth.token() ? '/app' : '/login');
  }, [router]);
  return <div className="h-full grid place-items-center text-slate-400 text-sm">Loading…</div>;
}
