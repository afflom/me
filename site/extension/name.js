// The accessible name of an element, as W3C Accessible Name and Description
// Computation 1.2 (https://www.w3.org/TR/accname-1.2/) computes it: what a
// screen reader says the element is. seen.js reads a service's own tab by
// this, so it needs no knowledge of how a service builds its page. Graded on
// the Web Platform Tests' own accname cases (test/oracle/corpus.json, kind
// accname). It reads the page only; it changes nothing on it.
(() => {
  // Roles whose name comes from their content (WAI-ARIA 1.2, "Name From: contents").
  const FROM_CONTENT = new Set(['button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'sectionhead', 'switch', 'tab', 'tooltip', 'treeitem', 'comment', 'term', 'caption', 'code', 'deletion', 'emphasis', 'insertion', 'mark', 'strong', 'subscript', 'superscript', 'time', 'legend']);
  // The role an element has, given or implied by its HTML element (HTML-AAM).
  function roleOf(el) {
    const given = (el.getAttribute('role') ?? '').trim().split(/\s+/)[0].toLowerCase();
    if (given) return given;
    const tag = el.localName;
    if (tag === 'a' || tag === 'area') return el.hasAttribute('href') ? 'link' : '';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      return { button: 'button', submit: 'button', reset: 'button', image: 'button', checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox' }[type] ?? 'textbox';
    }
    return { button: 'button', summary: 'button', td: 'cell', th: 'columnheader', tr: 'row', option: 'option', select: 'combobox', textarea: 'textbox', img: 'img', nav: 'navigation', main: 'main', article: 'article', aside: 'complementary', form: 'form', table: 'table', ul: 'list', ol: 'list', li: 'listitem', dialog: 'dialog', fieldset: 'group', figure: 'figure', caption: 'caption', legend: 'legend', code: 'code', del: 'deletion', ins: 'insertion', em: 'emphasis', strong: 'strong', sub: 'subscript', sup: 'superscript', mark: 'mark', time: 'time', hr: 'separator', progress: 'progressbar', meter: 'meter', output: 'status', section: '', header: '', footer: '' }[tag] ?? '';
  }
  // Hidden from everyone: not rendered, or aria-hidden (accname 2A).
  function hidden(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.getAttribute('aria-hidden') === 'true') return true;
      if (n.hidden && n.localName !== 'input') return true;
    }
    const style = getComputedStyle(el);
    return !el.isConnected || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
  }
  const inline = (el) => /^(inline|contents)$/.test(getComputedStyle(el).display);
  // A text node's words as rendered: its parent's text-transform applied.
  function rendered(node) {
    const words = node.textContent;
    const parent = node.parentElement;
    const transform = parent ? getComputedStyle(parent).textTransform : 'none';
    if (transform === 'uppercase') return words.toUpperCase();
    if (transform === 'lowercase') return words.toLowerCase();
    if (transform === 'capitalize') return words.replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());
    return words;
  }
  const joinable = (s) => s.replace(/\s+/g, ' ');
  // CSS generated content (accname 2F.ii): ::before and ::after, with any alternative text after "/".
  function generated(el, pseudo) {
    const content = getComputedStyle(el, pseudo).content;
    if (!content || content === 'none' || content === 'normal') return '';
    const alt = content.match(/\/\s*((?:"(?:[^"\\]|\\.)*"\s*)+)$/);
    const take = alt ? alt[1] : content;
    return [...take.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).join('');
  }
  // The value an embedded control contributes to a name it sits inside (accname 2C).
  function controlValue(el, role) {
    if (role === 'textbox' || role === 'searchbox') return el.value ?? el.textContent;
    if (role === 'combobox' || role === 'listbox') {
      if (el.localName === 'select') return [...el.selectedOptions].map((o) => o.textContent).join(' ');
      const chosen = el.querySelector('[aria-selected="true"]');
      return chosen ? chosen.textContent : el.value ?? '';
    }
    if (['range', 'slider', 'spinbutton', 'progressbar', 'scrollbar', 'meter'].includes(role)) return el.getAttribute('aria-valuetext') ?? el.getAttribute('aria-valuenow') ?? el.value ?? '';
    return null;
  }
  // Native text alternatives (accname 2E, HTML-AAM).
  function native(el, visited) {
    const tag = el.localName;
    if (tag === 'img' || tag === 'area' || (tag === 'input' && el.type === 'image')) {
      const alt = el.getAttribute('alt');
      if (alt !== null) return alt;
    }
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(el.type)) return el.value || (el.type === 'submit' ? 'Submit' : el.type === 'reset' ? 'Reset' : '');
    if (el.labels && el.labels.length && !['button', 'submit', 'reset', 'hidden'].includes(el.type)) {
      return [...el.labels].map((label) => text(label, { visited, inLabel: true, recursing: true })).join(' ');
    }
    if (tag === 'fieldset') { const legend = el.querySelector(':scope > legend'); if (legend) return text(legend, { visited, recursing: true }); }
    if (tag === 'figure') { const cap = el.querySelector(':scope > figcaption'); if (cap) return text(cap, { visited, recursing: true }); }
    if (tag === 'table') { const cap = el.querySelector(':scope > caption'); if (cap) return text(cap, { visited, recursing: true }); }
    if (tag === 'svg') { const title = el.querySelector(':scope > title'); if (title) return title.textContent; }
    return '';
  }
  // The text alternative of one node (accname 4.3.2).
  function text(node, { visited = new Set(), labelledby = false, recursing = false, inLabel = false, root = false } = {}) {
    if (node.nodeType === 3) return rendered(node);
    if (node.nodeType !== 1) return '';
    const el = node;
    if (visited.has(el)) return '';
    visited.add(el);
    const role = roleOf(el);
    // 2A: hidden and not directly referenced.
    if (!labelledby && hidden(el)) return '';
    // 2B: aria-labelledby, once.
    if (!labelledby) {
      const ids = (el.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/).filter(Boolean);
      const refs = ids.map((id) => el.ownerDocument.getElementById(id)).filter(Boolean);
      if (refs.length) {
        const name = refs.map((ref) => (ref === el ? (el.getAttribute('aria-label') ?? '').trim() || flat(el, visited) : text(ref, { visited: new Set([...visited].filter((v) => v !== ref)), labelledby: true, recursing: true }))).map((s) => s.trim()).filter(Boolean).join(' ');
        if (name.trim()) return name;
      }
    }
    // 2C: an embedded control inside a name being built gives its value.
    if (recursing && !root) {
      const value = controlValue(el, role);
      if (value !== null && (inLabel || labelledby || role !== 'textbox')) return value;
    }
    // 2D: aria-label.
    const label = (el.getAttribute('aria-label') ?? '').trim();
    if (label && !(recursing && controlValue(el, role) !== null)) return label;
    // 2E: the host language's own text alternative.
    if (!['presentation', 'none'].includes(role) || el.localName === 'img') {
      const own = native(el, visited);
      if (own.trim()) return own;
    }
    // 2F: name from content, when the role allows it or a name is being built.
    if (recursing || labelledby || FROM_CONTENT.has(role)) {
      const from = flat(el, visited);
      if (from.trim() || (recursing && from && !el.hasAttribute('title'))) return from;
    }
    // 2I: the tooltip.
    return el.getAttribute('title') ?? (el.localName === 'input' ? el.getAttribute('placeholder') ?? '' : '');
  }
  // Name from content: each child in turn, blocks set apart by spaces, with CSS generated content.
  function flat(el, visited) {
    let out = generated(el, '::before');
    const kids = el.localName === 'slot' ? el.assignedNodes() : [...(el.shadowRoot ?? el).childNodes];
    for (const child of kids) {
      const piece = text(child, { visited, recursing: true });
      if (child.nodeType === 1 && !inline(child)) out += ` ${piece} `;
      else out += piece;
    }
    out += generated(el, '::after');
    return out;
  }
  // The accessible name: whitespace collapsed and trimmed, as it is spoken.
  globalThis.prismName = (el) => joinable(text(el, { root: true })).trim();
  // An element's words as a reader hears them, whatever its role: its name when it has one, else its content.
  globalThis.prismWords = (el) => globalThis.prismName(el) || joinable(flat(el, new Set([el]))).trim();
})();
