// Small UI toolkit: escaped HTML templates, dialogs, toasts and shared widgets.

class SafeHtml {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

export function esc(value) {
  if (value === null || value === undefined || value === false) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function piece(value) {
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(piece).join('');
  return esc(value);
}

// Tagged template: every ${value} is escaped unless it is itself html`...` or raw().
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += piece(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

export function raw(text) {
  return new SafeHtml(String(text));
}

export function mount(el, content) {
  el.innerHTML = piece(content);
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

// ---------------------------------------------------------------- formatting

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso, withYear = true) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]}${withYear ? ` ${y}` : ''}`;
}

export function fmtDateSlash(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtWhen(isoTime) {
  if (!isoTime) return 'Never';
  const t = new Date(isoTime);
  const diff = Date.now() - t.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} hours ago`;
  if (diff < 7 * 86400000) return `${Math.round(diff / 86400000)} days ago`;
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function classLabel(std, section) {
  return section && section !== 'all' ? `Class ${std}-${section}` : `Class ${std}`;
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : (many || `${one}s`)}`;
}

export function pct(n) {
  return n === null || n === undefined ? '-' : `${Math.round(n * 10) / 10}%`;
}

export function grade(p) {
  if (p === null || p === undefined) return '-';
  if (p >= 91) return 'A1';
  if (p >= 81) return 'A2';
  if (p >= 71) return 'B1';
  if (p >= 61) return 'B2';
  if (p >= 51) return 'C1';
  if (p >= 41) return 'C2';
  if (p >= 33) return 'D';
  return 'E';
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ---------------------------------------------------------------- icons

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  check: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/><path d="M8.5 15l2.5 2.5 4.5-5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.4 0 4 1.5 4.5 4"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  teacher: '<circle cx="12" cy="7" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H3a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 3h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  link: '<path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/>'
};

export function icon(name) {
  return raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

// ---------------------------------------------------------------- toast

export function toast(message, kind = '') {
  // An open dialog sits above the page, so show the message inside it.
  const dlg = document.getElementById('modal');
  let area = document.getElementById('toasts');
  if (dlg && dlg.open) {
    area = dlg.querySelector('.toast-area');
    if (!area) {
      area = document.createElement('div');
      area.className = 'toast-area';
      area.setAttribute('role', 'status');
      dlg.appendChild(area);
    }
  }
  while (area.children.length >= 2) area.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  area.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 4000);
}

// ---------------------------------------------------------------- dialog

let dialogHandlers = {};
let dialogCloseResolve = null;

export function getDialogHandlers() {
  return dialogHandlers;
}

export function openDialog({ title, body, handlers = {}, wide = false, onClose }) {
  const dlg = document.getElementById('modal');
  dialogHandlers = handlers;
  dlg.style.width = wide ? 'min(980px, calc(100vw - 24px))' : '';
  mount(dlg, html`
    <div class="modal-head">
      <h2 id="modal-title">${title}</h2>
      <button class="btn ghost icon-btn" data-act="dialog-close" aria-label="Close">${icon('close')}</button>
    </div>
    <div class="modal-body" id="modal-body">${body}</div>
  `);
  dlg.onclose = () => {
    dialogHandlers = {};
    if (onClose) onClose();
    if (dialogCloseResolve) { const r = dialogCloseResolve; dialogCloseResolve = null; r(false); }
  };
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector('[autofocus], .modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return dlg;
}

export function setDialogBody(content) {
  const body = document.getElementById('modal-body');
  if (body) mount(body, content);
}

export function closeDialog() {
  const dlg = document.getElementById('modal');
  if (dlg.open) dlg.close();
}

export function confirmDialog(title, message, { ok = 'Yes', danger = false } = {}) {
  return new Promise(resolve => {
    openDialog({
      title,
      body: html`
        <p>${message}</p>
        <div class="form-actions">
          <button class="btn" data-act="dialog-close">Cancel</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-ok">${ok}</button>
        </div>`,
      handlers: {
        'confirm-ok': () => {
          dialogCloseResolve = null;
          closeDialog();
          resolve(true);
        }
      }
    });
    dialogCloseResolve = resolve;
  });
}

// Runs an async action with the button disabled; shows errors as a toast.
export async function busy(button, fn, label = 'Please wait...') {
  const btn = button && button.tagName ? button : null;
  const old = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = label;
  }
  try {
    return await fn();
  } catch (err) {
    toast(err.message || 'Something went wrong. Please try again.', 'bad');
    return undefined;
  } finally {
    if (btn && btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
}

// ---------------------------------------------------------------- shared widgets

export function chips(name, options, selected, { small = false, label = '' } = {}) {
  return html`<div class="chips" role="group" aria-label="${label || name}">
    ${label ? html`<span class="chip-label">${label}</span>` : ''}
    ${options.map(o => html`<button type="button" class="chip ${small ? 'small' : ''}" data-act="${name}" data-value="${o.value}" aria-pressed="${String(o.value) === String(selected)}">${o.label}</button>`)}
  </div>`;
}

export function barList(items, { valueLabel } = {}) {
  if (!items.length) return html`<p class="muted">No data yet.</p>`;
  return html`<div class="bars">${items.map(it => {
    const width = Math.max(0, Math.min(100, it.value || 0));
    return html`<div class="bar-row" title="${it.title || ''}">
      <div class="bar-label">${it.label}</div>
      <div class="bar-track" role="img" aria-label="${it.label}: ${valueLabel ? valueLabel(it) : `${width}%`}">
        <div class="bar-fill ${it.critical ? 'critical' : ''}" data-width="${width}"></div>
      </div>
      <div class="bar-value">${valueLabel ? valueLabel(it) : `${width}%`}${it.critical ? html` <span class="badge bad">Below pass</span>` : ''}</div>
    </div>`;
  })}</div>`;
}

// Inline style attributes are kept out of the HTML; widths are applied here.
export function applyBarWidths(root = document) {
  $$('.bar-fill[data-width], .progress > div[data-width]', root).forEach(el => { el.style.width = `${el.dataset.width}%`; });
}

export function waLink(number, text) {
  return `https://wa.me/91${number}?text=${encodeURIComponent(text || '')}`;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied.', 'good');
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
    toast('Copied.', 'good');
  }
}
