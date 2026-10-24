import { html, chips, icon, openDialog, closeDialog, downloadBlob, toast } from '../ui.js';
import { state, selection, select, sections, classesForUser, fetchFile } from '../data.js';
import { shouldOfferLegacy, legacySummary } from '../legacy.js';

// Class chips (and section chips when a class has more than one section).
// sectionMode: 'all' allows "All sections"; 'one' needs a single section.
export function classPicker({ sectionMode = 'all' } = {}) {
  const classes = classesForUser();
  const sel = currentSelection(sectionMode);
  if (!classes.length) {
    return html`<div class="banner warn">No classes are assigned to you yet. Please ask the office to add your classes.</div>`;
  }
  const secs = sections(sel.std);
  const secOptions = secs.map(s => ({ value: s, label: s }));
  if (sectionMode === 'all' && secs.length > 1) secOptions.unshift({ value: 'all', label: 'All' });
  return html`<div class="picker">
    ${chips('pick-class', classes.map(c => ({ value: c, label: `Class ${c}` })), sel.std, { label: classes.length > 1 ? 'Class' : '' })}
    ${secs.length > 1 ? chips('pick-section', secOptions, sel.section, { small: true, label: 'Section' }) : ''}
  </div>`;
}

export function currentSelection(sectionMode = 'all') {
  const sel = selection();
  if (sectionMode === 'one' && sel.section === 'all') sel.section = sections(sel.std)[0];
  return sel;
}

export function pickerHandlers(ctx) {
  return {
    'pick-class': el => {
      const std = el.dataset.value;
      const secs = sections(std);
      select(std, secs.length > 1 ? 'all' : secs[0]);
      ctx.rerender();
    },
    'pick-section': el => {
      select(selection().std, el.dataset.value);
      ctx.rerender();
    }
  };
}

export function legacyBanner() {
  if (!shouldOfferLegacy()) return '';
  const s = legacySummary();
  return html`<div class="banner warn">
    <span class="grow"><strong>Data from the old app was found on this device</strong> (${s.students} students, ${s.marks} marks, ${s.attendance} attendance days). Copy it to the school database so everyone can see it. Nothing already saved will be overwritten.</span>
    <button class="btn primary small" data-act="legacy-import">Copy it now</button>
    <button class="btn ghost small" data-act="legacy-dismiss">Hide</button>
  </div>`;
}

export function empty(title, text, actions = '') {
  return html`<div class="card empty"><h3>${title}</h3><p>${text}</p>${actions ? html`<div class="row center">${actions}</div>` : ''}</div>`;
}

export function whatsappLine() {
  const wa = state.data.whatsapp;
  if (wa.connected) return html`<span><span class="status-dot good"></span>School WhatsApp is linked${wa.phone ? ` (+${wa.phone})` : ''}. Messages go out automatically.</span>`;
  return html`<span><span class="status-dot warn"></span>School WhatsApp is not linked. You can still send each message from your own WhatsApp.</span>`;
}

export function downloadReportCards(params, endpoint = '/report-cards.pdf') {
  return new Promise(resolve => {
    let settled = false;
    let accepted = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    openDialog({
      title: 'Download report cards',
      body: html`<form data-submit="report-pdf-options">
        <label class="field"><span>Report card template</span>
          <select name="template">
            <option value="modern">Current template</option>
            <option value="result-card">Progress Report / Result Card</option>
          </select>
        </label>
        <label class="field"><span>Text above Academic Session</span>
          <input name="heading" placeholder="e.g. FIRST PRELIMS RESULT" maxlength="100">
          <small>Enter a custom heading when you choose the Progress Report / Result Card template.</small>
        </label>
        <div class="form-actions">
          <button type="button" class="btn" data-act="dialog-close">Cancel</button>
          <button type="submit" class="btn primary">Download PDF</button>
        </div>
      </form>`,
      handlers: {
        'report-pdf-options': async form => {
          const fields = new FormData(form);
          const template = fields.get('template');
          const heading = String(fields.get('heading') || '').trim();
          if (template === 'result-card' && !heading) {
            toast('Enter the text to show above Academic Session.', 'bad');
            return;
          }
          accepted = true;
          closeDialog();
          try {
            const query = new URLSearchParams(params);
            query.set('template', template);
            if (template === 'result-card') query.set('heading', heading);
            const { blob, fileName } = await fetchFile(`${endpoint}?${query}`);
            downloadBlob(blob, fileName);
            finish(true);
          } catch (error) {
            toast(error.message || 'Could not prepare that report card.', 'bad');
            finish(false);
          }
        }
      },
      onClose: () => { if (!accepted) finish(false); }
    });
  });
}

export function backLink(href, label) {
  return html`<a class="btn ghost small" href="${href}">${icon('back')} ${label}</a>`;
}
