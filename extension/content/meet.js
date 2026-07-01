// Google Meet integration: marks platform and can auto-join (used by the bot).
globalThis.__MEETNOTES_PLATFORM = 'meet';

// Periodically scrape the participant roster so the dashboard can map speaker
// labels ("Speaker 1") to real attendee names. Best-effort — Meet's DOM changes,
// so selectors may need occasional updating.
(function scrapeParticipants() {
  let lastSent = '';
  function collect() {
    const names = new Set();
    // Self name + participant tiles / roster entries.
    document.querySelectorAll('[data-self-name], [data-participant-id]').forEach((el) => {
      const raw = (el.getAttribute('data-self-name') || el.textContent || '').trim();
      const name = raw.split('\n')[0].trim();
      if (name && name.length <= 40 && /[a-zA-Z\u0900-\u097F]/.test(name) && !/^you$/i.test(name)) {
        names.add(name);
      }
    });
    return [...names];
  }
  setInterval(() => {
    const names = collect();
    const key = names.sort().join('|');
    if (names.length && key !== lastSent) {
      lastSent = key;
      chrome.runtime.sendMessage({ type: 'PARTICIPANTS', names }).catch(() => {});
    }
  }, 12000);
})();

// Auto-join: used when the bot launches Chrome with ?meetnotes_autojoin=1.
// Fills the name, turns off mic/cam, and clicks "Join now" / "Ask to join".
(function maybeAutoJoin() {
  const params = new URLSearchParams(location.search);
  if (params.get('meetnotes_autojoin') !== '1') return;
  const botName = params.get('meetnotes_name') || 'MeetNotes Bot';

  const deadline = Date.now() + 60_000;
  const timer = setInterval(() => {
    if (Date.now() > deadline) return clearInterval(timer);

    // Type the bot's name if Meet asks for it (anonymous join).
    const nameInput = document.querySelector('input[aria-label*="name" i], input[placeholder*="name" i]');
    if (nameInput && !nameInput.value) {
      nameInput.value = botName;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Mute mic & camera before joining.
    document
      .querySelectorAll('[aria-label*="Turn off microphone" i],[aria-label*="Turn off camera" i]')
      .forEach((b) => b.click());

    // Click the join button.
    const join = [...document.querySelectorAll('button, [role="button"]')].find((b) =>
      /join now|ask to join/i.test(b.textContent || '')
    );
    if (join) {
      join.click();
      clearInterval(timer);
      // Once we're in, start recording to the signed-in (bot) account.
      setTimeout(() => {
        chrome.storage.local.get('model', ({ model }) => {
          chrome.runtime.sendMessage({
            type: 'START_CAPTURE',
            platform: 'meet',
            title: document.title.replace(' - Google Meet', '') || 'Meeting',
            meetingUrl: location.href,
            model,
          });
        });
      }, 6000);
    }
  }, 1500);
})();
