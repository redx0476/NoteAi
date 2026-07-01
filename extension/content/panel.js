// Floating, Otter-style live transcript panel injected into the meeting tab.
(function () {
  if (document.getElementById('meetnotes-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'meetnotes-panel';
  panel.innerHTML = `
    <div class="mn-head">
      <span class="mn-dot"></span>
      <span class="mn-title">MeetNotes</span>
      <span class="mn-badge">LIVE</span>
      <div class="mn-actions">
        <button class="mn-btn mn-min" title="Minimize">–</button>
      </div>
    </div>
    <div class="mn-body">
      <div class="mn-empty">Live transcript will appear here once you start notes.</div>
    </div>
    <div class="mn-interim" hidden></div>
  `;
  document.documentElement.appendChild(panel);

  const body = panel.querySelector('.mn-body');
  const interimEl = panel.querySelector('.mn-interim');
  panel.querySelector('.mn-min').addEventListener('click', () => panel.classList.toggle('mn-collapsed'));

  // Stable per-speaker accent colours.
  const palette = ['#8e7bff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#60a5fa'];
  const speakerColors = new Map();
  function colorFor(speaker) {
    if (!speakerColors.has(speaker)) speakerColors.set(speaker, palette[speakerColors.size % palette.length]);
    return speakerColors.get(speaker);
  }

  let lastSpeaker = null;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'LIVE_SEGMENT' || !msg.text) return;
    const empty = body.querySelector('.mn-empty');
    if (empty) empty.remove();

    if (msg.kind === 'interim') {
      interimEl.hidden = false;
      interimEl.innerHTML = `<span class="mn-spk" style="color:${colorFor(msg.speaker)}">${escapeHtml(msg.speaker || 'Speaker')}</span>
        <span class="mn-itext">${escapeHtml(msg.text)}</span>`;
      body.scrollTop = body.scrollHeight;
      return;
    }

    // Final line — commit it and clear the interim buffer.
    interimEl.hidden = true;
    interimEl.innerHTML = '';

    const line = document.createElement('div');
    line.className = 'mn-line';
    const color = colorFor(msg.speaker);
    const time = fmtTime(msg.tOffset);
    const showSpk = msg.speaker !== lastSpeaker;
    lastSpeaker = msg.speaker;
    line.innerHTML = `
      ${showSpk ? `<div class="mn-spk-row"><span class="mn-spk" style="color:${color}">${escapeHtml(msg.speaker || 'Speaker')}</span><span class="mn-time">${time}</span></div>` : ''}
      <div class="mn-text-row">
        <div class="mn-text" style="border-color:${color}33">${escapeHtml(msg.text)}</div>
        <button class="mn-star" title="Save highlight">★</button>
      </div>`;
    line.querySelector('.mn-star').addEventListener('click', (e) => {
      chrome.runtime.sendMessage({ type: 'ADD_HIGHLIGHT', text: msg.text, speaker: msg.speaker, tOffset: msg.tOffset }).catch(() => {});
      e.target.classList.add('mn-starred');
      e.target.textContent = '★';
    });
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  });

  function fmtTime(t) {
    const m = Math.floor((t || 0) / 60);
    const s = Math.floor((t || 0) % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
})();
