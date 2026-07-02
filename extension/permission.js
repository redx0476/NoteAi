// Full-tab extension page whose only job is to obtain the microphone
// permission for the extension origin. The offscreen document (which does the
// actual capture) and the action popup can't show a permission prompt, but a
// regular extension tab can. Once granted here, the permission persists and
// offscreen getUserMedia succeeds.

const show = (id) => {
  for (const s of ['asking', 'granted', 'denied']) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
};

async function request() {
  show('asking');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    show('granted');
    // Background closes this tab and (if a start was pending) begins capture.
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_RESULT', granted: true }).catch(() => {});
  } catch {
    show('denied');
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_RESULT', granted: false }).catch(() => {});
  }
}

document.getElementById('retry').addEventListener('click', request);
request();
