'use strict';

const { jsPDF } = require('jspdf');
const { formatDate } = require('./util');

const NAVY = [30, 58, 138];
const TEAL = [13, 148, 136];
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const ZEBRA = [241, 245, 249];

// The built-in PDF fonts only cover Latin characters.
function safe(text) {
  const s = String(text === null || text === undefined ? '' : text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '');
  return s;
}

function fit(doc, text, width) {
  let s = safe(text);
  if (doc.getTextWidth(s) <= width) return s;
  while (s.length > 1 && doc.getTextWidth(`${s}...`) > width) s = s.slice(0, -1);
  return `${s}...`;
}

const BAR = [42, 120, 214];
const CRITICAL = [208, 59, 59];

function header(doc, school, title) {
  doc.setFillColor(...NAVY);
  doc.rect(10, 10, 190, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(fit(doc, (school.name || 'School').toUpperCase(), 180), 105, 20, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (school.address) doc.text(fit(doc, school.address, 182), 105, 27, { align: 'center' });

  doc.setFillColor(...TEAL);
  doc.rect(10, 33, 190, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(fit(doc, `PROGRESS REPORT  -  ${String(title || '').toUpperCase()}`, 184), 105, 38.6, { align: 'center' });
}

const COLS = [
  { key: 'subject', label: 'SUBJECT', x: 13, w: 38 },
  { key: 'test', label: 'TEST', x: 52, w: 44 },
  { key: 'date', label: 'DATE', x: 97, w: 20 },
  { key: 'max', label: 'MAX', x: 131, align: 'right' },
  { key: 'marks', label: 'MARKS', x: 148, align: 'right' },
  { key: 'pct', label: '%', x: 163, align: 'right' },
  { key: 'grade', label: 'GRADE', x: 176, align: 'center' },
  { key: 'rank', label: 'RANK', x: 191, align: 'center' }
];

function tableHeader(doc, y) {
  doc.setFillColor(...NAVY);
  doc.rect(10, y, 190, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  COLS.forEach(c => doc.text(c.label, c.x, y + 5.4, c.align ? { align: c.align } : undefined));
  return y + 8;
}

function cellText(row, key) {
  switch (key) {
    case 'subject': return row.topic ? `${row.subject} - ${row.topic}` : row.subject;
    case 'test': return row.test;
    case 'date': return formatDate(row.date);
    case 'max': return String(row.max);
    case 'marks': return row.marks === 'AB' ? 'AB' : String(row.marks);
    case 'pct': return row.marks === 'AB' ? '-' : String(row.pct);
    case 'grade': return row.grade;
    case 'rank': return row.rank ? `${row.rank}/${row.of}` : '-';
    default: return '';
  }
}

function drawReport(doc, report, school) {
  header(doc, school, report.title);
  const st = report.student;

  // Student details
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(10, 44, 190, 22);
  doc.line(105, 44, 105, 66);
  doc.line(10, 55, 200, 55);
  const label = (text, x, y) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(text, x, y); };
  const value = (text, x, y, w) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(fit(doc, text, w), x, y); };
  label('STUDENT NAME', 13, 48.5);
  value((st.name || '').toUpperCase(), 13, 53, 88);
  label('ROLL NO  /  GR NO', 108, 48.5);
  value(`${st.roll}   /   ${st.grNo || '-'}`, 108, 53, 88);
  label('CLASS', 13, 59.5);
  value(`Class ${st.std} - ${st.section}`, 13, 64, 40);
  label('ATTENDANCE', 58, 59.5);
  value(report.attendance ? `${report.attendance.present}/${report.attendance.total} days (${report.attendance.pct}%)` : 'Not recorded', 58, 64, 46);
  label('DATE OF ISSUE', 108, 59.5);
  value(formatDate(new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)), 108, 64, 40);
  label('CLASS RANK', 153, 59.5);
  value(report.rank ? `${report.rank.rank} of ${report.rank.of}` : '-', 153, 64, 44);

  // Marks table
  let y = tableHeader(doc, 70);
  doc.setFontSize(8.5);
  if (!report.rows.length) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...MUTED);
    doc.text('No marks have been entered for this selection yet.', 105, y + 7, { align: 'center' });
    y += 12;
  }
  report.rows.forEach((row, i) => {
    if (y > 262) {
      doc.addPage();
      header(doc, school, `${report.title} (continued)`);
      y = tableHeader(doc, 44);
      doc.setFontSize(8.5);
    }
    if (i % 2 === 0) {
      doc.setFillColor(...ZEBRA);
      doc.rect(10, y, 190, 6.6, 'F');
    }
    const fail = row.marks === 'AB' || row.pct < 33;
    COLS.forEach(c => {
      doc.setFont('helvetica', c.key === 'marks' || c.key === 'subject' ? 'bold' : 'normal');
      doc.setTextColor(...(c.key === 'marks' && fail ? [220, 38, 38] : INK));
      const text = c.w ? fit(doc, cellText(row, c.key), c.w) : safe(cellText(row, c.key));
      doc.text(text, c.x, y + 4.6, c.align ? { align: c.align } : undefined);
    });
    y += 6.6;
  });

  // Totals
  doc.setFillColor(...TEAL);
  doc.rect(10, y, 190, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const t = report.total;
  doc.text('TOTAL', 13, y + 5.4);
  doc.text(String(t.max || 0), 131, y + 5.4, { align: 'right' });
  doc.text(String(t.obtained || 0), 148, y + 5.4, { align: 'right' });
  doc.text(t.pct === null ? '-' : `${t.pct}`, 163, y + 5.4, { align: 'right' });
  doc.text(t.grade, 176, y + 5.4, { align: 'center' });
  doc.text(report.rank ? `${report.rank.rank}/${report.rank.of}` : '-', 191, y + 5.4, { align: 'center' });
  y += 13;

  // Subject bars
  const subjects = report.subjects.slice(0, 10);
  const barsHeight = subjects.length ? 9 + subjects.length * 6 : 0;
  const footerSpace = 50;
  if (subjects.length && y + barsHeight + footerSpace > 287) {
    doc.addPage();
    header(doc, school, `${report.title} (continued)`);
    y = 48;
  }
  if (subjects.length) {
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('SUBJECT-WISE PERFORMANCE', 10, y);
    y += 3;
    subjects.forEach(s => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(fit(doc, s.subject, 36), 10, y + 4);
      doc.setFillColor(...ZEBRA);
      doc.rect(48, y + 1, 100, 4, 'F');
      const pct = Math.max(0, Math.min(100, s.pct));
      const below = !s.allAbsent && pct < 33;
      doc.setFillColor(...(below ? CRITICAL : BAR));
      if (pct > 0) doc.rect(48, y + 1, pct, 4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...INK);
      if (s.allAbsent) doc.text('Absent', 152, y + 4);
      else doc.text(`${s.pct}%  (${s.obtained}/${s.max})${below ? '  - below pass mark' : ''}`, 152, y + 4);
      y += 6;
    });
    y += 4;
  }

  // Remarks
  doc.setDrawColor(...LINE);
  const remarkLines = doc.splitTextToSize(safe(report.remarks), 182);
  const boxH = 8 + remarkLines.length * 4.2;
  doc.rect(10, y, 190, boxH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("TEACHER'S REMARKS", 13, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(remarkLines, 13, y + 9);
  y += boxH + 5;

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Grades: A1 91-100  |  A2 81-90  |  B1 71-80  |  B2 61-70  |  C1 51-60  |  C2 41-50  |  D 33-40  |  E below 33  |  AB = Absent', 105, y, { align: 'center' });
  doc.text('Rank is within the class section. Pass mark is 33% in each subject.', 105, y + 3.6, { align: 'center' });

  if (y + 22 > 290) {
    doc.addPage();
    header(doc, school, `${report.title} (continued)`);
    y = 48;
  }
  const sigY = Math.max(y + 18, 272);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  [['Class Teacher', 40], ['Principal', 105], ['Parent / Guardian', 170]].forEach(([text, x]) => {
    doc.line(x - 22, sigY, x + 22, sigY);
    doc.text(text, x, sigY + 4.5, { align: 'center' });
  });
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
