import { html, mount, busy, toast, icon, plural, fmtDate, downloadBlob, waLink, applyBarWidths, $ } from '../ui.js';
import { state, api, students, sections, tests, test as findTest, fetchFile, select, selection } from '../data.js';
import { classPicker, pickerHandlers, whatsappLine } from './common.js';

const KINDS = {
  report: {
    color: 'm-marks',
    title: 'Report cards',
    help: 'Send each parent their child\'s report card as a PDF.',
    icon: 'file',
    text: 'Dear Parent,\nPlease find the progress report of {name} (Class {class}) for {test}.\nPercentage: {percent}  Grade: {grade}\n\n- {school}'
  },
  absent: {
    color: 'm-attendance',
    title: 'Absent students',
    help: 'Tell parents their child was absent.',
    icon: 'check',
    text: 'Dear Parent,\n{name} (Roll {roll}, Class {class}) was absent from school on {date}.\nPlease inform the class teacher about the reason.\n\n- {school}'
  },
  low: {
    color: 'm-send',
    title: 'Low marks alert',
    help: 'Message parents of students who scored low in a test.',
    icon: 'alert',
    text: 'Dear Parent,\n{name} scored {percent} in {test}. Please help {first} revise at home, and meet the class teacher if needed.\n\n- {school}'
  },
  notice: {
    color: 'm-students',
    title: 'Notice to parents',
    help: 'Any message to all parents of a class.',
    icon: 'chat',
    text: 'Dear Parent,\n\n\n- {school}'
  }
};

let form = null;
let pollTimer = null;

function freshForm(params) {
  const kind = KINDS[params.kind] ? params.kind : null;
  if (params.std) select(params.std, params.section || 'all');
  return {
    kind,
    testId: params.test || (kind === 'report' ? 'all' : ''),
    date: params.date || state.data.today,
    threshold: 33,
    text: kind ? KINDS[kind].text : '',
    selected: null,
    absent: null,
    review: null,
    job: null,
    opened: new Set()
  };
}

function testPercent(t, sid) {
  const row = t.marks[sid];
  if (!row) return null;
  let obt = 0;
  let max = 0;
  t.papers.forEach(p => {
    const v = row[p.id];
    if (v === undefined) return;
    obt += v === 'AB' ? 0 : v;
    max += p.max;
  });
  return max ? (obt / max) * 100 : null;
}

function candidates(sel) {
  const kids = students(sel.std, sel.section);
  if (form.kind === 'absent') {
    if (!form.absent) return [];
    return kids.filter(s => form.absent.has(s.id));
  }
  if (form.kind === 'low') {
    const t = findTest(form.testId);
    if (!t) return [];
    return kids.filter(s => {
      const p = testPercent(t, s.id);
      return p !== null && p < form.threshold;
    });
  }
  return kids;
}

async function loadAbsent(sel) {
  const secs = sel.section === 'all' ? sections(sel.std) : [sel.section];
  const set = new Set();
  const missing = [];
  for (const sec of secs) {
    const { record } = await api('GET', `/attendance?std=${sel.std}&section=${sec}&date=${form.date}`);
    if (!record) missing.push(sec);
    else Object.entries(record.status).forEach(([sid, st]) => { if (st === 'A') set.add(sid); });
  }
  form.absent = set;
  form.absentMissing = missing;
}

function chooser() {
  return html`
    <div class="page-head"><div><h1>Send to parents</h1><p>What do you want to send?</p></div></div>
    <div class="banner">${whatsappLine()}</div>
    <div class="grid-2">${Object.entries(KINDS).map(([k, v]) => html`
      <button class="btn big ${v.color}" data-act="kind" data-kind="${k}">${icon(v.icon)}<span>${v.title}<small class="muted" style="display:block;font-weight:500">${v.help}</small></span></button>`)}
    </div>`;
}

function optionsHtml(sel) {
  const list = sel.std ? tests(sel.std) : [];
  if (form.kind === 'report') {
    return html`<label class="field"><span>Which marks?</span>
      <select data-change="opt-test">
        <option value="all" ${form.testId === 'all' ? 'selected' : ''}>All tests so far</option>
        ${list.map(t => html`<option value="${t.id}" ${form.testId === t.id ? 'selected' : ''}>${t.name} (${fmtDate(t.date)})</option>`)}
      </select></label>`;
  }
  if (form.kind === 'low') {
    return html`<div class="inline-fields">
      <label class="field"><span>Test</span><select data-change="opt-test">
        <option value="">Choose a test</option>
        ${list.map(t => html`<option value="${t.id}" ${form.testId === t.id ? 'selected' : ''}>${t.name} (${fmtDate(t.date)})</option>`)}
      </select></label>
      <label class="field"><span>Below</span><select data-change="opt-threshold">
        ${[33, 40, 50, 60].map(n => html`<option value="${n}" ${form.threshold === n ? 'selected' : ''}>${n}%</option>`)}
      </select></label>
    </div>`;
  }
  if (form.kind === 'absent') {
    return html`<label class="field"><span>Date</span><input type="date" value="${form.date}" max="${state.data.today}" data-change="opt-date"></label>
      ${form.absentMissing && form.absentMissing.length ? html`<div class="banner warn">Attendance was not taken for section ${form.absentMissing.join(', ')} on ${fmtDate(form.date)}. <a href="#/attendance?date=${form.date}">Take attendance</a></div>` : ''}`;
  }
  return '';
}

function recipientsHtml(list) {
  if (!list.length) {
    const why = form.kind === 'absent' ? 'No students were marked absent.' : form.kind === 'low' ? (form.testId ? 'No student is below this mark.' : 'Choose a test first.') : 'No students in this class.';
    return html`<p class="muted">${why}</p>`;
  }
  return html`<div class="row between" style="margin-bottom:6px">
      <strong>${plural(list.filter(s => form.selected.has(s.id)).length, 'parent')} selected</strong>
      <span class="row"><button class="btn ghost small" data-act="sel-all">Select all</button><button class="btn ghost small" data-act="sel-none">Select none</button></span>
    </div>
    <ul class="list">${list.map(s => html`<li>
      <input type="checkbox" data-change="sel-one" data-id="${s.id}" ${form.selected.has(s.id) ? 'checked' : ''} aria-label="Send to parent of ${s.name}">
      <span class="roll">${s.roll}</span>
      <div class="main"><div class="title">${s.name}</div><div class="sub">${s.mobile ? s.mobile : html`<span class="badge warn">No mobile number</span>`}</div></div>
    </li>`)}</ul>`;
}

function reviewHtml() {
  const r = form.review;
  const wa = state.data.whatsapp;
  const job = form.job;
  if (job) {
    const pctDone = job.total ? Math.round((job.done / job.total) * 100) : 100;
    return html`<div class="card">
      <h2>${job.finished ? 'Finished' : 'Sending...'}</h2>
      <div class="progress"><div data-width="${pctDone}"></div></div>
      <p style="margin-top:8px"><strong>${job.sent} sent</strong>${job.failed ? html` · <span class="error-text">${job.failed} failed</span>` : ''}${job.skipped ? ` · ${job.skipped} skipped` : ''} · ${job.total - job.done} waiting</p>
      ${!job.finished ? html`<button class="btn" data-act="cancel-job">Stop sending</button>` : html`<button class="btn" data-act="restart">Send something else</button>`}
      <ul class="list" style="margin-top:10px">${job.items.map(i => html`<li>
        <span class="roll">${i.roll}</span><div class="main"><div class="title">${i.name}</div><div class="sub">${i.note}</div></div>
        <span class="badge ${i.status === 'sent' ? 'good' : i.status === 'failed' ? 'bad' : i.status === 'skipped' || i.status === 'cancelled' ? 'warn' : 'info'}">${i.status}</span>
      </li>`)}</ul>
    </div>`;
  }
  const isReport = form.kind === 'report';
  return html`<div class="card">
    <div class="row between">
      <h2>Check and send</h2>
      <button class="btn ghost small" data-act="edit-again">${icon('back')} Change</button>
    </div>
    <p class="muted small">This is exactly what each parent will receive.</p>
    ${wa.connected
      ? html`<div class="banner good"><span class="grow">${whatsappLine()}</span><button class="btn wa" data-act="send-all">${icon('send')} Send ${plural(r.items.filter(i => i.numbers.length).length, 'message')} now</button></div>`
      : html`<div class="banner warn"><span class="grow">The school WhatsApp is not linked, so send each message from your own WhatsApp: tap <strong>Open WhatsApp</strong>, then tap send in WhatsApp${isReport ? ' and attach the downloaded PDF' : ''}. ${state.me.role === 'admin' ? html`<a href="#/settings">Link the school WhatsApp</a> to send all at once.` : 'Ask the office to link the school WhatsApp to send all at once.'}</span></div>`}
    ${isReport ? html`<button class="btn" data-act="all-pdf">${icon('download')} Download all these report cards (one PDF to print)</button>` : ''}
    <ul class="list" style="margin-top:8px">${r.items.map(i => html`<li>
      <span class="roll">${i.roll}</span>
      <div class="main">
        <div class="title">${i.name} ${form.opened.has(i.studentId) ? html`<span class="badge good">Opened</span>` : ''}${isReport && i.hasMarks === false ? html` <span class="badge warn">No marks yet</span>` : ''}</div>
        <div class="sub" style="white-space:pre-line">${i.text}</div>
      </div>
      <div class="row">
        ${isReport ? html`<button class="btn small" data-act="one-pdf" data-id="${i.studentId}">${icon('download')} PDF</button>` : ''}
        ${!wa.connected ? (i.numbers.length ? i.numbers.map(n => html`<a class="btn small wa" href="${waLink(n, i.text)}" target="_blank" rel="noopener" data-act="opened" data-id="${i.studentId}" data-href="${waLink(n, i.text)}">${icon('chat')} ${i.numbers.length > 1 ? n.slice(-4) : 'Open WhatsApp'}</a>`) : html`<span class="badge warn">No mobile</span>`) : ''}
      </div>
    </li>`)}</ul>
  </div>`;
}

export default {
  async render(ctx) {
    if (ctx.fresh || !form) form = freshForm(ctx.route.params);
    clearInterval(pollTimer);
    const main = ctx.main;

    if (!form.kind) {
      mount(main, chooser());
      return { kind: el => { form = freshForm({ kind: el.dataset.kind }); ctx.rerender(); } };
    }

    const sel = selection();
    if (form.kind === 'absent' && form.absent === null && sel.std) {
      try { await loadAbsent(sel); } catch (err) { toast(err.message, 'bad'); form.absent = new Set(); }
    }
    const list = sel.std ? candidates(sel) : [];
    if (!form.selected) form.selected = new Set(list.filter(s => s.mobile).map(s => s.id));
    const k = KINDS[form.kind];

    const draw = () => {
      mount(main, html`
        <div class="page-head">
          <div><h1>${k.title}</h1><p>${k.help}</p></div>
          <button class="btn ghost small" data-act="restart">${icon('back')} Something else</button>
        </div>
        ${form.review ? reviewHtml() : html`
          ${classPicker({ sectionMode: 'all' })}
          <div class="card">${optionsHtml(sel)}
            <label class="field"><span>Message</span><textarea data-input="opt-text" rows="6">${form.text}</textarea>
            <small>These words are filled in for each student: {name}, {first}, {class}, {roll}, {date}, {test}, {percent}, {grade}, {school}${state.data.publicUrl ? ', {link} (their parent link)' : ''}.</small></label>
          </div>
          <div class="card">${recipientsHtml(list)}</div>
          <div class="sticky-foot">
            <span class="small">${form.kind === 'report' ? 'Each parent gets the PDF report card with this message.' : 'Each parent gets this message.'}</span>
            <button class="btn primary" data-act="review" ${list.some(s => form.selected.has(s.id)) ? '' : 'disabled'}>Next: check messages</button>
          </div>`}
      `);
      applyBarWidths(main);
    };
    draw();

    const poll = () => {
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (!main.isConnected || !form.job) { clearInterval(pollTimer); return; }
        try {
          form.job = (await api('GET', `/messages/jobs/${form.job.id}`)).job;
          draw();
          if (form.job.finished) {
            clearInterval(pollTimer);
            toast(`Done: ${form.job.sent} sent${form.job.failed ? `, ${form.job.failed} failed` : ''}.`, form.job.failed ? 'bad' : 'good');
          }
        } catch { /* try again */ }
      }, 1500);
    };
    if (form.job && !form.job.finished) poll();

    const body = () => ({
      studentIds: list.filter(s => form.selected.has(s.id)).map(s => s.id),
      text: form.text,
      testIds: form.testId && form.testId !== 'all' ? [form.testId] : [],
      date: form.date,
      attachReport: form.kind === 'report'
    });

    const resetList = () => { form.selected = null; form.review = null; };

    return {
      ...Object.fromEntries(Object.entries(pickerHandlers(ctx)).map(([n, fn]) => [n, el => { resetList(); form.absent = null; fn(el); }])),
      restart: () => { form = freshForm({}); clearInterval(pollTimer); ctx.rerender(); },
      'opt-test': el => { form.testId = el.value; resetList(); ctx.rerender(); },
      'opt-threshold': el => { form.threshold = Number(el.value); resetList(); ctx.rerender(); },
      'opt-date': el => { form.date = el.value || state.data.today; form.absent = null; resetList(); ctx.rerender(); },
      'opt-text': el => { form.text = el.value; },
      'sel-one': el => {
        if (el.checked) form.selected.add(el.dataset.id); else form.selected.delete(el.dataset.id);
        const btn = $('[data-act="review"]', main);
        if (btn) btn.disabled = !list.some(s => form.selected.has(s.id));
      },
      'sel-all': () => { list.forEach(s => form.selected.add(s.id)); draw(); },
      'sel-none': () => { form.selected.clear(); draw(); },
      review: el => busy(el, async () => {
        if (form.kind === 'low' && !form.testId) { toast('Choose a test.', 'bad'); return; }
        const ta = $('textarea', main);
        if (ta) form.text = ta.value;
        form.review = await api('POST', '/messages/preview', body());
        state.data.whatsapp = form.review.whatsapp;
        form.opened = new Set();
        draw();
        window.scrollTo(0, 0);
      }, 'Preparing...'),
      'edit-again': () => { form.review = null; draw(); },
      opened: el => {
        window.open(el.dataset.href, '_blank', 'noopener');
        form.opened.add(el.dataset.id);
        const title = el.closest('li') && el.closest('li').querySelector('.title');
        if (title && !title.querySelector('.badge.good')) title.insertAdjacentHTML('beforeend', ' <span class="badge good">Opened</span>');
      },
      'send-all': el => busy(el, async () => {
        try {
          form.job = (await api('POST', '/messages/send', body())).job;
        } catch (err) {
          if (err.data && err.data.code === 'WA_NOT_LINKED') {
            state.data.whatsapp = { ...state.data.whatsapp, connected: false };
            draw();
          }
          throw err;
        }
        draw();
        poll();
      }, 'Starting...'),
      'cancel-job': el => busy(el, async () => {
        form.job = (await api('POST', `/messages/jobs/${form.job.id}/cancel`)).job;
        draw();
      }),
      'one-pdf': el => busy(el, async () => {
        const t = form.testId && form.testId !== 'all' ? form.testId : 'all';
        const { blob, fileName } = await fetchFile(`/report-cards.pdf?students=${el.dataset.id}&tests=${t}`);
        downloadBlob(blob, fileName);
      }, '...'),
      'all-pdf': el => busy(el, async () => {
        const ids = form.review.items.map(i => i.studentId).join(',');
        const t = form.testId && form.testId !== 'all' ? form.testId : 'all';
        const { blob, fileName } = await fetchFile(`/report-cards.pdf?students=${ids}&tests=${t}`);
        downloadBlob(blob, fileName);
      }, 'Preparing PDF...')
    };
  }
};

