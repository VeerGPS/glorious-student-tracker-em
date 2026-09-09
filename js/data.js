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
  ACTIVE_SESSION: 'gps_em_active_session_v1'
};

// Initial Seed Dataset for Glorious Public School
const SEED_TEACHERS = [
  {
    id: 'T-101',
    name: 'Mrs. Ananya Sharma',
    mobile: '9876543210',
    password: 'password123',
    subjects: ['Mathematics', 'Science'],
    classrooms: [
      { classNumber: '8', sections: ['A'] },
      { classNumber: '9', sections: ['A', 'B'] },
      { classNumber: '10', sections: ['A'] }
    ]
  },
  {
    id: 'T-102',
    name: 'Mr. Rajesh Verma',
    mobile: '9822334455',
    password: 'password123',
    subjects: ['English', 'Social Science'],
    classrooms: [
      { classNumber: '8', sections: ['A'] },
      { classNumber: '9', sections: ['A', 'B'] },
      { classNumber: '10', sections: ['A'] }
    ]
  }
];

const SEED_STUDENTS = [
  // Class 8 Students
  { grNo: 'GR-2024-081', roll: 101, name: 'Aditya Dave', std: '8', section: 'A', mobile: '9876500001' },
  { grNo: 'GR-2024-082', roll: 102, name: 'Bhavna Rathod', std: '8', section: 'A', mobile: '9876500002' },
  { grNo: 'GR-2024-083', roll: 103, name: 'Chirag Solanki', std: '8', section: 'A', mobile: '9876500003' },
  { grNo: 'GR-2024-084', roll: 104, name: 'Deepika Iyer', std: '8', section: 'A', mobile: '9876500004' },
  { grNo: 'GR-2024-085', roll: 105, name: 'Eshaan Gupta', std: '8', section: 'A', mobile: '9876500005' },

  // Class 9 Students
  { grNo: 'GR-2024-001', roll: 101, name: 'Aarav Patel', std: '9', section: 'A', mobile: '9876543210' },
  { grNo: 'GR-2024-002', roll: 102, name: 'Priya Shah', std: '9', section: 'A', mobile: '9123456780' },
  { grNo: 'GR-2024-003', roll: 103, name: 'Rohan Mehta', std: '9', section: 'A', mobile: '9988776655' },
  { grNo: 'GR-2024-004', roll: 104, name: 'Ananya Joshi', std: '9', section: 'A', mobile: '9822001122' },
  { grNo: 'GR-2024-005', roll: 105, name: 'Kabir Singhania', std: '9', section: 'A', mobile: '9765432109' },
  { grNo: 'GR-2024-006', roll: 106, name: 'Sneha Kulkarni', std: '9', section: 'B', mobile: '9654321987' },
  { grNo: 'GR-2024-007', roll: 107, name: 'Devendra Dave', std: '9', section: 'B', mobile: '9543219876' },
  { grNo: 'GR-2024-008', roll: 108, name: 'Isha Trivedi', std: '9', section: 'B', mobile: '9432198765' },
  { grNo: 'GR-2024-009', roll: 109, name: 'Aryan Bhatt', std: '9', section: 'A', mobile: '9321987654' },
  { grNo: 'GR-2024-010', roll: 110, name: 'Diya Parikh', std: '9', section: 'A', mobile: '9210987653' },
  { grNo: 'GR-2024-011', roll: 111, name: 'Manav Desai', std: '9', section: 'B', mobile: '9109876542' },
  { grNo: 'GR-2024-012', roll: 112, name: 'Tanvi Panchal', std: '9', section: 'B', mobile: '9098765431' },

  // Class 10 Students
  { grNo: 'GR-2024-101', roll: 101, name: 'Harshvardhan Rana', std: '10', section: 'A', mobile: '9876500011' },
  { grNo: 'GR-2024-102', roll: 102, name: 'Janvi Bhatt', std: '10', section: 'A', mobile: '9876500012' },
  { grNo: 'GR-2024-103', roll: 103, name: 'Kunal Kapoor', std: '10', section: 'A', mobile: '9876500013' },
  { grNo: 'GR-2024-104', roll: 104, name: 'Lipika Sen', std: '10', section: 'A', mobile: '9876500014' },
  { grNo: 'GR-2024-105', roll: 105, name: 'Mohit Rawat', std: '10', section: 'A', mobile: '9876500015' }
];

const SEED_MARKS = [
  // Class 8 Marks
  { id: 8001, grNo: 'GR-2024-081', roll: 101, std: '8', subject: 'Mathematics', topic: 'Rational Numbers', marks: 45, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 8002, grNo: 'GR-2024-082', roll: 102, std: '8', subject: 'Mathematics', topic: 'Rational Numbers', marks: 48, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 8003, grNo: 'GR-2024-083', roll: 103, std: '8', subject: 'Mathematics', topic: 'Rational Numbers', marks: 32, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 8004, grNo: 'GR-2024-084', roll: 104, std: '8', subject: 'Mathematics', topic: 'Rational Numbers', marks: 50, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 8005, grNo: 'GR-2024-085', roll: 105, std: '8', subject: 'Mathematics', topic: 'Rational Numbers', marks: 0, total: 50, date: '2026-08-10', isAbsent: true, source: 'excel' },

  { id: 8006, grNo: 'GR-2024-081', roll: 101, std: '8', subject: 'Science', topic: 'Crop Production', marks: 43, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 8007, grNo: 'GR-2024-082', roll: 102, std: '8', subject: 'Science', topic: 'Crop Production', marks: 47, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 8008, grNo: 'GR-2024-083', roll: 103, std: '8', subject: 'Science', topic: 'Crop Production', marks: 36, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 8009, grNo: 'GR-2024-084', roll: 104, std: '8', subject: 'Science', topic: 'Crop Production', marks: 49, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 8010, grNo: 'GR-2024-085', roll: 105, std: '8', subject: 'Science', topic: 'Crop Production', marks: 40, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },

  // Class 9 Marks
  { id: 1001, grNo: 'GR-2024-001', roll: 101, std: '9', subject: 'Mathematics', topic: 'Algebra & Quadratics', marks: 47, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 1002, grNo: 'GR-2024-002', roll: 102, std: '9', subject: 'Mathematics', topic: 'Algebra & Quadratics', marks: 44, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 1003, grNo: 'GR-2024-003', roll: 103, std: '9', subject: 'Mathematics', topic: 'Algebra & Quadratics', marks: 16, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 1004, grNo: 'GR-2024-004', roll: 104, std: '9', subject: 'Mathematics', topic: 'Algebra & Quadratics', marks: 49, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 1005, grNo: 'GR-2024-005', roll: 105, std: '9', subject: 'Mathematics', topic: 'Algebra & Quadratics', marks: 0, total: 50, date: '2026-08-10', isAbsent: true, source: 'excel' },
  
  { id: 1006, grNo: 'GR-2024-001', roll: 101, std: '9', subject: 'Science', topic: 'Light & Optics', marks: 46, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 1007, grNo: 'GR-2024-002', roll: 102, std: '9', subject: 'Science', topic: 'Light & Optics', marks: 42, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 1008, grNo: 'GR-2024-003', roll: 103, std: '9', subject: 'Science', topic: 'Light & Optics', marks: 35, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 1009, grNo: 'GR-2024-004', roll: 104, std: '9', subject: 'Science', topic: 'Light & Optics', marks: 48, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },
  { id: 1010, grNo: 'GR-2024-005', roll: 105, std: '9', subject: 'Science', topic: 'Light & Optics', marks: 38, total: 50, date: '2026-08-18', isAbsent: false, source: 'excel' },

  { id: 1011, grNo: 'GR-2024-001', roll: 101, std: '9', subject: 'English', topic: 'Grammar & Prose', marks: 23, total: 25, date: '2026-08-25', isAbsent: false, source: 'excel' },
  { id: 1012, grNo: 'GR-2024-002', roll: 102, std: '9', subject: 'English', topic: 'Grammar & Prose', marks: 24, total: 25, date: '2026-08-25', isAbsent: false, source: 'excel' },
  { id: 1013, grNo: 'GR-2024-003', roll: 103, std: '9', subject: 'English', topic: 'Grammar & Prose', marks: 14, total: 25, date: '2026-08-25', isAbsent: false, source: 'excel' },
  { id: 1014, grNo: 'GR-2024-004', roll: 104, std: '9', subject: 'English', topic: 'Grammar & Prose', marks: 22, total: 25, date: '2026-08-25', isAbsent: false, source: 'excel' },
  { id: 1015, grNo: 'GR-2024-005', roll: 105, std: '9', subject: 'English', topic: 'Grammar & Prose', marks: 19, total: 25, date: '2026-08-25', isAbsent: false, source: 'excel' },

  // Class 10 Marks
  { id: 10001, grNo: 'GR-2024-101', roll: 101, std: '10', subject: 'Mathematics', topic: 'Real Numbers', marks: 46, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 10002, grNo: 'GR-2024-102', roll: 102, std: '10', subject: 'Mathematics', topic: 'Real Numbers', marks: 49, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 10003, grNo: 'GR-2024-103', roll: 103, std: '10', subject: 'Mathematics', topic: 'Real Numbers', marks: 28, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 10004, grNo: 'GR-2024-104', roll: 104, std: '10', subject: 'Mathematics', topic: 'Real Numbers', marks: 42, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' },
  { id: 10005, grNo: 'GR-2024-105', roll: 105, std: '10', subject: 'Mathematics', topic: 'Real Numbers', marks: 39, total: 50, date: '2026-08-10', isAbsent: false, source: 'excel' }
];

const SEED_UPCOMING_TESTS = [
  {
    id: 1,
    subject: 'Mathematics',
    std: '9',
    section: 'A',
    topic: 'Trigonometry & Coordinate Geometry',
    date: '2026-09-12',
    totalMarks: 50,
    room: 'Room 204'
  },
  {
    id: 2,
    subject: 'Science',
    std: '9',
    section: 'A',
    topic: 'Chemical Reactions & Equations',
    date: '2026-09-18',
    totalMarks: 50,
    room: 'Science Lab 1'
  },
  {
    id: 3,
    subject: 'Mathematics',
    std: '8',
    section: 'A',
    topic: 'Linear Equations in One Variable',
    date: '2026-09-15',
    totalMarks: 50,
    room: 'Room 102'
  },
  {
    id: 4,
    subject: 'Science',
    std: '10',
    section: 'A',
    topic: 'Acids, Bases & Salts',
    date: '2026-09-20',
    totalMarks: 50,
    room: 'Science Lab 2'
  }
];

const SEED_ATTENDANCE = [
  {
    date: '2026-09-07',
    std: '8',
    section: 'A',
    records: [
      { roll: 101, status: 'P' },
      { roll: 102, status: 'P' },
      { roll: 103, status: 'P' },
      { roll: 104, status: 'P' },
      { roll: 105, status: 'A' }
    ]
  },
  {
    date: '2026-09-07',
    std: '9',
    section: 'A',
    records: [
      { roll: 101, status: 'P' },
      { roll: 102, status: 'P' },
      { roll: 103, status: 'A' },
      { roll: 104, status: 'P' },
      { roll: 105, status: 'L' }
    ]
  },
  {
    date: '2026-09-07',
    std: '10',
    section: 'A',
    records: [
      { roll: 101, status: 'P' },
      { roll: 102, status: 'P' },
      { roll: 103, status: 'P' },
      { roll: 104, status: 'P' },
      { roll: 105, status: 'P' }
    ]
  }
];

// App Global In-Memory Store
let DB = {
  teachers: [],
  students: [],
  marks: [],
  attendance: [],
  upcomingTests: [],
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
  const custom = DB.teachers.filter(t => t.id !== 'T-101' && t.id !== 'T-102');
  if (custom.length > 0) return custom[custom.length - 1];
  return DB.teachers[0];
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
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
      CloudDB.syncToCloud(teacherId);
    }
  } catch (err) {
    console.error('Error saving teacher data:', err);
  }
}

function switchTeacherContext(teacherId, isBrandNew = false) {
  if (!teacherId) return;

  if (isBrandNew) {
    // Brand new teacher account: starts with strictly 0 students, 0 marks, 0 attendance, 0 upcoming tests!
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
    saveTeacherData(teacherId);
    return;
  }

  const rawStu = localStorage.getItem(getTeacherStorageKey(teacherId, 'students'));
  const rawMks = localStorage.getItem(getTeacherStorageKey(teacherId, 'marks'));
  const rawAtt = localStorage.getItem(getTeacherStorageKey(teacherId, 'attendance'));
  const rawUpc = localStorage.getItem(getTeacherStorageKey(teacherId, 'upcoming_tests'));

  if (rawStu !== null) {
    // Existing saved data for this teacher
    try {
      DB.students = JSON.parse(rawStu);
      DB.marks = rawMks ? JSON.parse(rawMks) : [];
      DB.attendance = rawAtt ? JSON.parse(rawAtt) : [];
      DB.upcomingTests = rawUpc ? JSON.parse(rawUpc) : [];
    } catch (e) {
      console.error('Error parsing teacher dataset:', e);
      DB.students = [];
      DB.marks = [];
      DB.attendance = [];
      DB.upcomingTests = [];
    }
  } else {
    // No specific data saved yet for this teacher
    if (teacherId === 'T-101' || teacherId === 'T-102') {
      // Demo teachers get sample demo dataset
      DB.students = JSON.parse(JSON.stringify(SEED_STUDENTS));
      DB.marks = JSON.parse(JSON.stringify(SEED_MARKS));
      DB.attendance = JSON.parse(JSON.stringify(SEED_ATTENDANCE));
      DB.upcomingTests = JSON.parse(JSON.stringify(SEED_UPCOMING_TESTS));
    } else {
      // Custom/new teacher accounts: start with 100% empty rosters until they upload tally excel!
      DB.students = [];
      DB.marks = [];
      DB.attendance = [];
      DB.upcomingTests = [];
    }
    saveTeacherData(teacherId);
  }
}

// Database Initializer
function initDatabase() {
  try {
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.init === 'function') {
      CloudDB.init();
    }

    const rawTeachers = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    const rawSession = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);

    DB.teachers = rawTeachers ? JSON.parse(rawTeachers) : [...SEED_TEACHERS];
    DB.activeSession = rawSession ? JSON.parse(rawSession) : null;

    // Ensure demo teachers have classrooms 8, 9, 10
    DB.teachers.forEach(teacher => {
      if (teacher.id === 'T-101' || teacher.id === 'T-102') {
        const clsNums = (teacher.classrooms || []).map(c => c.classNumber);
        ['8', '9', '10'].forEach(cNum => {
          if (!clsNums.includes(cNum)) {
            teacher.classrooms.push({ classNumber: cNum, sections: ['A'] });
          }
        });
      }
    });

    // If active session is a teacher, keep teacher profile in sync and load teacher context
    if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
      const matchT = DB.teachers.find(t => t.id === DB.activeSession.teacher.id);
      if (matchT) {
        DB.activeSession.teacher = matchT;
      }
      const activeTId = DB.activeSession.teacher.id;
      switchTeacherContext(activeTId, false);

      // Self-healing migration for custom teachers who previously received demo seed data:
      // If a non-demo teacher has the exact 22 seed students, clear them because they never gave a student tally excel!
      if (activeTId !== 'T-101' && activeTId !== 'T-102') {
        const isExactSeedDataset = DB.students.length === SEED_STUDENTS.length &&
          DB.students.some(s => s.name === 'Aditya Dave') &&
          DB.students.some(s => s.name === 'Aarav Patel') &&
          DB.students.some(s => s.name === 'Harshvardhan Rana');

        if (isExactSeedDataset) {
          console.log('Clearing auto-injected demo seed students for custom teacher account:', activeTId);
          DB.students = [];
          DB.marks = [];
          DB.attendance = [];
          DB.upcomingTests = [];
          saveTeacherData(activeTId);
        } else {
          // Self-clean any students, marks, or attendance belonging to classes NOT selected by this teacher!
          const teacherObj = DB.activeSession.teacher;
          if (teacherObj && teacherObj.classrooms && Array.isArray(teacherObj.classrooms) && teacherObj.classrooms.length > 0) {
            const validClasses = teacherObj.classrooms.map(c => String(c.classNumber || c));
            const initialStuCount = DB.students.length;
            const initialMarksCount = DB.marks.length;
            DB.students = DB.students.filter(s => validClasses.includes(String(s.std)));
            DB.marks = DB.marks.filter(m => validClasses.includes(String(m.std)));
            DB.attendance = DB.attendance.filter(a => validClasses.includes(String(a.std)));
            if (DB.students.length !== initialStuCount || DB.marks.length !== initialMarksCount) {
              console.log(`Cleaned unassigned class records for teacher ${activeTId}: kept only classes`, validClasses);
              saveTeacherData(activeTId);
            }
          }
        }
      }

    } else if (DB.activeSession && DB.activeSession.role === 'management') {
      const targetTeacherId = DB.activeSession.connectedTeacherId || (getAddedTeacherAccount() ? getAddedTeacherAccount().id : 'T-101');
      switchTeacherContext(targetTeacherId, false);
    } else {
      // If no active teacher session, load default demo preview
      switchTeacherContext('T-101', false);
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

// Factory Reset & Data Management
function factoryResetData(mode = 'wipe') {
  if (mode === 'wipe') {
    // 100% clean slate: erase all students, marks, attendance, and tests
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
    // Clear marks, attendance, and upcoming tests, but keep student directory
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
    // Restore default sample dataset for current teacher
    DB.students = JSON.parse(JSON.stringify(SEED_STUDENTS));
    DB.marks = JSON.parse(JSON.stringify(SEED_MARKS));
    DB.attendance = JSON.parse(JSON.stringify(SEED_ATTENDANCE));
    DB.upcomingTests = JSON.parse(JSON.stringify(SEED_UPCOMING_TESTS));

    const activeTId = getActiveTeacherId ? getActiveTeacherId() : (DB.activeSession && DB.activeSession.teacher ? DB.activeSession.teacher.id : 'T-101');
    if (activeTId) saveTeacherData(activeTId);

    saveDatabase(false);
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.resetCloudData === 'function') {
      CloudDB.resetCloudData('seed');
    }
    refreshAllModulesUI();

    if (window.showToast) {
      window.showToast('Sample demo dataset (22 students) restored!', 'success');
    }
  }
}

function refreshAllModulesUI() {
  if (window.syncAllClassDropdownsAndCards) window.syncAllClassDropdownsAndCards();
  if (window.renderStudentsTable) window.renderStudentsTable();
  if (window.renderRecordsTable) window.renderRecordsTable();
  if (window.updateDashboard) window.updateDashboard();
  if (window.renderUpcomingTests) window.renderUpcomingTests();
  if (window.updateNavigatorBadges) window.updateNavigatorBadges();
  if (window.initAttendanceModule) window.initAttendanceModule();
  if (window.populateAnalyticsSelect) window.populateAnalyticsSelect();
  if (window.renderCommunications) window.renderCommunications();
  if (window.renderManagementMetrics) window.renderManagementMetrics();
  if (window.populateTestEntryDropdowns) window.populateTestEntryDropdowns();
  if (window.renderTeacherWorkspaceBar) window.renderTeacherWorkspaceBar();
  if (window.updateStudentTallyBadges) window.updateStudentTallyBadges();
  if (window.updateStudentTallyUI) window.updateStudentTallyUI();
  if (window.updateMarksTargetClassUI) window.updateMarksTargetClassUI();
}


// Backward compatibility helper
function resetDatabase() {
  if (window.confirmFactoryReset) {
    window.confirmFactoryReset('seed');
  } else if (window.openConfirmModal) {
    window.openConfirmModal('Reset Demo Database', 'Are you sure you want to restore all default demo students, records, and test schedules?', () => {
      factoryResetData('seed');
    });
  } else {
    factoryResetData('seed');
  }
}

// Grading Scale
function getGrade(pct) {
  if (pct >= 91) return { g: 'A1', desc: 'Outstanding', c: [34, 197, 94] };
  if (pct >= 81) return { g: 'A2', desc: 'Excellent', c: [16, 185, 129] };
  if (pct >= 71) return { g: 'B1', desc: 'Very Good', c: [59, 130, 246] };
  if (pct >= 61) return { g: 'B2', desc: 'Good', c: [99, 102, 241] };
  if (pct >= 51) return { g: 'C1', desc: 'Fair', c: [168, 85, 247] };
  if (pct >= 41) return { g: 'C2', desc: 'Average', c: [245, 158, 11] };
  if (pct >= 33) return { g: 'D', desc: 'Pass', c: [249, 115, 22] };
  return { g: 'E', desc: 'Needs Improvement', c: [239, 68, 68] };
}

// Format Phone for WhatsApp international linking
function formatPhoneForWA(number) {
  if (!number) return '';
  let cleaned = number.toString().replace(/\D/g, '');
  if (cleaned.length === 10) return '91' + cleaned;
  return cleaned;
}

// Format date as DD/MM/YYYY with slashes
function formatDateSlash(dateStr) {
  if (!dateStr) return '';
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return '';
    const d = String(dateStr.getDate()).padStart(2, '0');
    const m = String(dateStr.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${dateStr.getFullYear()}`;
  }
  const str = dateStr.toString().trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    return `${p[0].padStart(2, '0')}/${p[1].padStart(2, '0')}/${p[2]}`;
  }
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(str)) {
    const p = str.split(/[-/.]/);
    return `${p[2].padStart(2, '0')}/${p[1].padStart(2, '0')}/${p[0]}`;
  }
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(str)) {
    const p = str.split(/[-/.]/);
    const y = p[2].length === 2 ? (parseInt(p[2]) < 50 ? '20' + p[2] : '19' + p[2]) : p[2];
    return `${p[0].padStart(2, '0')}/${p[1].padStart(2, '0')}/${y}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${parsed.getFullYear()}`;
  }
  return str.replace(/[-.]/g, '/');
}

// Digit and numeral helper
function gujaratiToEnglishDigits(val) {
  if (val === null || val === undefined) return '';
  return val.toString();
}

function englishToGujaratiDigits(val) {
  if (val === null || val === undefined) return '';
  return val.toString();
}

const GUJARATI_SUBJECT_MAP = {};
const ENGLISH_TO_GUJARATI_SUBJECT_MAP = {};

function translateSubjectToGujarati(subject) {
  return subject || '';
}

function normalizeSubjectFromGujarati(subject) {
  return cleanSubjectName(subject);
}

// Clean subject name by removing any embedded dates or bracketed numbers
function cleanSubjectName(sub) {
  if (!sub) return '';
  let s = sub.toString().trim();

  // Remove bracketed numbers e.g. (25), [40], (Total: 50)
  s = s.replace(/(?:\(|\{|\[)\s*(?:total\s*:?|marks\s*:?|max\s*:?|\/)?\s*[\d]+(?:\.[\d]+)?\s*(?:marks|m|pts)?\s*(?:\)|\}|\])/gi, ' ');

  // Remove dates in DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY, etc.
  s = s.replace(/(?:\(|\b)(?:\d{4}[-/. ]\d{1,2}[-/. ]\d{1,2}|\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4})(?:\)|\b)/g, ' ');

  // Remove text month dates: 15 Sep 2026, 15-Sep-2026
  s = s.replace(/(?:\(|\b)\d{1,2}[-/ ](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ]\d{2,4}(?:\)|\b)/gi, ' ');

  // Clean remaining symbols and extra spaces
  s = s.replace(/[()[\]{}]/g, ' ')
       .replace(/[-–—/\\|:,]+/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();

  return s || sub.toString().trim();
}

// Student Lookup Helpers with Class Scoping
function findStudentByRoll(roll, std = null) {
  if (std !== null && std !== undefined && std !== 'all' && std !== '') {
    const sMatch = DB.students.find(s => s.roll === parseInt(roll) && s.std.toString() === std.toString());
    if (sMatch) return sMatch;
  }
  return DB.students.find(s => s.roll === parseInt(roll));
}

function findStudentByRollAndClass(roll, std) {
  if (!roll) return null;
  const targetRoll = parseInt(roll);
  if (std !== null && std !== undefined && std !== 'all' && std !== '') {
    return DB.students.find(s => s.roll === targetRoll && s.std.toString() === std.toString()) || null;
  }
  return DB.students.find(s => s.roll === targetRoll) || null;
}

function findStudentByGrNo(grNo) {
  if (!grNo) return null;
  return DB.students.find(s => s.grNo && s.grNo.toString().trim().toLowerCase() === grNo.toString().trim().toLowerCase()) || null;
}

function findStudent(roll, std = null, grNo = null) {
  if (grNo) {
    const sGr = findStudentByGrNo(grNo);
    if (sGr) return sGr;
  }
  if (roll) {
    return findStudentByRoll(roll, std);
  }
  return null;
}

function getMarksForStudent(roll, std = null) {
  const targetRoll = parseInt(roll);
  return DB.marks.filter(m => {
    if (m.roll !== targetRoll) return false;
    if (std !== null && std !== undefined && std !== 'all' && std !== '') {
      return m.std ? m.std.toString() === std.toString() : true;
    }
    return true;
  });
}

// Export global symbols
window.DB = DB;
window.initDatabase = initDatabase;
window.saveDatabase = saveDatabase;
window.resetDatabase = resetDatabase;
window.factoryResetData = factoryResetData;
window.refreshAllModulesUI = refreshAllModulesUI;
window.getGrade = getGrade;
window.formatPhoneForWA = formatPhoneForWA;
window.findStudentByRoll = findStudentByRoll;
window.findStudentByRollAndClass = findStudentByRollAndClass;
window.findStudentByGrNo = findStudentByGrNo;
window.findStudent = findStudent;
window.getMarksForStudent = getMarksForStudent;
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
