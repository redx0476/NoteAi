'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth } from '@/lib/client/api';
import Logo, { LogoMark } from '@/components/Logo';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (auth.token()) router.replace('/app');
  }, [router]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = mode === 'signup' ? form : { email: form.email, password: form.password };
      const data = await api(`/api/auth/${mode}`, body);
      auth.set(data.token, data.user);
      router.push('/app');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-brand to-[#7b5bff] text-white">
        <Logo size={34} showText={false} />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Your AI notetaker for every meeting.</h1>
          <p className="mt-4 text-white/80 max-w-md">
            Real-time transcription with speaker labels, instant summaries, action items, and searchable
            notes — for every conversation.
          </p>
          <div className="mt-8 space-y-3 text-white/90 text-sm">
            {['Live word-by-word captions', 'Auto summary + action items', 'Playback & highlights'].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <span className="grid place-items-center w-5 h-5 rounded-full bg-white/20">✓</span>
                {t}
              </div>
            ))}
          </div>
        </div>
        <div className="text-white/60 text-xs">© {new Date().getFullYear()} NOTEAI</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-6 flex justify-center">
            <LogoMark size={44} />
          </div>
          <h2 className="text-2xl font-bold text-center">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-center text-sm text-slate-500 mt-1">
            {mode === 'login' ? 'Log in to your notes' : 'Start taking AI notes — free'}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {['login', 'signup'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m ? 'bg-white shadow-sm text-ink' : 'text-slate-500'
                }`}
              >
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === 'signup' && (
              <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} />
            )}
            <input className="input" type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
            <input className="input" type="password" placeholder="Password" value={form.password} onChange={set('password')} required />
            {err && <p className="text-sm text-red-500">{err}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
