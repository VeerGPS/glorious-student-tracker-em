/**
 * Glorious Public School Student Tracker - Data Management Layer
 * Handles LocalStorage persistence, seed data, and schema helpers.
 */

const STORAGE_KEYS = {
  TEACHERS: 'gps_em_teachers_v1',
  STUDENTS: 'gps_em_students_v1',
  MARKS: 'gps_em_marks_v1',
  ATTENDANCE: 'gps_em_attendance_v1',
  UPCOMING_TESTS: 'gps_em_upcoming_tests_v1',
  TEST_SETS: 'gps_em_test_sets_v1',
  ACTIVE_SESSION: 'gps_em_active_session_v1'
};

// Clean Zero-Seed Configuration for Glorious Public School (EM)
const SEED_TEACHERS = [];
const SEED_STUDENTS = [];
const SEED_MARKS = [];
const SEED_UPCOMING_TESTS = [];
const SEED_ATTENDANCE = [];

// App Global In-Memory Store
let DB = {
  teachers: [],
  students: [],
  marks: [],
  attendance: [],
  upcomingTests: [],
  testSets: [],
  activeSession: null
};

// -------------------------------------------------------------
// TEACHER ACCOUNT DATA ISOLATION HELPERS
// -------------------------------------------------------------

function getTeacherAssignedClasses() {
  const teacher = (DB.activeSession && DB.activeSession.teacher) ? DB.activeSession.teacher : null;
  if (teacher && teacher.classrooms && Array.isArray(teacher.classrooms) && teacher.classrooms.length > 0) {
    const classes = teacher.classrooms.map(c => String(c.classNumber || c)).filter(Boolean);
    return [...new Set(classes)].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  }
  const stuClasses = [...new Set(DB.students.map(s => String(s.std)))].filter(Boolean);
  if (stuClasses.length > 0) {
    return stuClasses.sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  }
  return ['8', '9', '10'];
}

function getActiveTeacherId() {
  if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
    return DB.activeSession.teacher.id;
  }
  return null;
}

// Retrieve the added teacher account created by the user (or fallback to first teacher)
function getAddedTeacherAccount() {
  if (!DB.teachers || DB.teachers.length === 0) return null;
  const custom = DB.teachers.filter(t => t.id !== 'T-101' && t.id !== 'T-102' && t.id !== 'T-999999');
  if (custom.length > 0) return custom[custom.length - 1];
  return DB.teachers[0] || null;
}

function getTeacherStorageKey(teacherId, moduleKey) {
  return `gps_t_${teacherId}_${moduleKey}`;
}

function saveTeacherData(teacherId) {
  if (!teacherId) return;
  try {
    localStorage.setItem(getTeacherStorageKey(teacherId, 'students'), JSON.stringify(DB.students));
    localStorage.setItem(getTeacherStorageKey(teacherId, 'marks'), JSON.stringify(DB.marks));
    localStorage.setItem(getTeacherStorageKey(teacherId, 'attendance'), JSON.stringify(DB.attendance));
    localStorage.setItem(getTeacherStorageKey(teacherId, 'upcoming_tests'), JSON.stringify(DB.upcomingTests));
    localStorage.setItem(getTeacherStorageKey(teacherId, 'test_sets'), JSON.stringify(DB.testSets || []));
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
      CloudDB.syncToCloud(teacherId);
    }
  } catch (err) {
    console.error('Error saving teacher data:', err);
  }
}

// Consolidate full school-wide dataset across global storage and all faculty accounts
function loadManagementSchoolData() {
  let allStudents = [];
  let allMarks = [];
  let allAttendance = [];
  let allTestSets = [];
  let allUpcomingTests = [];

  // 1. Read global storage keys first
  try {
    const rawGlobalStu = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (rawGlobalStu) {
      const parsed = JSON.parse(rawGlobalStu);
      if (Array.isArray(parsed)) allStudents.push(...parsed);
    }
    const rawGlobalMks = localStorage.getItem(STORAGE_KEYS.MARKS);
    if (rawGlobalMks) {
      const parsed = JSON.parse(rawGlobalMks);
      if (Array.isArray(parsed)) allMarks.push(...parsed);
    }
    const rawGlobalAtt = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (rawGlobalAtt) {
      const parsed = JSON.parse(rawGlobalAtt);
      if (Array.isArray(parsed)) allAttendance.push(...parsed);
    }
    const rawGlobalSets = localStorage.getItem(STORAGE_KEYS.TEST_SETS);
    if (rawGlobalSets) {
      const parsed = JSON.parse(rawGlobalSets);
      if (Array.isArray(parsed)) allTestSets.push(...parsed);
    }
    const rawGlobalUpc = localStorage.getItem(STORAGE_KEYS.UPCOMING_TESTS);
    if (rawGlobalUpc) {
      const parsed = JSON.parse(rawGlobalUpc);
      if (Array.isArray(parsed)) allUpcomingTests.push(...parsed);
    }
  } catch (e) {
    console.warn('Error reading global storage:', e);
  }

  // 2. Scan every registered teacher in DB.teachers
  if (Array.isArray(DB.teachers)) {
    DB.teachers.forEach(t => {
      if (!t || !t.id) return;
      try {
        const tStu = localStorage.getItem(getTeacherStorageKey(t.id, 'students'));
        if (tStu) {
          const parsed = JSON.parse(tStu);
          if (Array.isArray(parsed)) allStudents.push(...parsed);
        }
        const tMks = localStorage.getItem(getTeacherStorageKey(t.id, 'marks'));
        if (tMks) {
          const parsed = JSON.parse(tMks);
          if (Array.isArray(parsed)) allMarks.push(...parsed);
        }
        const tAtt = localStorage.getItem(getTeacherStorageKey(t.id, 'attendance'));
        if (tAtt) {
          const parsed = JSON.parse(tAtt);
          if (Array.isArray(parsed)) allAttendance.push(...parsed);
        }
        const tSets = localStorage.getItem(getTeacherStorageKey(t.id, 'test_sets'));
        if (tSets) {
          const parsed = JSON.parse(tSets);
          if (Array.isArray(parsed)) allTestSets.push(...parsed);
        }
        const tUpc = localStorage.getItem(getTeacherStorageKey(t.id, 'upcoming_tests'));
        if (tUpc) {
          const parsed = JSON.parse(tUpc);
          if (Array.isArray(parsed)) allUpcomingTests.push(...parsed);
        }
      } catch (e) {}
    });
  }

  // 3. Scan ALL localStorage keys matching gps_t_* to rescue any orphan or legacy teacher uploads
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('gps_t_') && key.endsWith('_students')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) allStudents.push(...parsed);
          }
        } catch (e) {}
      } else if (key.startsWith('gps_t_') && key.endsWith('_marks')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) allMarks.push(...parsed);
          }
        } catch (e) {}
      } else if (key.startsWith('gps_t_') && key.endsWith('_attendance')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) allAttendance.push(...parsed);
          }
        } catch (e) {}
      } else if (key.startsWith('gps_t_') && key.endsWith('_test_sets')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) allTestSets.push(...parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 4. Also incorporate any in-memory items
  if (Array.isArray(DB.students) && DB.students.length > 0) {
    allStudents.push(...DB.students);
  }
  if (Array.isArray(DB.marks) && DB.marks.length > 0) {
    allMarks.push(...DB.marks);
  }

  // 5. Deduplicate Students by (std, section, roll) and GR number
  const studentMap = new Map();
  allStudents.forEach(stu => {
    if (!stu || stu.roll === undefined || stu.roll === null) return;
    const std = String(stu.std || '9').trim();
    const sec = String(stu.section || 'A').trim().toUpperCase();
    const roll = parseInt(stu.roll);
    if (isNaN(roll)) return;

    const key = `${std}_${sec}_${roll}`;
    const grKey = stu.grNo ? `GR_${String(stu.grNo).trim()}` : null;

    const existing = studentMap.get(key) || (grKey ? studentMap.get(grKey) : null);
    if (existing) {
      if (!existing.name || (existing.name.startsWith('Student ') && stu.name && !stu.name.startsWith('Student '))) {
        existing.name = stu.name;
      }
      if (!existing.mobile && stu.mobile) existing.mobile = stu.mobile;
      if (!existing.grNo && stu.grNo) existing.grNo = stu.grNo;
      if (!existing.section && stu.section) existing.section = stu.section;
    } else {
      const record = {
        id: stu.id || Date.now() + Math.floor(Math.random() * 1000000),
        grNo: stu.grNo || `GR-${new Date().getFullYear()}-${std}-${String(roll).padStart(3, '0')}`,
        roll: roll,
        name: stu.name || `Student ${roll}`,
        std: std,
        section: sec,
        mobile: stu.mobile || ''
      };
      studentMap.set(key, record);
      if (grKey) studentMap.set(grKey, record);
    }
  });

  const uniqueStudents = Array.from(new Set(studentMap.values()));
  uniqueStudents.sort((a, b) => {
    const stdDiff = (parseInt(a.std) || 0) - (parseInt(b.std) || 0);
    if (stdDiff !== 0) return stdDiff;
    return (parseInt(a.roll) || 0) - (parseInt(b.roll) || 0);
  });

  // 6. Deduplicate Marks by (std, roll, subject, testSet/topic/exam, date)
  const marksMap = new Map();
  allMarks.forEach(m => {
    if (!m || m.roll === undefined || m.roll === null) return;
    const std = String(m.std || '9').trim();
    const roll = parseInt(m.roll);
    if (isNaN(roll)) return;
    const sub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : String(m.subject || '').trim();
    if (!sub) return;
    const setKey = String(m.testSet || m.exam || m.topic || 'Assessment').trim();
    const date = String(m.date || '').trim();
    const key = `${std}_${roll}_${sub}_${setKey}_${date}`;

    if (!marksMap.has(key)) {
      marksMap.set(key, {
        id: m.id || 'm_' + Math.random().toString(36).substr(2, 9),
        roll: roll,
        std: std,
        subject: sub,
        topic: m.topic || setKey,
        testSet: m.testSet || (setKey !== 'Assessment' ? setKey : ''),
        exam: m.exam || (setKey !== 'Assessment' ? setKey : ''),
        marks: m.marks !== undefined ? m.marks : 0,
        total: m.total || 50,
        date: date || new Date().toISOString().split('T')[0],
        isAbsent: Boolean(m.isAbsent),
        source: m.source || 'excel',
        grNo: m.grNo || ''
      });
    }
  });
  const uniqueMarks = Array.from(marksMap.values());

  // 7. Deduplicate Attendance
  const attMap = new Map();
  allAttendance.forEach(a => {
    if (!a || !a.date || a.roll === undefined) return;
    const key = `${a.date}_${a.std || '9'}_${a.roll}`;
    if (!attMap.has(key)) attMap.set(key, a);
  });
  const uniqueAttendance = Array.from(attMap.values());

  // 8. Deduplicate Test Sets
  const testSetMap = new Map();
  allTestSets.forEach(s => {
    if (!s || !s.name) return;
    const key = `${s.name.toLowerCase()}_${s.std || 'all'}`;
    if (!testSetMap.has(key)) testSetMap.set(key, s);
  });
  const uniqueTestSets = Array.from(testSetMap.values());

  // Set consolidated data in DB
  DB.students = uniqueStudents;
  DB.marks = uniqueMarks;
  DB.attendance = uniqueAttendance;
  DB.testSets = uniqueTestSets;

  // Persist consolidated school records to global storage
  try {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(DB.students));
    localStorage.setItem(STORAGE_KEYS.MARKS, JSON.stringify(DB.marks));
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(DB.attendance));
    localStorage.setItem(STORAGE_KEYS.TEST_SETS, JSON.stringify(DB.testSets));
  } catch (e) {}

  return {
    students: uniqueStudents,
    marks: uniqueMarks,
    attendance: uniqueAttendance,
    testSets: uniqueTestSets
  };
}
window.loadManagementSchoolData = loadManagementSchoolData;

function switchTeacherContext(teacherId, isBrandNew = false) {
  if (!teacherId) {
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
    DB.testSets = [];
    return;
  }

  if (isBrandNew) {
    // Brand new teacher account: starts with strictly 0 students, 0 marks, 0 attendance, 0 upcoming tests!
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
    DB.testSets = [];
    saveTeacherData(teacherId);
    return;
  }

  const rawStu = localStorage.getItem(getTeacherStorageKey(teacherId, 'students'));
  const rawMks = localStorage.getItem(getTeacherStorageKey(teacherId, 'marks'));
  const rawAtt = localStorage.getItem(getTeacherStorageKey(teacherId, 'attendance'));
  const rawUpc = localStorage.getItem(getTeacherStorageKey(teacherId, 'upcoming_tests'));
  const rawSets = localStorage.getItem(getTeacherStorageKey(teacherId, 'test_sets'));

  if (rawStu !== null) {
    // Existing saved data for this teacher
    try {
      DB.students = JSON.parse(rawStu);
      DB.marks = rawMks ? JSON.parse(rawMks) : [];
      DB.attendance = rawAtt ? JSON.parse(rawAtt) : [];
      DB.upcomingTests = rawUpc ? JSON.parse(rawUpc) : [];
      DB.testSets = rawSets ? JSON.parse(rawSets) : [];
    } catch (e) {
      console.error('Error parsing teacher dataset:', e);
      DB.students = [];
      DB.marks = [];
      DB.attendance = [];
      DB.upcomingTests = [];
      DB.testSets = [];
    }
    // If teacher storage has 0 students, attempt sync from school database for teacher's assigned classes
    if (DB.students.length === 0) {
      try {
        const rawGlobal = localStorage.getItem(STORAGE_KEYS.STUDENTS);
        const globalStudents = rawGlobal ? JSON.parse(rawGlobal) : [];
        const teacher = (DB.teachers || []).find(t => t.id === teacherId);
        if (globalStudents.length > 0 && teacher && teacher.classrooms && teacher.classrooms.length > 0) {
          const assigned = teacher.classrooms.map(c => String(c.classNumber || c));
          DB.students = globalStudents.filter(s => assigned.includes(String(s.std)));
          const rawGlobalMks = localStorage.getItem(STORAGE_KEYS.MARKS);
          const globalMarks = rawGlobalMks ? JSON.parse(rawGlobalMks) : [];
          DB.marks = globalMarks.filter(m => assigned.includes(String(m.std)));
          saveTeacherData(teacherId);
        }
      } catch (e) {}
    }
  } else {
    // Check if the school already has students enrolled in STORAGE_KEYS.STUDENTS
    const rawGlobal = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    const globalStudents = rawGlobal ? JSON.parse(rawGlobal) : [];
    const teacher = (DB.teachers || []).find(t => t.id === teacherId);
    if (globalStudents.length > 0 && teacher && teacher.classrooms && teacher.classrooms.length > 0) {
      const assigned = teacher.classrooms.map(c => String(c.classNumber || c));
      DB.students = globalStudents.filter(s => assigned.includes(String(s.std)));
      const rawGlobalMks = localStorage.getItem(STORAGE_KEYS.MARKS);
      const globalMarks = rawGlobalMks ? JSON.parse(rawGlobalMks) : [];
      DB.marks = globalMarks.filter(m => assigned.includes(String(m.std)));
    } else {
      DB.students = [];
      DB.marks = [];
    }
    DB.attendance = [];
    DB.upcomingTests = [];
    DB.testSets = [];
    saveTeacherData(teacherId);
  }
}

// Database Initializer
function initDatabase() {
  try {
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.init === 'function') {
      CloudDB.init();
    }

    // 1. Purge legacy demo keys from localStorage
    const demoKeys = [
      'gps_t_T-101_students', 'gps_t_T-101_marks', 'gps_t_T-101_attendance', 'gps_t_T-101_upcoming_tests',
      'gps_t_T-102_students', 'gps_t_T-102_marks', 'gps_t_T-102_attendance', 'gps_t_T-102_upcoming_tests',
      'gps_t_T-999999_students', 'gps_t_T-999999_marks', 'gps_t_T-999999_attendance', 'gps_t_T-999999_upcoming_tests'
    ];
    demoKeys.forEach(k => {
      try { localStorage.removeItem(k); } catch (e) {}
    });

    const rawTeachers = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    const rawSession = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);

    let loadedTeachers = rawTeachers ? JSON.parse(rawTeachers) : [];
    loadedTeachers = loadedTeachers.filter(t => t.id !== 'T-101' && t.id !== 'T-102' && t.id !== 'T-999999');
    DB.teachers = loadedTeachers;
    try {
      localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(DB.teachers));
    } catch (e) {}

    let session = rawSession ? JSON.parse(rawSession) : null;
    if (session && session.teacher && (session.teacher.id === 'T-101' || session.teacher.id === 'T-102')) {
      session = null;
      try { localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION); } catch (e) {}
    }
    DB.activeSession = session;

    // If active session is a teacher, keep teacher profile in sync and load teacher context
    if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
      const matchT = DB.teachers.find(t => t.id === DB.activeSession.teacher.id);
      if (matchT) {
        DB.activeSession.teacher = matchT;
      }
      const activeTId = DB.activeSession.teacher.id;
      switchTeacherContext(activeTId, false);

      // Self-clean any demo students that got injected
      const demoNames = [
        'Aditya Dave', 'Bhavna Rathod', 'Chirag Solanki', 'Deepika Iyer', 'Eshaan Gupta',
        'Aarav Patel', 'Priya Shah', 'Rohan Mehta', 'Ananya Joshi', 'Kabir Singhania',
        'Sneha Kulkarni', 'Devendra Dave', 'Isha Trivedi', 'Aryan Bhatt', 'Diya Parikh',
        'Manav Desai', 'Tanvi Panchal', 'Harshvardhan Rana', 'Janvi Bhatt', 'Kunal Kapoor',
        'Lipika Sen', 'Mohit Rawat'
      ];
      if (Array.isArray(DB.students)) {
        const hasDemo = DB.students.some(s => demoNames.includes(s.name) || (s.grNo && (s.grNo.startsWith('GR-2024-08') || s.grNo.startsWith('GR-2024-10'))));
        if (hasDemo) {
          DB.students = DB.students.filter(s => !demoNames.includes(s.name) && !(s.grNo && (s.grNo.startsWith('GR-2024-08') || s.grNo.startsWith('GR-2024-10'))));
          const validRolls = new Set(DB.students.map(s => s.roll));
          DB.marks = DB.marks.filter(m => validRolls.has(m.roll));
          DB.attendance = DB.attendance.filter(a => validRolls.has(a.roll));
          saveTeacherData(activeTId);
        }
      }

      // Auto-expand teacher classrooms to cover any classes present in their student roster
      const teacherObj = DB.activeSession.teacher;
      if (teacherObj) {
        teacherObj.classrooms = teacherObj.classrooms || [];
        const presentClasses = [...new Set((DB.students || []).map(s => String(s.std)))].filter(Boolean);
        presentClasses.forEach(c => {
          if (!teacherObj.classrooms.some(cr => String(cr.classNumber || cr) === c)) {
            teacherObj.classrooms.push({ classNumber: c, sections: ['A'] });
          }
        });
      }

    } else if (DB.activeSession && DB.activeSession.role === 'management') {
      loadManagementSchoolData();
    } else {
      // If no active teacher session, consolidate and load the whole-school dataset
      loadManagementSchoolData();
    }

    // Auto-migrate marks: ensure 'std' and 'source' are present on each mark
    DB.marks.forEach(m => {
      if (!m.std) {
        const stu = DB.students.find(s => s.roll === m.roll);
        m.std = stu ? (stu.std || '9').toString() : '9';
      } else {
        m.std = m.std.toString();
      }
      if (!m.source) {
        m.source = 'excel';
      }
      if (m.subject) {
        m.subject = cleanSubjectName(m.subject);
      }
    });

    // Purge corrupted marks where Roll No or student metadata was inadvertently stored as a subject
    if (Array.isArray(DB.marks)) {
      const invalidSubjectRegex = /^(?:roll(?:\s*no\.?|\s*number)?|r\.?no\.?|sr(?:\s*no\.?|\s*number)?|gr(?:\s*no\.?|\s*number)?|name|student(?:\s*name)?|class|std|section|total|percentage|grade|rank|mobile)$/i;
      DB.marks = DB.marks.filter(m => {
        if (!m || !m.subject) return false;
        const s = m.subject.toString().trim();
        return !invalidSubjectRegex.test(s) && !invalidSubjectRegex.test(s.replace(/[()[\]{}:;.\-_/\\# ]+/g, ''));
      });
    }

    // Auto-heal student roll numbers and marks alignment
    if (typeof healStudentRollsAndMarks === 'function') {
      healStudentRollsAndMarks();
    }

    saveDatabase();
  } catch (err) {
    console.error('Error initializing database:', err);
    DB.teachers = [...SEED_TEACHERS];
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
    DB.activeSession = null;
  }
}

// Persist current state to localStorage
function saveDatabase(triggerCloud = true) {
  try {
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(DB.teachers));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(DB.students));
    localStorage.setItem(STORAGE_KEYS.MARKS, JSON.stringify(DB.marks));
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(DB.attendance));
    localStorage.setItem(STORAGE_KEYS.UPCOMING_TESTS, JSON.stringify(DB.upcomingTests));
    localStorage.setItem(STORAGE_KEYS.TEST_SETS, JSON.stringify(DB.testSets || []));
    if (DB.activeSession) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(DB.activeSession));
      if (DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
        saveTeacherData(DB.activeSession.teacher.id);
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    }
    if (triggerCloud && typeof CloudDB !== 'undefined') {
      if (typeof CloudDB.broadcastChange === 'function') {
        CloudDB.broadcastChange('save');
      }
      if (typeof CloudDB.syncToCloud === 'function') {
        CloudDB.syncToCloud();
      }
    }
  } catch (err) {
    console.error('Storage quota exceeded or error saving:', err);
    if (window.showToast) window.showToast('Storage save warning', 'warning');
  }
}

// Retrieve all unique test sets (combines DB.testSets registry and marks tags)
function getAllTestSets(std = null) {
  const markSets = (DB.marks || [])
    .filter(m => (!std || std === 'all' || String(m.std) === String(std)))
    .map(m => m.testSet || m.exam)
    .filter(Boolean);
  const dbSets = (DB.testSets || [])
    .filter(s => (!std || std === 'all' || String(s.std) === String(std)))
    .map(s => s.name)
    .filter(Boolean);
  return [...new Set([...markSets, ...dbSets])].filter(s => s !== 'Unit Assessment');
}
window.getAllTestSets = getAllTestSets;

// Factory Reset & Data Management
function factoryResetData(mode = 'wipe') {
  if (mode === 'wipe') {
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];

    const activeTId = getActiveTeacherId ? getActiveTeacherId() : (DB.activeSession && DB.activeSession.teacher ? DB.activeSession.teacher.id : null);
    if (activeTId) saveTeacherData(activeTId);

    saveDatabase(false);
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.resetCloudData === 'function') {
      CloudDB.resetCloudData('wipe');
    }
    refreshAllModulesUI();

    if (window.showToast) {
      window.showToast('Factory Reset complete: All student and marks data have been wiped.', 'success');
    }
  } else if (mode === 'marks_only') {
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];

    const activeTId = getActiveTeacherId ? getActiveTeacherId() : (DB.activeSession && DB.activeSession.teacher ? DB.activeSession.teacher.id : null);
    if (activeTId) saveTeacherData(activeTId);

    saveDatabase(false);
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.resetCloudData === 'function') {
      CloudDB.resetCloudData('marks_only');
    }
    refreshAllModulesUI();

    if (window.showToast) {
      window.showToast('All examination marks, attendance, and test records cleared.', 'success');
    }
  } else if (mode === 'seed' || mode === 'demo') {
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
    const activeTId = getActiveTeacherId ? getActiveTeacherId() : (DB.activeSession && DB.activeSession.teacher ? DB.activeSession.teacher.id : null);
    if (activeTId) saveTeacherData(activeTId);
    saveDatabase(false);
    refreshAllModulesUI();
    if (window.showToast) window.showToast('Demo dataset removed. Database is clean.', 'info');
  }
}

function resetTestDataOnly() {
  DB.marks = [];
  try {
    localStorage.removeItem(STORAGE_KEYS.MARKS);
    localStorage.setItem(STORAGE_KEYS.MARKS, JSON.stringify([]));
  } catch (e) {}

  saveDatabase();

  if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
    CloudDB.syncToCloud();
  }

  if (typeof refreshAllModulesUI === 'function') refreshAllModulesUI();
  if (typeof updateDashboard === 'function') updateDashboard();
  if (typeof updateManagementDashboard === 'function') updateManagementDashboard();

  if (window.showToast) {
    window.showToast('All examination marks have been reset. Enrolled students and faculty accounts remain intact.', 'info');
  }
}

// Export global symbols
window.DB = DB;
window.initDatabase = initDatabase;
window.saveDatabase = saveDatabase;
window.resetDatabase = resetDatabase;
window.resetTestDataOnly = resetTestDataOnly;
window.factoryResetData = factoryResetData;
window.refreshAllModulesUI = refreshAllModulesUI;
window.getGrade = getGrade;
window.formatPhoneForWA = formatPhoneForWA;
window.parseContactNumbers = parseContactNumbers;
window.renderContactCell = renderContactCell;
window.findStudentByRoll = findStudentByRoll;
window.findStudentByRollAndClass = findStudentByRollAndClass;
window.findStudentByGrNo = findStudentByGrNo;
window.findStudent = findStudent;
window.getMarksForStudent = getMarksForStudent;
window.healStudentRollsAndMarks = healStudentRollsAndMarks;
window.formatDateSlash = formatDateSlash;
window.cleanSubjectName = cleanSubjectName;
window.getActiveTeacherId = getActiveTeacherId;
window.getAddedTeacherAccount = getAddedTeacherAccount;
window.getTeacherStorageKey = getTeacherStorageKey;
window.saveTeacherData = saveTeacherData;
window.switchTeacherContext = switchTeacherContext;
window.getTeacherAssignedClasses = getTeacherAssignedClasses;
window.SEED_STUDENTS = SEED_STUDENTS;
window.SEED_MARKS = SEED_MARKS;
window.gujaratiToEnglishDigits = gujaratiToEnglishDigits;
window.englishToGujaratiDigits = englishToGujaratiDigits;
window.translateSubjectToGujarati = translateSubjectToGujarati;
window.normalizeSubjectFromGujarati = normalizeSubjectFromGujarati;
window.GUJARATI_SUBJECT_MAP = GUJARATI_SUBJECT_MAP;
window.ENGLISH_TO_GUJARATI_SUBJECT_MAP = ENGLISH_TO_GUJARATI_SUBJECT_MAP;
