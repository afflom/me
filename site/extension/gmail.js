// On Gmail only: notes the ids of the messages the owner's own Gmail shows,
// and Gmail's key for this account, so the extension can read each message's
// original by GET. It changes nothing on the page and sends nothing anywhere.
(() => {
  const note = () => {
    const ids = new Set();
    for (const el of document.querySelectorAll('[data-legacy-message-id],[data-legacy-thread-id],[data-thread-perm-id],[data-message-id]')) {
      for (const value of [el.getAttribute('data-legacy-message-id'), el.getAttribute('data-legacy-thread-id')]) if (value && /^[0-9a-f]{12,20}$/.test(value)) ids.add(value);
      for (const value of [el.getAttribute('data-thread-perm-id'), el.getAttribute('data-message-id')]) {
        const m = value && value.match(/(?:msg|thread)-f:(\d{15,20})/);
        if (m) ids.add(BigInt(m[1]).toString(16));
      }
    }
    let ik = null;
    for (const script of document.scripts) {
      const m = script.textContent.match(/var GLOBALS=\[(?:[^,\]]*,){9}"([0-9a-f]{8,12})"/);
      if (m) { ik = m[1]; break; }
    }
    if (ids.size || ik) chrome.runtime.sendMessage({ prism: 'seen', ids: [...ids], ik });
  };
  note();
  new MutationObserver(() => { clearTimeout(note.t); note.t = setTimeout(note, 1500); }).observe(document.documentElement, { childList: true, subtree: true });
})();
