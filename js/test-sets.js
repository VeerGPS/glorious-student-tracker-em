/**
 * Glorious Public School Student Tracker (EM) - Test Sets Management Layer
 * Handles creation, renaming, deletion, listing, and inspection of Assessment / Test Sets.
 */

let currentRenamingSet = null;

// Synchronize all sets between DB.testSets and DB.marks tags
function syncTestSetsRegistry() {
  if (!DB.testSets) DB.testSets = [];
  
  // Find any test sets tagged in DB.marks that aren't yet in DB.testSets
  (DB.marks || []).forEach(m => {
    const sName = (m.testSet || m.exam || '').trim();
    if (sName && sName !== 'Unit Assessment') {
      const std = m.std || '9';
      const exists = DB.testSets.some(s => s.name.toLowerCase() === sName.toLowerCase() && String(s.std) === String(std));
      if (!exists) {
        DB.testSets.push({
          id: 'set_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          name: sName,
          std: std,
          date: m.date || new Date().toISOString().split('T')[0],
          count: 1
        });
      }
    }
  });
}

function renderTestSetsManager() {
  syncTestSetsRegistry();

  const container = document.getElementById('test-sets-grid');
  const emptyState = document.getElementById('test-sets-empty-state');
  const filterStdEl = document.getElementById('manage-sets-filter-std');
  const searchInput = document.getElementById('manage-sets-search');

  // Populate Standard filter dropdown with teacher's assigned classes
  if (filterStdEl && filterStdEl.options.length <= 1) {
    const assigned = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];
    const currentVal = filterStdEl.value || 'all';
    filterStdEl.innerHTML = '<option value="all">All Standards / Classes</option>';
    assigned.forEach(c => {
      filterStdEl.innerHTML += `<option value="${c}" ${c === currentVal ? 'selected' : ''}>Class ${c}</option>`;
    });
  }

  const filterStd = filterStdEl ? filterStdEl.value : 'all';
  const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();

  // Filter test sets
  let sets = (DB.testSets || []).filter(s => {
    if (filterStd !== 'all' && String(s.std) !== String(filterStd)) return false;
    if (searchTerm) {
      const matchName = (s.name || '').toLowerCase().includes(searchTerm);
      const matchStd = String(s.std || '').includes(searchTerm);
      return matchName || matchStd;
    }
    return true;
  });

  // Sort by date descending
  sets.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Compute stats across current filtered scope
  const totalSets = sets.length;
  let totalMarks = 0;
  const subjectsSet = new Set();
  const studentsSet = new Set();

  sets.forEach(s => {
    const marksForSet = (DB.marks || []).filter(m => 
      (m.testSet === s.name || m.exam === s.name) && 
      (filterStd === 'all' || String(m.std) === String(s.std))
    );
    totalMarks += marksForSet.length;
    marksForSet.forEach(m => {
      if (m.subject) subjectsSet.add(m.subject);
      if (m.roll) studentsSet.add(`${m.std}_${m.roll}`);
    });
  });

  // Update stat badges
  const statSetsEl = document.getElementById('sets-stat-total');
  const statMarksEl = document.getElementById('sets-stat-marks');
  const statSubjsEl = document.getElementById('sets-stat-subjects');
  const statStusEl = document.getElementById('sets-stat-students');

  if (statSetsEl) statSetsEl.innerText = totalSets;
  if (statMarksEl) statMarksEl.innerText = totalMarks;
  if (statSubjsEl) statSubjsEl.innerText = subjectsSet.size;
  if (statStusEl) statStusEl.innerText = studentsSet.size;

  // Update nav badge count
  const navBadge = document.getElementById('nav-badge-sets');
  if (navBadge) {
    if (totalSets > 0) {
      navBadge.innerText = totalSets;
      navBadge.classList.remove('hidden');
    } else {
      navBadge.classList.add('hidden');
    }
  }

  if (!container) return;

  if (sets.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  let cardsHtml = '';
  sets.forEach(s => {
    const setMarks = (DB.marks || []).filter(m => 
      (m.testSet === s.name || m.exam === s.name) && 
      (!s.std || String(m.std) === String(s.std))
    );
    const stuCount = new Set(setMarks.map(m => m.roll)).size;
    const subjects = [...new Set(setMarks.map(m => typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject))].filter(Boolean);

    // Compute average percentage for this set
    let totalMax = 0;
    let totalObt = 0;
    setMarks.forEach(m => {
      if (!m.isAbsent) {
        totalMax += (parseFloat(m.total) || 0);
        totalObt += (parseFloat(m.marks) || 0);
      }
    });
    const avgPct = totalMax > 0 ? ((totalObt / totalMax) * 100).toFixed(1) : null;
    const dateFormatted = typeof formatDateSlash === 'function' ? formatDateSlash(s.date) : s.date;

    cardsHtml += `
      <div class="glass-card rounded-3xl p-6 border border-slate-200/80 hover:border-violet-300 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
        <div>
          <!-- Card Header: Title & Badges -->
          <div class="flex items-start justify-between gap-3 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-500 to-indigo-600 text-white flex items-center justify-center text-xl shadow-md shadow-violet-500/20 group-hover:scale-105 transition-transform shrink-0">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <div>
                <h3 class="text-lg font-black text-slate-900 group-hover:text-violet-700 transition-colors leading-tight">${s.name}</h3>
                <div class="flex items-center gap-2 mt-1">
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-violet-100 text-violet-800 border border-violet-200">
                    Class ${s.std || 'General'}
                  </span>
                  <span class="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                    <i class="fa-regular fa-calendar text-[10px]"></i> ${dateFormatted || 'Recently Added'}
                  </span>
                </div>
              </div>
            </div>
            
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="openRenameTestSetModal('${encodeURIComponent(s.name)}', '${encodeURIComponent(s.std || '')}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-violet-100 text-slate-600 hover:text-violet-700 flex items-center justify-center transition-all cursor-pointer" title="Rename Set">
                <i class="fa-solid fa-pen-to-square text-xs"></i>
              </button>
              <button onclick="openDeleteTestSetModal('${encodeURIComponent(s.name)}', '${encodeURIComponent(s.std || '')}', '${s.id || ''}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 flex items-center justify-center transition-all cursor-pointer" title="Delete Set">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </div>
          </div>

          <!-- Quick Metrics Grid -->
          <div class="grid grid-cols-3 gap-2 p-3 bg-slate-50/80 rounded-2xl border border-slate-100 mb-4 text-center">
            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Students</span>
              <span class="text-sm font-black text-slate-800">${stuCount}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Marks Rows</span>
              <span class="text-sm font-black text-slate-800">${setMarks.length}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Batch Avg</span>
              <span class="text-sm font-black ${avgPct ? (avgPct >= 60 ? 'text-emerald-600' : (avgPct >= 33 ? 'text-amber-600' : 'text-rose-600')) : 'text-slate-400'}">${avgPct ? avgPct + '%' : 'N/A'}</span>
            </div>
          </div>

          <!-- Included Subjects -->
          <div class="mb-5">
            <span class="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">Subjects Covered</span>
            <div class="flex flex-wrap gap-1.5">
              ${subjects.length > 0 ? subjects.map(sub => `
                <span class="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold">
                  ${sub}
                </span>
              `).join('') : '<span class="text-[11px] text-slate-400 italic">No mark records linked yet</span>'}
            </div>
          </div>
        </div>

        <!-- Card Action Buttons -->
        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <button onclick="viewSetInRecords('${s.name.replace(/'/g, "\\'")}', '${s.std || ''}')" class="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-black transition-all flex items-center justify-center gap-1.5 border border-slate-200/60 cursor-pointer">
            <i class="fa-solid fa-list-check text-xs text-indigo-600"></i> Records
          </button>
          <button onclick="viewSetInReports('${s.name.replace(/'/g, "\\'")}', '${s.std || ''}')" class="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/20 cursor-pointer">
            <i class="fa-solid fa-file-invoice text-xs"></i> Report Cards
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = cardsHtml;
}

// -------------------------------------------------------------
// CREATE NEW TEST SET MODAL
// -------------------------------------------------------------

function openCreateTestSetModal() {
  const modal = document.getElementById('create-test-set-modal');
  const stdSel = document.getElementById('new-set-std-select');
  const nameInput = document.getElementById('new-set-name-input');
  const dateInput = document.getElementById('new-set-date-input');

  if (stdSel) {
    const assigned = (typeof getTeacherAssignedClasses === 'function') ? getTeacherAssignedClasses() : ['8', '9', '10'];
    stdSel.innerHTML = '';
    assigned.forEach(c => {
      stdSel.innerHTML += `<option value="${c}">Class ${c}</option>`;
    });
  }

  if (nameInput) nameInput.value = '';
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 100);
  }
}

function closeCreateTestSetModal() {
  const modal = document.getElementById('create-test-set-modal');
  if (modal) modal.classList.add('hidden');
}

function applySetPresetName(name) {
  const input = document.getElementById('new-set-name-input');
  if (input) {
    input.value = name;
    input.focus();
  }
}

function saveNewTestSet(e) {
  if (e && e.preventDefault) e.preventDefault();

  const nameInput = document.getElementById('new-set-name-input');
  const stdSel = document.getElementById('new-set-std-select');
  const dateInput = document.getElementById('new-set-date-input');

  const setName = nameInput ? nameInput.value.trim() : '';
  const setStd = stdSel ? stdSel.value.trim() : '9';
  const setDate = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().split('T')[0];

  if (!setName) {
    if (window.showToast) window.showToast('Please enter a name for the test set.', 'warning');
    return;
  }

  DB.testSets = DB.testSets || [];
  const exists = DB.testSets.some(s => s.name.toLowerCase() === setName.toLowerCase() && String(s.std) === String(setStd));
  if (exists) {
    if (window.showToast) window.showToast(`Test Set "${setName}" for Class ${setStd} already exists!`, 'warning');
    return;
  }

  const newSet = {
    id: 'set_' + Date.now(),
    name: setName,
    std: setStd,
    date: setDate,
    count: 0
  };

  DB.testSets.push(newSet);
  saveDatabase();

  const activeTId = (typeof getActiveTeacherId === 'function') ? getActiveTeacherId() : null;
  if (activeTId && typeof saveTeacherData === 'function') {
    saveTeacherData(activeTId);
  }

  closeCreateTestSetModal();
  renderTestSetsManager();
  if (typeof renderTestSetsPillBar === 'function') {
    renderTestSetsPillBar(setName);
  }

  if (window.showToast) {
    window.showToast(`Test Set "${setName}" created successfully for Class ${setStd}!`, 'success');
  }
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// RENAME TEST SET MODAL
// -------------------------------------------------------------

function openRenameTestSetModal(setNameRaw, stdRaw = '') {
  let setName = setNameRaw;
  try { setName = decodeURIComponent(setNameRaw); } catch (e) {}
  let std = stdRaw;
  try { std = decodeURIComponent(stdRaw || ''); } catch (e) {}

  currentRenamingSet = { oldName: setName, std: std };
  const modal = document.getElementById('rename-test-set-modal');
  const currentLabel = document.getElementById('rename-set-current-label');
  const input = document.getElementById('rename-set-new-input');

  if (currentLabel) {
    currentLabel.innerText = `Current Name: "${setName}" (Class ${std || 'All'})`;
  }
  if (input) {
    input.value = setName;
    setTimeout(() => input.focus(), 100);
  }
  if (modal) modal.classList.remove('hidden');
}

function closeRenameTestSetModal() {
  const modal = document.getElementById('rename-test-set-modal');
  if (modal) modal.classList.add('hidden');
  currentRenamingSet = null;
}

function saveRenameTestSet(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!currentRenamingSet) return;

  const input = document.getElementById('rename-set-new-input');
  const newName = input ? input.value.trim() : '';

  if (!newName) {
    if (window.showToast) window.showToast('Please enter a new name for the test set.', 'warning');
    return;
  }

  const { oldName, std } = currentRenamingSet;
  if (oldName.toLowerCase() === newName.toLowerCase()) {
    closeRenameTestSetModal();
    return;
  }

  // Update in DB.testSets
  let updatedInSets = 0;
  (DB.testSets || []).forEach(s => {
    if (s.name.toLowerCase() === oldName.toLowerCase() && (!std || String(s.std) === String(std))) {
      s.name = newName;
      updatedInSets++;
    }
  });

  // Update in DB.marks
  let updatedMarks = 0;
  (DB.marks || []).forEach(m => {
    if ((m.testSet === oldName || m.exam === oldName) && (!std || String(m.std) === String(std))) {
      m.testSet = newName;
      m.exam = newName;
      if (m.topic === oldName) m.topic = newName;
      updatedMarks++;
    }
  });

  saveDatabase();

  const activeTId = (typeof getActiveTeacherId === 'function') ? getActiveTeacherId() : null;
  if (activeTId && typeof saveTeacherData === 'function') {
    saveTeacherData(activeTId);
  }
  if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
    CloudDB.syncToCloud();
  }

  closeRenameTestSetModal();
  renderTestSetsManager();
  if (typeof renderTestSetsPillBar === 'function') {
    renderTestSetsPillBar(newName);
  }
  if (typeof renderRecordsTable === 'function') {
    renderRecordsTable();
  }

  if (window.showToast) {
    window.showToast(`Test Set renamed to "${newName}". Updated ${updatedMarks} linked mark records!`, 'success');
  }
}

// -------------------------------------------------------------
// DELETE TEST SET MODAL & ROBUST EXECUTION
// -------------------------------------------------------------

let pendingDeleteSet = null;

function openDeleteTestSetModal(setNameRaw, stdRaw = '', setId = '') {
  let setName = setNameRaw;
  try { setName = decodeURIComponent(setNameRaw); } catch (e) {}
  let std = stdRaw;
  try { std = decodeURIComponent(stdRaw || ''); } catch (e) {}

  const markCount = (DB.marks || []).filter(m => 
    (m.testSet === setName || m.exam === setName) && (!std || String(m.std) === String(std))
  ).length;

  pendingDeleteSet = { name: setName, std: std, setId: setId, markCount: markCount };

  const modal = document.getElementById('delete-test-set-modal');
  const badge = document.getElementById('delete-set-name-badge');
  const info = document.getElementById('delete-set-info-text');
  const tagOnlyBtn = document.getElementById('delete-set-btn-tag-only');
  const deleteBtn = document.getElementById('delete-set-btn-all');

  if (badge) badge.innerText = `Set: "${setName}" (${std ? `Class ${std}` : 'All Classes'})`;
  if (info) {
    if (markCount > 0) {
      info.innerText = `This test set currently contains ${markCount} student mark record${markCount > 1 ? 's' : ''}. Choose how you would like to proceed:`;
      if (tagOnlyBtn) tagOnlyBtn.classList.remove('hidden');
      if (deleteBtn) deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can mr-1"></i> Delete Set & All ${markCount} Marks`;
    } else {
      info.innerText = `This test set has no mark records linked.`;
      if (tagOnlyBtn) tagOnlyBtn.classList.add('hidden');
      if (deleteBtn) deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can mr-1"></i> Delete Empty Set`;
    }
  }

  if (modal) modal.classList.remove('hidden');
}

function closeDeleteTestSetModal() {
  const modal = document.getElementById('delete-test-set-modal');
  if (modal) modal.classList.add('hidden');
  pendingDeleteSet = null;
}

function executeDeleteTestSet(deleteMarksToo = true) {
  if (!pendingDeleteSet) return;
  const { name, std, setId, markCount } = pendingDeleteSet;

  // 1. Remove from DB.testSets
  DB.testSets = (DB.testSets || []).filter(s => {
    if (setId && s.id === setId) return false;
    if (s.name.toLowerCase() === name.toLowerCase() && (!std || String(s.std) === String(std))) return false;
    return true;
  });

  // 2. Remove or Untag marks
  if (deleteMarksToo) {
    // Permanently remove all marks records for this test set
    DB.marks = (DB.marks || []).filter(m => 
      !((m.testSet === name || m.exam === name) && (!std || String(m.std) === String(std)))
    );
  } else {
    // Untag marks: MUST reset both testSet AND exam to avoid syncTestSetsRegistry reviving the set
    (DB.marks || []).forEach(m => {
      if ((m.testSet === name || m.exam === name) && (!std || String(m.std) === String(std))) {
        m.testSet = '';
        m.exam = 'Unit Assessment';
        if (m.topic === name) m.topic = 'Assessment';
      }
    });
  }

  // 3. Reset active set if currently active in reports
  if (typeof currentActiveTestSet !== 'undefined' && currentActiveTestSet === name) {
    currentActiveTestSet = 'all';
  }

  // 4. Save to database & cloud
  saveDatabase();

  const activeTId = (typeof getActiveTeacherId === 'function') ? getActiveTeacherId() : null;
  if (activeTId && typeof saveTeacherData === 'function') {
    saveTeacherData(activeTId);
  }
  if (typeof CloudDB !== 'undefined' && typeof CloudDB.syncToCloud === 'function') {
    CloudDB.syncToCloud();
  }

  // 5. Close modal
  closeDeleteTestSetModal();

  // 6. Refresh all UI views
  renderTestSetsManager();
  if (typeof renderTestSetsPillBar === 'function') {
    renderTestSetsPillBar('all');
  }
  if (typeof populateReportsFilters === 'function') {
    populateReportsFilters('all');
  }
  if (typeof renderRecordsTable === 'function') {
    renderRecordsTable();
  }
  if (typeof updateDashboard === 'function') {
    updateDashboard();
  }
  if (typeof updateStudentTallyBadges === 'function') {
    updateStudentTallyBadges();
  }

  if (window.showToast) {
    if (deleteMarksToo && markCount > 0) {
      window.showToast(`Test Set "${name}" and ${markCount} marks records permanently deleted.`, 'info');
    } else {
      window.showToast(`Test Set "${name}" deleted successfully.`, 'info');
    }
  }
}

// Backward-compatible alias for deleteTestSet
function deleteTestSet(setName, std, setId = '') {
  openDeleteTestSetModal(encodeURIComponent(setName), encodeURIComponent(std || ''), setId || '');
}

// -------------------------------------------------------------
// JUMP TO RECORDS / REPORTS WITH SET PRESELECTED
// -------------------------------------------------------------

function viewSetInRecords(setName, std) {
  if (typeof switchTab === 'function') {
    switchTab('records');
  }
  const topicFilter = document.getElementById('filter-topic');
  if (topicFilter) {
    topicFilter.value = setName;
  }
  const stdFilter = document.getElementById('filter-std');
  if (stdFilter && std) {
    stdFilter.value = std;
  }
  if (typeof renderRecordsTable === 'function') {
    renderRecordsTable();
  }
  if (window.showToast) {
    window.showToast(`Showing Database Records filtered by set: "${setName}"`, 'info');
  }
}

function viewSetInReports(setName, std) {
  if (typeof switchTab === 'function') {
    switchTab('communications');
  }
  if (typeof selectActiveTestSet === 'function') {
    selectActiveTestSet(setName);
  } else if (typeof renderTestSetsPillBar === 'function') {
    renderTestSetsPillBar(setName);
  }
  const repStd = document.getElementById('report-filter-std');
  if (repStd && std) {
    repStd.value = std;
    if (typeof populateReportsStudents === 'function') populateReportsStudents();
  }
}

// Window symbol exports
window.renderTestSetsManager = renderTestSetsManager;
window.openCreateTestSetModal = openCreateTestSetModal;
window.closeCreateTestSetModal = closeCreateTestSetModal;
window.applySetPresetName = applySetPresetName;
window.saveNewTestSet = saveNewTestSet;
window.openRenameTestSetModal = openRenameTestSetModal;
window.closeRenameTestSetModal = closeRenameTestSetModal;
window.saveRenameTestSet = saveRenameTestSet;
window.openDeleteTestSetModal = openDeleteTestSetModal;
window.closeDeleteTestSetModal = closeDeleteTestSetModal;
window.executeDeleteTestSet = executeDeleteTestSet;
window.deleteTestSet = deleteTestSet;
window.viewSetInRecords = viewSetInRecords;
window.viewSetInReports = viewSetInReports;
window.syncTestSetsRegistry = syncTestSetsRegistry;
