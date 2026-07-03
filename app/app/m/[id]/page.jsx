'use client';

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, auth, wsBase, fmtTime, fmtDate, durationMin, platformLabel, preferredModel, MODELS, MODEL_RANKS, colorFor } from '@/lib/client/api';
import { startMicIngest } from '@/lib/client/recorder';
import Avatar from '@/components/Avatar';
import { useToast } from '@/components/Toast';
import {
  IconShare, IconCopy, IconDownload, IconTrash, IconChevron, IconStar, IconSend, IconCheck, IconSearch, IconPencil,
} from '@/components/Icons';

function Section({ title, icon, defaultOpen = true, right, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-5 py-4 text-left">
        <IconChevron
          width={18}
          height={18}
          className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="font-semibold flex items-center gap-2">
          {icon} {title}
        </span>
        <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
          {right}
        </span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

function AiChat({ id }) {
  const [q, setQ] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const suggestions = [
    'Summarize the key decisions',
    'What are my action items?',
    'What challenges were discussed?',
  ];

  async function ask(question) {
    const query = (question ?? q).trim();
    if (!query || busy) return;
    setLog((l) => [...l, { role: 'user', text: query }]);
    setQ('');
    setBusy(true);
    try {
      const { answer } = await api(`/api/meetings/${id}/ask`, { question: query, model: preferredModel() });
      setLog((l) => [...l, { role: 'ai', text: answer }]);
    } catch (e) {
      setLog((l) => [...l, { role: 'ai', text: 'Error: ' + e.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm dark:border-slate-800">AI Chat</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!log.length && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Ask anything about this meeting:</p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="block w-full text-left text-sm rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {log.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'text-right' : ''}>
            <div
              className={`inline-block rounded-2xl px-3.5 py-2 text-sm max-w-[85%] whitespace-pre-wrap text-left ${
                msg.role === 'user' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">Thinking…</div>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="p-3 border-t border-slate-100 flex gap-2 dark:border-slate-800"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this meeting…" className="input" />
        <button className="btn-primary px-3" disabled={busy}>
          <IconSend width={16} height={16} />
        </button>
      </form>
    </div>
  );
}

export default function MeetingPage() {
  return (
    <Suspense fallback={<div className="h-full grid place-items-center text-slate-400">Loading…</div>}>
      <MeetingView />
    </Suspense>
  );
}

function MeetingView() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordMode = searchParams.get('record') === '1';
  const toast = useToast();
  const [m, setM] = useState(null);
  const [tab, setTab] = useState('summary');
  const [done, setDone] = useState(() => new Set());
  const [tqInput, setTqInput] = useState('');
  const [tq, setTq] = useState('');
  const [interim, setInterim] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState(null);
  const [recording, setRecording] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [botJob, setBotJob] = useState(null); // live notetaker bot in this meeting
  const [preview, setPreview] = useState(null); // regenerated notes awaiting Apply/Discard
  const [regenBusy, setRegenBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [regenModel, setRegenModel] = useState(preferredModel());
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const scrollRef = useRef(null);
  const audioRef = useRef(null);
  const segsRef = useRef([]);
  const summarizingRef = useRef(false);
  const lastSummarizedCountRef = useRef(0);
  const liveConnRef = useRef({ timer: null, attempts: 0, stopped: true });

  // Debounce the transcript search so typing doesn't re-filter a potentially
  // huge segment list on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTq(tqInput), 250);
    return () => clearTimeout(t);
  }, [tqInput]);

  const speakers = useMemo(
    () => [...new Set((m?.segments || []).map((s) => s.speaker))],
    [m?.segments]
  );
  const segs = useMemo(() => {
    const list = m?.segments || [];
    const q = tq.trim().toLowerCase();
    return q ? list.filter((s) => s.text.toLowerCase().includes(q)) : list;
  }, [m?.segments, tq]);

  async function reload() {
    const data = await api(`/api/meetings/${id}`);
    setM(data);
    return data;
  }

  useEffect(() => {
    setM(null);
    setInterim(null);
    reload().then((data) => {
      if (data?.status === 'live') {
        connectLive();
        if (recordMode) startRecording();
      }
    });
    return () => {
      disconnectLive();
      recorderRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep the latest segment list reachable from the polling interval below.
  useEffect(() => {
    segsRef.current = m?.segments || [];
  }, [m]);

  // Track whether a notetaker bot is in this meeting (chip + Remove button).
  useEffect(() => {
    if (m?.status !== 'live') {
      setBotJob(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const jobs = await api('/api/bots?active=1');
        if (!cancelled) setBotJob(jobs.find((j) => j.meetingId === id) || null);
      } catch {
        /* next poll retries */
      }
    };
    poll();
    const t = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [m?.status, id]);

  async function removeBot() {
    if (!botJob) return;
    try {
      await api(`/api/bots/${botJob.id}`, null, 'DELETE');
      toast('Notetaker is leaving the meeting');
      setBotJob(null);
    } catch (err) {
      toast(err.message);
    }
  }

  // While the meeting is live, regenerate the AI notes periodically so the
  // Summary tab builds up as the call goes — without ending the meeting.
  useEffect(() => {
    if (m?.status !== 'live') return;
    const tick = async () => {
      const count = segsRef.current.length;
      if (!count || count <= lastSummarizedCountRef.current || summarizingRef.current) return;
      const prevCount = lastSummarizedCountRef.current;
      lastSummarizedCountRef.current = count;
      summarizingRef.current = true;
      setSummarizing(true);
      try {
        const data = await api(`/api/meetings/${id}/live-summary`, { model: preferredModel() });
        setM((prev) =>
          prev
            ? {
                ...prev,
                title: data.title,
                summary: data.summary,
                objectives: data.objectives,
                actionItems: data.actionItems,
                chapters: data.chapters,
                keywords: data.keywords,
              }
            : prev
        );
      } catch {
        lastSummarizedCountRef.current = prevCount; // let the next tick retry
      } finally {
        summarizingRef.current = false;
        setSummarizing(false);
      }
    };
    const iv = setInterval(tick, 45000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.status, id]);

  function connectLive() {
    const conn = liveConnRef.current;
    conn.stopped = false;
    conn.attempts = 0;

    const open = () => {
      const url = `${wsBase()}/ws/live?meetingId=${encodeURIComponent(id)}&token=${encodeURIComponent(auth.token())}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;
      ws.onopen = () => {
        const wasReconnect = conn.attempts > 0;
        conn.attempts = 0;
        setReconnecting(false);
        // Backfill any final segments broadcast while the socket was down.
        if (wasReconnect) reload().catch(() => {});
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'interim') setInterim(msg);
        else if (msg.type === 'final') {
          setInterim(null);
          setM((prev) =>
            prev
              ? { ...prev, segments: [...(prev.segments || []), { speaker: msg.speaker, text: msg.text, tOffset: msg.tOffset }] }
              : prev
          );
          requestAnimationFrame(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          });
        }
      };
      // Auto-reconnect with capped exponential backoff so captions survive
      // network blips / dev-server restarts. onerror is followed by onclose,
      // so retrying from onclose alone covers both.
      ws.onclose = () => {
        if (conn.stopped) return;
        setReconnecting(true);
        const delay = Math.min(15000, 1000 * 2 ** conn.attempts++);
        conn.timer = setTimeout(open, delay);
      };
    };
    open();
  }

  function disconnectLive() {
    const conn = liveConnRef.current;
    conn.stopped = true;
    clearTimeout(conn.timer);
    setReconnecting(false);
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }
  }

  async function startRecording() {
    try {
      // Guard against a leaked controller when resuming/restarting.
      recorderRef.current?.stop();
      recorderRef.current = await startMicIngest(id, auth.token(), {
        onStatus: (s) => {
          if (s === 'connected') setRecording(true);
        },
        onFallback: (reason) => {
          // Live captions are unavailable, but the raw audio is still being
          // recorded on the server — keep the recording state active.
          toast('Live captions unavailable (' + reason + '). Still recording audio.');
        },
      });
      setRecording(true);
      setTab('transcript');
      toast('Recording… speak and captions will appear.');
    } catch (err) {
      toast('Mic error: ' + err.message);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function endMeeting() {
    stopRecording();
    disconnectLive();
    toast('Generating summary…');
    const data = await api(`/api/meetings/${id}/end`, { model: preferredModel() });
    setM(data);
    toast('Notes ready ✓');
  }
  // Regenerate notes as a preview — nothing is saved until applyPreview().
  async function regenerate() {
    if (regenBusy) return;
    setRegenBusy(true);
    try {
      const notes = await api(`/api/meetings/${id}/regenerate`, { model: regenModel });
      setPreview(notes);
    } catch (err) {
      toast(err.message);
    } finally {
      setRegenBusy(false);
    }
  }
  async function applyPreview() {
    if (!preview || applying) return;
    setApplying(true);
    try {
      const saved = await api(`/api/meetings/${id}/regenerate`, preview, 'PUT');
      setM((prev) =>
        prev
          ? {
              ...prev,
              title: saved.title,
              summary: saved.summary,
              objectives: saved.objectives,
              actionItems: saved.actionItems,
              chapters: saved.chapters,
              keywords: saved.keywords,
            }
          : prev
      );
      setDone(new Set()); // checkbox indices point at the old action items
      setPreview(null);
      toast('Notes updated ✓');
    } catch (err) {
      toast(err.message);
    } finally {
      setApplying(false);
    }
  }
  function discardPreview() {
    if (!applying) setPreview(null);
  }
  async function del() {
    if (!confirm('Delete this meeting?')) return;
    stopRecording();
    disconnectLive();
    await api(`/api/meetings/${id}`, null, 'DELETE');
    router.push('/app');
  }
  function copyTranscript() {
    const text = (m.segments || []).map((s) => `[${fmtTime(s.tOffset)}] ${s.speaker}: ${s.text}`).join('\n');
    navigator.clipboard.writeText(text);
    toast('Transcript copied');
  }
  function shareLink() {
    navigator.clipboard.writeText(location.href);
    toast('Link copied');
  }
  // Mutation handlers patch state locally (the POST responses / server effects
  // are mirrored) instead of reload()ing the whole meeting — which refetches
  // the entire transcript. useCallback keeps them stable for SegmentRow's memo.
  const saveHighlight = useCallback(
    async (s) => {
      const h = await api(`/api/meetings/${id}/highlights`, { text: s.text, speaker: s.speaker, tOffset: s.tOffset });
      setM((prev) =>
        prev
          ? {
              ...prev,
              highlights: [...(prev.highlights || []), h].sort(
                (a, b) => a.tOffset - b.tOffset || a.id - b.id
              ),
            }
          : prev
      );
      toast('Highlight saved ⭐');
    },
    [id, toast]
  );
  const startEdit = useCallback((key, from) => setEditing({ key, from, value: from }), []);
  const cancelEdit = useCallback(() => setEditing(null), []);
  const onEditChange = useCallback((v) => setEditing((e) => (e ? { ...e, value: v } : e)), []);
  const saveSpeakerName = useCallback(
    async (from, rawTo) => {
      const to = (rawTo || '').trim();
      setEditing(null);
      if (!to || to === from) return;
      await api(`/api/meetings/${id}/speakers`, { from, to });
      // Server renames the speaker on segments + highlights; mirror it locally.
      setM((prev) =>
        prev
          ? {
              ...prev,
              segments: (prev.segments || []).map((s) => (s.speaker === from ? { ...s, speaker: to } : s)),
              highlights: (prev.highlights || []).map((h) => (h.speaker === from ? { ...h, speaker: to } : h)),
            }
          : prev
      );
      toast('Speaker renamed ✓');
    },
    [id, toast]
  );
  const seekTo = useCallback((t) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t || 0);
    a.play().catch(() => {});
  }, []);

  if (!m) return <div className="h-full grid place-items-center text-slate-400">Loading…</div>;

  const isLive = m.status === 'live';

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 no-print dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href="/app" className="text-xs text-slate-400 hover:text-brand">← All meetings</Link>
            <h1 className="text-xl font-bold truncate mt-1 flex items-center gap-2">
              {m.title}
              {isLive && (
                <span className="chip bg-red-50 text-red-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                </span>
              )}
              {isLive && reconnecting && (
                <span className="chip bg-amber-50 text-amber-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> reconnecting…
                </span>
              )}
              {recording && (
                <span className="chip bg-emerald-50 text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> REC
                </span>
              )}
              {botJob && (
                <span className="chip bg-brand-soft text-brand" title={`Bot status: ${botJob.status}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  Notetaker {botJob.status === 'recording' ? 'in call' : 'joining…'}
                  <button
                    onClick={removeBot}
                    className="ml-1 font-medium hover:text-red-500"
                    title="Remove the notetaker from this meeting"
                  >
                    ✕
                  </button>
                </span>
              )}
            </h1>
            <div className="text-xs text-slate-400 mt-1">
              {fmtDate(m.startedAt)}
              {durationMin(m) ? ` · ${durationMin(m)}` : ''} · {platformLabel(m.platform)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isLive && (
              <>
                {recording ? (
                  <button className="btn-outline" onClick={stopRecording} title="Stop recording">
                    Stop
                  </button>
                ) : (
                  <button className="btn-outline" onClick={startRecording} title="Resume recording">
                    Resume
                  </button>
                )}
                <button className="btn-primary" onClick={endMeeting}>
                  End &amp; summarize
                </button>
              </>
            )}
            {!isLive && (
              <>
                <select
                  className="input w-auto py-2 text-xs"
                  value={regenModel}
                  onChange={(e) => setRegenModel(e.target.value)}
                  disabled={regenBusy}
                  title="Model used when regenerating notes"
                >
                  {MODEL_RANKS.map((g) => (
                    <optgroup key={g.rank} label={g.title}>
                      {MODELS.filter((mo) => mo.rank === g.rank).map((mo) => (
                        <option key={mo.id} value={mo.id}>
                          {mo.label.split(' — ')[0]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button className="btn-outline" onClick={regenerate} disabled={regenBusy} title="Regenerate AI notes">
                  {regenBusy ? 'Regenerating…' : 'Regenerate notes'}
                </button>
              </>
            )}
            <button className="btn-outline" onClick={shareLink} title="Copy link">
              <IconShare width={16} height={16} />
            </button>
            <button className="btn-outline" onClick={copyTranscript} title="Copy transcript">
              <IconCopy width={16} height={16} />
            </button>
            <button className="btn-outline" onClick={() => window.print()} title="Export PDF">
              <IconDownload width={16} height={16} />
            </button>
            <button className="btn-outline text-red-500 border-red-200 hover:bg-red-50" onClick={del} title="Delete">
              <IconTrash width={16} height={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-6 border-b border-slate-100 -mb-4 dark:border-slate-800">
          {['summary', 'transcript'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-semibold capitalize border-b-2 -mb-px transition ${
                tab === t ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {tab === 'summary' ? (
          <div className="h-full grid lg:grid-cols-[1fr_340px]">
            <div ref={scrollRef} className="overflow-y-auto p-6 space-y-4">
              {!!(m.keywords || []).length && (
                <div className="flex flex-wrap gap-2">
                  {m.keywords.map((k) => (
                    <span key={k} className="chip bg-brand-soft text-brand">{k}</span>
                  ))}
                </div>
              )}

              <Section
                title="Overview"
                icon="🧠"
                right={
                  isLive && summarizing ? (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" /> updating…
                    </span>
                  ) : null
                }
              >
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {m.summary || (isLive ? 'Building summary as the meeting goes…' : 'No summary yet.')}
                </div>
              </Section>

              {!!(m.objectives || []).length && (
                <Section
                  title="Objectives"
                  icon="🎯"
                  right={<span className="text-xs text-slate-400">{m.objectives.length}</span>}
                >
                  <ul className="space-y-1.5">
                    {m.objectives.map((o, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2">
                        <span className="text-brand">•</span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section
                title="Action Items"
                icon="✅"
                right={<span className="text-xs text-slate-400">{(m.actionItems || []).length}</span>}
              >
                {(m.actionItems || []).length ? (
                  <ul className="space-y-2">
                    {m.actionItems.map((a, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <button
                          onClick={() =>
                            setDone((d) => {
                              const n = new Set(d);
                              n.has(i) ? n.delete(i) : n.add(i);
                              return n;
                            })
                          }
                          className={`mt-0.5 w-5 h-5 rounded-md border grid place-items-center shrink-0 ${
                            done.has(i) ? 'bg-brand border-brand text-white' : 'border-slate-300'
                          }`}
                        >
                          {done.has(i) && <IconCheck width={13} height={13} />}
                        </button>
                        <span className={`text-sm ${done.has(i) ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {a.text}
                          {a.owner && <span className="text-slate-400"> — {a.owner}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">
                    {isLive ? 'Action items appear after the meeting ends.' : 'No action items were detected.'}
                  </p>
                )}
              </Section>

              {!!(m.chapters || []).length && (
                <Section title="Outline" icon="📑" defaultOpen={false}>
                  <div className="space-y-4">
                    {m.chapters.map((c, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-brand font-bold text-sm">{i + 1}.</span>
                        <div>
                          <div className="font-semibold text-sm">{c.title}</div>
                          <div className="text-sm text-slate-500 mt-0.5">{c.summary}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {!!(m.highlights || []).length && (
                <Section title="Highlights" icon="⭐" defaultOpen={false}>
                  <ul className="space-y-2">
                    {m.highlights.map((h) => (
                      <li key={h.id} className="text-sm flex gap-2">
                        <button
                          onClick={() => {
                            setTab('transcript');
                            seekTo(h.tOffset);
                          }}
                          className="text-slate-400 hover:text-brand tabular-nums"
                        >
                          {fmtTime(h.tOffset)}
                        </button>
                        <span className="text-slate-700">{h.text}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            <div className="border-l border-slate-200 p-4 overflow-hidden no-print hidden lg:block dark:border-slate-800">
              <AiChat id={id} />
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="h-full overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {!!(m.keywords || []).length && (
                <div className="flex flex-wrap gap-2">
                  {m.keywords.map((k) => (
                    <span key={k} className="chip bg-brand-soft text-brand">{k}</span>
                  ))}
                </div>
              )}

              {m.hasAudio && (
                <div className="card p-4 no-print">
                  <audio
                    ref={audioRef}
                    controls
                    preload="metadata"
                    className="w-full"
                    src={`/api/meetings/${id}/audio?token=${encodeURIComponent(auth.token())}`}
                  />
                  <p className="text-xs text-slate-400 mt-2">🔊 Recording · click any timestamp to jump here.</p>
                </div>
              )}

              {!!speakers.length && (
                <div className="card p-4 no-print">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Speakers</div>
                    <button className="text-xs text-brand font-medium" onClick={() => setShowBulk((s) => !s)}>
                      {showBulk ? 'Close' : 'Rename all'}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {speakers.map((sp) => {
                      const key = `chip:${sp}`;
                      if (editing?.key === key) {
                        return (
                          <SpeakerNameInput
                            key={sp}
                            attendees={m.participants}
                            value={editing.value}
                            onChange={(v) => setEditing((e) => ({ ...e, value: v }))}
                            onSave={() => saveSpeakerName(sp, editing.value)}
                            onCancel={cancelEdit}
                          />
                        );
                      }
                      return (
                        <span
                          key={sp}
                          className="chip border border-slate-200"
                          style={{ color: colorFor(sp) }}
                        >
                          <Avatar name={sp} size={18} /> {sp}
                          <button
                            onClick={() => startEdit(key, sp)}
                            className="ml-1 text-slate-400 hover:text-brand"
                            title="Rename speaker"
                          >
                            <IconPencil width={13} height={13} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  {showBulk && <BulkSpeakers meeting={m} onDone={reload} toast={toast} />}
                </div>
              )}

              <div className="relative no-print">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={16} height={16} />
                <input
                  value={tqInput}
                  onChange={(e) => setTqInput(e.target.value)}
                  placeholder="Find in transcript…"
                  className="input pl-9"
                />
              </div>

              <div className="space-y-1">
                {segs.length ? (
                  segs.map((s, i) => (
                    <SegmentRow
                      key={i}
                      s={s}
                      i={i}
                      editing={editing?.key === `seg:${i}` ? editing : null}
                      attendees={m.participants}
                      onStartEdit={startEdit}
                      onEditChange={onEditChange}
                      onSaveSpeaker={saveSpeakerName}
                      onCancelEdit={cancelEdit}
                      onSeek={seekTo}
                      onHighlight={saveHighlight}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slate-400">
                    {isLive ? 'Listening… speak and captions will appear.' : 'No transcript captured.'}
                  </p>
                )}
                {interim && (
                  <div className="flex gap-3 px-2 py-2 opacity-70">
                    <Avatar name={interim.speaker} size={30} />
                    <div>
                      <span className="text-sm font-semibold" style={{ color: colorFor(interim.speaker) }}>
                        {interim.speaker}
                      </span>
                      <p className="text-sm text-slate-500 italic">{interim.text}▍</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {regenBusy && (
        <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4">
          <div className="card p-6 flex items-center gap-4">
            <span className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin shrink-0" />
            <div>
              <div className="font-semibold">Regenerating notes…</div>
              <p className="text-sm text-slate-500 mt-0.5">
                The AI is re-reading the transcript. You&apos;ll review the result before anything is saved.
              </p>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <RegeneratePreview
          notes={preview}
          applying={applying}
          onApply={applyPreview}
          onDiscard={discardPreview}
        />
      )}
    </div>
  );
}

// One transcript line. Memoized so a new live caption only mounts one new row
// instead of re-rendering the entire (potentially huge) transcript. All
// callbacks passed in are stable (useCallback in MeetingView).
const SegmentRow = memo(function SegmentRow({
  s,
  i,
  editing,
  attendees,
  onStartEdit,
  onEditChange,
  onSaveSpeaker,
  onCancelEdit,
  onSeek,
  onHighlight,
}) {
  return (
    <div className="group flex gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <Avatar name={s.speaker} size={30} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          {editing ? (
            <SpeakerNameInput
              attendees={attendees}
              value={editing.value}
              onChange={onEditChange}
              onSave={() => onSaveSpeaker(s.speaker, editing.value)}
              onCancel={onCancelEdit}
            />
          ) : (
            <span className="flex items-center gap-1">
              <span className="text-sm font-semibold" style={{ color: colorFor(s.speaker) }}>
                {s.speaker}
              </span>
              <button
                onClick={() => onStartEdit(`seg:${i}`, s.speaker)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand no-print"
                title="Rename speaker"
              >
                <IconPencil width={13} height={13} />
              </button>
            </span>
          )}
          <button onClick={() => onSeek(s.tOffset)} className="text-xs text-slate-400 tabular-nums hover:text-brand">
            {fmtTime(s.tOffset)}
          </button>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{s.text}</p>
      </div>
      <button
        onClick={() => onHighlight(s)}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-amber-400 no-print"
        title="Save highlight"
      >
        <IconStar width={16} height={16} />
      </button>
    </div>
  );
});

function SpeakerNameInput({ value, onChange, onSave, onCancel, attendees }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        list="mn-attendees"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          else if (e.key === 'Escape') onCancel();
        }}
        onBlur={onCancel}
        className="input py-1 text-sm w-40"
        placeholder="Speaker name…"
      />
      <datalist id="mn-attendees">
        {(attendees || []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button onMouseDown={(e) => e.preventDefault()} onClick={onSave} className="text-brand hover:opacity-80" title="Save">
        <IconCheck width={15} height={15} />
      </button>
    </span>
  );
}

function BulkSpeakers({ meeting, onDone, toast }) {
  const speakers = [...new Set((meeting.segments || []).map((s) => s.speaker))];
  const [map, setMap] = useState({});
  async function apply() {
    const clean = {};
    for (const [k, v] of Object.entries(map)) if (v && v.trim() && v.trim() !== k) clean[k] = v.trim();
    if (!Object.keys(clean).length) return toast('Enter at least one name');
    await api(`/api/meetings/${meeting.id}/speakers/bulk`, { map: clean });
    toast('Speaker names applied ✓');
    onDone();
  }
  return (
    <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
      <datalist id="attendees">
        {(meeting.participants || []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {speakers.map((sp) => (
        <div key={sp} className="flex items-center gap-2">
          <span className="w-24 text-xs font-semibold shrink-0" style={{ color: colorFor(sp) }}>{sp}</span>
          <span className="text-slate-300">→</span>
          <input
            list="attendees"
            placeholder="Assign a name…"
            className="input py-1.5"
            value={map[sp] || ''}
            onChange={(e) => setMap((mm) => ({ ...mm, [sp]: e.target.value }))}
          />
        </div>
      ))}
      <button onClick={apply} className="btn-primary mt-2">Apply names</button>
    </div>
  );
}

// Review dialog for regenerated notes. Purely presentational — nothing is
// persisted until onApply PUTs the exact notes shown here.
function RegeneratePreview({ notes, applying, onApply, onDiscard }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4" onClick={onDiscard}>
      <div
        className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg">Review regenerated notes</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Nothing is saved until you apply. Discard to keep the current notes.
        </p>

        <div className="mt-5 space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Title</div>
            <div className="font-semibold mt-1">{notes.title}</div>
          </div>

          {!!(notes.keywords || []).length && (
            <div className="flex flex-wrap gap-2">
              {notes.keywords.map((k) => (
                <span key={k} className="chip bg-brand-soft text-brand">{k}</span>
              ))}
            </div>
          )}

          {!!(notes.objectives || []).length && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Objectives</div>
              <ul className="mt-1.5 space-y-1.5">
                {notes.objectives.map((o, i) => (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-brand">•</span>
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</div>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mt-1">
              {notes.summary || 'No summary generated.'}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Action Items ({(notes.actionItems || []).length})
            </div>
            {(notes.actionItems || []).length ? (
              <ul className="mt-1.5 space-y-1.5">
                {notes.actionItems.map((a, i) => (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-brand">✓</span>
                    <span>
                      {a.text}
                      {a.owner && <span className="text-slate-400"> — {a.owner}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400 mt-1">No action items were detected.</p>
            )}
          </div>

          {!!(notes.chapters || []).length && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Outline</div>
              <div className="mt-1.5 space-y-3">
                {notes.chapters.map((c, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-brand font-bold text-sm">{i + 1}.</span>
                    <div>
                      <div className="font-semibold text-sm">{c.title}</div>
                      <div className="text-sm text-slate-500 mt-0.5">{c.summary}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onDiscard} disabled={applying}>
            Discard
          </button>
          <button className="btn-primary" onClick={onApply} disabled={applying}>
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
