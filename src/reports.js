'use strict';

const { grade, round1, rankOf, formatDate } = require('./util');

function markOf(test, studentId, paperId) {
  const row = test.marks && test.marks[studentId];
  if (!row) return null;
  const v = row[paperId];
  return v === undefined || v === null ? null : v;
}

function sortTests(tests) {
  return tests.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.name.localeCompare(b.name));
}

function selectTests(store, std, testIds) {
  let tests = store.filter('tests', t => t.std === std);
  if (Array.isArray(testIds) && testIds.length) tests = tests.filter(t => testIds.includes(t.id));
  return sortTests(tests);
}

function percentOver(studentId, papers) {
  let obt = 0;
  let max = 0;
  papers.forEach(({ test, paper }) => {
    const v = markOf(test, studentId, paper.id);
    if (v === null) return;
    obt += v === 'AB' ? 0 : v;
    max += paper.max;
  });
  return max > 0 ? (obt / max) * 100 : null;
}

function attendanceFor(store, student) {
  let present = 0;
  let absent = 0;
  let leave = 0;
  store.list('attendance').forEach(rec => {
    if (rec.std !== student.std || rec.section !== student.section) return;
    const st = rec.status && rec.status[student.id];
    if (st === 'P') present += 1;
    else if (st === 'A') absent += 1;
    else if (st === 'L') leave += 1;
  });
  const total = present + absent + leave;
  return total ? { present, absent, leave, total, pct: round1((present / total) * 100) } : null;
}

function remarksFor(pct, weak, strong, firstName) {
  if (pct === null) return 'No marks have been entered yet.';
  const weakText = weak.length ? ` Extra practice in ${weak.join(', ')} will help.` : '';
  if (pct >= 85) return `Excellent performance! ${firstName} is doing very well.${strong.length ? ` Outstanding in ${strong.join(', ')}.` : ''} Keep it up.`;
  if (pct >= 70) return `Very good work. ${firstName} has a strong understanding of most subjects.${weakText}`;
  if (pct >= 50) return `Good effort. Regular revision at home will improve results further.${weakText}`;
  if (pct >= 33) return `${firstName} needs to work harder.${weakText} Please encourage daily study at home.`;
  return `${firstName} needs special attention.${weakText} Please meet the class teacher.`;
}

/**
 * Computes a student's report for the chosen tests (all tests of the class when
 * testIds is empty). `peers` defaults to the student's own class and section.
 */
function buildReport(store, student, testIds, options = {}) {
  const tests = options.tests || selectTests(store, student.std, testIds);
  const peers = options.peers || store.filter('students', s => s.std === student.std && s.section === student.section);
  const rows = [];
  const usedPapers = [];

  tests.forEach(test => {
    (test.papers || []).forEach(paper => {
      usedPapers.push({ test, paper });
      const v = markOf(test, student.id, paper.id);
      if (v === null) return;
      const obtained = v === 'AB' ? 0 : v;
      const pct = paper.max > 0 ? (obtained / paper.max) * 100 : 0;
      const peerValues = peers.map(p => markOf(test, p.id, paper.id)).filter(x => typeof x === 'number');
      rows.push({
        testId: test.id,
        test: test.name,
        subject: paper.subject,
        topic: paper.topic || '',
        date: paper.date || test.date || '',
        max: paper.max,
        marks: v,
        pct: round1(pct),
        grade: v === 'AB' ? 'AB' : grade(pct),
        rank: v === 'AB' ? null : rankOf(v, peerValues),
        of: peerValues.length,
        highest: peerValues.length ? Math.max(...peerValues) : null,
        average: peerValues.length ? round1(peerValues.reduce((a, b) => a + b, 0) / peerValues.length) : null
      });
    });
  });

  const obtained = rows.reduce((sum, r) => sum + (r.marks === 'AB' ? 0 : r.marks), 0);
  const max = rows.reduce((sum, r) => sum + r.max, 0);
  const pct = max > 0 ? round1((obtained / max) * 100) : null;

  let rank = null;
  if (pct !== null) {
    const round3 = x => Math.round(x * 1000) / 1000;
    const peerPcts = peers.map(p => percentOver(p.id, usedPapers)).filter(x => x !== null).map(round3);
    rank = { rank: rankOf(round3((obtained / max) * 100), peerPcts), of: peerPcts.length };
  }

  const bySubject = new Map();
  rows.forEach(r => {
    const s = bySubject.get(r.subject) || { subject: r.subject, obtained: 0, max: 0, count: 0, absent: 0 };
    s.obtained += r.marks === 'AB' ? 0 : r.marks;
    s.max += r.max;
    s.count += 1;
    if (r.marks === 'AB') s.absent += 1;
    bySubject.set(r.subject, s);
  });
  const subjects = Array.from(bySubject.values()).map(s => ({
    ...s,
    obtained: round1(s.obtained),
    pct: s.max ? round1((s.obtained / s.max) * 100) : 0,
    allAbsent: s.absent === s.count
  }));
  const weak = subjects.filter(s => !s.allAbsent && s.pct < 40).map(s => s.subject);
  const strong = subjects.filter(s => s.pct >= 80).map(s => s.subject);
  const missed = subjects.filter(s => s.allAbsent).map(s => s.subject);
  const firstName = (student.name || 'Your child').split(' ')[0];

  let title = 'All Tests';
  if (Array.isArray(testIds) && testIds.length === 1 && tests.length === 1) title = tests[0].name;
  else if (Array.isArray(testIds) && testIds.length > 1) title = tests.map(t => t.name).join(', ');

  return {
    student: { id: student.id, name: student.name, std: student.std, section: student.section, roll: student.roll, grNo: student.grNo || '' },
    title,
    tests: tests.map(t => ({ id: t.id, name: t.name, date: t.date })),
    rows,
    total: { obtained: round1(obtained), max, pct, grade: pct === null ? '-' : grade(pct) },
    rank,
    subjects,
    weak,
    strong,
    attendance: options.skipAttendance ? null : attendanceFor(store, student),
    remarks: remarksFor(pct, weak, strong, firstName) + (missed.length ? ` Was absent for the ${missed.join(', ')} test${missed.length > 1 ? 's' : ''}.` : '')
  };
}

function describeTests(report) {
  if (!report.tests.length) return '';
  if (report.tests.length === 1) return `${report.tests[0].name} (${formatDate(report.tests[0].date)})`;
  return report.title;
}

module.exports = { buildReport, selectTests, markOf, attendanceFor, describeTests, sortTests };
