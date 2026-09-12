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
    if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
      CloudDB.syncToCloud(teacherId);
    }
  } catch (err) {
    console.error('Error saving teacher data:', err);
  }
}

function switchTeacherContext(teacherId, isBrandNew = false) {
  if (!teacherId) {
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
    return;
  }

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
    // Custom/new teacher accounts: start with 100% empty rosters until they upload tally excel!
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
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

    } else if (DB.activeSession && DB.activeSession.role === 'management') {
      const targetTeacherId = DB.activeSession.connectedTeacherId || (getAddedTeacherAccount() ? getAddedTeacherAccount().id : null);
      if (targetTeacherId) {
        switchTeacherContext(targetTeacherId, false);
      } else {
        DB.students = [];
        DB.marks = [];
        DB.attendance = [];
        DB.upcomingTests = [];
      }
    } else {
      // If no active teacher session, load first teacher account if exists, else keep clean empty state
      const firstT = DB.teachers && DB.teachers.length > 0 ? DB.teachers[0].id : null;
      if (firstT) {
        switchTeacherContext(firstT, false);
      } else {
        DB.students = [];
        DB.marks = [];
        DB.attendance = [];
        DB.upcomingTests = [];
      }
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
    // Zero demo data: completely wipe student roster and marks
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
      window.showToast('Workspace reset to clean empty state.', 'info');
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
  if (window.confirmResetTestData) {
    window.confirmResetTestData();
  } else {
    factoryResetDatabase('marks_only');
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

// Student Lookup Helpers with Class & Section Scoping
function findStudentByRoll(roll, std = null, section = null) {
  if (roll === null || roll === undefined || roll === '') return null;
  const targetRoll = parseInt(roll);
  if (isNaN(targetRoll)) return null;

  if (std !== null && std !== undefined && std !== 'all' && std !== '') {
    const stdStr = String(std).trim();
    if (section !== null && section !== undefined && section !== 'all' && section !== '') {
      const secStr = String(section).trim().toUpperCase();
      const sMatchSec = DB.students.find(s => parseInt(s.roll) === targetRoll && String(s.std).trim() === stdStr && String(s.section || 'A').trim().toUpperCase() === secStr);
      if (sMatchSec) return sMatchSec;
      return null;
    }
    const sMatch = DB.students.find(s => parseInt(s.roll) === targetRoll && String(s.std).trim() === stdStr);
    if (sMatch) return sMatch;
  }
  return DB.students.find(s => parseInt(s.roll) === targetRoll) || null;
}

function findStudentByRollAndClass(roll, std, section = null) {
  return findStudentByRoll(roll, std, section);
}

function findStudentByGrNo(grNo) {
  if (!grNo) return null;
  return DB.students.find(s => s.grNo && s.grNo.toString().trim().toLowerCase() === grNo.toString().trim().toLowerCase()) || null;
}

function findStudent(roll, std = null, grNo = null, section = null) {
  if (grNo) {
    const sGr = findStudentByGrNo(grNo);
    if (sGr) return sGr;
  }
  if (roll !== null && roll !== undefined && roll !== '') {
    return findStudentByRoll(roll, std, section);
  }
  return null;
}

function getMarksForStudent(roll, std = null, section = null) {
  if (roll === null || roll === undefined || roll === '') return [];
  const targetRoll = parseInt(roll);
  if (isNaN(targetRoll)) return [];
  return DB.marks.filter(m => {
    if (parseInt(m.roll) !== targetRoll) return false;
    if (std !== null && std !== undefined && std !== 'all' && std !== '') {
      if (m.std && String(m.std).trim() !== String(std).trim()) return false;
    }
    if (section !== null && section !== undefined && section !== 'all' && section !== '') {
      if (String(m.section || 'A').trim().toUpperCase() !== String(section).trim().toUpperCase()) return false;
    }
    return true;
  });
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
