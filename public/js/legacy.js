// Finds data that the previous version of the app kept inside this browser
// (each teacher's phone or computer) so it can be copied to the school database.

import { api } from './data.js';

const DONE_KEY = 'gps.legacyCopied';

function readArray(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function collect() {
  const out = { students: [], marks: [], attendance: [] };
  let keys = [];
  try {
    keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean);
  } catch {
    return out;
  }
  keys.forEach(k => {
    if (k === 'gps_em_students_v1' || /^gps_t_.+_students$/.test(k)) out.students.push(...readArray(k));
    else if (k === 'gps_em_marks_v1' || /^gps_t_.+_marks$/.test(k)) out.marks.push(...readArray(k));
    else if (k === 'gps_em_attendance_v1' || /^gps_t_.+_attendance$/.test(k)) out.attendance.push(...readArray(k));
  });
  return out;
}

export function legacySummary() {
  let done = null;
  try { done = localStorage.getItem(DONE_KEY); } catch { /* ignore */ }
  const data = collect();
  const total = data.students.length + data.marks.length + data.attendance.length;
  return { done: Boolean(done), total, students: data.students.length, marks: data.marks.length, attendance: data.attendance.length };
}

export function shouldOfferLegacy() {
  const s = legacySummary();
  return !s.done && s.total > 0;
}

export async function importLegacyData() {
  const data = collect();
  const res = await api('POST', '/import/legacy', data);
  try { localStorage.setItem(DONE_KEY, new Date().toISOString()); } catch { /* ignore */ }
  return res.counts;
}

export function dismissLegacy() {
  try { localStorage.setItem(DONE_KEY, 'dismissed'); } catch { /* ignore */ }
}
