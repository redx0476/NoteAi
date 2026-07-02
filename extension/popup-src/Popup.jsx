import { useEffect, useRef, useState } from 'react';

const API_BASE = 'http://localhost:3000';
// Kept in sync with the app/backend allowlist (lib/client/api.js, lib/services/llm.js).
const MODELS = [
  ['nvidia/nemotron-3-super-120b-a12b:free', 'Nemotron 3 Super — 1M context, best for long meetings'],
  ['openai/gpt-oss-120b:free', 'GPT-OSS 120B — best free quality'],
  ['google/gemma-4-31b-it:free', 'Gemma 4 31B — fast, 256K context'],
  ['nvidia/nemotron-3-ultra-550b-a55b:free', 'Nemotron 3 Ultra — highest quality, slower'],
  ['openai/gpt-oss-20b:free', 'GPT-OSS 20B — free & fast'],
  ['meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3 70B — free'],
  ['qwen/qwen3-next-80b-a3b-instruct:free', 'Qwen3 Next 80B — free'],
];

async function apiCall(path, body) {
  const { token } = await chrome.storage.local.get('token');
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export default function Popup() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [model, setModel] = useState(MODELS[0][0]);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const meterRef = useRef(0);

  useEffect(() => {
    (async () => {
      const s = await chrome.storage.local.get(['user', 'model']);
      if (s.model) setModel(s.model);
      if (s.user) {
        setUser(s.user);
        const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
        if (state?.capturing) setRecording(true);
      }
    })();
    const onMsg = (m) => {
      if (m.type === 'LEVEL_UI') {
        meterRef.current = m.level || 0;
        setLevel(meterRef.current);
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = mode === 'signup' ? form : { email: form.email, password: form.password };
      const { token, user: u } = await apiCall(`/api/auth/${mode}`, body);
      await chrome.storage.local.set({ token, user: u });
      setUser(u);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await chrome.storage.local.remove(['token', 'user']);
    setUser(null);
  }

  // Chrome can't show the mic permission prompt inside an action popup (or the
  // offscreen doc that does the capture), so we only *check* the state here.
  // When it isn't granted yet, the background opens permission.html in a real
  // tab — which can prompt — and auto-starts the capture once access is given.
  async function micPermissionState() {
    try {
      const st = await navigator.permissions.query({ name: 'microphone' });
      return st.state; // 'granted' | 'prompt' | 'denied'
    } catch {
      return 'prompt';
    }
  }

  async function start() {
    setMsg('Starting…');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const platform = /meet\.google\.com/.test(tab.url) ? 'meet' : /teams\./.test(tab.url) ? 'teams' : 'manual';
    const startPayload = {
      tabId: tab.id,
      title: tab.title?.replace(/ - Google Meet| \| Microsoft Teams/, '') || 'Meeting',
      platform,
      meetingUrl: tab.url,
    };

    if ((await micPermissionState()) !== 'granted') {
      // Opens the permission tab (this popup will close); recording starts
      // automatically on the meeting tab after the user clicks Allow.
      setMsg('Waiting for microphone access…');
      await chrome.runtime.sendMessage({ type: 'REQUEST_MIC_PERMISSION', pendingStart: startPayload });
      return;
    }

    const resp = await chrome.runtime.sendMessage({ type: 'START_CAPTURE', ...startPayload });
    if (resp?.ok) {
      setRecording(true);
      setMsg('');
    } else setMsg(resp?.error || 'Failed to start');
  }

  async function stop() {
    setMsg('Summarizing…');
    const resp = await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE', model });
    setRecording(false);
    setLevel(0);
    setMsg(resp?.ok ? 'Notes saved. Open the dashboard to view.' : resp?.error || 'Error');
  }

  function chooseModel(id) {
    setModel(id);
    chrome.storage.local.set({ model: id });
  }

  const Brand = (
    <div className="brand">
      <span className="badge">
        <svg width="18" height="18" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="16" y="9" width="8" height="15" rx="4" fill="#fff" />
          <path d="M13 19a7 7 0 0 0 14 0" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M20 26v4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
      <span>NOTE<em>AI</em></span>
    </div>
  );

  if (!user) {
    return (
      <>
        <div className="head">{Brand}</div>
        <p className="tagline">AI notes &amp; live transcription for your meetings.</p>
        <div className="tabs">
          {['login', 'signup'].map((m) => (
            <button key={m} className={`tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && <input placeholder="Name" value={form.name} onChange={set('name')} />}
          <input placeholder="Email" type="email" value={form.email} onChange={set('email')} required />
          <input placeholder="Password" type="password" value={form.password} onChange={set('password')} required />
          <div className="err">{err}</div>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="head">
        {Brand}
        <button className="linkbtn" onClick={logout}>Sign out</button>
      </div>
      <p className="hello">Signed in as <b>{user.name || user.email}</b></p>
      <label className="field">
        AI model for summaries &amp; notes
        <select value={model} onChange={(e) => chooseModel(e.target.value)}>
          {MODELS.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </label>
      <div className={`status ${recording ? 'live' : 'idle'}`}>
        {recording ? 'Recording & transcribing…' : 'Not recording'}
      </div>
      {recording && (
        <div className="meter">
          <i style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      )}
      {recording ? (
        <button className="btn danger" onClick={stop}>■ Stop &amp; summarize</button>
      ) : (
        <button className="btn primary" onClick={start}>● Start live notes</button>
      )}
      <a className="link" onClick={() => chrome.tabs.create({ url: `${API_BASE}/app` })}>
        Open dashboard ↗
      </a>
      <div className="msg">{msg}</div>
    </>
  );
}
