'use strict';

const express = require('express');
const { hashPassword, verifyPassword, signToken, verifyToken, RateLimiter } = require('./auth');
const {
  newId, newKey, nowIso, todayIso, cleanText, cleanMultiline, normStd, normSection, normRoll, isIsoDate,
  parseMobiles, formatMobiles, canonicalSubject, normName, formatDate
} = require('./util');
const { buildReport, sortTests } = require('./reports');
const { renderReportCards, reportFileName } = require('./pdf');
const { importLegacy } = require('./legacy');

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function bad(message, extra) {
  throw new HttpError(400, message, extra);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function byNumber(a, b) {
  return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || String(a).localeCompare(String(b));
}

function sortStudents(list) {
  return list.slice().sort((a, b) => byNumber(a.std, b.std) || a.section.localeCompare(b.section) || a.roll - b.roll);
}

function eqi(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function isLocalHost(host) {
  const h = String(host || '').split(':')[0].toLowerCase();
  return !h || h === 'localhost' || h.startsWith('127.') || h.startsWith('10.') || h.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local');
}

function parseMarkValue(raw, max) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { clear: true };
  const s = String(raw).trim().toLowerCase();
  if (['ab', 'a', 'abs', 'absent'].includes(s)) return { value: 'AB' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: 'Enter a number, or AB for absent' };
  if (n < 0 || n > max) return { error: `Marks must be between 0 and ${max}` };
  return { value: Math.round(n * 100) / 100 };
}

function renderTemplate(text, ctx) {
  return text.replace(/\{(\w+)\}/g, (match, key) => (ctx[key] === undefined || ctx[key] === null ? '' : String(ctx[key])));
}

function createApi({ store, whatsapp, config = {} }) {
  const api = express.Router();
  const loginLimiter = new RateLimiter(30, 15 * 60000);
  const accountLimiter = new RateLimiter(8, 15 * 60000);
  const signupLimiter = new RateLimiter(5, 60 * 60000);
  const parentLoginLimiter = new RateLimiter(15, 15 * 60000);
  const parentKeyLimiter = new RateLimiter(60, 15 * 60000);
  const jobs = new Map();

  api.use(express.json({ limit: '25mb' }));
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (req, res) => {
    res.json({ ok: true, ready: store.ready, storage: store.kind });
  });

  api.use((req, res, next) => {
    if (store.ready) return next();
    res.status(503).json({ error: 'The school database is starting up. Please try again in a moment.', code: 'NOT_READY' });
  });

  // ---------------------------------------------------------------- helpers

  const settings = () => store.settings;
  const secret = () => config.sessionSecret || settings().tokenSecret;

  function publicUrl(req) {
    const configured = settings().school && settings().school.publicUrl;
    if (configured) return configured.replace(/\/+$/, '');
    const host = req.get('host');
    return isLocalHost(host) ? '' : `${req.protocol}://${host}`;
  }

  function canStd(user, std) {
    return user.all || user.stds.has(std);
  }

  function assertStd(user, std) {
    if (!std) bad('Choose a class.');
    if (!canStd(user, std)) throw new HttpError(403, `Class ${std} is not one of your classes.`);
  }

  function allClasses() {
    const set = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    store.list('students').forEach(s => set.add(s.std));
    store.list('tests').forEach(t => set.add(t.std));
    store.list('teachers').forEach(t => arr(t.classes).forEach(c => set.add(c)));
    return Array.from(set).sort(byNumber);
  }

  function teacherPublic(t) {
    const { pwHash, pwSalt, tokenVersion, ...rest } = t;
    return rest;
  }

  function meFor(user) {
    if (user.role === 'admin') {
      return { role: 'admin', id: 'admin', name: 'Principal / Office', mustChangePassword: Boolean(settings().admin.mustChange) };
    }
    const t = user.teacher;
    return { role: 'teacher', id: t.id, name: t.name, mobile: t.mobile, classes: t.classes.slice().sort(byNumber), subjects: t.subjects };
  }

  function adminToken() {
    return signToken({ r: 'admin', v: settings().admin.tokenVersion }, secret());
  }

  function teacherToken(t) {
    return signToken({ r: 'teacher', id: t.id, v: t.tokenVersion }, secret());
  }

  async function touchTeacher(user) {
    if (user.role !== 'teacher') return;
    const t = user.teacher;
    const last = t.lastActiveAt ? Date.parse(t.lastActiveAt) : 0;
    if (Date.now() - last < 5 * 60000) return;
    t.lastActiveAt = nowIso();
    await store.put('teachers', t, { quiet: true }).catch(() => {});
  }

  function authenticate(req, res, next) {
    const header = req.get('authorization') || '';
    const payload = header.startsWith('Bearer ') ? verifyToken(header.slice(7), secret()) : null;
    if (!payload) throw new HttpError(401, 'Please sign in again.', { code: 'AUTH' });
    if (payload.r === 'admin') {
      if (payload.v !== settings().admin.tokenVersion) throw new HttpError(401, 'Please sign in again.', { code: 'AUTH' });
      req.user = { role: 'admin', id: 'admin', name: 'Principal / Office', all: true, stds: null };
      const allowed = req.method === 'GET' || req.path === '/me/password';
      if (settings().admin.mustChange && !allowed) {
        throw new HttpError(403, 'Please set a new password first.', { code: 'CHANGE_PASSWORD' });
      }
    } else if (payload.r === 'teacher') {
      const t = store.get('teachers', payload.id);
      if (!t || t.status !== 'active' || t.tokenVersion !== payload.v) throw new HttpError(401, 'Please sign in again.', { code: 'AUTH' });
      req.user = { role: 'teacher', id: t.id, name: t.name, all: false, stds: new Set(t.classes), teacher: t };
    } else {
      throw new HttpError(401, 'Please sign in again.', { code: 'AUTH' });
    }
    next();
  }

  function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Only the principal / office can do this.');
    next();
  }

  // ------------------------------------------------------------ sign in

  api.post('/login', async (req, res) => {
    if (!loginLimiter.hit(req.ip)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
    const body = req.body || {};
    const password = typeof body.password === 'string' ? body.password : '';
    if (body.role === 'admin') {
      if (accountLimiter.isBlocked('admin')) throw new HttpError(429, 'Too many wrong passwords. Please wait 15 minutes.');
      const admin = settings().admin;
      if (!verifyPassword(password, admin.salt, admin.hash)) {
        accountLimiter.hit('admin');
        throw new HttpError(401, 'Wrong password.');
      }
      accountLimiter.clear('admin');
      return res.json({ token: adminToken(), me: meFor({ role: 'admin' }) });
    }
    if (body.role === 'teacher') {
      const mobile = parseMobiles(body.mobile)[0];
      if (!mobile) bad('Enter your 10-digit mobile number.');
      const key = `t:${mobile}`;
      if (accountLimiter.isBlocked(key)) throw new HttpError(429, 'Too many wrong passwords. Please wait 15 minutes.');
      const t = store.find('teachers', x => x.mobile === mobile);
      if (!t || !verifyPassword(password, t.pwSalt, t.pwHash)) {
        accountLimiter.hit(key);
        throw new HttpError(401, 'Mobile number or password is wrong.');
      }
      accountLimiter.clear(key);
      if (t.status === 'pending') throw new HttpError(403, 'Your account is waiting for approval from the principal / office.');
      if (t.status !== 'active') throw new HttpError(403, 'This account is turned off. Please contact the office.');
      t.lastActiveAt = nowIso();
      await store.put('teachers', t);
      return res.json({ token: teacherToken(t), me: meFor({ role: 'teacher', teacher: t }) });
    }
    bad('Choose Teacher or Office.');
  });

  function readTeacherInput(body, existing) {
    const name = cleanText(body.name !== undefined ? body.name : existing && existing.name, 80);
    if (!name) bad("Enter the teacher's name.");
    const mobile = parseMobiles(body.mobile !== undefined ? body.mobile : existing && existing.mobile)[0];
    if (!mobile) bad('Enter a valid 10-digit mobile number.');
    const clash = store.find('teachers', t => t.mobile === mobile && (!existing || t.id !== existing.id));
    if (clash) throw new HttpError(409, 'Another teacher already uses this mobile number.');
    const classes = [...new Set(arr(body.classes !== undefined ? body.classes : existing && existing.classes).map(normStd).filter(Boolean))].sort(byNumber);
    const subjects = [...new Set(arr(body.subjects !== undefined ? body.subjects : existing && existing.subjects).map(canonicalSubject).filter(Boolean))].slice(0, 20);
    return { name, mobile, classes, subjects };
  }

  function checkNewPassword(password) {
    if (typeof password !== 'string' || password.length < 6) bad('Password must have at least 6 characters.');
    if (password.length > 100) bad('Password is too long.');
  }

  api.post('/signup', async (req, res) => {
    if (!signupLimiter.hit(req.ip)) throw new HttpError(429, 'Too many requests. Please try again later.');
    const body = req.body || {};
    const data = readTeacherInput(body, null);
    checkNewPassword(body.password);
    if (!data.classes.length) bad('Choose the classes you teach.');
    const { salt, hash } = hashPassword(body.password);
    const t = { id: newId('t'), ...data, status: 'pending', pwSalt: salt, pwHash: hash, tokenVersion: 1, createdAt: nowIso(), updatedAt: nowIso(), lastActiveAt: null };
    await store.put('teachers', t);
    res.status(201).json({ ok: true });
  });

  // ------------------------------------------------------------ parents

  function parentData(req, student) {
    const tests = sortTests(store.filter('tests', t => t.std === student.std));
    const peers = store.filter('students', s => s.std === student.std && s.section === student.section);
    const overall = buildReport(store, student, null, { tests, peers });
    const byTest = tests
      .map(t => ({ id: t.id, name: t.name, date: t.date, report: buildReport(store, student, [t.id], { tests: [t], peers, skipAttendance: true }) }))
      .filter(t => t.report.rows.length)
      .reverse();
    return { school: settings().school, student: overall.student, overall, tests: byTest };
  }

  function studentByKey(req) {
    const key = String(req.params.key || '');
    const student = key.length >= 16 ? store.find('students', s => s.parentKey === key) : null;
    if (!student) {
      if (!parentKeyLimiter.hit(req.ip)) throw new HttpError(429, 'Too many attempts. Please wait and try again.');
      throw new HttpError(404, 'This link is not valid any more. Please ask the school for a new link, or sign in with class, roll number and mobile number.');
    }
    return student;
  }

  api.post('/parent/login', (req, res) => {
    if (!parentLoginLimiter.hit(req.ip)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
    const body = req.body || {};
    const std = normStd(body.std);
    const roll = normRoll(body.roll);
    const mobile = parseMobiles(body.mobile)[0];
    if (!std || !roll || !mobile) bad('Enter class, roll number and your 10-digit mobile number.');
    const section = body.section ? normSection(body.section) : null;
    const student = store.find('students', s => s.std === std && s.roll === roll && (!section || s.section === section)
      && parseMobiles(s.mobile).includes(mobile));
    if (!student) {
      throw new HttpError(404, 'No student found with these details. Check the class, roll number and the mobile number registered with the school.');
    }
    res.json({ key: student.parentKey });
  });

  api.get('/parent/:key', (req, res) => {
    res.json(parentData(req, studentByKey(req)));
  });

  api.get('/parent/:key/report.pdf', (req, res) => {
    const student = studentByKey(req);
    const testId = typeof req.query.test === 'string' && req.query.test !== 'all' ? req.query.test : null;
    const report = buildReport(store, student, testId ? [testId] : null);
    sendPdf(res, [report]);
  });

  function sendPdf(res, reports, fileName) {
    const pdf = renderReportCards(reports, settings().school);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${fileName || reportFileName(reports[0])}"`);
    res.send(pdf);
  }

  // ------------------------------------------------------------ signed in

  api.use(authenticate);

  api.get('/me', (req, res) => res.json({ me: meFor(req.user) }));

  api.post('/me/password', async (req, res) => {
    const body = req.body || {};
    checkNewPassword(body.next);
    if (req.user.role === 'admin') {
      const admin = settings().admin;
      if (!verifyPassword(String(body.current || ''), admin.salt, admin.hash)) bad('Your current password is wrong.');
      const { salt, hash } = hashPassword(body.next);
      Object.assign(admin, { salt, hash, mustChange: false, tokenVersion: admin.tokenVersion + 1 });
      await store.saveSettings();
      return res.json({ token: adminToken(), me: meFor(req.user) });
    }
    const t = req.user.teacher;
    if (!verifyPassword(String(body.current || ''), t.pwSalt, t.pwHash)) bad('Your current password is wrong.');
    const { salt, hash } = hashPassword(body.next);
    Object.assign(t, { pwSalt: salt, pwHash: hash, tokenVersion: t.tokenVersion + 1, updatedAt: nowIso() });
    await store.put('teachers', t);
    res.json({ token: teacherToken(t), me: meFor(req.user) });
  });

  api.get('/revision', (req, res) => res.json({ revision: store.revision }));

  api.get('/bootstrap', (req, res) => {
    const u = req.user;
    const inScope = x => canStd(u, x.std);
    const recentFrom = todayIso(new Date(Date.now() - 6 * 86400000));
    const totals = {};
    const attendance = [];
    store.list('attendance').forEach(rec => {
      if (!inScope(rec)) return;
      if (rec.date >= recentFrom) attendance.push(rec);
      Object.entries(rec.status || {}).forEach(([sid, st]) => {
        const t = totals[sid] || (totals[sid] = [0, 0, 0]);
        if (st === 'P') t[0] += 1;
        else if (st === 'A') t[1] += 1;
        else if (st === 'L') t[2] += 1;
      });
    });
    touchTeacher(u);
    res.json({
      revision: store.revision,
      today: todayIso(),
      me: meFor(u),
      school: settings().school,
      classes: u.all ? allClasses() : Array.from(u.stds).sort(byNumber),
      students: sortStudents(store.filter('students', inScope)),
      tests: sortTests(store.filter('tests', inScope)),
      attendance,
      attendanceTotals: totals,
      teachers: u.all ? store.list('teachers').map(teacherPublic) : [],
      whatsapp: whatsapp.status(false),
      storage: store.kind,
      publicUrl: publicUrl(req),
      legacyMigration: u.all && settings().legacyMigration ? { at: settings().legacyMigratedAt, ...settings().legacyMigration } : null
    });
  });

  // ------------------------------------------------------------ students

  function readStudent(body, existing) {
    const pick = key => (body[key] !== undefined ? body[key] : existing ? existing[key] : undefined);
    const std = normStd(pick('std'));
    if (!std) bad('Choose a class (1 to 12).');
    const roll = normRoll(pick('roll'));
    if (!roll) bad('Enter a roll number.');
    const name = cleanText(pick('name'), 80);
    if (!name) bad("Enter the student's name.");
    const mobileRaw = pick('mobile') || '';
    const mobiles = parseMobiles(mobileRaw);
    if (String(mobileRaw).replace(/\D/g, '') && !mobiles.length) bad('Mobile number should have 10 digits.');
    return { std, section: normSection(pick('section')), roll, name, grNo: cleanText(pick('grNo') || '', 30), mobile: formatMobiles(mobiles) };
  }

  function studentConflict(data, selfId, list) {
    const pool = list || store.list('students');
    const rollClash = pool.find(s => s.id !== selfId && s.std === data.std && s.section === data.section && s.roll === data.roll);
    if (rollClash) return `Roll number ${data.roll} is already used by ${rollClash.name} in Class ${data.std}-${data.section}.`;
    if (data.grNo) {
      const grClash = pool.find(s => s.id !== selfId && s.grNo && eqi(s.grNo, data.grNo));
      if (grClash) return `GR number ${data.grNo} is already used by ${grClash.name}.`;
    }
    return null;
  }

  function scopedStudent(req, id) {
    const s = store.get('students', id);
    if (!s || !canStd(req.user, s.std)) throw new HttpError(404, 'Student not found.');
    return s;
  }

  api.post('/students', async (req, res) => {
    const data = readStudent(req.body || {}, null);
    assertStd(req.user, data.std);
    const conflict = studentConflict(data, null);
    if (conflict) throw new HttpError(409, conflict);
    const doc = { id: newId('s'), ...data, parentKey: newKey(), createdAt: nowIso(), updatedAt: nowIso(), createdBy: req.user.id };
    await store.put('students', doc);
    res.status(201).json({ student: doc, revision: store.revision });
  });

  api.put('/students/:id', async (req, res) => {
    const existing = scopedStudent(req, req.params.id);
    const data = readStudent(req.body || {}, existing);
    assertStd(req.user, data.std);
    const conflict = studentConflict(data, existing.id);
    if (conflict) throw new HttpError(409, conflict);
    Object.assign(existing, data, { updatedAt: nowIso(), updatedBy: req.user.id });
    await store.put('students', existing);
    res.json({ student: existing, revision: store.revision });
  });

  api.delete('/students/:id', async (req, res) => {
    const s = scopedStudent(req, req.params.id);
    await store.remove('students', s.id);
    const tests = store.filter('tests', t => t.marks && t.marks[s.id]);
    for (const t of tests) {
      delete t.marks[s.id];
      await store.put('tests', t);
    }
    res.json({ ok: true, revision: store.revision });
  });

  api.post('/students/:id/new-link', async (req, res) => {
    const s = scopedStudent(req, req.params.id);
    s.parentKey = newKey();
    await store.put('students', s);
    res.json({ student: s, revision: store.revision });
  });

  // Upload of a student list. Rows: { roll, name, grNo, section, mobile, std? }
  api.post('/students/import', async (req, res) => {
    const body = req.body || {};
    const defaultStd = normStd(body.std);
    const rows = arr(body.rows).slice(0, 3000);
    if (!rows.length) bad('The file has no student rows.');
    const working = store.list('students').map(s => ({ ...s }));
    const plan = [];
    rows.forEach((row, i) => {
      const line = row && row.line ? row.line : i + 2;
      const std = normStd(row && row.std) || defaultStd;
      const name = cleanText(row && row.name, 80);
      const roll = normRoll(row && row.roll);
      const grNo = cleanText(row && row.grNo, 30);
      const section = row && row.section ? normSection(row.section) : null;
      const mobiles = parseMobiles(row && row.mobile);
      if (!name && !roll && !grNo) return;
      const fail = message => plan.push({ line, action: 'error', name, roll, message });
      if (!std) return fail('Class is missing.');
      if (!canStd(req.user, std)) return fail(`Class ${std} is not one of your classes.`);
      const sec = section || 'A';
      let match = grNo ? working.find(s => s.grNo && eqi(s.grNo, grNo)) : null;
      if (!match && roll) match = working.find(s => s.std === std && s.section === sec && s.roll === roll);
      if (!match && name) match = working.find(s => s.std === std && s.section === sec && eqi(s.name, name));
      // A different GR number means a different child, even if the roll number matches.
      if (match && grNo && match.grNo && !eqi(match.grNo, grNo)) match = null;
      if (match) {
        if (!canStd(req.user, match.std)) return fail(`GR ${grNo} belongs to a student in Class ${match.std}.`);
        const next = { ...match };
        const changes = [];
        if (name && name !== match.name) { next.name = name; changes.push('name'); }
        if (roll && roll !== match.roll) { next.roll = roll; changes.push('roll'); }
        if (section && section !== match.section) { next.section = section; changes.push('section'); }
        if (std !== match.std) { next.std = std; changes.push('class'); }
        if (grNo && grNo !== match.grNo) { next.grNo = grNo; changes.push('GR'); }
        if (mobiles.length && formatMobiles(mobiles) !== match.mobile) { next.mobile = formatMobiles(mobiles); changes.push('mobile'); }
        if (!changes.length) return plan.push({ line, action: 'same', id: match.id, name: match.name, roll: match.roll });
        const conflict = studentConflict(next, match.id, working);
        if (conflict) return fail(conflict);
        Object.assign(match, next);
        return plan.push({ line, action: 'update', id: match.id, name: next.name, roll: next.roll, changes });
      }
      if (!name) return fail('Name is missing.');
      const sectionRolls = working.filter(s => s.std === std && s.section === sec).map(s => s.roll);
      const doc = {
        id: newId('s'), std, section: sec, roll: roll || (sectionRolls.length ? Math.max(...sectionRolls) + 1 : 1),
        name, grNo, mobile: formatMobiles(mobiles), parentKey: newKey(), createdAt: nowIso(), updatedAt: nowIso(), createdBy: req.user.id
      };
      const conflict = studentConflict(doc, null, working);
      if (conflict) return fail(conflict);
      working.push(doc);
      plan.push({ line, action: 'add', id: doc.id, name, roll: doc.roll, doc });
    });

    const summary = {
      added: plan.filter(p => p.action === 'add').length,
      updated: plan.filter(p => p.action === 'update').length,
      unchanged: plan.filter(p => p.action === 'same').length,
      errors: plan.filter(p => p.action === 'error').map(({ line, name, roll, message }) => ({ line, name, roll, message })),
      rows: plan.slice(0, 1000).map(({ doc, ...rest }) => rest)
    };
    if (body.dryRun) return res.json(summary);
    const changed = working.filter(s => plan.some(p => (p.action === 'add' || p.action === 'update') && p.id === s.id));
    await Promise.all(changed.map(s => {
      const existing = store.get('students', s.id);
      const doc = existing ? Object.assign(existing, s, { updatedAt: nowIso(), updatedBy: req.user.id }) : s;
      return store.put('students', doc);
    }));
    res.json({ ...summary, revision: store.revision });
  });

  // ------------------------------------------------------------ tests & marks

  function readPapers(input, existingPapers) {
    const papers = arr(input);
    if (!papers.length) bad('Add at least one subject.');
    if (papers.length > 40) bad('A test can have at most 40 subjects.');
    const out = papers.map(p => {
      const subject = canonicalSubject(p && p.subject);
      if (!subject) bad('Every subject needs a name.');
      const max = Number(p.max);
      if (!(max > 0 && max <= 1000)) bad(`Enter the maximum marks for ${subject}.`);
      const date = p.date ? String(p.date) : '';
      if (date && !isIsoDate(date)) bad(`Check the date for ${subject}.`);
      const keep = p.id && arr(existingPapers).find(e => e.id === p.id);
      return { id: keep ? p.id : newId('p'), subject, max: Math.round(max * 100) / 100, date, topic: cleanText(p.topic, 60) };
    });
    const seen = new Set();
    out.forEach(p => {
      const key = `${p.subject}|${p.date}|${normName(p.topic)}`;
      if (seen.has(key)) bad(`${p.subject} is listed twice. Give one of them a different date or topic.`);
      seen.add(key);
    });
    return out;
  }

  function readTestName(name) {
    const n = cleanText(name, 80);
    if (!n) bad('Give the test a name, for example "Unit Test 1".');
    return n;
  }

  function nameClash(std, name, selfId) {
    return store.find('tests', t => t.std === std && t.id !== selfId && normName(t.name) === normName(name));
  }

  function scopedTest(req, id) {
    const t = store.get('tests', id);
    if (!t || !canStd(req.user, t.std)) throw new HttpError(404, 'Test not found.');
    return t;
  }

  api.post('/tests', async (req, res) => {
    const body = req.body || {};
    const std = normStd(body.std);
    assertStd(req.user, std);
    const name = readTestName(body.name);
    if (!isIsoDate(body.date)) bad('Choose the test date.');
    if (nameClash(std, name)) throw new HttpError(409, `Class ${std} already has a test called "${name}".`);
    const test = { id: newId('test'), std, name, date: body.date, papers: readPapers(body.papers, []), marks: {}, createdBy: req.user.id, createdAt: nowIso(), updatedAt: nowIso(), updatedBy: req.user.id };
    await store.put('tests', test);
    res.status(201).json({ test, revision: store.revision });
  });

  api.put('/tests/:id', async (req, res) => {
    const test = scopedTest(req, req.params.id);
    const body = req.body || {};
    const name = body.name !== undefined ? readTestName(body.name) : test.name;
    if (nameClash(test.std, name, test.id)) throw new HttpError(409, `Class ${test.std} already has a test called "${name}".`);
    const date = body.date !== undefined ? body.date : test.date;
    if (!isIsoDate(date)) bad('Choose the test date.');
    let papers = test.papers;
    if (body.papers !== undefined) {
      papers = readPapers(body.papers, test.papers);
      for (const p of papers) {
        const tooHigh = Object.values(test.marks).some(row => typeof row[p.id] === 'number' && row[p.id] > p.max);
        if (tooHigh) bad(`Some students already have more than ${p.max} marks in ${p.subject}. Correct those marks first.`);
      }
      const keep = new Set(papers.map(p => p.id));
      Object.values(test.marks).forEach(row => Object.keys(row).forEach(pid => { if (!keep.has(pid)) delete row[pid]; }));
    }
    Object.assign(test, { name, date, papers, updatedAt: nowIso(), updatedBy: req.user.id });
    await store.put('tests', test);
    res.json({ test, revision: store.revision });
  });

  api.delete('/tests/:id', async (req, res) => {
    const test = scopedTest(req, req.params.id);
    await store.remove('tests', test.id);
    res.json({ ok: true, revision: store.revision });
  });

  api.patch('/tests/:id/marks', async (req, res) => {
    const test = scopedTest(req, req.params.id);
    const changes = arr(req.body && req.body.changes).slice(0, 20000);
    const errors = [];
    const apply = [];
    changes.forEach(c => {
      const student = c && store.get('students', c.studentId);
      const paper = c && test.papers.find(p => p.id === c.paperId);
      if (!student || student.std !== test.std || !paper) {
        errors.push({ studentId: c && c.studentId, paperId: c && c.paperId, message: 'Unknown student or subject' });
        return;
      }
      const parsed = parseMarkValue(c.value, paper.max);
      if (parsed.error) errors.push({ studentId: student.id, paperId: paper.id, message: `${student.name} - ${paper.subject}: ${parsed.error}` });
      else apply.push({ sid: student.id, pid: paper.id, ...parsed });
    });
    if (errors.length) throw new HttpError(400, errors[0].message, { errors });
    apply.forEach(({ sid, pid, clear, value }) => {
      if (clear) {
        if (test.marks[sid]) {
          delete test.marks[sid][pid];
          if (!Object.keys(test.marks[sid]).length) delete test.marks[sid];
        }
      } else {
        test.marks[sid] = test.marks[sid] || {};
        test.marks[sid][pid] = value;
      }
    });
    test.updatedAt = nowIso();
    test.updatedBy = req.user.id;
    await store.put('tests', test);
    res.json({ test, saved: apply.length, revision: store.revision });
  });

  // Upload of marks from Excel (already read into rows by the browser).
  api.post('/tests/import', async (req, res) => {
    const body = req.body || {};
    const std = normStd(body.std);
    assertStd(req.user, std);
    let test = body.testId ? scopedTest(req, body.testId) : null;
    if (test && test.std !== std) bad('This test belongs to a different class.');
    const name = test ? test.name : readTestName(body.name);
    if (!test) test = nameClash(std, name) || null;
    const isNewTest = !test;
    const date = isIsoDate(body.date) ? body.date : (test && test.date) || todayIso();
    const incoming = readPapers(body.papers, []);

    // Reuse the test's existing subjects where subject, date and topic match.
    const existingPapers = test ? test.papers.map(p => ({ ...p })) : [];
    const paperIds = incoming.map(p => {
      const found = existingPapers.find(e => e.subject === p.subject && (e.date || '') === (p.date || '') && normName(e.topic) === normName(p.topic));
      if (found) {
        found.max = p.max;
        return found.id;
      }
      existingPapers.push(p);
      return p.id;
    });
    const papers = existingPapers;
    const paperMax = id => papers.find(p => p.id === id).max;

    const classStudents = store.filter('students', s => s.std === std);
    const newStudents = [];
    const unmatched = [];
    const invalid = [];
    const cells = [];
    const seen = new Map();
    const addMissing = body.addMissingStudents !== false;

    arr(body.rows).slice(0, 3000).forEach((row, i) => {
      const line = row && row.line ? row.line : i + 2;
      const roll = normRoll(row && row.roll);
      const name = cleanText(row && row.name, 80);
      const grNo = cleanText(row && row.grNo, 30);
      const section = row && row.section ? normSection(row.section) : null;
      if (!roll && !name && !grNo) return;
      let student = grNo ? classStudents.find(s => s.grNo && eqi(s.grNo, grNo)) : null;
      if (!student && roll) {
        const byRoll = classStudents.filter(s => s.roll === roll && (!section || s.section === section));
        if (byRoll.length === 1) student = byRoll[0];
        else if (byRoll.length > 1) {
          const byName = name ? byRoll.find(s => eqi(s.name, name)) : null;
          if (byName) student = byName;
          else { unmatched.push({ line, name, roll, reason: `Roll ${roll} is in more than one section; add a Section column` }); return; }
        }
      }
      if (!student && name) student = classStudents.find(s => eqi(s.name, name) && (!section || s.section === section));
      if (!student) {
        if (!addMissing || !name) {
          unmatched.push({ line, name, roll, reason: name ? 'Not in the student list' : 'Name is missing' });
          return;
        }
        const sec = section || 'A';
        const taken = new Set(classStudents.filter(s => s.section === sec).map(s => s.roll));
        let r = roll;
        if (!r || taken.has(r)) {
          if (r) { unmatched.push({ line, name, roll, reason: `Roll ${r} belongs to another student` }); return; }
          r = taken.size ? Math.max(...taken) + 1 : 1;
        }
        student = { id: newId('s'), std, section: sec, roll: r, name, grNo: grNo && !store.find('students', s => s.grNo && eqi(s.grNo, grNo)) ? grNo : '', mobile: '', parentKey: newKey(), createdAt: nowIso(), updatedAt: nowIso(), createdBy: req.user.id };
        classStudents.push(student);
        newStudents.push(student);
      }
      if (seen.has(student.id)) unmatched.push({ line, name, roll, reason: `Same student as line ${seen.get(student.id)}; the later line is used` });
      seen.set(student.id, line);
      arr(row.values).forEach((raw, idx) => {
        if (idx >= paperIds.length) return;
        const pid = paperIds[idx];
        const parsed = parseMarkValue(raw, paperMax(pid));
        if (parsed.clear) return;
        if (parsed.error) {
          invalid.push({ line, name: student.name, subject: papers.find(p => p.id === pid).subject, value: String(raw).slice(0, 20), message: parsed.error });
          return;
        }
        cells.push({ sid: student.id, pid, value: parsed.value });
      });
    });

    const current = test ? test.marks : {};
    const overwrites = cells.filter(c => current[c.sid] && current[c.sid][c.pid] !== undefined && current[c.sid][c.pid] !== c.value).length;
    const summary = {
      test: { id: test ? test.id : null, name, isNew: isNewTest, date },
      papers: incoming.map((p, i) => ({ ...p, id: paperIds[i], isNew: !(test && test.papers.some(e => e.id === paperIds[i])) })),
      students: seen.size,
      newStudents: newStudents.map(s => ({ name: s.name, roll: s.roll, section: s.section })),
      unmatched,
      invalid,
      marks: cells.length,
      overwrites
    };
    if (body.dryRun) return res.json(summary);
    if (!cells.length && !newStudents.length) bad('No marks were found in the file.');
    if (invalid.length) bad(`${invalid.length} mark(s) in the file are not valid. Fix them and upload again.`, { invalid });

    await Promise.all(newStudents.map(s => store.put('students', s)));
    if (!test) {
      test = { id: newId('test'), std, name, date, papers: [], marks: {}, createdBy: req.user.id, createdAt: nowIso() };
    }
    test.papers = papers;
    if (isNewTest) test.date = papers.map(p => p.date).filter(Boolean).sort()[0] || date;
    cells.forEach(({ sid, pid, value }) => {
      test.marks[sid] = test.marks[sid] || {};
      test.marks[sid][pid] = value;
    });
    test.updatedAt = nowIso();
    test.updatedBy = req.user.id;
    await store.put('tests', test);
    summary.test.id = test.id;
    res.json({ ...summary, testRecord: test, revision: store.revision });
  });

  // ------------------------------------------------------------ attendance

  api.get('/attendance', (req, res) => {
    const std = normStd(req.query.std);
    assertStd(req.user, std);
    const section = normSection(req.query.section);
    const date = String(req.query.date || '');
    if (!isIsoDate(date)) bad('Choose a date.');
    res.json({ record: store.get('attendance', `${date}_${std}_${section}`) });
  });

  api.put('/attendance', async (req, res) => {
    const body = req.body || {};
    const std = normStd(body.std);
    assertStd(req.user, std);
    const section = normSection(body.section);
    if (!isIsoDate(body.date)) bad('Choose a date.');
    if (body.date > todayIso(new Date(Date.now() + 86400000))) bad('Attendance cannot be saved for a future date.');
    const status = {};
    Object.entries(body.status || {}).forEach(([sid, st]) => {
      const s = store.get('students', sid);
      if (s && s.std === std && s.section === section && ['P', 'A', 'L'].includes(st)) status[sid] = st;
    });
    if (!Object.keys(status).length) bad('There are no students to mark.');
    const id = `${body.date}_${std}_${section}`;
    const record = { id, date: body.date, std, section, status, takenBy: req.user.id, takenByName: req.user.name, updatedAt: nowIso() };
    await store.put('attendance', record);
    res.json({ record, revision: store.revision });
  });

  // ------------------------------------------------------------ report cards

  function pickStudents(req, source) {
    let students = [];
    if (source.students) {
      students = String(source.students).split(',').map(id => store.get('students', id.trim())).filter(Boolean);
    } else if (source.std) {
      const std = normStd(source.std);
      const section = source.section ? normSection(source.section) : null;
      students = store.filter('students', s => s.std === std && (!section || s.section === section));
    }
    students = students.filter(s => canStd(req.user, s.std));
    if (!students.length) throw new HttpError(404, 'No students found for these report cards.');
    return sortStudents(students);
  }

  function pickTestIds(value) {
    if (!value || value === 'all') return null;
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
  }

  api.get('/report-cards.pdf', (req, res) => {
    const students = pickStudents(req, req.query);
    const testIds = pickTestIds(req.query.tests);
    const reports = students.map(s => buildReport(store, s, testIds));
    let fileName;
    if (reports.length > 1) {
      const first = reports[0].student;
      fileName = `Report_Cards_Class${first.std}${req.query.section ? normSection(req.query.section) : ''}.pdf`;
    }
    sendPdf(res, reports, fileName);
  });

  // ------------------------------------------------------------ messages

  function buildMessages(req, body) {
    const text = cleanMultiline(body.text, 1500);
    if (!text) bad('Write the message first.');
    const ids = arr(body.studentIds).slice(0, 2000);
    const students = sortStudents(ids.map(id => store.get('students', id)).filter(s => s && canStd(req.user, s.std)));
    if (!students.length) bad('Choose at least one student.');
    const testIds = arr(body.testIds).filter(x => typeof x === 'string');
    const date = isIsoDate(body.date) ? body.date : todayIso();
    const base = publicUrl(req);
    const needsReport = Boolean(body.attachReport) || /\{(percent|grade|test|rank)\}/.test(text);
    const school = settings().school || {};
    return students.map(s => {
      const report = needsReport ? buildReport(store, s, testIds.length ? testIds : null) : null;
      const ctx = {
        name: s.name,
        first: s.name.split(' ')[0],
        class: `${s.std}-${s.section}`,
        roll: s.roll,
        date: formatDate(date),
        school: school.name || '',
        link: base ? `${base}/?p=${s.parentKey}` : '',
        test: report ? report.title : '',
        percent: report && report.total.pct !== null ? `${report.total.pct}%` : '',
        grade: report ? report.total.grade : '',
        rank: report && report.rank ? `${report.rank.rank} of ${report.rank.of}` : ''
      };
      return { student: s, numbers: parseMobiles(s.mobile), text: renderTemplate(text, ctx).replace(/\n{3,}/g, '\n\n').trim(), report };
    });
  }

  api.post('/messages/preview', (req, res) => {
    const items = buildMessages(req, req.body || {});
    res.json({
      whatsapp: whatsapp.status(false),
      items: items.map(({ student, numbers, text, report }) => ({
        studentId: student.id, name: student.name, std: student.std, section: student.section, roll: student.roll,
        numbers, text, percent: report ? report.total.pct : null, hasMarks: report ? report.rows.length > 0 : null
      }))
    });
  });

  api.post('/messages/send', async (req, res) => {
    const body = req.body || {};
    if (!whatsapp.isConnected()) {
      throw new HttpError(409, 'The school WhatsApp is not linked. Use the "Open WhatsApp" buttons instead, or ask the office to link WhatsApp.', { code: 'WA_NOT_LINKED' });
    }
    const items = buildMessages(req, body);
    const attach = Boolean(body.attachReport);
    const job = {
      id: newId('job'),
      owner: req.user.id,
      createdAt: Date.now(),
      total: items.length,
      done: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      cancelled: false,
      finished: false,
      items: items.map(i => ({ studentId: i.student.id, name: i.student.name, roll: i.student.roll, status: 'waiting', note: '' }))
    };
    jobs.set(job.id, job);
    for (const [id, j] of jobs) if (Date.now() - j.createdAt > 6 * 3600000) jobs.delete(id);

    (async () => {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const state = job.items[i];
        if (job.cancelled) {
          state.status = 'cancelled';
          continue;
        }
        if (!item.numbers.length) {
          state.status = 'skipped';
          state.note = 'No mobile number saved';
          job.skipped += 1;
          job.done += 1;
          continue;
        }
        if (attach && item.report && !item.report.rows.length) {
          state.status = 'skipped';
          state.note = 'No marks entered yet';
          job.skipped += 1;
          job.done += 1;
          continue;
        }
        state.status = 'sending';
        const errors = [];
        let ok = 0;
        let pdf = null;
        if (attach) pdf = renderReportCards([item.report], settings().school);
        for (const number of item.numbers) {
          try {
            if (pdf) await whatsapp.sendDocument(number, pdf, reportFileName(item.report), item.text);
            else await whatsapp.sendText(number, item.text);
            ok += 1;
          } catch (err) {
            errors.push(err.message);
          }
        }
        state.status = ok ? 'sent' : 'failed';
        state.note = ok ? `Sent to ${ok} number${ok > 1 ? 's' : ''}${errors.length ? ` (${errors.join('; ')})` : ''}` : errors.join('; ');
        if (ok) job.sent += 1;
        else job.failed += 1;
        job.done += 1;
      }
      job.finished = true;
    })().catch(err => {
      job.finished = true;
      job.error = err.message;
    });

    res.status(202).json({ job });
  });

  api.get('/messages/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || (job.owner !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Not found.');
    res.json({ job });
  });

  api.post('/messages/jobs/:id/cancel', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || (job.owner !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Not found.');
    job.cancelled = true;
    res.json({ job });
  });

  // ------------------------------------------------------------ WhatsApp link

  api.get('/whatsapp/status', (req, res) => {
    res.json(whatsapp.status(req.user.role === 'admin'));
  });

  api.post('/whatsapp/link', adminOnly, async (req, res) => {
    res.json(await whatsapp.link(Boolean(req.body && req.body.fresh)));
  });

  api.post('/whatsapp/unlink', adminOnly, async (req, res) => {
    await whatsapp.unlink();
    res.json(whatsapp.status(true));
  });

  // ------------------------------------------------------------ old data

  api.post('/import/legacy', async (req, res) => {
    const body = req.body || {};
    const counts = await importLegacy(store, {
      students: arr(body.students),
      marks: arr(body.marks),
      attendance: arr(body.attendance)
    }, {
      allowedStds: req.user.all ? null : req.user.stds,
      actor: req.user.id
    });
    res.json({ counts, revision: store.revision });
  });

  // ------------------------------------------------------------ office only

  api.post('/teachers', adminOnly, async (req, res) => {
    const body = req.body || {};
    const data = readTeacherInput(body, null);
    checkNewPassword(body.password);
    const { salt, hash } = hashPassword(body.password);
    const t = { id: newId('t'), ...data, status: 'active', pwSalt: salt, pwHash: hash, tokenVersion: 1, createdAt: nowIso(), updatedAt: nowIso(), lastActiveAt: null };
    await store.put('teachers', t);
    res.status(201).json({ teacher: teacherPublic(t), revision: store.revision });
  });

  api.put('/teachers/:id', adminOnly, async (req, res) => {
    const t = store.get('teachers', req.params.id);
    if (!t) throw new HttpError(404, 'Teacher not found.');
    const body = req.body || {};
    Object.assign(t, readTeacherInput(body, t));
    if (body.status !== undefined) {
      if (!['active', 'pending', 'disabled'].includes(body.status)) bad('Unknown status.');
      if (body.status !== t.status) t.tokenVersion += 1;
      t.status = body.status;
    }
    if (body.password) {
      checkNewPassword(body.password);
      const { salt, hash } = hashPassword(body.password);
      Object.assign(t, { pwSalt: salt, pwHash: hash, tokenVersion: t.tokenVersion + 1 });
    }
    t.updatedAt = nowIso();
    await store.put('teachers', t);
    res.json({ teacher: teacherPublic(t), revision: store.revision });
  });

  api.delete('/teachers/:id', adminOnly, async (req, res) => {
    if (!store.get('teachers', req.params.id)) throw new HttpError(404, 'Teacher not found.');
    await store.remove('teachers', req.params.id);
    res.json({ ok: true, revision: store.revision });
  });

  api.put('/settings/school', adminOnly, async (req, res) => {
    const body = req.body || {};
    const name = cleanText(body.name, 80);
    if (!name) bad('Enter the school name.');
    let url = cleanText(body.publicUrl, 200).replace(/\/+$/, '');
    if (url && !/^https?:\/\/[^\s/]+/i.test(url)) bad('The website address should start with http:// or https://');
    settings().school = { name, address: cleanText(body.address, 160), publicUrl: url };
    await store.saveSettings();
    res.json({ school: settings().school, revision: store.revision });
  });

  api.get('/export', adminOnly, (req, res) => {
    const date = todayIso();
    res.set('Content-Disposition', `attachment; filename="school-backup-${date}.json"`);
    res.json({
      exportedAt: nowIso(),
      school: settings().school,
      teachers: store.list('teachers').map(teacherPublic),
      students: sortStudents(store.list('students')),
      tests: sortTests(store.list('tests')),
      attendance: store.list('attendance')
    });
  });

  // ------------------------------------------------------------ errors

  api.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The file is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request could not be read.' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    console.error('API error:', err);
    res.status(500).json({ error: 'Something went wrong while saving. Please try again.' });
  });

  return api;
}

module.exports = { createApi, HttpError, parseMarkValue, renderTemplate };
