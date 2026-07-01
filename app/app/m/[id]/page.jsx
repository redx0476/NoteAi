'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, auth, wsBase, fmtTime, fmtDate, durationMin, platformLabel, preferredModel, colorFor } from '@/lib/client/api';
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
  const [tq, setTq] = useState('');
  const [interim, setInterim] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState(null);
  const [recording, setRecording] = useState(false);
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const scrollRef = useRef(null);
  const audioRef = useRef(null);

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
      socketRef.current?.close();
      recorderRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function connectLive() {
    const url = `${wsBase()}/ws/live?meetingId=${encodeURIComponent(id)}&token=${encodeURIComponent(auth.token())}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
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
    socketRef.current?.close();
    toast('Generating summary…');
    await api(`/api/meetings/${id}/end`, { model: preferredModel() });
    await reload();
    toast('Notes ready ✓');
  }
  async function del() {
    if (!confirm('Delete this meeting?')) return;
    stopRecording();
    socketRef.current?.close();
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
  async function saveHighlight(s) {
    await api(`/api/meetings/${id}/highlights`, { text: s.text, speaker: s.speaker, tOffset: s.tOffset });
    toast('Highlight saved ⭐');
    reload();
  }
  function startEdit(key, from) {
    setEditing({ key, from, value: from });
  }
  function cancelEdit() {
    setEditing(null);
  }
  async function saveSpeakerName(from, rawTo) {
    const to = (rawTo || '').trim();
    setEditing(null);
    if (!to || to === from) return;
    await api(`/api/meetings/${id}/speakers`, { from, to });
    toast('Speaker renamed ✓');
    reload();
  }
  function seekTo(t) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t || 0);
    a.play().catch(() => {});
  }

  if (!m) return <div className="h-full grid place-items-center text-slate-400">Loading…</div>;

  const isLive = m.status === 'live';
  const speakers = [...new Set((m.segments || []).map((s) => s.speaker))];
  const segs = (m.segments || []).filter((s) => !tq || s.text.toLowerCase().includes(tq.toLowerCase()));

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
              {recording && (
                <span className="chip bg-emerald-50 text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> REC
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

              <Section title="Overview" icon="🧠">
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {m.summary || (isLive ? 'Summary is generated when you end the meeting.' : 'No summary yet.')}
                </div>
              </Section>

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
                  value={tq}
                  onChange={(e) => setTq(e.target.value)}
                  placeholder="Find in transcript…"
                  className="input pl-9"
                />
              </div>

              <div className="space-y-1">
                {segs.length ? (
                  segs.map((s, i) => (
                    <div key={i} className="group flex gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <Avatar name={s.speaker} size={30} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          {editing?.key === `seg:${i}` ? (
                            <SpeakerNameInput
                              attendees={m.participants}
                              value={editing.value}
                              onChange={(v) => setEditing((e) => ({ ...e, value: v }))}
                              onSave={() => saveSpeakerName(s.speaker, editing.value)}
                              onCancel={cancelEdit}
                            />
                          ) : (
                            <span className="flex items-center gap-1">
                              <span
                                className="text-sm font-semibold"
                                style={{ color: colorFor(s.speaker) }}
                              >
                                {s.speaker}
                              </span>
                              <button
                                onClick={() => startEdit(`seg:${i}`, s.speaker)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand no-print"
                                title="Rename speaker"
                              >
                                <IconPencil width={13} height={13} />
                              </button>
                            </span>
                          )}
                          <button onClick={() => seekTo(s.tOffset)} className="text-xs text-slate-400 tabular-nums hover:text-brand">
                            {fmtTime(s.tOffset)}
                          </button>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">{s.text}</p>
                      </div>
                      <button
                        onClick={() => saveHighlight(s)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-amber-400 no-print"
                        title="Save highlight"
                      >
                        <IconStar width={16} height={16} />
                      </button>
                    </div>
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
    </div>
  );
}

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
