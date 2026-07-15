'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

const BOT_STATUS_LABEL = {
  pending: 'Starting…',
  scheduled: 'Scheduled',
  joining: 'Joining…',
  waiting_admission: 'Waiting to be admitted',
  recording: 'Recording',
};

function BotBar({ onMeetingReady }) {
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [jobs, setJobs] = useState([]);
  const toast = useToast();

  async function refresh() {
    try {
      setJobs(await api('/api/bots?active=1'));
    } catch {
      /* ignore — next poll retries */
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const link = url.trim();
    if (!link) return;
    setSending(true);
    try {
      await api('/api/bots', { meetingUrl: link });
      setUrl('');
      toast('Notetaker is on its way — admit it from the meeting');
      refresh();
    } catch (err) {
      toast(err.message);
    } finally {
      setSending(false);
    }
  }

  async function stop(job) {
    try {
      await api(`/api/bots/${job.id}`, null, 'DELETE');
      toast(job.status === 'scheduled' ? 'Auto-join cancelled' : 'Notetaker is leaving');
      refresh();
      if (job.meetingId) onMeetingReady?.();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div className="mb-8">
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Paste a Google Meet or Teams link — the notetaker joins for you"
            className="input flex-1"
          />
          <button className="btn-primary shrink-0" onClick={send} disabled={sending || !url.trim()}>
            {sending ? 'Sending…' : 'Send notetaker'}
          </button>
        </div>
        {jobs.length > 0 && (
          <div className="mt-3 space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`chip ${
                    j.status === 'recording'
                      ? 'bg-red-50 text-red-500'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {j.status === 'recording' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {BOT_STATUS_LABEL[j.status] || j.status}
                </span>
                <span className="text-slate-500 truncate flex-1">
                  {j.eventTitle || j.meetingUrl}
                </span>
                {j.meetingId && (
                  <Link href={`/app/m/${j.meetingId}`} className="text-brand font-medium shrink-0">
                    Open notes
                  </Link>
                )}
                <button onClick={() => stop(j)} className="text-slate-400 hover:text-red-500 shrink-0">
                  {j.status === 'scheduled' ? 'Cancel' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
  const loadSeq = useRef(0);

  async function load(query = '') {
    // Sequence guard: fast typing can make an older request resolve after a
    // newer one — only the latest request may update the list.
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const rows = await api('/api/meetings' + (query ? `?q=${encodeURIComponent(query)}` : ''));
      if (seq === loadSeq.current) setItems(rows);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
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

  // One effect covers both the initial load (q === '', no delay) and debounced
  // search — the old separate mount effect double-fetched the list.
  useEffect(() => {
    const t = setTimeout(() => load(q), q ? 250 : 0);
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
      <header className="h-16 shrink-0 border-b border-[var(--line)] flex items-center gap-3 px-6" style={{ background: 'var(--surface)' }}>
        <div className="relative flex-1 max-w-xl">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} width={18} height={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask or search your meetings"
            className="input pl-10"
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
          <BotBar onMeetingReady={() => load(q)} />
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
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>{day}</h2>
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
                            <span className="chip text-[var(--accent-2)] dark:text-champagne" style={{ background: 'var(--accent-wash)' }}>
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
