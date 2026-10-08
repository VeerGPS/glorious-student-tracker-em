import { html, mount, icon, fmtWhen, fmtDate, pct, plural, chips, busy, downloadBlob, $ } from '../ui.js';
import { state, students, sections, attendanceFor, select, classesForUser, student as findStudent, fetchFile } from '../data.js';
import { legacyBanner } from './common.js';
import { ensureCharts, makeChart, palette, percentAxis, valueLabels, BANDS, bandIndex } from '../charts.js';
import { openInsights } from './insights.js';

// Filters stay while the office moves around the app.
const filters = { cls: 'all', subject: 'all', from: '', to: '' };
let dirSearch = '';
const DIR_PAGE = 25;
let dirLimit = DIR_PAGE;

const round = n => Math.round(n * 10) / 10;

// Every mark in scope, as one row each.
function markRows({ std, subject, from, to }) {
  const out = [];
  state.data.tests.forEach(t => {
    if (std !== 'all' && t.std !== std) return;
    t.papers.forEach(p => {
      if (subject !== 'all' && p.subject !== subject) return;
      const date = p.date || t.date;
      if (from && date < from) return;
      if (to && date > to) return;
      Object.entries(t.marks).forEach(([sid, row]) => {
        const v = row[p.id];
        if (v === undefined || !findStudent(sid)) return;
        out.push({ std: t.std, testId: t.id, sid, subject: p.subject, date, max: p.max, absent: v === 'AB', obt: v === 'AB' ? 0 : v });
      });
    });
  });
  return out;
}

// Average of marks actually written (absent papers are counted separately).
function average(rows) {
  let obt = 0;
  let max = 0;
  rows.forEach(r => { if (!r.absent) { obt += r.obt; max += r.max; } });
  return max ? (obt / max) * 100 : null;
}

function passRate(rows) {
  const sat = rows.filter(r => !r.absent);
  return sat.length ? (sat.filter(r => (r.obt / r.max) * 100 >= 33).length / sat.length) * 100 : null;
}

// Per-student percentage, counting absent papers as 0 (same as the report card).
function studentPercents(rows) {
  const by = new Map();
  rows.forEach(r => {
    const s = by.get(r.sid) || { obt: 0, max: 0, n: 0 };
    s.obt += r.obt;
    s.max += r.max;
    s.n += 1;
    by.set(r.sid, s);
  });
  const out = new Map();
  by.forEach((v, k) => out.set(k, { pct: v.max ? (v.obt / v.max) * 100 : null, papers: v.n }));
  return out;
}

function classStatus(kids, avg) {
  if (!kids) return html`<span class="badge">Not started</span>`;
  if (avg === null) return html`<span class="badge info">● Enrolled, no marks</span>`;
  if (avg >= 75) return html`<span class="badge good">★ Outstanding</span>`;
  if (avg >= 60) return html`<span class="badge info">✓ On track</span>`;
  return html`<span class="badge warn">! Attention needed</span>`;
}

function attendanceToday(std) {
  const today = state.data.today;
  let marked = 0;
  let present = 0;
  let taken = 0;
  const secs = students(std).length ? sections(std) : [];
  secs.forEach(sec => {
    const rec = attendanceFor(std, sec, today);
    if (!rec) return;
    taken += 1;
    Object.values(rec.status).forEach(st => { marked += 1; if (st === 'P') present += 1; });
  });
  return { secs: secs.length, taken, marked, present, pct: marked ? (present / marked) * 100 : null };
}

const MEDALS = ['🥇', '🥈', '🥉', '4', '5'];

export default {
  async render(ctx) {
    const d = state.data;
    const classes = classesForUser();
    if (filters.cls !== 'all' && !classes.includes(filters.cls)) filters.cls = 'all';
    const scopeStd = filters.cls;
    const scopeStudents = scopeStd === 'all' ? d.students : students(scopeStd);
    const scopeStudentIds = new Set(scopeStudents.map(s => s.id));
    const rows = markRows({ std: scopeStd, subject: filters.subject, from: filters.from, to: filters.to });
    const subjects = [...new Set(d.tests.flatMap(t => t.papers.map(p => p.subject)))].sort();
    const teachers = d.teachers;
    const active = teachers.filter(t => t.status === 'active');
    const pending = teachers.filter(t => t.status === 'pending');

    // Tiles
    const avg = average(rows);
    const pass = passRate(rows);
    const testsHeld = new Set(rows.map(r => r.testId)).size;
    const bySubject = new Map();
    rows.forEach(r => { if (!bySubject.has(r.subject)) bySubject.set(r.subject, []); bySubject.get(r.subject).push(r); });
    const subjectAvgs = Array.from(bySubject.entries()).map(([s, list]) => ({ subject: s, avg: average(list) })).filter(x => x.avg !== null).sort((a, b) => b.avg - a.avg);
    const top = subjectAvgs[0] || null;
    const attScope = (scopeStd === 'all' ? classes : [scopeStd]).map(attendanceToday);
    const attMarked = attScope.reduce((a, x) => a + x.marked, 0);
    const attPresent = attScope.reduce((a, x) => a + x.present, 0);
    const attSecs = attScope.reduce((a, x) => a + x.secs, 0);
    const attTaken = attScope.reduce((a, x) => a + x.taken, 0);

    // Class table and benchmark chart (ignores the class filter so classes can be compared).
    const allRows = markRows({ std: 'all', subject: filters.subject, from: filters.from, to: filters.to });
    const classRows = classes.map(std => {
      const list = allRows.filter(r => r.std === std);
      const kids = students(std).length;
      return {
        std,
        secs: kids ? sections(std) : [],
        kids,
        teacherNames: active.filter(t => (t.classes || []).includes(std)).map(t => t.name),
        tests: new Set(list.map(r => r.testId)).size,
        avg: average(list),
        pass: passRate(list),
        att: attendanceToday(std)
      };
    });
    const shownClassRows = classRows.filter(r => r.kids || r.tests || r.teacherNames.length);

    // Honour roll
    const perStudent = studentPercents(rows);
    const honourClasses = (scopeStd === 'all' ? classes : [scopeStd]).map(std => {
      const ranked = students(std)
        .map(s => ({ s, ...(perStudent.get(s.id) || { pct: null, papers: 0 }) }))
        .filter(x => x.pct !== null)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, scopeStd === 'all' ? 3 : 5);
      return { std, ranked, kids: students(std).length };
    }).filter(c => c.ranked.length);

    // Student directory
    const allPerStudent = studentPercents(markRows({ std: 'all', subject: 'all', from: '', to: '' }));
    const q = dirSearch.trim().toLowerCase();
    const dirList = scopeStudents.filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll) === q || (s.grNo || '').toLowerCase().includes(q));
    const totals = d.attendanceTotals || {};

    const usedClasses = classes.filter(c => c === filters.cls || students(c).length || d.tests.some(t => t.std === c));
    const classChips = [{ value: 'all', label: `All classrooms · ${d.students.length}` }, ...usedClasses.map(c => ({ value: c, label: `Class ${c} · ${students(c).length}` }))];
    const p = palette();
    const bandCounts = [0, 0, 0, 0];
    let absent = 0;
    rows.forEach(r => { if (r.absent) absent += 1; else bandCounts[bandIndex((r.obt / r.max) * 100)] += 1; });
    const bandTotal = bandCounts.reduce((a, b) => a + b, 0) + absent;

    mount(ctx.main, html`
      ${legacyBanner()}
      ${pending.length ? html`<div class="banner warn"><span class="grow"><strong>${plural(pending.length, 'teacher')} waiting for approval:</strong> ${pending.map(t => t.name).join(', ')}</span><a class="btn primary small" href="#/teachers">Review</a></div>` : ''}
      ${!d.whatsapp.connected ? html`<div class="banner"><span class="grow">The school WhatsApp is not linked yet. Link it once and report card PDFs go to parents in one click.</span><a class="btn small" href="#/settings">Link WhatsApp</a></div>` : ''}
      <div class="page-head">
        <div>
          <h1>School overview</h1>
          <p>Whole school: ${plural(d.students.length, 'student')} · ${plural(active.length, 'teacher')} · updates by itself</p>
        </div>
        <div class="row">
          <a class="btn" href="#/teachers">${icon('teacher')} Teachers</a>
          <a class="btn" href="#/settings">${icon('settings')} Settings</a>
        </div>
      </div>

      <div class="filter-card card">
        ${chips('ov-class', classChips, filters.cls, { label: 'Classroom' })}
        <div class="filter-row">
          <label class="field"><span>Subject</span><select data-change="ov-subject"><option value="all">All subjects</option>${subjects.map(s => html`<option value="${s}" ${filters.subject === s ? 'selected' : ''}>${s}</option>`)}</select></label>
          <label class="field"><span>From</span><input type="date" value="${filters.from}" data-change="ov-from"></label>
          <label class="field"><span>To</span><input type="date" value="${filters.to}" data-change="ov-to"></label>
          <button class="btn" data-act="ov-clear">Clear filters</button>
        </div>
      </div>

      <div class="grid-tiles six">
        <div class="tile"><div class="label">Students</div><div class="value">${scopeStudents.length}</div><div class="note">${scopeStd === 'all' ? `in ${plural(classRows.filter(r => r.kids).length, 'class', 'classes')}` : `Class ${scopeStd}`}</div></div>
        <div class="tile"><div class="label">Average score</div><div class="value">${pct(avg === null ? null : round(avg))}</div><div class="note">${rows.length ? `${plural(rows.filter(r => !r.absent).length, 'mark')} written` : 'No marks yet'}</div></div>
        <div class="tile"><div class="label">Attendance today</div><div class="value">${attMarked ? `${Math.round((attPresent / attMarked) * 100)}%` : '-'}</div><div class="note">${attSecs ? `${attTaken} of ${attSecs} sections taken` : 'No students yet'}</div></div>
        <div class="tile"><div class="label">Pass rate</div><div class="value">${pct(pass === null ? null : round(pass))}</div><div class="note">33% or more</div></div>
        <div class="tile"><div class="label">Tests held</div><div class="value">${testsHeld}</div><div class="note">${filters.from || filters.to ? 'in this period' : 'so far'}</div></div>
        <div class="tile"><div class="label">Top subject</div><div class="value small-value">${top ? top.subject : '-'}</div><div class="note">${top ? `average ${round(top.avg)}%` : 'No marks yet'}</div></div>
      </div>

      ${rows.length || allRows.length ? html`<div class="chart-grid">
        <div class="chart-card card">
          <h3>Classroom benchmark</h3>
          <p class="card-sub">Average marks of each class</p>
          <div class="chart-box"><canvas id="ch-classes" role="img" aria-label="Average marks by class: ${classRows.filter(r => r.avg !== null).map(r => `Class ${r.std} ${round(r.avg)}%`).join(', ')}"></canvas></div>
          <div class="legend">${BANDS.map((b, i) => html`<span><i class="sw band-${i}"></i>${b.label} (${b.range})</span>`)}</div>
        </div>
        <div class="chart-card card">
          <h3>Performance trend</h3>
          <p class="card-sub">Average marks on each test date${scopeStd !== 'all' ? ` · Class ${scopeStd}` : ''}</p>
          <div class="chart-box"><canvas id="ch-trend" role="img" aria-label="Average marks over time"></canvas></div>
        </div>
        <div class="chart-card card">
          <h3>Subject-wise performance</h3>
          <p class="card-sub">Average marks in each subject${scopeStd !== 'all' ? ` · Class ${scopeStd}` : ''}</p>
          <div class="chart-box"><canvas id="ch-subjects" role="img" aria-label="Average by subject: ${subjectAvgs.map(s => `${s.subject} ${round(s.avg)}%`).join(', ')}"></canvas></div>
        </div>
        <div class="chart-card card">
          <h3>Grade distribution</h3>
          <p class="card-sub">How all written marks are spread${scopeStd !== 'all' ? ` · Class ${scopeStd}` : ''}</p>
          <div class="donut-wrap">
            <div class="chart-box donut"><canvas id="ch-grades" role="img" aria-label="Grade distribution"></canvas></div>
            <table class="legend-table">
              ${BANDS.map((b, i) => html`<tr><td><i class="sw band-${i}"></i>${b.label}<small>${b.range}</small></td><td class="r num">${bandCounts[i]}</td><td class="r num muted">${bandTotal ? Math.round((bandCounts[i] / bandTotal) * 100) : 0}%</td></tr>`)}
              <tr><td><i class="sw band-absent"></i>Absent</td><td class="r num">${absent}</td><td class="r num muted">${bandTotal ? Math.round((absent / bandTotal) * 100) : 0}%</td></tr>
            </table>
          </div>
        </div>
      </div>` : html`<div class="card empty"><h3>No marks yet</h3><p>Charts appear here as soon as teachers enter marks.</p></div>`}

      <div class="section">
        <h2>Classrooms</h2>
        ${shownClassRows.length ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Class</th><th class="r">Students</th><th>Teachers</th><th class="r">Tests</th><th class="r">Average</th><th class="r">Pass rate</th><th>Attendance today</th><th>Status</th><th></th></tr></thead>
          <tbody>${shownClassRows.map(r => html`<tr class="${filters.cls === r.std ? 'selected-row' : ''}">
            <td><strong>Class ${r.std}</strong>${r.secs.length > 1 ? html`<div class="muted small">Sections ${r.secs.join(', ')}</div>` : ''}</td>
            <td class="r num">${r.kids}</td>
            <td class="small">${r.teacherNames.length ? r.teacherNames.join(', ') : html`<span class="muted">None</span>`}</td>
            <td class="r num">${r.tests}</td>
            <td class="r num">${r.avg === null ? '-' : `${round(r.avg)}%`}</td>
            <td class="r num">${r.pass === null ? '-' : `${round(r.pass)}%`}</td>
            <td>${!r.att.secs ? '-' : r.att.taken ? `${Math.round(r.att.pct)}% present` : html`<span class="badge warn">Not taken</span>`}</td>
            <td>${classStatus(r.kids, r.avg)}</td>
            <td class="r"><button class="btn small" data-act="ov-inspect" data-std="${r.std}">${filters.cls === r.std ? 'Showing' : 'Inspect'}</button></td>
          </tr>`)}</tbody>
        </table></div>` : html`<div class="card empty"><p>No classes have students yet.</p></div>`}
      </div>

      <div class="section">
        <h2>Honour roll${scopeStd !== 'all' ? ` · Class ${scopeStd}` : ''}</h2>
        ${honourClasses.length ? html`<div class="honour-grid">${honourClasses.map((c, ci) => html`<div class="card honour-card hc${ci % 6}">
          <div class="row between"><h3>Class ${c.std}</h3><span class="badge">${plural(c.kids, 'student')}</span></div>
          <ol class="honour-list">${c.ranked.map((x, i) => html`<li>
            <span class="medal">${MEDALS[i]}</span>
            <div class="main"><div class="title">${x.s.name}</div><div class="sub">Class ${x.s.std}-${x.s.section} · Roll ${x.s.roll}</div></div>
            <strong class="num">${round(x.pct)}%</strong>
            <button class="btn small" data-act="ov-insights" data-id="${x.s.id}" aria-label="AI Insights for ${x.s.name}">${icon('chart')} Insights</button>
          </li>`)}</ol>
        </div>`)}</div>` : html`<div class="card empty"><p>The top students appear here once marks are entered.</p></div>`}
      </div>

      <div class="section">
        <h2>Faculty</h2>
        ${teachers.filter(t => t.status !== 'pending').length ? html`<div class="faculty-grid">${teachers.filter(t => t.status !== 'pending').map((t, i) => html`<div class="card faculty-card hc${i % 6}">
          <div class="row between"><h3>${t.name}</h3>${t.status === 'disabled' ? html`<span class="badge bad">Turned off</span>` : html`<span class="badge good">Active</span>`}</div>
          <div class="sub">${(t.subjects || []).join(', ') || 'Subjects not set'}</div>
          <div class="faculty-stats">
            <div><span>Classes</span><strong>${(t.classes || []).join(', ') || '-'}</strong></div>
            <div><span>Tests created</span><strong>${d.tests.filter(x => x.createdBy === t.id).length}</strong></div>
            <div><span>Attendance (7 days)</span><strong>${d.attendance.filter(a => a.takenBy === t.id).length}</strong></div>
          </div>
          <div class="muted small">Last active ${fmtWhen(t.lastActiveAt).toLowerCase()} · ${t.mobile}</div>
        </div>`)}</div>` : html`<div class="card empty"><p>No teachers yet. <a href="#/teachers">Add teachers</a>.</p></div>`}
      </div>

      <div class="section">
        <h2>Student directory${scopeStd !== 'all' ? ` · Class ${scopeStd}` : ''}</h2>
        <div class="card">
          <input type="search" placeholder="Search by name, roll or GR number" value="${dirSearch}" data-input="ov-search" aria-label="Search students">
          <div id="ov-dir" class="mt">${this.directory(dirList, allPerStudent, totals)}</div>
        </div>
      </div>
    `);

    const handlers = this.handlers(ctx, allPerStudent, totals);
    await ensureCharts().catch(() => null);
    // The page may have been redrawn while the chart library loaded.
    if (!window.Chart || !ctx.main.isConnected) return handlers;

    // Classroom benchmark: one bar per class, coloured by result band.
    const bench = classRows.filter(r => r.kids || r.avg !== null);
    makeChart($('#ch-classes', ctx.main), {
      type: 'bar',
      data: {
        labels: bench.map(r => `Class ${r.std}`),
        datasets: [{
          label: 'Average',
          data: bench.map(r => (r.avg === null ? null : round(r.avg))),
          backgroundColor: bench.map(r => (r.avg === null ? p.absent : p.bands[bandIndex(r.avg)])),
          borderColor: bench.map(r => (filters.cls === r.std ? p.ink : 'transparent')),
          borderWidth: bench.map(r => (filters.cls === r.std ? 2 : 0)),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
          maxBarThickness: 24
        }]
      },
      options: {
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` Average ${c.raw}% · ${BANDS[bandIndex(c.raw)].label}` } } },
        scales: { y: percentAxis(p), x: { grid: { display: false } } },
        onClick: (evt, els) => { if (els.length) { filters.cls = bench[els[0].index].std; ctx.rerender(); } }
      },
      plugins: [valueLabels]
    });

    // Performance trend: average on each test date.
    const byDate = new Map();
    rows.forEach(r => { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); });
    const dates = Array.from(byDate.keys()).filter(Boolean).sort();
    makeChart($('#ch-trend', ctx.main), {
      type: 'line',
      data: {
        labels: dates.map(dt => fmtDate(dt, false)),
        datasets: [{
          label: 'Average',
          data: dates.map(dt => { const a = average(byDate.get(dt)); return a === null ? null : round(a); }),
          borderColor: p.series1,
          backgroundColor: `${p.series1}1a`,
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: p.series1,
          pointBorderColor: p.surface,
          pointBorderWidth: 2,
          tension: 0.3
        }]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => fmtDate(dates[items[0].dataIndex]), label: c => ` Average ${c.raw}%` } } },
        scales: { y: percentAxis(p), x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } }
      }
    });

    // Subject-wise: one series, one colour, values on the bars.
    makeChart($('#ch-subjects', ctx.main), {
      type: 'bar',
      data: {
        labels: subjectAvgs.map(s => s.subject),
        datasets: [{ label: 'Average', data: subjectAvgs.map(s => round(s.avg)), backgroundColor: p.aqua, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 24 }]
      },
      options: {
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` Average ${c.raw}%` } } },
        scales: { y: percentAxis(p), x: { grid: { display: false } } }
      },
      plugins: [valueLabels]
    });

    // Grade distribution: part of a whole, five slices at most.
    makeChart($('#ch-grades', ctx.main), {
      type: 'doughnut',
      data: {
        labels: [...BANDS.map(b => b.label), 'Absent'],
        datasets: [{ data: [...bandCounts, absent], backgroundColor: [...p.bands, p.absent], borderColor: p.surface, borderWidth: 2 }]
      },
      options: {
        cutout: '62%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} (${bandTotal ? Math.round((c.raw / bandTotal) * 100) : 0}%)` } } }
      }
    });

    return handlers;
  },

  directory(list, perStudent, totals) {
    if (!list.length) return html`<p class="muted">No students match.</p>`;
    const shown = list.slice(0, dirLimit);
    return html`<div class="table-wrap"><table class="table">
      <thead><tr><th>Roll</th><th>Student</th><th>Class</th><th class="r">Average</th><th class="r">Attendance</th><th>Mobile</th><th></th></tr></thead>
      <tbody>${shown.map(s => {
        const ps = perStudent.get(s.id);
        const t = totals[s.id];
        const days = t ? t[0] + t[1] + t[2] : 0;
        return html`<tr>
          <td class="num">${s.roll}</td>
          <td><strong>${s.name}</strong>${s.grNo ? html`<div class="muted small">GR ${s.grNo}</div>` : ''}</td>
          <td class="nowrap">${s.std}-${s.section}</td>
          <td class="r num">${ps && ps.pct !== null ? `${round(ps.pct)}%` : '-'}</td>
          <td class="r num">${days ? `${Math.round((t[0] / days) * 100)}%` : '-'}</td>
          <td class="small">${s.mobile || html`<span class="muted">None</span>`}</td>
          <td class="r nowrap">
            <button class="btn small" data-act="ov-insights" data-id="${s.id}" aria-label="AI Insights for ${s.name}">${icon('chart')} Insights</button>
            <button class="btn small" data-act="ov-report" data-id="${s.id}" title="Report card PDF">${icon('file')}<span class="sr-only">Report card for ${s.name}</span></button>
          </td>
        </tr>`;
      })}</tbody>
    </table></div>
    ${list.length > shown.length ? html`<div class="row center mt"><span class="muted small">Showing ${shown.length} of ${list.length}.</span><button class="btn small" data-act="ov-more">Show more</button></div>` : ''}`;
  },

  handlers(ctx, perStudent, totals) {
    return {
      'ov-class': el => { filters.cls = el.dataset.value; dirLimit = DIR_PAGE; ctx.rerender(); },
      'ov-inspect': el => {
        filters.cls = el.dataset.std;
        const secs = sections(el.dataset.std);
        select(el.dataset.std, secs.length > 1 ? 'all' : secs[0]);
        ctx.rerender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      'ov-subject': el => { filters.subject = el.value; ctx.rerender(); },
      'ov-from': el => { filters.from = el.value; ctx.rerender(); },
      'ov-to': el => { filters.to = el.value; ctx.rerender(); },
      'ov-clear': () => { Object.assign(filters, { cls: 'all', subject: 'all', from: '', to: '' }); ctx.rerender(); },
      'ov-search': el => { dirSearch = el.value; dirLimit = DIR_PAGE; this.refreshDirectory(ctx, perStudent, totals); },
      'ov-more': () => { dirLimit += 50; this.refreshDirectory(ctx, perStudent, totals); },
      'ov-insights': el => openInsights(el.dataset.id),
      'ov-report': el => busy(el, async () => {
        const { blob, fileName } = await fetchFile(`/report-cards.pdf?students=${el.dataset.id}&tests=all`);
        downloadBlob(blob, fileName);
      }, '...')
    };
  },

  refreshDirectory(ctx, perStudent, totals) {
    const scope = filters.cls === 'all' ? state.data.students : students(filters.cls);
    const q = dirSearch.trim().toLowerCase();
    const list = scope.filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll) === q || (s.grNo || '').toLowerCase().includes(q));
    mount($('#ov-dir', ctx.main), this.directory(list, perStudent, totals));
  }
};
