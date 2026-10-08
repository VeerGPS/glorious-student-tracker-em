'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '../public/js/excel.js')).href);

test('reads the school\'s periodic-test sheet (subject row above a row of dates)', async () => {
  const { parseMarksSheet } = await load();
  const rows = [
    ['Glorious Public School', '', '', '', '', ''],
    ['8th', '', '', '', '', ''],
    ['', '', 'Sci 30)', 'Sci (30)', 'Eng 30) poem', 'SS(30) Ch 2'],
    ['No.', 'Student Name', 46225, '05/08/2026', '2026-08-14', 46241],
    [1, 'AARY PRAKASHBHAI TABIYAD', 23, 27, 23, 24],
    [2, 'AARYARAJE BHANUBHAI PATEL', 30, 29, 29, 'ab'],
    [null, null, null, null, null, null],
    ['', 'Class average', 26, 28, 26, 24]
  ];
  const r = parseMarksSheet(rows, 'Class_8_Aug_Periodic_Tests.xlsx');
  assert.equal(r.std, '8');
  assert.deepEqual(r.papers.map(p => [p.subject, p.max, p.date, p.topic]), [
    ['Science', 30, '2026-07-22', ''],
    ['Science', 30, '2026-08-05', ''],
    ['English', 30, '2026-08-14', 'poem'],
    ['Social Science', 30, '2026-08-07', 'Ch 2']
  ]);
  assert.equal(r.rows.length, 2, 'blank and average rows are skipped');
  assert.deepEqual(r.rows[1].values, [30, 29, 29, 'ab']);
  assert.equal(r.rows[0].line, 5);
});

test('reads a simple sheet with max marks in the headings', async () => {
  const { parseMarksSheet } = await load();
  const rows = [
    ['Gr No.', 'Name', 'Roll No', 'Mathematics 12/09/2026 (50)', 'Science (Total: 40)', 'English /25', 'Total', 'Percentage'],
    ['501', 'Riya', 1, 48, 38, 'AB', 86, 72],
    ['502', 'Om', 2, 40, 30, 20, 90, 78]
  ];
  const r = parseMarksSheet(rows, 'marks.xlsx');
  assert.deepEqual(r.papers.map(p => `${p.subject}/${p.max}/${p.date}`), ['Mathematics/50/2026-09-12', 'Science/40/', 'English/25/']);
  assert.deepEqual(r.rows[0], { line: 2, roll: '1', name: 'Riya', grNo: '501', section: '', values: [48, 38, 'AB'] });
});

test('reads a separate "max marks" row and guesses a missing maximum', async () => {
  const { parseMarksSheet } = await load();
  const rows = [
    ['Roll', 'Student', 'Maths', 'Hindi', 'Drawing'],
    ['', 'Max marks', 80, 20, ''],
    [1, 'A', 70, 18, 9],
    [2, 'B', 66, 'absent', 7]
  ];
  const r = parseMarksSheet(rows);
  assert.deepEqual(r.papers.map(p => p.max), [80, 20, 10]);
  assert.equal(r.papers[2].maxGuessed, true);
  assert.equal(r.rows.length, 2);
});

test('a heading like "Science (Ch 2)" is not read as "out of 2"', async () => {
  const { parseMarksSheet } = await load();
  const rows = [['Roll No', 'Name', 'Science (Ch 2)'], [1, 'A', 18], [2, 'B', 22], [3, 'C', 1]];
  const r = parseMarksSheet(rows);
  assert.equal(r.papers[0].max, 25);
  assert.equal(r.papers[0].maxGuessed, true);
});

test('student list: joins father and mother mobile, keeps sections', async () => {
  const { parseStudentSheet } = await load();
  const rows = [
    ['Class 7 Student List'],
    ['Sr No', 'Student Name', "Father's Name", 'G.R. No', 'Div', 'Father Mobile', 'Mother Mobile'],
    [1, 'Kavya Shah', 'Mehul Shah', '7001', 'B', '9876543210', '9876543211'],
    [2, 'Om Joshi', 'Nilesh Joshi', '7002', 'A', '', '']
  ];
  const r = parseStudentSheet(rows);
  assert.equal(r.std, '7');
  assert.deepEqual(r.rows[0], { line: 3, roll: '1', name: 'Kavya Shah', grNo: '7001', section: 'B', std: '', mobile: '9876543210, 9876543211' });
  assert.equal(r.rows[1].mobile, '');
});

test('clear message when the sheet has no header', async () => {
  const { parseMarksSheet } = await load();
  assert.throws(() => parseMarksSheet([[1, 2, 3], [4, 5, 6]]), /header row/);
});
