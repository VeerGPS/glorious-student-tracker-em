import { html, mount, busy, toast, icon, plural, openDialog, setDialogBody, closeDialog, confirmDialog, downloadBlob, copyText, waLink, $ } from '../ui.js';
import { state, api, refresh, students, sections, fetchFile, classesForUser } from '../data.js';
import { classPicker, currentSelection, pickerHandlers, empty } from './common.js';
import { readSheetRows, parseStudentSheet, downloadStudentList } from '../excel.js';
import { openInsights } from './insights.js';

let search = '';

function firstMobile(s) {
  return (s.mobile || '').split(',').map(x => x.trim()).filter(Boolean)[0] || '';
}

function parentUrl(s) {
  const base = state.data.publicUrl || location.origin;
  return `${base}/?p=${s.parentKey}`;
}

function listHtml(kids) {
  const q = search.trim().toLowerCase();
  const shown = q ? kids.filter(s => s.name.toLowerCase().includes(q) || String(s.roll) === q || (s.grNo || '').toLowerCase().includes(q) || (s.mobile || '').includes(q)) : kids;
  if (!shown.length) return html`<p class="muted" style="padding:12px">No student matches "${search}".</p>`;
  return html`<ul class="list">${shown.map(s => html`<li>
    <span class="roll">${s.roll}</span>
    <div class="main">
      <div class="title">${s.name}</div>
      <div class="sub">Class ${s.std}-${s.section}${s.grNo ? ` · GR ${s.grNo}` : ''} · ${s.mobile || 'No mobile number'}</div>
    </div>
    <div class="row">
      <button class="btn small" data-act="insights" data-id="${s.id}" aria-label="AI Insights for ${s.name}">${icon('chart')} Insights</button>
      <button class="btn small" data-act="report" data-id="${s.id}" title="Report card PDF">${icon('file')}<span class="sr-only">Report card for ${s.name}</span></button>
      <button class="btn small" data-act="link" data-id="${s.id}" title="Parent link">${icon('link')}<span class="sr-only">Parent link for ${s.name}</span></button>
      <button class="btn small" data-act="edit" data-id="${s.id}">Edit</button>
    </div>
  </li>`)}</ul>`;
}

function studentForm(s, defaults) {
  const classes = classesForUser();
  const v = s || defaults;
  return html`<form data-submit="save-student">
    <div class="inline-fields">
      <label class="field"><span>Class</span><select name="std">${classes.map(c => html`<option value="${c}" ${c === v.std ? 'selected' : ''}>Class ${c}</option>`)}</select></label>
      <label class="field"><span>Section</span><input name="section" value="${v.section || 'A'}" maxlength="3"></label>
      <label class="field"><span>Roll number</span><input name="roll" type="number" min="1" inputmode="numeric" value="${v.roll || ''}" required></label>
    </div>
    <label class="field"><span>Student's full name</span><input name="name" value="${v.name || ''}" required></label>
    <div class="inline-fields">
      <label class="field"><span>GR number (optional)</span><input name="grNo" value="${v.grNo || ''}"></label>
      <label class="field"><span>Parent's mobile number(s)</span><input name="mobile" type="tel" value="${v.mobile || ''}" placeholder="9876543210, 9876543211"><small>Used for WhatsApp messages. Separate two numbers with a comma.</small></label>
    </div>
    <div class="form-actions">
      ${s ? html`<button type="button" class="btn danger" data-act="delete-student">Delete student</button><span class="spacer"></span>` : ''}
      <button type="button" class="btn" data-act="dialog-close">Cancel</button>
      <button type="submit" class="btn primary">${s ? 'Save' : 'Add student'}</button>
    </div>
  </form>`;
}

export default {
  render(ctx) {
    const sel = currentSelection('all');
    const kids = sel.std ? students(sel.std, sel.section) : [];

    mount(ctx.main, html`
      <div class="page-head">
        <div><h1>Students</h1><p>${sel.std ? `${plural(kids.length, 'student')} in Class ${sel.std}${sel.section !== 'all' ? `-${sel.section}` : ''}` : ''}</p></div>
      </div>
      ${classPicker({ sectionMode: 'all' })}
      ${sel.std ? html`<div class="actions">
        <button class="btn primary" data-act="add">${icon('plus')} Add student</button>
        <button class="btn" data-act="upload">${icon('upload')} Upload list (Excel)</button>
        <button class="btn" data-act="download">${icon('download')} Download list</button>
        ${kids.length ? html`<button class="btn" data-act="class-pdf">${icon('file')} All report cards (PDF)</button>` : ''}
      </div>` : ''}
      ${kids.length ? html`<div class="card" style="margin-top:14px">
        <input type="search" placeholder="Search by name, roll, GR or mobile" value="${search}" data-input="search" aria-label="Search students">
        <div id="student-list">${listHtml(kids)}</div>
      </div>` : sel.std ? empty('No students yet', 'Upload your class list from Excel (Roll No, Name, Mobile), or add students one by one.', html`<button class="btn primary" data-act="upload">${icon('upload')} Upload list</button><button class="btn" data-act="add">${icon('plus')} Add one</button>`) : ''}
    `);

    const byId = id => state.data.students.find(s => s.id === id);

    const openForm = s => {
      const secs = sections(sel.std);
      const sec = sel.section !== 'all' ? sel.section : secs[0];
      const nextRoll = Math.max(0, ...students(sel.std, sec).map(x => x.roll)) + 1;
      openDialog({
        title: s ? `Edit ${s.name}` : `Add a student`,
        body: studentForm(s, { std: sel.std, section: sec, roll: nextRoll }),
        handlers: {
          'save-student': form => busy(form.querySelector('[type=submit]'), async () => {
            const body = Object.fromEntries(new FormData(form).entries());
            if (s) await api('PUT', `/students/${s.id}`, body);
            else await api('POST', '/students', body);
            await refresh();
            if (s) {
              closeDialog();
              toast('Saved.', 'good');
            } else {
              toast(`${body.name} added.`, 'good');
              // Keep the form open for the next student.
              const after = students(body.std, String(body.section || 'A').toUpperCase());
              openForm(null);
              const roll = $('#modal [name=roll]');
              if (roll) roll.value = Math.max(0, ...after.map(x => x.roll)) + 1;
            }
            ctx.rerender();
          }, 'Saving...'),
          'delete-student': async () => {
            const ok = await confirmDialog(`Delete ${s.name}?`, 'The student and all their marks will be removed. This cannot be undone.', { ok: 'Delete', danger: true });
            if (!ok) return;
            try {
              await api('DELETE', `/students/${s.id}`);
              await refresh();
              toast('Student deleted.');
              ctx.rerender();
            } catch (err) {
              toast(err.message, 'bad');
            }
          }
        }
      });
    };

    const openUpload = () => {
      const model = { rows: null, std: sel.std, check: null, error: '' };
      const body = () => {
        if (!model.rows) {
          return html`
            <p>Choose an Excel file with your class list. Columns: <strong>Roll No</strong>, <strong>Student Name</strong>, and if you have them <strong>GR No</strong>, <strong>Section</strong>, <strong>Mobile</strong>.</p>
            ${model.error ? html`<div class="banner bad">${model.error}</div>` : ''}
            <label class="btn primary block">${icon('upload')} Choose Excel file<input type="file" accept=".xlsx,.xls,.csv" class="sr-only" data-change="st-file"></label>
            <div class="row" style="margin-top:12px"><button type="button" class="btn small" data-act="st-template">${icon('download')} Download a template</button></div>`;
        }
        const c = model.check;
        return html`
          <label class="field"><span>Class</span><select name="st-std" data-change="st-class">${classesForUser().map(x => html`<option value="${x}" ${x === model.std ? 'selected' : ''}>Class ${x}</option>`)}</select><small>Used for rows that do not have a class column.</small></label>
          ${!c ? html`<p class="muted">Checking...</p>` : html`
            <div class="banner ${c.errors.length ? 'warn' : 'good'}"><span class="grow">
              <strong>${plural(c.added, 'new student')}</strong> will be added, <strong>${plural(c.updated, 'student')}</strong> updated${c.unchanged ? `, ${c.unchanged} already up to date` : ''}.
              ${c.errors.length ? html` <strong>${plural(c.errors.length, 'row')}</strong> will be skipped (see below).` : ''}
            </span></div>
            ${c.errors.length ? html`<div class="card"><h3>Rows that will be skipped</h3><ul class="list">${c.errors.slice(0, 40).map(e => html`<li><span class="main"><span class="title">Row ${e.line}: ${e.name || '(no name)'}${e.roll ? `, roll ${e.roll}` : ''}</span><span class="sub">${e.message}</span></span></li>`)}</ul></div>` : ''}
            ${c.rows.filter(r => r.action === 'update').length ? html`<details class="more"><summary>Changes to existing students</summary><ul class="list">${c.rows.filter(r => r.action === 'update').slice(0, 60).map(r => html`<li><span class="main"><span class="title">${r.roll}. ${r.name}</span><span class="sub">Changes: ${r.changes.join(', ')}</span></span></li>`)}</ul></details>` : ''}`}
          <div class="form-actions">
            <button type="button" class="btn" data-act="st-again">Choose another file</button>
            <button type="button" class="btn primary" data-act="st-save" ${c && (c.added || c.updated) ? '' : 'disabled'}>Save students</button>
          </div>`;
      };
      const check = async () => {
        model.check = null;
        setDialogBody(body());
        try {
          model.check = await api('POST', '/students/import', { std: model.std, rows: model.rows, dryRun: true });
        } catch (err) {
          model.rows = null;
          model.error = err.message;
        }
        setDialogBody(body());
      };
      openDialog({
        title: 'Upload class list',
        body: body(),
        wide: true,
        handlers: {
          'st-file': async el => {
            const file = el.files && el.files[0];
            if (!file) return;
            try {
              const parsed = parseStudentSheet(await readSheetRows(file));
              if (parsed.std && classesForUser().includes(parsed.std)) model.std = parsed.std;
              model.rows = parsed.rows;
              model.error = '';
              await check();
            } catch (err) {
              model.error = err.message || 'Could not read this file.';
              setDialogBody(body());
            }
          },
          'st-class': el => { model.std = el.value; check(); },
          'st-again': () => { model.rows = null; model.check = null; setDialogBody(body()); },
          'st-template': el => busy(el, () => downloadStudentList(model.std, [])),
          'st-save': el => busy(el, async () => {
            const res = await api('POST', '/students/import', { std: model.std, rows: model.rows });
            await refresh();
            closeDialog();
            toast(`${plural(res.added, 'student')} added, ${res.updated} updated.`, 'good');
            ctx.rerender();
          }, 'Saving...')
        }
      });
    };

    const openLink = s => {
      const url = parentUrl(s);
      const local = !state.data.publicUrl;
      const text = `Dear parent, you can see ${s.name}'s marks and report card here: ${url}`;
      const number = firstMobile(s);
      openDialog({
        title: `Parent link for ${s.name}`,
        body: html`
          <p>Parents can open this link any time to see marks, attendance and download the report card. Each child has their own private link.</p>
          <p class="code">${url}</p>
          ${local ? html`<div class="banner warn">This app is running on a school computer, so the link works only on the school Wi-Fi. The office can set the website address in Settings.</div>` : ''}
          <div class="form-actions">
            <button type="button" class="btn" data-act="new-link">Make a new link</button>
            <button type="button" class="btn" data-act="copy-link">Copy link</button>
            ${number ? html`<a class="btn wa" href="${waLink(number, text)}" target="_blank" rel="noopener">${icon('chat')} Send on WhatsApp</a>` : ''}
          </div>`,
        handlers: {
          'copy-link': () => copyText(url),
          'new-link': async el => {
            const ok = await confirmDialog('Make a new link?', 'The old link will stop working.', { ok: 'Make new link' });
            if (!ok) return;
            await busy(el, async () => {
              await api('POST', `/students/${s.id}/new-link`);
              await refresh();
              openLink(byId(s.id));
            });
          }
        }
      });
    };

    return {
      ...pickerHandlers(ctx),
      search: el => {
        search = el.value;
        mount($('#student-list', ctx.main), listHtml(kids));
      },
      add: () => openForm(null),
      edit: el => openForm(byId(el.dataset.id)),
      upload: openUpload,
      link: el => openLink(byId(el.dataset.id)),
      download: el => busy(el, () => downloadStudentList(sel.std, students(sel.std, sel.section))),
      insights: el => openInsights(el.dataset.id),
      report: el => busy(el, async () => {
        const { blob, fileName } = await fetchFile(`/report-cards.pdf?students=${el.dataset.id}&tests=all`);
        downloadBlob(blob, fileName);
      }, '...'),
      'class-pdf': el => busy(el, async () => {
        const { blob, fileName } = await fetchFile(`/report-cards.pdf?std=${sel.std}${sel.section !== 'all' ? `&section=${sel.section}` : ''}&tests=all`);
        downloadBlob(blob, fileName);
      }, 'Preparing PDF...')
    };
  }
};
