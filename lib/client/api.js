'use client';

// API client, auth store, model list, and small helpers shared across the UI.
// Same-origin — the Next.js server hosts both the pages and the /api routes.

const API_BASE = '';

// Computed lazily so it's safe during SSR (window is undefined on the server).
export function wsBase() {
  if (typeof window === 'undefined') return '';
  return window.location.origin.replace(/^http/, 'ws');
}

export const auth = {
  token: () => (typeof window === 'undefined' ? null : localStorage.getItem('noteai_token')),
  user: () =>
    typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem('noteai_user') || 'null'),
  set(token, user) {
    localStorage.setItem('noteai_token', token);
    localStorage.setItem('noteai_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('noteai_token');
    localStorage.removeItem('noteai_user');
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
export const MODELS = [
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B — best free quality' },
  { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B — free & fast' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B — free' },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'Qwen3 Next 80B — free' },
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

// Deterministic colour for a speaker/name label.
const PALETTE = ['#2f6bff', '#0ea5e9', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'];
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
