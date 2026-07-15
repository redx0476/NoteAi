'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { auth, getTheme, toggleTheme } from '@/lib/client/api';
import Logo from './Logo';
import Avatar from './Avatar';
import { IconHome, IconChat, IconExplore, IconPuzzle, IconSettings, IconMic } from './Icons';

const nav = [
  { to: '/app', label: 'Home', Icon: IconHome, end: true },
  { to: '/app/chat', label: 'AI Chat', Icon: IconChat },
  { to: '/app/explore', label: 'Explore', Icon: IconExplore },
  { to: '/app/integrations', label: 'Integrations', Icon: IconPuzzle },
  { to: '/app/settings', label: 'Settings', Icon: IconSettings },
];

export default function Sidebar({ onRecord }) {
  const user = auth.user() || {};
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState(getTheme());

  const isActive = (to, end) => (end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));

  return (
    <aside className="w-64 shrink-0 border-r flex flex-col h-full" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="px-5 h-16 flex items-center">
        <Logo size={30} />
      </div>
      <div className="mx-5 rule-gold mb-3" />

      <button
        onClick={() => router.push('/app/settings')}
        className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-[var(--surface-2)]"
      >
        <Avatar name={user.name || user.email} size={34} />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{user.name || 'You'}</div>
          <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{user.email}</div>
        </div>
      </button>

      <div className="px-3">
        <button onClick={onRecord} className="btn-primary w-full mb-3">
          <IconMic width={16} height={16} /> Record / New
        </button>
      </div>

      <nav className="px-3 space-y-0.5">
        {nav.map(({ to, label, Icon, end }) => {
          const active = isActive(to, end);
          return (
            <Link
              key={to}
              href={to}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? 'text-[var(--accent-2)] dark:text-champagne' : 'hover:bg-[var(--surface-2)]'
              }`}
              style={active ? { background: 'var(--accent-wash)' } : { color: 'var(--muted)' }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: 'var(--accent)' }} />
              )}
              <Icon width={18} height={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4 space-y-3">
        <button
          onClick={() => setTheme(toggleTheme())}
          className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-[var(--surface-2)]"
          style={{ color: 'var(--muted)' }}
        >
          <span>{theme === 'dark' ? '🌙 Dark' : '☀️ Light'} mode</span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>toggle</span>
        </button>
        <div className="rounded-xl p-3.5 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-2)' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            Live streaming notes
          </div>
          <div className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
            Start a live meeting to get word-by-word transcription.
          </div>
        </div>
      </div>
    </aside>
  );
}
