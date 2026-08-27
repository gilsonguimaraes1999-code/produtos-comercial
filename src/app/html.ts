const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'table',
  'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

const ALLOWED_ATTRS = new Set(['alt', 'colspan', 'href', 'rowspan', 'src', 'style', 'target', 'title']);
const STYLE_ALLOWLIST = /^(color|background-color|font-size|font-family|font-weight|font-style|text-align|text-decoration|margin|padding|border|border-collapse|width|height)$/i;

function cleanUrl(value: string) {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return '';
}

function cleanStyle(value: string) {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(':');
      if (index === -1) return '';
      const name = part.slice(0, index).trim();
      const val = part.slice(index + 1).trim();
      if (!STYLE_ALLOWLIST.test(name) || /url\s*\(|expression\s*\(|javascript:/i.test(val)) return '';
      return `${name}: ${val}`;
    })
    .filter(Boolean)
    .join('; ');
}

function sanitizeNode(node: Node, documentRef: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return documentRef.createTextNode(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const source = node as HTMLElement;
  const tag = source.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = documentRef.createDocumentFragment();
    source.childNodes.forEach((child) => {
      const clean = sanitizeNode(child, documentRef);
      if (clean) fragment.appendChild(clean);
    });
    return fragment;
  }

  const output = documentRef.createElement(tag);
  Array.from(source.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || !ALLOWED_ATTRS.has(name)) return;
    if (name === 'href' || name === 'src') {
      const url = cleanUrl(attr.value);
      if (url) output.setAttribute(name, url);
      return;
    }
    if (name === 'style') {
      const style = cleanStyle(attr.value);
      if (style) output.setAttribute('style', style);
      return;
    }
    output.setAttribute(name, attr.value);
  });

  if (tag === 'a') {
    output.setAttribute('target', '_blank');
    output.setAttribute('rel', 'noopener noreferrer');
  }

  source.childNodes.forEach((child) => {
    const clean = sanitizeNode(child, documentRef);
    if (clean) output.appendChild(clean);
  });
  return output;
}

export function sanitizeHtml(html: string) {
  if (typeof document === 'undefined') return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = document.createDocumentFragment();
  template.content.childNodes.forEach((node) => {
    const clean = sanitizeNode(node, document);
    if (clean) fragment.appendChild(clean);
  });
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return wrapper.innerHTML.trim();
}
