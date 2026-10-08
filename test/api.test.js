'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, adminToken } = require('./helpers');

test('office first sign-in must set a new password before changing anything', async t => {
  const srv = await startServer();
  t.after(() => srv.close());

  const wrong = await srv.call('POST', '/api/login', { role: 'admin', password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(JSON.stringify(wrong.data), /gps369/, 'error must not reveal the password');

  const first = await srv.call('POST', '/api/login', { role: 'admin', password: 'gps369' });
  assert.equal(first.status, 200);
  assert.equal(first.data.me.mustChangePassword, true);

  const blocked = await srv.call('POST', '/api/teachers', { name: 'X', mobile: '9000000001', password: 'secret1', classes: ['8'] }, first.data.token);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'CHANGE_PASSWORD');

  const changed = await srv.call('POST', '/api/me/password', { current: 'gps369', next: 'office-pass-1' }, first.data.token);
  assert.equal(changed.status, 200);
  const old = await srv.call('GET', '/api/me', undefined, first.data.token);
  assert.equal(old.status, 401, 'old token stops working after a password change');
  const relogin = await srv.call('POST', '/api/login', { role: 'admin', password: 'gps369' });
  assert.equal(relogin.status, 401);
});

test('teacher data shows up on the management dashboard and stays inside the teacher\'s classes', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);

  for (const [name, mobile, cls] of [['Asha', '9000000001', '8'], ['Bina', '9000000002', '9'], ['Chetan', '9000000003', '10']]) {
    const r = await srv.call('POST', '/api/teachers', { name, mobile, password: 'teach123', classes: [cls], subjects: ['Science'] }, office);
    assert.equal(r.status, 201);
    assert.equal(r.data.teacher.pwHash, undefined, 'password hash is never sent to the browser');
  }
  const asha = (await srv.call('POST', '/api/login', { role: 'teacher', mobile: '9000000001', password: 'teach123' })).data.token;
  const bina = (await srv.call('POST', '/api/login', { role: 'teacher', mobile: '+91 90000 00002', password: 'teach123' })).data.token;
  assert.ok(asha && bina);

  const s1 = await srv.call('POST', '/api/students', { std: '8', section: 'A', roll: 1, name: 'Riya Patel', mobile: '9876543210' }, asha);
  assert.equal(s1.status, 201);
  await srv.call('POST', '/api/students', { std: '8', section: 'A', roll: 2, name: 'Om Shah' }, asha);
  const outside = await srv.call('POST', '/api/students', { std: '9', roll: 1, name: 'Not mine' }, asha);
  assert.equal(outside.status, 403);
  const dupe = await srv.call('POST', '/api/students', { std: '8', section: 'A', roll: 1, name: 'Dup' }, asha);
  assert.equal(dupe.status, 409);

  const t1 = await srv.call('POST', '/api/tests', { std: '8', name: 'Unit Test 1', date: '2026-09-10', papers: [{ subject: 'sci', max: 25 }, { subject: 'Maths', max: 25 }] }, asha);
  assert.equal(t1.status, 201);
  assert.deepEqual(t1.data.test.papers.map(p => p.subject), ['Science', 'Mathematics']);
  const [sci, maths] = t1.data.test.papers;
  const bad = await srv.call('PATCH', `/api/tests/${t1.data.test.id}/marks`, { changes: [{ studentId: s1.data.student.id, paperId: sci.id, value: 30 }] }, asha);
  assert.equal(bad.status, 400, 'marks above the maximum are refused');
  const ok = await srv.call('PATCH', `/api/tests/${t1.data.test.id}/marks`, { changes: [
    { studentId: s1.data.student.id, paperId: sci.id, value: '22' },
    { studentId: s1.data.student.id, paperId: maths.id, value: 'ab' }
  ] }, asha);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.test.marks[s1.data.student.id], { [sci.id]: 22, [maths.id]: 'AB' });

  // "Unit Test 10" is a different test from "Unit Test 1".
  const t10 = await srv.call('POST', '/api/tests', { std: '8', name: 'Unit Test 10', date: '2026-09-20', papers: [{ subject: 'Science', max: 25 }] }, asha);
  assert.equal(t10.status, 201);
  const sameName = await srv.call('POST', '/api/tests', { std: '8', name: 'unit  test 1', date: '2026-09-20', papers: [{ subject: 'Science', max: 25 }] }, asha);
  assert.equal(sameName.status, 409);

  const att = await srv.call('PUT', '/api/attendance', { std: '8', section: 'A', date: (await srv.call('GET', '/api/bootstrap', undefined, asha)).data.today, status: { [s1.data.student.id]: 'A' } }, asha);
  assert.equal(att.status, 200);

  const mgmt = (await srv.call('GET', '/api/bootstrap', undefined, office)).data;
  assert.equal(mgmt.students.length, 2, 'office sees the students the teacher added');
  assert.equal(mgmt.tests.length, 2);
  assert.equal(mgmt.attendance.length, 1);
  assert.equal(mgmt.teachers.length, 3);
  assert.ok(mgmt.teachers.every(t => t.pwHash === undefined && t.pwSalt === undefined));

  const binaView = (await srv.call('GET', '/api/bootstrap', undefined, bina)).data;
  assert.equal(binaView.students.length, 0, 'a class 9 teacher does not see class 8');
  assert.equal(binaView.tests.length, 0);
});

test('a new teacher signing up never touches existing data and needs approval', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  await srv.call('POST', '/api/teachers', { name: 'Asha', mobile: '9000000001', password: 'teach123', classes: ['8'] }, office);
  const asha = (await srv.call('POST', '/api/login', { role: 'teacher', mobile: '9000000001', password: 'teach123' })).data.token;
  for (let r = 1; r <= 3; r += 1) await srv.call('POST', '/api/students', { std: '8', roll: r, name: `Kid ${r}` }, asha);

  const signup = await srv.call('POST', '/api/signup', { name: 'Dev', mobile: '9000000005', password: 'devpass', classes: ['5'] });
  assert.equal(signup.status, 201);
  const takeover = await srv.call('POST', '/api/signup', { name: 'Evil', mobile: '9000000001', password: 'hijack1', classes: ['8'] });
  assert.equal(takeover.status, 409, 'cannot take over an existing teacher by signing up with their number');
  const pending = await srv.call('POST', '/api/login', { role: 'teacher', mobile: '9000000005', password: 'devpass' });
  assert.equal(pending.status, 403);

  const mgmt = (await srv.call('GET', '/api/bootstrap', undefined, office)).data;
  assert.equal(mgmt.students.length, 3, 'school data is untouched');
  const dev = mgmt.teachers.find(x => x.mobile === '9000000005');
  assert.equal(dev.status, 'pending');
  await srv.call('PUT', `/api/teachers/${dev.id}`, { status: 'active' }, office);
  const approved = await srv.call('POST', '/api/login', { role: 'teacher', mobile: '9000000005', password: 'devpass' });
  assert.equal(approved.status, 200);
});

test('Excel marks upload in the school\'s date-column format', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  await srv.call('POST', '/api/students', { std: '10', roll: 1, name: 'AARY PRAKASHBHAI TABIYAD' }, office);

  const payload = {
    std: '10',
    name: 'Aug Periodic Tests',
    date: '2026-08-14',
    papers: [
      { subject: 'Science', max: 30, date: '2026-07-22' },
      { subject: 'Science', max: 30, date: '2026-08-05' },
      { subject: 'English', max: 30, date: '2026-08-14', topic: 'poem' }
    ],
    rows: [
      { line: 5, roll: 1, name: 'AARY PRAKASHBHAI TABIYAD', values: [23, 27, 'ab'] },
      { line: 6, roll: 2, name: 'AARYARAJE BHANUBHAI PATEL', values: [30, 29, 29] },
      { line: 7, roll: 3, name: 'ABHIRA SISODIYA', values: [14, 'x', 9] }
    ],
    dryRun: true
  };
  const preview = await srv.call('POST', '/api/tests/import', payload, office);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.test.isNew, true);
  assert.equal(preview.data.newStudents.length, 2);
  assert.equal(preview.data.invalid.length, 1);
  assert.equal(preview.data.invalid[0].line, 7);

  const refused = await srv.call('POST', '/api/tests/import', { ...payload, dryRun: false }, office);
  assert.equal(refused.status, 400, 'nothing is saved while the file has invalid marks');
  assert.equal((await srv.call('GET', '/api/bootstrap', undefined, office)).data.tests.length, 0);

  payload.rows[2].values[1] = 11;
  const saved = await srv.call('POST', '/api/tests/import', { ...payload, dryRun: false }, office);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.marks, 9);
  const boot = (await srv.call('GET', '/api/bootstrap', undefined, office)).data;
  assert.equal(boot.students.length, 3);
  const testRec = boot.tests[0];
  assert.equal(testRec.papers.length, 3);
  assert.equal(testRec.date, '2026-07-22');

  // Uploading the same sheet again updates the same test instead of creating another.
  payload.rows[0].values = [24, 27, 20];
  const again = await srv.call('POST', '/api/tests/import', { ...payload, dryRun: true }, office);
  assert.equal(again.data.test.isNew, false);
  assert.equal(again.data.overwrites, 2);
});

test('Excel marks follow the roll number; a different name is pointed out', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  await srv.call('POST', '/api/students', { std: '10', roll: 1, name: 'Asha Kumar' }, office);
  await srv.call('POST', '/api/students', { std: '10', roll: 2, name: 'Bina Rajeshbhai Shah' }, office);
  await srv.call('POST', '/api/students', { std: '10', roll: 3, name: 'Chirag Dave' }, office);
  const res = await srv.call('POST', '/api/tests/import', {
    std: '10',
    name: 'Common test',
    papers: [{ subject: 'Mathematics', max: 25, date: '2026-07-13' }],
    rows: [
      { line: 5, roll: 1, name: 'ASHA KUMAR', values: [16] },
      { line: 6, roll: 2, name: 'BINA R. SHAH', values: [14] },
      { line: 7, roll: 3, name: 'KIRAN DAVE', values: [9] },
      { line: 8, roll: 4, name: 'DEV MEHTA', values: [20] }
    ],
    addMissingStudents: true,
    dryRun: false
  }, office);
  assert.equal(res.status, 200);
  assert.equal(res.data.marks, 4);
  assert.deepEqual(res.data.newStudents.map(s => s.name), ['DEV MEHTA']);
  assert.equal(res.data.unmatched.length, 0);
  assert.deepEqual(res.data.nameMismatches.map(x => [x.roll, x.listName, x.fileName]), [[3, 'Chirag Dave', 'KIRAN DAVE']], 'initials are not reported');
  const boot = (await srv.call('GET', '/api/bootstrap', undefined, office)).data;
  const pid = boot.tests[0].papers[0].id;
  const mark = roll => boot.tests[0].marks[boot.students.find(s => s.roll === roll).id][pid];
  assert.deepEqual([1, 2, 3, 4].map(mark), [16, 14, 9, 20]);
});

test('student list upload adds, updates and reports problems', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  await srv.call('POST', '/api/students', { std: '7', section: 'A', roll: 1, name: 'Old Name', grNo: '501' }, office);
  const rows = [
    { line: 2, roll: 1, name: 'New Name', grNo: '501', section: 'A', mobile: '98765 43210' },
    { line: 3, roll: 1, name: 'Second Section Kid', section: 'B', mobile: '9876543211, 9876543212' },
    { line: 4, roll: 2, name: '', section: 'A' },
    { line: 5, roll: 1, name: 'Clash', section: 'A', grNo: '777' }
  ];
  const preview = await srv.call('POST', '/api/students/import', { std: '7', rows, dryRun: true }, office);
  assert.equal(preview.data.added, 1);
  assert.equal(preview.data.updated, 1);
  assert.equal(preview.data.errors.length, 2);
  const saved = await srv.call('POST', '/api/students/import', { std: '7', rows }, office);
  assert.equal(saved.status, 200);
  const students = (await srv.call('GET', '/api/bootstrap', undefined, office)).data.students;
  assert.equal(students.length, 2);
  assert.equal(students.find(s => s.section === 'A').name, 'New Name');
  assert.equal(students.find(s => s.section === 'B').mobile, '9876543211, 9876543212');
});

test('sections are kept apart in marks and report cards', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  const a = (await srv.call('POST', '/api/students', { std: '8', section: 'A', roll: 5, name: 'A Five', mobile: '9876500001' }, office)).data.student;
  const b = (await srv.call('POST', '/api/students', { std: '8', section: 'B', roll: 5, name: 'B Five', mobile: '9876500002' }, office)).data.student;
  const testRec = (await srv.call('POST', '/api/tests', { std: '8', name: 'UT1', date: '2026-09-01', papers: [{ subject: 'Science', max: 50 }] }, office)).data.test;
  const pid = testRec.papers[0].id;
  await srv.call('PATCH', `/api/tests/${testRec.id}/marks`, { changes: [{ studentId: a.id, paperId: pid, value: 40 }, { studentId: b.id, paperId: pid, value: 12 }] }, office);

  const keyB = (await srv.call('POST', '/api/parent/login', { std: '8', roll: 5, mobile: '9876500002' })).data.key;
  const parentB = (await srv.call('GET', `/api/parent/${keyB}`)).data;
  assert.equal(parentB.student.name, 'B Five');
  assert.equal(parentB.overall.rows.length, 1);
  assert.equal(parentB.overall.rows[0].marks, 12);

  const pdf = await srv.call('GET', `/api/parent/${keyB}/report.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');

  const wrongMobile = await srv.call('POST', '/api/parent/login', { std: '8', roll: 5, mobile: '9999999999' });
  assert.equal(wrongMobile.status, 404);
  const badKey = await srv.call('GET', '/api/parent/AAAAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(badKey.status, 404);

  const classPdf = await srv.call('GET', `/api/report-cards.pdf?std=8&tests=${testRec.id}`, undefined, office);
  assert.equal(classPdf.status, 200);
  assert.equal(classPdf.data.subarray(0, 4).toString(), '%PDF');
});

test('messages: preview fills in details, sending needs the school WhatsApp, and only goes to saved numbers', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  const s = (await srv.call('POST', '/api/students', { std: '6', roll: 3, name: 'Meera Joshi', mobile: '9876543210, 9876543299' }, office)).data.student;
  const nomobile = (await srv.call('POST', '/api/students', { std: '6', roll: 4, name: 'No Phone' }, office)).data.student;

  const preview = await srv.call('POST', '/api/messages/preview', { studentIds: [s.id], text: 'Dear parent, {name} of Class {class} was absent on {date}.', date: '2026-10-08' }, office);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.items[0].text, 'Dear parent, Meera Joshi of Class 6-A was absent on 08/10/2026.');
  assert.deepEqual(preview.data.items[0].numbers, ['9876543210', '9876543299']);

  const notLinked = await srv.call('POST', '/api/messages/send', { studentIds: [s.id], text: 'Hi' }, office);
  assert.equal(notLinked.status, 409);
  assert.equal(notLinked.data.code, 'WA_NOT_LINKED');

  const sent = [];
  srv.whatsapp.useTestSocket({
    onWhatsApp: async jid => [{ exists: true, jid }],
    sendMessage: async (jid, content) => { sent.push({ jid, kind: content.document ? 'pdf' : 'text', text: content.text || content.caption }); }
  });
  const job = await srv.call('POST', '/api/messages/send', { studentIds: [s.id, nomobile.id], text: 'Report card of {name}', attachReport: false }, office);
  assert.equal(job.status, 202);
  let state;
  for (let i = 0; i < 50; i += 1) {
    state = (await srv.call('GET', `/api/messages/jobs/${job.data.job.id}`, undefined, office)).data.job;
    if (state.finished) break;
    await new Promise(r => setTimeout(r, 20));
  }
  assert.equal(state.sent, 1);
  assert.equal(state.skipped, 1);
  assert.deepEqual(sent.map(m => m.jid), ['919876543210@s.whatsapp.net', '919876543299@s.whatsapp.net']);
  assert.equal(sent[0].text, 'Report card of Meera Joshi');
});

test('only browser files are served — never data, settings or WhatsApp login files', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  fs.mkdirSync(path.join(srv.dataDir, 'whatsapp_auth'), { recursive: true });
  for (const url of ['/server.js', '/package.json', '/mongodb_config.json', '/data/school-data.json', '/whatsapp_auth/creds.json', '/src/api.js', '/.env']) {
    const res = await srv.call('GET', url);
    assert.equal(res.status, 404, `${url} must not be served`);
  }
  const home = await srv.call('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  const cors = await fetch(`${srv.base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(cors.headers.get('access-control-allow-origin'), null);
  const noAuth = await srv.call('GET', '/api/bootstrap');
  assert.equal(noAuth.status, 401);
});

test('data survives a restart', async t => {
  const srv = await startServer();
  const office = await adminToken(srv);
  await srv.call('POST', '/api/students', { std: '4', roll: 1, name: 'Persisted Kid' }, office);
  await srv.close();
  const again = await startServer({ dataDir: srv.dataDir });
  t.after(() => again.close());
  const token = await adminToken(again);
  const boot = (await again.call('GET', '/api/bootstrap', undefined, token)).data;
  assert.equal(boot.students.length, 1);
  assert.equal(boot.students[0].name, 'Persisted Kid');
});

test('report cards reach parents: a PDF link when WhatsApp is not linked, the PDF itself when it is', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  await srv.call('PUT', '/api/settings/school', { name: 'Glorious Public School', address: 'Himatnagar', publicUrl: 'https://school.example' }, office);
  const s = (await srv.call('POST', '/api/students', { std: '5', roll: 1, name: 'Nia Shah', mobile: '9876543210' }, office)).data.student;
  const testRec = (await srv.call('POST', '/api/tests', { std: '5', name: 'UT1', date: '2026-09-01', papers: [{ subject: 'English', max: 20 }] }, office)).data.test;
  await srv.call('PATCH', `/api/tests/${testRec.id}/marks`, { changes: [{ studentId: s.id, paperId: testRec.papers[0].id, value: 17 }] }, office);
  const body = { studentIds: [s.id], text: 'Report card of {name}: {percent}', testIds: [testRec.id], attachReport: true };

  // Not linked: the message carries a link that opens the PDF without signing in.
  const preview = (await srv.call('POST', '/api/messages/preview', body, office)).data.items[0];
  assert.match(preview.text, /^Report card of Nia Shah: 85%\n\nReport card \(PDF\): https:\/\/school\.example\/api\/parent\/[\w-]+\/report\.pdf\?test=/);
  const viaLink = await srv.call('GET', preview.pdfPath);
  assert.equal(viaLink.status, 200);
  assert.equal(viaLink.data.subarray(0, 4).toString(), '%PDF');

  // Linked: the PDF is attached and the caption has no link.
  const sent = [];
  let failDocuments = false;
  srv.whatsapp.useTestSocket({
    onWhatsApp: async jid => [{ exists: true, jid }],
    sendMessage: async (jid, content) => {
      if (content.document && failDocuments) throw new Error('Media upload failed');
      sent.push(content);
    }
  });
  const linkedPreview = (await srv.call('POST', '/api/messages/preview', body, office)).data.items[0];
  assert.equal(linkedPreview.text, 'Report card of Nia Shah: 85%');
  const waitJob = async id => {
    for (let i = 0; i < 100; i += 1) {
      const job = (await srv.call('GET', `/api/messages/jobs/${id}`, undefined, office)).data.job;
      if (job.finished) return job;
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error('job did not finish');
  };
  let job = await waitJob((await srv.call('POST', '/api/messages/send', body, office)).data.job.id);
  assert.equal(job.sent, 1);
  assert.equal(sent[0].mimetype, 'application/pdf');
  assert.equal(sent[0].document.subarray(0, 4).toString(), '%PDF');
  assert.equal(sent[0].caption, 'Report card of Nia Shah: 85%');

  // If WhatsApp refuses the file, the parent still gets the report card as a link.
  failDocuments = true;
  job = await waitJob((await srv.call('POST', '/api/messages/send', body, office)).data.job.id);
  assert.equal(job.sent, 1);
  assert.match(job.items[0].note, /download link/);
  assert.match(sent[1].text, /Report card \(PDF\): https:\/\/school\.example\/api\/parent\//);

  // Office test message.
  failDocuments = false;
  const testSend = await srv.call('POST', '/api/whatsapp/test', { mobile: '9000000009' }, office);
  assert.equal(testSend.status, 200);
  assert.equal(sent[sent.length - 1].fileName, 'Sample_Report_Card.pdf');
});

test('AI insights for a student', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  const kid = (await srv.call('POST', '/api/students', { std: '6', roll: 1, name: 'Ravi Kumar' }, office)).data.student;
  const peer = (await srv.call('POST', '/api/students', { std: '6', roll: 2, name: 'Peer' }, office)).data.student;
  const t1 = (await srv.call('POST', '/api/tests', { std: '6', name: 'UT1', date: '2026-07-01', papers: [{ subject: 'Maths', max: 50 }, { subject: 'English', max: 50 }] }, office)).data.test;
  const t2 = (await srv.call('POST', '/api/tests', { std: '6', name: 'UT2', date: '2026-08-01', papers: [{ subject: 'Maths', max: 50 }, { subject: 'English', max: 50 }] }, office)).data.test;
  const marks = (tt, a, b, c, d) => srv.call('PATCH', `/api/tests/${tt.id}/marks`, { changes: [
    { studentId: kid.id, paperId: tt.papers[0].id, value: a }, { studentId: kid.id, paperId: tt.papers[1].id, value: b },
    { studentId: peer.id, paperId: tt.papers[0].id, value: c }, { studentId: peer.id, paperId: tt.papers[1].id, value: d }
  ] }, office);
  await marks(t1, 20, 30, 40, 40);
  await marks(t2, 45, 40, 30, 30);
  const res = await srv.call('GET', `/api/students/${kid.id}/insights`, undefined, office);
  assert.equal(res.status, 200);
  const ins = res.data;
  assert.equal(ins.tier, 'steady');
  assert.deepEqual(ins.timeline.map(x => [x.name, x.pct, x.classAvg]), [['UT1', 50, 65], ['UT2', 85, 72.5]]);
  assert.equal(ins.notes[0].kind, 'up');
  assert.equal(ins.topSubject.subject, 'English');
  assert.equal(ins.focusSubject.subject, 'Mathematics');
});
