'use client';

import Link from 'next/link';
import Logo from '@/components/Logo';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'How it works', href: '/#how' },
      { label: 'Integrations', href: '/#integrations' },
    ],
  },
  {
    title: 'Use cases',
    links: [
      { label: 'Team meetings', href: '/features' },
      { label: 'Sales calls', href: '/features' },
      { label: 'Interviews', href: '/features' },
      { label: 'Lectures', href: '/features' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Log in', href: '/login' },
      { label: 'Start for free', href: '/login?mode=signup' },
      { label: 'Privacy', href: '/#' },
      { label: 'Terms', href: '/#' },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo size={32} />
            <p className="mt-4 max-w-xs text-sm text-slate-500 dark:text-slate-400">
              AI meeting notes that transcribe, summarize, and answer questions about every
              conversation — automatically.
            </p>
            <Link href="/login?mode=signup" className="btn-primary mt-5">
              Start for free
            </Link>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-ink dark:text-white">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-slate-500 transition hover:text-brand dark:text-slate-400 dark:hover:text-brand-light"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-400 sm:flex-row dark:border-slate-800">
          <span>© {new Date().getFullYear()} NOTEAI. All rights reserved.</span>
          <span>Built for better meetings.</span>
        </div>
      </div>
    </footer>
  );
}
