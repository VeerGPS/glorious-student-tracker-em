'use strict';

const { jsPDF } = require('jspdf');

// A4 portrait, millimetres.
const PAGE_W = 210;
const LEFT = 12;
const RIGHT = 198;
const WIDTH = RIGHT - LEFT;
const LIMIT = 279; // lowest point for content; the footer sits below it

const WHITE = [255, 255, 255];
const INK = [15, 23, 42];
const INK_2 = [51, 65, 85];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const ZEBRA = [248, 250, 252];
const INDIGO = [67, 56, 202];
const INDIGO_DARK = [30, 27, 75];
const INDIGO_SOFT = [238, 242, 255];
const LAVENDER = [245, 243, 255];
const LAVENDER_LINE = [221, 214, 254];
const GOLD = [245, 158, 11];
const ORANGE = [234, 88, 12];
const RED = [208, 59, 59];
const AMBER_TEXT = [180, 83, 9];
const HEADER_STOPS = [[30, 27, 75], [76, 29, 149], [112, 26, 117]];
const TILE_COLORS = [[67, 56, 202], [180, 83, 9], [4, 120, 87], [162, 28, 175]];
// Result bands (same colours as the app's charts): 80+, 60-79, 33-59, below 33.
const BANDS = [[12, 163, 12], [42, 120, 214], [201, 133, 0], [208, 59, 59]];
const GRADE_COLORS = {
  A1: [4, 120, 87], A2: [4, 120, 87], B1: [29, 78, 216], B2: [29, 78, 216],
  C1: [161, 98, 7], C2: [161, 98, 7], D: [194, 65, 12], E: [190, 18, 60], AB: [100, 116, 139]
};
const GRADE_SCALE = [['A1', '91-100'], ['A2', '81-90'], ['B1', '71-80'], ['B2', '61-70'], ['C1', '51-60'], ['C2', '41-50'], ['D', '33-40'], ['E', 'below 33']];
const SERIES_STUDENT = [67, 56, 202];
const SERIES_CLASS = [235, 104, 52];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function dateRange(dates) {
  const list = [...new Set(dates.filter(Boolean))].sort();
  if (!list.length) return '';
  const first = list[0];
  const last = list[list.length - 1];
  if (first === last) return niceDate(first);
  return `${niceDate(first, first.slice(0, 4) !== last.slice(0, 4))} – ${niceDate(last)}`;
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

function bandColor(pct) {
  if (pct >= 80) return BANDS[0];
  if (pct >= 60) return BANDS[1];
  if (pct >= 33) return BANDS[2];
  return BANDS[3];
}

function initials(name) {
  const words = safe(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

function num(n) {
  return n === null || n === undefined ? '-' : String(Math.round(n * 10) / 10);
}

// ---------------------------------------------------------------- drawing helpers

// Text with letter spacing; jsPDF's own alignment ignores the spacing.
function spaced(doc, text, x, y, { align = 'left', charSpace = 0.3 } = {}) {
  const w = doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  doc.text(text, left, y, { charSpace });
}

function font(doc, style, size, color) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

// A smooth left-to-right gradient through the given colour stops.
function gradientBand(doc, y, h, stops) {
  const strips = 84;
  const w = PAGE_W / strips;
  for (let i = 0; i < strips; i += 1) {
    const t = i / (strips - 1);
    const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const local = t * (stops.length - 1) - seg;
    doc.setFillColor(...mix(stops[seg], stops[seg + 1], local));
    doc.rect(i * w, y, w + 0.4, h, 'F');
  }
}

function withOpacity(doc, opacity, draw) {
  doc.setGState(new doc.GState({ opacity }));
  draw();
  doc.setGState(new doc.GState({ opacity: 1 }));
}

function emblem(doc, cx, cy) {
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.circle(cx, cy, 11, 'S');
  doc.setFillColor(...ORANGE);
  doc.circle(cx, cy, 9.6, 'F');
  withOpacity(doc, 0.35, () => {
    doc.setFillColor(...GOLD);
    doc.circle(cx - 2.5, cy - 3, 6, 'F');
  });
  // Graduation cap
  doc.setFillColor(...WHITE);
  doc.roundedRect(cx - 3.8, cy - 0.6, 7.6, 3.9, 1.2, 1.2, 'F');
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.45);
  doc.triangle(cx - 6.6, cy - 1.8, cx, cy - 5.2, cx + 6.6, cy - 1.8, 'FD');
  doc.triangle(cx - 6.6, cy - 1.8, cx, cy + 1.6, cx + 6.6, cy - 1.8, 'FD');
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.5);
  doc.line(cx + 5.1, cy - 1.8, cx + 5.1, cy + 3.2);
  doc.circle(cx + 5.1, cy + 3.6, 0.7, 'F');
}

function gradePill(doc, gradeText, cx, y) {
  const color = GRADE_COLORS[gradeText] || MUTED;
  doc.setFillColor(...color);
  doc.roundedRect(cx - 4.6, y, 9.2, 4.2, 2.1, 2.1, 'F');
  font(doc, 'bold', 7, WHITE);
  doc.text(safe(gradeText), cx, y + 3, { align: 'center' });
}

function sectionTitle(doc, text, y) {
  doc.setFillColor(...INDIGO);
  doc.roundedRect(LEFT, y - 3.4, 1.6, 4.4, 0.8, 0.8, 'F');
  font(doc, 'bold', 9.5, INDIGO_DARK);
  doc.text(text, LEFT + 4, y);
}

// ---------------------------------------------------------------- page parts

function bigHeader(doc, school, report) {
  gradientBand(doc, 0, 40, HEADER_STOPS);
  withOpacity(doc, 0.08, () => {
    doc.setFillColor(...WHITE);
    doc.circle(176, -6, 30, 'F');
    doc.circle(206, 34, 18, 'F');
  });
  doc.setFillColor(...GOLD);
  doc.rect(0, 40, PAGE_W, 1.3, 'F');

  emblem(doc, LEFT + 12, 20);

  const nameX = LEFT + 28;
  const name = safe(school.name || 'School').toUpperCase();
  let size = 19;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  while (size > 12 && doc.getTextWidth(name) > 92) { size -= 0.5; doc.setFontSize(size); }
  font(doc, 'bold', size, WHITE);
  doc.text(fit(doc, name, 92), nameX, 18.5);
  doc.setFillColor(...GOLD);
  doc.rect(nameX, 21.3, 16, 0.9, 'F');
  if (school.address) {
    font(doc, 'normal', 8, [224, 231, 255]);
    doc.text(fit(doc, school.address, 92), nameX, 27);
  }

  font(doc, 'bold', 13, WHITE);
  spaced(doc, 'PROGRESS REPORT', RIGHT, 16.5, { align: 'right', charSpace: 0.6 });
  font(doc, 'normal', 8.5, [233, 213, 255]);
  doc.text(fit(doc, report.title || 'All Tests', 60), RIGHT, 22.5, { align: 'right' });
  font(doc, 'bold', 7.5, [253, 230, 138]);
  spaced(doc, `ACADEMIC YEAR ${academicYear(report)}`, RIGHT, 28, { align: 'right' });
  return 47;
}

function slimHeader(doc, school, report) {
  gradientBand(doc, 0, 14, HEADER_STOPS);
  doc.setFillColor(...GOLD);
  doc.rect(0, 14, PAGE_W, 0.8, 'F');
  font(doc, 'bold', 10.5, WHITE);
  doc.text(fit(doc, safe(school.name || 'School').toUpperCase(), 100), LEFT, 9);
  font(doc, 'normal', 8, [233, 213, 255]);
  doc.text(fit(doc, `Progress report · ${report.student.name} (continued)`, 80), RIGHT, 9, { align: 'right' });
  return 22;
}

function studentCard(doc, report, y) {
  const st = report.student;
  const h = 27;
  doc.setFillColor(...LAVENDER);
  doc.setDrawColor(...LAVENDER_LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(LEFT, y, WIDTH, h, 3, 3, 'FD');

  // Initials badge
  doc.setFillColor(...INDIGO);
  doc.circle(LEFT + 13, y + h / 2, 8.5, 'F');
  withOpacity(doc, 0.25, () => {
    doc.setFillColor(...WHITE);
    doc.circle(LEFT + 10.5, y + h / 2 - 3, 4, 'F');
  });
  font(doc, 'bold', 12, WHITE);
  doc.text(initials(st.name), LEFT + 13, y + h / 2 + 1.6, { align: 'center' });

  const x = LEFT + 26;
  font(doc, 'bold', 6.5, MUTED);
  doc.text('STUDENT NAME', x, y + 6.5, { charSpace: 0.3 });
  font(doc, 'bold', 13.5, INK);
  doc.text(fit(doc, safe(st.name).toUpperCase(), 100), x, y + 12.5);

  const facts = [
    ['CLASS', `${st.std} - ${st.section}`],
    ['ROLL NO', String(st.roll)],
    ['GR NO', st.grNo ? safe(st.grNo) : '-']
  ];
  facts.forEach(([label, value], i) => {
    const fx = x + i * 28;
    font(doc, 'bold', 6.5, MUTED);
    doc.text(label, fx, y + 18.5, { charSpace: 0.3 });
    font(doc, 'bold', 10, INK_2);
    doc.text(fit(doc, value, 26), fx, y + 23.5);
  });

  // Right column
  const rx = 152;
  doc.setDrawColor(...LAVENDER_LINE);
  doc.line(rx - 4, y + 5, rx - 4, y + h - 5);
  font(doc, 'bold', 6.5, MUTED);
  doc.text('DATE OF ISSUE', rx, y + 9, { charSpace: 0.3 });
  font(doc, 'bold', 10, INK_2);
  doc.text(niceDate(todayIst()), rx, y + 14);
  font(doc, 'bold', 6.5, MUTED);
  doc.text('REPORT COVERS', rx, y + 19.5, { charSpace: 0.3 });
  font(doc, 'bold', 9, INK_2);
  const testCount = new Set(report.rows.map(r => r.testId || r.test)).size;
  doc.text(report.rows.length ? `${testCount} test${testCount === 1 ? '' : 's'} · ${report.rows.length} paper${report.rows.length === 1 ? '' : 's'}` : 'No marks yet', rx, y + 24.5);
  return y + h + 4;
}

function tiles(doc, report, y) {
  const t = report.total;
  const a = report.attendance;
  const items = [
    ['OVERALL', t.pct === null ? '-' : `${t.pct}%`, t.pct === null ? 'No marks yet' : `Grade ${t.grade}`],
    ['CLASS RANK', report.rank ? String(report.rank.rank) : '-', report.rank ? `out of ${report.rank.of} in ${report.student.std}-${report.student.section}` : 'Not ranked'],
    ['TOTAL MARKS', t.max ? `${num(t.obtained)} / ${t.max}` : '-', report.subjects.length ? `in ${report.subjects.length} subject${report.subjects.length === 1 ? '' : 's'}` : 'No marks yet'],
    ['ATTENDANCE', a ? `${a.pct}%` : '-', a ? `${a.present} of ${a.total} days present` : 'Not recorded']
  ];
  const gap = 4;
  const w = (WIDTH - gap * 3) / 4;
  const h = 20;
  items.forEach(([label, value, note], i) => {
    const x = LEFT + i * (w + gap);
    doc.setFillColor(...TILE_COLORS[i]);
    doc.roundedRect(x, y, w, h, 3, 3, 'F');
    // Soft circles inside the tile's lower-right corner.
    withOpacity(doc, 0.13, () => {
      doc.setFillColor(...WHITE);
      doc.circle(x + w - 6, y + h - 5, 4.5, 'F');
      doc.circle(x + w - 13, y + h - 2.6, 2.2, 'F');
    });
    font(doc, 'bold', 6.5, [237, 233, 254]);
    doc.text(label, x + 4, y + 5.6, { charSpace: 0.4 });
    font(doc, 'bold', value.length > 9 ? 13 : 16, WHITE);
    doc.text(fit(doc, value, w - 8), x + 4, y + 13.2);
    font(doc, 'normal', 7, [237, 233, 254]);
    doc.text(fit(doc, note, w - 8), x + 4, y + 17.6);
  });
  return y + h + 6;
}

// Marks table columns (x is the anchor for the given alignment).
const COLS = [
  { key: 'subject', label: 'SUBJECT', x: LEFT + 3, w: 45 },
  { key: 'date', label: 'DATE', x: 62, w: 22 },
  { key: 'max', label: 'MAX', x: 94, align: 'right' },
  { key: 'marks', label: 'MARKS', x: 110, align: 'right' },
  { key: 'pct', label: '%', x: 123, align: 'right' },
  { key: 'grade', label: 'GRADE', x: 136, align: 'center' },
  { key: 'average', label: 'CLASS AVG', x: 161, align: 'right' },
  { key: 'highest', label: 'HIGHEST', x: 177, align: 'right' },
  { key: 'rank', label: 'RANK', x: 190, align: 'center' }
];
const ROW_H = 5.6;
const GROUP_H = 6.4;
const HEAD_H = 7;

function tableHeader(doc, y) {
  doc.setFillColor(...INDIGO_DARK);
  doc.roundedRect(LEFT, y, WIDTH, HEAD_H, 2, 2, 'F');
  doc.rect(LEFT, y + HEAD_H - 2, WIDTH, 2, 'F');
  font(doc, 'bold', 6.8, WHITE);
  COLS.forEach(c => spaced(doc, c.label, c.x, y + 4.6, { align: c.align || 'left', charSpace: 0.2 }));
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
  return groups;
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
    let obt = 0;
    let max = 0;
    g.rows.forEach(r => { obt += r.marks === 'AB' ? 0 : r.marks; max += r.max; });
    doc.setFillColor(...INDIGO_SOFT);
    doc.rect(LEFT, y, WIDTH, GROUP_H, 'F');
    doc.setFillColor(...INDIGO);
    doc.rect(LEFT, y, 1.2, GROUP_H, 'F');
    font(doc, 'bold', 8.3, INDIGO_DARK);
    doc.text(fit(doc, g.name, 92), LEFT + 3.5, y + 4.3);
    font(doc, 'normal', 7.3, INK_2);
    const pct = max ? Math.round((obt / max) * 1000) / 10 : null;
    doc.text(`${dateRange(g.rows.map(r => r.date))}   ·   ${num(obt)} / ${max}${pct === null ? '' : `   ·   ${pct}%`}`, RIGHT - 3, y + 4.3, { align: 'right' });
    y += GROUP_H;

    g.rows.forEach((row, i) => {
      ensure(ROW_H);
      if (i % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(LEFT, y, WIDTH, ROW_H, 'F');
      }
      const absent = row.marks === 'AB';
      const fail = !absent && row.pct < 33;
      const base = y + 3.9;
      font(doc, 'bold', 8.3, INK);
      doc.text(fit(doc, row.topic ? `${row.subject} - ${row.topic}` : row.subject, COLS[0].w), COLS[0].x, base);
      font(doc, 'normal', 7.6, MUTED);
      doc.text(niceDate(row.date), COLS[1].x, base);
      font(doc, 'normal', 8.3, INK_2);
      doc.text(String(row.max), COLS[2].x, base, { align: 'right' });
      font(doc, 'bold', 8.8, absent ? AMBER_TEXT : fail ? RED : INK);
      doc.text(absent ? 'AB' : num(row.marks), COLS[3].x, base, { align: 'right' });
      font(doc, 'normal', 8.3, fail ? RED : INK_2);
      doc.text(absent ? '-' : num(row.pct), COLS[4].x, base, { align: 'right' });
      gradePill(doc, row.grade, COLS[5].x, y + 0.7);
      font(doc, 'normal', 7.8, MUTED);
      doc.text(num(row.average), COLS[6].x, base, { align: 'right' });
      doc.text(row.highest === null || row.highest === undefined ? '-' : num(row.highest), COLS[7].x, base, { align: 'right' });
      font(doc, 'normal', 7.8, INK_2);
      doc.text(row.rank ? `${row.rank}/${row.of}` : '-', COLS[8].x, base, { align: 'center' });
      y += ROW_H;
    });
  });

  // Overall total
  ensure(8);
  const t = report.total;
  doc.setFillColor(...INDIGO_DARK);
  doc.roundedRect(LEFT, y + 0.6, WIDTH, 7.4, 2, 2, 'F');
  doc.rect(LEFT, y + 0.6, WIDTH, 2, 'F');
  const base = y + 5.4;
  font(doc, 'bold', 8.5, WHITE);
  doc.text('OVERALL TOTAL', COLS[0].x, base, { charSpace: 0.3 });
  doc.text(String(t.max || 0), COLS[2].x, base, { align: 'right' });
  doc.text(num(t.obtained || 0), COLS[3].x, base, { align: 'right' });
  doc.text(t.pct === null ? '-' : String(t.pct), COLS[4].x, base, { align: 'right' });
  if (t.pct !== null) {
    doc.setFillColor(...WHITE);
    doc.roundedRect(COLS[5].x - 4.6, y + 2.2, 9.2, 4.2, 2.1, 2.1, 'F');
    font(doc, 'bold', 7, INDIGO_DARK);
    doc.text(safe(t.grade), COLS[5].x, y + 5.2, { align: 'center' });
  }
  font(doc, 'bold', 8.5, WHITE);
  doc.text(report.rank ? `${report.rank.rank}/${report.rank.of}` : '-', COLS[8].x, base, { align: 'center' });
  return y + 8;
}

// Class average % per subject, from the class average of each paper.
function subjectClassAverages(report) {
  const out = {};
  report.rows.forEach(r => {
    if (r.average === null || r.average === undefined) return;
    const s = out[r.subject] || (out[r.subject] = { obt: 0, max: 0 });
    s.obt += r.average;
    s.max += r.max;
  });
  Object.keys(out).forEach(k => { out[k] = out[k].max ? (out[k].obt / out[k].max) * 100 : null; });
  return out;
}

function subjectSection(doc, report, y) {
  const subjects = report.subjects.slice(0, 12);
  const avgs = subjectClassAverages(report);
  sectionTitle(doc, 'SUBJECT-WISE PERFORMANCE', y);
  y += 4;
  const trackX = LEFT + 38;
  const trackW = 100;
  subjects.forEach(s => {
    const pct = Math.max(0, Math.min(100, s.pct));
    font(doc, 'bold', 8.3, INK);
    doc.text(fit(doc, s.subject, 36), LEFT, y + 4);
    doc.setFillColor(...LINE);
    doc.roundedRect(trackX, y + 1.2, trackW, 4, 2, 2, 'F');
    if (!s.allAbsent && pct > 0) {
      doc.setFillColor(...bandColor(pct));
      doc.roundedRect(trackX, y + 1.2, Math.max(4, pct), 4, 2, 2, 'F');
    }
    const avg = avgs[s.subject];
    if (avg !== null && avg !== undefined) {
      const ax = trackX + Math.max(0, Math.min(100, avg));
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.5);
      doc.line(ax, y + 0.4, ax, y + 6);
      doc.setFillColor(...INK);
      doc.triangle(ax - 1, y - 0.6, ax + 1, y - 0.6, ax, y + 0.6, 'F');
    }
    if (s.allAbsent) {
      font(doc, 'bold', 8.3, AMBER_TEXT);
      doc.text('Absent', trackX + trackW + 4, y + 4);
    } else {
      const below = pct < 33;
      font(doc, 'bold', 8.5, below ? RED : INK);
      const pctText = `${s.pct}%`;
      doc.text(pctText, trackX + trackW + 4, y + 4);
      const after = trackX + trackW + 4 + doc.getTextWidth(pctText) + 2;
      font(doc, 'normal', 7.6, below ? RED : MUTED);
      doc.text(`${num(s.obtained)}/${s.max}${below ? '  · below pass mark' : ''}`, after, y + 4);
    }
    y += 6.3;
  });
  // Legend
  y += 3;
  let lx = trackX;
  font(doc, 'normal', 7, MUTED);
  [['80%+', BANDS[0]], ['60-79%', BANDS[1]], ['33-59%', BANDS[2]], ['Below 33%', BANDS[3]]].forEach(([label, color]) => {
    doc.setFillColor(...color);
    doc.roundedRect(lx, y - 2.3, 3, 2.6, 0.6, 0.6, 'F');
    doc.text(label, lx + 4.2, y);
    lx += 6 + doc.getTextWidth(label) + 4;
  });
  if (Object.keys(avgs).length) {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.line(lx + 1, y - 2.8, lx + 1, y + 0.6);
    doc.text('Class average', lx + 3.5, y);
  }
  return y + 6;
}

function subjectSectionHeight(report) {
  return 4 + Math.min(12, report.subjects.length) * 6.3 + 9;
}

// Each test's result for the student and for the class, in date order.
function testTimeline(report) {
  return groupRows(report.rows).map(g => {
    let obt = 0;
    let max = 0;
    let avgObt = 0;
    let avgMax = 0;
    g.rows.forEach(r => {
      obt += r.marks === 'AB' ? 0 : r.marks;
      max += r.max;
      if (r.average !== null && r.average !== undefined) { avgObt += r.average; avgMax += r.max; }
    });
    const dates = [...new Set(g.rows.map(r => r.date).filter(Boolean))].sort();
    const label = !dates.length ? g.name : dates.length === 1 ? niceDate(dates[0], false) : `${niceDate(dates[0], false)} – ${niceDate(dates[dates.length - 1], false)}`;
    return { label, pct: max ? (obt / max) * 100 : null, classPct: avgMax ? (avgObt / avgMax) * 100 : null };
  }).filter(t => t.pct !== null);
}

const CHART_H = 64;

function progressChart(doc, report, y) {
  const points = testTimeline(report);
  sectionTitle(doc, 'PROGRESS ACROSS TESTS', y);
  // Legend
  font(doc, 'normal', 7, MUTED);
  let lx = RIGHT - 62;
  [[SERIES_STUDENT, safe(report.student.name).split(' ')[0] || 'Student', false], [SERIES_CLASS, 'Class average', true]].forEach(([color, label, dashed]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    if (dashed) doc.setLineDashPattern([1.2, 0.9], 0);
    doc.line(lx, y - 1, lx + 6, y - 1);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...color);
    doc.circle(lx + 3, y - 1, 0.9, 'F');
    doc.text(fit(doc, label, 22), lx + 8, y);
    lx += 32;
  });

  const top = y + 6;
  const bottom = top + 44;
  const x0 = LEFT + 12;
  const x1 = RIGHT - 6;
  const yOf = v => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top);
  font(doc, 'normal', 6.5, MUTED);
  [0, 25, 50, 75, 100].forEach(v => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(v === 0 ? 0.4 : 0.2);
    doc.line(x0, yOf(v), x1, yOf(v));
    doc.text(`${v}%`, x0 - 2, yOf(v) + 1, { align: 'right' });
  });
  // Pass mark
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(x0, yOf(33), x1, yOf(33));
  doc.setLineDashPattern([], 0);
  font(doc, 'normal', 6, RED);
  doc.text('pass 33%', x1, yOf(33) - 1, { align: 'right' });

  const step = points.length > 1 ? (x1 - x0 - 16) / (points.length - 1) : 0;
  const xOf = i => (points.length > 1 ? x0 + 8 + i * step : (x0 + x1) / 2);

  // Soft area under the student's line
  withOpacity(doc, 0.1, () => {
    doc.setFillColor(...SERIES_STUDENT);
    for (let i = 0; i < points.length - 1; i += 1) {
      const xa = xOf(i);
      const xb = xOf(i + 1);
      doc.triangle(xa, yOf(points[i].pct), xb, yOf(points[i + 1].pct), xa, bottom, 'F');
      doc.triangle(xb, yOf(points[i + 1].pct), xb, bottom, xa, bottom, 'F');
    }
  });

  const series = (key, color, dashed) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(dashed ? 0.6 : 0.9);
    if (dashed) doc.setLineDashPattern([1.2, 0.9], 0);
    for (let i = 0; i < points.length - 1; i += 1) {
      if (points[i][key] === null || points[i + 1][key] === null) continue;
      doc.line(xOf(i), yOf(points[i][key]), xOf(i + 1), yOf(points[i + 1][key]));
    }
    doc.setLineDashPattern([], 0);
    points.forEach((pt, i) => {
      if (pt[key] === null) return;
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...color);
      doc.setLineWidth(0.6);
      doc.circle(xOf(i), yOf(pt[key]), 1.2, 'FD');
    });
  };
  series('classPct', SERIES_CLASS, true);
  series('pct', SERIES_STUDENT, false);

  points.forEach((pt, i) => {
    const studentAbove = pt.classPct === null || pt.pct >= pt.classPct;
    font(doc, 'bold', 7.2, SERIES_STUDENT);
    doc.text(`${num(pt.pct)}%`, xOf(i), yOf(pt.pct) + (studentAbove ? -2.4 : 4.4), { align: 'center' });
    if (pt.classPct !== null) {
      font(doc, 'normal', 6.4, SERIES_CLASS);
      doc.text(`${num(pt.classPct)}%`, xOf(i), yOf(pt.classPct) + (studentAbove ? 4 : -2.2), { align: 'center' });
    }
    font(doc, 'normal', 6.6, INK_2);
    doc.text(fit(doc, pt.label, Math.max(18, step - 2)), xOf(i), bottom + 4.5, { align: 'center' });
  });
  return bottom + 8;
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
  doc.setFontSize(8.3);
  const none = !report.rows.length;
  const strongLines = doc.splitTextToSize(safe(strong.length ? strong.join(', ') : none ? 'Shown once marks are entered.' : 'Keep working steadily in every subject.'), rightW - 8);
  const weakLines = doc.splitTextToSize(safe(weak.length ? weak.join(', ') : none ? '-' : 'No subject below 40%.'), rightW - 8);
  const leftH = 11 + lines.length * 4.3;
  const rightH = 15 + (strongLines.length + weakLines.length) * 3.8;
  const h = Math.max(24, leftH, rightH);
  if (measureOnly) return h;

  doc.setFillColor(255, 251, 235);
  doc.roundedRect(LEFT, y, leftW, h, 3, 3, 'F');
  doc.setFillColor(...GOLD);
  doc.roundedRect(LEFT, y, 1.6, h, 0.8, 0.8, 'F');
  font(doc, 'bold', 7, AMBER_TEXT);
  doc.text("TEACHER'S REMARKS", LEFT + 5, y + 6, { charSpace: 0.3 });
  font(doc, 'normal', 9, INK);
  doc.text(lines, LEFT + 5, y + 11.5);

  doc.setFillColor(...LAVENDER);
  doc.roundedRect(rightX, y, rightW, h, 3, 3, 'F');
  font(doc, 'bold', 7, [4, 120, 87]);
  doc.text('STRENGTHS', rightX + 4, y + 6, { charSpace: 0.3 });
  font(doc, 'normal', 8.3, INK);
  doc.text(strongLines, rightX + 4, y + 10.5);
  const wy = y + 10.5 + strongLines.length * 3.8 + 2.5;
  font(doc, 'bold', 7, [190, 18, 60]);
  doc.text('NEEDS ATTENTION', rightX + 4, wy, { charSpace: 0.3 });
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
  doc.text('Rank is within the class section. Pass mark is 33% in each subject. Class avg and highest are the marks in that paper.', LEFT, y + 8.5);
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
  font(doc, 'normal', 6.8, MUTED);
  doc.text(fit(doc, `${safe(school.name || 'School')}  ·  Progress report of ${safe(report.student.name)}  ·  Computer-generated report card`, 150), LEFT, 290);
  doc.text(`Page ${page} of ${pages}`, RIGHT, 290, { align: 'right' });
}

function drawReport(doc, report, school) {
  const firstPage = doc.getNumberOfPages();
  const newPage = () => {
    doc.addPage();
    return slimHeader(doc, school, report);
  };
  const ensure = (y, need) => (y + need > LIMIT ? newPage() : y);

  let y = bigHeader(doc, school, report);
  y = studentCard(doc, report, y);
  y = tiles(doc, report, y);
  y = marksTable(doc, report, y, newPage);
  y += 8;

  if (report.subjects.length) {
    y = ensure(y, subjectSectionHeight(report));
    y = subjectSection(doc, report, y + 2);
  }
  if (testTimeline(report).length >= 2) {
    y = ensure(y + 4, CHART_H);
    y = progressChart(doc, report, y + 2);
  }
  y += 2;
  y = ensure(y, remarksAndHighlights(doc, report, y, true));
  y = remarksAndHighlights(doc, report, y) + 5;
  y = ensure(y, 11);
  y = gradeScale(doc, y);
  y = ensure(y, 15);
  signatures(doc, Math.max(y + 11, 270));

  const lastPage = doc.getNumberOfPages();
  for (let p = firstPage; p <= lastPage; p += 1) {
    doc.setPage(p);
    footer(doc, school, report, p - firstPage + 1, lastPage - firstPage + 1);
  }
  doc.setPage(lastPage);
}

/** Renders one or more report cards into a single PDF and returns it as a Buffer. */
function renderReportCards(reports, school) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  reports.forEach((report, i) => {
    if (i > 0) doc.addPage();
    drawReport(doc, report, school || {});
  });
  doc.setProperties({ title: 'Report Card', creator: safe(school && school.name) });
  return Buffer.from(doc.output('arraybuffer'));
}

function reportFileName(report) {
  const name = safe(report.student.name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Student';
  return `Report_Card_${name}_Class${report.student.std}${report.student.section}.pdf`;
}

module.exports = { renderReportCards, reportFileName };
