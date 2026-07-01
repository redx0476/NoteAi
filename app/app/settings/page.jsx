'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth, MODELS, preferredModel, setPreferredModel, getTheme, applyTheme } from '@/lib/client/api';
import Avatar from '@/components/Avatar';
import { useToast } from '@/components/Toast';
import { IconLogout } from '@/components/Icons';

export default function Settings() {
  const [user, setUser] = useState(auth.user() || {});
  const [model, setModel] = useState(preferredModel());
  const [theme, setTheme] = useState(getTheme());
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    api('/api/auth/me')
      .then((res) => setUser(res.user || {}))
      .catch(() => {});
  }, []);

  function chooseModel(id) {
    setModel(id);
    setPreferredModel(id);
    toast('Default model updated');
  }

  function logout() {
    auth.clear();
    router.push('/login');
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="h-16 border-b border-slate-200 bg-white flex items-center px-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="font-bold text-lg">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <section className="card p-6">
          <h2 className="font-semibold mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            <Avatar name={user.name || user.email} size={56} />
            <div>
              <div className="font-semibold text-lg">{user.name || 'You'}</div>
              <div className="text-slate-500 text-sm">{user.email}</div>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">AI model</h2>
          <p className="text-sm text-slate-500 mt-1">
            Used for summaries, action items, and the “ask” chat. All free via OpenRouter.
          </p>
          <div className="mt-4 space-y-2">
            {MODELS.map((m) => (
              <label
                key={m.id}
                className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${
                  model === m.id ? 'border-brand bg-brand-soft' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  checked={model === m.id}
                  onChange={() => chooseModel(m.id)}
                  className="accent-brand"
                />
                <span className="text-sm font-medium">{m.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Appearance</h2>
          <p className="text-sm text-slate-500 mt-1">Choose how NOTEAI looks.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { id: 'light', label: '☀️ Light' },
              { id: 'dark', label: '🌙 Dark' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  applyTheme(t.id);
                  setTheme(t.id);
                }}
                className={`rounded-xl border p-4 text-sm font-semibold transition ${
                  theme === t.id
                    ? 'border-brand bg-brand-soft text-brand dark:bg-brand/15'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold mb-1">Account</h2>
          <p className="text-sm text-slate-500 mb-4">Sign out of this device.</p>
          <button onClick={logout} className="btn-outline text-red-600 border-red-200 hover:bg-red-50">
            <IconLogout width={16} height={16} /> Sign out
          </button>
        </section>
      </div>
    </div>
  );
}
