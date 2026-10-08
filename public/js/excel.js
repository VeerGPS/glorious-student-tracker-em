// Reading and writing Excel files in the browser.
// One reader understands all the layouts the school uses:
//   * a single header row:  Roll No | Name | Science (30) | Maths (50) ...
//   * the school's periodic-test sheet: a subject row ("Sci 30)") above a header
//     row that has the test date under each subject
//   * an optional "Max marks" row under the header.

let loading = null;
export function ensureXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { loading = null; reject(new Error('Could not load the Excel reader. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function serialToIso(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function readSheetRows(file) {
  const XLSX = await ensureXlsx();
  const buf = await file.arrayBuffer();
  const isText = /\.(csv|txt)$/i.test(file.name);
  const wb = isText
    ? XLSX.read(new TextDecoder('utf-8').decode(new Uint8Array(buf)), { type: 'string' })
    : XLSX.read(buf, { type: 'array', cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The file has no sheets.');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  // Remember which cells Excel formats as dates so they can be read as dates.
  const dateCells = new Set();
  Object.keys(ws).forEach(addr => {
    if (addr[0] === '!') return;
    const cell = ws[addr];
    if (cell && cell.t === 'n' && cell.z && /[dy]/i.test(String(cell.z)) && !/[#0]\.?0*%?$/.test(String(cell.z))) {
      const { r, c } = XLSX.utils.decode_cell(addr);
      dateCells.add(`${r}:${c}`);
    }
  });
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0 } };
  return rows.map((row, r) => (row || []).map((v, c) => {
    if (typeof v === 'number' && dateCells.has(`${r + range.s.r}:${c}`) && v > 20000 && v < 80000) return serialToIso(v);
    return v;
  }));
}

function text(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- dates & subjects

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function makeIso(y, m, d) {
  y = String(y).length === 2 ? (parseInt(y, 10) < 70 ? 2000 + parseInt(y, 10) : 1900 + parseInt(y, 10)) : parseInt(y, 10);
  m = parseInt(m, 10);
  d = parseInt(d, 10);
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Finds a date inside text. Indian order (day/month/year) is assumed.
export function findDate(value) {
  if (typeof value === 'number') return value > 20000 && value < 80000 ? { iso: serialToIso(value), match: String(value) } : null;
  const s = text(value);
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) { const iso = makeIso(m[1], m[2], m[3]); if (iso) return { iso, match: m[0] }; }
  m = s.match(/(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]*(\d{2,4})/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) { const iso = makeIso(m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], m[1]); if (iso) return { iso, match: m[0] }; }
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    const iso = makeIso(m[3], mo, d);
    if (iso) return { iso, match: m[0] };
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return findDate(parseFloat(s));
  return null;
}

// A date typed carelessly in a row of dates: "13/06/" (no year) or "14/8/t26".
function looseDate(value, yearHint) {
  const s = text(value);
  if (!/^[\d\s/.\-()a-z]{3,20}$/i.test(s) || (s.match(/[a-z]/gi) || []).length > 2 || !/[/.\-]/.test(s)) return null;
  const nums = s.match(/\d+/g) || [];
  let d = parseInt(nums[0], 10);
  let mo = parseInt(nums[1], 10);
  if (mo > 12 && d <= 12) [d, mo] = [mo, d];
  let iso = null;
  if (nums.length >= 3 && /^(\d{2}|\d{4})$/.test(nums[2])) iso = makeIso(nums[2], mo, d);
  else if (nums.length === 2 && yearHint) iso = makeIso(yearHint, mo, d);
  return iso ? { iso, match: s } : null;
}

function datedTitle(papers) {
  const dates = [...new Set(papers.map(p => p.date).filter(Boolean))].sort();
  if (!dates.length) return '';
  const fmt = (iso, withYear) => {
    const [y, m, d] = iso.split('-').map(Number);
    const month = Object.keys(MONTHS)[m - 1];
    return `${d} ${month.charAt(0).toUpperCase()}${month.slice(1)}${withYear ? ` ${y}` : ''}`;
  };
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return `Test ${fmt(first, true)}`;
  return `Tests ${fmt(first, first.slice(0, 4) !== last.slice(0, 4))} to ${fmt(last, true)}`;
}

const SUBJECTS = [
  [/^(?:maths?|mathematics|ganit)\b\.?/i, 'Mathematics'],
  [/^(?:sci|science|vigyan)\b\.?/i, 'Science'],
  [/^(?:s\.?\s*s\b\.?|social\s*sci(?:ence)?|social\s*studies|samajik\s*vigyan)\b\.?/i, 'Social Science'],
  [/^(?:eng|english|angreji)\b\.?/i, 'English'],
  [/^(?:hin|hindi)\b\.?/i, 'Hindi'],
  [/^(?:guj|gujarati)\b\.?/i, 'Gujarati'],
  [/^(?:sans|skt|sanskrit)\b\.?/i, 'Sanskrit'],
  [/^(?:comp|computer|cs|it)\b\.?/i, 'Computer'],
  [/^(?:evs|env|environment(?:al)?(?:\s*studies)?)\b\.?/i, 'EVS'],
  [/^(?:pe|pt|physical\s*education)\b\.?/i, 'Physical Education'],
  [/^(?:draw|drawing|art)\b\.?/i, 'Drawing'],
  [/^(?:gk|general\s*knowledge)\b\.?/i, 'General Knowledge']
];

export const COMMON_SUBJECTS = ['English', 'Mathematics', 'Science', 'Social Science', 'Hindi', 'Gujarati', 'Sanskrit', 'Computer', 'EVS', 'Drawing'];

// "Sci 30)" -> Science, max 30 · "Eng 30) poem" -> English, topic poem · "Maths (50) 12/09/2026"
export function parseSubjectLabel(label) {
  let s = text(label);
  const out = { subject: '', max: null, date: '', topic: '' };
  const date = findDate(s);
  if (date) {
    out.date = date.iso;
    s = s.replace(date.match, ' ');
  }
  const maxPatterns = [
    /(?:out\s*of|max(?:imum)?(?:\s*marks?)?|total(?:\s*marks?)?|marks?)\s*[:=-]?\s*(\d{1,4}(?:\.\d+)?)/i,
    /[([{]\s*\/?\s*(\d{1,4}(?:\.\d+)?)\s*(?:marks?|m)?\s*[)\]}]?/i,
    /(\d{1,4}(?:\.\d+)?)\s*(?:marks?|m)?\s*[)\]}]/i,
    /\/\s*(\d{1,4}(?:\.\d+)?)/
  ];
  for (const re of maxPatterns) {
    const m = s.match(re);
    if (m && parseFloat(m[1]) > 0) {
      out.max = parseFloat(m[1]);
      s = s.replace(m[0], ' ');
      break;
    }
  }
  s = s.replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, name] of SUBJECTS) {
    const m = s.match(re);
    if (m) {
      out.subject = name;
      out.topic = s.slice(m[0].length).replace(/^[\s\-–—:;,/.]+/, '').trim();
      return out;
    }
  }
  const parts = s.split(/\s[-–—:]\s|\s*[-–—:]\s*/);
  out.subject = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
  out.topic = parts.slice(1).join(' ').trim();
  return out;
}

// ---------------------------------------------------------------- headers

function columnKind(value) {
  const s = text(value).toLowerCase();
  if (!s) return null;
  if (/mobile|phone|contact|whats\s*app|cell/.test(s)) return 'mobile';
  if (/\bg\.?\s*r\.?\b|gr\s*no|g\.r|general\s*reg|register/.test(s)) return 'gr';
  if (/\broll\b|^r\.?\s*no\.?$|^no\.?$|^sr\.?(\s*no\.?)?$|^s\.\s*no\.?$|^serial|^#$|^seat/.test(s)) return 'roll';
  if (/(father|mother|parent|guardian)/.test(s)) return 'skip';
  if (/name|student|candidate/.test(s)) return 'name';
  if (/^(sec|section|div|division)\b/.test(s)) return 'section';
  if (/^(class|std|standard)\b/.test(s)) return 'class';
  if (/^(total|grand total|obtained|percentage|percent|%|rank|grade|result|remarks?|attendance|avg|average|sign)/.test(s)) return 'skip';
  return null;
}

function findHeaderRow(rows) {
  let best = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
    const kinds = (rows[r] || []).map(columnKind);
    const hasName = kinds.includes('name');
    const hasId = kinds.includes('roll') || kinds.includes('gr');
    const score = (hasName ? 2 : 0) + (hasId ? 2 : 0) + kinds.filter(k => k && k !== 'skip').length * 0.1;
    if (score > bestScore && (hasName || hasId)) {
      best = r;
      bestScore = score;
      if (hasName && hasId) break;
    }
  }
  return best;
}

function metaColumns(header) {
  const cols = { roll: -1, gr: -1, name: -1, section: -1, class: -1, mobile: [], skip: new Set() };
  header.forEach((cell, c) => {
    const kind = columnKind(cell);
    if (!kind) return;
    if (kind === 'mobile') cols.mobile.push(c);
    else if (kind === 'skip') cols.skip.add(c);
    else if (cols[kind] === -1) cols[kind] = c;
    else cols.skip.add(c);
  });
  return cols;
}

function isMeta(cols, c) {
  return c === cols.roll || c === cols.gr || c === cols.name || c === cols.section || c === cols.class || cols.mobile.includes(c) || cols.skip.has(c);
}

function detectClass(rows, upTo) {
  for (let r = 0; r < upTo; r += 1) {
    for (const cell of rows[r] || []) {
      const s = text(cell);
      const m = s.match(/(?:class|std|standard|grade)\s*[-:.]?\s*(\d{1,2})\b/i) || s.match(/^(\d{1,2})\s*(?:st|nd|rd|th)\b/i) || s.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+(?:class|std|standard)\b/i);
      if (m && parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 12) return String(parseInt(m[1], 10));
    }
  }
  return null;
}

function detectTitle(rows, upTo) {
  for (let r = 0; r < upTo; r += 1) {
    for (const cell of rows[r] || []) {
      const s = text(cell);
      if (/test|exam|term|periodic|unit|assessment|round/i.test(s) && s.length <= 60 && !/school/i.test(s)) return s;
    }
  }
  return '';
}

export function niceMax(highest) {
  for (const m of [10, 20, 25, 30, 40, 50, 80, 100]) if (highest <= m) return m;
  return Math.ceil(highest / 10) * 10;
}

function isBlank(v) {
  return v === null || v === undefined || text(v) === '';
}

// ---------------------------------------------------------------- marks sheet

export function parseMarksSheet(rows, fileName = '') {
  const h = findHeaderRow(rows);
  if (h < 0) throw new Error('Could not find the header row. The sheet needs a "Roll No" or "Name" column.');
  const header = rows[h] || [];
  const cols = metaColumns(header);
  const width = Math.max(...rows.slice(h, h + 60).map(r => (r ? r.length : 0)), header.length);

  // Optional rows straight under the header that hold max marks or dates.
  let dataStart = h + 1;
  const extraMax = {};
  const extraDate = {};
  for (let r = h + 1; r < Math.min(rows.length, h + 3); r += 1) {
    const row = rows[r] || [];
    const idCell = text(row[cols.name >= 0 ? cols.name : cols.roll]).toLowerCase();
    const looksMeta = (cols.name < 0 || isBlank(row[cols.name]) || /max|total|out of|date/.test(idCell)) && (cols.roll < 0 || isBlank(row[cols.roll]) || /max|total|date/.test(text(row[cols.roll]).toLowerCase()));
    if (!looksMeta) break;
    let used = false;
    for (let c = 0; c < width; c += 1) {
      if (isMeta(cols, c) || isBlank(row[c])) continue;
      const d = typeof row[c] === 'string' || row[c] > 20000 ? findDate(row[c]) : null;
      if (d) { extraDate[c] = d.iso; used = true; } else if (!isNaN(parseFloat(row[c]))) { extraMax[c] = parseFloat(row[c]); used = true; }
    }
    if (!used) break;
    dataStart = r + 1;
  }

  // The school's periodic-test sheet has a row of dates as the header and the
  // subjects in the row above. Spot that layout, and read even dates typed
  // carelessly ("13/06/", "14/8/t26", "17/07/2026(50)") when it is used.
  const strictDate = v => (typeof v === 'string' || typeof v === 'number' ? findDate(v) : null);
  const years = header.map(strictDate).filter(Boolean).map(d => d.iso.slice(0, 4));
  const yearHint = years.sort((a, b) => years.filter(y => y === b).length - years.filter(y => y === a).length)[0] || String(new Date().getFullYear());
  const headCols = [];
  for (let c = 0; c < width; c += 1) if (!isMeta(cols, c) && !isBlank(header[c])) headCols.push(c);
  const strictCount = headCols.filter(c => strictDate(header[c])).length;
  const dateRow = h > 0 && strictCount > 0 && headCols.filter(c => strictDate(header[c]) || looseDate(header[c], yearHint)).length >= headCols.length / 2;
  const dateOf = v => strictDate(v) || (dateRow ? looseDate(v, yearHint) : null);
  const labelAbove = c => {
    for (let up = h - 1; up >= Math.max(0, h - 2); up -= 1) {
      const above = text((rows[up] || [])[c]);
      if (above) return above;
    }
    return '';
  };
  const isMarkLike = v => typeof v === 'number' || /^(ab|a|abs|absent|-?\d+(\.\d+)?)$/i.test(text(v));

  // Subject label for each remaining column. When the header cell is a date,
  // the subject is in the row above (merged cells carry the label to the right).
  const papers = [];
  let carry = '';
  for (let c = 0; c < width; c += 1) {
    if (isMeta(cols, c)) { carry = ''; continue; }
    const head = header[c];
    const headDate = dateOf(head);
    // Whatever is left beside the date, e.g. "(50)", can only hold the max marks.
    const rest = headDate ? parseSubjectLabel(text(head).replace(headDate.match, ' ')) : null;
    const headIsDate = headDate && !rest.subject;
    let label = '';
    let date = '';
    let headMax = null;
    if (headIsDate) {
      date = headDate.iso;
      headMax = rest.max;
      label = labelAbove(c) || carry;
      carry = label;
    } else if (isBlank(head) && dateRow && labelAbove(c)) {
      label = labelAbove(c);
      carry = label;
    } else {
      label = text(head);
      carry = '';
    }
    const filled = rows.slice(dataStart).map(r => (r ? r[c] : null)).filter(v => !isBlank(v));
    if (!label) {
      // A column without a heading is used only if it clearly holds marks
      // (not a stray note or a second half of a name).
      const marks = filled.filter(isMarkLike).length;
      if (marks < 3 || marks < filled.length * 0.8) continue;
      label = `Subject ${papers.length + 1}`;
    }
    if (columnKind(label) === 'skip') continue;
    const parsed = parseSubjectLabel(label);
    if (!parsed.subject) continue;
    papers.push({
      col: c,
      label,
      subject: parsed.subject,
      topic: parsed.topic,
      date: date || parsed.date || extraDate[c] || '',
      max: extraMax[c] || headMax || parsed.max || null
    });
  }
  if (!papers.length) throw new Error('No subject columns were found next to the student names.');

  const out = [];
  for (let r = dataStart; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const roll = cols.roll >= 0 ? text(row[cols.roll]) : '';
    const name = cols.name >= 0 ? text(row[cols.name]) : '';
    const grNo = cols.gr >= 0 ? text(row[cols.gr]) : '';
    if (!roll && !name && !grNo) continue;
    if (!roll && /^(total|average|avg|highest|lowest|max|class average)/i.test(name)) continue;
    if (roll && !/\d/.test(roll) && !name) continue;
    out.push({
      line: r + 1,
      roll,
      name,
      grNo,
      section: cols.section >= 0 ? text(row[cols.section]) : '',
      values: papers.map(p => (isBlank(row[p.col]) ? '' : (typeof row[p.col] === 'number' ? row[p.col] : text(row[p.col]))))
    });
  }
  if (!out.length) throw new Error('No student rows were found under the header.');

  // Fill in missing maximum marks from the highest mark in the column.
  papers.forEach((p, i) => {
    const nums = out.map(r => parseFloat(r.values[i])).filter(n => !isNaN(n));
    const highest = nums.length ? Math.max(...nums) : 50;
    // A label like "Science (Ch 2)" can be misread as "out of 2"; if most marks
    // are above the max, the max was misread — guess it instead.
    const misread = p.max && nums.filter(n => n > p.max).length > nums.length / 2;
    if (p.max && !misread) return;
    p.max = niceMax(highest);
    p.maxGuessed = true;
  });

  const classCol = cols.class >= 0 ? out.map(r => text((rows[r.line - 1] || [])[cols.class])).find(Boolean) : '';
  const fileTitle = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\b(class|std)\s*\d+\b/ig, '').replace(/\b(marks?|template|sheet|copy)\b/ig, '').replace(/\s+/g, ' ').trim();
  // A file name like "updated common sheet-3" says nothing about the test; the dates do.
  const fileNamesTest = fileTitle.length >= 3 && /test|exam|term|periodic|unit|assessment|round|weekly|monthly|half|annual|final|prelim/i.test(fileTitle);
  return {
    std: detectClass(rows, h + 1) || (classCol ? (classCol.match(/\d{1,2}/) || [])[0] || null : null),
    title: detectTitle(rows, h + 1) || (fileNamesTest ? fileTitle : datedTitle(papers) || (fileTitle.length >= 3 ? fileTitle : '')),
    papers,
    rows: out
  };
}

// ---------------------------------------------------------------- student list

export function parseStudentSheet(rows) {
  const h = findHeaderRow(rows);
  if (h < 0) throw new Error('Could not find the header row. The sheet needs "Roll No" and "Name" columns.');
  const header = rows[h] || [];
  const cols = metaColumns(header);
  // Join first / middle / last name columns if the sheet splits the name.
  const nameParts = [];
  header.forEach((cell, c) => { if (/^(first|middle|last|sur)\s*name|^surname/i.test(text(cell))) nameParts.push(c); });
  const out = [];
  for (let r = h + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const name = nameParts.length >= 2 ? nameParts.map(c => text(row[c])).filter(Boolean).join(' ') : (cols.name >= 0 ? text(row[cols.name]) : '');
    const roll = cols.roll >= 0 ? text(row[cols.roll]) : '';
    const grNo = cols.gr >= 0 ? text(row[cols.gr]) : '';
    if (!name && !roll && !grNo) continue;
    out.push({
      line: r + 1,
      roll,
      name,
      grNo,
      section: cols.section >= 0 ? text(row[cols.section]) : '',
      std: cols.class >= 0 ? text(row[cols.class]) : '',
      mobile: cols.mobile.map(c => text(row[c])).filter(Boolean).join(', ')
    });
  }
  if (!out.length) throw new Error('No students were found under the header row.');
  return { std: detectClass(rows, h + 1), rows: out };
}

// ---------------------------------------------------------------- templates

function paperHeader(paper, test) {
  const topic = paper.topic ? ` ${paper.topic}` : '';
  const date = paper.date && paper.date !== test.date ? ` ${paper.date.split('-').reverse().join('/')}` : '';
  return `${paper.subject}${topic} (${paper.max})${date}`;
}

export async function downloadMarksTemplate(test, studentList, schoolName) {
  const XLSX = await ensureXlsx();
  const aoa = [
    [schoolName || 'School', '', `Class ${test.std}`, '', test.name],
    [],
    ['Roll No', 'Student Name', 'Section', ...test.papers.map(p => paperHeader(p, test))]
  ];
  studentList.forEach(s => {
    const row = test.marks[s.id] || {};
    aoa.push([s.roll, s.name, s.section, ...test.papers.map(p => (row[p.id] === undefined ? '' : row[p.id]))]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 8 }, ...test.papers.map(() => ({ wch: 18 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, `Class_${test.std}_${test.name.replace(/[^A-Za-z0-9]+/g, '_')}_marks.xlsx`);
}

export async function downloadBlankMarksTemplate(std, studentList, subjects, schoolName) {
  const XLSX = await ensureXlsx();
  const subs = subjects.length ? subjects : ['English', 'Mathematics', 'Science', 'Social Science'];
  const aoa = [
    [schoolName || 'School', '', `Class ${std}`, '', 'Unit Test 1'],
    [],
    ['Roll No', 'Student Name', 'Section', ...subs.map(s => `${s} (50)`)]
  ];
  studentList.forEach(s => aoa.push([s.roll, s.name, s.section]));
  if (!studentList.length) aoa.push([1, 'Example Student', 'A', 45, 38, 'AB', 41]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 8 }, ...subs.map(() => ({ wch: 18 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, `Class_${std}_marks_template.xlsx`);
}

export async function downloadStudentList(std, studentList) {
  const XLSX = await ensureXlsx();
  const aoa = [['Roll No', 'Student Name', 'GR No', 'Section', 'Mobile']];
  studentList.forEach(s => aoa.push([s.roll, s.name, s.grNo || '', s.section, s.mobile || '']));
  if (!studentList.length) aoa.push([1, 'Example Student', '1234', 'A', '9876543210']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 12 }, { wch: 9 }, { wch: 26 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Class ${std}`);
  XLSX.writeFile(wb, `Class_${std}_students.xlsx`);
}

export async function downloadResultsSheet(test, studentList) {
  const XLSX = await ensureXlsx();
  const aoa = [['Roll No', 'Student Name', 'Section', ...test.papers.map(p => paperHeader(p, test)), 'Total', 'Out of', 'Percentage']];
  studentList.forEach(s => {
    const row = test.marks[s.id] || {};
    let obt = 0;
    let max = 0;
    const cells = test.papers.map(p => {
      const v = row[p.id];
      if (v === undefined) return '';
      obt += v === 'AB' ? 0 : v;
      max += p.max;
      return v;
    });
    aoa.push([s.roll, s.name, s.section, ...cells, max ? obt : '', max || '', max ? Math.round((obt / max) * 1000) / 10 : '']);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  XLSX.writeFile(wb, `Class_${test.std}_${test.name.replace(/[^A-Za-z0-9]+/g, '_')}_results.xlsx`);
}
