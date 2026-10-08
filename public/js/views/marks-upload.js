import { html, openDialog, setDialogBody, closeDialog, busy, toast, $, $$, icon, plural } from '../ui.js';
import { state, api, refresh, students, classesForUser, tests as testsOf } from '../data.js';
import { readSheetRows, parseMarksSheet, downloadMarksTemplate, downloadBlankMarksTemplate } from '../excel.js';

/**
 * Upload marks from an Excel file. Shows what will happen before saving.
 * test: when given, marks go into that test. onSaved(testId) after saving.
 */
export function openMarksUpload({ std, test = null, onSaved }) {
  const model = {
    std: test ? test.std : std,
    fileName: '',
    parsed: null,
    error: '',
    name: test ? test.name : '',
    date: test ? test.date : '',
    include: [],
    addMissing: true,
    check: null,
    checking: false,
    checkError: ''
  };
  let timer = null;

  function readForm() {
    const body = document.getElementById('modal-body');
    if (!body || !model.parsed) return;
    const g = sel => body.querySelector(sel);
    if (g('[name=up-std]')) model.std = g('[name=up-std]').value;
    if (g('[name=up-name]')) model.name = g('[name=up-name]').value;
    if (g('[name=up-date]')) model.date = g('[name=up-date]').value;
    if (g('[name=up-add]')) model.addMissing = g('[name=up-add]').checked;
    $$('[data-up-paper]', body).forEach(row => {
      const i = Number(row.dataset.upPaper);
      const p = model.parsed.papers[i];
      model.include[i] = row.querySelector('[name=inc]').checked;
      p.subject = row.querySelector('[name=sub]').value;
      p.max = row.querySelector('[name=max]').value;
      p.date = row.querySelector('[name=pdate]').value;
      p.topic = row.querySelector('[name=topic]').value;
    });
  }

  function payload(dryRun) {
    const idx = model.parsed.papers.map((_, i) => i).filter(i => model.include[i]);
    return {
      std: model.std,
      testId: test ? test.id : undefined,
      name: model.name,
      date: model.date || undefined,
      papers: idx.map(i => {
        const p = model.parsed.papers[i];
        return { subject: p.subject, max: Number(p.max), date: p.date || '', topic: p.topic || '' };
      }),
      rows: model.parsed.rows.map(r => ({ line: r.line, roll: r.roll, name: r.name, grNo: r.grNo, section: r.section, values: idx.map(i => r.values[i]) })),
      addMissingStudents: model.addMissing,
      dryRun
    };
  }

  async function runCheck() {
    readForm();
    if (!model.parsed) return;
    if (!model.name.trim()) {
      model.check = null;
      model.checkError = 'Give the test a name.';
      redraw();
      return;
    }
    model.checking = true;
    try {
      model.check = await api('POST', '/tests/import', payload(true));
      model.checkError = '';
    } catch (err) {
      model.check = null;
      model.checkError = err.message;
    }
    model.checking = false;
    redraw();
  }

  function scheduleCheck() {
    clearTimeout(timer);
    timer = setTimeout(runCheck, 500);
  }

  function checkSummary() {
    if (model.checkError) return html`<div class="banner bad">${model.checkError}</div>`;
    const c = model.check;
    if (!c) return html`<p class="muted">Checking the file...</p>`;
    const blocking = c.invalid.length > 0;
    return html`
      <div class="banner ${blocking ? 'bad' : 'good'}">
        <span class="grow">
          <strong>${c.test.isNew ? `New test "${c.test.name}"` : `Adding to "${c.test.name}"`}</strong> ·
          ${plural(c.marks, 'mark')} for ${plural(c.students, 'student')}
          ${c.newStudents.length ? html` · <strong>${plural(c.newStudents.length, 'new student')}</strong> will be added` : ''}
          ${c.overwrites ? html` · ${plural(c.overwrites, 'mark')} will be changed` : ''}
        </span>
      </div>
      ${c.invalid.length ? html`<div class="card"><h3>Fix these marks in Excel, then upload again</h3><ul class="list">${c.invalid.slice(0, 30).map(x => html`<li><span class="main"><span class="title">Row ${x.line}: ${x.name} - ${x.subject}</span><span class="sub">"${x.value}": ${x.message}</span></span></li>`)}</ul></div>` : ''}
      ${c.unmatched.length ? html`<div class="card"><h3>${plural(c.unmatched.length, 'row')} not used</h3><ul class="list">${c.unmatched.slice(0, 30).map(x => html`<li><span class="main"><span class="title">Row ${x.line}: ${x.name || '(no name)'}${x.roll ? `, roll ${x.roll}` : ''}</span><span class="sub">${x.reason}</span></span></li>`)}</ul></div>` : ''}
      ${c.newStudents.length ? html`<details class="more"><summary>New students (${c.newStudents.length})</summary><p class="small">${c.newStudents.map(s => `${s.roll}. ${s.name}`).join(', ')}</p></details>` : ''}`;
  }

  function body() {
    if (!model.parsed) {
      const kids = students(model.std);
      return html`
        <p>Choose the Excel file with the marks. The first column should be the roll number or name, then one column for each subject. Max marks can be written in the heading, like <strong>Science (30)</strong>.</p>
        ${model.error ? html`<div class="banner bad">${model.error}</div>` : ''}
        <label class="btn primary block">${icon('upload')} Choose Excel file
          <input type="file" accept=".xlsx,.xls,.csv" class="sr-only" data-change="up-file">
        </label>
        <div class="row" style="margin-top:12px">
          <button type="button" class="btn small" data-act="up-template">${icon('download')} Download a ready template${kids.length ? ` with ${kids.length} students` : ''}</button>
        </div>`;
    }
    const classes = classesForUser();
    const existing = testsOf(model.std);
    return html`
      <p class="muted small">File: ${model.fileName} · ${plural(model.parsed.rows.length, 'student row')}</p>
      <datalist id="up-tests">${existing.map(t => html`<option value="${t.name}">`)}</datalist>
      <div class="inline-fields">
        <label class="field"><span>Class</span>
          <select name="up-std" data-change="up-recheck" ${test ? 'disabled' : ''}>${classes.map(c => html`<option value="${c}" ${c === model.std ? 'selected' : ''}>Class ${c}</option>`)}</select>
        </label>
        <label class="field"><span>Test name</span><input name="up-name" list="up-tests" value="${model.name}" data-input="up-recheck" ${test ? 'disabled' : ''} placeholder="Unit Test 1" required></label>
        <label class="field"><span>Test date</span><input type="date" name="up-date" value="${model.date}" data-change="up-recheck"></label>
      </div>
      ${!test && existing.length ? html`<p class="small muted" style="margin-top:-6px">Type the name of an existing test (${existing.slice(0, 3).map(t => t.name).join(', ')}${existing.length > 3 ? '...' : ''}) to add these marks to it.</p>` : ''}
      <h3>Subjects found in the file</h3>
      <div class="table-wrap"><table class="table edit-table">
        <thead><tr><th>Use</th><th>Subject</th><th>Out of</th><th>Date</th><th>Topic</th></tr></thead>
        <tbody>${model.parsed.papers.map((p, i) => html`<tr data-up-paper="${i}">
          <td><input type="checkbox" name="inc" ${model.include[i] ? 'checked' : ''} data-change="up-recheck" aria-label="Use ${p.subject}"></td>
          <td><input name="sub" value="${p.subject}" data-input="up-recheck"><div class="muted small">Heading: ${p.label}</div></td>
          <td><input name="max" type="number" min="1" step="any" value="${p.max}" data-input="up-recheck">${p.maxGuessed ? html`<div class="small"><span class="badge warn">Please check</span></div>` : ''}</td>
          <td><input name="pdate" type="date" value="${p.date}" data-change="up-recheck"></td>
          <td><input name="topic" value="${p.topic}" data-input="up-recheck" placeholder="optional"></td>
        </tr>`)}</tbody>
      </table></div>
      <label class="check-line"><input type="checkbox" name="up-add" ${model.addMissing ? 'checked' : ''} data-change="up-recheck"> Add students from the file who are not in the class list yet</label>
      <div id="up-check">${checkSummary()}</div>
      <div class="form-actions">
        <button type="button" class="btn" data-act="up-again">Choose another file</button>
        <button type="button" class="btn primary" data-act="up-save" ${!model.check || model.check.invalid.length || model.checking ? 'disabled' : ''}>Save marks</button>
      </div>`;
  }

  function redraw() {
    const active = document.activeElement;
    const focusName = active && active.name;
    const focusRow = active && active.closest && active.closest('[data-up-paper]');
    const rowIdx = focusRow ? focusRow.dataset.upPaper : null;
    const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    setDialogBody(body());
    // Keep the cursor where the teacher was typing.
    if (focusName) {
      const scope = rowIdx !== null ? $(`[data-up-paper="${rowIdx}"]`) : document.getElementById('modal-body');
      const el = scope && scope.querySelector(`[name="${focusName}"]`);
      if (el) {
        el.focus();
        if (caret !== null && el.setSelectionRange && el.type !== 'number' && el.type !== 'date') el.setSelectionRange(caret, caret);
      }
    }
  }

  openDialog({
    title: test ? `Upload marks for ${test.name}` : `Upload marks from Excel`,
    body: body(),
    wide: true,
    handlers: {
      'up-file': async el => {
        const file = el.files && el.files[0];
        if (!file) return;
        model.fileName = file.name;
        try {
          const rows = await readSheetRows(file);
          const parsed = parseMarksSheet(rows, file.name);
          model.parsed = parsed;
          model.include = parsed.papers.map(() => true);
          if (!test) {
            if (parsed.std && classesForUser().includes(parsed.std)) model.std = parsed.std;
            model.name = parsed.title || model.name;
            const match = testsOf(model.std).find(t => t.name.toLowerCase() === model.name.toLowerCase());
            if (match) model.date = match.date;
          }
          if (!model.date) model.date = parsed.papers.map(p => p.date).filter(Boolean).sort()[0] || state.data.today;
          model.error = '';
        } catch (err) {
          model.error = err.message || 'Could not read this file.';
          model.parsed = null;
        }
        redraw();
        if (model.parsed) runCheck();
      },
      'up-recheck': () => { readForm(); scheduleCheck(); },
      'up-again': () => { model.parsed = null; model.check = null; model.error = ''; redraw(); },
      'up-template': el => busy(el, async () => {
        if (test) await downloadMarksTemplate(test, students(test.std), state.data.school.name);
        else await downloadBlankMarksTemplate(model.std, students(model.std), state.me.subjects || [], state.data.school.name);
      }),
      'up-save': el => busy(el, async () => {
        readForm();
        const res = await api('POST', '/tests/import', payload(false));
        closeDialog();
        toast(`Saved ${plural(res.marks, 'mark')} for Class ${model.std} · ${res.test.name}${res.newStudents.length ? ` (${plural(res.newStudents.length, 'new student')} added)` : ''}.`, 'good');
        await refresh();
        if (onSaved) onSaved(res.test.id);
      }, 'Saving...')
    },
    onClose: () => clearTimeout(timer)
  });
}
