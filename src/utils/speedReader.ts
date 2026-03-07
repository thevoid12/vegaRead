const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'NOSCRIPT',
]);

/**
 * Strips elements and attributes that would be blocked by
 * sandbox="allow-same-origin" (no allow-scripts) in the iframe.
 *
 * In WebKit/Tauri, blocked scripts/handlers fire an error that can intercept
 * click events before they reach our addEventListener listeners. Sanitizing
 * upfront prevents those errors from appearing during normal reading too.
 */
export function sanitizeEpubHtml(html: string): string {
  return html
    // Remove <script>…</script> blocks (case-insensitive, dotall)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    // Remove self-closing <script … /> tags
    .replace(/<script\b[^>]*\/>/gi, '')
    // Remove inline event handler attributes: on* = "…" or '…'
    .replace(/\s+on[a-z][a-z0-9]*\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z][a-z0-9]*\s*=\s*'[^']*'/gi, '')
    // Remove javascript: hrefs / srcs
    .replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1=""')
    .replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1=''");
}

/**
 * Walks the parsed HTML DOM and wraps every non-whitespace word in
 * <span data-sr="N"> so the parent frame can highlight them by injecting
 * a targeted CSS rule into the iframe — no inline scripts needed inside
 * the sandboxed iframe.
 *
 * Returns the modified full-document HTML string and the total word count.
 */
export function wrapWordsInSpans(html: string): { html: string; wordCount: number } {
  const parser = new DOMParser();
  // sanitizeEpubHtml is a fast string-level pass; htmlContent is already sanitized
  // when called from ReadingView, but wrapWordsInSpans may also be called with raw html.
  const doc = parser.parseFromString(sanitizeEpubHtml(html), 'text/html');
  let idx = 0;

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!/\S/.test(text)) return; // pure whitespace — leave as-is

      const frag = doc.createDocumentFragment();
      // Split into alternating [word, whitespace] tokens to preserve spacing
      const tokens = text.split(/(\s+)/);
      for (const token of tokens) {
        if (/\S/.test(token)) {
          const span = doc.createElement('span');
          span.setAttribute('data-sr', String(idx++));
          span.textContent = token;
          frag.appendChild(span);
        } else {
          frag.appendChild(doc.createTextNode(token));
        }
      }
      node.parentNode?.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      // Snapshot childNodes before iterating — we mutate the list while walking
      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }
    }
  }

  walk(doc.body);
  return { html: doc.documentElement.outerHTML, wordCount: idx };
}

/**
 * Strips all HTML tags and returns the plain-text words in document order.
 * Used by Focus (RSVP) mode which only needs the word sequence, not the markup.
 *
 * Uses the same tree-walker + SKIP_TAGS logic as wrapWordsInSpans so that
 * word indices produced by both functions are always consistent.
 */
export function extractWords(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const words: string[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const parent = (node as Text).parentElement;
      if (parent && SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    for (const token of (node.textContent ?? '').split(/\s+/)) {
      if (token) words.push(token);
    }
  }
  return words;
}
