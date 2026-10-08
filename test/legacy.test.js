'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoAdapter } = require('../src/store');
const { createFakeMongo } = require('./fake-mongo');
const { startServer, adminToken } = require('./helpers');

// Data exactly as the previous version of the app stored it.
const OLD_SCHOOL_DOC = {
  _id: 'glorious_public_school',
  teachers: [
    { id: 'T-1717000000000', name: 'Mrs. Ananya Sharma', mobile: '9876543210', password: 'oldpass', subjects: ['Science'], classrooms: [{ classNumber: '8', sections: ['A'] }] },
    { id: 'T-101', name: 'Demo', mobile: '9999999999', password: 'demo', classrooms: [] }
  ],
  students: [
    { id: 1, grNo: '294', roll: 1, name: 'Veer Patel', std: '8', section: 'A', mobile: '9427233487, 9429762778' },
    { id: 2, grNo: 'GR-2026-8-002', roll: 2, name: 'Diya Mehta', std: '8', section: 'A', mobile: '' },
    { id: 3, grNo: 'GR-2024-001', roll: 101, name: 'Aarav Patel', std: '9', section: 'A', mobile: '' },
    { id: 4, grNo: '310', roll: 4, name: 'Kiran Rao', std: '9', section: 'A', mobile: '9822222222' }
  ],
  marks: [
    { roll: 1, std: '8', grNo: '294', subject: 'Science', topic: 'Test 1', testSet: 'Aug Periodic Tests', marks: 23, total: 30, date: '2026-07-22', isAbsent: false },
    { roll: 1, std: '8', grNo: '294', subject: 'Science', topic: 'Test 2', testSet: 'Aug Periodic Tests', marks: 27, total: 30, date: '2026-08-05', isAbsent: false },
    { roll: 2, std: '8', subject: 'Science', topic: 'Test 1', testSet: 'Aug Periodic Tests', marks: 0, total: 30, date: '2026-07-22', isAbsent: true },
    { roll: 1, std: '8', subject: 'Mathematics', topic: 'Unit Test 1', marks: 40, total: 50, date: '2026-09-01' }
  ],
  attendance: [
    { date: '2026-10-01', std: '8', section: 'A', records: [{ roll: 1, status: 'P' }, { roll: 2, status: 'A' }] }
  ],
  upcomingTests: []
};

test('the previous version\'s cloud data is copied over once, and old teachers can still sign in', async t => {
  const fake = createFakeMongo();
  const raw = fake.raw('gps_english_medium');
  await raw.collection('school_data').insertOne(OLD_SCHOOL_DOC);
  await raw.collection('teachers_data').insertOne({
    _id: 'T-1717000000000',
    students: [{ id: 9, roll: 3, name: 'Kavya Shah', std: '8', section: 'A', mobile: '9811111111' }],
    marks: [{ roll: 3, std: '8', subject: 'Mathematics', topic: 'Unit Test 1', marks: 35, total: 50, date: '2026-09-01' }],
    attendance: []
  });

  const adapter = new MongoAdapter('mongodb://fake', 'gps_english_medium', fake.MongoClient);
  const srv = await startServer({ adapter });
  t.after(() => srv.close());

  const login = await srv.call('POST', '/api/login', { role: 'teacher', mobile: '9876543210', password: 'oldpass' });
  assert.equal(login.status, 200, 'old teacher password still works (now stored hashed)');
  const stored = await raw.collection('teachers').find({}).toArray();
  assert.equal(stored.length, 1, 'demo teacher is not copied');
  assert.equal(stored[0].password, undefined);
  assert.ok(stored[0].pwHash);

  const office = await adminToken(srv);
  const boot = (await srv.call('GET', '/api/bootstrap', undefined, office)).data;
  const names = boot.students.map(s => s.name).sort();
  assert.deepEqual(names, ['Diya Mehta', 'Kavya Shah', 'Kiran Rao', 'Veer Patel'], 'demo student skipped, per-teacher copy included');
  const veer = boot.students.find(s => s.name === 'Veer Patel');
  assert.equal(veer.roll, 1, 'no hard-coded roll number override');
  assert.equal(veer.mobile, '9427233487, 9429762778');
  assert.equal(boot.students.find(s => s.name === 'Diya Mehta').grNo, '', 'auto-generated GR numbers are dropped');

  const periodic = boot.tests.find(x => x.name === 'Aug Periodic Tests');
  assert.equal(periodic.papers.length, 2, 'two Science tests on different dates stay separate');
  assert.equal(periodic.marks[veer.id][periodic.papers[0].id], 23);
  const unit = boot.tests.find(x => x.name === 'Unit Test 1');
  assert.equal(Object.keys(unit.marks).length, 2);
  const att = await srv.call('GET', '/api/attendance?std=8&section=A&date=2026-10-01', undefined, office);
  assert.equal(Object.values(att.data.record.status).sort().join(''), 'AP');

  // Starting again must not import a second time.
  const adapter2 = new MongoAdapter('mongodb://fake', 'gps_english_medium', fake.MongoClient);
  const srv2 = await startServer({ adapter: adapter2 });
  t.after(() => srv2.close());
  const office2 = await adminToken(srv2);
  const boot2 = (await srv2.call('GET', '/api/bootstrap', undefined, office2)).data;
  assert.equal(boot2.students.length, 4);
  assert.equal(boot2.tests.length, 2);
});

test('data left in a teacher\'s browser can be copied in, only for their classes, without overwriting', async t => {
  const srv = await startServer();
  t.after(() => srv.close());
  const office = await adminToken(srv);
  await srv.call('POST', '/api/teachers', { name: 'Asha', mobile: '9000000001', password: 'teach123', classes: ['8'] }, office);
  const asha = (await srv.call('POST', '/api/login', { role: 'teacher', mobile: '9000000001', password: 'teach123' })).data.token;
  const existing = (await srv.call('POST', '/api/students', { std: '8', roll: 1, name: 'Veer Patel', mobile: '9000011111' }, asha)).data.student;

  const res = await srv.call('POST', '/api/import/legacy', {
    students: OLD_SCHOOL_DOC.students,
    marks: OLD_SCHOOL_DOC.marks,
    attendance: OLD_SCHOOL_DOC.attendance
  }, asha);
  assert.equal(res.status, 200);
  assert.equal(res.data.counts.studentsAdded, 1);
  assert.ok(res.data.counts.outsideClasses >= 1, 'class 9 data is not imported by a class 8 teacher');

  const boot = (await srv.call('GET', '/api/bootstrap', undefined, office)).data;
  assert.equal(boot.students.length, 2);
  assert.equal(boot.students.find(s => s.id === existing.id).mobile, '9000011111', 'existing details kept');

  const again = await srv.call('POST', '/api/import/legacy', { students: OLD_SCHOOL_DOC.students, marks: OLD_SCHOOL_DOC.marks }, asha);
  assert.equal(again.data.counts.studentsAdded, 0);
  assert.equal(again.data.counts.marks, 0, 'running it twice adds nothing');
});
