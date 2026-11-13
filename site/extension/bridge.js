// On the owner's Prism page only: says the extension is here, and passes the
// page's asks (pull, status, pin) to the extension and its answers back. It
// reads nothing itself.
(() => {
  const ASKS = ['pull', 'status', 'pin'];
  const say = (data) => window.postMessage({ ...data, from: 'extension' }, location.origin);
  say({ prism: 'extension', version: Number('__VERSION__') });
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.from !== 'page') return;
    if (event.data.prism === 'hello') say({ prism: 'extension', version: Number('__VERSION__') });
    if (!ASKS.includes(event.data.prism)) return;
    chrome.runtime.sendMessage({ ...event.data, from: undefined }, (answer) => {
      say({ ...(answer ?? {}), prism: event.data.prism === 'pull' ? 'items' : 'answer', id: event.data.id, error: answer?.error ?? chrome.runtime.lastError?.message ?? null });
    });
  });
})();
