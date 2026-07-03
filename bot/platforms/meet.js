// Google Meet join/leave/roster automation for the notetaker bot.
//
// Selector strategy mirrors extension/content/meet.js (text regexes over
// brittle class names). All Meet-specific DOM knowledge lives here.

const JOIN_RE = /join now|ask to join/i;
const DENIED_RE =
  /you can't join|can’t join|denied your request|removed from the meeting|call ended|return to home screen|meeting hasn't started/i;

/** Fill the guest name, mute mic/cam, and click Join / Ask to join. */
async function requestJoin(page, botName) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const clicked = await page
      .evaluate(
        ({ name, joinRe }) => {
          const nameInput = document.querySelector(
            'input[aria-label*="name" i], input[placeholder*="name" i]'
          );
          if (nameInput && !nameInput.value) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            ).set;
            setter.call(nameInput, name);
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document
            .querySelectorAll(
              '[aria-label*="Turn off microphone" i],[aria-label*="Turn off camera" i]'
            )
            .forEach((b) => b.click());
          const re = new RegExp(joinRe, 'i');
          const join = [...document.querySelectorAll('button, [role="button"]')].find((b) =>
            re.test(b.textContent || '')
          );
          if (join && (!nameInput || nameInput.value)) {
            join.click();
            return true;
          }
          return false;
        },
        { name: botName, joinRe: JOIN_RE.source }
      )
      .catch(() => false);
    if (clicked) return;
    await page.waitForTimeout(1500);
  }
  throw new Error('join_button_not_found');
}

/** True once we're actually in the call (Leave button present). */
function isInCall(page) {
  return page
    .evaluate(() => !!document.querySelector('[aria-label*="Leave call" i]'))
    .catch(() => false);
}

/** True when the meeting ended / we were removed / join was denied. */
function isEnded(page) {
  return page
    .evaluate(
      (deniedRe) => new RegExp(deniedRe, 'i').test(document.body?.innerText || ''),
      DENIED_RE.source
    )
    .catch(() => true); // page gone → treat as ended
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
      document.querySelectorAll('[data-self-name], [data-participant-id]').forEach((el) => {
        const raw = (el.getAttribute('data-self-name') || el.textContent || '').trim();
        const name = raw.split('\n')[0].trim();
        if (name && name.length <= 40 && /[a-zA-Zऀ-ॿ]/.test(name) && !/^you$/i.test(name)) {
          names.add(name);
        }
      });
      return [...names];
    })
    .catch(() => []);
}

/** Participant tile count (includes the bot itself); 0 when unknown. */
function participantCount(page) {
  return page
    .evaluate(() => {
      const ids = new Set();
      document
        .querySelectorAll('[data-participant-id]')
        .forEach((el) => ids.add(el.getAttribute('data-participant-id')));
      return ids.size;
    })
    .catch(() => 0);
}

async function leave(page) {
  await page
    .evaluate(() => {
      const btn = document.querySelector('[aria-label*="Leave call" i]');
      if (btn) btn.click();
    })
    .catch(() => {});
  await page.waitForTimeout(1500);
}

module.exports = { requestJoin, waitForAdmission, isInCall, isEnded, scrapeParticipants, participantCount, leave };
