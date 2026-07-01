// Service worker: orchestrates auth, tab-audio capture (via offscreen doc),
// and chunk upload to the backend.

import './config.js';
const API_BASE = globalThis.MEETNOTES.API_BASE;
const WS_BASE = globalThis.MEETNOTES.WS_BASE;

// Cache whether the backend supports real-time streaming.
let streamingSupported = null;
async function getStreaming() {
  if (streamingSupported !== null) return streamingSupported;
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    streamingSupported = !!(await res.json()).streaming;
  } catch {
    streamingSupported = false;
  }
  return streamingSupported;
}

// ---- token helpers ----------------------------------------------------------
async function getToken() {
  const { token } = await chrome.storage.local.get('token');
  return token || null;
}

async function api(path, { method = 'GET', body, token } = {}) {
  const t = token || (await getToken());
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

// ---- offscreen document management -----------------------------------------
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record meeting tab audio for transcription.',
  });
}

let activeMeetingId = null;
let activeTabId = null;

// ---- message router ---------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'START_CAPTURE': {
          const token = await getToken();
          if (!token) throw new Error('Please sign in first.');

          const tabId = msg.tabId ?? sender.tab?.id;
          const meeting = await api('/api/meetings', {
            method: 'POST',
            body: { title: msg.title || 'Untitled meeting', platform: msg.platform, meetingUrl: msg.meetingUrl },
          });
          activeMeetingId = meeting.id;
          activeTabId = tabId ?? null;

          const streaming = await getStreaming();
          const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
          await ensureOffscreen();
          await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'OFFSCREEN_START',
            streamId,
            meetingId: meeting.id,
            token,
            apiBase: API_BASE,
            wsBase: WS_BASE,
            streaming,
            chunkMs: globalThis.MEETNOTES.CHUNK_MS,
          });
          chrome.storage.local.set({ activeMeetingId: meeting.id, activeTabId: tabId ?? null });
          sendResponse({ ok: true, meeting });
          break;
        }

        case 'STOP_CAPTURE': {
          await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP' });
          const id = activeMeetingId || (await chrome.storage.local.get('activeMeetingId')).activeMeetingId;
          let meeting = null;
          if (id) meeting = await api(`/api/meetings/${id}/end`, { method: 'POST', body: { model: msg.model } });
          activeMeetingId = null;
          activeTabId = null;
          chrome.storage.local.remove(['activeMeetingId', 'activeTabId']);
          sendResponse({ ok: true, meeting });
          break;
        }

        // Offscreen relays a transcript segment (interim or final) — route it
        // ONLY to the tab that started this meeting so multiple open meetings
        // don't cross-contaminate.
        case 'SEGMENT': {
          const tabId = activeTabId ?? (await chrome.storage.local.get('activeTabId')).activeTabId;
          if (tabId != null) {
            // Spread first so `type` stays 'LIVE_SEGMENT' — msg already carries
            // its own `type: 'SEGMENT'` which would otherwise clobber it.
            chrome.tabs.sendMessage(tabId, { ...msg, type: 'LIVE_SEGMENT' }).catch(() => {});
          }
          break;
        }

        // Offscreen input-level meter — forward to the popup if it's open.
        case 'LEVEL': {
          chrome.runtime.sendMessage({ type: 'LEVEL_UI', level: msg.level }).catch(() => {});
          break;
        }

        // Participant roster scraped from the meeting tab — persist it for the
        // active meeting so speaker labels can be mapped to real names.
        case 'PARTICIPANTS': {
          const id = activeMeetingId || (await chrome.storage.local.get('activeMeetingId')).activeMeetingId;
          if (id && Array.isArray(msg.names) && msg.names.length) {
            await api(`/api/meetings/${id}/participants`, { method: 'POST', body: { names: msg.names } }).catch(() => {});
          }
          break;
        }

        // Save a highlight from the live panel.
        case 'ADD_HIGHLIGHT': {
          const id = activeMeetingId || (await chrome.storage.local.get('activeMeetingId')).activeMeetingId;
          if (id && msg.text) {
            await api(`/api/meetings/${id}/highlights`, {
              method: 'POST',
              body: { text: msg.text, speaker: msg.speaker, tOffset: msg.tOffset },
            }).catch(() => {});
          }
          sendResponse({ ok: true });
          break;
        }

        case 'GET_STATE': {
          const { activeMeetingId: id } = await chrome.storage.local.get('activeMeetingId');
          sendResponse({ ok: true, capturing: !!id, meetingId: id || null });
          break;
        }

        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err.message || err) });
    }
  })();
  return true; // async
});
