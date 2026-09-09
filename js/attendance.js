/**
 * Glorious Public School Student Tracker - Attendance Module
 * Supports class-wise & section-wise daily attendance marking,
 * bulk toggle, monthly statistics, WhatsApp notifications, and Excel export.
 */

let currentAttendanceDate = new Date().toISOString().split('T')[0];
let currentAttendanceClass = '9';
let currentAttendanceSection = 'A';
let currentAttendanceState = {}; // { roll: 'P' | 'A' | 'L' }

function initAttendanceModule() {
  const dateInput = document.getElementById('att-date');
  if (dateInput) {
    dateInput.value = currentAttendanceDate;
    dateInput.onchange = (e) => {
      currentAttendanceDate = e.target.value;
      loadAttendanceForClass();
    };
  }

  populateAttendanceClassDropdown();
  loadAttendanceForClass();
}

function populateAttendanceClassDropdown() {
  const classSelect = document.getElementById('att-class-select');
  const sectionSelect = document.getElementById('att-section-select');
  if (!classSelect) return;

  // If teacher logged in, show their classrooms, else show all available
  let classes = [];
  if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
    classes = DB.activeSession.teacher.classrooms.map(c => c.classNumber);
  } else {
    classes = [...new Set(DB.students.map(s => s.std))].filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b));
  }

  if (classes.length === 0) classes = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  classSelect.innerHTML = classes.map(c => `<option value="${c}">Class ${c}</option>`).join('');
  if (classes.includes(currentAttendanceClass)) {
    classSelect.value = currentAttendanceClass;
  } else if (classes.length > 0) {
    currentAttendanceClass = classes[0];
    classSelect.value = currentAttendanceClass;
  }

  classSelect.onchange = (e) => {
    currentAttendanceClass = e.target.value;
    updateAttendanceSections();
    loadAttendanceForClass();
  };

  updateAttendanceSections();
}

function updateAttendanceSections() {
  const sectionSelect = document.getElementById('att-section-select');
  if (!sectionSelect) return;

  let sections = [];
  if (DB.activeSession && DB.activeSession.role === 'teacher' && DB.activeSession.teacher) {
    const cls = DB.activeSession.teacher.classrooms.find(c => c.classNumber == currentAttendanceClass);
    if (cls && cls.sections) sections = cls.sections;
  }

  if (sections.length === 0) {
    // Check students in that class
    sections = [...new Set(DB.students.filter(s => s.std == currentAttendanceClass).map(s => s.section))].filter(Boolean);
  }

  if (sections.length === 0) sections = ['A', 'B'];

  sectionSelect.innerHTML = sections.map(s => `<option value="${s}">Section ${s}</option>`).join('');
  if (sections.includes(currentAttendanceSection)) {
    sectionSelect.value = currentAttendanceSection;
  } else {
    currentAttendanceSection = sections[0];
    sectionSelect.value = currentAttendanceSection;
  }

  sectionSelect.onchange = (e) => {
    currentAttendanceSection = e.target.value;
    loadAttendanceForClass();
  };
}

function loadAttendanceForClass() {
  const tableBody = document.getElementById('attendance-table-body');
  if (!tableBody) return;

  // Filter students for current class & section
  const classStudents = DB.students
    .filter(s => s.std == currentAttendanceClass && (!s.section || s.section === currentAttendanceSection))
    .sort((a, b) => a.roll - b.roll);

  // Check if attendance already recorded for this date, class, section
  const record = DB.attendance.find(a => 
    a.date === currentAttendanceDate && 
    a.std == currentAttendanceClass && 
    (!a.section || a.section === currentAttendanceSection)
  );

  currentAttendanceState = {};
  if (record && record.records) {
    record.records.forEach(r => {
      currentAttendanceState[r.roll] = r.status;
    });
  }

  // Default missing students to 'P'
  classStudents.forEach(s => {
    if (!currentAttendanceState[s.roll]) {
      currentAttendanceState[s.roll] = 'P';
    }
  });

  if (classStudents.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-12 text-slate-400 font-medium">
          <i class="fa-solid fa-user-xmark text-4xl mb-3 block text-slate-300"></i>
          No students enrolled in Class ${currentAttendanceClass} - Section ${currentAttendanceSection}.
        </td>
      </tr>
    `;
    updateAttendanceStats(0, 0, 0, 0);
    return;
  }

  renderAttendanceRows(classStudents);
  recalculateAttendanceStats(classStudents);
}

function renderAttendanceRows(students) {
  const tableBody = document.getElementById('attendance-table-body');
  tableBody.innerHTML = students.map((s, idx) => {
    const status = currentAttendanceState[s.roll] || 'P';
    return `
      <tr class="table-row-dynamic border-b border-slate-100/70 transition-all">
        <td class="py-4 px-4 font-mono font-bold text-indigo-500">${s.roll}</td>
        <td class="py-4 px-4 font-bold text-slate-500 text-xs">${s.grNo || 'N/A'}</td>
        <td class="py-4 px-4 font-black text-slate-800">${s.name}</td>
        <td class="py-4 px-4 text-xs font-semibold text-slate-500">
          ${s.mobile ? `<i class="fa-brands fa-whatsapp text-emerald-500 mr-1"></i>${s.mobile}` : '<span class="opacity-50 italic">None</span>'}
        </td>
        <td class="py-4 px-4 text-right">
          <div class="inline-flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 shadow-inner">
            <button onclick="setStudentAttendance(${s.roll}, 'P')" 
              class="att-btn att-btn-p ${status === 'P' ? 'active' : ''}" title="Present">P</button>
            <button onclick="setStudentAttendance(${s.roll}, 'A')" 
              class="att-btn att-btn-a ${status === 'A' ? 'active' : ''}" title="Absent">A</button>
            <button onclick="setStudentAttendance(${s.roll}, 'L')" 
              class="att-btn att-btn-l ${status === 'L' ? 'active' : ''}" title="Leave">L</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setStudentAttendance(roll, status) {
  currentAttendanceState[roll] = status;
  const classStudents = DB.students
    .filter(s => s.std == currentAttendanceClass && (!s.section || s.section === currentAttendanceSection));
  renderAttendanceRows(classStudents);
  recalculateAttendanceStats(classStudents);
}

function markAllAttendance(status) {
  const classStudents = DB.students
    .filter(s => s.std == currentAttendanceClass && (!s.section || s.section === currentAttendanceSection));
  classStudents.forEach(s => {
    currentAttendanceState[s.roll] = status;
  });
  renderAttendanceRows(classStudents);
  recalculateAttendanceStats(classStudents);
  if (window.showToast) window.showToast(`Marked all as ${status === 'P' ? 'Present' : (status === 'A' ? 'Absent' : 'Leave')}`);
}

function recalculateAttendanceStats(students) {
  let p = 0, a = 0, l = 0;
  students.forEach(s => {
    const st = currentAttendanceState[s.roll] || 'P';
    if (st === 'P') p++;
    else if (st === 'A') a++;
    else if (st === 'L') l++;
  });
  updateAttendanceStats(students.length, p, a, l);
}

function updateAttendanceStats(total, present, absent, leave) {
  const totalEl = document.getElementById('att-stat-total');
  const presentEl = document.getElementById('att-stat-present');
  const absentEl = document.getElementById('att-stat-absent');
  const pctEl = document.getElementById('att-stat-pct');

  if (totalEl) totalEl.innerText = total;
  if (presentEl) presentEl.innerText = `${present} (${total > 0 ? ((present / total) * 100).toFixed(0) : 0}%)`;
  if (absentEl) absentEl.innerText = `${absent} / ${leave} Leave`;
  if (pctEl) pctEl.innerText = total > 0 ? `${((present / total) * 100).toFixed(1)}%` : '0%';
}

function saveAttendance() {
  const classStudents = DB.students
    .filter(s => s.std == currentAttendanceClass && (!s.section || s.section === currentAttendanceSection));
  
  if (classStudents.length === 0) {
    if (window.showToast) window.showToast('No students to save attendance for.', 'warning');
    return;
  }

  const records = classStudents.map(s => ({
    roll: s.roll,
    status: currentAttendanceState[s.roll] || 'P'
  }));

  // Upsert attendance record
  const existingIndex = DB.attendance.findIndex(a => 
    a.date === currentAttendanceDate && 
    a.std == currentAttendanceClass && 
    (!a.section || a.section === currentAttendanceSection)
  );

  if (existingIndex >= 0) {
    DB.attendance[existingIndex].records = records;
  } else {
    DB.attendance.push({
      date: currentAttendanceDate,
      std: currentAttendanceClass,
      section: currentAttendanceSection,
      records: records
    });
  }

  saveDatabase();
  if (window.showToast) window.showToast(`Attendance saved for Class ${currentAttendanceClass}-${currentAttendanceSection}!`, 'success');
}

// Export Attendance Sheet to Excel (.xlsx)
function exportAttendanceExcel() {
  if (typeof XLSX === 'undefined') {
    if (window.showToast) window.showToast('Excel library not loaded', 'error');
    return;
  }

  const classStudents = DB.students
    .filter(s => s.std == currentAttendanceClass && (!s.section || s.section === currentAttendanceSection))
    .sort((a, b) => a.roll - b.roll);

  if (classStudents.length === 0) {
    if (window.showToast) window.showToast('No students to export', 'warning');
    return;
  }

  const rows = [];
  rows.push(['GLORIOUS PUBLIC SCHOOL - ATTENDANCE REGISTER']);
  rows.push([`Class: ${currentAttendanceClass}`, `Section: ${currentAttendanceSection}`, `Date: ${currentAttendanceDate}`]);
  rows.push([]);
  rows.push(['Roll No', 'GR No', 'Student Name', 'Status (P/A/L)', 'Contact Number']);

  classStudents.forEach(s => {
    const st = currentAttendanceState[s.roll] || 'P';
    const statusText = st === 'P' ? 'Present' : (st === 'A' ? 'Absent' : 'Leave');
    rows.push([s.roll, s.grNo || 'N/A', s.name, statusText, s.mobile || '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 28 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentAttendanceClass}_${currentAttendanceSection}`);
  XLSX.writeFile(wb, `GPS_Attendance_Class_${currentAttendanceClass}${currentAttendanceSection}_${currentAttendanceDate}.xlsx`);
  if (window.showToast) window.showToast('Attendance exported to Excel!', 'success');
}

// WhatsApp notification for absentees
function notifyAbsenteesWhatsApp() {
  const classStudents = DB.students
    .filter(s => s.std == currentAttendanceClass && (!s.section || s.section === currentAttendanceSection));
  
  const absentees = classStudents.filter(s => currentAttendanceState[s.roll] === 'A');

  if (absentees.length === 0) {
    if (window.showToast) window.showToast('No absent students for today!', 'info');
    return;
  }

  // Open modal / queue for absentees
  const queueList = absentees.map(s => {
    const mob = formatPhoneForWA(s.mobile);
    const msg = `Dear Parent, your ward *${s.name}* (Roll: ${s.roll}, Class ${currentAttendanceClass}-${currentAttendanceSection}) was marked *ABSENT* on ${currentAttendanceDate} at Glorious Public School. Please report or contact school if this is unexpected.`;
    return {
      name: s.name,
      roll: s.roll,
      mobile: mob,
      message: msg
    };
  });

  if (window.switchTab) window.switchTab('communications');
  if (window.loadCustomWhatsAppQueue) {
    window.loadCustomWhatsAppQueue(queueList, 'Absentee Alerts');
  } else {
    const first = queueList[0];
    if (first.mobile) {
      window.open(`https://wa.me/${first.mobile}?text=${encodeURIComponent(first.message)}`, '_blank');
    }
  }
  if (window.showToast) window.showToast(`Loaded ${queueList.length} absentee alerts into WhatsApp Dispatcher!`, 'success');
}

// Global symbols
window.initAttendanceModule = initAttendanceModule;
window.populateAttendanceClassDropdown = populateAttendanceClassDropdown;
window.loadAttendanceForClass = loadAttendanceForClass;
window.setStudentAttendance = setStudentAttendance;
window.markAllAttendance = markAllAttendance;
window.saveAttendance = saveAttendance;
window.exportAttendanceExcel = exportAttendanceExcel;
window.notifyAbsenteesWhatsApp = notifyAbsenteesWhatsApp;
