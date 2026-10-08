'use strict';

/**
 * Imports data saved by the previous version of the app into the new records.
 * Only adds what is missing — existing students, marks and attendance are never
 * overwritten — so it is safe to run more than once and from several devices.
 */

const { hashPassword } = require('./auth');
const {
  newId, newKey, nowIso, cleanText, normStd, normSection, normRoll, isIsoDate,
  parseMobiles, formatMobiles, canonicalSubject, normName
} = require('./util');

const DEMO_NAMES = new Set([
  'Aditya Dave', 'Bhavna Rathod', 'Chirag Solanki', 'Deepika Iyer', 'Eshaan Gupta', 'Aarav Patel', 'Priya Shah',
  'Rohan Mehta', 'Ananya Joshi', 'Kabir Singhania', 'Sneha Kulkarni', 'Devendra Dave', 'Isha Trivedi', 'Aryan Bhatt',
  'Diya Parikh', 'Manav Desai', 'Tanvi Panchal', 'Harshvardhan Rana', 'Janvi Bhatt', 'Kunal Kapoor', 'Lipika Sen', 'Mohit Rawat'
].map(n => n.toLowerCase()));
const DEMO_TEACHER_IDS = new Set(['T-101', 'T-102', 'T-999999']);
const AUTO_GR = /^GR-\d{4}-\d{1,2}-\d{3}$/i;
const GENERIC_TOPICS = new Set(['', 'assessment', 'unit assessment', 'assessment upload', 'unit test']);

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function isPlaceholderName(name) {
  return !name || /^student \d+$/i.test(name) || name.includes('???');
}

function emptyCounts() {
  return {
    teachers: 0,
    studentsAdded: 0,
    studentsUpdated: 0,
    tests: 0,
    marks: 0,
    attendanceDays: 0,
    skipped: 0,
    outsideClasses: 0
  };
}

function importTeachers(store, teachers, counts, touched) {
  arr(teachers).forEach(t => {
    if (!t || DEMO_TEACHER_IDS.has(t.id)) return;
    const mobile = parseMobiles(t.mobile)[0];
    if (!mobile || !t.password) return;
    if (store.find('teachers', x => x.mobile === mobile)) return;
    const { salt, hash } = hashPassword(String(t.password));
    const classes = [...new Set(arr(t.classrooms).map(c => normStd(c && (c.classNumber || c))).filter(Boolean))];
    const id = t.id && !store.get('teachers', String(t.id)) ? String(t.id) : newId('t');
    const doc = {
      id,
      name: cleanText(t.name, 80) || `Teacher ${mobile.slice(-4)}`,
      mobile,
      classes,
      subjects: arr(t.subjects).map(s => canonicalSubject(s)).filter(Boolean).slice(0, 20),
      status: 'active',
      pwSalt: salt,
      pwHash: hash,
      tokenVersion: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastActiveAt: null
    };
    store.maps.teachers.set(id, doc);
    touched.add(`teachers:${id}`);
    counts.teachers += 1;
  });
}

function findStudent(store, { std, section, roll, grNo, name }) {
  if (grNo) {
    const g = grNo.toLowerCase();
    const byGr = store.find('students', s => s.std === std && s.grNo && s.grNo.toLowerCase() === g);
    if (byGr) return byGr;
  }
  if (roll) {
    const byRoll = store.find('students', s => s.std === std && s.section === section && s.roll === roll);
    if (byRoll) return byRoll;
  }
  if (name && !isPlaceholderName(name)) {
    const n = name.toLowerCase();
    return store.find('students', s => s.std === std && s.section === section && s.name.toLowerCase() === n);
  }
  return null;
}

function nextRoll(store, std, section) {
  const rolls = store.filter('students', s => s.std === std && s.section === section).map(s => s.roll);
  return rolls.length ? Math.max(...rolls) + 1 : 1;
}

function importStudents(store, students, opts, counts, touched) {
  arr(students).forEach(raw => {
    if (!raw) return;
    const std = normStd(raw.std);
    const name = cleanText(raw.name, 80);
    if (!std || DEMO_NAMES.has(name.toLowerCase())) { counts.skipped += 1; return; }
    if (opts.allowedStds && !opts.allowedStds.has(std)) { counts.outsideClasses += 1; return; }
    const section = normSection(raw.section);
    const roll = normRoll(raw.roll);
    let grNo = cleanText(raw.grNo, 30);
    if (AUTO_GR.test(grNo) || /^GR-2024-(0|08|10)/i.test(grNo)) grNo = '';
    const mobiles = parseMobiles(raw.mobile);
    if (!roll && !name) { counts.skipped += 1; return; }

    const existing = findStudent(store, { std, section, roll, grNo, name });
    if (existing) {
      let changed = false;
      if (!existing.mobile && mobiles.length) { existing.mobile = formatMobiles(mobiles); changed = true; }
      if (!existing.grNo && grNo && !store.find('students', s => s.grNo && s.grNo.toLowerCase() === grNo.toLowerCase())) { existing.grNo = grNo; changed = true; }
      if (isPlaceholderName(existing.name) && name && !isPlaceholderName(name)) { existing.name = name; changed = true; }
      if (changed) {
        existing.updatedAt = nowIso();
        touched.add(`students:${existing.id}`);
        counts.studentsUpdated += 1;
      }
      return;
    }
    let finalRoll = roll;
    if (!finalRoll || store.find('students', s => s.std === std && s.section === section && s.roll === finalRoll)) {
      if (roll) { counts.skipped += 1; return; } // roll taken by a different child: keep the existing record
      finalRoll = nextRoll(store, std, section);
    }
    if (grNo && store.find('students', s => s.grNo && s.grNo.toLowerCase() === grNo.toLowerCase())) grNo = '';
    const doc = {
      id: newId('s'),
      std,
      section,
      roll: finalRoll,
      name: name || `Student ${finalRoll}`,
      grNo,
      mobile: formatMobiles(mobiles),
      parentKey: newKey(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: opts.actor || 'import'
    };
    store.maps.students.set(doc.id, doc);
    touched.add(`students:${doc.id}`);
    counts.studentsAdded += 1;
  });
}

function resolveForMark(store, std, roll, grNo) {
  if (grNo && !AUTO_GR.test(grNo)) {
    const g = grNo.toLowerCase();
    const byGr = store.find('students', s => s.std === std && s.grNo && s.grNo.toLowerCase() === g);
    if (byGr) return byGr;
  }
  if (!roll) return null;
  const matches = store.filter('students', s => s.std === std && s.roll === roll);
  return matches.length === 1 ? matches[0] : null;
}

function importMarks(store, marks, opts, counts, touched) {
  const testsByKey = new Map();
  store.list('tests').forEach(t => testsByKey.set(`${t.std}|${normName(t.name)}`, t));

  arr(marks).forEach(m => {
    if (!m) return;
    const std = normStd(m.std);
    if (!std) { counts.skipped += 1; return; }
    if (opts.allowedStds && !opts.allowedStds.has(std)) { counts.outsideClasses += 1; return; }
    const student = resolveForMark(store, std, normRoll(m.roll), cleanText(m.grNo, 30));
    const subject = canonicalSubject(m.subject);
    if (!student || !subject) { counts.skipped += 1; return; }

    const testName = cleanText(m.testSet || m.exam || m.topic || 'Assessment', 80) || 'Assessment';
    const date = isIsoDate(m.date) ? m.date : '';
    const max = Number(m.total) > 0 && Number(m.total) <= 1000 ? Number(m.total) : 50;
    let topic = cleanText(m.topic, 60);
    if (GENERIC_TOPICS.has(topic.toLowerCase()) || normName(topic) === normName(testName)) topic = '';

    const key = `${std}|${normName(testName)}`;
    let test = testsByKey.get(key);
    if (!test) {
      test = { id: newId('test'), std, name: testName, date, papers: [], marks: {}, createdBy: opts.actor || 'import', createdAt: nowIso(), updatedAt: nowIso() };
      testsByKey.set(key, test);
      store.maps.tests.set(test.id, test);
      counts.tests += 1;
    }
    let paper = test.papers.find(p => p.subject === subject && (p.date || '') === date && normName(p.topic) === normName(topic));
    if (!paper) {
      paper = { id: newId('p'), subject, max, date, topic };
      test.papers.push(paper);
    }
    let value;
    if (m.isAbsent) value = 'AB';
    else {
      const n = Number(m.marks);
      if (!Number.isFinite(n) || n < 0 || n > paper.max) { counts.skipped += 1; return; }
      value = n;
    }
    test.marks[student.id] = test.marks[student.id] || {};
    if (test.marks[student.id][paper.id] !== undefined) return; // keep what is already there
    test.marks[student.id][paper.id] = value;
    if (date && (!test.date || date < test.date)) test.date = date;
    test.updatedAt = nowIso();
    touched.add(`tests:${test.id}`);
    counts.marks += 1;
  });
}

function importAttendance(store, attendance, opts, counts, touched) {
  arr(attendance).forEach(rec => {
    if (!rec || !isIsoDate(rec.date)) return;
    const std = normStd(rec.std);
    if (!std) return;
    if (opts.allowedStds && !opts.allowedStds.has(std)) { counts.outsideClasses += 1; return; }
    const section = normSection(rec.section);
    const id = `${rec.date}_${std}_${section}`;
    let doc = store.get('attendance', id);
    const isNew = !doc;
    if (!doc) doc = { id, date: rec.date, std, section, status: {}, takenBy: opts.actor || 'import', updatedAt: nowIso() };
    let added = 0;
    arr(rec.records).forEach(r => {
      const roll = normRoll(r && r.roll);
      const status = r && String(r.status || '').toUpperCase();
      if (!roll || !['P', 'A', 'L'].includes(status)) return;
      const student = store.find('students', s => s.std === std && s.section === section && s.roll === roll);
      if (!student || doc.status[student.id]) return;
      doc.status[student.id] = status;
      added += 1;
    });
    if (!added) return;
    store.maps.attendance.set(id, doc);
    touched.add(`attendance:${id}`);
    if (isNew) counts.attendanceDays += 1;
  });
}

/**
 * data: { teachers?, students?, marks?, attendance? } in the old format.
 * opts: { allowedStds?: Set<string>|null, actor?: string, includeTeachers?: boolean }
 */
async function importLegacy(store, data, opts = {}) {
  const counts = emptyCounts();
  const touched = new Set();
  if (opts.includeTeachers) importTeachers(store, data.teachers, counts, touched);
  importStudents(store, data.students, opts, counts, touched);
  importMarks(store, data.marks, opts, counts, touched);
  importAttendance(store, data.attendance, opts, counts, touched);

  const keys = Array.from(touched);
  for (let i = 0; i < keys.length; i += 50) {
    await Promise.all(keys.slice(i, i + 50).map(key => {
      const [collection, id] = key.split(/:(.+)/);
      const doc = store.get(collection, id);
      return doc ? store.put(collection, doc) : null;
    }));
  }
  return counts;
}

// Combines the old shared document and the per-teacher copies into one dataset.
function combineLegacySources(legacy) {
  const out = { teachers: [], students: [], marks: [], attendance: [] };
  if (!legacy) return out;
  const add = src => {
    if (!src) return;
    out.students.push(...arr(src.students));
    out.marks.push(...arr(src.marks));
    out.attendance.push(...arr(src.attendance));
  };
  if (legacy.school) {
    out.teachers.push(...arr(legacy.school.teachers));
    add(legacy.school);
  }
  arr(legacy.perTeacher).forEach(add);
  return out;
}

module.exports = { importLegacy, combineLegacySources };
