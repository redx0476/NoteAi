'use client';

// API client, auth store, model list, and small helpers shared across the UI.
// Same-origin — the Next.js server hosts both the pages and the /api routes.

const API_BASE = '';

// Computed lazily so it's safe during SSR (window is undefined on the server).
export function wsBase() {
  if (typeof window === 'undefined') return '';
  return window.location.origin.replace(/^http/, 'ws');
}

// Broadcast auth changes so the browser-extension content script can mirror the
// session into chrome.storage.local (keeps the extension logged in with the app).
function broadcastAuth(token, user) {
  if (typeof window === 'undefined') return;
  window.postMessage({ source: 'noteai', type: 'AUTH', token: token || null, user: user || null }, window.location.origin);
}

export const auth = {
  token: () => (typeof window === 'undefined' ? null : localStorage.getItem('noteai_token')),
  user: () =>
    typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem('noteai_user') || 'null'),
  set(token, user) {
    localStorage.setItem('noteai_token', token);
    localStorage.setItem('noteai_user', JSON.stringify(user));
    broadcastAuth(token, user);
  },
  clear() {
    localStorage.removeItem('noteai_token');
    localStorage.removeItem('noteai_user');
    broadcastAuth(null, null);
  },
};

export async function api(path, body, method) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(auth.token() ? { Authorization: `Bearer ${auth.token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// Upload an audio/video file to be transcribed + summarized (the "Import" flow).
export async function uploadAudio(file, model) {
  const form = new FormData();
  form.append('audio', file);
  if (model) form.append('model', model);
  const res = await fetch(`${API_BASE}/api/meetings/import`, {
    method: 'POST',
    headers: auth.token() ? { Authorization: `Bearer ${auth.token()}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// Free OpenRouter models, kept in sync with the backend allowlist.
// rank: quality tier, one of MODEL_RANKS below (best → worst).
export const MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super — 1M context, best for long meetings', rank: 'very-good' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B — best free quality', rank: 'best' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B — fast, 256K context', rank: 'good' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra — highest quality, slower', rank: 'best' },
  { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B — free & fast', rank: 'better' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B — free', rank: 'good' },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'Qwen3 Next 80B — free', rank: 'good' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free', label: 'Hermes 3 405B — largest free model', rank: 'best' },
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B A4B — fastest, 256K context', rank: 'better' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B — fast, 256K context', rank: 'better' },
  { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder 480B — 1M context, technical meetings', rank: 'very-good' },
  { id: 'poolside/laguna-m.1:free', label: 'Poolside Laguna M.1 — 256K context', rank: 'better' },
  { id: 'poolside/laguna-xs-2.1:free', label: 'Poolside Laguna XS 2.1 — 256K context', rank: 'bad' },
  { id: 'poolside/laguna-xs.2:free', label: 'Poolside Laguna XS.2 — 256K context', rank: 'bad' },
  { id: 'cohere/north-mini-code:free', label: 'Cohere North Mini — 256K context', rank: 'bad' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni — reasoning', rank: 'better' },
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', label: 'Nemotron Nano 12B VL', rank: 'bad' },
  { id: 'nvidia/nemotron-nano-9b-v2:free', label: 'Nemotron Nano 9B — fast', rank: 'very-bad' },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B — smallest, fastest', rank: 'very-bad' },
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', label: 'Dolphin Mistral 24B', rank: 'better' },
  { id: 'liquid/lfm-2.5-1.2b-instruct:free', label: 'LFM 2.5 1.2B — tiny', rank: 'worst' },
  { id: 'liquid/lfm-2.5-1.2b-thinking:free', label: 'LFM 2.5 1.2B Thinking — tiny', rank: 'worst' },
  { id: 'nvidia/nemotron-3.5-content-safety:free', label: 'Nemotron 3.5 Content Safety — classifier, not recommended', rank: 'worst' },
];

export const MODEL_RANKS = [
  { rank: 'best', title: 'Best' },
  { rank: 'very-good', title: 'Very good' },
  { rank: 'good', title: 'Good' },
  { rank: 'better', title: 'Better' },
  { rank: 'bad', title: 'Bad' },
  { rank: 'very-bad', title: 'Very bad' },
  { rank: 'worst', title: 'Worst' },
];

export const preferredModel = () =>
  (typeof window !== 'undefined' && localStorage.getItem('noteai_model')) || MODELS[0].id;
export const setPreferredModel = (id) => localStorage.setItem('noteai_model', id);

// ── Theme (light/dark) ──────────────────────────────────────────────────────
export const getTheme = () =>
  (typeof window !== 'undefined' && localStorage.getItem('noteai_theme')) || 'light';
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('noteai_theme', theme);
}
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

// ── Formatting helpers ──────────────────────────────────────────────────────
export function fmtTime(t) {
  const m = Math.floor((t || 0) / 60);
  const s = Math.floor((t || 0) % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export function fmtDate(iso) {
  return new Date(iso + 'Z').toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function dayLabel(iso) {
  const d = new Date(iso + 'Z');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function durationMin(m) {
  if (!m.endedAt) return null;
  const ms = new Date(m.endedAt + 'Z') - new Date(m.startedAt + 'Z');
  const min = Math.max(1, Math.round(ms / 60000));
  return `${min} min`;
}

export function platformLabel(p) {
  return p === 'meet' ? 'Google Meet' : p === 'teams' ? 'Microsoft Teams' : 'Meeting';
}

// Deterministic colour for a speaker/name label. A warm, jewel-and-gold palette
// tuned to sit harmoniously on the ivory/near-black luxe canvas.
const PALETTE = ['#b0842a', '#3f7d6e', '#a4553c', '#6d5b8e', '#4d7ca8', '#8a7f3d', '#a35d78', '#57795a'];
export function colorFor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}
