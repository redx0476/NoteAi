'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, platformLabel } from '@/lib/client/api';
import { useToast } from '@/components/Toast';

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function fmtEventTime(start) {
  const d = new Date(start);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState(null); // { available, connected, email, autopilot }
  const [events, setEvents] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const s = await api('/api/integrations/google');
      setStatus(s);
      if (s.connected) {
        const ev = await api('/api/integrations/google/events').catch(() => []);
        setEvents(ev);
      } else {
        setEvents(null);
      }
    } catch {
      setStatus({ available: false, connected: false });
    }
  }, []);

  useEffect(() => {
    load();
    // Surface the OAuth redirect result once.
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) toast('Google Calendar connected');
    if (params.get('error')) toast('Calendar connect failed: ' + params.get('error'));
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', '/app/integrations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await api('/api/integrations/google/auth');
      window.location.href = url;
    } catch (err) {
      toast(err.message);
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect Google Calendar? Scheduled auto-joins will be cancelled.')) return;
    setBusy(true);
    try {
      await api('/api/integrations/google', null, 'DELETE');
      toast('Google Calendar disconnected');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setAutopilot(on) {
    setStatus((s) => ({ ...s, autopilot: on }));
    try {
      await api('/api/integrations/google', { autopilot: on }, 'PATCH');
      if (on) load();
    } catch (err) {
      toast(err.message);
      setStatus((s) => ({ ...s, autopilot: !on }));
    }
  }

  async function toggleEvent(ev, enabled) {
    setEvents((list) =>
      list.map((e) => (e.eventId === ev.eventId ? { ...e, enabled } : e))
    );
    try {
      await api(
        '/api/integrations/google/events',
        { eventId: ev.eventId, enabled, meetingUrl: ev.meetingUrl, start: ev.start, title: ev.title },
        'PATCH'
      );
    } catch (err) {
      toast(err.message);
      setEvents((list) =>
        list.map((e) => (e.eventId === ev.eventId ? { ...e, enabled: !enabled } : e))
      );
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect your calendar and the notetaker joins your meetings automatically.
        </p>

        {/* ── Google Calendar card ── */}
        <div className="card mt-6 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold">Google Calendar</div>
              {!status && <p className="text-sm text-slate-400 mt-1">Loading…</p>}
              {status && !status.available && (
                <p className="text-sm text-slate-500 mt-1">
                  Not configured on this server — set <code>GOOGLE_CLIENT_ID</code> and{' '}
                  <code>GOOGLE_CLIENT_SECRET</code>.
                </p>
              )}
              {status?.available && !status.connected && (
                <p className="text-sm text-slate-500 mt-1">
                  The notetaker detects Meet & Teams links in upcoming events and joins at start
                  time.
                </p>
              )}
              {status?.connected && (
                <p className="text-sm text-slate-500 mt-1">
                  Connected as <span className="font-medium">{status.email}</span>
                </p>
              )}
            </div>
            {status?.available && !status.connected && (
              <button className="btn-primary shrink-0" onClick={connect} disabled={busy}>
                Connect
              </button>
            )}
            {status?.connected && (
              <button className="btn-outline shrink-0" onClick={disconnect} disabled={busy}>
                Disconnect
              </button>
            )}
          </div>

          {status?.connected && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Autopilot</div>
                <div className="text-xs text-slate-400">
                  Automatically send the notetaker to every meeting with a video link
                </div>
              </div>
              <Toggle checked={!!status.autopilot} onChange={setAutopilot} />
            </div>
          )}
        </div>

        {/* ── Upcoming meetings ── */}
        {status?.connected && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Next 24 hours</h2>
            {!events && <div className="text-sm text-slate-400">Loading events…</div>}
            {events && !events.length && (
              <div className="text-sm text-slate-400">No upcoming events with meeting links.</div>
            )}
            <div className="space-y-2">
              {(events || []).map((ev) => (
                <div key={ev.eventId} className="card p-4 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{ev.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {fmtEventTime(ev.start)}
                      {ev.platform ? ` · ${platformLabel(ev.platform)}` : ' · no meeting link'}
                      {ev.botStatus && !['scheduled', 'skipped'].includes(ev.botStatus)
                        ? ` · bot: ${ev.botStatus.replace(/_/g, ' ')}`
                        : ''}
                    </div>
                  </div>
                  {ev.joinable ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400">Auto-join</span>
                      <Toggle
                        checked={ev.enabled}
                        disabled={ev.botStatus && !['scheduled', 'skipped'].includes(ev.botStatus)}
                        onChange={(on) => toggleEvent(ev, on)}
                      />
                    </div>
                  ) : (
                    <span className="chip bg-slate-100 text-slate-400 shrink-0">no link</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
