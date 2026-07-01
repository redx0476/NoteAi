'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { IconMic, IconVideo } from './Icons';

// Starts a live meeting: creates the meeting record, then opens the meeting view
// in recording mode where the browser mic streams to Deepgram for live captions.
export default function RecordModal({ open, onClose }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  async function start() {
    setBusy(true);
    setErr('');
    try {
      const meeting = await api('/api/meetings', {
        title: title.trim() || 'Live meeting',
        platform: 'manual',
      });
      onClose?.();
      router.push(`/app/m/${meeting.id}?record=1`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-brand-soft text-brand">
            <IconMic width={22} height={22} />
          </span>
          <div>
            <h3 className="font-bold text-lg">Start a live meeting</h3>
            <p className="text-sm text-slate-500">Your microphone streams for real-time notes.</p>
          </div>
        </div>

        <label className="block mt-5 text-sm font-medium text-slate-600 dark:text-slate-300">
          Meeting title
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          placeholder="e.g. Weekly sync"
          className="input mt-1.5"
        />

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 dark:bg-slate-800/60 dark:border-slate-700">
          <IconVideo width={18} height={18} className="text-slate-400" />
          <span className="text-xs text-slate-500">
            Live captions require a Deepgram API key. Without one, import a recording instead.
          </span>
        </div>

        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : 'Start recording'}
          </button>
        </div>
      </div>
    </div>
  );
}
