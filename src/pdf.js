'use strict';

const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { grade } = require('./util');

// A4 portrait, millimetres.
const PAGE_W = 210;
const LEFT = 12;
const RIGHT = 198;
const WIDTH = RIGHT - LEFT;
const LIMIT = 279; // lowest point for content; the footer sits below it

// Colours taken from the school logo (blue leaves, orange sun).
const WHITE = [255, 255, 255];
const INK = [15, 23, 42];
const INK_2 = [51, 65, 85];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const ZEBRA = [248, 250, 252];
const NAVY = [13, 59, 110];
const BLUE = [31, 111, 176];
const BLUE_SOFT = [237, 244, 251];
const BLUE_LINE = [204, 222, 242];
const SUN = [247, 148, 29];
const SUN_DARK = [180, 83, 9];
const SUN_SOFT = [255, 247, 235];
const GREEN_DARK = [4, 120, 87];
const RED = [208, 59, 59];
// Result bands: 80+, 60-79, 33-59, below 33.
const BANDS = [[12, 150, 12], [31, 111, 176], [214, 140, 0], [208, 59, 59]];
const GRADE_COLORS = {
  A1: [4, 120, 87], A2: [4, 120, 87], B1: [29, 78, 216], B2: [29, 78, 216],
  C1: [161, 98, 7], C2: [161, 98, 7], D: [194, 65, 12], E: [190, 18, 60], AB: [100, 116, 139]
};
const GRADE_SCALE = [['A1', '91-100'], ['A2', '81-90'], ['B1', '71-80'], ['B2', '61-70'], ['C1', '51-60'], ['C2', '41-50'], ['D', '33-40'], ['E', 'below 33']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LOGO = (() => {
  try {
    return `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'report-logo.png')).toString('base64')}`;
  } catch {
    return null;
  }
})();
const LOGO_RATIO = 360 / 420; // height / width of the logo image

// The supplied artwork is the fixed page background for the result-card
// template. Its 1022x1536 image is nearly 2:3, so the template uses a matching
// 210x315mm custom page instead of A4.
const RESULT_CARD_TEMPLATE = (() => {
  try {
    return `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'result-card-template.jpg')).toString('base64')}`;
  } catch {
    return null;
  }
})();
const RESULT_CARD_ROWS = 12;
// Caladea is an open-licensed Cambria-compatible serif that can be embedded
// consistently without relying on a machine's installed fonts.
const RESULT_CARD_FONT_DIR = path.join(__dirname, 'assets', 'fonts', 'caladea');

// The built-in PDF fonts only cover Latin characters (plus a few marks like · – •).
function safe(text) {
  return String(text === null || text === undefined ? '' : text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\n·–•]/g, '');
}

function fit(doc, text, width) {
  let s = safe(text);
  if (doc.getTextWidth(s) <= width) return s;
  while (s.length > 1 && doc.getTextWidth(`${s}...`) > width) s = s.slice(0, -1);
  return `${s}...`;
}

function niceDate(iso, withYear = true) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]}${withYear ? ` ${m[1]}` : ''}`;
}

function dateRange(dates, withYear = true) {
  const list = [...new Set(dates.filter(Boolean))].sort();
  if (!list.length) return '';
  const first = list[0];
  const last = list[list.length - 1];
  if (first === last) return niceDate(first, withYear);
  return `${niceDate(first, withYear && first.slice(0, 4) !== last.slice(0, 4))} – ${niceDate(last, withYear)}`;
}

function todayIst() {
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}

// Indian academic year (April to March) of the first test, or of today.
function academicYear(report) {
  const first = report.rows.map(r => r.date).filter(Boolean).sort()[0] || todayIst();
  const y = parseInt(first.slice(0, 4), 10);
  const start = parseInt(first.slice(5, 7), 10) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function academicSession(report) {
  const first = report.rows.map(r => r.date).filter(Boolean).sort()[0] || todayIst();
  const y = parseInt(first.slice(0, 4), 10);
  const start = parseInt(first.slice(5, 7), 10) >= 4 ? y : y - 1;
  return `${start}-${start + 1}`;
}

function bandColor(pct) {
  if (pct >= 80) return BANDS[0];
  if (pct >= 60) return BANDS[1];
  if (pct >= 33) return BANDS[2];
  return BANDS[3];
}

function num(n) {
  return n === null || n === undefined ? '-' : String(Math.round(n * 10) / 10);
}

// ---------------------------------------------------------------- drawing helpers

function font(doc, style, size, color) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

// Text with letter spacing; jsPDF's own alignment ignores the spacing.
function spaced(doc, text, x, y, { align = 'left', charSpace = 0.3 } = {}) {
  const w = doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  doc.text(text, left, y, { charSpace });
}

function withOpacity(doc, opacity, draw) {
  doc.setGState(new doc.GState({ opacity }));
  draw();
  doc.setGState(new doc.GState({ opacity: 1 }));
}

function logo(doc, x, y, w) {
  if (!LOGO) return;
  doc.addImage(LOGO, 'PNG', x, y, w, w * LOGO_RATIO, 'school-logo', 'FAST');
}

function gradePill(doc, gradeText, cx, y, inverse = false) {
  const color = GRADE_COLORS[gradeText] || MUTED;
  doc.setFillColor(...(inverse ? WHITE : color));
  doc.roundedRect(cx - 4.6, y, 9.2, 4.2, 2.1, 2.1, 'F');
  font(doc, 'bold', 7, inverse ? NAVY : WHITE);
  doc.text(safe(gradeText), cx, y + 3, { align: 'center' });
}

function sectionTitle(doc, text, y) {
  doc.setFillColor(...SUN);
  doc.roundedRect(LEFT, y - 3.4, 1.6, 4.4, 0.8, 0.8, 'F');
  font(doc, 'bold', 9.5, NAVY);
  spaced(doc, text, LEFT + 4, y, { charSpace: 0.2 });
}

// ---------------------------------------------------------------- page parts

function bigHeader(doc, school, report) {
  logo(doc, LEFT, 8, 28);

  // The right-hand block decides how much room the school name has.
  font(doc, 'bold', 12, NAVY);
  const blockW = Math.max(doc.getTextWidth('PROGRESS REPORT') + 0.6 * 14, 50);
  const nameX = LEFT + 33;
  const nameW = RIGHT - blockW - 6 - nameX;
  const name = safe(school.name || 'School').toUpperCase();
  let size = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  while (size > 11 && doc.getTextWidth(name) > nameW) { size -= 0.5; doc.setFontSize(size); }
  font(doc, 'bold', size, NAVY);
  doc.text(fit(doc, name, nameW), nameX, 18.5);
  if (school.address) {
    font(doc, 'normal', 8.5, MUTED);
    doc.text(fit(doc, school.address, nameW), nameX, 25);
  }

  font(doc, 'bold', 12, NAVY);
  spaced(doc, 'PROGRESS REPORT', RIGHT, 16, { align: 'right', charSpace: 0.6 });
  font(doc, 'normal', 8.5, INK_2);
  doc.text(fit(doc, report.title || 'All Tests', 62), RIGHT, 22, { align: 'right' });
  const year = `ACADEMIC YEAR ${academicYear(report)}`;
  font(doc, 'bold', 7, SUN_DARK);
  const yw = doc.getTextWidth(year) + 0.3 * (year.length - 1) + 6;
  doc.setFillColor(...SUN_SOFT);
  doc.setDrawColor(253, 211, 160);
  doc.setLineWidth(0.25);
  doc.roundedRect(RIGHT - yw, 25, yw, 5.4, 2.7, 2.7, 'FD');
  spaced(doc, year, RIGHT - 3, 28.7, { align: 'right' });

  // Brand rule: navy with an orange lead, like the logo's sun over its leaves.
  doc.setFillColor(...NAVY);
  doc.rect(LEFT, 37, WIDTH, 1.1, 'F');
  doc.setFillColor(...SUN);
  doc.rect(LEFT, 37, 34, 1.1, 'F');
  return 42;
}

function slimHeader(doc, school, report) {
  logo(doc, LEFT, 5, 12);
  font(doc, 'bold', 10.5, NAVY);
  doc.text(fit(doc, safe(school.name || 'School').toUpperCase(), 100), LEFT + 15, 11);
  font(doc, 'normal', 8, MUTED);
  doc.text(fit(doc, `Progress report · ${report.student.name} (continued)`, 80), RIGHT, 11, { align: 'right' });
  doc.setFillColor(...NAVY);
  doc.rect(LEFT, 16.5, WIDTH, 0.8, 'F');
  doc.setFillColor(...SUN);
  doc.rect(LEFT, 16.5, 20, 0.8, 'F');
  return 24;
}

function field(doc, label, value, x, y, width, size = 10) {
  font(doc, 'bold', 6.4, MUTED);
  spaced(doc, label, x, y);
  font(doc, 'bold', size, size > 11 ? NAVY : INK_2);
  doc.text(fit(doc, value, width), x, y + (size > 11 ? 5.8 : 4.8));
}

function studentPanel(doc, report, y) {
  const st = report.student;
  const h = 22;
  doc.setFillColor(...BLUE_SOFT);
  doc.setDrawColor(...BLUE_LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(LEFT, y, WIDTH, h, 2.5, 2.5, 'FD');
  doc.setFillColor(...BLUE);
  doc.roundedRect(LEFT, y, 1.6, h, 0.8, 0.8, 'F');

  const x = LEFT + 6;
  field(doc, 'STUDENT NAME', safe(st.name).toUpperCase(), x, y + 5.5, 128, 12.5);
  field(doc, 'CLASS', `${st.std} - ${st.section}`, x, y + 15, 30);
  field(doc, 'ROLL NO', String(st.roll), x + 34, y + 15, 30);
  field(doc, 'GR NO', st.grNo ? safe(st.grNo) : '-', x + 68, y + 15, 40);

  const rx = 150;
  doc.setDrawColor(...BLUE_LINE);
  doc.line(rx - 5, y + 4, rx - 5, y + h - 4);
  field(doc, 'DATE OF ISSUE', niceDate(todayIst()), rx, y + 5.5, 46);
  const testCount = new Set(report.rows.map(r => r.testId || r.test)).size;
  field(doc, 'REPORT COVERS', report.rows.length ? `${testCount} test${testCount === 1 ? '' : 's'} · ${report.rows.length} paper${report.rows.length === 1 ? '' : 's'}` : 'No marks yet', rx, y + 15, 46);
  return y + h + 4;
}

function summary(doc, report, y) {
  const t = report.total;
  const a = report.attendance;
  const items = [
    ['OVERALL', t.pct === null ? '-' : `${t.pct}%`, t.pct === null ? 'No marks yet' : `Grade ${t.grade}`, BLUE],
    ['CLASS RANK', report.rank ? String(report.rank.rank) : '-', report.rank ? `out of ${report.rank.of}` : 'Not ranked', SUN],
    ['TOTAL MARKS', t.max ? `${num(t.obtained)} / ${t.max}` : '-', report.subjects.length ? `in ${report.subjects.length} subject${report.subjects.length === 1 ? '' : 's'}` : 'No marks yet', GREEN_DARK],
    ['ATTENDANCE', a ? `${a.pct}%` : '-', a ? `${a.present} of ${a.total} days present` : 'Not recorded', NAVY]
  ];
  const gap = 4;
  const w = (WIDTH - gap * 3) / 4;
  const h = 17;
  items.forEach(([label, value, note, color], i) => {
    const x = LEFT + i * (w + gap);
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...BLUE_LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');
    doc.setFillColor(...color);
    doc.roundedRect(x, y, w, 1.6, 0.8, 0.8, 'F');
    font(doc, 'bold', 6.4, MUTED);
    spaced(doc, label, x + 4, y + 6);
    font(doc, 'bold', value.length > 9 ? 12.5 : 15, NAVY);
    doc.text(fit(doc, value, w - 8), x + 4, y + 12.2);
    font(doc, 'normal', 7, MUTED);
    doc.text(fit(doc, note, w - 8), x + 4, y + 15.4);
  });
  return y + h + 6;
}

// Marks table columns (x is the anchor for the given alignment).
const COLS = [
  { key: 'subject', label: 'SUBJECT', x: LEFT + 3, w: 60 },
  { key: 'date', label: 'DATE', x: 80, w: 24 },
  { key: 'max', label: 'MAX', x: 118, align: 'right' },
  { key: 'marks', label: 'MARKS', x: 138, align: 'right' },
  { key: 'pct', label: '%', x: 155, align: 'right' },
  { key: 'grade', label: 'GRADE', x: 171, align: 'center' },
  { key: 'rank', label: 'RANK', x: 189, align: 'center' }
];
const ROW_H = 5.5;
const GROUP_H = 6.4;
const HEAD_H = 7;

function tableHeader(doc, y) {
  doc.setFillColor(...NAVY);
  doc.roundedRect(LEFT, y, WIDTH, HEAD_H, 2, 2, 'F');
  doc.rect(LEFT, y + HEAD_H - 2, WIDTH, 2, 'F');
  font(doc, 'bold', 6.8, WHITE);
  COLS.forEach(c => spaced(doc, c.label, c.x, y + 4.6, { align: c.align || 'left', charSpace: 0.25 }));
  return y + HEAD_H;
}

function groupRows(rows) {
  const groups = [];
  rows.forEach(r => {
    const key = r.testId || r.test;
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, name: r.test, rows: [] }; groups.push(g); }
    g.rows.push(r);
  });
  return groups.map(g => {
    let obt = 0;
    let max = 0;
    g.rows.forEach(r => { obt += r.marks === 'AB' ? 0 : r.marks; max += r.max; });
    return { ...g, obt, max, pct: max ? Math.round((obt / max) * 1000) / 10 : null };
  });
}

function marksTable(doc, report, y, newPage) {
  y = tableHeader(doc, y);
  if (!report.rows.length) {
    doc.setFillColor(...ZEBRA);
    doc.rect(LEFT, y, WIDTH, 12, 'F');
    font(doc, 'italic', 9, MUTED);
    doc.text('No marks have been entered for this selection yet.', PAGE_W / 2, y + 7.5, { align: 'center' });
    return y + 12;
  }
  const ensure = need => {
    if (y + need <= LIMIT) return;
    y = tableHeader(doc, newPage());
  };
  groupRows(report.rows).forEach(g => {
    ensure(GROUP_H + ROW_H);
    doc.setFillColor(...BLUE_SOFT);
    doc.rect(LEFT, y, WIDTH, GROUP_H, 'F');
    doc.setFillColor(...BLUE);
    doc.rect(LEFT, y, 1.2, GROUP_H, 'F');
    font(doc, 'bold', 8.3, NAVY);
    doc.text(fit(doc, g.name, 100), LEFT + 3.5, y + 4.3);
    font(doc, 'normal', 7.3, INK_2);
    doc.text(`${dateRange(g.rows.map(r => r.date))}   ·   ${num(g.obt)} / ${g.max}${g.pct === null ? '' : `   ·   ${g.pct}%`}`, RIGHT - 3, y + 4.3, { align: 'right' });
    y += GROUP_H;

    g.rows.forEach((row, i) => {
      ensure(ROW_H);
      if (i % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(LEFT, y, WIDTH, ROW_H, 'F');
      }
      const absent = row.marks === 'AB';
      const fail = !absent && row.pct < 33;
      const base = y + 3.85;
      font(doc, 'bold', 8.3, INK);
      doc.text(fit(doc, row.topic ? `${row.subject} - ${row.topic}` : row.subject, COLS[0].w), COLS[0].x, base);
      font(doc, 'normal', 7.8, MUTED);
      doc.text(niceDate(row.date), COLS[1].x, base);
      font(doc, 'normal', 8.3, INK_2);
      doc.text(String(row.max), COLS[2].x, base, { align: 'right' });
      font(doc, 'bold', 8.8, absent ? SUN_DARK : fail ? RED : INK);
      doc.text(absent ? 'AB' : num(row.marks), COLS[3].x, base, { align: 'right' });
      font(doc, 'normal', 8.3, fail ? RED : INK_2);
      doc.text(absent ? '-' : num(row.pct), COLS[4].x, base, { align: 'right' });
      gradePill(doc, row.grade, COLS[5].x, y + 0.65);
      font(doc, 'normal', 8, INK_2);
      doc.text(row.rank ? `${row.rank}/${row.of}` : '-', COLS[6].x, base, { align: 'center' });
      y += ROW_H;
    });
  });

  // Overall total
  ensure(8);
  const t = report.total;
  doc.setFillColor(...NAVY);
  doc.roundedRect(LEFT, y + 0.6, WIDTH, 7.4, 2, 2, 'F');
  doc.rect(LEFT, y + 0.6, WIDTH, 2, 'F');
  const base = y + 5.4;
  font(doc, 'bold', 8.5, WHITE);
  spaced(doc, 'OVERALL TOTAL', COLS[0].x, base);
  doc.text(String(t.max || 0), COLS[2].x, base, { align: 'right' });
  doc.text(num(t.obtained || 0), COLS[3].x, base, { align: 'right' });
  doc.text(t.pct === null ? '-' : String(t.pct), COLS[4].x, base, { align: 'right' });
  if (t.pct !== null) gradePill(doc, t.grade, COLS[5].x, y + 2.2, true);
  font(doc, 'bold', 8.5, WHITE);
  doc.text(report.rank ? `${report.rank.rank}/${report.rank.of}` : '-', COLS[6].x, base, { align: 'center' });
  return y + 8;
}

// A bar with a rounded top and a flat base.
function column(doc, x, top, w, bottom, color) {
  if (bottom - top <= 0.2) return;
  doc.setFillColor(...color);
  const r = Math.min(1.6, w / 2, bottom - top);
  doc.roundedRect(x, top, w, bottom - top, r, r, 'F');
  if (bottom - top > r) doc.rect(x, bottom - r, w, r, 'F');
}

// Grid, labels and pass line shared by both charts. Returns the y position of a value.
function chartFrame(doc, x0, x1, top, bottom) {
  const yOf = v => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top);
  font(doc, 'normal', 6.5, MUTED);
  [0, 25, 50, 75, 100].forEach(v => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(v === 0 ? 0.45 : 0.2);
    doc.line(x0, yOf(v), x1, yOf(v));
    doc.text(`${v}%`, x0 - 2, yOf(v) + 1, { align: 'right' });
  });
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([0.9, 0.9], 0);
  doc.line(x0, yOf(33), x1, yOf(33));
  doc.setLineDashPattern([], 0);
  return yOf;
}

function passKey(doc, x, y) {
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([0.9, 0.9], 0);
  doc.line(x, y - 1, x + 6, y - 1);
  doc.setLineDashPattern([], 0);
  font(doc, 'normal', 7, MUTED);
  doc.text('Pass mark 33%', x + 7.5, y);
}

const BAR_CHART_H = 70;

function subjectChart(doc, report, y) {
  const subjects = report.subjects.slice(0, 12);
  sectionTitle(doc, 'SUBJECT-WISE PERFORMANCE', y);
  const top = y + 8;
  const bottom = top + 40;
  const x0 = LEFT + 11;
  const x1 = RIGHT;
  const yOf = chartFrame(doc, x0, x1, top, bottom);
  const slot = (x1 - x0) / Math.max(1, subjects.length);
  const barW = Math.min(15, slot * 0.5);
  subjects.forEach((s, i) => {
    const cx = x0 + slot * (i + 0.5);
    if (s.allAbsent) {
      column(doc, cx - barW / 2, bottom - 1.2, barW, bottom, MUTED);
      font(doc, 'bold', 7.5, SUN_DARK);
      doc.text('Absent', cx, bottom - 2.5, { align: 'center' });
    } else {
      const pct = Math.max(0, Math.min(100, s.pct));
      column(doc, cx - barW / 2, yOf(pct), barW, bottom, bandColor(pct));
      font(doc, 'bold', 8, pct < 33 ? RED : INK);
      doc.text(`${num(s.pct)}%`, cx, yOf(pct) - 1.6, { align: 'center' });
    }
    font(doc, 'bold', 7.3, INK_2);
    doc.text(fit(doc, s.subject, slot - 2), cx, bottom + 4.3, { align: 'center' });
    font(doc, 'normal', 6.6, MUTED);
    doc.text(s.allAbsent ? 'AB' : `${num(s.obtained)}/${s.max}`, cx, bottom + 7.6, { align: 'center' });
  });
  // Legend
  let lx = x0;
  const ly = bottom + 13.5;
  font(doc, 'normal', 7, MUTED);
  [['80% and above', BANDS[0]], ['60-79%', BANDS[1]], ['33-59%', BANDS[2]], ['Below 33%', BANDS[3]]].forEach(([label, color]) => {
    doc.setFillColor(...color);
    doc.roundedRect(lx, ly - 2.4, 3, 2.8, 0.6, 0.6, 'F');
    doc.text(label, lx + 4.2, ly);
    lx += 9 + doc.getTextWidth(label);
  });
  passKey(doc, lx, ly);
  return ly + 4;
}

const LINE_CHART_H = 64;

// The student's result in each test, in date order.
function progressChart(doc, report, y) {
  const points = groupRows(report.rows).filter(g => g.pct !== null).map(g => ({ label: dateRange(g.rows.map(r => r.date), false) || g.name, pct: g.pct }));
  sectionTitle(doc, 'PROGRESS ACROSS TESTS', y);
  const top = y + 8;
  const bottom = top + 36;
  const x0 = LEFT + 11;
  const x1 = RIGHT;
  const yOf = chartFrame(doc, x0, x1, top, bottom);
  const step = (x1 - x0 - 20) / Math.max(1, points.length - 1);
  const xOf = i => x0 + 10 + i * step;

  withOpacity(doc, 0.12, () => {
    doc.setFillColor(...BLUE);
    for (let i = 0; i < points.length - 1; i += 1) {
      const xa = xOf(i);
      const xb = xOf(i + 1);
      doc.triangle(xa, yOf(points[i].pct), xb, yOf(points[i + 1].pct), xa, bottom, 'F');
      doc.triangle(xb, yOf(points[i + 1].pct), xb, bottom, xa, bottom, 'F');
    }
  });
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.9);
  for (let i = 0; i < points.length - 1; i += 1) doc.line(xOf(i), yOf(points[i].pct), xOf(i + 1), yOf(points[i + 1].pct));
  points.forEach((pt, i) => {
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...bandColor(pt.pct));
    doc.setLineWidth(0.8);
    doc.circle(xOf(i), yOf(pt.pct), 1.4, 'FD');
    font(doc, 'bold', 7.6, NAVY);
    doc.text(`${num(pt.pct)}%`, xOf(i), yOf(pt.pct) - 2.8, { align: 'center' });
    font(doc, 'normal', 6.8, INK_2);
    doc.text(fit(doc, pt.label, Math.max(20, step - 2)), xOf(i), bottom + 4.5, { align: 'center' });
  });
  passKey(doc, x0, bottom + 10);
  return bottom + 13;
}

function remarksAndHighlights(doc, report, y, measureOnly = false) {
  const leftW = 118;
  const rightX = LEFT + leftW + 4;
  const rightW = RIGHT - rightX;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(safe(report.remarks), leftW - 10);
  const strong = report.strong || [];
  const weak = report.weak || [];
  const none = !report.rows.length;
  doc.setFontSize(8.3);
  const strongLines = doc.splitTextToSize(safe(strong.length ? strong.join(', ') : none ? 'Shown once marks are entered.' : 'Keep working steadily in every subject.'), rightW - 8);
  const weakLines = doc.splitTextToSize(safe(weak.length ? weak.join(', ') : none ? '-' : 'No subject below 40%.'), rightW - 8);
  const leftH = 11 + lines.length * 4.3;
  const rightH = 15 + (strongLines.length + weakLines.length) * 3.8;
  const h = Math.max(21, leftH, rightH);
  if (measureOnly) return h;

  doc.setFillColor(...SUN_SOFT);
  doc.roundedRect(LEFT, y, leftW, h, 2.5, 2.5, 'F');
  doc.setFillColor(...SUN);
  doc.roundedRect(LEFT, y, 1.6, h, 0.8, 0.8, 'F');
  font(doc, 'bold', 6.8, SUN_DARK);
  spaced(doc, "TEACHER'S REMARKS", LEFT + 5, y + 6);
  font(doc, 'normal', 9, INK);
  doc.text(lines, LEFT + 5, y + 11.5);

  doc.setFillColor(...BLUE_SOFT);
  doc.roundedRect(rightX, y, rightW, h, 2.5, 2.5, 'F');
  font(doc, 'bold', 6.8, GREEN_DARK);
  spaced(doc, 'STRENGTHS', rightX + 4, y + 6);
  font(doc, 'normal', 8.3, INK);
  doc.text(strongLines, rightX + 4, y + 10.5);
  const wy = y + 10.5 + strongLines.length * 3.8 + 2.5;
  font(doc, 'bold', 6.8, [190, 18, 60]);
  spaced(doc, 'NEEDS ATTENTION', rightX + 4, wy);
  font(doc, 'normal', 8.3, INK);
  doc.text(weakLines, rightX + 4, wy + 4.5);
  return y + h;
}

function gradeScale(doc, y) {
  font(doc, 'bold', 7, MUTED);
  spaced(doc, 'GRADES', LEFT, y + 3);
  const items = [...GRADE_SCALE, ['AB', 'Absent']];
  font(doc, 'normal', 6.6, INK_2);
  const widths = items.map(([, range]) => 9.2 + 1.4 + doc.getTextWidth(range));
  const start = LEFT + 14;
  const gap = Math.max(1.2, (RIGHT - start - widths.reduce((a, b) => a + b, 0)) / (items.length - 1));
  let x = start;
  items.forEach(([g, range], i) => {
    gradePill(doc, g, x + 4.6, y);
    font(doc, 'normal', 6.6, INK_2);
    doc.text(range, x + 10.6, y + 3);
    x += widths[i] + gap;
  });
  font(doc, 'normal', 6.8, MUTED);
  doc.text('Rank is within the class section. Pass mark is 33% in each subject.', LEFT, y + 8.5);
  return y + 11;
}

function signatures(doc, y) {
  doc.setDrawColor(...INK_2);
  doc.setLineWidth(0.3);
  [['Class Teacher', 40], ['Principal', 105], ['Parent / Guardian', 170]].forEach(([text, x]) => {
    doc.line(x - 24, y, x + 24, y);
    font(doc, 'bold', 8, INK_2);
    doc.text(text, x, y + 4.5, { align: 'center' });
  });
}

function footer(doc, school, report, page, pages) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(LEFT, 286, RIGHT, 286);
  logo(doc, LEFT, 287.2, 5);
  font(doc, 'normal', 6.8, MUTED);
  doc.text(fit(doc, `${safe(school.name || 'School')}  ·  Progress report of ${safe(report.student.name)}`, 145), LEFT + 6.5, 290.6);
  doc.text(`Page ${page} of ${pages}`, RIGHT, 290.6, { align: 'right' });
}

function drawReport(doc, report, school) {
  const firstPage = doc.getNumberOfPages();
  const newPage = () => {
    doc.addPage();
    return slimHeader(doc, school, report);
  };
  const ensure = (y, need) => (y + need > LIMIT ? newPage() : y);

  let y = bigHeader(doc, school, report);
  y = studentPanel(doc, report, y);
  y = summary(doc, report, y);
  y = marksTable(doc, report, y, newPage) + 7;

  if (report.subjects.length) {
    y = ensure(y, BAR_CHART_H);
    y = subjectChart(doc, report, y + 2);
  }
  if (groupRows(report.rows).filter(g => g.pct !== null).length >= 2) {
    y = ensure(y + 3, LINE_CHART_H);
    y = progressChart(doc, report, y + 2);
  }
  y += 3;
  y = ensure(y, remarksAndHighlights(doc, report, y, true));
  y = remarksAndHighlights(doc, report, y) + 4;
  y = ensure(y, 11);
  y = gradeScale(doc, y);
  y = ensure(y, 15);
  signatures(doc, Math.max(y + 11, 268));

  const lastPage = doc.getNumberOfPages();
  for (let p = firstPage; p <= lastPage; p += 1) {
    doc.setPage(p);
    footer(doc, school, report, p - firstPage + 1, lastPage - firstPage + 1);
  }
  doc.setPage(lastPage);
}

// ---------------------------------------------------------------- supplied-artwork result card

function resultCardText(doc, text, x, y, width, size = 10, color = NAVY, align = 'left', style = 'bold') {
  doc.setFont('Caladea', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const value = fit(doc, text, width);
  doc.text(value, x, y, { align });
}

function resultCardBannerText(doc, text, x, y, width, size) {
  const value = safe(text);
  doc.setFont('Caladea', 'bold');
  doc.setTextColor(...WHITE);
  doc.setFontSize(size);
  const naturalWidth = doc.getTextWidth(value);
  doc.setFontSize(naturalWidth > width ? size * width / naturalWidth : size);
  doc.text(value, x, y, { align: 'center' });
}

function resultCardBanner(doc, report, options) {
  const heading = safe(options.heading || 'PROGRESS REPORT / RESULT CARD');
  const session = academicSession(report);
  const defaultHeading = 'PROGRESS REPORT / RESULT CARD';
  const defaultSession = '2026-2027';

  // Leave the supplied lettering untouched for the reference values. When a
  // user customises either line, repaint only its text band in the artwork's
  // blue treatment and redraw it in the same centered sans-serif style.
  if (heading !== defaultHeading) {
    doc.setFillColor(2, 66, 136);
    doc.rect(4.1, 59.5, 201.8, 11.3, 'F');
    resultCardBannerText(doc, heading, 105, 68.5, 181, 28);
  }
  if (session !== defaultSession) {
    doc.setFillColor(189, 229, 252);
    doc.rect(58, 73.1, 94, 6.8, 'F');
    resultCardBannerText(doc, `Academic Session: ${session}`, 105, 78, 98, 16);
  }
}

function resultCardPhoto(doc, photo, studentId) {
  if (!photo) return;
  try {
    const x = 6.8;
    const y = 85.6;
    const width = 36.5;
    const height = 49.7;
    const props = doc.getImageProperties(photo);
    const ratio = props.width / props.height;
    const inset = 1.7;
    const imageBoxX = x + inset;
    const imageBoxY = y + inset;
    const imageBoxW = width - inset * 2;
    const imageBoxH = height - inset * 2;
    const boxRatio = imageBoxW / imageBoxH;
    // Cover the photo frame and center-crop the excess so portrait and
    // landscape uploads both fill the same box without being distorted.
    const imageW = ratio > boxRatio ? imageBoxH * ratio : imageBoxW;
    const imageH = ratio > boxRatio ? imageBoxH : imageBoxW / ratio;
    const imageX = imageBoxX + (imageBoxW - imageW) / 2;
    const imageY = imageBoxY + (imageBoxH - imageH) / 2;
    doc.setFillColor(252, 253, 254);
    doc.setDrawColor(48, 59, 71);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, width, height, 1.6, 1.6, 'FD');
    doc.saveGraphicsState();
    doc.rect(imageBoxX, imageBoxY, imageBoxW, imageBoxH, null);
    doc.clip();
    doc.discardPath();
    doc.addImage(photo, photo.startsWith('data:image/png') ? 'PNG' : 'JPEG', imageX, imageY, imageW, imageH, `result-card-photo-${studentId || 'student'}`, 'FAST');
    doc.restoreGraphicsState();
    doc.setDrawColor(48, 59, 71);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, width, height, 1.6, 1.6, 'S');
  } catch {
    // The fixed placeholder in the supplied background remains visible.
  }
}

function resultCardStudent(doc, report) {
  const st = report.student;
  const color = [8, 24, 101];
  resultCardPhoto(doc, st.photo, st.id);
  resultCardText(doc, st.name || '-', 94.5, 93.7, 108, 16, color);
  resultCardText(doc, `${st.std || '-'}-${st.section || '-'}`, 94.5, 106.25, 37, 15, color);
  resultCardText(doc, String(st.roll || '-'), 166.2, 106.25, 36, 15, color);
  resultCardText(doc, st.dateOfBirth ? niceDate(st.dateOfBirth) : '-', 94.5, 118.9, 108, 15, color);
  resultCardText(doc, st.grNo || '-', 94.5, 131.65, 108, 15, color);
}

function resultCardSubjectRemark(subject) {
  const custom = safe(subject.remarks || subject.remark || '').trim();
  if (custom) return custom;
  if (subject.allAbsent) return 'Absent';
  if (!subject.max || subject.pct === null || subject.pct === undefined || !Number.isFinite(Number(subject.pct))) return 'No marks';
  const pct = Number(subject.pct);
  if (pct >= 90) return 'Excellent';
  if (pct >= 75) return 'Very good';
  if (pct >= 60) return 'Good';
  if (pct >= 40) return 'Needs practice';
  return 'Needs support';
}

function resultCardLowerHalf(doc, report, pageSubjects = report.subjects) {
  const columns = [4.3, 21.75, 72.35, 95, 120.65, 143.55, 175.65, 205.9];
  const centers = columns.slice(0, -1).map((x, index) => (x + columns[index + 1]) / 2);
  const subjects = pageSubjects.slice(0, RESULT_CARD_ROWS);
  const bodyX = columns[0] + 0.2;
  const bodyY = 153.55;
  const bodyW = columns[columns.length - 1] - columns[0] - 0.4;
  const bodyBottom = 226.1;
  const bodyH = bodyBottom - bodyY;
  const rowHeight = subjects.length ? bodyH / subjects.length : 0;

  // Keep the supplied table header and surrounding artwork, but replace its
  // preprinted rows with exactly one alternating-color row per subject.
  doc.setFillColor(255, 255, 255);
  doc.rect(bodyX, bodyY, bodyW, bodyH, 'F');

  subjects.forEach((subject, index) => {
    const rowTop = bodyY + index * rowHeight;
    const y = rowTop + rowHeight / 2 + 0.1;
    if (index % 2 === 1) {
      doc.setFillColor(230, 244, 255);
      doc.rect(bodyX, rowTop, bodyW, rowHeight, 'F');
    }
    const absent = Boolean(subject.allAbsent);
    const pct = subject.pct;
    const values = [
      subject.subject,
      subject.max ? String(subject.max) : '-',
      absent ? 'AB' : num(subject.obtained),
      absent ? 'AB' : grade(pct),
      absent || pct === null ? '-' : `${num(pct)}%`,
      resultCardSubjectRemark(subject)
    ];
    resultCardText(doc, `${index + 1}.`, centers[0], y, columns[1] - columns[0] - 2, 11.3, [8, 24, 101], 'center');
    resultCardText(doc, values[0], columns[1] + 2.1, y, columns[2] - columns[1] - 4.2, 11.5, [8, 24, 101]);
    resultCardText(doc, values[1], centers[2], y, columns[3] - columns[2] - 2.5, 11, [8, 24, 101], 'center');
    resultCardText(doc, values[2], centers[3], y, columns[4] - columns[3] - 2.5, 11, [8, 24, 101], 'center');
    resultCardText(doc, values[3], centers[4], y, columns[5] - columns[4] - 2.5, 11, [8, 24, 101], 'center');
    resultCardText(doc, values[4], centers[5], y, columns[6] - columns[5] - 2.5, 11, [8, 24, 101], 'center');
    resultCardText(doc, values[5], columns[6] + 2, y, columns[7] - columns[6] - 4, 9.4, absent || (pct !== null && pct < 40) ? RED : [8, 24, 101]);
  });

  // Draw only the row dividers that belong to the subjects on this page.
  doc.setDrawColor(24, 55, 89);
  doc.setLineWidth(0.22);
  columns.slice(1, -1).forEach(x => doc.line(x, bodyY, x, bodyBottom));
  for (let row = 1; row < subjects.length; row += 1) {
    const y = bodyY + row * rowHeight;
    doc.line(columns[0], y, columns[columns.length - 1], y);
  }
  doc.line(columns[0], bodyBottom, columns[columns.length - 1], bodyBottom);

  const total = report.total;
  resultCardText(doc, total.max ? `${num(total.obtained)} / ${total.max}` : '-', 81.7, 247.4, 38, 12, [8, 24, 101], 'center');
  resultCardText(doc, total.pct === null ? '-' : `${num(total.pct)}%`, 81.7, 259.1, 38, 12, [8, 24, 101], 'center');
  resultCardText(doc, total.grade || '-', 81.7, 270.8, 38, 12, [8, 24, 101], 'center');

  const remarks = safe(report.remarks || '').trim();
  if (remarks) {
    doc.setFont('Caladea', 'normal');
    doc.setFontSize(9.1);
    doc.setTextColor(8, 24, 101);
    const lines = doc.splitTextToSize(remarks, 87).slice(0, 5);
    lines.forEach((line, index) => doc.text(line, 112.8, 244.5 + index * 6.8));
  }
}

function drawResultCard(doc, report, school, options, subjectPage = 0) {
  if (!RESULT_CARD_TEMPLATE) return;
  doc.addImage(RESULT_CARD_TEMPLATE, 'JPEG', 0, 0, 210, 315, 'result-card-template', 'FAST');
  resultCardBanner(doc, report, options);
  resultCardStudent(doc, report);
  const pageCount = Math.max(1, Math.ceil(report.subjects.length / RESULT_CARD_ROWS));
  const baseSize = Math.floor(report.subjects.length / pageCount);
  const extra = report.subjects.length % pageCount;
  const start = subjectPage * baseSize + Math.min(subjectPage, extra);
  const pageSize = baseSize + (subjectPage < extra ? 1 : 0);
  resultCardLowerHalf(doc, report, report.subjects.slice(start, start + pageSize));
}

function registerResultCardFonts(doc) {
  for (const style of ['Regular', 'Bold']) {
    const fileName = `Caladea-${style}.ttf`;
    const fontData = fs.readFileSync(path.join(RESULT_CARD_FONT_DIR, fileName)).toString('base64');
    doc.addFileToVFS(fileName, fontData);
    doc.addFont(fileName, 'Caladea', style === 'Regular' ? 'normal' : 'bold');
  }
}

/** Renders one or more report cards into a single PDF and returns it as a Buffer. */
function renderReportCards(reports, school, options = {}) {
  const template = options.template === 'result-card' ? 'result-card' : 'modern';
  const doc = new jsPDF({ unit: 'mm', format: template === 'result-card' ? [210, 315] : 'a4', compress: true });
  if (template === 'result-card') registerResultCardFonts(doc);
  let pageStarted = false;
  reports.forEach((report, i) => {
    const pageCount = template === 'result-card'
      ? Math.max(1, Math.ceil(report.subjects.length / RESULT_CARD_ROWS))
      : 1;
    for (let subjectPage = 0; subjectPage < pageCount; subjectPage += 1) {
      if (pageStarted) doc.addPage();
      pageStarted = true;
      if (template === 'result-card') drawResultCard(doc, report, school || {}, options, subjectPage);
      else drawReport(doc, report, school || {});
    }
  });
  doc.setProperties({ title: 'Report Card', creator: safe(school && school.name) });
  return Buffer.from(doc.output('arraybuffer'));
}

function reportFileName(report) {
  const name = safe(report.student.name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Student';
  return `Report_Card_${name}_Class${report.student.std}${report.student.section}.pdf`;
}

module.exports = { renderReportCards, reportFileName };
