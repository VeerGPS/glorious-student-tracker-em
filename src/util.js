'use strict';

const crypto = require('crypto');

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

function newKey() {
  return crypto.randomBytes(18).toString('base64url');
}

function nowIso() {
  return new Date().toISOString();
}

// Today's date in India (the school's timezone), as YYYY-MM-DD.
function todayIso(date = new Date()) {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

function cleanText(value, max = 120) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanMultiline(value, max = 1000) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

// Class/standard: "8", "8th", "Class 8", "Std-8" -> "8". Only 1..12 are valid.
function normStd(value) {
  if (value === null || value === undefined) return null;
  const m = String(value).match(/\d{1,2}/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1 && n <= 12 ? String(n) : null;
}

function normSection(value) {
  const s = String(value === null || value === undefined ? '' : value).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  return s || 'A';
}

function normRoll(value) {
  if (value === null || value === undefined || value === '') return null;
  const m = String(value).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n > 0 && n < 100000 ? n : null;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Parses one or more Indian mobile numbers out of free text.
// "9427233487, 9429762778" / "+91 94272 33487" / a 20-digit collision -> ['9427233487', ...]
function parseMobiles(raw) {
  if (raw === null || raw === undefined) return [];
  const out = [];
  const add = (digits) => {
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 20) { add(digits.slice(0, 10)); add(digits.slice(10)); return; }
    if (digits.length === 10 && /^[5-9]/.test(digits) && !out.includes(digits)) out.push(digits);
  };
  String(raw)
    .split(/[,;/&|\n]+|\s{2,}|\s+(?:and|or)\s+/i)
    .forEach(part => {
      const digits = part.replace(/\D/g, '');
      if (digits) add(digits);
    });
  return out;
}

function formatMobiles(list) {
  return (list || []).join(', ');
}

const SUBJECT_ALIASES = [
  [/^(?:maths?|mathematics|ganit)\b/i, 'Mathematics'],
  [/^(?:sci|science|vigyan)\b/i, 'Science'],
  [/^(?:ss|s\.s\.?|social\s*sci(?:ence)?|social\s*studies|samajik\s*vigyan)\b/i, 'Social Science'],
  [/^(?:eng|english|angreji)\b/i, 'English'],
  [/^(?:hin|hindi)\b/i, 'Hindi'],
  [/^(?:guj|gujarati)\b/i, 'Gujarati'],
  [/^(?:sans|skt|sanskrit)\b/i, 'Sanskrit'],
  [/^(?:comp|computer|cs|it)\b/i, 'Computer'],
  [/^(?:evs|env|environment(?:al)?(?:\s*studies)?)\b/i, 'EVS'],
  [/^(?:pe|pt|physical\s*education)\b/i, 'Physical Education'],
  [/^(?:draw|drawing|art)\b/i, 'Drawing'],
  [/^(?:gk|general\s*knowledge)\b/i, 'General Knowledge']
];

function canonicalSubject(name) {
  const s = cleanText(name, 60);
  if (!s) return '';
  for (const [re, canonical] of SUBJECT_ALIASES) {
    if (re.test(s)) return canonical;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Test names are compared exactly, ignoring case, spacing and dash style.
// ("Unit Test 1" and "Unit Test 10" are different tests.)
function normName(name) {
  return cleanText(name, 80)
    .toLowerCase()
    .replace(/[‐-―−_]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
}

function grade(pct) {
  if (pct >= 91) return 'A1';
  if (pct >= 81) return 'A2';
  if (pct >= 71) return 'B1';
  if (pct >= 61) return 'B2';
  if (pct >= 51) return 'C1';
  if (pct >= 41) return 'C2';
  if (pct >= 33) return 'D';
  return 'E';
}

function formatDate(iso) {
  if (!isIsoDate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Competition ranking (1, 2, 2, 4) of `value` within `values` (higher is better).
function rankOf(value, values) {
  return 1 + values.filter(v => v > value).length;
}

module.exports = {
  newId,
  newKey,
  nowIso,
  todayIso,
  cleanText,
  cleanMultiline,
  normStd,
  normSection,
  normRoll,
  isIsoDate,
  parseMobiles,
  formatMobiles,
  canonicalSubject,
  normName,
  grade,
  formatDate,
  round1,
  rankOf
};
