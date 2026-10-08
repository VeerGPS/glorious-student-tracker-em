import { html, mount, icon, fmtWhen, pct, barList, plural } from '../ui.js';
import { state, students, sections, tests, attendanceFor, select, classesForUser } from '../data.js';
import { legacyBanner } from './common.js';

function averageOf(list) {
  let obt = 0;
  let max = 0;
  list.forEach(t => Object.entries(t.marks).forEach(([, row]) => t.papers.forEach(p => {
    const v = row[p.id];
    if (v === undefined) return;
    obt += v === 'AB' ? 0 : v;
    max += p.max;
  })));
  return max ? (obt / max) * 100 : null;
}

export default {
  render(ctx) {
    const d = state.data;
    const today = d.today;
    const teachers = d.teachers;
    const active = teachers.filter(t => t.status === 'active');
    const pending = teachers.filter(t => t.status === 'pending');

    // Attendance today across every class section that has students.
    let sectionsTotal = 0;
    let sectionsTaken = 0;
    let present = 0;
    let marked = 0;
    const rows = classesForUser().map(std => {
      const kids = students(std);
      const secs = kids.length ? sections(std) : [];
      let taken = 0;
      let p = 0;
      let m = 0;
      secs.forEach(sec => {
        const rec = attendanceFor(std, sec, today);
        if (!rec) return;
        taken += 1;
        Object.values(rec.status).forEach(st => { m += 1; if (st === 'P') p += 1; });
      });
      sectionsTotal += secs.length;
      sectionsTaken += taken;
      present += p;
      marked += m;
      const classTests = tests(std);
      return {
        std,
        secs,
        kids: kids.length,
        teacherNames: active.filter(t => (t.classes || []).includes(std)).map(t => t.name),
        attendance: secs.length ? (taken ? `${Math.round((p / m) * 100)}% present` : 'Not taken') : '-',
        attendanceDone: taken === secs.length && secs.length > 0,
        tests: classTests.length,
        average: averageOf(classTests)
      };
    }).filter(r => r.kids || r.tests || r.teacherNames.length);

    const schoolAvg = averageOf(d.tests);
    const chart = rows.filter(r => r.average !== null).map(r => ({
      label: `Class ${r.std}`,
      value: Math.round(r.average * 10) / 10,
      title: `Class ${r.std}: average ${Math.round(r.average * 10) / 10}% across ${plural(r.tests, 'test')}`
    }));

    const activity = teachers.filter(t => t.status !== 'pending').map(t => ({
      t,
      testsMade: d.tests.filter(x => x.createdBy === t.id).length,
      testsUpdated: d.tests.filter(x => x.updatedBy === t.id).length,
      attendanceDays: d.attendance.filter(a => a.takenBy === t.id).length
    }));

    mount(ctx.main, html`
      ${legacyBanner()}
      ${pending.length ? html`<div class="banner warn"><span class="grow"><strong>${plural(pending.length, 'teacher')} waiting for approval:</strong> ${pending.map(t => t.name).join(', ')}</span><a class="btn primary small" href="#/teachers">Review</a></div>` : ''}
      ${!d.whatsapp.connected ? html`<div class="banner"><span class="grow">The school WhatsApp is not linked yet. Link it once and teachers can send report cards and absence messages in one click.</span><a class="btn small" href="#/settings">Link WhatsApp</a></div>` : ''}
      <div class="page-head">
        <div><h1>School overview</h1><p>Updates automatically as teachers save their work.</p></div>
        <div class="row">
          <a class="btn" href="#/teachers">${icon('teacher')} Teachers</a>
          <a class="btn" href="#/settings">${icon('settings')} Settings</a>
        </div>
      </div>
      <div class="grid-tiles">
        <div class="tile"><div class="label">Students</div><div class="value">${d.students.length}</div><div class="note">in ${plural(rows.filter(r => r.kids).length, 'class', 'classes')}</div></div>
        <div class="tile"><div class="label">Teachers</div><div class="value">${active.length}</div><div class="note">${pending.length ? `${pending.length} waiting for approval` : 'active accounts'}</div></div>
        <div class="tile"><div class="label">Attendance today</div><div class="value">${marked ? `${Math.round((present / marked) * 100)}%` : '-'}</div><div class="note">${sectionsTotal ? `${sectionsTaken} of ${sectionsTotal} class sections taken` : 'No students yet'}</div></div>
        <div class="tile"><div class="label">Average marks</div><div class="value">${pct(schoolAvg === null ? null : Math.round(schoolAvg * 10) / 10)}</div><div class="note">${plural(d.tests.length, 'test')} so far</div></div>
      </div>

      <div class="section">
        <h2>Classes</h2>
        ${rows.length ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Class</th><th class="r">Students</th><th>Teachers</th><th>Attendance today</th><th class="r">Tests</th><th class="r">Average</th><th></th></tr></thead>
          <tbody>${rows.map(r => html`<tr>
            <td><strong>Class ${r.std}</strong>${r.secs.length > 1 ? html`<div class="muted small">Sections ${r.secs.join(', ')}</div>` : ''}</td>
            <td class="r num">${r.kids}</td>
            <td class="small">${r.teacherNames.length ? r.teacherNames.join(', ') : html`<span class="muted">None</span>`}</td>
            <td>${r.attendance === 'Not taken' ? html`<span class="badge warn">Not taken</span>` : r.attendance}</td>
            <td class="r num">${r.tests}</td>
            <td class="r num">${r.average === null ? '-' : pct(Math.round(r.average * 10) / 10)}</td>
            <td class="r"><button class="btn small" data-act="open-class" data-std="${r.std}">Open</button></td>
          </tr>`)}</tbody>
        </table></div>` : html`<div class="card empty"><h3>No data yet</h3><p>When teachers add students, take attendance or enter marks, it appears here.</p></div>`}
      </div>

      ${chart.length ? html`<div class="card">
        <h2>Average marks by class</h2>
        <p class="card-sub">Percentage of marks across all tests entered so far</p>
        ${barList(chart)}
      </div>` : ''}

      <div class="section">
        <h2>Teacher activity</h2>
        ${activity.length ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Teacher</th><th>Classes</th><th>Last active</th><th class="r">Tests created</th><th class="r">Attendance (last 7 days)</th></tr></thead>
          <tbody>${activity.map(a => html`<tr>
            <td><strong>${a.t.name}</strong>${a.t.status === 'disabled' ? html` <span class="badge bad">Turned off</span>` : ''}</td>
            <td>${(a.t.classes || []).length ? a.t.classes.join(', ') : html`<span class="muted">None</span>`}</td>
            <td>${fmtWhen(a.t.lastActiveAt)}</td>
            <td class="r num">${a.testsMade}</td>
            <td class="r num">${a.attendanceDays}</td>
          </tr>`)}</tbody>
        </table></div>` : html`<div class="card empty"><p>No teachers yet. <a href="#/teachers">Add teachers</a>.</p></div>`}
      </div>
    `);

    return {
      'open-class': el => {
        const std = el.dataset.std;
        const secs = sections(std);
        select(std, secs.length > 1 ? 'all' : secs[0]);
        ctx.navigate('#/students');
      }
    };
  }
};
