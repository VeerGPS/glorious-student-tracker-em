import { html, mount, icon, fmtDate, greeting, plural } from '../ui.js';
import { state, students, sections, tests, testProgress, attendanceFor, select, classesForUser } from '../data.js';
import { legacyBanner } from './common.js';

function classCard(std, section) {
  const kids = students(std, section);
  const today = state.data.today;
  const rec = attendanceFor(std, section, today);
  const absent = rec ? Object.values(rec.status).filter(s => s === 'A').length : 0;
  const latest = tests(std)[0];
  const prog = latest ? testProgress(latest, section) : null;
  return html`<div class="card">
    <div class="row between">
      <h2>Class ${std}-${section}</h2>
      <span class="badge">${plural(kids.length, 'student')}</span>
    </div>
    <ul class="list">
      <li>
        <div class="main">
          <div class="title">Attendance today</div>
          <div class="sub">${!kids.length ? 'Add students first' : rec ? `Done · ${kids.length - absent} present, ${absent} absent` : 'Not taken yet'}</div>
        </div>
        ${kids.length ? html`<button class="btn small ${rec ? '' : 'primary'}" data-act="open" data-href="#/attendance" data-std="${std}" data-section="${section}">${rec ? 'View' : 'Take now'}</button>` : ''}
      </li>
      <li>
        <div class="main">
          <div class="title">${latest ? latest.name : 'Marks'}</div>
          <div class="sub">${latest ? `${fmtDate(latest.date)} · ${prog.filled} of ${prog.expected} marks entered` : 'No tests yet'}</div>
        </div>
        <button class="btn small" data-act="open" data-href="${latest ? `#/marks/${latest.id}` : '#/marks'}" data-std="${std}" data-section="${section}">${latest ? 'Open' : 'Add a test'}</button>
      </li>
    </ul>
  </div>`;
}

export default {
  render(ctx) {
    const me = state.me;
    const classes = classesForUser();
    const cards = [];
    classes.forEach(std => sections(std).forEach(sec => cards.push(classCard(std, sec))));
    const noStudents = !state.data.students.length;

    mount(ctx.main, html`
      ${legacyBanner()}
      <div class="page-head">
        <div>
          <h1>${greeting()}, ${me.name.split(' ')[0]}</h1>
          <p>${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>
      ${noStudents ? html`<div class="banner">
        <span class="grow"><strong>Start here:</strong> add your students. Upload your class list from Excel, or add them one by one.</span>
        <a class="btn primary small" href="#/students">${icon('users')} Add students</a>
      </div>` : ''}
      <div class="grid-2">
        <a class="btn big" href="#/attendance">${icon('check')} Take attendance</a>
        <a class="btn big" href="#/marks">${icon('pen')} Enter marks</a>
        <a class="btn big" href="#/students">${icon('users')} Students</a>
        <a class="btn big" href="#/send">${icon('send')} Send to parents</a>
      </div>
      <div class="section">
        <h2>My classes</h2>
        ${cards.length ? html`<div class="grid-2">${cards}</div>` : html`<div class="card empty"><p>No classes are assigned to you yet. Ask the office to add your classes.</p></div>`}
      </div>
    `);

    return {
      open: el => {
        select(el.dataset.std, el.dataset.section);
        ctx.navigate(el.dataset.href);
      }
    };
  }
};
