import { html, openDialog, setDialogBody, closeDialog, busy, toast, icon, fmtDate, plural, chips } from '../ui.js';
import { state, api, sections, classesForUser, isAdmin } from '../data.js';
import { downloadAttendanceRegister } from '../excel.js';

const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Ready-made periods, counted from today.
function periods(today) {
  const [y, m, d] = today.split('-').map(Number);
  const now = new Date(y, m - 1, d);
  const monday = new Date(y, m - 1, d - ((now.getDay() + 6) % 7));
  return {
    today: [today, today],
    week: [isoOf(monday), today],
    month: [isoOf(new Date(y, m - 1, 1)), today],
    last: [isoOf(new Date(y, m - 2, 1)), isoOf(new Date(y, m - 1, 0))]
  };
}

const PERIOD_CHIPS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'custom', label: 'Choose dates' }
];

/**
 * Downloads attendance as one Excel file for one day or many days.
 * Only reads attendance; nothing is changed.
 */
export function openAttendanceExport({ std = 'all', section = 'all' } = {}) {
  const classes = classesForUser();
  const today = state.data.today;
  const preset = periods(today);
  const model = {
    std: classes.length === 1 ? classes[0] : classes.includes(std) ? std : 'all',
    section: 'all',
    period: 'month',
    from: preset.month[0],
    to: preset.month[1],
    message: ''
  };
  if (model.std !== 'all' && sections(model.std).includes(section)) model.section = section;

  const scopeText = () => {
    if (model.std === 'all') return isAdmin() ? 'All classes' : 'All my classes';
    return `Class ${model.std}${model.section !== 'all' ? `-${model.section}` : ''}`;
  };

  const body = () => {
    const secs = model.std === 'all' ? [] : sections(model.std);
    return html`
      <p class="muted small">One Excel file with a sheet for each class: students down the side, the days across (P, A or L), and each student's total and attendance %.</p>
      <div class="inline-fields">
        <label class="field"><span>Class</span>
          <select data-change="ax-class">
            ${classes.length > 1 ? html`<option value="all" ${model.std === 'all' ? 'selected' : ''}>${isAdmin() ? 'All classes' : 'All my classes'}</option>` : ''}
            ${classes.map(c => html`<option value="${c}" ${model.std === c ? 'selected' : ''}>Class ${c}</option>`)}
          </select>
        </label>
        ${secs.length > 1 ? html`<label class="field"><span>Section</span>
          <select data-change="ax-section">
            <option value="all" ${model.section === 'all' ? 'selected' : ''}>All sections</option>
            ${secs.map(s => html`<option value="${s}" ${model.section === s ? 'selected' : ''}>Section ${s}</option>`)}
          </select>
        </label>` : ''}
      </div>
      ${chips('ax-period', PERIOD_CHIPS, model.period, { small: true, label: 'Days' })}
      <div class="inline-fields mt">
        <label class="field"><span>From</span><input type="date" name="ax-from" value="${model.from}" max="${today}" data-change="ax-dates"></label>
        <label class="field"><span>To</span><input type="date" name="ax-to" value="${model.to}" max="${today}" data-change="ax-dates"></label>
      </div>
      <div class="banner"><span class="grow"><strong>${scopeText()}</strong> · ${model.from === model.to ? fmtDate(model.from) : `${fmtDate(model.from)} to ${fmtDate(model.to)}`}</span></div>
      ${model.message ? html`<div class="banner warn">${model.message}</div>` : ''}
      <div class="form-actions">
        <button type="button" class="btn" data-act="dialog-close">Cancel</button>
        <button type="button" class="btn primary" data-act="ax-download">${icon('download')} Download Excel</button>
      </div>`;
  };

  const redraw = () => setDialogBody(body());

  openDialog({
    title: 'Download attendance (Excel)',
    body: body(),
    handlers: {
      'ax-class': el => { model.std = el.value; model.section = 'all'; model.message = ''; redraw(); },
      'ax-section': el => { model.section = el.value; model.message = ''; redraw(); },
      'ax-period': el => {
        model.period = el.dataset.value;
        if (preset[model.period]) [model.from, model.to] = preset[model.period];
        model.message = '';
        redraw();
      },
      'ax-dates': () => {
        const box = document.getElementById('modal-body');
        const from = box.querySelector('[name=ax-from]').value;
        const to = box.querySelector('[name=ax-to]').value;
        if (from) model.from = from;
        if (to) model.to = to;
        if (model.from > model.to) [model.from, model.to] = [model.to, model.from];
        model.period = 'custom';
        model.message = '';
        redraw();
      },
      'ax-download': el => busy(el, async () => {
        const q = new URLSearchParams({ from: model.from, to: model.to, std: model.std, section: model.std === 'all' ? 'all' : model.section });
        const data = await api('GET', `/attendance/range?${q}`);
        if (!data.records.length) {
          const who = model.std === 'all' ? (isAdmin() ? 'any class' : 'your classes') : scopeText();
          model.message = `No attendance was taken for ${who} ${data.from === data.to ? `on ${fmtDate(data.from)}` : `from ${fmtDate(data.from)} to ${fmtDate(data.to)}`}. Choose other days.`;
          redraw();
          return;
        }
        const result = await downloadAttendanceRegister({
          records: data.records,
          students: state.data.students,
          from: data.from,
          to: data.to,
          schoolName: state.data.school.name,
          scopeName: scopeText()
        });
        closeDialog();
        toast(`Downloaded: ${plural(result.sections, 'class section')}, ${plural(result.days, 'day')} of attendance.`, 'good');
      }, 'Preparing...')
    }
  });
}
