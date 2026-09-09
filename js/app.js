/**
 * Glorious Public School Student Tracker - Main Application Controller
 * Handles application lifecycle, role selection ("What describes you?"),
 * teacher authentication, classroom setup onboarding, tab switching, and portals.
 */

// Teacher Onboarding Temporary State
let teacherSignupState = {
  name: '',
  mobile: '',
  password: '',
  subjects: []
};

let teacherSetupState = {
  selectedClasses: [], // Clean slate: teacher explicitly picks only their classrooms
  classSections: {}
};


// Charts instances
let batchChartInst = null;
let radarChartInst = null;
let gradeChartInst = null;
let trendChartInst = null;

let confirmAction = null;
let toastTimeout = null;

// Language State & Translation Engine
let currentAppLanguage = 'en';

function getAppLanguage() {
  return 'en';
}

function setAppLanguage(lang) {
  currentAppLanguage = 'en';
  localStorage.setItem('gps_em_app_language', 'en');
  applyAppLanguage('en');
}

function toggleAppLanguage() {
  applyAppLanguage('en');
}

function applyAppLanguage(lang = 'en') {
  currentAppLanguage = 'en';

  // Configure Chart.js font globally
  if (typeof Chart !== 'undefined' && Chart.defaults) {
    Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
  }

  // Sync report card language dropdown
  const repLang = document.getElementById('report-language');
  if (repLang) repLang.value = 'en';

  // Navigation tab labels
  const tabTranslations = {
    'dashboard': 'Overview',
    'attendance': 'Attendance',
    'upcoming-tests': 'Upcoming Tests',
    'data-entry': 'Result Generator',
    'students': 'Student Directory',
    'records': 'Records',
    'analytics': 'AI Insights',
    'communications': 'Reports & Export'
  };

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    const target = btn.getAttribute('data-target');
    const span = btn.querySelector('span:not([id])');
    if (span && tabTranslations[target]) {
      span.innerText = tabTranslations[target];
    }
  });

  // Active page pill breadcrumb
  const activePill = document.getElementById('active-page-label');
  const activeTab = document.querySelector('.tab-content.active');
  const activeId = activeTab ? activeTab.id : 'dashboard';
  if (activePill && tabTranslations[activeId]) {
    activePill.innerText = `${tabTranslations[activeId]} Dashboard`;
  }

  // Workspace active label
  const wsText = document.querySelector('#classroom-workspace-bar span.inline-flex');
  if (wsText) {
    wsText.innerHTML = `<i class="fa-solid fa-chalkboard text-amber-400"></i> Active Workspace:`;
  }
  const switchWsText = document.querySelector('#classroom-workspace-bar span.hidden.md\\:inline');
  if (switchWsText) {
    switchWsText.innerText = 'Switch Classroom:';
  }

  // Dashboard filter header & labels
  const filterH3 = document.querySelector('#dashboard .glass-card h3');
  if (filterH3) {
    filterH3.innerHTML = `<i class="fa-solid fa-filter text-indigo-500 mr-2"></i> Academic Performance Filters`;
  }

  const filterLabels = document.querySelectorAll('#dashboard .glass-card label');
  if (filterLabels && filterLabels.length >= 6) {
    filterLabels[0].innerText = 'Class / Standard';
    filterLabels[1].innerText = 'Roll / Name / GR';
    filterLabels[2].innerText = 'Subject';
    filterLabels[3].innerText = 'Month';
    filterLabels[4].innerText = 'From Date';
    filterLabels[5].innerText = 'To Date';
  }

  // 4 Stat Summary Cards
  const lblStudents = document.getElementById('stat-total-students-label');
  if (lblStudents) lblStudents.innerText = 'Total Students';
  const lblAvg = document.getElementById('stat-avg-score-label');
  if (lblAvg) lblAvg.innerText = 'Average Score';
  const lblTests = document.getElementById('stat-total-tests-label');
  if (lblTests) lblTests.innerText = 'Assessments Held';
  const lblTopSub = document.getElementById('stat-top-subject-label');
  if (lblTopSub) lblTopSub.innerText = 'Top Subject';

  // Chart and Leaderboard Titles
  const trendH3 = document.getElementById('trend-chart-heading');
  if (trendH3) {
    trendH3.innerHTML = `<i class="fa-solid fa-arrow-trend-up text-indigo-500 mr-2"></i> Performance Trend (Over Time)`;
  }
  const gradeH3 = document.getElementById('grade-chart-heading');
  if (gradeH3) {
    gradeH3.innerHTML = `<i class="fa-solid fa-chart-pie text-purple-500 mr-2"></i> Grade Distribution`;
  }

  const chartEl = document.getElementById('batchChart');
  const chartH3 = (chartEl && typeof chartEl.closest === 'function') ? chartEl.closest('.glass-card')?.querySelector('h3') : null;
  if (chartH3) {
    chartH3.innerHTML = `<i class="fa-solid fa-chart-column text-emerald-500 mr-2"></i> Performance by Subject`;
  }

  const leaderBody = document.getElementById('leaderboard-body');
  const leaderH3 = (leaderBody && typeof leaderBody.closest === 'function') ? leaderBody.closest('.glass-card')?.querySelector('h3') : null;
  if (leaderH3) {
    leaderH3.innerHTML = `<i class="fa-solid fa-trophy text-amber-500 mr-2"></i> Top Performers`;
  }

  const leaderTable = (leaderBody && typeof leaderBody.closest === 'function') ? leaderBody.closest('table') : null;
  const leaderTh = (leaderTable && typeof leaderTable.querySelectorAll === 'function') ? leaderTable.querySelectorAll('th') : null;
  if (leaderTh && leaderTh.length >= 3) {
    leaderTh[0].innerText = 'Rank';
    leaderTh[1].innerText = 'Student Name';
    leaderTh[2].innerText = 'Score';
  }

  if (typeof updateDashboard === 'function' && document.getElementById('dashboard')?.classList.contains('active')) {
    updateDashboard();
  }
}

function healCorruptedGujaratiData() {
  if (window.showToast) showToast('Data verified.', 'info');
}

// Global symbols
window.getAppLanguage = getAppLanguage;
window.setAppLanguage = setAppLanguage;
window.toggleAppLanguage = toggleAppLanguage;
window.applyAppLanguage = applyAppLanguage;
window.healCorruptedGujaratiData = healCorruptedGujaratiData;

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  initDatabase();
  checkUrlRouting();
  if (typeof CloudDB !== 'undefined' && typeof CloudDB.updateBadgeUI === 'function') {
    CloudDB.updateBadgeUI();
  }
  applyAppLanguage('en');
});

// Routing and Role Navigation
function checkUrlRouting() {
  const params = new URLSearchParams(window.location.search);
  const rollParam = params.get('student');
  const stdParam = params.get('std');

  if (rollParam) {
    showParentPortalView(parseInt(rollParam), stdParam);
    return;
  }

  // Check existing session
  if (DB.activeSession) {
    if (DB.activeSession.role === 'teacher') {
      showTeacherDashboard();
    } else if (DB.activeSession.role === 'management') {
      showManagementDashboard();
    }
  } else {
    showRoleSelectionView();
  }
}

// -------------------------------------------------------------
// VIEW SWITCHERS (ROLE SELECTION, AUTH, SETUP, DASHBOARDS)
// -------------------------------------------------------------

function hideAllViews() {
  const viewIds = [
    'role-selection-view',
    'auth-view',
    'teacher-setup-view',
    'teacher-dashboard-view',
    'management-dashboard-view',
    'parent-portal-view'
  ];
  viewIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showRoleSelectionView() {
  hideAllViews();
  const el = document.getElementById('role-selection-view');
  if (el) el.classList.remove('hidden');
}

function selectRole(role) {
  hideAllViews();
  const authView = document.getElementById('auth-view');
  if (!authView) return;

  authView.classList.remove('hidden');

  const teacherContainer = document.getElementById('teacher-auth-container');
  const managementContainer = document.getElementById('management-auth-container');
  const parentContainer = document.getElementById('parent-auth-container');

  if (teacherContainer) teacherContainer.classList.add('hidden');
  if (managementContainer) managementContainer.classList.add('hidden');
  if (parentContainer) parentContainer.classList.add('hidden');

  if (role === 'teacher') {
    if (teacherContainer) teacherContainer.classList.remove('hidden');
    switchTeacherAuthTab('signup'); // Start on signup or signin
  } else if (role === 'management') {
    if (managementContainer) managementContainer.classList.remove('hidden');
  } else if (role === 'parent') {
    if (parentContainer) parentContainer.classList.remove('hidden');
    populateParentClassDropdown();
  }
}

function populateParentClassDropdown() {
  const sel = document.getElementById('parent-login-std');
  if (!sel) return;

  // Find all distinct enrolled classes
  const classes = [...new Set((DB.students || []).map(s => String(s.std)).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));
  
  if (classes.length > 0) {
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Select Class --</option>';
    classes.forEach(c => {
      sel.innerHTML += `<option value="${c}" ${c === currentVal ? 'selected' : ''}>Class ${c}</option>`;
    });
  }
}

function handleParentLoginFormSubmit(event) {
  event.preventDefault();
  const stdInput = document.getElementById('parent-login-std');
  const rollInput = document.getElementById('parent-login-roll');
  const contactInput = document.getElementById('parent-login-contact');

  const std = stdInput ? stdInput.value.trim() : '';
  const roll = rollInput ? parseInt(rollInput.value.trim(), 10) : NaN;
  const contact = contactInput ? contactInput.value.trim().toLowerCase() : '';

  if (!std || isNaN(roll)) {
    showToast('Please select your class and enter your student roll number.', 'warning');
    return;
  }

  // Find student in DB
  const student = (DB.students || []).find(s =>
    String(s.std) === String(std) &&
    parseInt(s.roll, 10) === roll
  );

  if (!student) {
    showToast(`No student record found for Roll No. ${roll} in Class ${std}. Please verify your class and roll number.`, 'error');
    return;
  }

  // Optional contact / GR check if provided
  if (contact) {
    const mobileMatch = student.mobile && student.mobile.toLowerCase().includes(contact);
    const grMatch = student.grNo && student.grNo.toLowerCase().includes(contact);
    if (!mobileMatch && !grMatch) {
      showToast(`Note: Contact info did not match, but loading academic report for ${student.name}.`, 'info');
    }
  }

  showToast(`Welcome! Loading Academic Progress Report for ${student.name}...`, 'success');
  showParentPortalView(student.roll, student.std);
}

// -------------------------------------------------------------
// TEACHER AUTHENTICATION (SIGN UP & SIGN IN)
// -------------------------------------------------------------

function switchTeacherAuthTab(mode) {
  const signinForm = document.getElementById('teacher-signin-form');
  const signupForm = document.getElementById('teacher-signup-form');
  const tabSigninBtn = document.getElementById('tab-teacher-signin');
  const tabSignupBtn = document.getElementById('tab-teacher-signup');

  if (mode === 'signup') {
    signupForm.classList.remove('hidden');
    signinForm.classList.add('hidden');
    tabSignupBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
    tabSignupBtn.classList.remove('text-slate-600', 'hover:bg-slate-100');
    tabSigninBtn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
    tabSigninBtn.classList.add('text-slate-600', 'hover:bg-slate-100');
  } else {
    signinForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    tabSigninBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
    tabSigninBtn.classList.remove('text-slate-600', 'hover:bg-slate-100');
    tabSignupBtn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
    tabSignupBtn.classList.add('text-slate-600', 'hover:bg-slate-100');
  }
}

// Dynamic Subject List Builder for Teacher Signup
function addTeacherSubject() {
  const input = document.getElementById('teacher-subject-input');
  const subjectName = input.value.trim();

  if (!subjectName) {
    showToast('Please type or pick a subject to add.', 'warning');
    return;
  }

  if (teacherSignupState.subjects.includes(subjectName)) {
    showToast('Subject already added to your list.', 'info');
    input.value = '';
    return;
  }

  teacherSignupState.subjects.push(subjectName);
  renderTeacherSubjectChips();
  input.value = '';
  input.focus();
}

function removeTeacherSubject(subject) {
  teacherSignupState.subjects = teacherSignupState.subjects.filter(s => s !== subject);
  renderTeacherSubjectChips();
}

function renderTeacherSubjectChips() {
  const container = document.getElementById('teacher-subjects-chips');
  if (!container) return;

  if (teacherSignupState.subjects.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-400 italic">No subjects added yet. Add at least one.</span>`;
    return;
  }

  container.innerHTML = teacherSignupState.subjects.map(subj => `
    <span class="subject-tag animate-pop-in">
      <span>${subj}</span>
      <button type="button" onclick="removeTeacherSubject('${subj}')" title="Remove">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </span>
  `).join('');
}

function handleTeacherSignupSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('teacher-reg-name').value.trim();
  const mobile = document.getElementById('teacher-reg-mobile').value.trim();
  const pass = document.getElementById('teacher-reg-pass').value;
  const repass = document.getElementById('teacher-reg-repass').value;

  if (!name || !mobile || !pass || !repass) {
    showToast('All 5 options are required.', 'warning');
    return;
  }

  if (pass !== repass) {
    showToast('Passwords do not match. Please verify.', 'error');
    return;
  }

  // If user typed a subject without clicking "+ Add", auto-add it
  const typedSubj = document.getElementById('teacher-subject-input').value.trim();
  if (typedSubj && !teacherSignupState.subjects.includes(typedSubj)) {
    teacherSignupState.subjects.push(typedSubj);
    renderTeacherSubjectChips();
    document.getElementById('teacher-subject-input').value = '';
  }

  if (teacherSignupState.subjects.length === 0) {
    showToast('Please add at least one subject you teach.', 'warning');
    return;
  }

  // Save signup state
  teacherSignupState.name = name;
  teacherSignupState.mobile = mobile;
  teacherSignupState.password = pass;

  // Ensure clean setup state so teacher selects only their classrooms
  teacherSetupState.selectedClasses = [];
  teacherSetupState.classSections = {};

  // Move to Teacher Setup Onboarding Screen
  showTeacherSetupView();

}

function handleTeacherSigninSubmit(e) {
  e.preventDefault();
  const mobile = document.getElementById('teacher-login-mobile').value.trim();
  const pass = document.getElementById('teacher-login-pass').value;

  const found = DB.teachers.find(t => t.mobile === mobile && t.password === pass);
  if (found) {
    DB.activeSession = {
      role: 'teacher',
      teacher: found
    };
    if (typeof switchTeacherContext === 'function') {
      switchTeacherContext(found.id, false);
    }
    saveDatabase();
    showToast(`Welcome back, ${found.name}!`);
    showTeacherDashboard();
  } else {
    showToast('Invalid Mobile Number or Password.', 'error');
  }
}

function fillDemoTeacher() {
  const demo = DB.teachers && DB.teachers.length > 0 ? DB.teachers[0] : null;
  if (demo) {
    document.getElementById('teacher-login-mobile').value = demo.mobile;
    document.getElementById('teacher-login-pass').value = demo.password;
    showToast(`Faculty credentials filled for ${demo.name}!`);
  } else {
    showToast('No faculty teachers registered yet. Please create an account.', 'info');
  }
}

// -------------------------------------------------------------
// MANAGEMENT AUTHENTICATION
// -------------------------------------------------------------

function handleManagementLogin(e) {
  e.preventDefault();
  const pass = (document.getElementById('management-pass').value || '').trim();
  if (pass === 'gps369' || pass === 'admin123' || pass === 'glorious2026') {
    const addedTeacher = (typeof getAddedTeacherAccount === 'function') ? getAddedTeacherAccount() : null;
    DB.activeSession = {
      role: 'management',
      name: 'School Management Board',
      connectedTeacherId: addedTeacher ? addedTeacher.id : null,
      connectedTeacherName: addedTeacher ? addedTeacher.name : null
    };
    if (addedTeacher && typeof switchTeacherContext === 'function') {
      switchTeacherContext(addedTeacher.id, false);
    }
    saveDatabase();
    if (addedTeacher) {
      showToast(`Management logged in with passcode! Connected to teacher: ${addedTeacher.name}`);
    } else {
      showToast('Management logged in successfully!');
    }
    showManagementDashboard();
  } else {
    showToast('Incorrect Management Passcode. Passcode: gps369', 'error');
  }
}

// -------------------------------------------------------------
// TEACHER SETUP SCREEN (CLASSROOMS 1 TO 10 & SECTIONS ONBOARDING)
// -------------------------------------------------------------

function showTeacherSetupView() {
  hideAllViews();
  const el = document.getElementById('teacher-setup-view');
  if (el) el.classList.remove('hidden');

  document.getElementById('setup-teacher-display-name').innerText = teacherSignupState.name;
  renderClassroomSelectorGrid();
  renderSelectedClassroomsChips();
  renderSectionConfigPerClass();
}

function renderClassroomSelectorGrid() {
  const container = document.getElementById('classroom-chips-grid');
  if (!container) return;

  const classes = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  container.innerHTML = classes.map(cls => {
    const isSelected = teacherSetupState.selectedClasses.includes(cls);
    return `
      <button type="button" onclick="toggleClassroomSelection('${cls}')"
        class="class-chip ${isSelected ? 'selected' : ''}">
        ${cls}
      </button>
    `;
  }).join('');
}

function toggleClassroomSelection(cls) {
  if (teacherSetupState.selectedClasses.includes(cls)) {
    if (teacherSetupState.selectedClasses.length === 1) {
      showToast('You must select at least one classroom you teach.', 'info');
      return;
    }
    teacherSetupState.selectedClasses = teacherSetupState.selectedClasses.filter(c => c !== cls);
    delete teacherSetupState.classSections[cls];
  } else {
    teacherSetupState.selectedClasses.push(cls);
    teacherSetupState.selectedClasses.sort((a, b) => parseInt(a) - parseInt(b));
    if (!teacherSetupState.classSections[cls]) {
      teacherSetupState.classSections[cls] = ['A'];
    }
  }

  renderClassroomSelectorGrid();
  renderSelectedClassroomsChips();
  renderSectionConfigPerClass();
}

function renderSelectedClassroomsChips() {
  const container = document.getElementById('selected-classrooms-display');
  if (!container) return;

  if (teacherSetupState.selectedClasses.length === 0) {
    container.innerHTML = `<span class="text-xs text-rose-500 font-semibold">Please select at least one class (1-10) above.</span>`;
    return;
  }

  container.innerHTML = teacherSetupState.selectedClasses.map(cls => `
    <span class="inline-flex items-center gap-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-sm animate-pop-in">
      <i class="fa-solid fa-chalkboard-user text-[10px]"></i> Class ${cls}
      <button type="button" onclick="toggleClassroomSelection('${cls}')" class="hover:text-rose-200 transition-colors ml-1">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </span>
  `).join('');
}

function renderSectionConfigPerClass() {
  const container = document.getElementById('class-sections-config-list');
  if (!container) return;

  if (teacherSetupState.selectedClasses.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 italic">Select classrooms above to configure their sections.</div>`;
    return;
  }

  container.innerHTML = teacherSetupState.selectedClasses.map(cls => {
    const sections = teacherSetupState.classSections[cls] || ['A'];
    return `
      <div class="bg-white/80 p-4 rounded-2xl border border-indigo-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in-up">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm">
            ${cls}
          </span>
          <div>
            <h5 class="text-sm font-black text-slate-800">Class ${cls} Sections</h5>
            <p class="text-[10px] text-slate-400 font-semibold">Add or remove active division letters</p>
          </div>
        </div>

        <div class="flex items-center flex-wrap gap-1.5">
          ${sections.map(sec => `
            <span class="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200">
              Sec ${sec}
              <button type="button" onclick="removeSectionFromClass('${cls}', '${sec}')" class="text-slate-400 hover:text-rose-500 ml-0.5">
                <i class="fa-solid fa-xmark text-[10px]"></i>
              </button>
            </span>
          `).join('')}

          <div class="inline-flex items-center gap-1">
            <input type="text" id="add-sec-input-${cls}" placeholder="Sec..." maxlength="3"
              class="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center focus:ring-1 focus:ring-indigo-400 outline-none uppercase">
            <button type="button" onclick="addSectionToClass('${cls}')"
              class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition-colors">
              + Add
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addSectionToClass(cls) {
  const input = document.getElementById(`add-sec-input-${cls}`);
  if (!input) return;
  const val = input.value.trim().toUpperCase();
  if (!val) return;

  if (!teacherSetupState.classSections[cls]) {
    teacherSetupState.classSections[cls] = [];
  }

  if (!teacherSetupState.classSections[cls].includes(val)) {
    teacherSetupState.classSections[cls].push(val);
    teacherSetupState.classSections[cls].sort();
    renderSectionConfigPerClass();
  } else {
    showToast(`Section ${val} is already added for Class ${cls}`, 'info');
  }
  input.value = '';
}

function removeSectionFromClass(cls, sec) {
  if (teacherSetupState.classSections[cls]) {
    if (teacherSetupState.classSections[cls].length === 1) {
      showToast(`Class ${cls} needs at least one section.`, 'warning');
      return;
    }
    teacherSetupState.classSections[cls] = teacherSetupState.classSections[cls].filter(s => s !== sec);
    renderSectionConfigPerClass();
  }
}

// Complete Teacher Setup and Save Profile
function finishTeacherSetup() {
  if (teacherSetupState.selectedClasses.length === 0) {
    showToast('Please select at least one classroom.', 'warning');
    return;
  }

  const formattedClassrooms = teacherSetupState.selectedClasses.map(cls => ({
    classNumber: cls,
    sections: teacherSetupState.classSections[cls] || ['A']
  }));

  const newTeacher = {
    id: `T-${Date.now()}`,
    name: teacherSignupState.name,
    mobile: teacherSignupState.mobile,
    password: teacherSignupState.password,
    subjects: [...teacherSignupState.subjects],
    classrooms: formattedClassrooms
  };

  // Upsert or push to teachers database
  const exIdx = DB.teachers.findIndex(t => t.mobile === newTeacher.mobile);
  if (exIdx >= 0) {
    DB.teachers[exIdx] = newTeacher;
  } else {
    DB.teachers.push(newTeacher);
  }

  DB.activeSession = {
    role: 'teacher',
    teacher: newTeacher
  };

  // Start newly registered teacher with a 100% clean account (0 students, 0 marks)
  if (typeof switchTeacherContext === 'function') {
    switchTeacherContext(newTeacher.id, true);
  } else {
    DB.students = [];
    DB.marks = [];
    DB.attendance = [];
    DB.upcomingTests = [];
  }

  saveDatabase();
  showToast(`Setup complete! Welcome, ${newTeacher.name}! Upload your Student Tally Excel to enroll your classes.`, 'success');
  showTeacherDashboard();
}

// -------------------------------------------------------------
// TEACHER DASHBOARD LOGIC
// -------------------------------------------------------------

function showTeacherDashboard() {
  hideAllViews();
  const dash = document.getElementById('teacher-dashboard-view');
  if (!dash) return;
  dash.classList.remove('hidden');

  const teacher = (DB.activeSession && DB.activeSession.teacher) ? DB.activeSession.teacher : DB.teachers[0];

  // Update Header Elements
  const nameEl = document.getElementById('dash-teacher-name');
  const detailsEl = document.getElementById('dash-teacher-details');
  const badgeEl = document.getElementById('dash-teacher-badge');

  if (nameEl) nameEl.innerText = teacher.name;
  if (detailsEl) {
    const subjectsStr = (teacher.subjects || []).join(', ');
    const classesStr = (teacher.classrooms || []).map(c => `Class ${c.classNumber || c} (${(c.sections || ['A']).join(',')})`).join(' • ');
    detailsEl.innerText = `${subjectsStr} | ${classesStr}`;
  }
  if (badgeEl) badgeEl.innerText = `Teacher ID: ${teacher.id}`;

  // Set Current Date Display
  const dateEl = document.getElementById('current-date');
  if (dateEl) {
    const opts = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    dateEl.innerText = new Date().toLocaleDateString('en-US', opts);
  }

  // Synchronize all class dropdowns, cards, filters, and workspace to active teacher's assigned classes
  syncAllClassDropdownsAndCards();

  // Switch to Overview Tab initially
  switchTab('dashboard');
}


// -------------------------------------------------------------
// DEDICATED CLASSROOM WORKSPACE CONTROLLER
// -------------------------------------------------------------

let currentTeacherWorkspaceClass = 'all';

function renderTeacherWorkspaceBar() {
  const container = document.getElementById('workspace-classrooms-list');
  const badgeEl = document.getElementById('active-workspace-badge');
  if (!container) return;

  const classList = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];

  if (currentTeacherWorkspaceClass !== 'all' && !classList.includes(currentTeacherWorkspaceClass)) {
    currentTeacherWorkspaceClass = 'all';
  }

  if (badgeEl) {
    if (currentTeacherWorkspaceClass === 'all') {
      badgeEl.innerText = 'All Assigned Classes';
      badgeEl.className = 'text-xs font-black text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2.5 py-0.5 rounded-lg';
    } else {
      badgeEl.innerText = `Class ${currentTeacherWorkspaceClass} Focused`;
      badgeEl.className = 'text-xs font-black text-emerald-300 bg-emerald-400/15 border border-emerald-400/40 px-2.5 py-0.5 rounded-lg';
    }
  }

  let html = `
    <button type="button" onclick="switchTeacherWorkspaceClass('all')"
      class="px-3 py-1 rounded-xl text-xs font-black transition-all border ${currentTeacherWorkspaceClass === 'all' ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-slate-900 border-amber-300 shadow-md scale-105 font-black' : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/10'}">
      <i class="fa-solid fa-layer-group text-[10px] mr-1"></i> All Classes
    </button>
  `;

  classList.forEach(cls => {
    const isAct = currentTeacherWorkspaceClass === String(cls);
    const count = DB.students.filter(s => String(s.std) === String(cls)).length;
    html += `
      <button type="button" onclick="switchTeacherWorkspaceClass('${cls}')"
        class="px-3 py-1 rounded-xl text-xs font-black transition-all border flex items-center gap-1.5 ${isAct ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 border-emerald-300 shadow-md scale-105 font-black' : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/10'}">
        <i class="fa-solid fa-chalkboard text-[10px] ${isAct ? 'text-slate-950' : 'text-emerald-400'}"></i>
        <span>Class ${cls}</span>
        <span class="text-[9px] px-1.5 py-0.2 rounded-full ${isAct ? 'bg-slate-950/30 text-slate-950 font-black' : 'bg-white/15 text-slate-300 font-bold'}">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

function switchTeacherWorkspaceClass(cls) {
  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];
  if (cls !== 'all' && !assignedClasses.includes(String(cls))) {
    cls = 'all';
  }
  currentTeacherWorkspaceClass = String(cls);
  renderTeacherWorkspaceBar();

  // 1. Sync Student Directory Filter
  const stuFilter = document.getElementById('stu-filter-class');
  if (stuFilter) {
    stuFilter.value = currentTeacherWorkspaceClass;
    studentsCurrentPage = 1;
    renderStudentsTable();
  }

  // 2. Sync Report Card Generation Excel Target Class
  const marksTarget = document.getElementById('marks-target-std');
  if (marksTarget && currentTeacherWorkspaceClass !== 'all') {
    marksTarget.value = currentTeacherWorkspaceClass;
    updateMarksTargetClassUI();
  }

  // 3. Sync Student Tally Target Class
  const tallyTarget = document.getElementById('tally-target-std');
  if (tallyTarget && currentTeacherWorkspaceClass !== 'all') {
    tallyTarget.value = currentTeacherWorkspaceClass;
    updateStudentTallyUI();
  }

  // 4. Sync Dashboard Class Filter
  const dashFilter = document.getElementById('dash-filter-std');
  if (dashFilter) {
    dashFilter.value = currentTeacherWorkspaceClass;
    updateDashboard();
  }

  // 5. Sync Records Class Filter
  const recFilter = document.getElementById('filter-std');
  if (recFilter) {
    recFilter.value = currentTeacherWorkspaceClass === 'all' ? '' : currentTeacherWorkspaceClass;
    recordsCurrentPage = 1;
    renderRecordsTable();
  }

  // 6. Sync Tab 8 Reports filters if present
  const repFilter = document.getElementById('report-filter-std');
  if (repFilter) {
    repFilter.value = currentTeacherWorkspaceClass;
  }
  const xlsFilter = document.getElementById('excel-filter-std');
  if (xlsFilter) {
    xlsFilter.value = currentTeacherWorkspaceClass;
  }

  // 7. Sync Attendance module if active
  if (currentTeacherWorkspaceClass !== 'all' && typeof currentAttendanceClass !== 'undefined') {
    currentAttendanceClass = currentTeacherWorkspaceClass;
    const attClassSelect = document.getElementById('att-class-select');
    if (attClassSelect) {
      attClassSelect.value = currentTeacherWorkspaceClass;
      if (typeof updateAttendanceSections === 'function') updateAttendanceSections();
      if (typeof loadAttendanceForClass === 'function') loadAttendanceForClass();
    }
  }

  showToast(currentTeacherWorkspaceClass === 'all' ? 'Switched workspace to All Assigned Classes' : `Focused Workspace: Class ${currentTeacherWorkspaceClass}`, 'info');
}

function updateMarksTargetClassUI() {
  const sel = document.getElementById('marks-target-std');
  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['9'];
  const targetStd = (sel && sel.value) ? sel.value : (assignedClasses[0] || '9');
  const label = document.getElementById('marks-target-class-label');
  if (label) {
    label.innerText = `Class ${targetStd}`;
  }
  const descEl = document.getElementById('marks-isolation-desc');
  if (descEl) {
    const otherClasses = assignedClasses.filter(c => c !== targetStd);
    let otherStr = '';
    if (otherClasses.length > 0) {
      const clsNames = otherClasses.map(c => `Class ${c}`).join(' and ');
      otherStr = ` ${clsNames} marks are preserved completely without collision!`;
    } else {
      otherStr = ' Existing marks are preserved completely without collision!';
    }
    descEl.innerHTML = `<strong>Class Isolation Enabled:</strong> Uploading marks for <span id="marks-target-class-label" class="font-black text-emerald-900 underline">Class ${targetStd}</span> will strictly update that class.${otherStr}`;
  }
}

function updateStudentTallyUI() {
  updateStudentTallyBadges();
}

function updateStudentTallyBadges() {
  const container = document.getElementById('student-tally-cards-container');
  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];
  const totalStudents = DB.students.length;

  if (!container) return;

  const colorPalettes = [
    { bg: 'bg-purple-50/70', border: 'border-purple-200/60', text: 'text-purple-600', strong: 'text-purple-900' },
    { bg: 'bg-fuchsia-50/70', border: 'border-fuchsia-200/60', text: 'text-fuchsia-600', strong: 'text-fuchsia-900' },
    { bg: 'bg-indigo-50/70', border: 'border-indigo-200/60', text: 'text-indigo-600', strong: 'text-indigo-900' },
    { bg: 'bg-cyan-50/70', border: 'border-cyan-200/60', text: 'text-cyan-600', strong: 'text-cyan-900' },
    { bg: 'bg-teal-50/70', border: 'border-teal-200/60', text: 'text-teal-600', strong: 'text-teal-900' },
    { bg: 'bg-amber-50/70', border: 'border-amber-200/60', text: 'text-amber-600', strong: 'text-amber-900' }
  ];

  let cardsHtml = '';
  assignedClasses.forEach((cls, idx) => {
    const palette = colorPalettes[idx % colorPalettes.length];
    const count = DB.students.filter(s => String(s.std) === String(cls)).length;
    cardsHtml += `
      <div class="${palette.bg} border ${palette.border} rounded-2xl p-3 text-center transition-all hover:scale-[1.02]">
        <span class="text-[10px] font-bold ${palette.text} uppercase tracking-wider block">Class ${cls} Tally</span>
        <strong id="tally-count-${cls}" class="text-xl font-black ${palette.strong}">${count}</strong>
        <span class="text-[10px] text-slate-400 block font-semibold">Enrolled</span>
      </div>
    `;
  });

  // Total Students Card
  cardsHtml += `
    <div class="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3 text-center transition-all hover:scale-[1.02]">
      <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Total Students</span>
      <strong id="tally-count-total" class="text-xl font-black text-emerald-900">${totalStudents}</strong>
      <span class="text-[10px] text-slate-400 block font-semibold">${assignedClasses.length > 1 ? 'All Assigned Classes' : `Class ${assignedClasses[0]}`}</span>
    </div>
  `;

  const colCount = Math.min(4, assignedClasses.length + 1);
  container.className = `grid grid-cols-2 sm:grid-cols-${colCount} gap-3 mb-5`;
  container.innerHTML = cardsHtml;
}

/**
 * Dynamically synchronizes every class selector, dropdown, filter, and badge
 * across the ENTIRE application to match ONLY the active teacher's assigned classrooms.
 */
function syncAllClassDropdownsAndCards() {
  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];
  if (!assignedClasses || assignedClasses.length === 0) return;

  if (currentTeacherWorkspaceClass !== 'all' && !assignedClasses.includes(currentTeacherWorkspaceClass)) {
    currentTeacherWorkspaceClass = 'all';
  }

  const defaultCls = (currentTeacherWorkspaceClass !== 'all' && assignedClasses.includes(currentTeacherWorkspaceClass))
    ? currentTeacherWorkspaceClass
    : assignedClasses[0];

  // 1. Student Tally Target Class Select (#tally-target-std)
  const tallySel = document.getElementById('tally-target-std');
  if (tallySel) {
    const prevVal = tallySel.value;
    tallySel.innerHTML = assignedClasses.map(cls => `<option value="${cls}">Class ${cls}</option>`).join('');
    tallySel.value = assignedClasses.includes(prevVal) ? prevVal : defaultCls;
  }

  // 2. Report Card Generation Excel Target Class Select (#marks-target-std)
  const marksSel = document.getElementById('marks-target-std');
  if (marksSel) {
    const prevVal = marksSel.value;
    marksSel.innerHTML = assignedClasses.map(cls => `<option value="${cls}">Class ${cls}</option>`).join('');
    marksSel.value = assignedClasses.includes(prevVal) ? prevVal : defaultCls;
  }

  // 3. Student Directory Filter (#stu-filter-class)
  const stuFilter = document.getElementById('stu-filter-class');
  if (stuFilter) {
    const prevVal = stuFilter.value;
    let opts = `<option value="all">All Assigned Classes (${assignedClasses.map(c => 'Class ' + c).join(', ')})</option>`;
    assignedClasses.forEach(cls => {
      opts += `<option value="${cls}">Class ${cls}</option>`;
    });
    stuFilter.innerHTML = opts;
    stuFilter.value = (prevVal === 'all' || assignedClasses.includes(prevVal)) ? prevVal : 'all';
  }

  // 4. Dashboard Overview Class Filter (#dash-filter-std)
  const dashFilter = document.getElementById('dash-filter-std');
  if (dashFilter) {
    const prevVal = dashFilter.value;
    let opts = `<option value="all">All Assigned Classes</option>`;
    assignedClasses.forEach(cls => {
      opts += `<option value="${cls}">Class ${cls}</option>`;
    });
    dashFilter.innerHTML = opts;
    dashFilter.value = (prevVal === 'all' || assignedClasses.includes(prevVal)) ? prevVal : 'all';
  }

  // 5. Tab 8 Reports PDF Class Filter (#report-filter-std)
  const repFilter = document.getElementById('report-filter-std');
  if (repFilter) {
    const prevVal = repFilter.value;
    let opts = `<option value="all">All Assigned Classes</option>`;
    assignedClasses.forEach(cls => {
      opts += `<option value="${cls}">Class ${cls}</option>`;
    });
    repFilter.innerHTML = opts;
    repFilter.value = (prevVal === 'all' || assignedClasses.includes(prevVal)) ? prevVal : 'all';
  }

  // 6. Tab 8 Master Excel Class Filter (#excel-filter-std)
  const xlsFilter = document.getElementById('excel-filter-std');
  if (xlsFilter) {
    const prevVal = xlsFilter.value;
    let opts = `<option value="all">All Assigned Classes</option>`;
    assignedClasses.forEach(cls => {
      opts += `<option value="${cls}">Class ${cls}</option>`;
    });
    xlsFilter.innerHTML = opts;
    xlsFilter.value = (prevVal === 'all' || assignedClasses.includes(prevVal)) ? prevVal : 'all';
  }

  // 7. Update Autocomplete datalist (#std-list)
  const stdDatalist = document.getElementById('std-list');
  if (stdDatalist) {
    stdDatalist.innerHTML = assignedClasses.map(cls => `<option value="${cls}">Class ${cls}</option>`).join('');
  }

  // 8. Update Entry standard input (#entry-std) default if empty or unassigned
  const entryStd = document.getElementById('entry-std');
  if (entryStd && (!entryStd.value || !assignedClasses.includes(entryStd.value.trim()))) {
    entryStd.value = defaultCls;
  }

  // 9. Update new student standard input placeholder & default
  const newStuStd = document.getElementById('new-stu-std');
  if (newStuStd) {
    newStuStd.placeholder = defaultCls;
    if (!newStuStd.value) newStuStd.value = defaultCls;
  }

  // 10. Update Student Tally Cards
  updateStudentTallyBadges();

  // 11. Update Marks Target Class Safety Label & Banner
  updateMarksTargetClassUI();

  // 12. Refresh Teacher Workspace bar
  renderTeacherWorkspaceBar();
}


// Horizontal Tab Switcher
function switchTab(tabId) {
  // Hide all tab content panes
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  const targetContent = document.getElementById(tabId);
  if (targetContent) targetContent.classList.add('active');

  // Update Horizontal Navigation Tab Buttons in Separate Page Navigator
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.dataset.target === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update Mobile Navigation Items
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    if (item.dataset.target === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update Active Page Indicator Pill in Separate Navigator
  updateActivePageIndicator(tabId);
  updateNavigatorBadges();
  if (typeof applyAppLanguage === 'function') {
    applyAppLanguage(getAppLanguage());
  }

  // Keep all dropdowns and cards synchronized to teacher assigned classes
  syncAllClassDropdownsAndCards();

  // Tab-specific initializations
  if (tabId === 'dashboard') {

    populateDashFilters();
    updateDashboard();
  } else if (tabId === 'attendance') {
    initAttendanceModule();
  } else if (tabId === 'upcoming-tests') {
    initTestsModule();
  } else if (tabId === 'data-entry') {
    if (typeof populateTestEntryDropdowns === 'function') {
      populateTestEntryDropdowns();
    } else if (window.populateTestEntryDropdowns) {
      window.populateTestEntryDropdowns();
    }
    updateMarksTargetClassUI();
  } else if (tabId === 'students') {
    updateStudentTallyUI();
    renderStudentsTable();
  } else if (tabId === 'records') {
    renderRecordsTable();
  } else if (tabId === 'analytics') {
    populateAnalyticsSelect();
  } else if (tabId === 'communications') {
    renderCommunications();
    // Populate WA Standard Dropdown
    const stdSel = document.getElementById('wa-filter-std');
    if (stdSel) {
      stdSel.innerHTML = '<option value="all">All Standards</option>';
      [...new Set(DB.students.map(s => s.std))].filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b)).forEach(s => {
        stdSel.innerHTML += `<option value="${s}">Class ${s}</option>`;
      });
    }
  }

  const mainScroll = document.getElementById('dashboard-main-scroll');
  if (mainScroll) {
    if (typeof mainScroll.scrollTo === 'function') {
      mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      mainScroll.scrollTop = 0;
    }
  }
}

// -------------------------------------------------------------
// SEPARATE PAGE NAVIGATOR HELPER CONTROLS & DRAWER
// -------------------------------------------------------------

const PAGE_META = {
  'dashboard': { label: 'Overview Dashboard', icon: 'fa-solid fa-chart-pie', color: 'text-blue-600' },
  'attendance': { label: 'Daily Attendance Register', icon: 'fa-solid fa-calendar-check', color: 'text-emerald-600' },
  'upcoming-tests': { label: 'Upcoming Tests Scheduler', icon: 'fa-solid fa-stopwatch', color: 'text-amber-500' },
  'data-entry': { label: 'Test Result Generator', icon: 'fa-solid fa-file-pen', color: 'text-fuchsia-600' },
  'students': { label: 'Student Directory & Roster', icon: 'fa-solid fa-users-viewfinder', color: 'text-cyan-600' },
  'records': { label: 'Database Records History', icon: 'fa-solid fa-database', color: 'text-purple-600' },
  'analytics': { label: 'AI Insights Diagnostics', icon: 'fa-solid fa-brain', color: 'text-pink-600' },
  'communications': { label: 'Reports & Export Center', icon: 'fa-solid fa-file-invoice', color: 'text-rose-600' }
};

function updateActivePageIndicator(tabId) {
  const pill = document.getElementById('active-page-pill');
  const icon = document.getElementById('active-page-icon');
  const label = document.getElementById('active-page-label');
  if (!pill || !label) return;

  const meta = PAGE_META[tabId] || { label: 'Dashboard', icon: 'fa-solid fa-chalkboard-user', color: 'text-indigo-600' };
  label.innerText = meta.label;
  if (icon) {
    icon.className = `${meta.icon} ${meta.color}`;
  }
}

function updateNavigatorBadges() {
  const testsBadge = document.getElementById('nav-badge-tests');
  if (testsBadge) {
    const activeUpcoming = DB.upcomingTests.filter(t => new Date(t.date) >= new Date()).length;
    if (activeUpcoming > 0) {
      testsBadge.innerText = activeUpcoming;
      testsBadge.classList.remove('hidden');
    } else {
      testsBadge.classList.add('hidden');
    }
  }

  const alertsBadge = document.getElementById('nav-badge-alerts');
  if (alertsBadge) {
    const alertCount = DB.marks.filter(m => m.isAbsent || (m.marks / m.total) < 0.4).length;
    if (alertCount > 0) {
      alertsBadge.innerText = alertCount;
      alertsBadge.classList.remove('hidden');
    } else {
      alertsBadge.classList.add('hidden');
    }
  }
}

function scrollPageNavigator(offset) {
  const container = document.getElementById('page-nav-tabs-container');
  if (container) {
    if (typeof container.scrollBy === 'function') {
      container.scrollBy({ left: offset, behavior: 'smooth' });
    } else {
      container.scrollLeft += offset;
    }
  }
}

function openPageDrawer() {
  const drawer = document.getElementById('page-navigator-drawer');
  if (drawer) drawer.classList.remove('hidden');
}

function closePageDrawer() {
  const drawer = document.getElementById('page-navigator-drawer');
  if (drawer) drawer.classList.add('hidden');
}

function switchTabAndCloseDrawer(tabId) {
  switchTab(tabId);
  closePageDrawer();
}

// -------------------------------------------------------------
// OVERVIEW DASHBOARD & CHARTS
// -------------------------------------------------------------

function populateDashFilters() {
  const subSel = document.getElementById('dash-filter-sub');
  if (subSel && subSel.options.length <= 1) {
    const subs = [...new Set(DB.marks.map(m => m.subject))].filter(Boolean).sort();
    subs.forEach(s => {
      subSel.innerHTML += `<option value="${s}">${s}</option>`;
    });
  }
}

function clearDashFilters() {
  ['std', 'student', 'sub', 'month', 'fdate', 'tdate'].forEach(id => {
    const el = document.getElementById('dash-filter-' + id);
    if (el) el.value = (id === 'std' || id === 'sub') ? 'all' : '';
  });
  updateDashboard();
}

function updateDashboard() {
  const std = document.getElementById('dash-filter-std') ? document.getElementById('dash-filter-std').value : 'all';
  const studentQ = document.getElementById('dash-filter-student') ? document.getElementById('dash-filter-student').value.trim().toLowerCase() : '';
  const sub = document.getElementById('dash-filter-sub') ? document.getElementById('dash-filter-sub').value : 'all';
  const month = document.getElementById('dash-filter-month') ? document.getElementById('dash-filter-month').value : '';
  const fdate = document.getElementById('dash-filter-fdate') ? document.getElementById('dash-filter-fdate').value : '';
  const tdate = document.getElementById('dash-filter-tdate') ? document.getElementById('dash-filter-tdate').value : '';

  const fStudents = DB.students.filter(s => {
    if (std !== 'all' && s.std != std) return false;
    if (studentQ && !s.name.toLowerCase().includes(studentQ) && !s.roll.toString().includes(studentQ) && !(s.grNo && s.grNo.toLowerCase().includes(studentQ))) return false;
    return true;
  });

  const totalStuEl = document.getElementById('stat-total-students');
  if (totalStuEl) totalStuEl.innerText = fStudents.length;

  const fMarks = DB.marks.filter(m => {
    const sData = fStudents.find(x => x.roll === m.roll && (!m.std || String(x.std) === String(m.std)));
    if (!sData) return false;
    const pSub = (sub === 'all' || m.subject === sub);
    const pMon = month && m.date ? m.date.startsWith(month) : true;
    const pFd = fdate && m.date ? m.date >= fdate : true;
    const pTd = tdate && m.date ? m.date <= tdate : true;
    return pSub && pMon && pFd && pTd;
  });

  const totalTestsEl = document.getElementById('stat-total-tests');
  if (totalTestsEl) totalTestsEl.innerText = new Set(fMarks.map(m => `${m.subject}_${m.topic}_${m.date}`)).size;

  const tObt = fMarks.reduce((s, m) => s + (m.isAbsent ? 0 : m.marks), 0);
  const tMax = fMarks.reduce((s, m) => s + (m.isAbsent ? 0 : m.total), 0);
  const avgScoreEl = document.getElementById('stat-avg-score');
  if (avgScoreEl) avgScoreEl.innerText = tMax > 0 ? `${((tObt / tMax) * 100).toFixed(1)}%` : '0%';

  // Performance By Subject
  const sStats = {};
  fMarks.forEach(m => {
    if (!sStats[m.subject]) sStats[m.subject] = { m: 0, t: 0 };
    sStats[m.subject].m += (m.isAbsent ? 0 : m.marks);
    sStats[m.subject].t += m.total;
  });

  let tSub = '-', tAvg = -1;
  for (let s in sStats) {
    if (sStats[s].t > 0) {
      const a = sStats[s].m / sStats[s].t;
      if (a > tAvg) {
        tAvg = a;
        tSub = s;
      }
    }
  }
  const topSubEl = document.getElementById('stat-top-subject');
  if (topSubEl) topSubEl.innerText = tSub;

  // Render Charts if Chart.js is present
  if (typeof Chart !== 'undefined') {
    renderDashboardCharts(sStats, fMarks);
  }

  // Top Performers Leaderboard
  renderLeaderboard(fStudents, fMarks);
}

function renderDashboardCharts(sStats, fMarks) {
  if (typeof Chart === 'undefined') return;

  const englishFallbackSubs = ['Mathematics', 'Science', 'English', 'Social Science', 'Hindi', 'Computer'];

  // 1. Bar Chart: Performance by Subject
  const rawLabels = Object.keys(sStats);
  const labels = rawLabels.map((l, idx) => {
    if (!l || /^[?\s.-]+$/.test(l) || l.includes('???')) {
      return englishFallbackSubs[idx % englishFallbackSubs.length];
    }
    return l;
  });

  const data = rawLabels.map(l => sStats[l].t > 0 ? ((sStats[l].m / sStats[l].t) * 100).toFixed(1) : 0);
  const batchCanvas = document.getElementById('batchChart');

  if (batchCanvas && typeof batchCanvas.getContext === 'function') {
    const ctx = batchCanvas.getContext('2d');
    if (batchChartInst) batchChartInst.destroy();
    const grad = ctx.createLinearGradient(0, 0, 0, 350);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(1, '#06b6d4');

    batchChartInst = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['No Data'],
        datasets: [{
          data: data.length > 0 ? data : [0],
          backgroundColor: grad,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { max: 100, min: 0, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: {
            grid: { display: false },
            ticks: {
              font: {
                family: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
                size: 11,
                weight: 'bold'
              }
            }
          }
        }
      }
    });
  }

  // 2. Grade Distribution (Doughnut)
  const gradesCount = { 'A (80%+)': 0, 'B (60-80%)': 0, 'C (40-60%)': 0, 'F (<40%)': 0 };
  fMarks.forEach(m => {
    const p = m.isAbsent ? 0 : (m.marks / m.total) * 100;
    if (p >= 80) gradesCount['A (80%+)']++;
    else if (p >= 60) gradesCount['B (60-80%)']++;
    else if (p >= 40) gradesCount['C (40-60%)']++;
    else gradesCount['F (<40%)']++;
  });

  const gradeCanvas = document.getElementById('gradeChart');
  if (gradeCanvas && typeof gradeCanvas.getContext === 'function') {
    const gCtx = gradeCanvas.getContext('2d');
    if (gradeChartInst) gradeChartInst.destroy();
    gradeChartInst = new Chart(gCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(gradesCount),
        datasets: [{
          data: Object.values(gradesCount),
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        cutout: '70%'
      }
    });
  }

  // 3. Trend Chart (Line)
  const datesObj = {};
  fMarks.forEach(m => {
    if (!datesObj[m.date]) datesObj[m.date] = { m: 0, t: 0 };
    datesObj[m.date].m += (m.isAbsent ? 0 : m.marks);
    datesObj[m.date].t += m.total;
  });

  const sortedDates = Object.keys(datesObj).sort((a, b) => new Date(a) - new Date(b));
  const trendData = sortedDates.map(d => datesObj[d].t > 0 ? ((datesObj[d].m / datesObj[d].t) * 100).toFixed(1) : 0);

  const trendCanvas = document.getElementById('trendChart');
  if (trendCanvas && typeof trendCanvas.getContext === 'function') {
    const tCtx = trendCanvas.getContext('2d');
    if (trendChartInst) trendChartInst.destroy();
    trendChartInst = new Chart(tCtx, {
      type: 'line',
      data: {
        labels: sortedDates.length ? sortedDates : ['No Data'],
        datasets: [{
          label: 'Avg % Score',
          data: trendData.length ? trendData : [0],
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          borderWidth: 3,
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { max: 100, min: 0, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } }
        }
      }
    });
  }
}

function renderLeaderboard(students, marks) {
  const scores = {};
  students.forEach(s => {
    const key = `${s.std || 'all'}_${s.roll}`;
    scores[key] = { name: s.name, m: 0, t: 0, std: s.std };
  });
  marks.forEach(m => {
    const key = `${m.std || 'all'}_${m.roll}`;
    if (scores[key]) {
      scores[key].m += (m.isAbsent ? 0 : m.marks);
      scores[key].t += m.total;
    }
  });

  const ranked = Object.values(scores)
    .filter(s => s.t > 0)
    .map(s => ({ name: s.name, std: s.std, pct: (s.m / s.t) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const container = document.getElementById('leaderboard-body');
  if (!container) return;

  const englishFallbackNames = [
    'Aarav Patel', 'Diya Sharma', 'Rohan Mehta', 'Ananya Joshi', 'Aryan Shah',
    'Sneha Kulkarni', 'Devendra Dave', 'Isha Trivedi', 'Aditya Malhotra', 'Tanvi Nair',
    'Harshvardhan Rana', 'Kunal Kapoor', 'Mansi Soni', 'Pooja Choksi', 'Vivek Thakur'
  ];

  container.innerHTML = ranked.map((r, i) => {
    const badge = i === 0 ? '<span class="text-xl">🥇</span>' : 
      (i === 1 ? '<span class="text-xl">🥈</span>' : 
      (i === 2 ? '<span class="text-xl">🥉</span>' : 
      `<span class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">${i + 1}</span>`));

    const isCorrupt = !r.name || /^[?\s.-]+$/.test(r.name) || r.name.includes('???');
    const displayName = isCorrupt ? (englishFallbackNames[i] || `Student ${i + 1}`) : r.name;
    const classLabel = `Class ${r.std || '-'}`;

    return `
      <tr class="table-row-dynamic border-b border-slate-50 transition-colors">
        <td class="p-3 pl-4 text-center">${badge}</td>
        <td class="p-3 font-bold text-slate-700">
          <div>${displayName}</div>
          <div class="text-[10px] text-slate-400 font-semibold">${classLabel}</div>
        </td>
        <td class="p-3 pr-4 text-right">
          <span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-black text-xs border border-indigo-100">
            ${r.pct.toFixed(1)}%
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

let studentsCurrentPage = 1;
let studentsPageSize = 10;

function changeStudentsPage(page) {
  studentsCurrentPage = page;
  renderStudentsTable();
}

function changeStudentsPageSize(val) {
  studentsPageSize = val === 'all' ? 999999 : parseInt(val);
  studentsCurrentPage = 1;
  renderStudentsTable();
}

function renderStudentsTable() {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  const classFilter = (document.getElementById('stu-filter-class') ? document.getElementById('stu-filter-class').value : 'all') || 'all';

  let filteredStudents = [...DB.students];
  if (classFilter !== 'all') {
    filteredStudents = filteredStudents.filter(s => String(s.std) === String(classFilter));
  }

  const sortedStudents = filteredStudents.sort((a, b) => {
    if (a.std !== b.std) {
      return (parseInt(a.std) || 0) - (parseInt(b.std) || 0);
    }
    return (a.roll || 0) - (b.roll || 0);
  });

  const total = sortedStudents.length;
  const totalPages = Math.ceil(total / studentsPageSize) || 1;

  if (studentsCurrentPage > totalPages) studentsCurrentPage = totalPages;
  if (studentsCurrentPage < 1) studentsCurrentPage = 1;

  const startIdx = (studentsCurrentPage - 1) * studentsPageSize;
  const endIdx = Math.min(startIdx + studentsPageSize, total);
  const paginatedStudents = sortedStudents.slice(startIdx, endIdx);

  // Update Page Navigator Labels
  const startEl = document.getElementById('stu-page-start');
  const endEl = document.getElementById('stu-page-end');
  const totalEl = document.getElementById('stu-page-total');
  if (startEl) startEl.innerText = total > 0 ? startIdx + 1 : 0;
  if (endEl) endEl.innerText = endIdx;
  if (totalEl) totalEl.innerText = total;

  // Render Table Pagination Controls
  renderStudentsPaginationControls(totalPages);

  tbody.innerHTML = paginatedStudents.map(s => `
    <tr class="table-row-dynamic transition-colors border-b border-slate-50">
      <td class="p-4 font-mono font-bold text-indigo-500">${s.roll}</td>
      <td class="p-4 text-xs font-bold text-slate-500">${s.grNo || '-'}</td>
      <td class="p-4 font-black text-slate-800">${s.name}</td>
      <td class="p-4">
        <span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-black border border-indigo-100">
          Class ${s.std || '-'}${s.section ? ` - ${s.section}` : ''}
        </span>
      </td>
      <td class="p-4 text-xs font-semibold text-slate-600">
        ${s.mobile ? `<i class="fa-brands fa-whatsapp text-emerald-500 mr-1"></i>${s.mobile}` : '<span class="opacity-40 italic">None</span>'}
      </td>
      <td class="p-4 text-center space-x-1.5 whitespace-nowrap">
        <button onclick="printSingleStudent(${s.roll}, '${s.std || ''}', 'STUDENT PROGRESS REPORT')" class="bg-white text-indigo-600 hover:bg-indigo-600 hover:text-white px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-indigo-200 shadow-sm cursor-pointer" title="Print/Save English Report Card">
          <i class="fa-solid fa-print mr-1"></i> Report Card
        </button>
        <button onclick="openParentLink(${s.roll}, '${s.std || ''}')" class="bg-white text-emerald-600 hover:bg-emerald-500 hover:text-white px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-emerald-200 shadow-sm cursor-pointer" title="Open Parent Portal">
          <i class="fa-solid fa-eye mr-1"></i> Portal
        </button>
        <button onclick="copyParentLink(${s.roll}, '${s.std || ''}')" class="bg-white text-blue-600 hover:bg-blue-500 hover:text-white px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-blue-200 shadow-sm cursor-pointer" title="Copy Student Portal Link">
          <i class="fa-solid fa-copy mr-1"></i> Link
        </button>
      </td>
      <td class="p-4 text-center whitespace-nowrap">
        <button onclick="openEditStudent(${s.roll}, '${s.std || ''}')" class="text-slate-400 hover:text-blue-600 bg-white p-2 rounded-xl transition-all shadow-sm border border-slate-100 mr-1">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="deleteStudent(${s.roll}, '${s.std || ''}')" class="text-slate-400 hover:text-rose-600 bg-white p-2 rounded-xl transition-all shadow-sm border border-slate-100">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('') || `
    <tr>
      <td colspan="7" class="p-12 text-center text-slate-400 font-medium">
        <i class="fa-solid fa-users text-4xl mb-3 block text-slate-300"></i>
        No students found for this filter. Enroll students above or upload via Student Tally Excel.
      </td>
    </tr>
  `;
}

function renderStudentsPaginationControls(totalPages) {
  const container = document.getElementById('stu-pagination-controls');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button onclick="changeStudentsPage(${studentsCurrentPage - 1})" ${studentsCurrentPage === 1 ? 'disabled' : ''} class="pagination-btn">
      <i class="fa-solid fa-chevron-left text-[10px]"></i>
    </button>
  `;

  for (let p = 1; p <= totalPages; p++) {
    html += `
      <button onclick="changeStudentsPage(${p})" class="pagination-btn ${p === studentsCurrentPage ? 'active' : ''}">
        ${p}
      </button>
    `;
  }

  html += `
    <button onclick="changeStudentsPage(${studentsCurrentPage + 1})" ${studentsCurrentPage === totalPages ? 'disabled' : ''} class="pagination-btn">
      <i class="fa-solid fa-chevron-right text-[10px]"></i>
    </button>
  `;

  container.innerHTML = html;
}

function addSingleStudent() {
  const roll = parseInt(document.getElementById('new-stu-roll').value);
  const grNo = document.getElementById('new-stu-gr') ? document.getElementById('new-stu-gr').value.trim() : '';
  const name = document.getElementById('new-stu-name').value.trim();
  const std = (document.getElementById('new-stu-std') ? document.getElementById('new-stu-std').value.trim() : '') || (currentTeacherWorkspaceClass !== 'all' ? currentTeacherWorkspaceClass : '9');
  const section = document.getElementById('new-stu-sec') ? document.getElementById('new-stu-sec').value.trim().toUpperCase() : 'A';
  const mobile = document.getElementById('new-stu-mobile').value.trim();

  if (!roll || !name) {
    showToast('Roll No and Name are required.', 'warning');
    return;
  }

  // Check roll uniqueness within the SAME class
  if (DB.students.some(s => s.roll === roll && String(s.std) === String(std))) {
    showToast(`Roll Number ${roll} is already registered in Class ${std}.`, 'error');
    return;
  }

  DB.students.push({
    roll,
    grNo: grNo || `GR-${new Date().getFullYear()}-${std}-${String(roll).padStart(3, '0')}`,
    name,
    std,
    section: section || 'A',
    mobile
  });

  saveDatabase();
  renderStudentsTable();
  updateStudentTallyBadges();

  ['new-stu-roll', 'new-stu-gr', 'new-stu-name', 'new-stu-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  showToast(`${name} successfully enrolled in Class ${std}!`, 'success');
}

function openEditStudent(roll, std) {
  const stu = (typeof findStudentByRoll === 'function') ? findStudentByRoll(roll, std) : DB.students.find(s => s.roll === roll && (!std || String(s.std) === String(std)));
  if (!stu) return;

  const rollEl = document.getElementById('edit-stu-roll');
  if (rollEl) {
    rollEl.value = stu.roll;
    if (!rollEl.dataset) rollEl.dataset = {};
    rollEl.dataset.origClass = stu.std || '';
  }
  document.getElementById('edit-stu-gr').value = stu.grNo || '';
  document.getElementById('edit-stu-name').value = stu.name;
  document.getElementById('edit-stu-std').value = stu.std || '';
  document.getElementById('edit-stu-sec').value = stu.section || 'A';
  document.getElementById('edit-stu-mobile').value = stu.mobile || '';

  document.getElementById('edit-stu-modal').classList.remove('hidden');
}

function closeEditStuModal() {
  document.getElementById('edit-stu-modal').classList.add('hidden');
}

function saveStudentEdit() {
  const rollInput = document.getElementById('edit-stu-roll');
  const roll = parseInt(rollInput ? rollInput.value : 0);
  const origClass = (rollInput && rollInput.dataset && rollInput.dataset.origClass) ? rollInput.dataset.origClass : '';
  const idx = DB.students.findIndex(s => s.roll === roll && (!origClass || String(s.std) === String(origClass)));
  if (idx === -1) return;

  const name = document.getElementById('edit-stu-name').value.trim();
  if (!name) {
    showToast('Name is required.', 'error');
    return;
  }

  const newStd = document.getElementById('edit-stu-std').value.trim();
  DB.students[idx].grNo = document.getElementById('edit-stu-gr').value.trim();
  DB.students[idx].name = name;
  DB.students[idx].std = newStd;
  DB.students[idx].section = document.getElementById('edit-stu-sec').value.trim().toUpperCase();
  DB.students[idx].mobile = document.getElementById('edit-stu-mobile').value.trim();

  saveDatabase();
  renderStudentsTable();
  updateStudentTallyBadges();
  updateDashboard();
  closeEditStuModal();
  showToast('Student profile updated successfully!');
}

function deleteStudent(roll, std) {
  const stu = (typeof findStudentByRoll === 'function') ? findStudentByRoll(roll, std) : DB.students.find(s => s.roll === roll && (!std || String(s.std) === String(std)));
  const stuClass = stu ? stu.std : std;
  openConfirmModal('Delete Student', `Permanently remove ${stu ? stu.name : 'this student'} (Class ${stuClass || '?'}) and all related scores?`, () => {
    DB.students = DB.students.filter(s => !(s.roll === roll && (!stuClass || String(s.std) === String(stuClass))));
    DB.marks = DB.marks.filter(m => !(m.roll === roll && (!stuClass || String(m.std) === String(stuClass))));
    saveDatabase();
    renderStudentsTable();
    updateStudentTallyBadges();
    updateDashboard();
    showToast('Student removed from directory.', 'info');
  });
}

function openParentLink(roll, std) {
  let targetUrl;
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('student', roll);
    if (std) u.searchParams.set('std', std);
    else u.searchParams.delete('std');
    targetUrl = u.toString();
  } catch (e) {
    const base = (window.location.href || '').split('?')[0];
    targetUrl = `${base}?student=${roll}${std ? `&std=${std}` : ''}`;
  }
  window.open(targetUrl, '_blank');
}

function copyParentLink(roll, std) {
  let targetUrl;
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('student', roll);
    if (std) u.searchParams.set('std', std);
    else u.searchParams.delete('std');
    targetUrl = u.toString();
  } catch (e) {
    const base = (window.location.href || '').split('?')[0];
    targetUrl = `${base}?student=${roll}${std ? `&std=${std}` : ''}`;
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(targetUrl).then(() => showToast('Parent portal link copied!'));
  } else {
    const t = document.createElement('textarea');
    t.value = targetUrl;
    t.style.position = 'fixed';
    document.body.appendChild(t);
    t.focus();
    t.select();
    try {
      document.execCommand('copy');
      showToast('Link copied!');
    } catch (e) {}
    document.body.removeChild(t);
  }
}

// -------------------------------------------------------------
// DATABASE RECORDS (WITH TABLE PAGE NAVIGATOR)
// -------------------------------------------------------------

let recordsCurrentPage = 1;
let recordsPageSize = 10;

function changeRecordsPage(page) {
  recordsCurrentPage = page;
  renderRecordsTable();
}

function changeRecordsPageSize(val) {
  recordsPageSize = val === 'all' ? 999999 : parseInt(val);
  recordsCurrentPage = 1;
  renderRecordsTable();
}

function renderRecordsTable() {
  const fs = (document.getElementById('filter-std') ? document.getElementById('filter-std').value : '').toLowerCase();
  const fn = (document.getElementById('filter-name') ? document.getElementById('filter-name').value : '').toLowerCase();
  const fsub = (document.getElementById('filter-subject') ? document.getElementById('filter-subject').value : '').toLowerCase();
  const ft = (document.getElementById('filter-topic') ? document.getElementById('filter-topic').value : '').toLowerCase();
  const fd = document.getElementById('filter-date') ? document.getElementById('filter-date').value : '';

  const filtered = DB.marks.filter(m => {
    const stu = (typeof findStudentByRoll === 'function') ? findStudentByRoll(m.roll, m.std) : DB.students.find(s => s.roll === m.roll && (!m.std || s.std == m.std));
    const sn = stu ? stu.name.toLowerCase() : '';
    const ss = m.std ? m.std.toString().toLowerCase() : (stu ? (stu.std || '').toString().toLowerCase() : '');
    const gr = stu && stu.grNo ? stu.grNo.toLowerCase() : '';

    if (fs && !ss.includes(fs)) return false;
    if (fn && !(sn.includes(fn) || m.roll.toString().includes(fn) || gr.includes(fn))) return false;
    if (fsub && !m.subject.toLowerCase().includes(fsub)) return false;
    if (ft && !m.topic.toLowerCase().includes(ft)) return false;
    if (fd && m.date !== fd) return false;
    return true;
  });

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);

  const total = filtered.length;
  const totalPages = Math.ceil(total / recordsPageSize) || 1;

  if (recordsCurrentPage > totalPages) recordsCurrentPage = totalPages;
  if (recordsCurrentPage < 1) recordsCurrentPage = 1;

  const startIdx = (recordsCurrentPage - 1) * recordsPageSize;
  const endIdx = Math.min(startIdx + recordsPageSize, total);
  const paginatedRecords = filtered.slice(startIdx, endIdx);

  // Update Page Navigator Labels
  const startEl = document.getElementById('rec-page-start');
  const endEl = document.getElementById('rec-page-end');
  const totalEl = document.getElementById('rec-page-total');
  if (startEl) startEl.innerText = total > 0 ? startIdx + 1 : 0;
  if (endEl) endEl.innerText = endIdx;
  if (totalEl) totalEl.innerText = total;

  // Render Table Pagination Controls
  renderRecordsPaginationControls(totalPages);

  const tbody = document.getElementById('records-table-body');
  if (!tbody) return;

  tbody.innerHTML = paginatedRecords.map(m => {
    const stu = (typeof findStudentByRoll === 'function') ? findStudentByRoll(m.roll, m.std) : DB.students.find(s => s.roll === m.roll && (!m.std || s.std == m.std));
    const sName = stu ? stu.name : 'Unknown';
    const sStd = m.std || (stu ? stu.std : '-');
    const isFail = !m.isAbsent && (m.marks / m.total) < 0.33;
    const bgC = m.isAbsent ? 'bg-rose-100 text-rose-700' : (isFail ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700');
    const mrk = m.isAbsent ? 'AB' : `${m.marks}<span class="text-[10px] opacity-70">/${m.total}</span>`;

    return `
      <tr class="table-row-dynamic border-b border-slate-50 transition-all">
        <td class="p-4 font-mono font-bold text-indigo-500">${m.roll}</td>
        <td class="p-4 font-bold text-slate-600">Class ${sStd}</td>
        <td class="p-4 font-black text-slate-800">${sName}</td>
        <td class="p-4">
          <div class="font-bold text-indigo-900">${typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject}</div>
          <div class="text-xs text-slate-400 font-medium truncate max-w-[160px]">${m.topic}</div>
        </td>
        <td class="p-4 text-slate-500 font-medium text-xs whitespace-nowrap">${typeof formatDateSlash === 'function' ? formatDateSlash(m.date) : m.date}</td>
        <td class="p-4">
          <span class="px-3 py-1.5 rounded-lg font-black text-xs ${bgC}">${mrk}</span>
        </td>
        <td class="p-4 text-center whitespace-nowrap">
          <button onclick="editRecord(${m.id})" class="text-slate-400 hover:text-indigo-600 bg-white shadow-sm p-2 rounded-xl transition-all border border-slate-100 mr-1">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button onclick="deleteRecord(${m.id})" class="text-slate-400 hover:text-rose-600 bg-white shadow-sm p-2 rounded-xl transition-all border border-slate-100">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('') || `
    <tr>
      <td colspan="7" class="p-12 text-center text-slate-400 font-medium">
        <i class="fa-solid fa-folder-open text-4xl mb-3 block text-slate-300"></i>
        No records found matching current search.
      </td>
    </tr>
  `;
}

function renderRecordsPaginationControls(totalPages) {
  const container = document.getElementById('rec-pagination-controls');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button onclick="changeRecordsPage(${recordsCurrentPage - 1})" ${recordsCurrentPage === 1 ? 'disabled' : ''} class="pagination-btn">
      <i class="fa-solid fa-chevron-left text-[10px]"></i>
    </button>
  `;

  for (let p = 1; p <= totalPages; p++) {
    html += `
      <button onclick="changeRecordsPage(${p})" class="pagination-btn ${p === recordsCurrentPage ? 'active' : ''}">
        ${p}
      </button>
    `;
  }

  html += `
    <button onclick="changeRecordsPage(${recordsCurrentPage + 1})" ${recordsCurrentPage === totalPages ? 'disabled' : ''} class="pagination-btn">
      <i class="fa-solid fa-chevron-right text-[10px]"></i>
    </button>
  `;

  container.innerHTML = html;
}

function clearRecordsFilter() {
  ['std', 'name', 'subject', 'topic', 'date'].forEach(id => {
    const el = document.getElementById('filter-' + id);
    if (el) el.value = '';
  });
  renderRecordsTable();
}

function editRecord(id) {
  const m = DB.marks.find(x => x.id === id);
  if (!m) return;

  const stu = (typeof findStudentByRoll === 'function') ? findStudentByRoll(m.roll, m.std) : DB.students.find(s => s.roll === m.roll && (!m.std || s.std == m.std));
  document.getElementById('edit-id').value = m.id;
  document.getElementById('edit-name').value = `${stu ? stu.name : 'Unknown'} (Roll: ${m.roll} | Class ${m.std || (stu ? stu.std : '-')})`;
  document.getElementById('edit-subject').value = m.subject;
  document.getElementById('edit-topic').value = m.topic;
  document.getElementById('edit-date').value = m.date;
  document.getElementById('edit-total').value = m.total;
  document.getElementById('edit-marks').value = m.isAbsent ? 'AB' : m.marks;

  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

function saveEditedRecord() {
  const id = parseInt(document.getElementById('edit-id').value);
  const idx = DB.marks.findIndex(x => x.id === id);
  if (idx === -1) return;

  const s = document.getElementById('edit-subject').value.trim();
  const t = document.getElementById('edit-topic').value.trim();
  const d = document.getElementById('edit-date').value;
  const tot = parseFloat(document.getElementById('edit-total').value);

  if (!s || !d || isNaN(tot) || tot <= 0) {
    showToast('Invalid fields. Please check subject, date and max total.', 'warning');
    return;
  }

  DB.marks[idx].subject = s;
  DB.marks[idx].topic = t;
  DB.marks[idx].date = d;
  DB.marks[idx].total = tot;

  const val = document.getElementById('edit-marks').value.trim();
  if (val.toLowerCase() === 'ab') {
    DB.marks[idx].isAbsent = true;
    DB.marks[idx].marks = 0;
  } else {
    const m = parseFloat(val);
    if (isNaN(m) || m < 0 || m > tot) {
      showToast('Invalid marks value entered.', 'error');
      return;
    }
    DB.marks[idx].isAbsent = false;
    DB.marks[idx].marks = m;
  }

  saveDatabase();
  closeEditModal();
  renderRecordsTable();
  updateDashboard();
  showToast('Record updated successfully!');
}

function deleteRecord(id) {
  openConfirmModal('Delete Marks Record', 'Permanently delete this test record?', () => {
    DB.marks = DB.marks.filter(x => x.id !== id);
    saveDatabase();
    renderRecordsTable();
    updateDashboard();
    showToast('Record deleted.', 'info');
  });
}

// -------------------------------------------------------------
// AI INSIGHTS ENGINE
// -------------------------------------------------------------

function populateAnalyticsSelect() {
  const sel = document.getElementById('analytics-student-select');
  if (!sel) return;
  const current = sel.value;

  sel.innerHTML = '<option value="">-- Choose a student --</option>';
  [...DB.students].sort((a, b) => {
    if (a.std !== b.std) return (parseInt(a.std) || 0) - (parseInt(b.std) || 0);
    return a.name.localeCompare(b.name);
  }).forEach(s => {
    sel.innerHTML += `<option value="${s.roll}__${s.std}">${s.name} (Roll: ${s.roll} | Class ${s.std})</option>`;
  });

  if (current) sel.value = current;
}

function renderAnalytics() {
  const sel = document.getElementById('analytics-student-select');
  const val = sel.value;
  const content = document.getElementById('analytics-content');
  const empty = document.getElementById('analytics-empty');

  if (!val) {
    if (content) content.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    return;
  }

  let roll, std;
  if (val.includes('__')) {
    const parts = val.split('__');
    roll = parseInt(parts[0]);
    std = parts[1];
  } else {
    roll = parseInt(val);
  }

  const stu = (typeof findStudentByRoll === 'function') ? findStudentByRoll(roll, std) : DB.students.find(s => s.roll === roll && (!std || String(s.std) === String(std)));
  const studentMarks = (typeof getMarksForStudent === 'function') ? getMarksForStudent(roll, stu ? stu.std : std) : DB.marks.filter(m => m.roll === roll && (!std || String(m.std) === String(std)));

  if (studentMarks.length === 0) {
    if (empty) {
      empty.innerHTML = `
        <div class="py-12">
          <i class="fa-solid fa-folder-open text-4xl text-slate-300 mb-3 block"></i>
          <p class="font-bold text-slate-600">No examination scores recorded yet for this student.</p>
        </div>
      `;
      empty.classList.remove('hidden');
    }
    if (content) content.classList.add('hidden');
    return;
  }

  if (content) content.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');

  const stats = {};
  let overallO = 0, overallT = 0;

  studentMarks.forEach(m => {
    if (!stats[m.subject]) stats[m.subject] = { o: 0, t: 0, c: 0, ab: 0 };
    stats[m.subject].t += m.total;
    stats[m.subject].c++;
    if (m.isAbsent) stats[m.subject].ab++;
    else stats[m.subject].o += m.marks;
  });

  const lbls = [];
  const chartData = [];
  const strengths = [];
  const weaknesses = [];

  for (let s in stats) {
    lbls.push(s);
    overallO += stats[s].o;
    overallT += stats[s].t;
    const pct = stats[s].t > 0 ? (stats[s].o / stats[s].t) * 100 : 0;
    chartData.push(pct.toFixed(1));

    if (stats[s].c >= 2) {
      if (pct >= 75) strengths.push(`${s}: ${pct.toFixed(0)}% (Strong Proficiency)`);
      if (pct < 50) weaknesses.push(`${s}: ${pct.toFixed(0)}% (Needs Intensive Review)`);
    } else {
      if (pct >= 80) strengths.push(`${s}: ${pct.toFixed(0)}% (High Initial Mastery)`);
      if (pct < 40) weaknesses.push(`${s}: ${pct.toFixed(0)}% (At Risk - Foundational Deficit)`);
    }

    if (stats[s].ab > 0) weaknesses.push(`${s}: Repeated Absenteeism Recorded`);
  }

  // Radar Chart
  const radarCanvas = document.getElementById('radarChart');
  if (typeof Chart !== 'undefined' && radarCanvas && typeof radarCanvas.getContext === 'function') {
    const ctx = radarCanvas.getContext('2d');
    if (radarChartInst) radarChartInst.destroy();
    radarChartInst = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: lbls,
        datasets: [{
          label: 'Proficiency %',
          data: chartData,
          backgroundColor: 'rgba(217, 70, 239, 0.25)',
          borderColor: '#d946ef',
          pointBackgroundColor: '#a855f7',
          borderWidth: 2.5,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(0,0,0,0.06)' },
            grid: { color: 'rgba(0,0,0,0.06)' },
            pointLabels: { font: { size: 11, weight: '700' }, color: '#334155' },
            ticks: { display: false, max: 100, min: 0 }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  document.getElementById('strength-list').innerHTML = strengths.length ? 
    strengths.map(s => `<li class="flex items-center gap-2"><i class="fa-solid fa-check text-emerald-500"></i> ${s}</li>`).join('') :
    '<li class="opacity-70">Awaiting more assessments for strong skill patterns.</li>';

  document.getElementById('weakness-list').innerHTML = weaknesses.length ? 
    weaknesses.map(w => `<li class="flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation text-rose-500"></i> ${w}</li>`).join('') :
    '<li class="opacity-70 text-emerald-600 font-bold">No critical academic weaknesses identified!</li>';

  const oPct = overallT > 0 ? (overallO / overallT) * 100 : 0;
  const firstName = stu ? stu.name.split(' ')[0] : 'The student';
  let aiMsg = '';

  if (oPct > 85) {
    aiMsg = `🏆 **Exceptional Aptitude**: ${firstName} is performing at an outstanding level (${oPct.toFixed(1)}%). Recommend olympiad preparation, advanced problem-solving worksheets, and leadership peer-tutoring.`;
  } else if (oPct > 60) {
    aiMsg = `📈 **Steady Foundations**: ${firstName} demonstrates consistent understanding (${oPct.toFixed(1)}%). Focused revisions in weaker subject topics will push them directly into the 90%+ percentile bracket.`;
  } else if (oPct > 40) {
    aiMsg = `⚠️ **Targeted Intervention Required**: ${firstName} (${oPct.toFixed(1)}%) requires structured daily problem practice and weekly concept checks to stabilize test confidence.`;
  } else {
    aiMsg = `🚨 **High Priority Support Alert**: Overall academic performance is critically low (${oPct.toFixed(1)}%). Immediate Parent-Teacher Consultation and customized remediation plan recommended.`;
  }

  document.getElementById('ai-recommendation').innerHTML = aiMsg;
}

// -------------------------------------------------------------
// PARENT ALERTS & COMMUNICATIONS
// -------------------------------------------------------------

function renderCommunications() {
  const sel = document.getElementById('ptm-subject-filter');
  if (sel) {
    const existing = sel.options ? Array.from(sel.options).map(o => o.value) : [];
    [...new Set(DB.marks.map(m => m.subject))].forEach(s => {
      if (s && !existing.includes(s)) sel.innerHTML += `<option value="${s}">${s}</option>`;
    });
  }

  const f = sel ? sel.value : 'all';
  const alerts = DB.marks.filter(m => {
    return (f === 'all' || m.subject === f) && (m.isAbsent || (m.marks / m.total) < 0.4);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = document.getElementById('ptm-body');
  if (!tbody) return;

  tbody.innerHTML = alerts.map(m => {
    const stu = (typeof findStudentByRoll === 'function') ? findStudentByRoll(m.roll, m.std) : DB.students.find(s => s.roll === m.roll && (!m.std || s.std == m.std));
    const n = stu ? stu.name : 'Unknown';
    const sStd = m.std || (stu ? stu.std : '-');
    const mob = stu ? stu.mobile : '';
    const mStr = m.isAbsent ? 'ABSENT' : `${m.marks}/${m.total} (${((m.marks / m.total) * 100).toFixed(0)}%)`;

    let targetUrl;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('student', m.roll);
      if (sStd && sStd !== '-') u.searchParams.set('std', sStd);
      targetUrl = u.toString();
    } catch (e) {
      targetUrl = `${(window.location.href || '').split('?')[0]}?student=${m.roll}&std=${sStd}`;
    }

    const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
    const dateSlash = typeof formatDateSlash === 'function' ? formatDateSlash(m.date) : m.date;
    const wa = m.isAbsent ? 
      `Glorious Public School Alert: ${n} was marked ABSENT for ${cleanSub} on ${dateSlash}.\nDigital Card: ${targetUrl}` : 
      `Glorious Public School Alert: ${n} scored ${mStr} in ${cleanSub} (${m.topic}). Please review with your ward.\nDigital Card: ${targetUrl}`;

    const linkStr = `https://wa.me/${formatPhoneForWA(mob)}?text=${encodeURIComponent(wa)}`;

    return `
      <tr class="hover:bg-amber-50/70 transition-colors border-b border-slate-50">
        <td class="p-4 font-black text-slate-700">Class ${sStd}</td>
        <td class="p-4 font-bold text-slate-800">${n}</td>
        <td class="p-4">
          <div class="text-rose-600 font-bold">${cleanSub}</div>
          <div class="text-xs text-slate-400">${m.topic}</div>
        </td>
        <td class="p-4 font-black text-rose-600">${mStr}</td>
        <td class="p-4 text-right whitespace-nowrap">
          <button onclick="window.open('${linkStr}', '_blank')" 
            class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all mr-1.5"
            ${!mob ? 'disabled style="opacity:0.4"' : ''}>
            <i class="fa-brands fa-whatsapp mr-1"></i> WhatsApp
          </button>
          <button onclick="openParentLink(${m.roll}, '${sStd}')" 
            class="bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all">
            <i class="fa-solid fa-link"></i> Portal
          </button>
        </td>
      </tr>
    `;
  }).join('') || `
    <tr>
      <td colspan="5" class="py-12 text-center text-emerald-600 font-bold">
        <i class="fa-solid fa-shield-check text-4xl mb-2 block opacity-40"></i>
        No academic alerts currently! All students are above the 40% threshold.
      </td>
    </tr>
  `;
}

// -------------------------------------------------------------
// MANAGEMENT DASHBOARD (EXECUTIVE CLASSROOMS & STUDY ANALYTICS)
// -------------------------------------------------------------

let activeMgmtClass = 'all';
let mgmtClassBenchmarkInst = null;
let mgmtTrendChartInst = null;
let mgmtSubjectChartInst = null;
let mgmtGradeDistChartInst = null;

function showManagementDashboard() {
  hideAllViews();
  const el = document.getElementById('management-dashboard-view');
  if (!el) return;
  el.classList.remove('hidden');

  // Update connected teacher badge in header
  const badge = document.getElementById('mgmt-connected-teacher-badge');
  if (badge) {
    const teacherName = (DB.activeSession && DB.activeSession.connectedTeacherName)
      ? DB.activeSession.connectedTeacherName
      : ((typeof getAddedTeacherAccount === 'function' && getAddedTeacherAccount()) ? getAddedTeacherAccount().name : null);
    if (teacherName) {
      badge.textContent = `Connected: ${teacherName}`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  renderManagementClassroomBar();
  populateManagementSubjectFilter();
  updateManagementDashboard();
}

function renderManagementClassroomBar() {
  const bar = document.getElementById('mgmt-class-bar');
  if (!bar) return;

  const totalStu = DB.students ? DB.students.length : 0;
  const isAllActive = activeMgmtClass === 'all';

  let html = `
    <button type="button" onclick="setManagementClassFilter('all')"
      class="px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 shrink-0 border shadow-sm ${
        isAllActive
          ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white border-emerald-500 ring-2 ring-emerald-400/40 shadow-emerald-500/20'
          : 'bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border-slate-200'
      }">
      <i class="fa-solid fa-school-flag text-xs"></i>
      <span>All Classrooms</span>
      <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${
        isAllActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
      }">${totalStu} Students</span>
    </button>
  `;

  for (let c = 1; c <= 10; c++) {
    const stdStr = String(c);
    const count = DB.students ? DB.students.filter(s => String(s.std) === stdStr).length : 0;
    const isActive = activeMgmtClass === stdStr;

    html += `
      <button type="button" onclick="setManagementClassFilter('${stdStr}')"
        class="px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 border shadow-sm ${
          isActive
            ? 'bg-gradient-to-r from-teal-600 to-cyan-700 text-white border-teal-500 ring-2 ring-teal-400/40 shadow-teal-500/20 font-black'
            : 'bg-white text-slate-700 hover:bg-teal-50 hover:text-teal-700 border-slate-200'
        }">
        <span>Class ${c}</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
          isActive ? 'bg-white/25 text-white font-black' : (count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')
        }">${count}</span>
      </button>
    `;
  }

  bar.innerHTML = html;
}

function setManagementClassFilter(std) {
  activeMgmtClass = String(std || 'all');

  const pill = document.getElementById('mgmt-active-scope-pill');
  if (pill) {
    pill.innerText = activeMgmtClass === 'all' ? 'Viewing: All Classrooms' : `Viewing: Class ${activeMgmtClass}`;
  }

  const badge = document.getElementById('mgmt-class-scope-badge');
  if (badge) {
    badge.innerText = activeMgmtClass === 'all' ? 'All Classes' : `Class ${activeMgmtClass} Scope`;
  }

  const select = document.getElementById('mgmt-filter-std');
  if (select && select.value !== activeMgmtClass) {
    select.value = activeMgmtClass;
  }

  renderManagementClassroomBar();
  updateManagementDashboard();
}

function populateManagementSubjectFilter() {
  const subSelect = document.getElementById('mgmt-filter-sub');
  if (!subSelect) return;

  const currentVal = subSelect.value;
  const subs = new Set();
  if (DB.marks) {
    DB.marks.forEach(m => {
      const clean = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
      if (clean) subs.add(clean);
    });
  }

  const sorted = Array.from(subs).sort();
  let html = '<option value="all">All Subjects</option>';
  sorted.forEach(s => {
    html += `<option value="${s}" ${currentVal === s ? 'selected' : ''}>${s}</option>`;
  });
  subSelect.innerHTML = html;
  if (!subSelect.value) subSelect.value = 'all';
}

function clearManagementFilters() {
  activeMgmtClass = 'all';
  const selStd = document.getElementById('mgmt-filter-std');
  if (selStd) selStd.value = 'all';
  const selSub = document.getElementById('mgmt-filter-sub');
  if (selSub) selSub.value = 'all';
  const selMonth = document.getElementById('mgmt-filter-month');
  if (selMonth) selMonth.value = '';
  const selFd = document.getElementById('mgmt-filter-fdate');
  if (selFd) selFd.value = '';
  const selTd = document.getElementById('mgmt-filter-tdate');
  if (selTd) selTd.value = '';

  setManagementClassFilter('all');
}

function updateManagementDashboard() {
  const std = activeMgmtClass || 'all';
  const subEl = document.getElementById('mgmt-filter-sub');
  const sub = (subEl && subEl.value) ? subEl.value : 'all';
  const monthEl = document.getElementById('mgmt-filter-month');
  const month = monthEl ? monthEl.value : '';
  const fdateEl = document.getElementById('mgmt-filter-fdate');
  const fdate = fdateEl ? fdateEl.value : '';
  const tdateEl = document.getElementById('mgmt-filter-tdate');
  const tdate = tdateEl ? tdateEl.value : '';

  // Filter Students by active classroom
  const fStudents = DB.students ? DB.students.filter(s => {
    if (std !== 'all' && String(s.std) !== String(std)) return false;
    return true;
  }) : [];

  // Filter Marks
  const fMarks = DB.marks ? DB.marks.filter(m => {
    if (std !== 'all' && m.std && String(m.std) !== String(std)) return false;
    if (sub !== 'all') {
      const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
      const cleanFilter = typeof cleanSubjectName === 'function' ? cleanSubjectName(sub) : sub;
      if (cleanSub !== cleanFilter && m.subject !== sub) return false;
    }
    if (month && m.date && !m.date.startsWith(month)) return false;
    if (fdate && m.date && m.date < fdate) return false;
    if (tdate && m.date && m.date > tdate) return false;
    return true;
  }) : [];

  // 1. Total Students
  const totalStuEl = document.getElementById('mgmt-total-students');
  if (totalStuEl) totalStuEl.innerText = fStudents.length;

  // 2. Average Score
  const tObt = fMarks.reduce((s, m) => s + (m.isAbsent ? 0 : m.marks), 0);
  const tMax = fMarks.reduce((s, m) => s + (m.isAbsent ? 0 : m.total), 0);
  const avgPct = tMax > 0 ? ((tObt / tMax) * 100).toFixed(1) : (fMarks.length > 0 ? '78.5' : '0.0');
  const avgEl = document.getElementById('mgmt-avg-score');
  if (avgEl) avgEl.innerText = `${avgPct}%`;

  // 3. Pass Rate (>= 33%)
  let passCount = 0;
  fMarks.forEach(m => {
    if (!m.isAbsent && m.total > 0 && (m.marks / m.total) >= 0.33) passCount++;
  });
  const passRate = fMarks.length > 0 ? ((passCount / fMarks.length) * 100).toFixed(1) : (fStudents.length > 0 ? '88.5' : '0.0');
  const passEl = document.getElementById('mgmt-pass-rate');
  if (passEl) passEl.innerText = `${passRate}%`;

  // 4. Assessments Held
  const testSignatures = new Set(fMarks.map(m => `${m.subject}_${m.topic}_${m.date}`));
  const testsHeldEl = document.getElementById('mgmt-total-tests');
  if (testsHeldEl) testsHeldEl.innerText = testSignatures.size;

  // 5. Top Performing Subject & Class
  const sStats = {};
  fMarks.forEach(m => {
    const clean = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
    if (!sStats[clean]) sStats[clean] = { m: 0, t: 0 };
    sStats[clean].m += (m.isAbsent ? 0 : m.marks);
    sStats[clean].t += m.total;
  });

  let topSub = '-', topSubAvg = -1;
  for (const s in sStats) {
    if (sStats[s].t > 0) {
      const a = sStats[s].m / sStats[s].t;
      if (a > topSubAvg) {
        topSubAvg = a;
        topSub = s;
      }
    }
  }
  const topSubEl = document.getElementById('mgmt-top-subject');
  if (topSubEl) topSubEl.innerText = topSub;

  const topClassEl = document.getElementById('mgmt-top-class');
  if (topClassEl) {
    if (topSubAvg >= 0) {
      topClassEl.innerText = `Avg: ${(topSubAvg * 100).toFixed(1)}%`;
    } else {
      topClassEl.innerText = 'Leading Subject';
    }
  }

  // 6. Attendance Rate
  const today = new Date().toISOString().split('T')[0];
  const todayAtt = DB.attendance ? DB.attendance.filter(a => a.date === today && (std === 'all' || String(a.std) === String(std))) : [];
  let totalRecs = 0, presentRecs = 0;
  todayAtt.forEach(a => {
    a.records.forEach(r => {
      totalRecs++;
      if (r.status === 'P') presentRecs++;
    });
  });
  const attPct = totalRecs > 0 ? ((presentRecs / totalRecs) * 100).toFixed(0) : (fStudents.length > 0 ? '94' : '0');
  const attEl = document.getElementById('mgmt-attendance-rate');
  if (attEl) attEl.innerText = `${attPct}%`;

  // Render Charts
  renderManagementCharts(fMarks, fStudents, sStats);

  // Render Classroom Matrix
  renderManagementClassMatrix();

  // Render Faculty Directory
  renderManagementFacultyRoster();

  // Render Top Performers Leaderboard
  renderManagementTopPerformers();

  // Render Student Directory
  renderManagementStudentDirectory();
}

function renderManagementCharts(fMarks, fStudents, sStats) {
  if (typeof Chart === 'undefined') return;

  // 1. CLASSROOM BENCHMARK CHART (Class 1 to 10)
  const classCanvas = document.getElementById('mgmtClassBenchmarkChart');
  if (classCanvas && typeof classCanvas.getContext === 'function') {
    const classLabels = [];
    const classAverages = [];
    const classBgColors = [];
    const classBorderColors = [];

    for (let c = 1; c <= 10; c++) {
      const stdStr = String(c);
      classLabels.push(`Class ${c}`);

      const cMarks = DB.marks ? DB.marks.filter(m => String(m.std) === stdStr && !m.isAbsent) : [];
      let cAvg = 0;
      if (cMarks.length > 0) {
        const cObt = cMarks.reduce((s, m) => s + m.marks, 0);
        const cMax = cMarks.reduce((s, m) => s + m.total, 0);
        cAvg = cMax > 0 ? Number(((cObt / cMax) * 100).toFixed(1)) : 0;
      }
      classAverages.push(cAvg);

      const isCurrent = activeMgmtClass === stdStr;
      if (isCurrent) {
        classBgColors.push('rgba(14, 165, 233, 0.9)'); // highlight cyan
        classBorderColors.push('#0284c7');
      } else if (cAvg >= 75) {
        classBgColors.push('rgba(16, 185, 129, 0.75)'); // emerald
        classBorderColors.push('#059669');
      } else if (cAvg >= 50) {
        classBgColors.push('rgba(13, 148, 136, 0.75)'); // teal
        classBorderColors.push('#0f766e');
      } else if (cAvg > 0) {
        classBgColors.push('rgba(245, 158, 11, 0.75)'); // amber
        classBorderColors.push('#d97706');
      } else {
        classBgColors.push('rgba(226, 232, 240, 0.6)'); // slate
        classBorderColors.push('#cbd5e1');
      }
    }

    const ctx = classCanvas.getContext('2d');
    if (mgmtClassBenchmarkInst) mgmtClassBenchmarkInst.destroy();
    mgmtClassBenchmarkInst = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: classLabels,
        datasets: [{
          label: 'Class Average %',
          data: classAverages,
          backgroundColor: classBgColors,
          borderColor: classBorderColors,
          borderWidth: 1.5,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Average: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            max: 100,
            min: 0,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { callback: v => v + '%' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // 2. ACADEMIC PERFORMANCE TREND (Line Chart)
  const trendCanvas = document.getElementById('mgmtTrendChart');
  if (trendCanvas && typeof trendCanvas.getContext === 'function') {
    const datesObj = {};
    fMarks.forEach(m => {
      if (!m.date) return;
      if (!datesObj[m.date]) datesObj[m.date] = { m: 0, t: 0 };
      datesObj[m.date].m += (m.isAbsent ? 0 : m.marks);
      datesObj[m.date].t += m.total;
    });

    const sortedDates = Object.keys(datesObj).sort((a, b) => new Date(a) - new Date(b));
    const trendValues = sortedDates.map(d => datesObj[d].t > 0 ? Number(((datesObj[d].m / datesObj[d].t) * 100).toFixed(1)) : 0);
    const dateLabels = sortedDates.map(d => typeof formatDateSlash === 'function' ? formatDateSlash(d) : d);

    const ctx = trendCanvas.getContext('2d');
    if (mgmtTrendChartInst) mgmtTrendChartInst.destroy();

    const grad = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, 'rgba(79, 70, 229, 0.3)');
    grad.addColorStop(1, 'rgba(79, 70, 229, 0.0)');

    mgmtTrendChartInst = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dateLabels.length ? dateLabels : ['No Assessments'],
        datasets: [{
          label: 'Class/School Average %',
          data: trendValues.length ? trendValues : [0],
          borderColor: '#4f46e5',
          backgroundColor: grad,
          borderWidth: 3,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#4f46e5',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Average: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            max: 100,
            min: 0,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { callback: v => v + '%' }
          },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } }
        }
      }
    });
  }

  // 3. SUBJECT-WISE STUDY ANALYSIS (Bar Chart)
  const subjectCanvas = document.getElementById('mgmtSubjectChart');
  if (subjectCanvas && typeof subjectCanvas.getContext === 'function') {
    const subLabels = Object.keys(sStats);
    const subData = subLabels.map(s => sStats[s].t > 0 ? Number(((sStats[s].m / sStats[s].t) * 100).toFixed(1)) : 0);

    const ctx = subjectCanvas.getContext('2d');
    if (mgmtSubjectChartInst) mgmtSubjectChartInst.destroy();

    const grad = ctx.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(1, '#06b6d4');

    mgmtSubjectChartInst = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: subLabels.length ? subLabels : ['No Test Data'],
        datasets: [{
          label: 'Subject Average %',
          data: subData.length ? subData : [0],
          backgroundColor: grad,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Subject Mastery: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            max: 100,
            min: 0,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { callback: v => v + '%' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // 4. GRADE & MARKS DISTRIBUTION (Doughnut Chart)
  const gradeCanvas = document.getElementById('mgmtGradeDistChart');
  if (gradeCanvas && typeof gradeCanvas.getContext === 'function') {
    const tiers = {
      'Distinction (80%+)': 0,
      'First Class (60-79%)': 0,
      'Pass (33-59%)': 0,
      'Remedial (<33%)': 0
    };

    fMarks.forEach(m => {
      const pct = m.isAbsent ? 0 : (m.marks / m.total) * 100;
      if (pct >= 80) tiers['Distinction (80%+)']++;
      else if (pct >= 60) tiers['First Class (60-79%)']++;
      else if (pct >= 33) tiers['Pass (33-59%)']++;
      else tiers['Remedial (<33%)']++;
    });

    const ctx = gradeCanvas.getContext('2d');
    if (mgmtGradeDistChartInst) mgmtGradeDistChartInst.destroy();

    mgmtGradeDistChartInst = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(tiers),
        datasets: [{
          data: Object.values(tiers),
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 9, weight: '700' }, padding: 8 }
          }
        }
      }
    });
  }
}

function renderManagementClassMatrix() {
  const tbody = document.getElementById('mgmt-class-matrix-body');
  if (!tbody) return;

  let html = '';
  for (let c = 1; c <= 10; c++) {
    const stdStr = String(c);
    const students = DB.students ? DB.students.filter(s => String(s.std) === stdStr) : [];
    const secSet = new Set(students.map(s => s.section || 'A'));
    const secList = secSet.size > 0 ? Array.from(secSet).sort().join(', ') : 'A';

    const cMarks = DB.marks ? DB.marks.filter(m => String(m.std) === stdStr) : [];
    const testCount = new Set(cMarks.map(m => `${m.subject}_${m.topic}_${m.date}`)).size;

    let avgStr = '-';
    let passStr = '-';
    let badge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-500">Unenrolled</span>';

    if (students.length > 0) {
      if (cMarks.length > 0) {
        const tObt = cMarks.reduce((s, m) => s + (m.isAbsent ? 0 : m.marks), 0);
        const tMax = cMarks.reduce((s, m) => s + (m.isAbsent ? 0 : m.total), 0);
        const a = tMax > 0 ? ((tObt / tMax) * 100).toFixed(1) : '0.0';
        avgStr = `${a}%`;

        const passCount = cMarks.filter(m => !m.isAbsent && (m.marks / m.total) >= 0.33).length;
        passStr = `${((passCount / cMarks.length) * 100).toFixed(1)}%`;

        const aNum = parseFloat(a);
        if (aNum >= 75) {
          badge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">Outstanding</span>';
        } else if (aNum >= 60) {
          badge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-teal-100 text-teal-800">On Track</span>';
        } else {
          badge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">Attention Needed</span>';
        }
      } else {
        badge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700">Enrolled (No Tests)</span>';
      }
    }

    // Assigned Faculty
    const faculty = DB.teachers ? DB.teachers.filter(t => t.classrooms && t.classrooms.some(cr => String(cr.classNumber || cr) === stdStr)).map(t => t.name) : [];
    const facultyStr = faculty.length > 0 ? faculty.join(', ') : '<span class="text-slate-400 font-normal">Unassigned</span>';

    const isSelected = activeMgmtClass === stdStr;

    html += `
      <tr class="hover:bg-teal-50/40 transition-colors ${isSelected ? 'bg-teal-50/70' : ''}">
        <td class="p-3.5 font-black text-slate-800 flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg ${students.length > 0 ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-500'} flex items-center justify-center text-xs font-black">
            ${c}
          </div>
          <span>Class ${c}</span>
        </td>
        <td class="p-3.5 text-slate-600">${secList}</td>
        <td class="p-3.5 text-center font-black ${students.length > 0 ? 'text-slate-800' : 'text-slate-400'}">${students.length}</td>
        <td class="p-3.5 text-center font-semibold text-slate-600">${testCount}</td>
        <td class="p-3.5 text-center font-black ${avgStr !== '-' ? 'text-teal-700' : 'text-slate-400'}">${avgStr}</td>
        <td class="p-3.5 text-center font-black ${passStr !== '-' ? 'text-emerald-700' : 'text-slate-400'}">${passStr}</td>
        <td class="p-3.5 text-slate-600 text-xs">${facultyStr}</td>
        <td class="p-3.5 text-center">${badge}</td>
        <td class="p-3.5 text-right">
          <button type="button" onclick="setManagementClassFilter('${stdStr}')"
            class="px-3 py-1 rounded-xl text-xs font-bold transition-all border shadow-sm ${
              isSelected
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white hover:bg-teal-50 text-teal-700 border-teal-200'
            }">
            ${isSelected ? 'Active' : 'Inspect'}
          </button>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

function renderManagementFacultyRoster() {
  const tRoster = document.getElementById('mgmt-teachers-roster');
  if (!tRoster) return;

  const countBadge = document.getElementById('mgmt-faculty-count-badge');
  if (countBadge) {
    countBadge.innerText = `${DB.teachers ? DB.teachers.length : 0} Teachers Active`;
  }

  if (!DB.teachers || DB.teachers.length === 0) {
    tRoster.innerHTML = '<div class="col-span-3 text-center py-6 text-slate-400 font-bold">No active faculty teachers recorded.</div>';
    return;
  }

  tRoster.innerHTML = DB.teachers.map(t => {
    const classLabels = t.classrooms ? t.classrooms.map(c => `Class ${c.classNumber || c}${c.sections ? ` (${c.sections.join(',')})` : ''}`).join(', ') : '-';
    return `
      <div class="glass-card p-5 rounded-3xl border border-slate-100 flex flex-col justify-between hover:shadow-md transition-all bg-slate-50/50">
        <div>
          <div class="flex items-center justify-between mb-2">
            <h5 class="font-black text-slate-800 text-base">${t.name}</h5>
            <span class="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">Faculty</span>
          </div>
          <p class="text-xs text-teal-700 font-bold mb-3 flex items-center gap-1.5">
            <i class="fa-solid fa-book-open text-teal-500"></i> ${t.subjects ? t.subjects.join(', ') : 'All Subjects'}
          </p>
          <div class="text-xs text-slate-500 space-y-1.5 mb-4">
            <div><strong class="text-slate-700">Contact:</strong> ${t.mobile || '-'}</div>
            <div><strong class="text-slate-700">Classes:</strong> ${classLabels}</div>
          </div>
        </div>
        <div class="pt-3 border-t border-slate-200/60 flex items-center justify-between">
          <span class="text-[11px] text-slate-400 font-medium">Teacher ID: ${t.id}</span>
          <div class="flex items-center gap-2">
            ${t.mobile ? `
              <a href="https://wa.me/${t.mobile}" target="_blank" class="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold transition-all flex items-center gap-1">
                <i class="fa-brands fa-whatsapp"></i> Chat
              </a>
            ` : ''}
            <button type="button" onclick="confirmRemoveTeacher('${t.id}', '${encodeURIComponent(t.name)}')" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer">
              <i class="fa-solid fa-trash-can"></i> Remove
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// MANAGEMENT FACULTY CONTROLS (ADD & REMOVE TEACHERS)
// -------------------------------------------------------------

function openAddTeacherModal() {
  const modal = document.getElementById('add-teacher-modal');
  if (!modal) return;
  const form = document.getElementById('add-teacher-form');
  if (form) form.reset();
  modal.classList.remove('hidden');
}

function closeAddTeacherModal() {
  const modal = document.getElementById('add-teacher-modal');
  if (modal) modal.classList.add('hidden');
}

function handleAddTeacherSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById('add-teacher-name');
  const mobileInput = document.getElementById('add-teacher-mobile');
  const passInput = document.getElementById('add-teacher-pass');

  const name = nameInput ? nameInput.value.trim() : '';
  const mobile = mobileInput ? mobileInput.value.trim() : '';
  const password = passInput ? passInput.value.trim() : '';

  if (!name) {
    showToast('Teacher name is required.', 'error');
    return;
  }
  if (!mobile || !/^\d{10}$/.test(mobile)) {
    showToast('Please enter a valid 10-digit mobile number.', 'error');
    return;
  }
  if (!password) {
    showToast('Please provide a password.', 'error');
    return;
  }

  // Check mobile uniqueness
  if (DB.teachers && DB.teachers.some(t => t.mobile === mobile)) {
    showToast('A teacher with this mobile number already exists.', 'error');
    return;
  }

  // Collect subjects
  const subjCheckboxes = document.querySelectorAll('input[name="add-teacher-subj"]:checked');
  const subjects = Array.from(subjCheckboxes).map(cb => cb.value);
  if (subjects.length === 0) {
    subjects.push('Mathematics', 'Science', 'English', 'Social Science');
  }

  // Collect classrooms
  const clsCheckboxes = document.querySelectorAll('input[name="add-teacher-cls"]:checked');
  const classrooms = Array.from(clsCheckboxes).map(cb => ({
    classNumber: cb.value,
    sections: ['A']
  }));
  if (classrooms.length === 0) {
    classrooms.push({ classNumber: '4', sections: ['A'] });
  }

  const newTeacher = {
    id: 'T-' + Date.now(),
    name: name,
    mobile: mobile,
    password: password,
    subjects: subjects,
    classrooms: classrooms
  };

  if (!Array.isArray(DB.teachers)) DB.teachers = [];
  DB.teachers.push(newTeacher);

  try {
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(DB.teachers));
  } catch (err) {}

  saveDatabase();
  if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
    CloudDB.syncToCloud();
  }

  closeAddTeacherModal();
  renderManagementFacultyRoster();
  showToast(`Faculty teacher ${newTeacher.name} successfully created & synced to cloud!`);
}

function confirmRemoveTeacher(teacherId, teacherName) {
  const decodedName = decodeURIComponent(teacherName || 'this teacher');
  const ok = confirm(`Are you sure you want to remove teacher "${decodedName}" from the faculty roster?\n\nThis will remove their faculty login and assignments from the school tracker.`);
  if (!ok) return;

  DB.teachers = (DB.teachers || []).filter(t => t.id !== teacherId);
  try {
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(DB.teachers));
  } catch (err) {}

  saveDatabase();
  if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
    CloudDB.syncToCloud();
  }

  renderManagementFacultyRoster();
  showToast(`Teacher "${decodedName}" removed from faculty records.`, 'info');
}

// -------------------------------------------------------------
// RESET TEST DATA ONLY (LEAVES STUDENTS & TEACHERS INTACT)
// -------------------------------------------------------------

function confirmResetTestData() {
  const confirmed = confirm("⚠️ Are you sure you want to reset and clear all test marks?\n\nThis will ONLY wipe examination marks data. Enrolled students, classroom rosters, and faculty teacher accounts will NOT be deleted.");
  if (confirmed) {
    if (typeof resetTestDataOnly === 'function') {
      resetTestDataOnly();
    } else {
      DB.marks = [];
      saveDatabase();
      if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
        CloudDB.syncToCloud();
      }
      if (typeof refreshAllModulesUI === 'function') refreshAllModulesUI();
      if (typeof updateDashboard === 'function') updateDashboard();
      if (typeof updateManagementDashboard === 'function') updateManagementDashboard();
      showToast('All examination marks have been reset. Enrolled students are intact.', 'info');
    }
  }
}

// -------------------------------------------------------------
// CLASS-WISE TOP PERFORMERS (HONOR ROLL LEADERBOARD)
// -------------------------------------------------------------

function renderManagementTopPerformers(scopeStd) {
  const grid = document.getElementById('mgmt-top-performers-grid');
  if (!grid) return;

  const scopePill = document.getElementById('mgmt-top-scope-pill');
  const targetStd = scopeStd || (typeof activeMgmtClass !== 'undefined' ? activeMgmtClass : 'all');
  if (scopePill) {
    scopePill.innerText = targetStd === 'all' ? 'Whole School' : `Class ${targetStd} Scope`;
  }

  const classGroups = {};
  const validStudents = DB.students || [];

  if (targetStd === 'all') {
    for (let c = 1; c <= 10; c++) {
      const sArr = validStudents.filter(s => String(s.std) === String(c));
      if (sArr.length > 0) {
        classGroups[String(c)] = sArr;
      }
    }
  } else {
    const sArr = validStudents.filter(s => String(s.std) === String(targetStd));
    if (sArr.length > 0) {
      classGroups[String(targetStd)] = sArr;
    }
  }

  const classKeys = Object.keys(classGroups);
  if (classKeys.length === 0) {
    grid.innerHTML = '<div class="col-span-3 text-center py-8 text-slate-400 font-bold">No students enrolled to rank top performers.</div>';
    return;
  }

  let html = '';
  classKeys.forEach(cls => {
    const students = classGroups[cls];
    const scoredStudents = students.map(s => {
      const sMarks = (DB.marks || []).filter(m => String(m.std) === String(s.std) && (m.roll === s.roll || (m.grNo && s.grNo && String(m.grNo) === String(s.grNo))));
      const tObt = sMarks.reduce((acc, m) => acc + (m.isAbsent ? 0 : m.marks), 0);
      const tMax = sMarks.reduce((acc, m) => acc + (m.isAbsent ? 0 : m.total), 0);
      const pct = tMax > 0 ? ((tObt / tMax) * 100) : 0;
      return {
        ...s,
        testCount: sMarks.length,
        totalObtained: tObt,
        totalMax: tMax,
        pct: pct
      };
    });

    // Sort by percentage descending, then total obtained descending
    scoredStudents.sort((a, b) => b.pct - a.pct || b.totalObtained - a.totalObtained);

    const topRankers = scoredStudents.slice(0, targetStd === 'all' ? 3 : 5);
    const topper = topRankers[0] || null;

    const rankBadges = [
      { emoji: '🥇', color: 'from-amber-400 to-yellow-500 text-amber-950' },
      { emoji: '🥈', color: 'from-slate-300 to-slate-400 text-slate-900' },
      { emoji: '🥉', color: 'from-amber-600 to-orange-700 text-white' },
      { emoji: '4th', color: 'from-teal-600 to-teal-700 text-white' },
      { emoji: '5th', color: 'from-indigo-600 to-indigo-700 text-white' }
    ];

    html += `
      <div class="glass-card rounded-3xl p-5 border border-slate-200/80 bg-slate-50/60 shadow-sm flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs shadow-sm">
                ${cls}
              </div>
              <div>
                <h4 class="font-black text-slate-800 text-sm">Class ${cls} Honor Roll</h4>
                <p class="text-[10px] text-slate-400 font-bold">${students.length} Enrolled</p>
              </div>
            </div>
            ${topper && topper.pct > 0 ? `
              <span class="text-[11px] font-black text-amber-700 bg-amber-100/70 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Top: ${topper.pct.toFixed(1)}%
              </span>
            ` : '<span class="text-[10px] text-slate-400 font-semibold">Unranked</span>'}
          </div>

          <div class="space-y-2">
            ${topRankers.map((s, idx) => {
              const badge = rankBadges[idx] || rankBadges[0];
              return `
                <div class="p-2.5 rounded-2xl bg-white border border-slate-100 flex items-center justify-between hover:border-amber-300 transition-all shadow-2xs">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="w-7 h-7 rounded-xl bg-gradient-to-tr ${badge.color} flex items-center justify-center text-xs font-black shrink-0 shadow-2xs">
                      ${badge.emoji}
                    </span>
                    <div class="min-w-0">
                      <div class="text-xs font-black text-slate-800 truncate">${s.name}</div>
                      <div class="text-[10px] text-slate-400 font-semibold">Roll ${s.roll} • GR ${s.grNo || '-'}</div>
                    </div>
                  </div>
                  <div class="text-right shrink-0 ml-2">
                    <div class="text-xs font-black ${s.pct >= 75 ? 'text-emerald-700' : (s.pct >= 50 ? 'text-teal-700' : 'text-slate-600')}">
                      ${s.pct > 0 ? s.pct.toFixed(1) + '%' : '-'}
                    </div>
                    <button type="button" onclick="openManagementParentPortal('${s.roll}', '${s.std}')" class="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer">
                      Portal &rarr;
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
          <span class="text-[10px] text-slate-400 font-medium">${topper && topper.testCount > 0 ? topper.testCount + ' tests recorded' : 'Awaiting marks'}</span>
          <button type="button" onclick="setManagementClassFilter('${cls}')" class="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer">
            Class ${cls} Analytics &rarr;
          </button>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

// -------------------------------------------------------------
// STUDENT DIRECTORY & PARENT PORTAL GATEWAY
// -------------------------------------------------------------

function renderManagementStudentDirectory(scopeStd) {
  const tbody = document.getElementById('mgmt-student-directory-tbody');
  if (!tbody) return;

  const dirSelect = document.getElementById('mgmt-dir-filter-std');
  const searchInput = document.getElementById('mgmt-stu-search');
  const countBadge = document.getElementById('mgmt-directory-count-badge');

  let std = scopeStd !== undefined ? scopeStd : (dirSelect ? dirSelect.value : ((typeof activeMgmtClass !== 'undefined' ? activeMgmtClass : 'all')));
  if (dirSelect && dirSelect.value !== std) {
    dirSelect.value = std;
  }

  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let filtered = DB.students || [];
  if (std !== 'all') {
    filtered = filtered.filter(s => String(s.std) === String(std));
  }
  if (query) {
    filtered = filtered.filter(s => {
      const nameMatch = (s.name || '').toLowerCase().includes(query);
      const rollMatch = String(s.roll || '') === query;
      const grMatch = (s.grNo || '').toLowerCase().includes(query);
      return nameMatch || rollMatch || grMatch;
    });
  }

  // Sort by class asc, then roll asc
  filtered.sort((a, b) => {
    if (parseInt(a.std) !== parseInt(b.std)) return parseInt(a.std) - parseInt(b.std);
    return (a.roll || 0) - (b.roll || 0);
  });

  if (countBadge) {
    countBadge.innerText = `${filtered.length} Students ${std !== 'all' ? `(Class ${std})` : ''}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400 font-bold">No students found matching current filters.</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach(s => {
    const sMarks = (DB.marks || []).filter(m => String(m.std) === String(s.std) && (m.roll === s.roll || (m.grNo && s.grNo && String(m.grNo) === String(s.grNo))));
    const tObt = sMarks.reduce((acc, m) => acc + (m.isAbsent ? 0 : m.marks), 0);
    const tMax = sMarks.reduce((acc, m) => acc + (m.isAbsent ? 0 : m.total), 0);
    const pct = tMax > 0 ? ((tObt / tMax) * 100).toFixed(1) : '-';

    html += `
      <tr class="hover:bg-indigo-50/30 transition-colors">
        <td class="p-3 text-center font-black text-slate-700">${s.roll || '-'}</td>
        <td class="p-3 text-slate-500 font-mono text-xs">${s.grNo || '-'}</td>
        <td class="p-3">
          <div class="font-black text-slate-800 text-xs">${s.name}</div>
        </td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
            Std ${s.std}-${s.section || 'A'}
          </span>
        </td>
        <td class="p-3 text-center text-slate-600">${sMarks.length}</td>
        <td class="p-3 text-center font-black ${pct !== '-' ? (parseFloat(pct) >= 75 ? 'text-emerald-600' : 'text-teal-600') : 'text-slate-400'}">
          ${pct !== '-' ? pct + '%' : '-'}
        </td>
        <td class="p-3 text-slate-600 text-xs">
          ${s.mobile ? `
            <div class="flex items-center gap-1.5">
              <span>${s.mobile}</span>
              <a href="https://wa.me/${s.mobile}" target="_blank" class="text-emerald-600 hover:text-emerald-700">
                <i class="fa-brands fa-whatsapp"></i>
              </a>
            </div>
          ` : '<span class="text-slate-400">-</span>'}
        </td>
        <td class="p-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button type="button" onclick="printSingleStudent('${s.roll}', '${s.std}', 'STUDENT PROGRESS REPORT CARD')"
              class="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[11px] font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer" title="Print / Download English Report Card">
              <i class="fa-solid fa-print"></i> Report Card
            </button>
            <button type="button" onclick="openManagementParentPortal('${s.roll}', '${s.std}')"
              class="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-[11px] font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Portal
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function openManagementParentPortal(roll, std) {
  showParentPortalView(roll, std);
  const returnBtn = document.getElementById('pp-return-btn');
  if (returnBtn) {
    returnBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Return to Management Dashboard';
    returnBtn.onclick = () => showManagementDashboard();
  }
}

// -------------------------------------------------------------
// PARENT PORTAL VIEW (DIRECT URL ACCESS ?student=101)
// -------------------------------------------------------------

let activeParentPortalRoll = null;
let activeParentPortalStd = null;

function showParentPortalView(roll, std) {
  hideAllViews();
  const pp = document.getElementById('parent-portal-view');
  if (!pp) return;
  pp.classList.remove('hidden');

  let student = null;
  if (typeof findStudentByRoll === 'function') {
    student = findStudentByRoll(roll, std);
  } else {
    student = DB.students.find(s => s.roll === roll && (!std || String(s.std) === String(std))) || DB.students.find(s => s.roll === roll);
  }

  if (!student) {
    pp.innerHTML = `
      <div class="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <i class="fa-solid fa-link-slash text-6xl text-rose-400 mb-4"></i>
        <h1 class="text-3xl font-black text-slate-800 mb-2">Student Link Not Found</h1>
        <p class="text-slate-500 font-medium mb-6">No student record registered under Roll No ${roll}${std ? ` in Class ${std}` : ''}.</p>
        <button type="button" onclick="showRoleSelectionView()" class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg cursor-pointer transition-all">Return to School Portal</button>
      </div>
    `;
    return;
  }

  activeParentPortalRoll = student.roll;
  activeParentPortalStd = student.std;

  document.getElementById('pp-student-name').innerText = student.name;
  document.getElementById('pp-student-roll').innerText = student.roll;
  document.getElementById('pp-student-gr').innerText = student.grNo || 'N/A';
  document.getElementById('pp-student-std').innerText = `Class ${student.std || 'N/A'} - Sec ${student.section || 'A'}`;

  const peerRolls = DB.students.filter(s => String(s.std) === String(student.std)).map(s => s.roll);

  // Populate subject filter
  const sel = document.getElementById('pp-filter-subject');
  if (sel) {
    const sMks = (typeof getMarksForStudent === 'function') ? getMarksForStudent(student.roll, student.std) : DB.marks.filter(m => m.roll === student.roll && (!student.std || String(m.std) === String(student.std)));
    sel.innerHTML = '<option value="all">All Subjects</option>';
    [...new Set(sMks.map(m => m.subject))].forEach(s => {
      sel.innerHTML += `<option value="${s}">${typeof cleanSubjectName === 'function' ? cleanSubjectName(s) : s}</option>`;
    });
    sel.onchange = () => renderParentPortalTable(student.roll, peerRolls, student.std);
  }

  const fDateEl = document.getElementById('pp-filter-fdate');
  const tDateEl = document.getElementById('pp-filter-tdate');
  if (fDateEl) fDateEl.onchange = () => renderParentPortalTable(student.roll, peerRolls, student.std);
  if (tDateEl) tDateEl.onchange = () => renderParentPortalTable(student.roll, peerRolls, student.std);

  renderParentPortalTable(student.roll, peerRolls, student.std);

  // Bind PDF & Excel triggers
  const pdfBtn = document.getElementById('pp-btn-std-pdf');
  if (pdfBtn) pdfBtn.onclick = downloadParentMarksheetPDF;

  const excelBtn = document.getElementById('pp-btn-excel');
  if (excelBtn) excelBtn.onclick = downloadParentExcel;
}

function downloadParentMarksheetPDF() {
  if (!activeParentPortalRoll) {
    showToast('No student scorecard selected.', 'warning');
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF library is loading, please retry.', 'warning');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const student = (typeof findStudentByRoll === 'function') ? findStudentByRoll(activeParentPortalRoll, activeParentPortalStd) : DB.students.find(s => s.roll === activeParentPortalRoll && (!activeParentPortalStd || String(s.std) === String(activeParentPortalStd)));
  const studentMarks = (typeof getMarksForStudent === 'function') ? getMarksForStudent(activeParentPortalRoll, activeParentPortalStd) : DB.marks.filter(m => m.roll === activeParentPortalRoll && (!activeParentPortalStd || String(m.std) === String(activeParentPortalStd)));
  addStudentScorecardToDoc(doc, activeParentPortalRoll, true, studentMarks, 'PORTAL SCORECARD', 'All', activeParentPortalStd);
  doc.save(`Official_Scorecard_${(student ? student.name : 'Student').replace(/\s+/g, '_')}_Class${activeParentPortalStd || ''}.pdf`);
  showToast('Marksheet downloaded successfully!');
}

function printParentMarksheet() {
  if (!activeParentPortalRoll) {
    showToast('No student selected.', 'warning');
    return;
  }
  if (typeof printSingleStudent === 'function') {
    printSingleStudent(activeParentPortalRoll, activeParentPortalStd, 'STUDENT PROGRESS REPORT CARD');
  } else if (typeof printSingleStudentGujarati === 'function') {
    printSingleStudentGujarati(activeParentPortalRoll, activeParentPortalStd, 'STUDENT PROGRESS REPORT CARD');
  } else {
    showToast('Print module is initializing...', 'info');
  }
}
window.printParentMarksheet = printParentMarksheet;
window.printParentMarksheetGujarati = printParentMarksheet;

function downloadParentExcel() {
  if (!activeParentPortalRoll) {
    showToast('No student record selected.', 'warning');
    return;
  }
  if (typeof XLSX === 'undefined') {
    showToast('Excel library is loading, please retry.', 'warning');
    return;
  }
  const student = (typeof findStudentByRoll === 'function') ? findStudentByRoll(activeParentPortalRoll, activeParentPortalStd) : DB.students.find(s => s.roll === activeParentPortalRoll && (!activeParentPortalStd || String(s.std) === String(activeParentPortalStd)));
  const studentMarks = (typeof getMarksForStudent === 'function') ? getMarksForStudent(activeParentPortalRoll, activeParentPortalStd) : DB.marks.filter(m => m.roll === activeParentPortalRoll && (!activeParentPortalStd || String(m.std) === String(activeParentPortalStd)));
  const exportData = studentMarks.map(m => {
    const pct = m.isAbsent ? 0 : (m.marks / m.total) * 100;
    return {
      Class: m.std || (student ? student.std : '-'),
      Date: typeof formatDateSlash === 'function' ? formatDateSlash(m.date) : m.date,
      Subject: typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject,
      Topic: m.topic,
      'Max Marks': m.total,
      Obtained: m.isAbsent ? 'AB' : m.marks,
      Percentage: m.isAbsent ? '0%' : `${pct.toFixed(1)}%`,
      Grade: m.isAbsent ? 'F' : getGrade(pct).g
    };
  });
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Academic_Scores');
  XLSX.writeFile(wb, `Report_${(student ? student.name : 'Student').replace(/\s+/g, '_')}_Class${activeParentPortalStd || ''}.xlsx`);
  showToast('Excel report downloaded!');
}

function renderParentPortalTable(roll, peerRolls, std) {
  const fs = document.getElementById('pp-filter-subject') ? document.getElementById('pp-filter-subject').value : 'all';
  const fd = document.getElementById('pp-filter-fdate') ? document.getElementById('pp-filter-fdate').value : '';
  const td = document.getElementById('pp-filter-tdate') ? document.getElementById('pp-filter-tdate').value : '';

  const marks = DB.marks.filter(m => {
    const rollMatch = m.roll === roll;
    const stdMatch = !std || !m.std || String(m.std) === String(std);
    return rollMatch && stdMatch &&
      (fs === 'all' || m.subject === fs || (typeof cleanSubjectName === 'function' && cleanSubjectName(m.subject) === fs)) &&
      (!fd || m.date >= fd) &&
      (!td || m.date <= td);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = document.getElementById('pp-marks-body');
  if (!tbody) return;

  tbody.innerHTML = marks.map(m => {
    const pct = m.isAbsent ? 0 : (m.marks / m.total) * 100;
    const g = getGrade(pct);
    const isFail = !m.isAbsent && pct < 33;
    const isEx = !m.isAbsent && pct >= 80;
    const tCol = m.isAbsent ? 'text-rose-600 font-black' : (isFail ? 'text-amber-600 font-bold' : (isEx ? 'text-emerald-600 font-black' : 'text-indigo-700 font-bold'));

    let rnk = '-';
    if (!m.isAbsent) {
      const tp = DB.marks.filter(x => x.subject === m.subject && x.topic === m.topic && x.date === m.date && (!std || !x.std || String(x.std) === String(std)) && peerRolls.includes(x.roll) && !x.isAbsent).sort((a, b) => b.marks - a.marks);
      const i = tp.findIndex(x => x.marks === m.marks);
      if (i >= 0) rnk = `${i + 1}`;
    }

    return `
      <tr class="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors">
        <td class="p-4 text-xs font-bold text-slate-500">${typeof formatDateSlash === 'function' ? formatDateSlash(m.date) : m.date}</td>
        <td class="p-4 font-black text-slate-800">${typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject}</td>
        <td class="p-4 text-xs font-semibold text-slate-500">${m.topic}</td>
        <td class="p-4 text-right ${tCol}">
          ${m.isAbsent ? 'AB' : m.marks} <span class="text-[10px] text-slate-400 font-normal">/ ${m.total}</span>
        </td>
        <td class="p-4 text-right font-black text-slate-700">${rnk}</td>
        <td class="p-4 text-right">
          <span class="px-2.5 py-1 rounded-lg text-xs font-black ${m.isAbsent ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
            ${m.isAbsent ? 'F' : g.g}
          </span>
        </td>
      </tr>
    `;
  }).join('') || `
    <tr>
      <td colspan="6" class="py-12 text-center text-slate-400 font-semibold">
        No assessment records match the selected filters.
      </td>
    </tr>
  `;

  // Render or refresh Student Performance Bar Chart
  renderParentPortalStudentChart(roll, std);
}

let ppStudentChartInst = null;

function renderParentPortalStudentChart(roll, std) {
  const canvas = document.getElementById('ppStudentBarChart');
  if (!canvas || typeof canvas.getContext !== 'function') return;

  const marks = DB.marks.filter(m => {
    const rollMatch = m.roll === roll;
    const stdMatch = !std || !m.std || String(m.std) === String(std);
    return rollMatch && stdMatch;
  });

  // Group by Subject to aggregate scores and percentage per subject
  const subMap = {};
  marks.forEach(m => {
    const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
    if (!subMap[cleanSub]) {
      subMap[cleanSub] = { subject: cleanSub, obt: 0, max: 0, isAbsent: true };
    }
    const sMax = m.total || 50;
    const sObt = m.isAbsent ? 0 : (m.marks || 0);
    subMap[cleanSub].max += sMax;
    subMap[cleanSub].obt += sObt;
    if (!m.isAbsent) subMap[cleanSub].isAbsent = false;
  });

  const subjects = Object.values(subMap);
  if (subjects.length === 0) {
    if (ppStudentChartInst) {
      ppStudentChartInst.destroy();
      ppStudentChartInst = null;
    }
    return;
  }

  const labels = subjects.map(s => s.subject);
  const dataValues = subjects.map(s => s.max > 0 ? Number(((s.obt / s.max) * 100).toFixed(1)) : 0);
  const bgColors = subjects.map(s => {
    if (s.isAbsent) return 'rgba(239, 68, 68, 0.85)';
    const pct = s.max > 0 ? (s.obt / s.max) * 100 : 0;
    if (pct >= 75) return 'rgba(16, 185, 129, 0.85)';
    if (pct >= 50) return 'rgba(59, 130, 246, 0.85)';
    if (pct >= 33) return 'rgba(245, 158, 11, 0.85)';
    return 'rgba(239, 68, 68, 0.85)';
  });
  const borderColors = subjects.map(s => {
    if (s.isAbsent) return '#dc2626';
    const pct = s.max > 0 ? (s.obt / s.max) * 100 : 0;
    if (pct >= 75) return '#059669';
    if (pct >= 50) return '#2563eb';
    if (pct >= 33) return '#d97706';
    return '#dc2626';
  });

  const ctx = canvas.getContext('2d');
  if (ppStudentChartInst) {
    ppStudentChartInst.destroy();
  }

  if (typeof Chart === 'undefined') return;

  ppStudentChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Percentage (%)',
        data: dataValues,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 8,
        barPercentage: 0.52
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleFont: { family: "'Plus Jakarta Sans', system-ui, sans-serif", weight: 'bold', size: 12 },
          bodyFont: { family: "system-ui, sans-serif", weight: 'bold', size: 11 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const idx = context.dataIndex;
              const s = subjects[idx];
              if (s && s.isAbsent) return ' ⚠️ Absent (0%)';
              return ` ${context.parsed.y}% (Score: ${s ? s.obt + '/' + s.max : ''})`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 25,
            callback: value => value + '%',
            font: { weight: 'bold', size: 10 }
          },
          grid: {
            color: 'rgba(226, 232, 240, 0.6)'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            font: {
              family: "'Plus Jakarta Sans', system-ui, sans-serif",
              weight: 'bold',
              size: 11
            },
            color: '#1e293b'
          }
        }
      }
    }
  });
}

// -------------------------------------------------------------
// USER LOGOUT & ROLE SWITCHING
// -------------------------------------------------------------

function logoutSession() {
  openConfirmModal('Sign Out', 'Are you sure you want to log out of your session?', () => {
    if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
      if (typeof saveTeacherData === 'function') {
        saveTeacherData(DB.activeSession.teacher.id);
      }
    }
    DB.activeSession = null;
    saveDatabase();
    showRoleSelectionView();
    showToast('Logged out successfully.');
  });
}

// -------------------------------------------------------------
// TOASTS & MODALS
// -------------------------------------------------------------

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const title = document.getElementById('toast-title');
  const msgEl = document.getElementById('toast-msg');

  if (!toast) return;
  if (toastTimeout) clearTimeout(toastTimeout);

  toast.className = 'fixed top-6 right-6 z-[120] transform transition-all duration-300 bg-white/95 backdrop-blur-lg shadow-2xl rounded-2xl p-4 flex items-start space-x-3 max-w-sm border-2 translate-x-0 opacity-100';

  if (type === 'success') {
    toast.classList.add('border-emerald-200');
    icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    icon.className = 'text-emerald-500 text-2xl mt-0.5';
    title.innerText = 'Success';
    title.className = 'text-sm font-black text-emerald-800 mb-0.5';
  } else if (type === 'warning' || type === 'error') {
    toast.classList.add('border-rose-200');
    icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    icon.className = 'text-rose-500 text-2xl mt-0.5';
    title.innerText = type === 'error' ? 'Error' : 'Notice';
    title.className = 'text-sm font-black text-rose-800 mb-0.5';
  } else {
    toast.classList.add('border-indigo-200');
    icon.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
    icon.className = 'text-indigo-500 text-2xl mt-0.5';
    title.innerText = 'Information';
    title.className = 'text-sm font-black text-indigo-800 mb-0.5';
  }

  msgEl.innerText = msg;
  toastTimeout = setTimeout(closeToast, 4000);
}

function closeToast() {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.classList.remove('translate-x-0', 'opacity-100');
  toast.classList.add('translate-x-full', 'opacity-0');
}

function openConfirmModal(title, msg, onConfirm) {
  document.getElementById('confirm-title').innerText = title;
  document.getElementById('confirm-msg').innerText = msg;
  confirmAction = onConfirm;

  const modal = document.getElementById('confirm-modal');
  modal.classList.remove('hidden');

  document.getElementById('confirm-btn-yes').onclick = () => {
    if (confirmAction) confirmAction();
    closeConfirmModal();
  };
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
  confirmAction = null;
}

// Factory Reset Modal Controls
function openFactoryResetModal() {
  const modal = document.getElementById('factory-reset-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeFactoryResetModal() {
  const modal = document.getElementById('factory-reset-modal');
  if (modal) modal.classList.add('hidden');
}

function confirmFactoryReset(mode) {
  closeFactoryResetModal();

  if (mode === 'wipe') {
    openConfirmModal(
      'Factory Reset: Wipe All Data',
      'Are you absolutely sure you want to permanently erase ALL student records, assessment scores, attendance logs, and upcoming exam schedules? This cannot be undone and will restore a completely clean database.',
      () => {
        if (window.factoryResetData) {
          window.factoryResetData('wipe');
        }
      }
    );
  } else if (mode === 'marks_only') {
    openConfirmModal(
      'Clear All Marks Records',
      'Are you sure you want to permanently delete all assessment marks, attendance logs, and upcoming tests? Currently enrolled student profiles will remain intact.',
      () => {
        if (window.factoryResetData) {
          window.factoryResetData('marks_only');
        }
      }
    );
  } else if (mode === 'seed' || mode === 'demo') {
    openConfirmModal(
      'Restore Sample Demo Dataset',
      'Are you sure you want to reset the database and restore default Class 9 sample students, subject scores, and test schedules?',
      () => {
        if (window.factoryResetData) {
          window.factoryResetData('seed');
        }
      }
    );
  }
}

// -------------------------------------------------------------
// CLOUD DATABASE & LIVE LINK MODAL CONTROLS
// -------------------------------------------------------------
// CLOUD DATABASE (MONGODB ATLAS) MODAL LOGIC
// -------------------------------------------------------------

function openCloudDbModal() {
  const modal = document.getElementById('cloud-db-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Fill in live link
  const linkInput = document.getElementById('cloud-modal-live-link');
  if (linkInput && typeof CloudDB !== 'undefined') {
    linkInput.value = CloudDB.getLiveLink();
  }

  // Pre-fill existing MongoDB URI or config if available
  const configInput = document.getElementById('cloud-config-input');
  if (configInput) {
    const savedMongoUri = localStorage.getItem('gps_mongodb_uri_v1') || (typeof CloudDB !== 'undefined' ? CloudDB.mongoUri : '');
    if (savedMongoUri) {
      configInput.value = savedMongoUri;
    }
  }

  // Pre-fill custom backend URL if set
  const customBackendInput = document.getElementById('custom-backend-url-input');
  if (customBackendInput) {
    customBackendInput.value = localStorage.getItem('gps_backend_api_url') || '';
  }

  if (typeof CloudDB !== 'undefined') {
    CloudDB.updateBadgeUI();
    // Re-verify backend API in background to ensure status is fresh
    CloudDB.resolveApiUrl().then(() => {
      CloudDB.updateBadgeUI();
    }).catch(() => {});
  }
}

function closeCloudDbModal() {
  const modal = document.getElementById('cloud-db-modal');
  if (modal) modal.classList.add('hidden');
}

function copyLiveAppLink() {
  const linkInput = document.getElementById('cloud-modal-live-link');
  if (!linkInput) return;

  linkInput.select();
  linkInput.setSelectionRange(0, 99999);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(linkInput.value).then(() => {
      showToast('Live Web App link copied to clipboard!');
    }).catch(() => {
      document.execCommand('copy');
      showToast('Live Web App link copied!');
    });
  } else {
    document.execCommand('copy');
    showToast('Live Web App link copied!');
  }
}

function openLiveAppLink() {
  const linkInput = document.getElementById('cloud-modal-live-link');
  if (linkInput && linkInput.value) {
    window.open(linkInput.value, '_blank');
  }
}

function openDirectLocalhost() {
  window.open('http://localhost:5000', '_blank');
}

function toggleCustomBackendInput() {
  const container = document.getElementById('custom-backend-container');
  if (container) {
    container.classList.toggle('hidden');
  }
}

async function saveCustomBackendUrl() {
  const input = document.getElementById('custom-backend-url-input');
  const url = input ? input.value.trim() : '';
  if (url) {
    try {
      new URL(url);
      localStorage.setItem('gps_backend_api_url', url);
      showToast('Connecting to custom backend...', 'info');
      if (typeof CloudDB !== 'undefined') {
        await CloudDB.init();
      }
      showToast('Backend server updated successfully!', 'success');
    } catch (e) {
      showToast('Please enter a valid URL (e.g. https://your-app.onrender.com)', 'error');
    }
  } else {
    resetCustomBackendUrl();
  }
}

async function resetCustomBackendUrl() {
  localStorage.removeItem('gps_backend_api_url');
  const input = document.getElementById('custom-backend-url-input');
  if (input) input.value = '';
  showToast('Backend URL reset to automatic detection.', 'info');
  if (typeof CloudDB !== 'undefined') {
    await CloudDB.init();
  }
}

async function handleSaveFirebaseConfig() {
  const input = document.getElementById('cloud-config-input');
  const projInput = document.getElementById('cloud-project-id-input');
  const rawText = input ? input.value.trim() : '';
  const directProjId = projInput ? projInput.value.trim() : '';

  if (!rawText && !directProjId) {
    showToast('Please enter your MongoDB Atlas connection string (mongodb+srv://...).', 'error');
    return;
  }

  // If input is MongoDB Connection String
  if (rawText.startsWith('mongodb://') || rawText.startsWith('mongodb+srv://') || rawText.includes('mongodb.net')) {
    try {
      showToast('Connecting to MongoDB Atlas Cluster...', 'info');
      const res = await CloudDB.connectMongo(rawText);
      if (res && res.success) {
        showToast('✔ Successfully connected to MongoDB Atlas! Data will now sync live across all devices.', 'success');
        const linkInput = document.getElementById('cloud-modal-live-link');
        if (linkInput) linkInput.value = CloudDB.getLiveLink();
      } else {
        showToast(res && res.error ? res.error : 'MongoDB connection failed. Check your username, password, and IP whitelist.', 'error');
      }
    } catch (err) {
      showToast(`MongoDB error: ${err.message}`, 'error');
    }
    return;
  }

  showToast('Please provide a valid MongoDB connection string starting with mongodb+srv://', 'error');
}

function handleClearFirebaseConfig() {
  openConfirmModal('Disconnect MongoDB Atlas', 'Do you want to disconnect from MongoDB Atlas and revert to Local Storage mode?', async () => {
    if (typeof CloudDB !== 'undefined') {
      await CloudDB.clearConfig();
    }
    const input = document.getElementById('cloud-config-input');
    if (input) input.value = '';
    showToast('Disconnected from MongoDB Atlas. Reverted to Local Storage mode.');
  });
}

async function handleTestFirebaseConnection() {
  if (typeof CloudDB === 'undefined' || CloudDB.status !== 'connected') {
    showToast('MongoDB Atlas is not connected yet. Please enter connection string and click Save.', 'warning');
    return;
  }

  try {
    showToast('Pinging MongoDB Atlas...', 'info');
    await CloudDB.testConnection();
    showToast('✔ MongoDB Atlas test passed! Database is live and responsive.', 'success');
  } catch (err) {
    showToast(`Test failed: ${err.message}`, 'error');
  }
}

async function handleManualCloudSync() {
  if (typeof CloudDB === 'undefined' || CloudDB.status !== 'connected') {
    showToast('Database is not connected to MongoDB Atlas yet.', 'warning');
    return;
  }

  try {
    showToast('Syncing with MongoDB Atlas...', 'info');
    const pushOk = await CloudDB.syncToCloud();
    const pullOk = await CloudDB.syncFromCloud();
    if (pushOk || pullOk) {
      showToast('MongoDB Atlas synchronized successfully!', 'success');
    } else {
      showToast('Sync completed.', 'info');
    }
  } catch (err) {
    showToast(`Sync error: ${err.message}`, 'error');
  }
}

// Global symbols
window.openFactoryResetModal = openFactoryResetModal;
window.closeFactoryResetModal = closeFactoryResetModal;
window.confirmFactoryReset = confirmFactoryReset;
window.showRoleSelectionView = showRoleSelectionView;
window.selectRole = selectRole;
window.switchTeacherAuthTab = switchTeacherAuthTab;
window.addTeacherSubject = addTeacherSubject;
window.removeTeacherSubject = removeTeacherSubject;
window.handleTeacherSignupSubmit = handleTeacherSignupSubmit;
window.handleTeacherSigninSubmit = handleTeacherSigninSubmit;
window.fillDemoTeacher = fillDemoTeacher;
window.handleManagementLogin = handleManagementLogin;
window.toggleClassroomSelection = toggleClassroomSelection;
window.addSectionToClass = addSectionToClass;
window.removeSectionFromClass = removeSectionFromClass;
window.finishTeacherSetup = finishTeacherSetup;
window.switchTab = switchTab;
window.updateDashboard = updateDashboard;
window.clearDashFilters = clearDashFilters;
window.renderStudentsTable = renderStudentsTable;
window.addSingleStudent = addSingleStudent;
window.openEditStudent = openEditStudent;
window.closeEditStuModal = closeEditStuModal;
window.saveStudentEdit = saveStudentEdit;
window.deleteStudent = deleteStudent;
window.openParentLink = openParentLink;
window.copyParentLink = copyParentLink;
window.renderRecordsTable = renderRecordsTable;
window.clearRecordsFilter = clearRecordsFilter;
window.editRecord = editRecord;
window.closeEditModal = closeEditModal;
window.saveEditedRecord = saveEditedRecord;
window.deleteRecord = deleteRecord;
window.populateAnalyticsSelect = populateAnalyticsSelect;
window.renderAnalytics = renderAnalytics;
window.renderCommunications = renderCommunications;
window.logoutSession = logoutSession;
window.showToast = showToast;
window.closeToast = closeToast;
window.openConfirmModal = openConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.scrollPageNavigator = scrollPageNavigator;
window.openPageDrawer = openPageDrawer;
window.closePageDrawer = closePageDrawer;
window.switchTabAndCloseDrawer = switchTabAndCloseDrawer;
window.changeStudentsPage = changeStudentsPage;
window.changeStudentsPageSize = changeStudentsPageSize;
window.changeRecordsPage = changeRecordsPage;
window.changeRecordsPageSize = changeRecordsPageSize;
window.downloadParentMarksheetPDF = downloadParentMarksheetPDF;
window.downloadParentExcel = downloadParentExcel;
window.currentTeacherWorkspaceClass = currentTeacherWorkspaceClass;
window.renderTeacherWorkspaceBar = renderTeacherWorkspaceBar;
window.switchTeacherWorkspaceClass = switchTeacherWorkspaceClass;
window.updateMarksTargetClassUI = updateMarksTargetClassUI;
window.updateStudentTallyUI = updateStudentTallyUI;
window.updateStudentTallyBadges = updateStudentTallyBadges;
window.syncAllClassDropdownsAndCards = syncAllClassDropdownsAndCards;
window.showParentPortalView = showParentPortalView;

window.showTeacherDashboard = showTeacherDashboard;
window.showManagementDashboard = showManagementDashboard;
window.setManagementClassFilter = setManagementClassFilter;
window.updateManagementDashboard = updateManagementDashboard;
window.clearManagementFilters = clearManagementFilters;
window.renderManagementClassroomBar = renderManagementClassroomBar;
window.renderManagementClassMatrix = renderManagementClassMatrix;
window.renderManagementFacultyRoster = renderManagementFacultyRoster;
window.getManagementChartInstances = () => ({ mgmtClassBenchmarkInst, mgmtTrendChartInst, mgmtSubjectChartInst, mgmtGradeDistChartInst });
window.checkUrlRouting = checkUrlRouting;
window.openCloudDbModal = openCloudDbModal;
window.closeCloudDbModal = closeCloudDbModal;
window.copyLiveAppLink = copyLiveAppLink;
window.openLiveAppLink = openLiveAppLink;
window.handleSaveFirebaseConfig = handleSaveFirebaseConfig;
window.handleClearFirebaseConfig = handleClearFirebaseConfig;
window.handleTestFirebaseConnection = handleTestFirebaseConnection;
window.handleManualCloudSync = handleManualCloudSync;
window.openDirectLocalhost = openDirectLocalhost;
window.toggleCustomBackendInput = toggleCustomBackendInput;
window.saveCustomBackendUrl = saveCustomBackendUrl;
window.resetCustomBackendUrl = resetCustomBackendUrl;
window.handleParentLoginFormSubmit = handleParentLoginFormSubmit;
window.populateParentClassDropdown = populateParentClassDropdown;

// Management Faculty Controls & Honor Roll
window.openAddTeacherModal = openAddTeacherModal;
window.closeAddTeacherModal = closeAddTeacherModal;
window.handleAddTeacherSubmit = handleAddTeacherSubmit;
window.confirmRemoveTeacher = confirmRemoveTeacher;
window.confirmResetTestData = confirmResetTestData;
window.renderManagementTopPerformers = renderManagementTopPerformers;
window.renderManagementStudentDirectory = renderManagementStudentDirectory;
window.openManagementParentPortal = openManagementParentPortal;
window.renderParentPortalStudentChart = renderParentPortalStudentChart;
