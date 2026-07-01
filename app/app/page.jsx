'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, uploadAudio, preferredModel, dayLabel, fmtDate, durationMin, platformLabel } from '@/lib/client/api';
import Avatar from '@/components/Avatar';
import { IconSearch, IconMic, IconImport, IconVideo, IconStar } from '@/components/Icons';
import RecordModal from '@/components/RecordModal';
import { useToast } from '@/components/Toast';

function Snippet({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return <p className="text-sm text-slate-400 italic">Summary is generated when the meeting ends.</p>;
  const long = text.length > 220;
  return (
    <p className="text-sm text-slate-600 leading-relaxed">
      {open || !long ? text : text.slice(0, 220) + '…'}{' '}
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="text-brand font-medium">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </p>
  );
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [recOpen, setRecOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function load(query = '') {
    setLoading(true);
    try {
      setItems(await api('/api/meetings' + (query ? `?q=${encodeURIComponent(query)}` : '')));
    } finally {
      setLoading(false);
    }
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    toast('Transcribing “' + file.name + '”…');
    try {
      const meeting = await uploadAudio(file, preferredModel());
      router.push(`/app/m/${meeting.id}`);
    } catch (err) {
      toast('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const groups = useMemo(() => {
    const g = {};
    for (const m of items) {
      const k = dayLabel(m.startedAt);
      (g[k] = g[k] || []).push(m);
    }
    return Object.entries(g);
  }, [items]);

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 shrink-0 border-b border-slate-200 bg-white flex items-center gap-3 px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 max-w-xl">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={18} height={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask or search your meetings"
            className="input pl-10 bg-slate-50 dark:bg-slate-800"
          />
        </div>
        <label className="btn-outline cursor-pointer">
          <IconImport width={16} height={16} /> Import
          <input type="file" accept="audio/*,video/*" className="hidden" onChange={onImport} disabled={importing} />
        </label>
        <button className="btn-primary" onClick={() => setRecOpen(true)}>
          <IconMic width={16} height={16} /> Record
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {loading && <div className="text-slate-400 text-sm">Loading…</div>}
          {!loading && !items.length && (
            <div className="text-center py-24">
              <div className="mx-auto w-14 h-14 grid place-items-center rounded-2xl bg-brand-soft text-brand">
                <IconVideo width={26} height={26} />
              </div>
              <h3 className="mt-4 font-semibold text-lg">No meetings yet</h3>
              <p className="text-slate-500 text-sm mt-1">
                Start a live meeting or import a recording and it’ll appear here.
              </p>
            </div>
          )}

          {groups.map(([day, list]) => (
            <section key={day} className="mb-8">
              <h2 className="text-sm font-semibold text-slate-500 mb-3">{day}</h2>
              <div className="space-y-3">
                {list.map((m) => (
                  <Link key={m.id} href={`/app/m/${m.id}`} className="card block p-5 hover:shadow-pop transition">
                    <div className="flex gap-4">
                      <Avatar name={m.title} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{m.title}</h3>
                          {m.status === 'live' && (
                            <span className="chip bg-red-50 text-red-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {fmtDate(m.startedAt)}
                          {durationMin(m) ? ` · ${durationMin(m)}` : ''} · {platformLabel(m.platform)}
                        </div>
                        <div className="mt-2">
                          <Snippet text={m.summary} />
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="flex -space-x-2">
                            {(m.participants || []).slice(0, 4).map((p) => (
                              <Avatar key={p} name={p} size={22} ring />
                            ))}
                          </div>
                          {(m.actionItems || []).length > 0 && (
                            <span className="chip bg-slate-100 text-slate-500">
                              <IconStar width={13} height={13} /> {m.actionItems.length} actions
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <RecordModal open={recOpen} onClose={() => setRecOpen(false)} />

      {importing && (
        <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center">
          <div className="card px-6 py-5 flex items-center gap-3">
            <span className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <span className="text-sm font-medium">Transcribing your file…</span>
          </div>
        </div>
      )}
    </div>
  );
}
