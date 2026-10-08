import { html, mount, busy, toast, icon } from '../ui.js';
import { api } from '../data.js';

const CLASSES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function screen(main, inner) {
  mount(main, html`<div class="login">
    <div class="logo">
      <div class="logo-badge">${icon('school')}</div>
      <h1>Glorious Public School</h1>
      <p class="muted">Student Tracker</p>
    </div>
    ${inner}
  </div>`);
  const first = main.querySelector('input, select');
  if (first) first.focus();
}

export default {
  render(ctx) {
    const { main } = ctx;

    const showChoice = () => screen(main, html`<div class="card">
      <h2>Who are you?</h2>
      <div class="role-list">
        <button class="btn big m-home" data-act="role" data-role="teacher">${icon('teacher')}<span>Teacher<small>Attendance, marks and messages for your classes</small></span></button>
        <button class="btn big m-attendance" data-act="role" data-role="admin">${icon('chart')}<span>Principal / Office<small>The whole school</small></span></button>
        <button class="btn big m-send" data-act="role" data-role="parent">${icon('users')}<span>Parent<small>See your child's marks and report card</small></span></button>
      </div>
    </div>`);

    const showTeacher = () => screen(main, html`<div class="card">
      <h2>Teacher sign in</h2>
      <form data-submit="teacher-login">
        <label class="field"><span>Mobile number</span><input name="mobile" type="tel" inputmode="numeric" autocomplete="username" placeholder="10-digit mobile number" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary block" type="submit">Sign in</button>
      </form>
      <p class="small muted" style="margin-top:12px">Forgot your password? Ask the office to set a new one.</p>
      <div class="row between">
        <button class="btn ghost small" data-act="role" data-role="">${icon('back')} Back</button>
        <button class="btn ghost small" data-act="role" data-role="signup">New teacher? Ask for an account</button>
      </div>
    </div>`);

    const showAdmin = () => screen(main, html`<div class="card">
      <h2>Principal / Office sign in</h2>
      <form data-submit="admin-login">
        <label class="field"><span>Office password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary block" type="submit">Sign in</button>
      </form>
      <div class="row" style="margin-top:12px"><button class="btn ghost small" data-act="role" data-role="">${icon('back')} Back</button></div>
    </div>`);

    const showParent = () => screen(main, html`<div class="card">
      <h2>Parent</h2>
      <p class="muted">Enter your child's class and roll number, and the mobile number you gave to the school.</p>
      <form data-submit="parent-login">
        <div class="inline-fields">
          <label class="field"><span>Class</span><select name="std" required><option value="">Choose</option>${CLASSES.map(c => html`<option value="${c}">Class ${c}</option>`)}</select></label>
          <label class="field"><span>Roll number</span><input name="roll" type="number" inputmode="numeric" min="1" required></label>
        </div>
        <label class="field"><span>Your mobile number</span><input name="mobile" type="tel" inputmode="numeric" placeholder="10-digit mobile number" required></label>
        <button class="btn primary block" type="submit">See report</button>
      </form>
      <div class="row" style="margin-top:12px"><button class="btn ghost small" data-act="role" data-role="">${icon('back')} Back</button></div>
    </div>`);

    const showSignup = () => screen(main, html`<div class="card">
      <h2>Ask for a teacher account</h2>
      <p class="muted">The office will approve your account. After that, sign in with your mobile number and this password.</p>
      <form data-submit="signup">
        <label class="field"><span>Your full name</span><input name="name" autocomplete="name" required></label>
        <label class="field"><span>Mobile number</span><input name="mobile" type="tel" inputmode="numeric" required></label>
        <label class="field"><span>Choose a password</span><input name="password" type="password" minlength="6" autocomplete="new-password" required><small>At least 6 characters.</small></label>
        <div class="field"><span><strong>Classes you teach</strong></span>
          <div class="check-grid">${CLASSES.slice(0, 10).map(c => html`<label><input type="checkbox" name="classes" value="${c}"> ${c}</label>`)}</div>
        </div>
        <label class="field"><span>Subjects you teach (optional)</span><input name="subjects" placeholder="For example: Science, Maths"></label>
        <button class="btn primary block" type="submit">Send request</button>
      </form>
      <div class="row" style="margin-top:12px"><button class="btn ghost small" data-act="role" data-role="teacher">${icon('back')} Back</button></div>
    </div>`);

    showChoice();

    const submitBtn = form => form.querySelector('button[type=submit]');

    return {
      role: el => {
        const r = el.dataset.role;
        if (r === 'teacher') showTeacher();
        else if (r === 'admin') showAdmin();
        else if (r === 'parent') showParent();
        else if (r === 'signup') showSignup();
        else showChoice();
      },
      'teacher-login': form => busy(submitBtn(form), async () => {
        const f = new FormData(form);
        const res = await api('POST', '/login', { role: 'teacher', mobile: f.get('mobile'), password: f.get('password') });
        await ctx.onTeacherOrOffice(res.token, res.me);
      }, 'Signing in...'),
      'admin-login': form => busy(submitBtn(form), async () => {
        const f = new FormData(form);
        const res = await api('POST', '/login', { role: 'admin', password: f.get('password') });
        await ctx.onTeacherOrOffice(res.token, res.me);
      }, 'Signing in...'),
      'parent-login': form => busy(submitBtn(form), async () => {
        const f = new FormData(form);
        const res = await api('POST', '/parent/login', { std: f.get('std'), roll: f.get('roll'), mobile: f.get('mobile') });
        ctx.onParent(res.key);
      }, 'Opening...'),
      signup: form => busy(submitBtn(form), async () => {
        const f = new FormData(form);
        const classes = f.getAll('classes');
        if (!classes.length) { toast('Tick the classes you teach.', 'bad'); return; }
        await api('POST', '/signup', {
          name: f.get('name'),
          mobile: f.get('mobile'),
          password: f.get('password'),
          classes,
          subjects: String(f.get('subjects') || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean)
        });
        screen(main, html`<div class="card">
          <h2>Request sent</h2>
          <p>The office will approve your account. After that, sign in with your mobile number and password.</p>
          <button class="btn primary block" data-act="role" data-role="teacher">Go to sign in</button>
        </div>`);
      }, 'Sending...')
    };
  }
};
