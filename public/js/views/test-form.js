import { html, openDialog, setDialogBody, closeDialog, busy, toast, $$, icon } from '../ui.js';
import { state, api, replaceTest } from '../data.js';
import { COMMON_SUBJECTS } from '../excel.js';

const NAME_SUGGESTIONS = ['Unit Test 1', 'Unit Test 2', 'Unit Test 3', 'Periodic Test 1', 'Periodic Test 2', 'First Term Exam', 'Half Yearly Exam', 'Annual Exam'];

function subjectChoices() {
  const mine = (state.me.subjects || []);
  return [...new Set([...mine, ...COMMON_SUBJECTS])];
}

/**
 * Create a new test (existing = null) or edit one.
 * onSaved(test) is called with the saved test.
 */
export function openTestForm({ std, existing = null, onSaved }) {
  const used = new Set(state.data.tests.filter(t => t.std === std).map(t => t.name.toLowerCase()));
  const suggestion = NAME_SUGGESTIONS.find(n => !used.has(n.toLowerCase())) || '';
  const form = {
    name: existing ? existing.name : '',
    date: existing ? existing.date : state.data.today,
    more: existing ? existing.papers.some(p => p.date || p.topic) : false,
    papers: existing ? existing.papers.map(p => ({ ...p })) : []
  };
  if (!form.papers.length) {
    const mine = (state.me.subjects || []).slice(0, 6);
    (mine.length ? mine : []).forEach(s => form.papers.push({ subject: s, max: 25, date: '', topic: '' }));
  }

  function readForm() {
    const body = document.getElementById('modal-body');
    if (!body) return;
    const nameEl = body.querySelector('[name=test-name]');
    const dateEl = body.querySelector('[name=test-date]');
    if (nameEl) form.name = nameEl.value;
    if (dateEl) form.date = dateEl.value;
    $$('[data-paper]', body).forEach(row => {
      const p = form.papers[Number(row.dataset.paper)];
      if (!p) return;
      p.subject = row.querySelector('[name=subject]').value;
      p.max = row.querySelector('[name=max]').value;
      const d = row.querySelector('[name=pdate]');
      const t = row.querySelector('[name=topic]');
      if (d) p.date = d.value;
      if (t) p.topic = t.value;
    });
  }

  function body() {
    const choices = subjectChoices();
    const present = new Set(form.papers.map(p => p.subject.toLowerCase()));
    return html`
      <datalist id="subject-list">${choices.map(s => html`<option value="${s}">`)}</datalist>
      <label class="field"><span>Test name</span><input name="test-name" value="${form.name}" placeholder="${suggestion || 'Unit Test 1'}" required></label>
      ${!existing ? html`<div class="chips" style="margin:-4px 0 12px">${NAME_SUGGESTIONS.filter(n => !used.has(n.toLowerCase())).slice(0, 6).map(n => html`<button type="button" class="chip small" data-act="tf-name" data-value="${n}">${n}</button>`)}</div>` : ''}
      <label class="field"><span>Date of the test</span><input type="date" name="test-date" value="${form.date}" required></label>
      <div class="field">
        <span><strong>Subjects and maximum marks</strong></span>
        ${form.papers.length ? html`<div class="table-wrap"><table class="table edit-table">
          <thead><tr><th>Subject</th><th>Out of</th>${form.more ? html`<th>Date (if different)</th><th>Topic</th>` : ''}<th></th></tr></thead>
          <tbody>${form.papers.map((p, i) => html`<tr data-paper="${i}">
            <td><input name="subject" list="subject-list" value="${p.subject}" required></td>
            <td><input name="max" type="number" inputmode="decimal" min="1" max="1000" step="any" value="${p.max}" required></td>
            ${form.more ? html`<td><input name="pdate" type="date" value="${p.date || ''}"></td><td><input name="topic" value="${p.topic || ''}" placeholder="optional"></td>` : ''}
            <td><button type="button" class="btn ghost small" data-act="tf-remove" data-i="${i}" aria-label="Remove ${p.subject}">${icon('close')}</button></td>
          </tr>`)}</tbody>
        </table></div>` : html`<p class="muted">Tap the subjects below to add them.</p>`}
        <div class="chips" style="margin-top:10px">
          ${choices.filter(s => !present.has(s.toLowerCase())).map(s => html`<button type="button" class="chip small" data-act="tf-add" data-value="${s}">+ ${s}</button>`)}
          <button type="button" class="chip small" data-act="tf-add" data-value="">+ Other</button>
        </div>
      </div>
      <div class="row">
        <label class="check-line"><input type="checkbox" data-change="tf-more" ${form.more ? 'checked' : ''}> Subjects were on different days / add topics</label>
        <span class="spacer"></span>
        <span class="small muted">Same marks for all:</span>
        ${[10, 20, 25, 50, 80, 100].map(n => html`<button type="button" class="chip small" data-act="tf-all" data-value="${n}">${n}</button>`)}
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-act="dialog-close">Cancel</button>
        <button type="button" class="btn primary" data-act="tf-save">${existing ? 'Save changes' : 'Create test'}</button>
      </div>`;
  }

  const redraw = () => setDialogBody(body());

  openDialog({
    title: existing ? `Edit ${existing.name}` : `New test for Class ${std}`,
    body: body(),
    wide: true,
    handlers: {
      'tf-name': el => { readForm(); form.name = el.dataset.value; redraw(); },
      'tf-add': el => {
        readForm();
        const last = form.papers[form.papers.length - 1];
        form.papers.push({ subject: el.dataset.value, max: last ? last.max : 25, date: '', topic: '' });
        redraw();
        const inputs = $$('[name=subject]', document.getElementById('modal-body'));
        if (!el.dataset.value && inputs.length) inputs[inputs.length - 1].focus();
      },
      'tf-remove': el => { readForm(); form.papers.splice(Number(el.dataset.i), 1); redraw(); },
      'tf-all': el => { readForm(); form.papers.forEach(p => { p.max = el.dataset.value; }); redraw(); },
      'tf-more': el => { readForm(); form.more = el.checked; redraw(); },
      'tf-save': el => busy(el, async () => {
        readForm();
        if (!form.name.trim()) { toast('Give the test a name.', 'bad'); return; }
        const papers = form.papers.filter(p => String(p.subject).trim()).map(p => ({ id: p.id, subject: p.subject.trim(), max: Number(p.max), date: form.more ? p.date || '' : '', topic: form.more ? p.topic || '' : '' }));
        if (!papers.length) { toast('Add at least one subject.', 'bad'); return; }
        const res = existing
          ? await api('PUT', `/tests/${existing.id}`, { name: form.name, date: form.date, papers })
          : await api('POST', '/tests', { std, name: form.name, date: form.date, papers });
        replaceTest(res.test);
        state.data.revision = res.revision;
        closeDialog();
        toast(existing ? 'Test updated.' : 'Test created. Now enter the marks.', 'good');
        if (onSaved) onSaved(res.test);
      }, 'Saving...')
    }
  });
}
