/**
 * Glorious Public School Student Tracker - Upcoming Tests & Test Result Generator
 * Handles test scheduling, syllabus notifications, manual marks entry,
 * and bulk Excel upload matching the format: Gr No. | Name | Roll No | [Subject Marks...]
 */

let upcomingTestsFilter = 'all';

// Initialize Tests Module
function initTestsModule() {
  renderUpcomingTests();
  populateTestEntryDropdowns();
}

// -------------------------------------------------------------
// UPCOMING TESTS SECTION
// -------------------------------------------------------------
function renderUpcomingTests() {
  const container = document.getElementById('upcoming-tests-list');
  if (!container) return;

  let tests = [...DB.upcomingTests];

  // If teacher logged in, highlight or filter by their subjects
  const teacher = (DB.activeSession && DB.activeSession.role === 'teacher') ? DB.activeSession.teacher : null;
  const teacherSubjects = teacher ? teacher.subjects : [];

  if (upcomingTestsFilter === 'my' && teacherSubjects.length > 0) {
    tests = tests.filter(t => teacherSubjects.includes(t.subject));
  }

  // Sort tests by date ascending
  tests.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (tests.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 glass-card rounded-3xl p-8">
        <div class="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-500 text-2xl">
          <i class="fa-regular fa-calendar-xmark"></i>
        </div>
        <h4 class="text-lg font-bold text-slate-700">No Scheduled Tests</h4>
        <p class="text-xs text-slate-500 mt-1">Click the button below to schedule an upcoming assessment.</p>
        <button onclick="openNewTestModal()" class="mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-md hover:shadow-indigo-500/30 transition-all">
          <i class="fa-solid fa-plus mr-1.5"></i> Schedule New Test
        </button>
      </div>
    `;
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  container.innerHTML = tests.map(t => {
    const isTeacherSubject = teacherSubjects.includes(t.subject);
    const testDate = new Date(t.date);
    const isPast = t.date < todayStr;
    const isToday = t.date === todayStr;

    let badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
    let badgeText = 'Upcoming';
    if (isToday) {
      badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse';
      badgeText = 'Today!';
    } else if (isPast) {
      badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
      badgeText = 'Completed';
    }

    return `
      <div class="glass-card rounded-3xl p-6 relative overflow-hidden border-t-4 ${isTeacherSubject ? 'border-indigo-500' : 'border-slate-300'} shadow-md hover:shadow-lg transition-all flex flex-col justify-between">
        <div class="flex justify-between items-start mb-3">
          <span class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${badgeClass}">
            ${badgeText}
          </span>
          <div class="flex items-center space-x-1.5">
            <span class="text-xs font-bold text-slate-400">Class ${t.std}-${t.section || 'A'}</span>
            <button onclick="deleteUpcomingTest(${t.id})" class="text-slate-300 hover:text-rose-500 p-1 transition-colors" title="Delete Test">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>

        <div>
          <div class="flex items-center gap-2 mb-1">
            <h4 class="text-xl font-black text-slate-800">${t.subject}</h4>
            ${isTeacherSubject ? '<span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">My Subject</span>' : ''}
          </div>
          <p class="text-sm font-semibold text-slate-600 mb-4">${t.topic}</p>
        </div>

        <div class="bg-slate-50/80 p-3 rounded-2xl border border-slate-100 space-y-1.5 text-xs text-slate-600 mb-4 font-medium">
          <div class="flex items-center justify-between">
            <span><i class="fa-regular fa-calendar text-indigo-500 mr-2"></i>Date:</span>
            <strong class="text-slate-800">${t.date}</strong>
          </div>
          <div class="flex items-center justify-between">
            <span><i class="fa-solid fa-award text-amber-500 mr-2"></i>Max Marks:</span>
            <strong class="text-slate-800">${t.totalMarks} Marks</strong>
          </div>
          ${t.room ? `
          <div class="flex items-center justify-between">
            <span><i class="fa-solid fa-location-dot text-rose-500 mr-2"></i>Hall / Room:</span>
            <strong class="text-slate-800">${t.room}</strong>
          </div>` : ''}
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
          <button onclick="prepareTestMarksEntry('${t.subject}', '${t.std}', '${t.section || 'A'}', '${t.topic}', '${t.date}', ${t.totalMarks})"
            class="w-full bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-700 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center border border-indigo-200">
            <i class="fa-solid fa-pen-to-square mr-1.5"></i> Enter Results
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function filterUpcomingTests(type) {
  upcomingTestsFilter = type;
  document.querySelectorAll('.upcoming-filter-btn').forEach(btn => {
    if (btn.dataset.filter === type) {
      btn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
      btn.classList.remove('bg-white', 'text-slate-600');
    } else {
      btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
      btn.classList.add('bg-white', 'text-slate-600');
    }
  });
  renderUpcomingTests();
}

function openNewTestModal() {
  const modal = document.getElementById('new-test-modal');
  if (!modal) return;

  // Populate subject options from teacher's subjects or default subjects
  const subSelect = document.getElementById('new-test-subject');
  let subjects = ['Mathematics', 'Science', 'English', 'Social Science', 'Hindi', 'Gujarati', 'Computer', 'Sanskrit'];
  if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
    if (DB.activeSession.teacher.subjects && DB.activeSession.teacher.subjects.length > 0) {
      subjects = DB.activeSession.teacher.subjects;
    }
  }

  subSelect.innerHTML = subjects.map(s => `<option value="${s}">${s}</option>`).join('');

  // Populate class options
  const classSelect = document.getElementById('new-test-class');
  let classes = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
    classes = DB.activeSession.teacher.classrooms.map(c => c.classNumber);
  }
  classSelect.innerHTML = classes.map(c => `<option value="${c}">Class ${c}</option>`).join('');

  document.getElementById('new-test-date').value = new Date().toISOString().split('T')[0];
  modal.classList.remove('hidden');
}

function closeNewTestModal() {
  const modal = document.getElementById('new-test-modal');
  if (modal) modal.classList.add('hidden');
}

function saveNewUpcomingTest() {
  const subject = document.getElementById('new-test-subject').value;
  const std = document.getElementById('new-test-class').value;
  const section = document.getElementById('new-test-section').value.trim() || 'A';
  const topic = document.getElementById('new-test-topic').value.trim();
  const date = document.getElementById('new-test-date').value;
  const totalMarks = parseFloat(document.getElementById('new-test-total').value) || 50;
  const room = document.getElementById('new-test-room').value.trim();

  if (!topic || !date) {
    if (window.showToast) window.showToast('Please enter test topic and date.', 'warning');
    return;
  }

  const newTest = {
    id: Date.now(),
    subject,
    std,
    section,
    topic,
    date,
    totalMarks,
    room: room || 'Main Hall'
  };

  DB.upcomingTests.push(newTest);
  saveDatabase();
  closeNewTestModal();
  renderUpcomingTests();
  if (window.showToast) window.showToast(`Test scheduled for ${subject} (Class ${std})!`, 'success');
}

function deleteUpcomingTest(id) {
  if (window.openConfirmModal) {
    window.openConfirmModal('Delete Test Notice', 'Are you sure you want to cancel this scheduled test?', () => {
      DB.upcomingTests = DB.upcomingTests.filter(t => t.id !== id);
      saveDatabase();
      renderUpcomingTests();
      if (window.showToast) window.showToast('Test cancelled.', 'info');
    });
  } else {
    DB.upcomingTests = DB.upcomingTests.filter(t => t.id !== id);
    saveDatabase();
    renderUpcomingTests();
  }
}

// -------------------------------------------------------------
// TEST RESULT GENERATOR (MANUAL & EXCEL BULK UPLOAD)
// -------------------------------------------------------------
function populateTestEntryDropdowns() {
  const stdInput = document.getElementById('entry-std');
  const subjInput = document.getElementById('entry-subject');
  if (!stdInput || !subjInput) return;

  if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
    const teacher = DB.activeSession.teacher;
    if (teacher.classrooms && teacher.classrooms.length > 0 && !stdInput.value) {
      stdInput.value = teacher.classrooms[0].classNumber;
    }
    if (teacher.subjects && teacher.subjects.length > 0 && !subjInput.value) {
      subjInput.value = teacher.subjects[0];
    }
  }
}

function prepareTestMarksEntry(subject, std, section, topic, date, totalMarks) {
  // Navigate to Data Entry / Result Generator tab
  if (window.switchTab) window.switchTab('data-entry');

  document.getElementById('entry-std').value = std;
  document.getElementById('entry-subject').value = subject;
  document.getElementById('entry-topic').value = topic;
  document.getElementById('entry-date').value = date;
  document.getElementById('entry-total').value = totalMarks;

  // Automatically trigger class roster generator
  setTimeout(() => {
    loadMassEntryList();
  }, 250);
}

function loadMassEntryList() {
  const std = document.getElementById('entry-std').value.trim();
  const sub = document.getElementById('entry-subject').value.trim();
  const topic = document.getElementById('entry-topic').value.trim();
  const total = parseFloat(document.getElementById('entry-total').value) || 50;

  if (!std || !sub || !topic) {
    if (window.showToast) window.showToast('Standard, Subject and Test Topic are required.', 'warning');
    return;
  }

  let classStudents = DB.students.filter(s => s.std == std);
  if (classStudents.length === 0) {
    if (window.showToast) window.showToast(`No students enrolled in Std '${std}'.`, 'warning');
    return;
  }

  classStudents.sort((a, b) => a.roll - b.roll);

  // Check if any existing marks for this test
  const existingMarks = DB.marks.filter(m => m.subject === sub && m.topic === topic);

  const container = document.getElementById('mass-entry-list');
  container.innerHTML = classStudents.map(s => {
    const ex = existingMarks.find(m => m.roll === s.roll);
    let val = '';
    if (ex) {
      val = ex.isAbsent ? 'AB' : ex.marks;
    }

    return `
      <div class="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors">
        <div class="flex items-center space-x-3">
          <span class="font-mono font-black text-xs text-indigo-500 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">${s.roll}</span>
          <div>
            <div class="font-bold text-slate-800 text-sm">${s.name}</div>
            <div class="text-[10px] text-slate-400 font-semibold">${s.grNo || 'GR: -'} | Sec: ${s.section || 'A'}</div>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <input type="text" 
            class="mass-entry-input w-24 border-2 border-slate-200 rounded-xl px-3 py-1.5 text-center font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
            data-roll="${s.roll}"
            data-gr="${s.grNo || ''}"
            value="${val}"
            placeholder="Marks / AB">
          <span class="text-xs font-bold text-slate-400">/ ${total}</span>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('mass-entry-container').classList.remove('hidden');
  if (window.showToast) window.showToast(`Loaded ${classStudents.length} students for Class ${std}.`, 'info');
}

function saveMassEntry() {
  const std = (document.getElementById('entry-std') ? document.getElementById('entry-std').value.trim() : '') || (window.currentTeacherWorkspaceClass !== 'all' ? window.currentTeacherWorkspaceClass : '9');
  const sub = document.getElementById('entry-subject') ? document.getElementById('entry-subject').value.trim() : '';
  const topic = document.getElementById('entry-topic') ? document.getElementById('entry-topic').value.trim() : '';
  const dt = document.getElementById('entry-date') ? document.getElementById('entry-date').value : '';
  const tot = parseFloat(document.getElementById('entry-total') ? document.getElementById('entry-total').value : 50);

  if (!dt || isNaN(tot) || tot <= 0) {
    if (window.showToast) window.showToast('Please enter a valid Test Date and Max Marks.', 'warning');
    return;
  }

  let count = 0;
  const inputs = document.querySelectorAll('.mass-entry-input');

  inputs.forEach(input => {
    const val = input.value.trim();
    if (val !== '') {
      const isAb = (val.toLowerCase() === 'ab');
      const marks = isAb ? 0 : parseFloat(val);
      const roll = parseInt(input.dataset.roll);
      const grNo = input.dataset.gr;

      if (isAb || (!isNaN(marks) && marks >= 0 && marks <= tot)) {
        // Upsert record with class scoping
        const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(sub) : sub;
        const ex = DB.marks.find(m => 
          (m.std ? m.std.toString() === std.toString() : true) && 
          m.roll === roll && 
          (m.subject === cleanSub || (typeof cleanSubjectName === 'function' && cleanSubjectName(m.subject) === cleanSub)) && 
          m.date === dt
        );
        if (ex) {
          ex.marks = marks;
          ex.total = tot;
          ex.isAbsent = isAb;
          ex.std = std.toString();
          ex.source = 'manual';
          if (grNo && !ex.grNo) ex.grNo = grNo;
          count++;
        } else {
          DB.marks.push({
            id: Date.now() + Math.floor(Math.random() * 100000),
            grNo: grNo || '',
            roll: roll,
            std: std.toString(),
            subject: cleanSub,
            topic: topic || 'Unit Test',
            marks: marks,
            total: tot,
            date: dt,
            isAbsent: isAb,
            source: 'manual',
            enteredAt: new Date().toISOString()
          });
          count++;
        }
      }
    }
  });

  if (count > 0) {
    saveDatabase();
    if (window.showToast) window.showToast(`Saved manual marks for ${count} students in Class ${std} successfully!`, 'success');
    const container = document.getElementById('mass-entry-container');
    if (container) container.classList.add('hidden');
    if (window.updateDashboard) window.updateDashboard();
  } else {
    if (window.showToast) window.showToast('No valid marks entered.', 'warning');
  }
}

// =============================================================
// SYSTEM 1: DEDICATED STUDENT TALLY EXCEL (BULK ROSTER IMPORT / EXPORT)
// =============================================================

function downloadStudentTallyExcel(std = null) {
  if (typeof XLSX === 'undefined') {
    if (window.showToast) window.showToast('Excel library loading, please retry.', 'warning');
    return;
  }

  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];
  const targetStd = (std || (document.getElementById('tally-target-std') ? document.getElementById('tally-target-std').value : null) || (window.currentTeacherWorkspaceClass && window.currentTeacherWorkspaceClass !== 'all' ? window.currentTeacherWorkspaceClass : (assignedClasses[0] || '9'))).toString();

  const wb = XLSX.utils.book_new();

  const headers = ['GR No.', 'Roll No', 'Full Name', 'Class', 'Section', 'Mobile (WhatsApp)'];
  
  const sampleRows = [
    headers,
    [`GR-2024-${targetStd.padStart(2, '0')}1`, 101, `Student One Class ${targetStd}`, targetStd, 'A', '9876543210'],
    [`GR-2024-${targetStd.padStart(2, '0')}2`, 102, `Student Two Class ${targetStd}`, targetStd, 'A', '9876543211'],
    [`GR-2024-${targetStd.padStart(2, '0')}3`, 103, `Student Three Class ${targetStd}`, targetStd, 'A', '9876543212']
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, `Student_Tally_Class_${targetStd}`);
  XLSX.writeFile(wb, `Glorious_School_Student_Tally_Class_${targetStd}_Template.xlsx`);

  if (window.showToast) window.showToast(`Student Tally Excel template for Class ${targetStd} downloaded!`, 'success');
}

function exportCurrentStudentTally(std = 'all') {
  if (typeof XLSX === 'undefined') {
    if (window.showToast) window.showToast('Excel library loading, please retry.', 'warning');
    return;
  }

  const targetStd = (std || (document.getElementById('tally-target-std') ? document.getElementById('tally-target-std').value : 'all')).toString();
  let students = [...DB.students];
  if (targetStd !== 'all') {
    students = students.filter(s => s.std.toString() === targetStd);
  }

  if (students.length === 0) {
    if (window.showToast) window.showToast(`No students enrolled in Class ${targetStd} to export.`, 'warning');
    return;
  }

  const wb = XLSX.utils.book_new();
  const rows = [
    ['GLORIOUS PUBLIC SCHOOL - OFFICIAL STUDENT TALLY & ROSTER'],
    ['Exported On:', new Date().toLocaleString(), 'Class Filter:', targetStd === 'all' ? 'All Classes' : `Class ${targetStd}`],
    [],
    ['GR No.', 'Roll No', 'Full Name', 'Class', 'Section', 'Mobile (WhatsApp)']
  ];

  students.sort((a, b) => {
    if (a.std !== b.std) return parseInt(a.std) - parseInt(b.std);
    return a.roll - b.roll;
  }).forEach(s => {
    rows.push([s.grNo || '', s.roll, s.name, s.std, s.section || 'A', s.mobile || '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, `Roster_Class_${targetStd}`);
  XLSX.writeFile(wb, `Glorious_School_Student_Roster_Class_${targetStd}_${Date.now()}.xlsx`);

  if (window.showToast) window.showToast(`Exported ${students.length} student tally records successfully!`, 'success');
}

function processParsedStudentTallyRows(rows, explicitStd = null) {
  if (!rows || rows.length <= 1) {
    if (window.showToast) window.showToast('Uploaded Student Tally sheet is empty.', 'warning');
    return;
  }

  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];
  const targetStd = (explicitStd || (document.getElementById('tally-target-std') ? document.getElementById('tally-target-std').value : null) || (window.currentTeacherWorkspaceClass && window.currentTeacherWorkspaceClass !== 'all' ? window.currentTeacherWorkspaceClass : (assignedClasses[0] || '9'))).toString();

  // Find header row (first row with recognizable columns in English)
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const rowStr = (rows[r] || []).join(' ').toLowerCase();
    if (rowStr.includes('name') || rowStr.includes('roll') || rowStr.includes('gr') || rowStr.includes('student')) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = (rows[headerRowIdx] || []).map(h => (h ? h.toString().trim().toLowerCase() : ''));
  const grIdx = headers.findIndex(h => h.includes('gr') || h.includes('g.r') || h.includes('general') || h.includes('reg') || h.includes('register') || h.includes('જીઆર') || h.includes('જી.આર'));
  let rollIdx = headers.findIndex(h => {
    if (!h) return false;
    const clean = h.toString().trim().toLowerCase();
    if (clean.includes('gr') || clean.includes('g.r') || clean.includes('mobile') || clean.includes('phone') || clean.includes('contact')) return false;
    return clean.includes('roll') || clean.includes('રોલ') || /\b(?:r\.?\s*no\.?|rno|r_no)\b/i.test(clean);
  });
  if (rollIdx === -1) {
    rollIdx = headers.findIndex(h => {
      if (!h) return false;
      const clean = h.toString().trim().toLowerCase();
      if (clean.includes('gr') || clean.includes('g.r') || clean.includes('mobile') || clean.includes('phone') || clean.includes('contact')) return false;
      return /\b(?:sr\.?\s*no\.?|srno|sr_no|serial|seat\.?\s*no\.?)\b/i.test(clean) || clean.includes('અનુક્રમ') || clean.includes('ક્રમ');
    });
  }
  const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('student') || h.includes('નામ') || h.includes('વિદ્યાર્થી'));
  let stdIdx = headers.findIndex(h => h.includes('class') || h.includes('std') || h.includes('standard') || h.includes('grade') || h.includes('ધોરણ'));
  const secIdx = headers.findIndex(h => h.includes('sec') || h.includes('division') || h.includes('section') || h.includes('વર્ગ') || h.includes('વિભાગ'));
  if (stdIdx === -1 && secIdx !== -1) {
    stdIdx = headers.findIndex((h, idx) => idx !== secIdx && (h.includes('class') || h.includes('std')));
  }
  const mobIdx = headers.findIndex(h => h.includes('mob') || h.includes('phone') || h.includes('contact') || h.includes('whatsapp') || h.includes('મોબાઈલ'));

  if (nameIdx === -1 && rollIdx === -1 && grIdx === -1) {
    if (window.showToast) window.showToast("Sheet must contain 'Full Name', 'Roll No', or 'GR No.'", 'error');
    return;
  }

  let addedCount = 0;
  let updatedCount = 0;
  const toEngDigits = typeof gujaratiToEnglishDigits === 'function' ? gujaratiToEnglishDigits : (v => v);

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rowName = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].toString().trim() : '';
    const rollStr = rollIdx !== -1 && row[rollIdx] ? toEngDigits(row[rollIdx].toString().trim()) : '';
    const rawRoll = rollStr ? parseInt(rollStr.replace(/[^0-9]/g, '')) : null;
    const rowGr = grIdx !== -1 && row[grIdx] ? toEngDigits(row[grIdx].toString().trim()) : '';
    
    let rowStdRaw = (stdIdx !== -1 && row[stdIdx] && row[stdIdx].toString().trim()) ? toEngDigits(row[stdIdx].toString().trim()) : targetStd;
    let rowStd = rowStdRaw.replace(/[^0-9]/g, '') || targetStd;

    let rowSec = secIdx !== -1 && row[secIdx] ? row[secIdx].toString().trim().toUpperCase() : 'A';
    if (rowSec === 'અ' || rowSec === 'A') rowSec = 'A';
    else if (rowSec === 'બ' || rowSec === 'B') rowSec = 'B';
    else if (rowSec === 'ક' || rowSec === 'C') rowSec = 'C';
    else if (rowSec === 'ડ' || rowSec === 'D') rowSec = 'D';
    else if (!rowSec) rowSec = 'A';

    const rowMob = mobIdx !== -1 && row[mobIdx] ? (typeof parseContactNumbers === 'function' ? parseContactNumbers(row[mobIdx]) : toEngDigits(row[mobIdx].toString().trim())) : '';

    if (!rowName && !rawRoll && !rowGr) continue;

    const isCorruptName = !rowName || rowName.includes('???') || /^[?\s.-]{3,}$/.test(rowName.trim());

    // 1. Match strictly by (same class, same section, same roll)
    let existing = null;
    if (rawRoll) {
      existing = DB.students.find(s => 
        String(s.std).trim() === String(rowStd).trim() && 
        String(s.section || 'A').trim().toUpperCase() === rowSec.toUpperCase() && 
        s.roll === rawRoll
      );
    }

    // 2. Next match strictly by (same class, matching GR number)
    if (!existing && rowGr) {
      const normGr = String(rowGr).trim().toLowerCase();
      existing = DB.students.find(s => 
        String(s.std).trim() === String(rowStd).trim() && 
        s.grNo && String(s.grNo).trim().toLowerCase() === normGr &&
        (!rowName || !s.name || s.name.trim().toLowerCase() === rowName.toLowerCase() || s.name.includes('???') || rowName.includes('???') || isCorruptName || s.roll === rawRoll)
      );
    }

    // 3. Fallback: match by (same class, same section, exact name)
    if (!existing && rowName && !isCorruptName && rowName.length > 2) {
      existing = DB.students.find(s => 
        String(s.std).trim() === String(rowStd).trim() && 
        String(s.section || 'A').trim().toUpperCase() === rowSec.toUpperCase() && 
        s.name && String(s.name).trim().toLowerCase() === rowName.toLowerCase()
      );
    }

    let roll = rawRoll;
    const sectionRolls = DB.students
      .filter(s => String(s.std).trim() === String(rowStd).trim() && String(s.section || 'A').trim().toUpperCase() === rowSec.toUpperCase())
      .map(s => s.roll)
      .filter(r => typeof r === 'number' && !isNaN(r));

    if (!existing) {
      if (!roll) {
        roll = sectionRolls.length > 0 ? Math.max(...sectionRolls) + 1 : 1;
      } else if (sectionRolls.includes(roll)) {
        const maxRoll = sectionRolls.length > 0 ? Math.max(...sectionRolls) : 0;
        roll = maxRoll + 1;
      }
    } else {
      if (rawRoll && (!sectionRolls.includes(rawRoll) || existing.roll === rawRoll)) {
        roll = rawRoll;
      } else {
        roll = existing.roll;
      }
    }

    const grNo = rowGr || (existing && existing.grNo) || `GR-${new Date().getFullYear()}-${rowStd}-${String(roll).padStart(3, '0')}`;
    const name = rowName || (existing ? existing.name : `Student ${roll}`);

    if (existing) {
      existing.name = name;
      existing.std = rowStd.toString();
      existing.section = rowSec || existing.section || 'A';
      existing.roll = roll;
      if (rowMob) existing.mobile = rowMob;
      if (rowGr) existing.grNo = rowGr;
      updatedCount++;
    } else {
      DB.students.push({
        id: Date.now() + Math.floor(Math.random() * 1000000),
        grNo: grNo,
        roll: roll,
        name: name,
        std: rowStd.toString(),
        section: rowSec,
        mobile: rowMob
      });
      addedCount++;
    }
  }

  saveDatabase();
  if (window.showToast) {
    window.showToast(`Student Tally for Class ${targetStd}: ${addedCount} enrolled, ${updatedCount} updated!`, 'success');
  }

  if (window.renderStudentsTable) window.renderStudentsTable();
  if (window.updateDashboard) window.updateDashboard();
  if (window.updateStudentTallyBadges) window.updateStudentTallyBadges();
  if (window.renderTeacherWorkspaceBar) window.renderTeacherWorkspaceBar();
}

function handleStudentTallyUpload(event, explicitStd = null) {
  if (Array.isArray(event)) {
    return processParsedStudentTallyRows(event, explicitStd);
  }

  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      let workbook;
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt');
      if (isCsv) {
        try {
          const text = new TextDecoder('utf-8').decode(data);
          workbook = XLSX.read(text, { type: 'string' });
        } catch (err) {
          workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
        }
      } else {
        workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      // Check if file contains corrupted '???'
      const hasCorruptedNames = rows.some(r => Array.isArray(r) && r.some(cell => cell && typeof cell === 'string' && (cell.includes('???') || /^[?\s.-]{3,}$/.test(cell))));
      if (hasCorruptedNames && window.showToast) {
        window.showToast("Note: File contains question marks. Please save as a standard Excel Workbook (.xlsx).", 'warning');
      }

      processParsedStudentTallyRows(rows, explicitStd);
    } catch (err) {
      console.error('Student tally upload error:', err);
      if (window.showToast) window.showToast('Failed to parse Student Tally file.', 'error');
    }
    if (event.target) event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// =============================================================
// SYSTEM 2: REPORT CARD GENERATION EXCEL (BULK MARKS UPLOAD & TEMPLATES)
// =============================================================

function downloadFormatExcel(type) {
  if (typeof XLSX === 'undefined') {
    if (window.showToast) window.showToast('Excel library loading, please retry.', 'warning');
    return;
  }

  const wb = XLSX.utils.book_new();

  if (type === 'randomized-multi') {
    // Multi-subject format with Subject Date (Total Marks) in the same block/header:
    const headers = [
      'Gr No.',
      'Name',
      'Roll No',
      'Mathematics 2026-09-12 (50)',
      'Science 2026-09-18 (50)',
      'English 2026-09-22 (40)',
      'Social Science 2026-09-25 (50)',
      'Computer 2026-09-28 (25)'
    ];
    const sampleRows = [
      headers,
      ['GR-2024-001', 'Aarav Patel', 101, 48, 45, 38, 46, 24],
      ['GR-2024-002', 'Priya Shah', 102, 42, 40, 39, 44, 25],
      ['GR-2024-003', 'Rohan Mehta', 103, 18, 22, 28, 30, 15],
      ['GR-2024-004', 'Ananya Joshi', 104, 49, 48, 40, 47, 25],
      ['GR-2024-005', 'Kabir Singhania', 105, 'AB', 34, 32, 40, 20]
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 28 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Multi_Subject_Marks');
    XLSX.writeFile(wb, 'Template_GrNo_Name_Roll_MultiSubject.xlsx');
  } else {
    // Single test format
    const headers = ['Gr No.', 'Name', 'Roll No', 'Class', 'Subject', 'Topic', 'Date', 'Marks (or AB)', 'Total'];
    const sampleRows = [
      headers,
      ['GR-2024-001', 'Aarav Patel', 101, 9, 'Mathematics', 'Algebra Test', '2026-09-07', 48, 50],
      ['GR-2024-002', 'Priya Shah', 102, 9, 'Mathematics', 'Algebra Test', '2026-09-07', 42, 50],
      ['GR-2024-003', 'Rohan Mehta', 103, 9, 'Mathematics', 'Algebra Test', '2026-09-07', 'AB', 50]
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    ws['!cols'] = [{ wch: 15 }, { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Single_Test_Marks');
    XLSX.writeFile(wb, 'Template_Single_Test_Marks.xlsx');
  }

  if (window.showToast) window.showToast('Sample template downloaded!', 'success');
}

/**
 * Downloads a class-specific Marks Template pre-populated with the ACTUAL enrolled students of that class!
 * The teacher never needs to re-enter student names or roll numbers.
 */
function downloadClassMarksTemplate(std = null) {
  if (typeof XLSX === 'undefined') {
    if (window.showToast) window.showToast('Excel library loading, please retry.', 'warning');
    return;
  }

  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['9'];
  const targetStd = (std || (document.getElementById('marks-target-std') ? document.getElementById('marks-target-std').value : null) || (window.currentTeacherWorkspaceClass && window.currentTeacherWorkspaceClass !== 'all' ? window.currentTeacherWorkspaceClass : (assignedClasses[0] || '9'))).toString();

  const classStudents = DB.students.filter(s => s.std.toString() === targetStd).sort((a, b) => a.roll - b.roll);

  const wb = XLSX.utils.book_new();
  const headers = [
    'Gr No.',
    'Student Name',
    'Roll No',
    'Mathematics 2026-09-12 (50)',
    'Science 2026-09-18 (50)',
    'English 2026-09-22 (40)',
    'Social Science 2026-09-25 (50)',
    'Computer 2026-09-28 (25)'
  ];

  const rows = [headers];

  if (classStudents.length > 0) {
    classStudents.forEach(s => {
      rows.push([s.grNo || '', s.name, s.roll, '', '', '', '', '']);
    });
  } else {
    // Provide sample rows if no students enrolled yet
    rows.push([`GR-2024-${targetStd.padStart(2, '0')}1`, `Sample Student 1`, 101, 45, 42, 35, 40, 22]);
    rows.push([`GR-2024-${targetStd.padStart(2, '0')}2`, `Sample Student 2`, 102, 48, 46, 38, 44, 24]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 10 }, { wch: 28 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws, `Class_${targetStd}_Marks`);
  XLSX.writeFile(wb, `Class_${targetStd}_Report_Card_Marks_Template.xlsx`);

  if (window.showToast) {
    window.showToast(`Report Card Marks Template for Class ${targetStd} (${classStudents.length} students enrolled) downloaded!`, 'success');
  }
}

function downloadGujaratiTallyTemplate() {
  downloadStudentRosterTemplate('9');
}

function downloadGujaratiMarksTemplate() {
  downloadStandardMarksTemplate('9');
}

function handleExcelUpload(event, explicitStd = null) {
  const file = event.target.files[0];
  if (!file) return;

  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['9'];
  const targetStd = explicitStd || (document.getElementById('marks-target-std') ? document.getElementById('marks-target-std').value : null) || (window.currentTeacherWorkspaceClass && window.currentTeacherWorkspaceClass !== 'all' ? window.currentTeacherWorkspaceClass : (assignedClasses[0] || '9'));

  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      let workbook;
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt');
      if (isCsv) {
        try {
          const text = new TextDecoder('utf-8').decode(data);
          workbook = XLSX.read(text, { type: 'string' });
        } catch (err) {
          workbook = XLSX.read(data, { type: 'array', codepage: 65001, cellDates: true });
        }
      } else {
        workbook = XLSX.read(data, { type: 'array', codepage: 65001, cellDates: true });
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

      if (!rows || rows.length <= 1) {
        if (window.showToast) window.showToast('The uploaded Excel file is empty.', 'warning');
        return;
      }

      // Check if file contains corrupted '???'
      const hasCorruptedNames = rows.some(r => Array.isArray(r) && r.some(cell => cell && typeof cell === 'string' && (cell.includes('???') || /^[?\s.-]{3,}$/.test(cell))));
      if (hasCorruptedNames && window.showToast) {
        window.showToast("Note: File contains question marks. Please save as a standard Excel Workbook (.xlsx).", 'warning');
      }

      processParsedExcelMarks(rows, targetStd);
    } catch (err) {
      console.error('Excel parse error:', err);
      if (window.showToast) window.showToast('Failed to read Excel file. Please ensure valid .xlsx/.csv format.', 'error');
    }
    event.target.value = '';
  };

  reader.readAsArrayBuffer(file);
}

// Normalize date to YYYY-MM-DD for standard in-memory storage
function normalizeDateYMD(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const str = dateStr.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(str)) {
    const p = str.split(/[-/.]/);
    const d = p[0].padStart(2, '0');
    const m = p[1].padStart(2, '0');
    let y = p[2];
    if (y.length === 2) y = parseInt(y) < 50 ? '20' + y : '19' + y;
    return `${y}-${m}-${d}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return str;
}

/**
 * Parses a subject column header or cell that may contain:
 * - Subject name (e.g. "Mathematics", "Science")
 * - Test Date (e.g. "15/09/2026", "15/9/26", "15-Sep-2026", "2026-09-15", etc.)
 * - Total Marks in brackets (e.g. "(25)", "(50)", "[40]", "(Total: 25)", "(25 Marks)", etc.)
 * Returns { subject, date, total }
 */
function parseSubjectHeader(headerStr, fallbackDate = '', fallbackTotal = 50) {
  if (!headerStr) {
    return { subject: '', date: fallbackDate || new Date().toISOString().split('T')[0], total: fallbackTotal || 50 };
  }

  const toEngDigits = typeof gujaratiToEnglishDigits === 'function' ? gujaratiToEnglishDigits : (v => v);
  let str = headerStr.toString().trim();
  let extractedTotal = null;
  let extractedDate = null;

  // Step A: Extract bracketed total marks: (25), [50], {100}, (Total: 40), (40 Marks), (/25)
  const bracketRegex = /(?:\(|\{|\[)\s*(?:total\s*(?:marks?)?\s*[:=-]?|max\s*(?:marks?)?\s*[:=-]?|marks?\s*[:=-]?|out\s*of\s*[:=-]?|\/)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:marks?|m|pts?)?\s*(?:\)|\}|\])/i;
  const bracketMatch = str.match(bracketRegex);
  if (bracketMatch) {
    const val = parseFloat(bracketMatch[1]);
    if (!isNaN(val) && val > 0) {
      extractedTotal = val;
      str = str.replace(bracketMatch[0], ' ');
    }
  }

  // Step B: Extract date (Must run before any unbracketed slash check to protect slashes in dates!)
  const monthsMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  
  // Text month: 15-Sep-2026 or 15 Sep 2026 or (15-Sep-2026)
  const textMonthRegex = /(?:\(|\b)(\d{1,2})[-/ ]([a-zA-Z]{3,9})[-/ ](\d{2,4})(?:\)|\b)/;
  const textMatch = str.match(textMonthRegex);

  // Numeric date: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY, DD.MM.YYYY
  const numDateRegex = /(?:\(|\b)([0-9]{4}[-/. ][0-9]{1,2}[-/. ][0-9]{1,2}|[0-9]{1,2}[-/. ][0-9]{1,2}[-/. ][0-9]{2,4})(?:\)|\b)/;
  const numMatch = str.match(numDateRegex);

  if (textMatch) {
    const d = textMatch[1].padStart(2, '0');
    const mStr = textMatch[2].toLowerCase().slice(0, 3);
    let y = textMatch[3];
    if (y.length === 2) y = parseInt(y) < 50 ? '20' + y : '19' + y;
    const m = monthsMap[mStr];
    if (m) {
      extractedDate = `${y}-${m}-${d}`;
      str = str.replace(textMatch[0], ' ');
    }
  } else if (numMatch) {
    const rawDate = numMatch[1];
    const parts = rawDate.split(/[-/. ]/);
    let parsedDate = '';
    if (parts[0].length === 4) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      parsedDate = `${y}-${m}-${d}`;
    } else {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      let y = parts[2];
      if (y.length === 2) y = parseInt(y) < 50 ? '20' + y : '19' + y;
      parsedDate = `${y}-${m}-${d}`;
    }
    if (parsedDate) {
      extractedDate = parsedDate;
      str = str.replace(numMatch[0], ' ');
    }
  }

  // Step C: If still no total found, check unbracketed "Total: 25" or "Max: 25"
  if (extractedTotal === null) {
    const unbracketedTotalRegex = /(?:total\s*(?:marks?)?\s*[:=-]|max\s*(?:marks?)?\s*[:=-]|out\s*of\s*[:=-])\s*([0-9]+(?:\.[0-9]+)?)\s*(?:marks?|m)?\b/i;
    const utMatch = str.match(unbracketedTotalRegex);
    if (utMatch) {
      const val = parseFloat(utMatch[1]);
      if (!isNaN(val) && val > 0) {
        extractedTotal = val;
        str = str.replace(utMatch[0], ' ');
      }
    }
  }

  // Step D: Clean subject name completely
  let cleanSubject = typeof cleanSubjectName === 'function' ? cleanSubjectName(str) : (window.cleanSubjectName ? window.cleanSubjectName(str) : str);
  if (!cleanSubject) cleanSubject = headerStr.toString().trim();

  return {
    subject: cleanSubject,
    date: extractedDate || fallbackDate || new Date().toISOString().split('T')[0],
    total: extractedTotal !== null ? extractedTotal : (fallbackTotal || 50)
  };
}

function isDedicatedMetaCol(header) {
  if (!header) return true;
  const raw = header.toString().trim();
  const lower = raw.toLowerCase();
  const norm = lower.replace(/[()[\]{}:;.\-_/\\# ]+/g, '');
  
  const metaExactTokens = [
    'gr', 'grno', 'grnum', 'generalreg', 'sr', 'srno', 'srnum', 'serial', 'serialno', 'seatno',
    'roll', 'rollno', 'rollnum', 'rollnumber', 'rno', 'rno.', 'r.no', 'roll#',
    'name', 'studentname', 'fullname', 'candidate', 'student',
    'class', 'std', 'standard', 'grade',
    'sec', 'section', 'division', 'div',
    'mobile', 'phone', 'contact', 'whatsapp', 'cell',
    'gender', 'dob', 'address', 'email',
    'total', 'totalmarks', 'maxmarks', 'obtained', 'obtainedmarks',
    'percentage', 'percent', 'pct', 'rank', 'grade', 'result',
    'remarks', 'remark', 'status', 'attendance', 'absent', 'present',
    // Gujarati tokens
    'જીઆર', 'જીઆરનં', 'રોલ', 'રોલનં', 'રોલનંબર', 'અનુક્રમ', 'અનુક્રમનંબર', 'ક્રમ',
    'નામ', 'વિદ્યાર્થી', 'વિદ્યાર્થીનુંનામ', 'ધોરણ', 'વર્ગ', 'વિભાગ', 'શાખા', 'ટુકડી',
    'મોબાઈલ', 'ફોન', 'સંપર્ક', 'તારીખ', 'કુલ', 'ટકા', 'પરિણામ', 'ગ્રેડ', 'નંબર'
  ];

  if (metaExactTokens.includes(norm)) return true;

  // Pattern matches
  if (/\b(?:roll|roll\s*no\.?|roll\s*number|r\.?\s*no\.?|sr\.?\s*no\.?|serial\s*no\.?|gr\.?\s*no\.?|g\.?\s*r\.?|student\s*name|full\s*name)\b/i.test(lower)) return true;
  if (/\b(?:total\s*marks?|max\s*marks?|marks?\s*obtained|percentage|percent|rank|grade|result|attendance)\b/i.test(lower)) return true;
  if (lower.includes('રોલ') || lower.includes('જી.આર') || lower.includes('અનુક્રમ')) return true;

  return false;
}
window.isDedicatedMetaCol = isDedicatedMetaCol;

function processParsedExcelMarks(rows, explicitTargetStd = null) {
  const toEngDigits = (str) => {
    if (str === null || str === undefined) return '';
    const s = str.toString();
    return typeof gujaratiToEnglishDigits === 'function' ? gujaratiToEnglishDigits(s) : (window.gujaratiToEnglishDigits ? window.gujaratiToEnglishDigits(s) : s);
  };

  // Normalize header row
  const rawHeaders = rows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));
  
  // Find key column indexes (standard English & Gujarati)
  let grIdx = rawHeaders.findIndex(h => h.includes('gr') || h.includes('g.r') || h.includes('reg') || h.includes('register') || h.includes('જીઆર') || h.includes('જી.આર'));
  let nameIdx = rawHeaders.findIndex(h => h.includes('name') || h.includes('student') || h.includes('નામ') || h.includes('વિદ્યાર્થી'));
  
  // Find rollIdx with strict precision (NEVER match 'no' alone as it collides with 'gr no', 'sr no', 'economics', etc.)
  let rollIdx = rawHeaders.findIndex(h => {
    if (!h) return false;
    const clean = h.toString().trim().toLowerCase();
    if (clean.includes('gr') || clean.includes('g.r') || clean.includes('mobile') || clean.includes('phone') || clean.includes('contact')) return false;
    return clean.includes('roll') || clean.includes('રોલ') || /\b(?:r\.?\s*no\.?|rno|r_no)\b/i.test(clean);
  });
  // Fallback: Check serial/sequence number ONLY if no explicit roll column was found
  if (rollIdx === -1) {
    rollIdx = rawHeaders.findIndex(h => {
      if (!h) return false;
      const clean = h.toString().trim().toLowerCase();
      if (clean.includes('gr') || clean.includes('g.r') || clean.includes('mobile') || clean.includes('phone') || clean.includes('contact')) return false;
      return /\b(?:sr\.?\s*no\.?|srno|sr_no|serial|seat\.?\s*no\.?)\b/i.test(clean) || clean.includes('અનુક્રમ') || clean.includes('ક્રમ');
    });
  }

  let secIdx = rawHeaders.findIndex(h => h.includes('sec') || h.includes('division') || h.includes('section') || h.includes('વર્ગ') || h.includes('વિભાગ'));
  let stdIdx = rawHeaders.findIndex((h, idx) => idx !== secIdx && (h.includes('class') || h.includes('std') || h.includes('grade') || h.includes('standard') || h.includes('ધોરણ')));

  if (rollIdx === -1 && nameIdx === -1 && grIdx === -1) {
    if (window.showToast) window.showToast("Excel must contain at least 'Roll No' or 'Student Name' or 'GR No.'", 'error');
    return;
  }

  // Target standard for this upload
  const rawDefaultStd = (explicitTargetStd || (document.getElementById('marks-target-std') ? document.getElementById('marks-target-std').value : null) || (window.currentTeacherWorkspaceClass && window.currentTeacherWorkspaceClass !== 'all' ? window.currentTeacherWorkspaceClass : '9')).toString();
  const defaultStd = toEngDigits(rawDefaultStd);

  const defaultSubject = 'Mathematics';
  const defaultTopic = 'Unit Assessment';
  const defaultDate = new Date().toISOString().split('T')[0];
  const defaultTotal = 50;

  // Check if this is the multi-subject format: Gr No. | Name | Roll No | [Subject columns...]
  const isMultiSubject = !rawHeaders.some(h => h.includes('subject')) && !rawHeaders.some(h => h.includes('topic'));

  let addedCount = 0;
  let updatedCount = 0;

  if (isMultiSubject) {
    const subjectCols = [];
    rows[0].forEach((colName, idx) => {
      if (idx === grIdx || idx === nameIdx || idx === rollIdx || idx === stdIdx || idx === secIdx) return;
      const cleanName = colName ? colName.toString().trim() : '';
      if (!cleanName) return;
      if (isDedicatedMetaCol(cleanName)) return;

      const parsed = parseSubjectHeader(cleanName, defaultDate, defaultTotal);
      if (!parsed.subject || isDedicatedMetaCol(parsed.subject)) return;

      subjectCols.push({
        index: idx,
        rawHeader: cleanName,
        subject: parsed.subject,
        date: parsed.date,
        total: parsed.total
      });
    });

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const grNo = grIdx !== -1 && row[grIdx] ? toEngDigits(row[grIdx].toString().trim()) : '';
      const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].toString().trim() : '';
      const roll = rollIdx !== -1 && row[rollIdx] ? parseInt(toEngDigits(row[rollIdx])) : null;
      let rowStd = (stdIdx !== -1 && row[stdIdx] && row[stdIdx].toString().trim()) ? toEngDigits(row[stdIdx].toString().trim()) : null;
      if (!rowStd) {
        let matchedStu = null;
        if (grNo) {
          matchedStu = DB.students.find(s => s.grNo && s.grNo.toString().trim().toLowerCase() === grNo.toLowerCase());
        }
        if (!matchedStu && roll) {
          const rollMatches = DB.students.filter(s => s.roll === roll);
          if (rollMatches.length === 1) {
            matchedStu = rollMatches[0];
          } else if (rollMatches.length > 1) {
            matchedStu = rollMatches.find(s => String(s.std) === String(defaultStd)) || rollMatches[0];
          }
        }
        if (!matchedStu && name) {
          matchedStu = DB.students.find(s => s.name && s.name.trim().toLowerCase() === name.toLowerCase());
        }
        rowStd = (matchedStu && matchedStu.std) ? matchedStu.std.toString() : defaultStd;
      }
      const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : [];
      if (assignedClasses.length > 0 && !assignedClasses.includes(rowStd)) {
        rowStd = defaultStd;
      }

      if (!roll && !name) continue;

      // Ensure student exists in directory scoped to rowStd
      ensureStudentRecord(roll, grNo, name, rowStd);

      // Process each subject column
      subjectCols.forEach(sc => {
        const rawScore = row[sc.index];
        if (rawScore !== undefined && rawScore !== null && rawScore.toString().trim() !== '') {
          const rawStr = toEngDigits(rawScore.toString().trim());
          const cleanScorePart = rawStr.split('/')[0].trim();
          const lowerScorePart = cleanScorePart.toLowerCase();
          const isAb = ['ab', 'absent', 'a', 'gh'].includes(lowerScorePart) || rawStr.toLowerCase().startsWith('ab') || rawStr.toLowerCase().startsWith('absent');
          const marks = isAb ? 0 : parseFloat(cleanScorePart);

          if (isAb || (!isNaN(marks) && marks >= 0)) {
            const targetRoll = roll || (name ? getRollByName(name, rowStd) : 0);
            const targetDate = sc.date || defaultDate;
            let targetTotal = sc.total || defaultTotal;
            if (rawStr.includes('/')) {
              const denom = parseFloat(rawStr.split('/')[1].trim());
              if (!isNaN(denom) && denom > 0) targetTotal = denom;
            }
            const targetTopic = defaultTopic;

            // Upsert mark record with CLASS SCOPING: match roll AND std
            const cleanTargetSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(sc.subject) : sc.subject;
            const ex = DB.marks.find(m => 
              (m.std ? m.std.toString() === rowStd.toString() : true) &&
              (m.roll === targetRoll || (grNo && m.grNo && String(m.grNo).trim() === String(grNo).trim())) && 
              (m.subject === cleanTargetSub || (typeof cleanSubjectName === 'function' && cleanSubjectName(m.subject) === cleanTargetSub)) && 
              (m.date === targetDate || m.date === defaultDate)
            );

            if (ex) {
              ex.subject = cleanTargetSub;
              ex.date = targetDate;
              ex.total = targetTotal;
              ex.marks = marks;
              ex.isAbsent = isAb;
              ex.std = rowStd.toString();
              ex.source = 'excel';
              if (grNo) ex.grNo = grNo;
              updatedCount++;
            } else {
              DB.marks.push({
                id: Date.now() + Math.floor(Math.random() * 100000),
                grNo: grNo,
                roll: targetRoll,
                std: rowStd.toString(),
                subject: cleanTargetSub,
                topic: targetTopic,
                marks: marks,
                total: targetTotal,
                date: targetDate,
                isAbsent: isAb,
                source: 'excel',
                importedAt: new Date().toISOString()
              });
              addedCount++;
            }
          }
        }
      });
    }
  } else {
    // Single test format with explicit Subject/Topic columns
    const subjIdx = rawHeaders.findIndex(h => h.includes('subject'));
    const topIdx = rawHeaders.findIndex(h => h.includes('topic') || h.includes('chapter') || h.includes('unit'));
    const dateIdx = rawHeaders.findIndex(h => h.includes('date'));
    const marksIdx = rawHeaders.findIndex(h => h.includes('mark') || h.includes('obt') || h.includes('score'));
    const totalIdx = rawHeaders.findIndex(h => h.includes('total') || h.includes('max') || h.includes('out of'));

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const grNo = grIdx !== -1 && row[grIdx] ? toEngDigits(row[grIdx].toString().trim()) : '';
      const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].toString().trim() : '';
      const roll = rollIdx !== -1 && row[rollIdx] ? parseInt(toEngDigits(row[rollIdx])) : null;
      let rowStd = (stdIdx !== -1 && row[stdIdx] && row[stdIdx].toString().trim()) ? toEngDigits(row[stdIdx].toString().trim()) : null;
      if (!rowStd) {
        let matchedStu = null;
        if (grNo) {
          matchedStu = DB.students.find(s => s.grNo && s.grNo.toString().trim().toLowerCase() === grNo.toLowerCase());
        }
        if (!matchedStu && roll) {
          const rollMatches = DB.students.filter(s => s.roll === roll);
          if (rollMatches.length === 1) {
            matchedStu = rollMatches[0];
          } else if (rollMatches.length > 1) {
            matchedStu = rollMatches.find(s => String(s.std) === String(defaultStd)) || rollMatches[0];
          }
        }
        if (!matchedStu && name) {
          matchedStu = DB.students.find(s => s.name && s.name.trim().toLowerCase() === name.toLowerCase());
        }
        rowStd = (matchedStu && matchedStu.std) ? matchedStu.std.toString() : defaultStd;
      }
      let subject = subjIdx !== -1 && row[subjIdx] ? row[subjIdx].toString().trim() : defaultSubject;
      const topic = topIdx !== -1 && row[topIdx] ? row[topIdx].toString().trim() : defaultTopic;
      let date = dateIdx !== -1 && row[dateIdx] ? row[dateIdx].toString().trim() : defaultDate;
      let total = totalIdx !== -1 && row[totalIdx] ? parseFloat(toEngDigits(row[totalIdx])) : defaultTotal;

      const parsedSubj = parseSubjectHeader(subject, date, total);
      subject = parsedSubj.subject;
      if (isDedicatedMetaCol(subject)) continue;
      if (dateIdx === -1 && parsedSubj.date) date = parsedSubj.date;
      if (totalIdx === -1 && parsedSubj.total) total = parsedSubj.total;
      date = normalizeDateYMD(date);

      const rawMarks = marksIdx !== -1 ? row[marksIdx] : null;
      if (rawMarks === null || rawMarks === undefined) continue;

      const rawStr = toEngDigits(rawMarks.toString().trim());
      const cleanScorePart = rawStr.split('/')[0].trim();
      const lowerScorePart = cleanScorePart.toLowerCase();
      const isAb = ['ab', 'absent', 'a', 'gh'].includes(lowerScorePart) || rawStr.toLowerCase().startsWith('ab') || rawStr.toLowerCase().startsWith('absent');
      const marks = isAb ? 0 : parseFloat(cleanScorePart);
      if (rawStr.includes('/')) {
        const denom = parseFloat(rawStr.split('/')[1].trim());
        if (!isNaN(denom) && denom > 0) total = denom;
      }

      if (isAb || (!isNaN(marks) && marks >= 0)) {
        ensureStudentRecord(roll, grNo, name, rowStd);
        const targetRoll = roll || (name ? getRollByName(name, rowStd) : 0);
        const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(subject) : subject;
        if (isDedicatedMetaCol(cleanSub)) continue;

        const ex = DB.marks.find(m => 
          (m.std ? m.std.toString() === rowStd.toString() : true) &&
          (m.roll === targetRoll || (grNo && m.grNo && String(m.grNo).trim() === String(grNo).trim())) && 
          (m.subject === cleanSub || (typeof cleanSubjectName === 'function' && cleanSubjectName(m.subject) === cleanSub)) && 
          (m.date === date || m.topic === topic)
        );

        if (ex) {
          ex.subject = cleanSub;
          ex.date = date;
          ex.marks = marks;
          ex.total = total;
          ex.isAbsent = isAb;
          ex.std = rowStd.toString();
          ex.source = 'excel';
          if (grNo) ex.grNo = grNo;
          updatedCount++;
        } else {
          DB.marks.push({
            id: Date.now() + Math.floor(Math.random() * 100000),
            grNo: grNo,
            roll: targetRoll,
            std: rowStd.toString(),
            subject: cleanSub,
            topic: topic,
            marks: marks,
            total: total,
            date: date,
            isAbsent: isAb,
            source: 'excel',
            importedAt: new Date().toISOString()
          });
          addedCount++;
        }
      }
    }
  }

  // Safety purge: Ensure no marks with corrupted metadata names remain in database
  if (Array.isArray(DB.marks)) {
    DB.marks = DB.marks.filter(m => m && m.subject && !isDedicatedMetaCol(m.subject));
  }

  if (typeof healStudentRollsAndMarks === 'function') {
    healStudentRollsAndMarks();
  }

  saveDatabase();
  if (window.showToast) {
    if (addedCount === 0 && updatedCount === 0) {
      window.showToast(`Excel read for Class ${defaultStd}, but 0 marks were found in score columns. If this is a downloaded template, please fill in student scores first.`, 'warning');
    } else {
      window.showToast(`Report Card Excel processed for Class ${defaultStd}: ${addedCount} added, ${updatedCount} updated!`, 'success');
    }
  }
  if (window.populateDashFilters) window.populateDashFilters();
  if (window.updateDashboard) window.updateDashboard();
  if (window.renderMarksTable) window.renderMarksTable();
  if (window.renderStudentsTable) window.renderStudentsTable();
  return { addedCount, updatedCount };
}

function ensureStudentRecord(roll, grNo, name, std) {
  if (!roll && !name) return;
  const assignedClasses = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : [];
  let targetStd = (std || (assignedClasses.length > 0 ? assignedClasses[0] : '9')).toString();
  if (assignedClasses.length > 0 && !assignedClasses.includes(targetStd)) {
    targetStd = assignedClasses[0].toString();
  }

  
  let existing = null;
  // First match by GR Number (globally unique)
  if (grNo) {
    existing = DB.students.find(s => s.grNo && s.grNo.toString().trim().toLowerCase() === grNo.toString().trim().toLowerCase());
  }
  // Next fallback to (std, name) - match before roll, because old roll might have been set to GR number
  if (!existing && name) {
    existing = DB.students.find(s => s.std.toString() === targetStd && s.name.toLowerCase() === name.toLowerCase());
  }
  // Next match by (std, roll) - roll is unique strictly within its class
  if (!existing && roll) {
    existing = DB.students.find(s => s.std.toString() === targetStd && s.roll === parseInt(roll));
  }

  if (!existing) {
    const classRolls = DB.students.filter(s => s.std.toString() === targetStd).map(s => s.roll);
    const newRoll = roll ? parseInt(roll) : (classRolls.length > 0 ? Math.max(...classRolls) + 1 : 1);
    DB.students.push({
      roll: newRoll,
      grNo: grNo || `GR-${new Date().getFullYear()}-${targetStd}-${String(newRoll).padStart(3, '0')}`,
      name: name || `Student ${newRoll}`,
      std: targetStd,
      section: 'A',
      mobile: ''
    });
  } else {
    // Sync roll if a valid roll number was provided in this upload
    if (roll && (!existing.roll || existing.roll === parseInt(existing.grNo) || existing.roll !== parseInt(roll))) {
      existing.roll = parseInt(roll);
    }
    if (grNo && (!existing.grNo || existing.grNo === String(existing.roll))) existing.grNo = grNo;
    if (targetStd && !existing.std) existing.std = targetStd;
    if (name && (!existing.name || existing.name.startsWith('Student '))) existing.name = name;
  }
}

function getRollByName(name, std = null) {
  if (!name) return 0;
  if (std !== null && std !== undefined && std !== 'all') {
    const sMatch = DB.students.find(x => x.std.toString() === std.toString() && x.name.toLowerCase() === name.toLowerCase());
    if (sMatch) return sMatch.roll;
  }
  const s = DB.students.find(x => x.name.toLowerCase() === name.toLowerCase());
  return s ? s.roll : 0;
}

// Global symbols
window.initTestsModule = initTestsModule;
window.renderUpcomingTests = renderUpcomingTests;
window.filterUpcomingTests = filterUpcomingTests;
window.openNewTestModal = openNewTestModal;
window.closeNewTestModal = closeNewTestModal;
window.saveNewUpcomingTest = saveNewUpcomingTest;
window.deleteUpcomingTest = deleteUpcomingTest;
window.loadMassEntryList = loadMassEntryList;
window.saveMassEntry = saveMassEntry;
window.prepareTestMarksEntry = prepareTestMarksEntry;
window.populateTestEntryDropdowns = populateTestEntryDropdowns;

// Excel System 1 & 2 exports
window.downloadFormatExcel = downloadFormatExcel;
window.downloadClassMarksTemplate = downloadClassMarksTemplate;
window.handleExcelUpload = handleExcelUpload;
window.handleReportCardExcelUpload = handleExcelUpload;
window.downloadStudentTallyExcel = downloadStudentTallyExcel;
window.exportCurrentStudentTally = exportCurrentStudentTally;
window.downloadGujaratiTallyTemplate = downloadGujaratiTallyTemplate;
window.downloadGujaratiMarksTemplate = downloadGujaratiMarksTemplate;
window.handleStudentTallyUpload = handleStudentTallyUpload;
window.processParsedStudentTallyRows = processParsedStudentTallyRows;
window.parseSubjectHeader = parseSubjectHeader;
window.processParsedExcelMarks = processParsedExcelMarks;
window.ensureStudentRecord = ensureStudentRecord;
window.getRollByName = getRollByName;

