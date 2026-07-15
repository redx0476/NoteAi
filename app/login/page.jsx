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
    if (auth.token()) {
      router.replace('/app');
      return;
    }
    const qp = new URLSearchParams(window.location.search).get('mode');
    if (qp === 'signup' || qp === 'login') setMode(qp);
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
      {/* Brand panel — dark premium with a champagne signature */}
      <div
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-[#f0ebe1]"
        style={{
          background:
            'radial-gradient(120% 90% at 12% 8%, #211a10 0%, #14110c 42%, #0b0a08 100%)',
        }}
      >
        {/* ambient gold glow */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(230,200,120,0.20), transparent 70%)' }}
        />
        <Logo size={34} showText={false} />

        <div className="relative">
          <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-champagne">
            AI Meeting Notes
          </div>
          <h1 className="font-display text-[2.7rem] font-medium leading-[1.08] tracking-luxe">
            Every voice in the room,<br />
            <span className="italic text-champagne">captured with care.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#c9c0af]">
            Real-time transcription with speaker labels, instant summaries, action items, and
            searchable notes — for every conversation.
          </p>
          <div className="mt-9 space-y-3.5 text-sm text-[#d8d0bf]">
            {['Live word-by-word captions', 'Auto summary + action items', 'Playback & highlights'].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] text-[#1a1207]" style={{ background: '#e6c878' }}>
                  ✓
                </span>
                {t}
              </div>
            ))}
          </div>
          {/* signature: an engraved gold waveform */}
          <svg className="mt-10 h-8 w-64 opacity-70" viewBox="0 0 260 32" fill="none" aria-hidden>
            {Array.from({ length: 34 }).map((_, i) => {
              const h = 4 + Math.abs(Math.sin(i * 0.9)) * 22 * (0.4 + Math.abs(Math.sin(i * 0.35)));
              return <rect key={i} x={i * 7.6} y={(32 - h) / 2} width="2.4" height={h} rx="1.2" fill="#e6c878" opacity={0.35 + (i % 5) * 0.13} />;
            })}
          </svg>
        </div>

        <div className="relative text-xs text-[#8a8271]">© {new Date().getFullYear()} NOTEAI</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-6 flex justify-center">
            <LogoMark size={44} />
          </div>
          <h2 className="font-display text-3xl font-medium text-center tracking-luxe">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-center text-sm mt-2" style={{ color: 'var(--muted)' }}>
            {mode === 'login' ? 'Log in to your notes' : 'Start taking AI notes — free'}
          </p>

          <div className="mt-7 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
            {['login', 'signup'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="rounded-lg py-2 text-sm font-semibold transition"
                style={
                  mode === m
                    ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(32,27,19,.12)' }
                    : { color: 'var(--muted)' }
                }
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
