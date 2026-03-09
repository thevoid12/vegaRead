const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'NOSCRIPT',
]);


export function sanitizeEpubHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\s+on[a-z][a-z0-9]*\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z][a-z0-9]*\s*=\s*'[^']*'/gi, '')
    .replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1=""')
    .replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1=''");
}


export function wrapWordsInSpans(html: string): { html: string; wordCount: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizeEpubHtml(html), 'text/html');
  let idx = 0;

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!/\S/.test(text)) return; // pure whitespace — leave as-is

      const frag = doc.createDocumentFragment();
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
      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }
    }
  }

  walk(doc.body);
  return { html: doc.documentElement.outerHTML, wordCount: idx };
}


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
