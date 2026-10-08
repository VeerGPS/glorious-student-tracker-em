import { html, mount, icon, toast, openDialog, closeDialog, getDialogHandlers, busy, applyBarWidths } from './ui.js';
import { state, api, refresh, setToken, whenAuthLost, isAdmin } from './data.js';
import { legacySummary, importLegacyData, dismissLegacy } from './legacy.js';
import loginView from './views/login.js';
import parentView from './views/parent.js';
import homeView from './views/home.js';
import overviewView from './views/overview.js';
import attendanceView from './views/attendance.js';
import marksView from './views/marks.js';
import testView from './views/test.js';
import studentsView from './views/students.js';
import sendView from './views/send.js';
import teachersView from './views/teachers.js';
import settingsView from './views/settings.js';

const PARENT_KEY = 'gps.parentKey';
const app = document.getElementById('app');
let current = { view: null, handlers: {} };
let pollTimer = null;
let lastRouteKey = '';

function navItems() {
  const items = [
    isAdmin() ? { href: '#/overview', label: 'School', icon: 'chart', module: 'home' } : { href: '#/home', label: 'Home', icon: 'home', module: 'home' },
    { href: '#/attendance', label: 'Attendance', icon: 'check', module: 'attendance' },
    { href: '#/marks', label: 'Marks', icon: 'pen', module: 'marks' },
    { href: '#/students', label: 'Students', icon: 'users', module: 'students' },
    { href: '#/send', label: 'Send', icon: 'send', module: 'send' }
  ];
  if (isAdmin()) {
    items.push({ href: '#/teachers', label: 'Teachers', icon: 'teacher', module: 'teachers', desktopOnly: true });
    items.push({ href: '#/settings', label: 'Settings', icon: 'settings', module: 'settings', desktopOnly: true });
  }
  return items;
}

// Each section has its own colour (see the theme in app.css).
const MODULES = {
  attendance: { module: 'attendance', icon: 'check' },
  marks: { module: 'marks', icon: 'pen' },
  students: { module: 'students', icon: 'users' },
  send: { module: 'send', icon: 'send' },
  teachers: { module: 'teachers', icon: 'teacher' },
  settings: { module: 'settings', icon: 'settings' }
};

function moduleFor(route) {
  if (MODULES[route.name] && (isAdmin() || !['teachers', 'settings'].includes(route.name))) return MODULES[route.name];
  return { module: 'home', icon: isAdmin() ? 'chart' : 'home' };
}

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: parts[0] || '', id: parts[1] || null, params };
}

function viewFor(route) {
  switch (route.name) {
    case 'overview': return isAdmin() ? overviewView : homeView;
    case 'home': return isAdmin() ? overviewView : homeView;
    case 'attendance': return attendanceView;
    case 'marks': return route.id ? testView : marksView;
    case 'students': return studentsView;
    case 'send': return sendView;
    case 'teachers': return isAdmin() ? teachersView : homeView;
    case 'settings': return isAdmin() ? settingsView : homeView;
    default: return isAdmin() ? overviewView : homeView;
  }
}

export function navigate(path) {
  if (location.hash === path) renderRoute();
  else location.hash = path;
}

function renderShell() {
  const items = navItems();
  const route = parseRoute();
  const active = `#/${route.name || (isAdmin() ? 'overview' : 'home')}`;
  const link = it => html`<a href="${it.href}" data-module="${it.module}" ${it.href === active || (it.href === '#/overview' && active === '#/home') ? html`aria-current="page"` : ''}>${icon(it.icon)}<span>${it.label}</span></a>`;
  mount(app, html`
    <header class="topbar">
      <span class="logo" aria-hidden="true">${icon('school')}</span>
      <div class="brand">
        <strong>${state.data.school.name}</strong>
        <span>${state.me.name}${isAdmin() ? '' : ' · Teacher'}</span>
      </div>
      <nav class="nav" aria-label="Main">${items.map(link)}</nav>
      <button class="btn ghost icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button>
    </header>
    <main id="main"></main>
    <nav class="nav bottom" aria-label="Main">${items.filter(i => !i.desktopOnly).map(link)}</nav>
  `);
}

async function renderRoute({ keepScroll = false } = {}) {
  if (!state.data) return;
  const scrollY = window.scrollY;
  const route = parseRoute();
  const view = viewFor(route);
  const mod = moduleFor(route);
  document.body.dataset.module = mod.module;
  renderShell();
  const main = document.getElementById('main');
  const fresh = lastRouteKey !== `${route.name}/${route.id || ''}`;
  lastRouteKey = `${route.name}/${route.id || ''}`;
  const ctx = {
    main,
    route,
    fresh,
    navigate,
    rerender: () => renderRoute({ keepScroll: true }),
    reload: async () => { await refresh(); await renderRoute({ keepScroll: true }); }
  };
  current = { view, handlers: {} };
  try {
    current.handlers = (await view.render(ctx)) || {};
  } catch (err) {
    console.error(err);
    mount(main, html`<div class="card"><h2>Something went wrong</h2><p>${err.message}</p><button class="btn" data-act="reload-page">Reload</button></div>`);
  }
  const head = main.querySelector('.page-head > div:first-child');
  if (head && !head.querySelector('.head-icon')) head.insertAdjacentHTML('afterbegin', `<span class="head-icon" aria-hidden="true">${icon(mod.icon)}</span>`);
  applyBarWidths(main);
  window.scrollTo(0, keepScroll ? scrollY : 0);
}

// ---------------------------------------------------------------- events

const globalHandlers = {
  'dialog-close': () => closeDialog(),
  'reload-page': () => location.reload(),
  menu: () => openMenu(),
  go: el => { closeDialog(); navigate(el.dataset.href); },
  'sign-out': () => signOut(),
  'change-password': () => openChangePassword(),
  'legacy-import': el => busy(el, async () => {
    const counts = await importLegacyData();
    closeDialog();
    toast(`Copied: ${counts.studentsAdded} students, ${counts.marks} marks, ${counts.attendanceDays} attendance days.`, 'good');
    await refresh();
    renderRoute();
  }, 'Copying...'),
  'legacy-dismiss': () => { dismissLegacy(); renderRoute(); }
};

function handlerFor(name) {
  const dlg = document.getElementById('modal');
  const fromDialog = dlg.open ? getDialogHandlers()[name] : null;
  return fromDialog || current.handlers[name] || globalHandlers[name];
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = handlerFor(el.dataset.act);
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

for (const type of ['change', 'input']) {
  document.addEventListener(type, e => {
    const el = e.target.closest(`[data-${type}]`);
    if (!el) return;
    const fn = handlerFor(el.dataset[type]);
    if (fn) fn(el, e);
  });
}

document.addEventListener('keydown', e => {
  const el = e.target.closest('[data-keydown]');
  if (!el) return;
  const fn = handlerFor(el.dataset.keydown);
  if (fn) fn(el, e);
});

document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-submit]');
  if (!form) return;
  e.preventDefault();
  const fn = handlerFor(form.dataset.submit);
  if (fn) fn(form, e);
});

// Light-dismiss: clicking the dark backdrop closes the dialog.
document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeDialog();
});

window.addEventListener('hashchange', () => {
  if (current.view && current.view.isDirty && current.view.isDirty() && !confirm('You have changes that are not saved. Leave this page?')) {
    history.back();
    return;
  }
  renderRoute();
});

window.addEventListener('beforeunload', e => {
  if (current.view && current.view.isDirty && current.view.isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------------------------------------------------------------- menu & password

function openMenu() {
  const legacy = legacySummary();
  openDialog({
    title: 'Menu',
    body: html`
      <div class="menu-list">
        ${isAdmin() ? html`
          <button class="btn" data-act="go" data-href="#/teachers">${icon('teacher')} Teachers</button>
          <button class="btn" data-act="go" data-href="#/settings">${icon('settings')} Settings & WhatsApp</button>` : ''}
        <button class="btn" data-act="change-password">Change my password</button>
        ${legacy.total ? html`<button class="btn" data-act="legacy-import">Copy old data from this device (${legacy.students} students, ${legacy.marks} marks)</button>` : ''}
        <button class="btn danger" data-act="sign-out">Sign out</button>
      </div>`
  });
}

export function openChangePassword(forced = false) {
  const body = html`
    <form data-submit="save-password">
      ${forced ? html`<p>For safety, please choose your own office password now. Keep it secret.</p>` : ''}
      <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
      <label class="field"><span>New password</span><input type="password" name="next" minlength="6" autocomplete="new-password" required><small>At least 6 characters.</small></label>
      <label class="field"><span>New password again</span><input type="password" name="again" minlength="6" autocomplete="new-password" required></label>
      <div class="form-actions"><button class="btn primary" type="submit">Save password</button></div>
    </form>`;
  const handlers = {
    'save-password': form => {
      const f = new FormData(form);
      if (f.get('next') !== f.get('again')) { toast('The two new passwords do not match.', 'bad'); return; }
      busy(form.querySelector('button[type=submit]'), async () => {
        const res = await api('POST', '/me/password', { current: f.get('current'), next: f.get('next') });
        setToken(res.token);
        state.me = res.me;
        closeDialog();
        toast('Password changed.', 'good');
        if (forced) await start();
      });
    }
  };
  if (forced) {
    mount(app, html`<div class="login"><div class="card"><h1>Set a new password</h1>${body}</div></div>`);
    current = { view: null, handlers };
  } else {
    openDialog({ title: 'Change my password', body, handlers });
  }
}

function signOut() {
  closeDialog();
  setToken(null);
  state.me = null;
  state.data = null;
  clearInterval(pollTimer);
  location.hash = '';
  showLogin();
}

// ---------------------------------------------------------------- live updates

async function checkForChanges() {
  if (!state.data || document.hidden) return;
  try {
    const { revision } = await api('GET', '/revision');
    if (revision === state.data.revision) return;
    await refresh();
    const dirty = current.view && current.view.isDirty && current.view.isDirty();
    const active = document.activeElement;
    const typing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
    if (!dirty && !typing && !document.getElementById('modal').open) renderRoute({ keepScroll: true });
  } catch {
    // offline for a moment; try again next time
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForChanges(); });

// ---------------------------------------------------------------- start

function showLogin() {
  document.body.dataset.module = 'home';
  current = { view: loginView, handlers: {} };
  Promise.resolve(loginView.render({
    main: app,
    onTeacherOrOffice: async (token, me) => {
      setToken(token);
      state.me = me;
      await start();
    },
    onParent: key => {
      try { localStorage.setItem(PARENT_KEY, key); } catch { /* ignore */ }
      showParent(key);
    }
  })).then(h => { current.handlers = h || {}; });
}

function showParent(key) {
  document.body.dataset.module = 'home';
  current = { view: parentView, handlers: {} };
  Promise.resolve(parentView.render({
    main: app,
    key,
    onLeave: () => {
      try { localStorage.removeItem(PARENT_KEY); } catch { /* ignore */ }
      history.replaceState(null, '', location.pathname);
      showLogin();
    }
  })).then(h => { current.handlers = h || {}; applyBarWidths(app); });
}

async function start() {
  try {
    await refresh();
  } catch (err) {
    if (err.status === 401) { signOut(); return; }
    mount(app, html`<div class="login"><div class="card"><h1>Cannot open the app</h1><p>${err.message}</p><button class="btn primary" data-act="reload-page">Try again</button></div></div>`);
    return;
  }
  if (state.me.mustChangePassword) {
    openChangePassword(true);
    return;
  }
  await renderRoute();
  clearInterval(pollTimer);
  pollTimer = setInterval(checkForChanges, 20000);
}

whenAuthLost(() => {
  toast('Please sign in again.', 'bad');
  signOut();
});

(function boot() {
  const url = new URL(location.href);
  const parentKey = url.searchParams.get('p');
  if (parentKey) {
    try { localStorage.setItem(PARENT_KEY, parentKey); } catch { /* ignore */ }
    showParent(parentKey);
    return;
  }
  if (url.searchParams.get('student')) {
    // Links from the old version cannot be trusted; ask the parent to sign in instead.
    history.replaceState(null, '', location.pathname);
    showLogin();
    toast('Old report links no longer work. Please sign in as a parent with class, roll number and mobile number.');
    return;
  }
  if (state.token) {
    start();
    return;
  }
  let storedParent = null;
  try { storedParent = localStorage.getItem(PARENT_KEY); } catch { /* ignore */ }
  if (storedParent) showParent(storedParent);
  else showLogin();
})();

