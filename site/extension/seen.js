// On a declared service's own tab: notes what the service's web app shows the
// owner, as its declaration in services.json says, and hands it to the
// extension. It changes nothing on the page and sends nothing anywhere else.
(async () => {
  const { services } = await (await fetch(chrome.runtime.getURL('services.json'))).json();
  const service = services.find((s) => s.seen && s.origins.some((o) => location.href.startsWith(o)));
  if (!service) return;
  const { seen } = service;
  const note = () => {
    const ids = new Set();
    for (const attr of seen.ids ?? []) {
      for (const el of document.querySelectorAll(`[${attr}]`)) {
        const value = el.getAttribute(attr);
        if (/^[0-9a-f]{12,20}$/.test(value)) ids.add(value);
      }
    }
    for (const attr of seen.permIds ?? []) {
      for (const el of document.querySelectorAll(`[${attr}]`)) {
        const m = el.getAttribute(attr).match(/(?:msg|thread)-f:(\d{15,20})/);
        if (m) ids.add(BigInt(m[1]).toString(16));
      }
    }
    let key = null;
    if (seen.key) {
      const pattern = new RegExp(seen.key);
      for (const script of document.scripts) {
        const m = script.textContent.match(pattern);
        if (m) { key = m[1]; break; }
      }
    }
    if (ids.size || key) chrome.runtime.sendMessage({ prism: 'seen', service: service.key, ids: [...ids], key });
  };
  note();
  let timer = null;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(note, 1500); }).observe(document.documentElement, { childList: true, subtree: true });
})();
