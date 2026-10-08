import { html, mount, busy, toast, icon, downloadBlob, confirmDialog, $ } from '../ui.js';
import { state, api, refresh, fetchFile } from '../data.js';
import { legacySummary } from '../legacy.js';

let waTimer = null;

function waCard(wa) {
  if (wa && wa.enabled === false) {
    return html`<p>WhatsApp sending is turned off on this server.</p>`;
  }
  if (wa.connected) {
    return html`<p><span class="status-dot good"></span><strong>Linked</strong>${wa.phone ? ` to +${wa.phone}` : ''}${wa.name ? ` (${wa.name})` : ''}.</p>
      <p class="muted small">Teachers can now send report cards (as PDF files) and messages in one click from the Send page. Messages go out one by one with a short pause, so a large class takes a few minutes.</p>
      <form class="test-send" data-submit="wa-test">
        <label class="field"><span>Check it works: send a sample report card PDF to</span><input name="mobile" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile number" required></label>
        <button class="btn wa" type="submit">${icon('send')} Send test PDF</button>
      </form>
      <button class="btn danger" data-act="wa-unlink">Unlink WhatsApp</button>`;
  }
  if (wa.state === 'qr' && wa.qr) {
    return html`<ol>
        <li>Open WhatsApp on the school's phone.</li>
        <li>Tap <strong>⋮ Menu</strong> (or <strong>Settings</strong> on iPhone), then <strong>Linked devices</strong>, then <strong>Link a device</strong>.</li>
        <li>Point the phone at this code.</li>
      </ol>
      <img class="qr" src="${wa.qr}" alt="WhatsApp link code">
      <p class="muted small">The code changes every few seconds; this page updates it automatically.</p>
      <button class="btn" data-act="wa-cancel">Cancel</button>`;
  }
  if (wa.state === 'connecting' || wa.state === 'qr') {
    return html`<p><span class="status-dot warn"></span>Connecting to WhatsApp...</p>`;
  }
  return html`<p><span class="status-dot bad"></span>Not linked.${wa.error ? html` <span class="muted">${wa.error}</span>` : ''}</p>
    <p class="muted small">Link the school's WhatsApp number once. Then teachers can send report cards, absence alerts and notices to all parents in one click.</p>
    <button class="btn primary" data-act="wa-link">${icon('chat')} Link school WhatsApp</button>`;
}

export default {
  async render(ctx) {
    clearInterval(waTimer);
    const school = state.data.school;
    const legacy = legacySummary();
    let wa = state.data.whatsapp;
    try { wa = await api('GET', '/whatsapp/status'); } catch { /* use cached */ }

    mount(ctx.main, html`
      <div class="page-head"><div><h1>Settings</h1></div></div>
      <div class="card">
        <h2>School WhatsApp</h2>
        <div id="wa-box">${waCard(wa)}</div>
      </div>
      <div class="card">
        <h2>School details</h2>
        <p class="card-sub">Printed at the top of every report card.</p>
        <form data-submit="save-school">
          <label class="field"><span>School name</span><input name="name" value="${school.name}" required></label>
          <label class="field"><span>Address / contact line</span><input name="address" value="${school.address || ''}"></label>
          <label class="field"><span>Website address for parent links (optional)</span><input name="publicUrl" value="${school.publicUrl || ''}" placeholder="https://your-school.onrender.com"><small>Leave empty to use the address this page was opened from.</small></label>
          <div class="form-actions"><button class="btn primary" type="submit">Save</button></div>
        </form>
      </div>
      <div class="card">
        <h2>Office password</h2>
        <p class="card-sub">Only the principal / office should know it.</p>
        <button class="btn" data-act="change-password">Change office password</button>
      </div>
      <div class="card">
        <h2>Data</h2>
        <p>Data is saved ${state.data.storage === 'mongodb' ? 'in the online MongoDB database' : 'on this server computer, in the data folder'}. Every change is saved straight away and teachers' work appears here within seconds.</p>
        <div class="row">
          <button class="btn" data-act="backup">${icon('download')} Download full backup</button>
          ${legacy.total ? html`<button class="btn" data-act="legacy-import">Copy old data from this device (${legacy.students} students, ${legacy.marks} marks)</button>` : ''}
        </div>
        ${state.data.legacyMigration ? html`<p class="muted small mt">On ${new Date(state.data.legacyMigration.at).toLocaleDateString('en-IN')}, data from the previous version of the app was copied in automatically: ${state.data.legacyMigration.teachers} teachers, ${state.data.legacyMigration.studentsAdded} students, ${state.data.legacyMigration.marks} marks and ${state.data.legacyMigration.attendanceDays} attendance days. Teachers who used the old app on their own phone or computer will see a button to copy anything that was saved only there.</p>` : ''}
      </div>
    `);

    const drawWa = s => {
      const box = $('#wa-box', ctx.main);
      if (box) mount(box, waCard(s));
    };
    const watch = () => {
      clearInterval(waTimer);
      waTimer = setInterval(async () => {
        if (!ctx.main.isConnected) { clearInterval(waTimer); return; }
        try {
          const s = await api('GET', '/whatsapp/status');
          drawWa(s);
          if (s.connected) {
            clearInterval(waTimer);
            state.data.whatsapp = s;
            toast('School WhatsApp linked.', 'good');
          } else if (s.state === 'disconnected') {
            clearInterval(waTimer);
          }
        } catch { /* keep trying */ }
      }, 2000);
    };
    if (wa.state === 'qr' || wa.state === 'connecting') watch();

    return {
      'save-school': form => busy(form.querySelector('[type=submit]'), async () => {
        const body = Object.fromEntries(new FormData(form).entries());
        await api('PUT', '/settings/school', body);
        await refresh();
        toast('Saved.', 'good');
      }, 'Saving...'),
      'wa-link': el => busy(el, async () => {
        drawWa(await api('POST', '/whatsapp/link', { fresh: false }));
        watch();
      }, 'Starting...'),
      'wa-cancel': el => busy(el, async () => {
        clearInterval(waTimer);
        drawWa(await api('POST', '/whatsapp/unlink'));
      }),
      'wa-unlink': async el => {
        if (!(await confirmDialog('Unlink WhatsApp?', 'Teachers will have to send messages from their own WhatsApp until it is linked again.', { ok: 'Unlink', danger: true }))) return;
        await busy(el, async () => {
          drawWa(await api('POST', '/whatsapp/unlink'));
          await refresh();
        });
      },
      'wa-test': form => busy(form.querySelector('[type=submit]'), async () => {
        await api('POST', '/whatsapp/test', { mobile: form.elements.mobile.value });
        toast('Sample report card sent. Check WhatsApp on that phone.', 'good');
      }, 'Sending...'),
      backup: el => busy(el, async () => {
        const { blob, fileName } = await fetchFile('/export');
        downloadBlob(blob, fileName);
      }, 'Preparing...')
    };
  }
};
