// Microsoft Teams join/leave/roster automation for the notetaker bot.
//
// Anonymous web-client join. Handles the "Continue on this browser"
// interstitial for teams.microsoft.com deep links; teams.live.com/meet joins
// directly. Best-effort in v1 — org policies can block anonymous joins, in
// which case we fail cleanly with join_blocked_or_not_found.
//
// All Teams-specific selectors live here (ported from extension/content/teams.js).

const JOIN_RE = /join now/i;
const ENDED_RE =
  /meeting has ended|you were removed|call ended|the meeting hasn't started|sign in to join|need permission/i;

/** Get past the interstitial, fill the guest name, mute, click Join now. */
async function requestJoin(page, botName) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(
        ({ name, joinRe }) => {
          // "Continue on this browser" interstitial (teams.microsoft.com links).
          const cont = [...document.querySelectorAll('button, a')].find((b) =>
            /continue on this browser|use the web app/i.test(b.textContent || '')
          );
          if (cont) {
            cont.click();
            return 'interstitial';
          }

          const nameInput = document.querySelector(
            'input[placeholder*="name" i], input[aria-label*="name" i]'
          );
          if (nameInput && !nameInput.value) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            ).set;
            setter.call(nameInput, name);
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          }

          // Turn mic/cam off if the pre-join toggles are on.
          document
            .querySelectorAll('[title*="Mute" i],[aria-label*="Turn camera off" i],[aria-label*="camera" i][aria-pressed="true"]')
            .forEach((b) => b.click());

          const re = new RegExp(joinRe, 'i');
          const join = [...document.querySelectorAll('button, [role="button"]')].find((b) =>
            re.test(b.textContent || '')
          );
          if (join && (!nameInput || nameInput.value)) {
            join.click();
            return 'joined';
          }
          return 'waiting';
        },
        { name: botName, joinRe: JOIN_RE.source }
      )
      .catch(() => 'waiting');
    if (state === 'joined') return;
    await page.waitForTimeout(2000);
  }
  throw new Error('join_blocked_or_not_found');
}

/** True once in the call (hang-up button present). */
function isInCall(page) {
  return page
    .evaluate(
      () =>
        !!document.querySelector(
          '[data-tid="hangup-main-btn"], [data-tid="hangup-button"], [aria-label*="Leave" i][role="button"], button[aria-label*="Leave" i]'
        )
    )
    .catch(() => false);
}

function isEnded(page) {
  return page
    .evaluate(
      (endedRe) => new RegExp(endedRe, 'i').test(document.body?.innerText || ''),
      ENDED_RE.source
    )
    .catch(() => true);
}

/** Wait in the lobby until admitted; throws on denial/timeout. */
async function waitForAdmission(page, timeoutMin) {
  const deadline = Date.now() + timeoutMin * 60_000;
  while (Date.now() < deadline) {
    if (await isInCall(page)) return;
    if (await isEnded(page)) throw new Error('join_denied_or_ended');
    await page.waitForTimeout(2000);
  }
  throw new Error('admission_timeout');
}

/** Attendee names (same heuristics as the extension content script). */
function scrapeParticipants(page) {
  return page
    .evaluate(() => {
      const names = new Set();
      document
        .querySelectorAll(
          '[data-tid^="roster"] [title], [data-tid="participantStatesInMeeting"] [title], li[role="listitem"] [title]'
        )
        .forEach((el) => {
          const name = (el.getAttribute('title') || el.textContent || '').trim().split('\n')[0].trim();
          if (name && name.length <= 40 && /[a-zA-Zऀ-ॿ]/.test(name)) names.add(name);
        });
      return [...names];
    })
    .catch(() => []);
}

/** Roster size is unreliable without the panel open — report names we can see. */
async function participantCount(page) {
  const names = await scrapeParticipants(page);
  return names.length;
}

async function leave(page) {
  await page
    .evaluate(() => {
      const btn = document.querySelector(
        '[data-tid="hangup-main-btn"], [data-tid="hangup-button"], button[aria-label*="Leave" i]'
      );
      if (btn) btn.click();
    })
    .catch(() => {});
  await page.waitForTimeout(1500);
}

module.exports = { requestJoin, waitForAdmission, isInCall, isEnded, scrapeParticipants, participantCount, leave };
