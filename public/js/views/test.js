import { html, mount, busy, toast, icon, fmtDate, fmtDateSlash, plural, confirmDialog, downloadBlob, chips, $, $$ } from '../ui.js';
import { state, api, refresh, students, sections, test as findTest, replaceTest, fetchFile, selection, select } from '../data.js';
import { backLink } from './common.js';
import { openTestForm } from './test-form.js';
import { openMarksUpload } from './marks-upload.js';
import { downloadMarksTemplate, downloadResultsSheet } from '../excel.js';

let edits = new Map();
let currentId = null;
let paperFilter = 'all';
let sectionFilter = 'all';

function key(sid, pid) {
  return `${sid}|${pid}`;
}

function shown(v) {
  return v === undefined || v === null ? '' : String(v);
}

function check(raw, max) {
  const s = String(raw).trim();
  if (s === '') return { ok: true, value: null };
  if (['ab', 'a', 'abs', 'absent'].includes(s.toLowerCase())) return { ok: true, value: 'AB' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, message: 'Type a number, or AB if absent' };
  if (n < 0 || n > max) return { ok: false, message: `Must be from 0 to ${max}` };
  return { ok: true, value: n };
}

// Column heading: subject, then topic, then date and maximum marks.
function paperHead(p) {
  return html`<span class="ph-sub">${p.subject}</span>${p.topic ? html`<span class="ph-topic">${p.topic}</span>` : ''}<span class="ph-meta">${p.date ? `${fmtDate(p.date, false)} · ` : ''}out of ${p.max}</span>`;
}

// Absent and below-pass marks stand out in the grid.
function tone(raw, max) {
  const s = String(raw).trim().toLowerCase();
  if (['ab', 'a', 'abs', 'absent'].includes(s)) return 'ab';
  const n = Number(s);
  return s !== '' && Number.isFinite(n) && n >= 0 && n <= max && n / max < 0.33 ? 'low' : '';
}

export default {
  isDirty: () => edits.size > 0,

  render(ctx) {
    const t = findTest(ctx.route.id);
    if (!t) {
      mount(ctx.main, html`${backLink('#/marks', 'Marks')}<div class="card empty"><h3>This test was not found</h3><p>It may have been deleted.</p></div>`);
      return {};
    }
    if (currentId !== t.id) {
      currentId = t.id;
      edits = new Map();
      paperFilter = window.innerWidth < 760 && t.papers.length > 1 ? t.papers[0].id : 'all';
      const sel = selection();
      sectionFilter = sel.std === t.std ? sel.section : 'all';
    }
    if (paperFilter !== 'all' && !t.papers.some(p => p.id === paperFilter)) paperFilter = 'all';
    const secs = sections(t.std);
    if (sectionFilter !== 'all' && !secs.includes(sectionFilter)) sectionFilter = 'all';
    const kids = students(t.std, sectionFilter);
    const papers = paperFilter === 'all' ? t.papers : t.papers.filter(p => p.id === paperFilter);

    const value = (sid, pid) => (edits.has(key(sid, pid)) ? edits.get(key(sid, pid)) : shown(t.marks[sid] && t.marks[sid][pid]));
    const cellClass = (sid, p) => {
      if (!edits.has(key(sid, p.id))) return '';
      return check(edits.get(key(sid, p.id)), p.max).ok ? 'changed' : 'invalid';
    };
    const input = (s, p) => html`<input inputmode="decimal" autocomplete="off" value="${value(s.id, p.id)}" class="${cellClass(s.id, p)} ${tone(value(s.id, p.id), p.max)}"
      data-sid="${s.id}" data-pid="${p.id}" data-input="cell" data-keydown="cell-key" aria-label="${s.name} ${p.subject} out of ${p.max}" placeholder="-">`;

    const stats = p => {
      const vals = kids.map(s => t.marks[s.id] && t.marks[s.id][p.id]).filter(v => v !== undefined);
      const nums = vals.filter(v => typeof v === 'number');
      return { entered: vals.length, avg: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : '-' };
    };

    const grid = paperFilter === 'all'
      ? html`<div class="marks-wrap"><table class="marks">
          <thead><tr><th class="who"><div class="who-in"><span class="roll">Roll</span><span class="nm">Student</span></div></th>${papers.map(p => html`<th>${paperHead(p)}</th>`)}</tr></thead>
          <tbody>${kids.map(s => html`<tr><td class="who"><div class="who-in"><span class="roll">${s.roll}</span><span class="nm">${s.name}</span></div></td>${papers.map(p => html`<td>${input(s, p)}</td>`)}</tr>`)}</tbody>
          <tfoot><tr><td class="who">Entered · average</td>${papers.map(p => { const st = stats(p); return html`<td><span class="fs">${st.entered} of ${kids.length}</span><span class="fs">avg ${st.avg}</span></td>`; })}</tr></tfoot>
        </table></div>`
      : (() => {
        const p = papers[0];
        const st = stats(p);
        return html`<div class="card single-list">
          <div class="paper-bar">
            <div><strong>${p.subject}</strong>${p.topic ? html` <span class="muted">· ${p.topic}</span>` : ''}<div class="muted small">${p.date ? `${fmtDate(p.date)} · ` : ''}out of ${p.max}</div></div>
            <div class="paper-stats">${st.entered} of ${kids.length} entered<br>average ${st.avg}</div>
          </div>
          ${kids.map(s => html`<div class="att-row"><span class="roll">${s.roll}</span><span class="name">${s.name}</span>${input(s, p)}<span class="out">/ ${p.max}</span></div>`)}
        </div>`;
      })();

    mount(ctx.main, html`
      ${backLink('#/marks', 'All tests')}
      <div class="page-head">
        <div>
          <h1>${t.name}</h1>
          <p>Class ${t.std} · ${fmtDate(t.date)} · ${plural(t.papers.length, 'subject')}</p>
        </div>
        <div class="row">
          <button class="btn small" data-act="edit">${icon('pen')} Edit test</button>
          <button class="btn small danger" data-act="delete">Delete</button>
        </div>
      </div>
      <div class="actions test-actions">
        <a class="btn wa" href="#/send?kind=report&test=${t.id}&std=${t.std}&section=${sectionFilter}">${icon('chat')} Send to parents</a>
        <button class="btn" data-act="pdf">${icon('file')} Report cards (PDF)</button>
      </div>
      <details class="more mt">
        <summary>Excel: fill in marks in Excel, or download results</summary>
        <div class="actions mt">
          <button class="btn small" data-act="download">${icon('download')} Download sheet to fill in</button>
          <button class="btn small" data-act="upload">${icon('upload')} Upload filled sheet</button>
          <button class="btn small" data-act="results">${icon('download')} Results with totals</button>
        </div>
      </details>
      <div class="picker" style="margin-top:14px">
        ${t.papers.length > 1 ? html`<div class="paper-chips">${chips('paper', [{ value: 'all', label: 'All subjects' }, ...t.papers.map(p => ({ value: p.id, label: p.topic ? `${p.subject} (${p.topic})` : (t.papers.filter(x => x.subject === p.subject).length > 1 && p.date ? `${p.subject} ${fmtDateSlash(p.date).slice(0, 5)}` : p.subject) }))], paperFilter, { small: true, label: 'Show' })}</div>` : ''}
        ${secs.length > 1 ? chips('section', [{ value: 'all', label: 'All' }, ...secs.map(s => ({ value: s, label: s }))], sectionFilter, { small: true, label: 'Section' }) : ''}
      </div>
      <p class="small muted">Type the marks. Type <strong>AB</strong> if the student was absent. Press Enter to go to the next student.</p>
      ${kids.length ? grid : html`<div class="card empty"><p>No students in this class yet. <a href="#/students">Add students</a> or upload a filled Excel sheet.</p></div>`}
      <div class="sticky-foot">
        <span id="dirty-note">${edits.size ? `${plural(edits.size, 'change')} not saved` : 'All marks saved'}</span>
        <button class="btn primary" data-act="save" id="save-marks" ${edits.size ? '' : 'disabled'}>Save marks</button>
      </div>
    `);

    const updateFooter = () => {
      const note = $('#dirty-note', ctx.main);
      const btn = $('#save-marks', ctx.main);
      const bad = Array.from(edits.entries()).filter(([k, v]) => {
        const p = t.papers.find(x => x.id === k.split('|')[1]);
        return !check(v, p.max).ok;
      }).length;
      if (note) note.textContent = edits.size ? `${plural(edits.size, 'change')} not saved${bad ? ` · ${bad} need fixing` : ''}` : 'All marks saved';
      if (btn) btn.disabled = !edits.size || bad > 0;
    };

    const guard = fn => async el => {
      if (edits.size && !(await confirmDialog('Unsaved marks', 'You have marks that are not saved. Continue without saving them?', { ok: 'Continue' }))) return;
      edits = new Map();
      fn(el);
    };

    return {
      cell: el => {
        const p = t.papers.find(x => x.id === el.dataset.pid);
        const original = shown(t.marks[el.dataset.sid] && t.marks[el.dataset.sid][p.id]);
        const k = key(el.dataset.sid, p.id);
        if (el.value.trim() === original) edits.delete(k);
        else edits.set(k, el.value.trim());
        const res = check(el.value, p.max);
        el.classList.toggle('changed', edits.has(k) && res.ok);
        el.classList.toggle('invalid', !res.ok);
        const kind = tone(el.value, p.max);
        el.classList.toggle('ab', kind === 'ab');
        el.classList.toggle('low', kind === 'low');
        el.title = res.ok ? '' : res.message;
        updateFooter();
      },
      'cell-key': (el, e) => {
        if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const inputs = $$(`input[data-pid="${el.dataset.pid}"]`, ctx.main);
        const i = inputs.indexOf(el) + (e.key === 'ArrowUp' ? -1 : 1);
        if (inputs[i]) { inputs[i].focus(); inputs[i].select(); }
        else if (e.key === 'Enter') $('#save-marks', ctx.main).focus();
      },
      paper: el => { paperFilter = el.dataset.value; ctx.rerender(); },
      section: el => {
        sectionFilter = el.dataset.value;
        if (sectionFilter !== 'all') select(t.std, sectionFilter);
        ctx.rerender();
      },
      save: el => busy(el, async () => {
        const changes = Array.from(edits.entries()).map(([k, v]) => {
          const [studentId, paperId] = k.split('|');
          const p = t.papers.find(x => x.id === paperId);
          return { studentId, paperId, value: check(v, p.max).value };
        });
        const res = await api('PATCH', `/tests/${t.id}/marks`, { changes });
        replaceTest(res.test);
        state.data.revision = res.revision;
        edits = new Map();
        toast(`Saved ${plural(res.saved, 'mark')}.`, 'good');
        ctx.rerender();
      }, 'Saving...'),
      edit: guard(() => openTestForm({ std: t.std, existing: t, onSaved: () => ctx.rerender() })),
      delete: async el => {
        const ok = await confirmDialog('Delete this test?', `"${t.name}" and all its marks will be deleted. This cannot be undone.`, { ok: 'Delete test', danger: true });
        if (!ok) return;
        await busy(el, async () => {
          await api('DELETE', `/tests/${t.id}`);
          edits = new Map();
          await refresh();
          toast('Test deleted.');
          ctx.navigate('#/marks');
        });
      },
      download: el => busy(el, () => downloadMarksTemplate(t, students(t.std, sectionFilter), state.data.school.name)),
      results: el => busy(el, () => downloadResultsSheet(t, students(t.std, sectionFilter))),
      upload: guard(() => openMarksUpload({ std: t.std, test: t, onSaved: () => ctx.rerender() })),
      pdf: el => busy(el, async () => {
        const q = `std=${t.std}${sectionFilter !== 'all' ? `&section=${sectionFilter}` : ''}&tests=${t.id}`;
        const { blob, fileName } = await fetchFile(`/report-cards.pdf?${q}`);
        downloadBlob(blob, fileName);
      }, 'Preparing PDF...')
    };
  }
};
