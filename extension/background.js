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
let finalizing = false; // guards against concurrent stop triggers

// ---- start capture ----------------------------------------------------------
// Creates the meeting, grabs the tab-audio stream id and boots the offscreen
// capture. Called from the popup's START_CAPTURE message and from the
// mic-permission flow (auto-start after the user grants the microphone).
async function startCapture({ tabId, title, platform, meetingUrl }) {
  const token = await getToken();
  if (!token) throw new Error('Please sign in first.');

  const meeting = await api('/api/meetings', {
    method: 'POST',
    body: { title: title || 'Untitled meeting', platform, meetingUrl },
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
  chrome.storage.local.set({
    activeMeetingId: meeting.id,
    activeTabId: tabId ?? null,
    activeMeetingUrl: meetingUrl ?? null,
  });
  return meeting;
}

// ---- microphone permission flow ---------------------------------------------
// The offscreen doc and the popup can't show the mic permission prompt, so we
// open permission.html in a real tab. If a start request was pending, capture
// begins automatically once the user grants access.
async function openMicPermissionPage(pendingStart) {
  await chrome.storage.local.set({ pendingStart: pendingStart || null });
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  await chrome.storage.local.set({ permissionTabId: tab.id });
}

async function onMicPermissionResult(granted) {
  const { pendingStart, permissionTabId } = await chrome.storage.local.get([
    'pendingStart',
    'permissionTabId',
  ]);
  if (!granted) {
    chrome.storage.local.remove('pendingStart');
    return; // leave the permission tab open — it shows unblock instructions
  }
  chrome.storage.local.remove(['pendingStart', 'permissionTabId']);
  if (permissionTabId != null) chrome.tabs.remove(permissionTabId).catch(() => {});
  if (!pendingStart) return;
  // Return the user to their meeting and start capture there.
  if (pendingStart.tabId != null) chrome.tabs.update(pendingStart.tabId, { active: true }).catch(() => {});
  try {
    await startCapture(pendingStart);
  } catch (err) {
    // Auto-start failed (e.g. tabCapture invocation expired) — tell the meeting
    // tab so the user knows to click Start again.
    if (pendingStart.tabId != null) {
      chrome.tabs
        .sendMessage(pendingStart.tabId, {
          type: 'MIC_STATUS',
          ok: false,
          message: `Mic enabled, but recording didn't start (${String(err?.message || err)}). Click the NOTEAI icon and press Start again.`,
        })
        .catch(() => {});
    }
  }
}

// ---- stop + finalize --------------------------------------------------------
// Single idempotent path shared by the manual popup Stop button and the
// automatic triggers (tab closed / navigated away from the meeting). Stops the
// offscreen capture and calls the /end endpoint that generates the AI summary.
async function finalizeMeeting(model) {
  // Grab and clear the active id up-front so re-entrant events no-op.
  const id = activeMeetingId || (await chrome.storage.local.get('activeMeetingId')).activeMeetingId;
  if (!id || finalizing) return null;
  finalizing = true;
  activeMeetingId = null;
  activeTabId = null;
  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP' }).catch(() => {});
    // Auto-triggers have no popup model selection → fall back to the stored one.
    const m = model || (await chrome.storage.local.get('model')).model;
    const meeting = await api(`/api/meetings/${id}/end`, { method: 'POST', body: { model: m } });
    chrome.storage.local.remove(['activeMeetingId', 'activeTabId', 'activeMeetingUrl']);
    return meeting;
  } finally {
    finalizing = false;
  }
}

// True when `newUrl` is no longer the same meeting as `origUrl`. In-call Meet /
// Teams keep the same pathname, so any host or pathname change means the user
// left the call/room. Unparseable URLs are treated as "not left" (no-op).
function leftMeeting(origUrl, newUrl) {
  try {
    const a = new URL(origUrl);
    const b = new URL(newUrl);
    return a.host !== b.host || a.pathname !== b.pathname;
  } catch {
    return false;
  }
}

// Tab closed → finalize if it was the captured meeting tab.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const active = activeTabId ?? (await chrome.storage.local.get('activeTabId')).activeTabId;
  if (active != null && tabId === active) finalizeMeeting();
});

// Tab navigated away from the meeting → finalize.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const active = activeTabId ?? (await chrome.storage.local.get('activeTabId')).activeTabId;
  if (active == null || tabId !== active) return;
  const orig = (await chrome.storage.local.get('activeMeetingUrl')).activeMeetingUrl;
  if (orig && leftMeeting(orig, changeInfo.url)) finalizeMeeting();
});

// ---- message router ---------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'START_CAPTURE': {
          const meeting = await startCapture({
            tabId: msg.tabId ?? sender.tab?.id,
            title: msg.title,
            platform: msg.platform,
            meetingUrl: msg.meetingUrl,
          });
          sendResponse({ ok: true, meeting });
          break;
        }

        // Popup (or the live panel) asks for the mic permission page. If a
        // start payload is included, capture auto-starts once access is granted.
        case 'REQUEST_MIC_PERMISSION': {
          await openMicPermissionPage(msg.pendingStart || null);
          sendResponse({ ok: true });
          break;
        }

        // permission.html reports the outcome of its getUserMedia request.
        case 'MIC_PERMISSION_RESULT': {
          await onMicPermissionResult(!!msg.granted);
          sendResponse({ ok: true });
          break;
        }

        // Offscreen couldn't open the microphone mid-start → warn the user in
        // the meeting tab's live panel (remote audio is still captured).
        case 'MIC_DENIED': {
          const tabId = activeTabId ?? (await chrome.storage.local.get('activeTabId')).activeTabId;
          if (tabId != null) {
            chrome.tabs.sendMessage(tabId, { type: 'MIC_STATUS', ok: false }).catch(() => {});
          }
          break;
        }

        case 'STOP_CAPTURE': {
          const meeting = await finalizeMeeting(msg.model);
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
