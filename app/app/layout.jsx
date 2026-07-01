'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/client/api';
import Sidebar from '@/components/Sidebar';
import RecordModal from '@/components/RecordModal';

// Authenticated app shell: sidebar + main content + the "Record" modal.
export default function AppLayout({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

  useEffect(() => {
    if (!auth.token()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) {
    return <div className="h-full grid place-items-center text-slate-400 text-sm">Loading…</div>;
  }

  return (
    <div className="flex h-full">
      <Sidebar onRecord={() => setRecOpen(true)} />
      <main className="flex-1 min-w-0 h-full overflow-hidden">{children}</main>
      <RecordModal open={recOpen} onClose={() => setRecOpen(false)} />
    </div>
  );
}
