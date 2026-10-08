import { html, mount, fmtDate, pct, barList, applyBarWidths, icon } from '../ui.js';

function marksCell(r) {
  if (r.marks === 'AB') return html`<span class="badge bad">Absent</span>`;
  return html`<strong>${r.marks}</strong> <span class="muted">/ ${r.max}</span>`;
}

function testTable(report) {
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Subject</th><th class="r">Marks</th><th class="r">%</th><th class="c">Grade</th><th class="r">Class average</th><th class="c">Rank</th></tr></thead>
    <tbody>${report.rows.map(r => html`<tr>
      <td><strong>${r.subject}</strong>${r.topic ? html` <span class="muted small">${r.topic}</span>` : ''}${r.date ? html`<div class="muted small">${fmtDate(r.date)}</div>` : ''}</td>
      <td class="r nowrap">${marksCell(r)}</td>
      <td class="r num">${r.marks === 'AB' ? '-' : r.pct}</td>
      <td class="c">${r.grade}</td>
      <td class="r num">${r.average === null ? '-' : r.average}</td>
      <td class="c num">${r.rank ? `${r.rank} of ${r.of}` : '-'}</td>
    </tr>`)}</tbody>
    <tfoot><tr><th>Total</th><th class="r">${report.total.obtained} / ${report.total.max}</th><th class="r">${report.total.pct === null ? '-' : report.total.pct}</th><th class="c">${report.total.grade}</th><th></th><th class="c">${report.rank ? `${report.rank.rank} of ${report.rank.of}` : '-'}</th></tr></tfoot>
  </table></div>`;
}

export default {
  async render(ctx) {
    const { main, key } = ctx;
    mount(main, html`<div class="login"><div class="card"><p>Loading the report...</p></div></div>`);
    let data;
    try {
      const res = await fetch(`/api/parent/${encodeURIComponent(key)}`);
      data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open the report.');
    } catch (err) {
      mount(main, html`<div class="login"><div class="card">
        <h2>Could not open the report</h2>
        <p>${err.message}</p>
        <button class="btn primary block" data-act="leave">Sign in again</button>
      </div></div>`);
      return { leave: ctx.onLeave };
    }

    const st = data.student;
    const o = data.overall;
    const pdf = testId => `/api/parent/${encodeURIComponent(key)}/report.pdf${testId ? `?test=${encodeURIComponent(testId)}` : ''}`;
    mount(main, html`
      <header class="topbar">
        <span class="logo" aria-hidden="true"><img src="/img/logo.png" alt=""></span>
        <div class="brand"><strong>${data.school.name}</strong><span>Parent view</span></div>
        <button class="btn ghost small" data-act="leave">Sign out</button>
      </header>
      <main>
        <div class="page-head">
          <div>
            <span class="head-icon" aria-hidden="true">${icon('users')}</span>
            <h1>${st.name}</h1>
            <p>Class ${st.std}-${st.section} · Roll ${st.roll}${st.grNo ? ` · GR ${st.grNo}` : ''}</p>
          </div>
          <a class="btn primary" href="${pdf(null)}">${icon('download')} Full report card (PDF)</a>
        </div>
        <div class="grid-tiles">
          <div class="tile"><div class="label">Overall</div><div class="value">${pct(o.total.pct)}</div><div class="note">Grade ${o.total.grade}</div></div>
          <div class="tile"><div class="label">Class rank</div><div class="value">${o.rank ? o.rank.rank : '-'}</div><div class="note">${o.rank ? `out of ${o.rank.of}` : 'Not ranked yet'}</div></div>
          <div class="tile"><div class="label">Attendance</div><div class="value">${o.attendance ? `${o.attendance.pct}%` : '-'}</div><div class="note">${o.attendance ? `${o.attendance.present} of ${o.attendance.total} days present` : 'Not recorded yet'}</div></div>
        </div>
        <div class="card" style="margin-top:14px">
          <h2>Subjects</h2>
          <p class="card-sub">Percentage of marks in each subject, across all tests</p>
          ${barList(o.subjects.map(s => ({
            label: s.subject,
            value: s.allAbsent ? 0 : s.pct,
            critical: !s.allAbsent && s.pct < 33,
            absent: s.allAbsent,
            title: `${s.subject}: ${s.obtained} of ${s.max}`
          })), { valueLabel: it => (it.absent ? 'Absent' : `${it.value}%`) })}
          <p class="small" style="margin-top:12px"><strong>Teacher's remarks:</strong> ${o.remarks}</p>
        </div>
        <div class="section">
          <h2>Tests</h2>
          ${data.tests.length ? data.tests.map(t => html`<div class="card">
            <div class="row between">
              <div><h3>${t.name}</h3><div class="muted small">${fmtDate(t.date)}</div></div>
              <a class="btn small" href="${pdf(t.id)}">${icon('download')} Report card</a>
            </div>
            <div style="margin-top:10px">${testTable(t.report)}</div>
          </div>`) : html`<div class="card empty"><p>No marks have been entered yet.</p></div>`}
        </div>
      </main>
    `);
    applyBarWidths(main);
    return { leave: ctx.onLeave };
  }
};
