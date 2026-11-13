// On the owner's Prism page only: says the extension is here, and passes the
// page's pull to the extension and the items back. It reads nothing itself.
(() => {
  const say = (data) => window.postMessage({ ...data, prism: data.prism, from: 'extension' }, location.origin);
  say({ prism: 'extension', version: 1 });
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.from !== 'page') return;
    if (event.data.prism === 'hello') say({ prism: 'extension', version: 1 });
    if (event.data.prism !== 'pull') return;
    chrome.runtime.sendMessage({ prism: 'pull', halted: event.data.halted }, (answer) => {
      say({ prism: 'items', id: event.data.id, items: answer?.items ?? [], error: answer?.error ?? chrome.runtime.lastError?.message ?? null });
    });
  });
})();
