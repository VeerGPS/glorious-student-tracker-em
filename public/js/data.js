// Talks to the server and keeps the data the signed-in user can see.

const TOKEN_KEY = 'gps.token';
const SEL_KEY = 'gps.selection';

export const state = {
  token: safeGet(TOKEN_KEY),
  me: null,
  data: null
};

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode */ }
}

export function setToken(token) {
  state.token = token;
  safeSet(TOKEN_KEY, token);
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

let onAuthLost = () => {};
export function whenAuthLost(fn) {
  onAuthLost = fn;
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError('Cannot reach the school server. Check the internet / Wi-Fi connection and try again.', 0);
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => ({})) : {};
  if (res.status === 401 && state.token && data.code === 'AUTH') {
    onAuthLost();
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', res.status, data);
  return data;
}

// Downloads a file from the server (report cards) using the sign-in token.
export async function fetchFile(path) {
  const res = await fetch(`/api${path}`, { headers: state.token ? { Authorization: `Bearer ${state.token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'Could not prepare the file.', res.status, data);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  return { blob: await res.blob(), fileName: match ? match[1] : 'download' };
}

export async function refresh() {
  const data = await api('GET', '/bootstrap');
  state.data = data;
  state.me = data.me;
  indexData();
  return data;
}

// ---------------------------------------------------------------- lookups

let byId = new Map();
function indexData() {
  byId = new Map(state.data.students.map(s => [s.id, s]));
}

export function student(id) {
  return byId.get(id) || null;
}

export function students(std, section) {
  return state.data.students.filter(s => s.std === std && (!section || section === 'all' || s.section === section));
}

export function sections(std) {
  const set = new Set(state.data.students.filter(s => s.std === std).map(s => s.section));
  return set.size ? Array.from(set).sort() : ['A'];
}

export function tests(std) {
  return state.data.tests.filter(t => t.std === std).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name));
}

export function test(id) {
  return state.data.tests.find(t => t.id === id) || null;
}

export function replaceTest(record) {
  const i = state.data.tests.findIndex(t => t.id === record.id);
  if (i >= 0) state.data.tests[i] = record;
  else state.data.tests.push(record);
}

export function isAdmin() {
  return state.me && state.me.role === 'admin';
}

export function classesForUser() {
  return state.data ? state.data.classes : [];
}

// The class / section last chosen, shared by all pages.
export function selection() {
  const classes = classesForUser();
  let sel = {};
  try { sel = JSON.parse(safeGet(SEL_KEY) || '{}'); } catch { sel = {}; }
  let std = classes.includes(sel.std) ? sel.std : null;
  if (!std) {
    const withStudents = classes.find(c => state.data.students.some(s => s.std === c));
    std = withStudents || classes[0] || null;
  }
  const secs = std ? sections(std) : ['A'];
  let section = sel.section === 'all' || secs.includes(sel.section) ? sel.section : (secs.length > 1 ? 'all' : secs[0]);
  if (!section) section = 'all';
  return { std, section };
}

export function select(std, section) {
  safeSet(SEL_KEY, JSON.stringify({ std, section }));
}

// Marks entered for a test: how many of the expected cells are filled.
export function testProgress(t, section) {
  const kids = students(t.std, section);
  const expected = kids.length * t.papers.length;
  let filled = 0;
  kids.forEach(s => {
    const row = t.marks[s.id];
    if (row) t.papers.forEach(p => { if (row[p.id] !== undefined) filled += 1; });
  });
  return { filled, expected };
}

// Class average for a test (percent), across entered marks.
export function testAverage(t, section) {
  let obt = 0;
  let max = 0;
  students(t.std, section).forEach(s => {
    const row = t.marks[s.id];
    if (!row) return;
    t.papers.forEach(p => {
      const v = row[p.id];
      if (v === undefined) return;
      obt += v === 'AB' ? 0 : v;
      max += p.max;
    });
  });
  return max ? (obt / max) * 100 : null;
}

export function attendanceFor(std, section, date) {
  return state.data.attendance.find(a => a.std === std && a.section === section && a.date === date) || null;
}
