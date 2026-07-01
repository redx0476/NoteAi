// Microsoft Teams integration: marks platform and can auto-join (used by the bot).
globalThis.__MEETNOTES_PLATFORM = 'teams';

// Periodically scrape the participant roster (best-effort — Teams' DOM changes).
(function scrapeParticipants() {
  let lastSent = '';
  function collect() {
    const names = new Set();
    document
      .querySelectorAll('[data-tid^="roster"] [title], [data-tid="participantStatesInMeeting"] [title], li[role="listitem"] [title]')
      .forEach((el) => {
        const name = (el.getAttribute('title') || el.textContent || '').trim().split('\n')[0].trim();
        if (name && name.length <= 40 && /[a-zA-Z\u0900-\u097F]/.test(name)) names.add(name);
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

(function maybeAutoJoin() {
  const params = new URLSearchParams(location.search);
  if (params.get('meetnotes_autojoin') !== '1') return;
  const botName = params.get('meetnotes_name') || 'MeetNotes Bot';

  const deadline = Date.now() + 90_000;
  const timer = setInterval(() => {
    if (Date.now() > deadline) return clearInterval(timer);

    const nameInput = document.querySelector('input[placeholder*="name" i]');
    if (nameInput && !nameInput.value) {
      nameInput.value = botName;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Turn mic/cam off if toggles are on.
    document
      .querySelectorAll('[title*="Mute" i],[aria-label*="Turn camera off" i]')
      .forEach((b) => b.click());

    const join = [...document.querySelectorAll('button, [role="button"]')].find((b) =>
      /join now/i.test(b.textContent || '')
    );
    if (join) {
      join.click();
      clearInterval(timer);
      setTimeout(() => {
        chrome.storage.local.get('model', ({ model }) => {
          chrome.runtime.sendMessage({
            type: 'START_CAPTURE',
            platform: 'teams',
            title: document.title.replace(' | Microsoft Teams', '') || 'Meeting',
            meetingUrl: location.href,
            model,
          });
        });
      }, 8000);
    }
  }, 2000);
})();
