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
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full dark:border-slate-800 dark:bg-slate-900">
      <div className="px-5 h-16 flex items-center">
        <Logo size={30} />
      </div>

      <button
        onClick={() => router.push('/app/settings')}
        className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
      >
        <Avatar name={user.name || user.email} size={34} />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{user.name || 'You'}</div>
          <div className="text-xs text-slate-400 truncate">{user.email}</div>
        </div>
      </button>

      <div className="px-3">
        <button onClick={onRecord} className="btn-primary w-full mb-3">
          <IconMic width={16} height={16} /> Record / New
        </button>
      </div>

      <nav className="px-3 space-y-0.5">
        {nav.map(({ to, label, Icon, end }) => (
          <Link
            key={to}
            href={to}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive(to, end)
                ? 'bg-brand-soft text-brand dark:bg-brand/15'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Icon width={18} height={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto p-4 space-y-3">
        <button
          onClick={() => setTheme(toggleTheme())}
          className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span>{theme === 'dark' ? '🌙 Dark' : '☀️ Light'} mode</span>
          <span className="text-xs text-slate-400">toggle</span>
        </button>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 dark:bg-slate-800/60 dark:border-slate-700">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Live streaming notes</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Start a live meeting to get word-by-word transcription.
          </div>
        </div>
      </div>
    </aside>
  );
}
