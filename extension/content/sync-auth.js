// Bridges the web app's login session into the extension.
//
// The web dashboard stores its JWT in localStorage (`noteai_token` / `noteai_user`).
// The extension authenticates with `chrome.storage.local` (`token` / `user`).
// This content script — injected on the web app origin — mirrors the web session
// into extension storage so a user logged in on the app is already logged in on
// the extension (no separate popup login required).

(function () {
  const WEB_TOKEN_KEY = 'noteai_token';
  const WEB_USER_KEY = 'noteai_user';

  function readWebSession() {
    let token = null;
    let user = null;
    try {
      token = localStorage.getItem(WEB_TOKEN_KEY) || null;
      const rawUser = localStorage.getItem(WEB_USER_KEY);
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      // localStorage/JSON may be unavailable or malformed — treat as logged out.
    }
    return { token, user };
  }

  function sync({ token, user }) {
    if (!chrome?.storage?.local) return;
    if (token) {
      chrome.storage.local.set({ token, ...(user ? { user } : {}) });
    } else {
      chrome.storage.local.remove(['token', 'user']);
    }
  }

  // 1) Initial sync from whatever is already in localStorage on page load.
  sync(readWebSession());

  // 2) Live sync: the web app broadcasts on login/logout via window.postMessage.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'noteai' || data.type !== 'AUTH') return;
    sync({ token: data.token || null, user: data.user || null });
  });

  // 3) Live sync across tabs: `storage` events fire when other tabs change it.
  window.addEventListener('storage', (event) => {
    if (event.key !== WEB_TOKEN_KEY && event.key !== WEB_USER_KEY) return;
    sync(readWebSession());
  });
})();
