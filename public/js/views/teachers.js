import { html, mount, busy, toast, icon, fmtWhen, openDialog, closeDialog, confirmDialog, copyText, waLink } from '../ui.js';
import { state, api, refresh } from '../data.js';

const CLASSES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function randomPassword() {
  const words = ['school', 'class', 'teach', 'learn', 'books', 'smart', 'bright'];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(1000 + Math.random() * 9000)}`;
}

function teacherForm(t) {
  const classes = new Set((t && t.classes) || []);
  return html`<form data-submit="save-teacher">
    <label class="field"><span>Full name</span><input name="name" value="${t ? t.name : ''}" required></label>
    <label class="field"><span>Mobile number (used to sign in)</span><input name="mobile" type="tel" inputmode="numeric" value="${t ? t.mobile : ''}" required></label>
    <div class="field"><span><strong>Classes</strong></span>
      <div class="check-grid">${CLASSES.map(c => html`<label><input type="checkbox" name="classes" value="${c}" ${classes.has(c) ? 'checked' : ''}> ${c}</label>`)}</div>
      <small class="muted">The teacher sees all sections of these classes.</small>
    </div>
    <label class="field"><span>Subjects (optional)</span><input name="subjects" value="${t ? (t.subjects || []).join(', ') : ''}" placeholder="Science, Maths"></label>
    <label class="field"><span>${t ? 'New password (leave empty to keep the current one)' : 'Password'}</span>
      <div class="row"><input name="password" value="${t ? '' : randomPassword()}" ${t ? '' : 'required'} minlength="6" autocomplete="off" style="flex:1"><button type="button" class="btn small" data-act="gen-pass">New</button></div>
    </label>
    ${t ? html`<label class="check-line"><input type="checkbox" name="disabled" ${t.status === 'disabled' ? 'checked' : ''}> Turn off this account (the teacher cannot sign in)</label>` : ''}
    <div class="form-actions">
      ${t ? html`<button type="button" class="btn danger" data-act="remove-teacher">Remove teacher</button><span class="spacer"></span>` : ''}
      <button type="button" class="btn" data-act="dialog-close">Cancel</button>
      <button type="submit" class="btn primary">${t ? 'Save' : 'Add teacher'}</button>
    </div>
  </form>`;
}

function shareDetails(name, mobile, password) {
  const url = state.data.publicUrl || location.origin;
  const text = `Hello ${name}, your account for the school student tracker is ready.\nOpen: ${url}\nChoose "Teacher", then sign in with\nMobile: ${mobile}\nPassword: ${password}\nPlease keep the password private.`;
  openDialog({
    title: 'Share sign-in details',
    body: html`<p>Give these details to <strong>${name}</strong>:</p>
      <p class="code" style="white-space:pre-line">${text}</p>
      <div class="form-actions">
        <button class="btn" data-act="copy-details">Copy</button>
        <a class="btn wa" href="${waLink(mobile, text)}" target="_blank" rel="noopener">${icon('chat')} Send on WhatsApp</a>
        <button class="btn primary" data-act="dialog-close">Done</button>
      </div>`,
    handlers: { 'copy-details': () => copyText(text) }
  });
}

export default {
  render(ctx) {
    const list = state.data.teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
    const pending = list.filter(t => t.status === 'pending');
    const others = list.filter(t => t.status !== 'pending');

    mount(ctx.main, html`
      <div class="page-head">
        <div><h1>Teachers</h1><p>Teachers sign in with their mobile number and password. They only see the classes you give them.</p></div>
        <button class="btn primary" data-act="add">${icon('plus')} Add teacher</button>
      </div>
      ${pending.length ? html`<div class="card">
        <h2>Waiting for approval</h2>
        <ul class="list">${pending.map(t => html`<li>
          <div class="main"><div class="title">${t.name}</div><div class="sub">${t.mobile} · Classes ${(t.classes || []).join(', ') || 'none'} · asked ${fmtWhen(t.createdAt)}</div></div>
          <div class="row">
            <button class="btn small" data-act="reject" data-id="${t.id}">Reject</button>
            <button class="btn small primary" data-act="approve" data-id="${t.id}">Approve</button>
          </div>
        </li>`)}</ul>
      </div>` : ''}
      <div class="card">
        ${others.length ? html`<ul class="list">${others.map(t => html`<li>
          <div class="main">
            <div class="title">${t.name} ${t.status === 'disabled' ? html`<span class="badge bad">Turned off</span>` : ''}</div>
            <div class="sub">${t.mobile} · Classes ${(t.classes || []).join(', ') || 'none'}${(t.subjects || []).length ? ` · ${t.subjects.join(', ')}` : ''} · last active ${fmtWhen(t.lastActiveAt).toLowerCase()}</div>
          </div>
          <button class="btn small" data-act="edit" data-id="${t.id}">Edit</button>
        </li>`)}</ul>` : html`<p class="muted">No teachers yet. Add your teachers so they can sign in.</p>`}
      </div>
    `);

    const byId = id => state.data.teachers.find(t => t.id === id);
    const readForm = form => {
      const f = new FormData(form);
      return {
        name: f.get('name'),
        mobile: f.get('mobile'),
        classes: f.getAll('classes'),
        subjects: String(f.get('subjects') || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean),
        password: f.get('password') || undefined,
        disabled: f.get('disabled') === 'on'
      };
    };

    const open = t => openDialog({
      title: t ? `Edit ${t.name}` : 'Add a teacher',
      body: teacherForm(t),
      handlers: {
        'gen-pass': () => { document.querySelector('#modal [name=password]').value = randomPassword(); },
        'save-teacher': form => busy(form.querySelector('[type=submit]'), async () => {
          const data = readForm(form);
          if (!data.classes.length && !(await confirmDialog('No classes chosen', 'This teacher will not see any class. Continue?', { ok: 'Continue' }))) return;
          if (t) {
            const body = { name: data.name, mobile: data.mobile, classes: data.classes, subjects: data.subjects, status: data.disabled ? 'disabled' : 'active' };
            if (data.password) body.password = data.password;
            await api('PUT', `/teachers/${t.id}`, body);
            await refresh();
            closeDialog();
            toast('Saved.', 'good');
            if (data.password) shareDetails(data.name, data.mobile.replace(/\D/g, '').slice(-10), data.password);
          } else {
            const res = await api('POST', '/teachers', data);
            await refresh();
            shareDetails(res.teacher.name, res.teacher.mobile, data.password);
          }
          ctx.rerender();
        }, 'Saving...'),
        'remove-teacher': async () => {
          if (!(await confirmDialog(`Remove ${t.name}?`, 'They will not be able to sign in. Students, marks and attendance they entered stay in the school records.', { ok: 'Remove', danger: true }))) return;
          try {
            await api('DELETE', `/teachers/${t.id}`);
            await refresh();
            toast('Teacher removed.');
            ctx.rerender();
          } catch (err) {
            toast(err.message, 'bad');
          }
        }
      }
    });

    return {
      add: () => open(null),
      edit: el => open(byId(el.dataset.id)),
      approve: el => busy(el, async () => {
        await api('PUT', `/teachers/${el.dataset.id}`, { status: 'active' });
        await refresh();
        toast('Approved. The teacher can sign in now.', 'good');
        ctx.rerender();
      }),
      reject: async el => {
        const t = byId(el.dataset.id);
        if (!(await confirmDialog(`Reject ${t.name}?`, 'The request will be deleted.', { ok: 'Reject', danger: true }))) return;
        await busy(el, async () => {
          await api('DELETE', `/teachers/${t.id}`);
          await refresh();
          ctx.rerender();
        });
      }
    };
  }
};
