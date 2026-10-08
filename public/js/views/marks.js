import { html, mount, icon, fmtDate, pct } from '../ui.js';
import { state, students, tests, testProgress, testAverage } from '../data.js';
import { classPicker, currentSelection, pickerHandlers, empty } from './common.js';
import { openTestForm } from './test-form.js';
import { openMarksUpload } from './marks-upload.js';

function status(t, prog) {
  if (prog.filled === 0) return t.date > state.data.today ? html`<span class="badge info">Upcoming</span>` : html`<span class="badge warn">No marks yet</span>`;
  if (prog.filled >= prog.expected) return html`<span class="badge good">Complete</span>`;
  return html`<span class="badge warn">${prog.filled} of ${prog.expected} entered</span>`;
}

export default {
  render(ctx) {
    const sel = currentSelection('all');
    const list = sel.std ? tests(sel.std) : [];
    const kids = sel.std ? students(sel.std) : [];

    mount(ctx.main, html`
      <div class="page-head">
        <div><h1>Marks</h1><p>Create a test, then type the marks or upload them from Excel.</p></div>
      </div>
      ${classPicker({ sectionMode: 'all' })}
      ${sel.std ? html`<div class="grid-2">
        <button class="btn big primary" data-act="new-test">${icon('plus')} New test</button>
        <button class="btn big" data-act="upload">${icon('upload')} Upload marks from Excel</button>
      </div>` : ''}
      <div class="section">
        <h2>Tests for Class ${sel.std || ''}</h2>
        ${!kids.length && sel.std ? html`<div class="banner warn"><span class="grow">This class has no students yet. Add students first, or upload a marks sheet with names and they will be added for you.</span><a class="btn small" href="#/students">Add students</a></div>` : ''}
        ${list.length ? html`<div class="card"><ul class="list">${list.map(t => {
          const prog = testProgress(t, sel.section);
          const avg = testAverage(t, sel.section);
          return html`<li>
            <div class="main">
              <div class="title">${t.name}</div>
              <div class="sub">${fmtDate(t.date)} · ${t.papers.map(p => `${p.subject} ${p.max}`).join(' · ')}${avg !== null ? ` · Average ${pct(Math.round(avg * 10) / 10)}` : ''}</div>
              <div style="margin-top:4px">${status(t, prog)}</div>
            </div>
            <a class="btn small primary" href="#/marks/${t.id}">Open</a>
          </li>`;
        })}</ul></div>` : sel.std ? empty('No tests yet', 'Create the first test for this class, or upload an Excel marks sheet.') : ''}
      </div>
    `);

    return {
      ...pickerHandlers(ctx),
      'new-test': () => openTestForm({ std: sel.std, onSaved: t => ctx.navigate(`#/marks/${t.id}`) }),
      upload: () => openMarksUpload({ std: sel.std, onSaved: id => ctx.navigate(`#/marks/${id}`) })
    };
  }
};
