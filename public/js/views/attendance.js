import { html, mount, busy, toast, fmtDate, plural, icon, $, $$ } from '../ui.js';
import { state, api, students } from '../data.js';
import { classPicker, currentSelection, pickerHandlers, empty } from './common.js';

let marks = {};
let dirty = false;
let date = null;

function counts() {
  const c = { P: 0, A: 0, L: 0 };
  Object.values(marks).forEach(v => { c[v] += 1; });
  return c;
}

function countsText() {
  const c = counts();
  return `${c.P} present · ${c.A} absent${c.L ? ` · ${c.L} on leave` : ''}`;
}

function rowHtml(s) {
  const v = marks[s.id] || 'P';
  return html`<div class="att-row" data-row="${s.id}">
    <span class="roll">${s.roll}</span>
    <button type="button" class="name" data-act="toggle" data-sid="${s.id}" title="Tap to switch between present and absent">${s.name}</button>
    <div class="seg" role="group" aria-label="${s.name}">
      ${['P', 'A', 'L'].map(x => html`<button type="button" data-act="set" data-sid="${s.id}" data-v="${x}" aria-pressed="${v === x}" aria-label="${x === 'P' ? 'Present' : x === 'A' ? 'Absent' : 'Leave'}">${x}</button>`)}
    </div>
  </div>`;
}

function updateRow(main, sid) {
  const row = $(`[data-row="${sid}"]`, main);
  if (row) $$('.seg button', row).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === marks[sid])));
  const c = $('#att-counts', main);
  if (c) c.textContent = countsText();
  const save = $('#att-save', main);
  if (save) save.textContent = dirty ? 'Save attendance' : 'Saved';
}

export default {
  isDirty: () => dirty,

  async render(ctx) {
    const { main } = ctx;
    const sel = currentSelection('one');
    if (!date || ctx.fresh) date = ctx.route.params.date || state.data.today;
    const kids = sel.std ? students(sel.std, sel.section) : [];
    marks = {};
    dirty = false;

    const head = html`<div class="page-head"><div><h1>Attendance</h1><p>Everyone starts as present. Tap a name to mark absent.</p></div></div>`;
    if (!sel.std || !kids.length) {
      mount(main, html`${head}${classPicker({ sectionMode: 'one' })}${empty('No students in this class yet', 'Add students first, then take attendance here.', html`<a class="btn primary" href="#/students">${icon('users')} Add students</a>`)}`);
      return pickerHandlers(ctx);
    }

    mount(main, html`${head}${classPicker({ sectionMode: 'one' })}<div class="card"><p>Loading...</p></div>`);
    let record = null;
    try {
      record = (await api('GET', `/attendance?std=${sel.std}&section=${sel.section}&date=${date}`)).record;
    } catch (err) {
      toast(err.message, 'bad');
    }
    kids.forEach(s => { marks[s.id] = (record && record.status[s.id]) || 'P'; });

    const isToday = date === state.data.today;
    mount(main, html`
      ${head}
      ${classPicker({ sectionMode: 'one' })}
      <div class="card">
        <div class="row between">
          <label class="field" style="margin:0;min-width:180px">
            <span>Date</span>
            <input type="date" value="${date}" max="${state.data.today}" data-change="att-date">
          </label>
          <div>
            ${record ? html`<span class="badge good">Saved${record.takenByName ? ` by ${record.takenByName}` : ''}</span>` : html`<span class="badge warn">Not saved yet</span>`}
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn small" data-act="all" data-v="P">Everyone present</button>
          <span class="muted small">${isToday ? 'Today' : fmtDate(date)} · Class ${sel.std}-${sel.section} · ${plural(kids.length, 'student')}</span>
        </div>
        <div style="margin-top:8px">${kids.map(rowHtml)}</div>
      </div>
      <div class="sticky-foot">
        <strong id="att-counts">${countsText()}</strong>
        <button class="btn primary" id="att-save" data-act="save">${record ? 'Saved' : 'Save attendance'}</button>
      </div>
      <div id="after-save"></div>
    `);

    const set = (sid, v) => {
      if (marks[sid] === v) return;
      marks[sid] = v;
      dirty = true;
      updateRow(main, sid);
    };

    const leaveGuard = fn => el => {
      if (dirty && !confirm('Attendance is not saved yet. Switch anyway?')) return;
      dirty = false;
      fn(el);
    };
    const picker = pickerHandlers(ctx);

    return {
      'pick-class': leaveGuard(picker['pick-class']),
      'pick-section': leaveGuard(picker['pick-section']),
      'att-date': el => {
        if (dirty && !confirm('Attendance is not saved yet. Change the date anyway?')) { el.value = date; return; }
        dirty = false;
        date = el.value || state.data.today;
        ctx.rerender();
      },
      set: el => set(el.dataset.sid, el.dataset.v),
      toggle: el => set(el.dataset.sid, marks[el.dataset.sid] === 'A' ? 'P' : 'A'),
      all: el => kids.forEach(s => set(s.id, el.dataset.v)),
      save: el => busy(el, async () => {
        const res = await api('PUT', '/attendance', { std: sel.std, section: sel.section, date, status: marks });
        dirty = false;
        const list = state.data.attendance;
        const i = list.findIndex(a => a.id === res.record.id);
        if (i >= 0) list[i] = res.record; else list.push(res.record);
        state.data.revision = res.revision;
        toast('Attendance saved.', 'good');
        const absent = kids.filter(s => marks[s.id] === 'A');
        mount($('#after-save', main), absent.length ? html`<div class="card">
          <h2>${plural(absent.length, 'student')} absent</h2>
          <p class="muted">${absent.map(s => s.name).join(', ')}</p>
          <a class="btn wa" href="#/send?kind=absent&date=${date}&std=${sel.std}&section=${sel.section}">${icon('chat')} Tell their parents on WhatsApp</a>
        </div>` : html`<div class="banner good">Everyone is present.</div>`);
        el.textContent = 'Saved';
        $('#after-save', main).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 'Saving...')
    };
  }
};
