/**
 * Glorious Public School Student Tracker - Reports, PDF & Export Engine
 * Generates Official Board Marksheet PDFs with jsPDF,
 * Master student-wise Excel exports with SheetJS,
 * and handles WhatsApp broadcast queues and academic alerts.
 */

let waDispatchQueue = [];

// -------------------------------------------------------------
// PDF REPORT CARDS (OFFICIAL MULTICOLOR BOARD FORMAT)
// -------------------------------------------------------------

function addStudentScorecardToDoc(doc, roll, isFirstPage, passedMarks = null, examType = "FIRST TERM EXAMINATIONS", subjectFilter = "All", targetStd = null, targetSec = null) {
  if (roll === null || roll === undefined || roll === '') return;
  const numRoll = parseInt(roll);

  let student = null;
  if (typeof findStudentByRoll === 'function') {
    student = findStudentByRoll(roll, targetStd, targetSec);
  }
  if (!student && !isNaN(numRoll)) {
    student = DB.students.find(s => 
      parseInt(s.roll) === numRoll && 
      (targetStd ? String(s.std).trim() === String(targetStd).trim() : true) &&
      (targetSec ? String(s.section || 'A').trim().toUpperCase() === String(targetSec).trim().toUpperCase() : true)
    );
  }
  if (!student) {
    student = DB.students.find(s => 
      String(s.roll).trim() === String(roll).trim() && 
      (targetStd ? String(s.std).trim() === String(targetStd).trim() : true)
    );
  }
  if (!student && !isNaN(numRoll)) {
    student = DB.students.find(s => parseInt(s.roll) === numRoll);
  }
  if (!student) return;

  if (!isFirstPage) doc.addPage();

  const studentStd = student.std ? String(student.std).trim() : (targetStd ? String(targetStd).trim() : '');
  const studentSec = String(student.section || targetSec || 'A').trim().toUpperCase();

  const marks = passedMarks ? [...passedMarks].sort((a, b) => new Date(a.date) - new Date(b.date)) : 
    DB.marks.filter(m => 
      parseInt(m.roll) === numRoll && 
      (m.std ? String(m.std).trim() === studentStd : true) &&
      (!m.section || String(m.section).trim().toUpperCase() === studentSec)
    ).sort((a, b) => new Date(a.date) - new Date(b.date));

  const peerRolls = DB.students
    .filter(s => String(s.std).trim() === studentStd && String(s.section || 'A').trim().toUpperCase() === studentSec)
    .map(s => parseInt(s.roll));

  // High Quality Multi-border Frame
  doc.setLineWidth(1);
  doc.setDrawColor(220, 38, 38); // Crimson outer
  doc.rect(5, 5, 200, 287);

  doc.setLineWidth(0.5);
  doc.setDrawColor(37, 99, 235); // Royal blue middle
  doc.rect(7, 7, 196, 283);

  doc.setLineWidth(0.2);
  doc.setDrawColor(16, 185, 129); // Emerald inner
  doc.rect(9, 9, 192, 279);

  // Header Banner
  doc.setFillColor(30, 58, 138); // Indigo navy
  doc.rect(10, 10, 190, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(21);
  doc.setFont("helvetica", "bold");
  doc.text("GLORIOUS PUBLIC SCHOOL", 105, 20, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Affiliated to State Board | Himatnagar, Gujarat - 383001 | Contact: gloriouspschool2009@gmail.com", 105, 27, { align: "center" });

  // Sub-header Banner
  doc.setFillColor(220, 38, 38);
  doc.rect(10, 33, 190, 8, 'F');
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`STATEMENT OF MARKS - ${examType.toUpperCase()}`, 105, 38.5, { align: "center" });

  // Student Details Box
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.rect(15, 45, 180, 26);
  doc.line(15, 58, 195, 58);
  doc.line(105, 45, 105, 71);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("CANDIDATE'S NAME :", 18, 50);
  doc.text("ROLL NUMBER / GR NO :", 108, 50);
  doc.text("STANDARD / CLASS :", 18, 63);
  doc.text("DATE OF ISSUE :", 108, 63);

  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(student.name.toUpperCase(), 18, 55);
  doc.text(`${student.roll}  (GR: ${student.grNo || 'N/A'})`, 108, 55);
  doc.text(`CLASS ${student.std || 'N/A'} - SECTION ${student.section || 'A'}`, 18, 68);
  const issueDateStr = typeof formatDateSlash === 'function' ? formatDateSlash(new Date()) : (window.formatDateSlash ? window.formatDateSlash(new Date()) : new Date().toLocaleDateString('en-GB'));
  doc.text(issueDateStr, 108, 68);

  // Table Setup
  let y = 77;
  let tableStartY = y;

  doc.setFillColor(14, 165, 233); // Cyan blue header
  doc.rect(15, y, 180, 9.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text("DATE", 18, y + 6.5);
  doc.text("SUBJECT", 40, y + 6.5);
  doc.text("TOPIC / CHAPTER", 82, y + 6.5);
  doc.text("MAX", 137, y + 6.5);
  doc.text("OBT", 152, y + 6.5);
  doc.text("%", 168, y + 6.5);
  doc.text("RANK", 183, y + 6.5);

  y += 9.5;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");

  let totalMax = 0;
  let totalObt = 0;
  let failFlag = false;

  if (marks.length === 0) {
    doc.text("No assessments recorded for this student.", 105, y + 14, { align: "center" });
    y += 20;
  } else {
    marks.forEach((m, i) => {
      if (y > 235) {
        doc.setDrawColor(148, 163, 184);
        doc.rect(15, tableStartY, 180, y - tableStartY);
        [38, 80, 135, 150, 165, 180].forEach(lx => doc.line(lx, tableStartY, lx, y));

        doc.addPage();
        // Redraw frame
        doc.setLineWidth(1); doc.setDrawColor(220, 38, 38); doc.rect(5, 5, 200, 287);
        doc.setLineWidth(0.5); doc.setDrawColor(37, 99, 235); doc.rect(7, 7, 196, 283);
        doc.setLineWidth(0.2); doc.setDrawColor(16, 185, 129); doc.rect(9, 9, 192, 279);
        y = 20;
        tableStartY = y;

        doc.setFillColor(14, 165, 233);
        doc.rect(15, y, 180, 9.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9.5);
        doc.text("DATE", 18, y + 6.5);
        doc.text("SUBJECT", 40, y + 6.5);
        doc.text("TOPIC / CHAPTER", 82, y + 6.5);
        doc.text("MAX", 137, y + 6.5);
        doc.text("OBT", 152, y + 6.5);
        doc.text("%", 168, y + 6.5);
        doc.text("RANK", 183, y + 6.5);
        y += 9.5;
        doc.setTextColor(15, 23, 42);
      }

      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, y, 180, 8, 'F');
      }

      const sMax = m.total || 50;
      const sObt = m.isAbsent ? 0 : m.marks;
      const passM = Math.ceil(sMax * 0.33);
      const pct = sMax > 0 ? (sObt / sMax) * 100 : 0;
      if (sObt < passM || m.isAbsent) failFlag = true;

      totalMax += sMax;
      totalObt += sObt;

      // Subject Peer Rank within their own classroom
      let sRank = "-";
      if (!m.isAbsent) {
        const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
        const subScores = DB.marks
          .filter(x => (x.std ? String(x.std).trim() === studentStd : true) && 
                       (!x.section || String(x.section).trim().toUpperCase() === studentSec) &&
                       peerRolls.includes(parseInt(x.roll)) && 
                       ((typeof cleanSubjectName === 'function' ? cleanSubjectName(x.subject) : x.subject) === cleanSub) && 
                       !x.isAbsent)
          .map(x => x.marks)
          .sort((a, b) => b - a);
        const rIdx = subScores.indexOf(m.marks);
        if (rIdx >= 0) sRank = (rIdx + 1).toString();
      }

      const rowDateStr = typeof formatDateSlash === 'function' ? formatDateSlash(m.date) : (window.formatDateSlash ? window.formatDateSlash(m.date) : (m.date || '-'));
      const displaySubject = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : (window.cleanSubjectName ? window.cleanSubjectName(m.subject) : (m.subject || ''));

      doc.setFontSize(8.5);
      doc.text(rowDateStr, 18, y + 5.5);
      doc.setFont("helvetica", "bold");
      doc.text(displaySubject, 40, y + 5.5);
      doc.setFont("helvetica", "normal");
      doc.text((m.topic || 'Assessment').substring(0, 24), 82, y + 5.5);
      doc.text(sMax.toString(), 141, y + 5.5, { align: "right" });

      if (m.isAbsent) {
        doc.setTextColor(220, 38, 38);
        doc.setFont("helvetica", "bold");
        doc.text("AB", 156, y + 5.5, { align: "right" });
        doc.text("-", 172, y + 5.5, { align: "right" });
        doc.text("AB", 188, y + 5.5, { align: "right" });
      } else {
        if (sObt < passM) doc.setTextColor(220, 38, 38);
        doc.text(sObt.toString(), 156, y + 5.5, { align: "right" });
        doc.text(`${pct.toFixed(0)}%`, 174, y + 5.5, { align: "right" });
        doc.text(sRank, 188, y + 5.5, { align: "right" });
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "normal");
      y += 8;
    });

    // Close Table Grid Box
    doc.setDrawColor(148, 163, 184);
    doc.rect(15, tableStartY, 180, y - tableStartY);
    [38, 80, 135, 150, 165, 180].forEach(lx => doc.line(lx, tableStartY, lx, y));
  }

  // Grand Total & Summary Banner
  y += 5;
  const overallPct = totalMax > 0 ? (totalObt / totalMax) * 100 : 0;

  // Overall Class Rank
  const peerTotals = [];
  peerRolls.forEach(pr => {
    const pMks = DB.marks.filter(m => 
      (m.std ? String(m.std).trim() === studentStd : true) && 
      (!m.section || String(m.section).trim().toUpperCase() === studentSec) && 
      parseInt(m.roll) === pr && 
      !m.isAbsent
    );
    if (pMks.length > 0) {
      const pTotal = pMks.reduce((s, m) => s + (parseFloat(m.marks) || 0), 0);
      peerTotals.push({ roll: pr, total: pTotal });
    }
  });
  peerTotals.sort((a, b) => b.total - a.total);
  const oRankIdx = peerTotals.findIndex(pt => pt.roll === numRoll);
  const overallRank = oRankIdx >= 0 ? (oRankIdx + 1).toString() : "-";
  const rankDisplay = overallRank !== "-" ? `#${overallRank} of ${peerRolls.length}` : "-";

  doc.setFillColor(241, 245, 249);
  doc.rect(15, y, 180, 22, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(15, y, 180, 22);

  // Column Dividers
  doc.setDrawColor(226, 232, 240);
  doc.line(75, y + 3, 75, y + 19);
  doc.line(135, y + 3, 135, y + 19);

  // 3-Column Summary: Total Marks Obtained, Percentage, Classroom Rank
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("TOTAL MARKS OBTAINED", 20, y + 6.5);
  doc.text("PERCENTAGE", 80, y + 6.5);
  doc.text("CLASSROOM RANK", 140, y + 6.5);

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalObt} / ${totalMax}`, 20, y + 16);
  doc.text(`${overallPct.toFixed(1)}%`, 80, y + 16);
  doc.text(rankDisplay, 140, y + 16);

  y += 24;

  // --- Student-Wise Performance Bar Chart ---
  const subjectMap = {};
  marks.forEach(m => {
    const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
    if (!subjectMap[cleanSub]) {
      subjectMap[cleanSub] = { subject: cleanSub, obt: 0, max: 0, isAbsent: true };
    }
    const sMax = m.total || 50;
    const sObt = m.isAbsent ? 0 : (m.marks || 0);
    subjectMap[cleanSub].max += sMax;
    subjectMap[cleanSub].obt += sObt;
    if (!m.isAbsent) subjectMap[cleanSub].isAbsent = false;
  });
  const studentSubs = Object.values(subjectMap);

  if (studentSubs.length > 0) {
    if (y > 185) {
      doc.addPage();
      doc.setLineWidth(1); doc.setDrawColor(220, 38, 38); doc.rect(5, 5, 200, 287);
      doc.setLineWidth(0.5); doc.setDrawColor(37, 99, 235); doc.rect(7, 7, 196, 283);
      doc.setLineWidth(0.2); doc.setDrawColor(16, 185, 129); doc.rect(9, 9, 192, 279);
      y = 18;
    }

    const chartBoxY = y;
    const chartBoxH = 43;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    if (typeof doc.roundedRect === 'function') {
      doc.roundedRect(15, chartBoxY, 180, chartBoxH, 2, 2, 'FD');
    } else {
      doc.rect(15, chartBoxY, 180, chartBoxH, 'FD');
    }

    // Header strip
    doc.setFillColor(248, 250, 252);
    doc.rect(15.2, chartBoxY + 0.2, 179.6, 6.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(15, chartBoxY + 6.8, 195, chartBoxY + 6.8);

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 138);
    doc.text("STUDENT SUBJECT-WISE PERFORMANCE BAR CHART (%)", 18, chartBoxY + 4.8);

    // Legend
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(16, 185, 129); doc.rect(106, chartBoxY + 2, 3, 3, 'F');
    doc.setTextColor(71, 85, 105); doc.text(">=75% Exc", 110, chartBoxY + 4.5);

    doc.setFillColor(59, 130, 246); doc.rect(128, chartBoxY + 2, 3, 3, 'F');
    doc.text("50-74% Good", 132, chartBoxY + 4.5);

    doc.setFillColor(245, 158, 11); doc.rect(152, chartBoxY + 2, 3, 3, 'F');
    doc.text("33-49% Avg", 156, chartBoxY + 4.5);

    doc.setFillColor(239, 68, 68); doc.rect(174, chartBoxY + 2, 3, 3, 'F');
    doc.text("<33% Alert", 178, chartBoxY + 4.5);

    // Graph Area
    const graphLeft = 32;
    const graphRight = 188;
    const graphWidth = graphRight - graphLeft;
    const graphTop = chartBoxY + 11;
    const graphBottom = chartBoxY + 34;
    const graphHeight = graphBottom - graphTop;

    // Gridlines
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(graphLeft, graphTop, graphRight, graphTop);
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text("100%", graphLeft - 2, graphTop + 1.5, { align: "right" });

    const y50 = graphBottom - 0.5 * graphHeight;
    doc.line(graphLeft, y50, graphRight, y50);
    doc.text("50%", graphLeft - 2, y50 + 1.5, { align: "right" });

    // 33% Pass benchmark in Rose
    const y33 = graphBottom - 0.33 * graphHeight;
    doc.setDrawColor(225, 29, 72);
    if (typeof doc.setLineDash === 'function') {
      doc.setLineDash([1.5, 1.5], 0);
    } else if (typeof doc.setLineDashPattern === 'function') {
      doc.setLineDashPattern([1.5, 1.5], 0);
    }
    doc.line(graphLeft, y33, graphRight, y33);
    if (typeof doc.setLineDash === 'function') {
      doc.setLineDash([], 0);
    } else if (typeof doc.setLineDashPattern === 'function') {
      doc.setLineDashPattern([], 0);
    }
    doc.setFontSize(5.5);
    doc.setTextColor(225, 29, 72);
    doc.text("33% Pass", graphRight + 1, y33 + 1, { align: "left" });

    // 0% Baseline
    doc.setDrawColor(148, 163, 184);
    doc.line(graphLeft, graphBottom, graphRight, graphBottom);
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text("0%", graphLeft - 2, graphBottom + 1.5, { align: "right" });

    // Bars
    const N = studentSubs.length;
    const slotW = graphWidth / N;
    const barW = Math.min(12, Math.max(7, slotW * 0.55));

    studentSubs.forEach((sub, i) => {
      const pct = sub.max > 0 ? Math.min(100, Math.max(0, (sub.obt / sub.max) * 100)) : 0;
      const bH = Math.max(1, (pct / 100) * graphHeight);
      const bX = graphLeft + i * slotW + (slotW - barW) / 2;
      const bY = graphBottom - bH;
      const cX = bX + barW / 2;

      // Track
      doc.setFillColor(241, 245, 249);
      doc.rect(bX, graphTop, barW, graphHeight, 'F');

      // Bar Fill
      if (sub.isAbsent) {
        doc.setFillColor(239, 68, 68);
      } else if (pct >= 75) {
        doc.setFillColor(16, 185, 129);
      } else if (pct >= 50) {
        doc.setFillColor(59, 130, 246);
      } else if (pct >= 33) {
        doc.setFillColor(245, 158, 11);
      } else {
        doc.setFillColor(239, 68, 68);
      }
      doc.rect(bX, bY, barW, bH, 'F');

      // Score
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      if (sub.isAbsent) {
        doc.setTextColor(220, 38, 38);
        doc.text("AB", cX, bY - 1, { align: "center" });
      } else {
        doc.setTextColor(15, 23, 42);
        doc.text(`${Math.round(pct)}%`, cX, bY - 1, { align: "center" });
      }

      // Subject label
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      const subLabel = (sub.subject || '').substring(0, 8);
      doc.text(subLabel, cX, graphBottom + 3.8, { align: "center" });

      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`${sub.obt}/${sub.max}`, cX, graphBottom + 6.8, { align: "center" });
    });

    y = chartBoxY + chartBoxH + 4;
  }

  // Notes & Legend
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text("Pass Criteria: Minimum 33% per subject required.", 105, y, { align: "center" });
  doc.text("'*' Indicates Failure in Test. 'AB' Indicates Absenteeism.", 105, y + 4, { align: "center" });

  // Signatures Area
  let footerY = 260;
  if (y > 240) footerY = 274;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);

  doc.line(20, footerY, 60, footerY);
  doc.text("Class Teacher", 40, footerY + 5, { align: "center" });

  doc.line(85, footerY, 125, footerY);
  doc.text("Exam Controller", 105, footerY + 5, { align: "center" });

  doc.line(150, footerY, 190, footerY);
  doc.text("Principal Seal & Sign", 170, footerY + 5, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Electronically generated by Glorious Public School Student Tracker System. Valid with official seal.", 105, footerY + 14, { align: "center" });
}

// -------------------------------------------------------------
// ENGLISH MARKSHEET & REPORT CARD GENERATOR
// -------------------------------------------------------------

function formatEnglishSection(sec) {
  if (!sec) return 'A';
  return sec.toString().trim().toUpperCase();
}

function formatGujaratiSection(sec) {
  return formatEnglishSection(sec);
}

// -------------------------------------------------------------
// STUDENT-WISE VECTOR BAR CHART GENERATOR FOR OFFICIAL REPORT CARDS
// -------------------------------------------------------------
function renderReportCardBarChartHTML(subjectList) {
  if (!subjectList || subjectList.length === 0) return '';

  const chartW = 660;
  const chartH = 135;
  const padLeft = 45;
  const padRight = 25;
  const yTop = 20;
  const yBottom = 98;
  const usableW = chartW - padLeft - padRight;
  const usableH = yBottom - yTop; // 78px

  const N = subjectList.length;
  const slotW = usableW / N;
  const barW = Math.min(44, Math.max(22, slotW * 0.52));

  // Passing line at 33%
  const passY = (yBottom - (0.33 * usableH)).toFixed(1);

  const defs = `
    <defs>
      <linearGradient id="rptGradEmerald" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#047857"/>
      </linearGradient>
      <linearGradient id="rptGradBlue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
      <linearGradient id="rptGradAmber" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#b45309"/>
      </linearGradient>
      <linearGradient id="rptGradRed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ef4444"/>
        <stop offset="100%" stop-color="#b91c1c"/>
      </linearGradient>
    </defs>
  `;

  const gridLines = `
    <!-- 100% -->
    <line x1="${padLeft}" y1="${yTop}" x2="${chartW - padRight}" y2="${yTop}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
    <text x="${padLeft - 7}" y="${yTop + 3}" font-size="8.5" font-weight="700" fill="#94a3b8" text-anchor="end">100%</text>

    <!-- 75% -->
    <line x1="${padLeft}" y1="${(yBottom - 0.75 * usableH).toFixed(1)}" x2="${chartW - padRight}" y2="${(yBottom - 0.75 * usableH).toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
    <text x="${padLeft - 7}" y="${(yBottom - 0.75 * usableH + 3).toFixed(1)}" font-size="8.5" font-weight="700" fill="#94a3b8" text-anchor="end">75%</text>

    <!-- 50% -->
    <line x1="${padLeft}" y1="${(yBottom - 0.50 * usableH).toFixed(1)}" x2="${chartW - padRight}" y2="${(yBottom - 0.50 * usableH).toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
    <text x="${padLeft - 7}" y="${(yBottom - 0.50 * usableH + 3).toFixed(1)}" font-size="8.5" font-weight="700" fill="#94a3b8" text-anchor="end">50%</text>

    <!-- 33% Pass Benchmark in Red -->
    <line x1="${padLeft}" y1="${passY}" x2="${chartW - padRight}" y2="${passY}" stroke="#e11d48" stroke-width="1.2" stroke-dasharray="4,3" />
    <text x="${chartW - padRight + 3}" y="${parseFloat(passY) + 3}" font-size="7.5" font-weight="800" fill="#e11d48" text-anchor="start">33% Pass</text>

    <!-- 0% Baseline -->
    <line x1="${padLeft}" y1="${yBottom}" x2="${chartW - padRight}" y2="${yBottom}" stroke="#cbd5e1" stroke-width="1.5" />
    <text x="${padLeft - 7}" y="${yBottom + 3}" font-size="8.5" font-weight="700" fill="#94a3b8" text-anchor="end">0%</text>
  `;

  let barsHTML = '';
  subjectList.forEach((sub, i) => {
    const pct = sub.max > 0 ? Math.min(100, Math.max(0, (sub.obt / sub.max) * 100)) : 0;
    const barH = Math.max(3, (pct / 100) * usableH);
    const barX = padLeft + i * slotW + (slotW - barW) / 2;
    const barY = yBottom - barH;
    const centerX = barX + barW / 2;

    let gradId = 'rptGradBlue';
    let textColor = '#2563eb';
    let tier = 'Good';

    if (sub.isAbsent) {
      gradId = 'rptGradRed';
      textColor = '#dc2626';
      tier = 'Absent';
    } else if (pct >= 75) {
      gradId = 'rptGradEmerald';
      textColor = '#059669';
      tier = 'Excellent';
    } else if (pct >= 50) {
      gradId = 'rptGradBlue';
      textColor = '#2563eb';
      tier = 'Good';
    } else if (pct >= 33) {
      gradId = 'rptGradAmber';
      textColor = '#d97706';
      tier = 'Average';
    } else {
      gradId = 'rptGradRed';
      textColor = '#dc2626';
      tier = 'Needs Help';
    }

    // Translucent background track
    barsHTML += `<rect x="${barX}" y="${yTop}" width="${barW}" height="${usableH}" rx="4" ry="4" fill="#f1f5f9" opacity="0.6"/>`;

    // Filled score bar with crisp rounded top and border outline
    barsHTML += `<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="4" ry="4" fill="url(#${gradId})" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>`;

    // Floating score badge
    const badgeY = Math.max(yTop - 3, barY - 4);
    barsHTML += `
      <text x="${centerX}" y="${badgeY}" font-size="8.5" font-weight="900" fill="${textColor}" text-anchor="middle">
        ${sub.isAbsent ? 'Ab' : Math.round(pct) + '%'}
      </text>
      <text x="${centerX}" y="${badgeY - 9}" font-size="7" font-weight="700" fill="#64748b" text-anchor="middle">
        ${sub.obt}/${sub.max}
      </text>
    `;

    // Subject label & status underneath baseline
    barsHTML += `
      <text x="${centerX}" y="${yBottom + 13}" font-size="9.5" font-weight="800" fill="#1e293b" text-anchor="middle">
        ${sub.subject}
      </text>
      <text x="${centerX}" y="${yBottom + 23}" font-size="7" font-weight="700" fill="${textColor}" text-anchor="middle">
        ${tier}
      </text>
    `;
  });

  return `
    <div style="margin-top: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 8px 12px 6px 12px; background: #ffffff;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0;">
        <div style="font-size: 10.5px; font-weight: 800; color: #1e3a8a; display: flex; align-items: center; gap: 5px;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #2563eb; border-radius: 2px;"></span>
          Subject-Wise Performance Bar Chart (%)
        </div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 8px; font-weight: 700; color: #64748b;">
          <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; background: #10b981; border-radius: 2px;"></span> Excellent (&ge;75%)</span>
          <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; background: #3b82f6; border-radius: 2px;"></span> Good (50-74%)</span>
          <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; background: #f59e0b; border-radius: 2px;"></span> Average (33-49%)</span>
          <span style="display: flex; align-items: center; gap: 3px;"><span style="width: 7px; height: 7px; background: #ef4444; border-radius: 2px;"></span> Needs Attention (&lt;33%)</span>
        </div>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chartW} ${chartH}" width="100%" height="${chartH}" style="width: 100%; height: auto; max-height: 135px; display: block; overflow: visible; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;">
        ${defs}
        ${gridLines}
        ${barsHTML}
      </svg>
    </div>
  `;
}

function generateEnglishReportCardHTML(roll, targetStd = null, examType = "FIRST TERM ASSESSMENT", passedMarks = null, targetSec = null) {
  // Support flexible argument positions if caller passes section directly
  if (!targetSec && typeof examType === 'string' && ['A', 'B', 'C', 'D'].includes(examType.trim().toUpperCase())) {
    targetSec = examType.trim();
    examType = "FIRST TERM ASSESSMENT";
  }
  if (!targetSec && typeof passedMarks === 'string' && ['A', 'B', 'C', 'D'].includes(passedMarks.trim().toUpperCase())) {
    targetSec = passedMarks.trim();
    passedMarks = null;
  }

  if (roll === null || roll === undefined || roll === '') return '';
  const numRoll = parseInt(roll);

  let student = null;
  if (typeof findStudentByRoll === 'function') {
    student = findStudentByRoll(roll, targetStd, targetSec);
  }
  if (!student && !isNaN(numRoll)) {
    student = DB.students.find(s => 
      parseInt(s.roll) === numRoll && 
      (targetStd ? String(s.std).trim() === String(targetStd).trim() : true) &&
      (targetSec ? String(s.section || 'A').trim().toUpperCase() === String(targetSec).trim().toUpperCase() : true)
    );
  }
  if (!student) {
    student = DB.students.find(s => 
      String(s.roll).trim() === String(roll).trim() && 
      (targetStd ? String(s.std).trim() === String(targetStd).trim() : true)
    );
  }
  if (!student && !isNaN(numRoll)) {
    student = DB.students.find(s => parseInt(s.roll) === numRoll);
  }
  if (!student) return '';

  const studentStd = student.std ? String(student.std).trim() : (targetStd ? String(targetStd).trim() : '');
  const studentSec = String(student.section || targetSec || 'A').trim().toUpperCase();

  const marks = passedMarks ? [...passedMarks].sort((a, b) => new Date(a.date) - new Date(b.date)) : 
    DB.marks.filter(m => 
      parseInt(m.roll) === numRoll && 
      (m.std ? String(m.std).trim() === studentStd : true) &&
      (!m.section || String(m.section).trim().toUpperCase() === studentSec)
    ).sort((a, b) => new Date(a.date) - new Date(b.date));

  const peerRolls = DB.students
    .filter(s => String(s.std).trim() === studentStd && String(s.section || 'A').trim().toUpperCase() === studentSec)
    .map(s => parseInt(s.roll));

  let totalMax = 0;
  let totalObt = 0;

  // Group by Subject for student-wise bar chart
  const subjectMap = {};
  marks.forEach(m => {
    const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
    if (!subjectMap[cleanSub]) {
      subjectMap[cleanSub] = { subject: cleanSub, obt: 0, max: 0, isAbsent: true };
    }
    const sMax = m.total || 50;
    const sObt = m.isAbsent ? 0 : (m.marks || 0);
    subjectMap[cleanSub].max += sMax;
    subjectMap[cleanSub].obt += sObt;
    if (!m.isAbsent) subjectMap[cleanSub].isAbsent = false;
  });
  const studentSubjects = Object.values(subjectMap);

  // Calculate peer ranks for each mark row
  const tableRowsHTML = marks.map((m, idx) => {
    const sMax = m.total || 50;
    const sObt = m.isAbsent ? 0 : m.marks;
    const pct = sMax > 0 ? (sObt / sMax) * 100 : 0;
    totalMax += sMax;
    totalObt += sObt;

    let sRank = "-";
    if (!m.isAbsent) {
      const cleanSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : m.subject;
      const subScores = DB.marks
        .filter(x => (x.std ? String(x.std).trim() === studentStd : true) && 
                     (!x.section || String(x.section).trim().toUpperCase() === studentSec) &&
                     peerRolls.includes(parseInt(x.roll)) && 
                     (typeof cleanSubjectName === 'function' ? cleanSubjectName(x.subject) : x.subject) === cleanSub && 
                     !x.isAbsent)
        .map(x => x.marks)
        .sort((a, b) => b - a);
      const rIdx = subScores.indexOf(m.marks);
      if (rIdx >= 0) sRank = `#${rIdx + 1}`;
    }

    const rowDateStr = typeof formatDateSlash === 'function' ? formatDateSlash(m.date) : (m.date || '-');
    const isEven = idx % 2 === 1;

    return `
      <tr style="background-color: ${isEven ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 7px 8px; text-align: center; font-size: 11px; font-weight: 600; color: #475569;">${idx + 1}</td>
        <td style="padding: 7px 8px; text-align: center; font-size: 11px; font-weight: 600; color: #475569;">${rowDateStr}</td>
        <td style="padding: 7px 10px; font-size: 12px; font-weight: 700; color: #0f172a;">${m.subject}</td>
        <td style="padding: 7px 10px; font-size: 11px; color: #334155;">${(m.topic || 'Unit Assessment').substring(0, 30)}</td>
        <td style="padding: 7px 8px; text-align: right; font-size: 11px; font-weight: 600; color: #334155;">${sMax}</td>
        <td style="padding: 7px 8px; text-align: right; font-size: 12px; font-weight: 700; color: ${m.isAbsent ? '#dc2626' : (sObt < Math.ceil(sMax * 0.33) ? '#dc2626' : '#0f172a')};">
          ${m.isAbsent ? '<span style="color:#dc2626; font-weight: 800;">ABSENT</span>' : sObt}
        </td>
        <td style="padding: 7px 8px; text-align: right; font-size: 11px; font-weight: 600; color: #334155;">
          ${m.isAbsent ? '-' : pct.toFixed(0) + '%'}
        </td>
        <td style="padding: 7px 8px; text-align: right; font-size: 11px; font-weight: 700; color: #2563eb;">
          ${m.isAbsent ? '-' : sRank}
        </td>
      </tr>
    `;
  }).join('');

  // Classroom Overall Rank calculation
  const peerTotals = [];
  peerRolls.forEach(pr => {
    const pMks = DB.marks.filter(m => 
      (m.std ? String(m.std).trim() === studentStd : true) && 
      (!m.section || String(m.section).trim().toUpperCase() === studentSec) &&
      parseInt(m.roll) === pr && 
      !m.isAbsent
    );
    if (pMks.length > 0) {
      const pTotal = pMks.reduce((s, m) => s + (parseFloat(m.marks) || 0), 0);
      peerTotals.push({ roll: pr, total: pTotal });
    }
  });
  peerTotals.sort((a, b) => b.total - a.total);
  const oRankIdx = peerTotals.findIndex(pt => pt.roll === numRoll);
  const overallRank = oRankIdx >= 0 ? (oRankIdx + 1).toString() : "-";
  const overallPct = totalMax > 0 ? (totalObt / totalMax) * 100 : 0;
  const issueDateStr = typeof formatDateSlash === 'function' ? formatDateSlash(new Date()) : new Date().toLocaleDateString('en-GB');

  return `
    <div class="em-scorecard-page" style="width: 210mm; min-height: 297mm; padding: 6mm; box-sizing: border-box; background: #ffffff; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; color: #0f172a; position: relative;">
      
      <!-- Multi-border Official Frame -->
      <div style="border: 3px solid #dc2626; padding: 2px; box-sizing: border-box; background: #ffffff;">
        <div style="border: 2px solid #2563eb; padding: 2px; box-sizing: border-box; background: #ffffff;">
          <div style="border: 1.5px solid #10b981; padding: 12px; box-sizing: border-box; background: #ffffff; min-height: 275mm; display: flex; flex-direction: column; justify-content: space-between;">
            
            <div>
              <!-- Header Banner -->
              <div style="background: linear-gradient(135deg, #1e3a8a, #172554); color: #ffffff; padding: 14px 10px; text-align: center; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 0.5px; color: #ffffff; line-height: 1.2;">GLORIOUS PUBLIC SCHOOL</h1>
                <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; color: #e0e7ff;">English Medium • Recognised by Department of Education</p>
                <p style="margin: 3px 0 0 0; font-size: 10px; color: #cbd5e1;">Himatnagar, Sabarkantha, Gujarat - 383001 | Contact: gloriouspschool2009@gmail.com</p>
              </div>

              <!-- Sub-header Banner (Exam Title) -->
              <div style="background: #dc2626; color: #ffffff; margin-top: 8px; padding: 6px 10px; text-align: center; border-radius: 4px; font-size: 13px; font-weight: 800; letter-spacing: 0.5px;">
                STUDENT PROGRESS REPORT CARD - ${examType || 'FIRST TERM ASSESSMENT'}
              </div>

              <!-- Student Details Grid Box -->
              <div style="margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #f8fafc;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #cbd5e1;">
                  <div style="padding: 8px 12px; border-right: 1px solid #cbd5e1;">
                    <span style="font-size: 10px; font-weight: 700; color: #64748b; display: block; text-transform: uppercase;">STUDENT NAME :</span>
                    <span style="font-size: 14px; font-weight: 800; color: #0f172a;">${student.name}</span>
                  </div>
                  <div style="padding: 8px 12px;">
                    <span style="font-size: 10px; font-weight: 700; color: #64748b; display: block; text-transform: uppercase;">ROLL NO. / G.R. NO. :</span>
                    <span style="font-size: 14px; font-weight: 800; color: #0f172a;">Roll No: ${student.roll} &nbsp;|&nbsp; G.R. No: ${student.grNo || 'N/A'}</span>
                  </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr;">
                  <div style="padding: 8px 12px; border-right: 1px solid #cbd5e1;">
                    <span style="font-size: 10px; font-weight: 700; color: #64748b; display: block; text-transform: uppercase;">CLASS & SECTION :</span>
                    <span style="font-size: 14px; font-weight: 800; color: #0f172a;">Class ${student.std || 'N/A'} - Section ${formatEnglishSection(student.section)}</span>
                  </div>
                  <div style="padding: 8px 12px;">
                    <span style="font-size: 10px; font-weight: 700; color: #64748b; display: block; text-transform: uppercase;">ISSUE DATE :</span>
                    <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${issueDateStr}</span>
                  </div>
                </div>
              </div>

              <!-- Marks Table -->
              <div style="margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                  <thead>
                    <tr style="background: #0ea5e9; color: #ffffff;">
                      <th style="padding: 8px; font-size: 11px; font-weight: 800; text-align: center; width: 35px;">SR.</th>
                      <th style="padding: 8px; font-size: 11px; font-weight: 800; text-align: center; width: 75px;">DATE</th>
                      <th style="padding: 8px 10px; font-size: 11px; font-weight: 800; width: 140px;">SUBJECT</th>
                      <th style="padding: 8px 10px; font-size: 11px; font-weight: 800;">TOPIC / CHAPTER</th>
                      <th style="padding: 8px; font-size: 11px; font-weight: 800; text-align: right; width: 60px;">MAX MARKS</th>
                      <th style="padding: 8px; font-size: 11px; font-weight: 800; text-align: right; width: 75px;">OBTAINED</th>
                      <th style="padding: 8px; font-size: 11px; font-weight: 800; text-align: right; width: 55px;">PCT (%)</th>
                      <th style="padding: 8px; font-size: 11px; font-weight: 800; text-align: right; width: 65px;">RANK</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${marks.length > 0 ? tableRowsHTML : `
                      <tr>
                        <td colspan="8" style="padding: 25px; text-align: center; font-size: 12px; color: #64748b;">No evaluation records available for this student.</td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>

              <!-- Student-Wise Performance Bar Chart -->
              ${studentSubjects && studentSubjects.length > 0 ? renderReportCardBarChartHTML(studentSubjects) : ''}

              <!-- 3-Column Summary Box -->
              <div style="margin-top: 14px; background: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; gap: 8px;">
                <div style="border-right: 1px solid #cbd5e1; padding-right: 8px;">
                  <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">TOTAL MARKS OBTAINED</div>
                  <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 2px;">${totalObt} / ${totalMax}</div>
                </div>
                <div style="border-right: 1px solid #cbd5e1; padding: 0 8px;">
                  <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">OVERALL PERCENTAGE</div>
                  <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 2px;">${overallPct.toFixed(1)}%</div>
                </div>
                <div style="padding-left: 8px;">
                  <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">CLASSROOM RANK</div>
                  <div style="font-size: 18px; font-weight: 900; color: #2563eb; margin-top: 2px;">${overallRank !== '-' ? `#${overallRank} of ${peerRolls.length}` : '-'}</div>
                </div>
              </div>

              <!-- Notes & Legend -->
              <div style="margin-top: 12px; padding: 8px 12px; background: #fafafa; border-radius: 6px; border: 1px dashed #e2e8f0; font-size: 9.5px; color: #64748b; line-height: 1.5;">
                <strong>NOTE:</strong> 1. Passing Criterion: Minimum 33% required in each subject. 2. 'ABSENT' indicates the student was not present for the exam. 3. Classroom rank is evaluated based on total marks obtained in class.
              </div>
            </div>

            <!-- Signatures Section -->
            <div style="margin-top: 25px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; gap: 20px; padding: 0 15px;">
                <div>
                  <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 35px;"></div>
                  <span style="font-size: 11px; font-weight: 700; color: #334155;">Class Teacher</span>
                </div>
                <div>
                  <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 35px;"></div>
                  <span style="font-size: 11px; font-weight: 700; color: #334155;">Exam Coordinator</span>
                </div>
                <div>
                  <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 35px;"></div>
                  <span style="font-size: 11px; font-weight: 700; color: #334155;">Principal (Sign & Seal)</span>
                </div>
              </div>
              <div style="margin-top: 15px; text-align: center; font-size: 8.5px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 6px;">
                Digitally generated by Glorious Public School Student Tracker System. Valid with official seal.
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `;
}

function generateGujaratiReportCardHTML(roll, targetStd = null, examType = "FIRST TERM ASSESSMENT", passedMarks = null, targetSec = null) {
  return generateEnglishReportCardHTML(roll, targetStd, examType, passedMarks, targetSec);
}

function printBulkReportCards() {
  if (!DB.students || DB.students.length === 0) {
    if (window.showToast) window.showToast('No students enrolled to print report cards.', 'warning');
    return;
  }

  const fStd = document.getElementById('report-filter-std') ? document.getElementById('report-filter-std').value.toString().toLowerCase().trim() : '';
  const fStudent = document.getElementById('report-filter-student') ? document.getElementById('report-filter-student').value.toLowerCase().trim() : '';
  const fSub = document.getElementById('report-filter-subject') ? document.getElementById('report-filter-subject').value.trim() : '';
  const fEx = (document.getElementById('report-exam-type') ? document.getElementById('report-exam-type').value.trim() : '') || 'FIRST TERM ASSESSMENT';

  const targetStudents = DB.students.filter(s => {
    const matchStd = !fStd || fStd === 'all' || (s.std && s.std.toString().toLowerCase() === fStd);
    const matchStudent = !fStudent || s.name.toLowerCase().includes(fStudent) || s.roll.toString().includes(fStudent);
    return matchStd && matchStudent;
  });

  if (targetStudents.length === 0) {
    if (window.showToast) window.showToast('No students match the current filters.', 'warning');
    return;
  }

  let container = document.getElementById('em-print-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'em-print-container';
    document.body.appendChild(container);
  }

  let htmlAll = '';
  targetStudents.sort((a, b) => {
    if (a.std !== b.std) return (parseInt(a.std) || 0) - (parseInt(b.std) || 0);
    const sA = (a.section || 'A').toUpperCase();
    const sB = (b.section || 'A').toUpperCase();
    if (sA !== sB) return sA.localeCompare(sB);
    return (parseInt(a.roll) || 0) - (parseInt(b.roll) || 0);
  }).forEach(stu => {
    let mks = DB.marks.filter(m => 
      (m.std ? String(m.std).trim() === String(stu.std).trim() : true) && 
      (!m.section || String(m.section).trim().toUpperCase() === String(stu.section || 'A').trim().toUpperCase()) &&
      parseInt(m.roll) === parseInt(stu.roll)
    );
    if (fSub) {
      const cleanFSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(fSub).toLowerCase() : fSub.toLowerCase();
      mks = mks.filter(m => (typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject).toLowerCase() : m.subject.toLowerCase()) === cleanFSub);
    }
    // Generate report card for student
    htmlAll += generateEnglishReportCardHTML(stu.roll, stu.std, fEx, mks, stu.section || 'A');
  });

  if (!htmlAll) {
    if (window.showToast) window.showToast('No report card data could be generated.', 'warning');
    return;
  }

  container.innerHTML = htmlAll;
  if (window.showToast) window.showToast('Preparing Report Card print preview...', 'info');

  setTimeout(() => {
    window.print();
  }, 350);
}

function printSingleStudent(roll, targetStd = null, examType = 'FIRST TERM ASSESSMENT', targetSec = null) {
  let container = document.getElementById('em-print-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'em-print-container';
    document.body.appendChild(container);
  }

  const html = generateEnglishReportCardHTML(roll, targetStd, examType, null, targetSec);
  if (!html) {
    if (window.showToast) window.showToast('Student record not found.', 'error');
    return;
  }

  container.innerHTML = html;
  if (window.showToast) window.showToast('Preparing Report Card print preview...', 'info');
  setTimeout(() => {
    window.print();
  }, 300);
}

function printSingleStudentGujarati(roll, targetStd = null, examType = 'FIRST TERM ASSESSMENT', targetSec = null) {
  printSingleStudent(roll, targetStd, examType, targetSec);
}

async function downloadEnglishPDF(targetStudents, examType, classLabel) {
  if (!targetStudents || targetStudents.length === 0) {
    if (window.showToast) window.showToast('No students selected for PDF generation.', 'warning');
    return;
  }

  const fSub = document.getElementById('report-filter-subject') ? document.getElementById('report-filter-subject').value.trim() : '';

  // Sort students cleanly by Class, Section, and Roll
  const sortedStudents = [...targetStudents].sort((a, b) => {
    if (a.std !== b.std) return (parseInt(a.std) || 0) - (parseInt(b.std) || 0);
    const sA = (a.section || 'A').toUpperCase();
    const sB = (b.section || 'A').toUpperCase();
    if (sA !== sB) return sA.localeCompare(sB);
    return (parseInt(a.roll) || 0) - (parseInt(b.roll) || 0);
  });

  // TIER 1: High-Resolution Visual html2canvas Capture
  if (typeof html2canvas === 'function' && window.jspdf) {
    let container = document.getElementById('em-print-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'em-print-container';
      document.body.appendChild(container);
    }

    try {
      let htmlAll = '';
      sortedStudents.forEach(stu => {
        let mks = DB.marks.filter(m => 
          (m.std ? String(m.std).trim() === String(stu.std).trim() : true) && 
          (!m.section || String(m.section).trim().toUpperCase() === String(stu.section || 'A').trim().toUpperCase()) &&
          parseInt(m.roll) === parseInt(stu.roll)
        );
        if (fSub) {
          const cleanFSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(fSub).toLowerCase() : fSub.toLowerCase();
          mks = mks.filter(m => (typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject).toLowerCase() : m.subject.toLowerCase()) === cleanFSub);
        }
        htmlAll += generateEnglishReportCardHTML(stu.roll, stu.std, examType, mks, stu.section || 'A');
      });

      if (htmlAll) {
        // Temporarily render container offscreen with real layout dimensions so html2canvas can measure & render elements!
        container.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 210mm; min-height: 297mm; display: block !important; visibility: visible !important; z-index: -9999; background: #ffffff;';
        container.innerHTML = htmlAll;

        if (window.showToast) window.showToast('Generating high-resolution Report Card PDF...', 'info');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pages = container.querySelectorAll('.em-scorecard-page');

        if (pages && pages.length > 0) {
          for (let i = 0; i < pages.length; i++) {
            const pageEl = pages[i];
            if (i > 0) pdf.addPage();

            const canvas = await html2canvas(pageEl, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
          }

          container.style.cssText = 'display: none;';
          container.innerHTML = '';

          pdf.save(`Glorious_School_Report_Cards_${classLabel || ''}${Date.now()}.pdf`);
          if (window.showToast) window.showToast('Report Cards PDF downloaded successfully!', 'success');
          return;
        }
      }
    } catch (err) {
      console.warn('html2canvas rendering fallback to direct vector jsPDF:', err);
      if (container) {
        container.style.cssText = 'display: none;';
        container.innerHTML = '';
      }
    }
  }

  // TIER 2: Direct Vector jsPDF Engine (Super-fast, reliable vector PDF with bar charts, tables, and frames)
  if (window.jspdf) {
    try {
      if (window.showToast) window.showToast('Compiling High-Resolution Vector PDF Marksheets...', 'info');
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      let pageAdded = false;

      sortedStudents.forEach(stu => {
        let mks = DB.marks.filter(m => 
          (m.std ? String(m.std).trim() === String(stu.std).trim() : true) && 
          (!m.section || String(m.section).trim().toUpperCase() === String(stu.section || 'A').trim().toUpperCase()) &&
          parseInt(m.roll) === parseInt(stu.roll)
        );
        if (fSub) {
          const cleanFSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(fSub).toLowerCase() : fSub.toLowerCase();
          mks = mks.filter(m => (typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject).toLowerCase() : m.subject.toLowerCase()) === cleanFSub);
        }

        addStudentScorecardToDoc(doc, stu.roll, !pageAdded, mks, examType, fSub || 'All', stu.std, stu.section || 'A');
        pageAdded = true;
      });

      if (pageAdded) {
        doc.save(`Glorious_School_Report_Cards_${classLabel || ''}${Date.now()}.pdf`);
        if (window.showToast) window.showToast('Marksheet PDF downloaded successfully!', 'success');
        return;
      }
    } catch (err) {
      console.error('Vector PDF error:', err);
    }
  }

  // TIER 3: Fallback to print dialog
  if (window.showToast) window.showToast('Opening print dialog. Select "Save as PDF" to export.', 'info');
  let container = document.getElementById('em-print-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'em-print-container';
    document.body.appendChild(container);
  }
  let htmlAll = '';
  sortedStudents.forEach(stu => {
    let mks = DB.marks.filter(m => (m.std ? String(m.std).trim() === String(stu.std).trim() : true) && parseInt(m.roll) === parseInt(stu.roll));
    htmlAll += generateEnglishReportCardHTML(stu.roll, stu.std, examType, mks, stu.section || 'A');
  });
  container.innerHTML = htmlAll;
  setTimeout(() => {
    window.print();
  }, 350);
}

function downloadGujaratiPDF(targetStudents, examType, classLabel) {
  downloadEnglishPDF(targetStudents, examType, classLabel);
}

function generateBulkPDF() {
  if (!DB.students || DB.students.length === 0) {
    if (window.showToast) window.showToast('No students enrolled to generate report cards.', 'warning');
    return;
  }

  const fStd = document.getElementById('report-filter-std') ? document.getElementById('report-filter-std').value.toString().toLowerCase().trim() : '';
  const fStudent = document.getElementById('report-filter-student') ? document.getElementById('report-filter-student').value.toLowerCase().trim() : '';
  const fEx = (document.getElementById('report-exam-type') ? document.getElementById('report-exam-type').value.trim() : '') || 'FIRST TERM ASSESSMENT';

  const targetStudents = DB.students.filter(s => {
    const matchStd = !fStd || fStd === 'all' || (s.std && s.std.toString().toLowerCase() === fStd);
    const matchStudent = !fStudent || s.name.toLowerCase().includes(fStudent) || s.roll.toString().includes(fStudent);
    return matchStd && matchStudent;
  });

  if (targetStudents.length === 0) {
    if (window.showToast) window.showToast('No students match the current filters.', 'warning');
    return;
  }

  const classLabel = (fStd && fStd !== 'all') ? `Class_${fStd}_` : '';
  downloadEnglishPDF(targetStudents, fEx, classLabel);
}

// -------------------------------------------------------------
// MASTER EXCEL EXPORT (.XLSX) VIA SHEETJS
// -------------------------------------------------------------

function generateBulkExcel() {
  if (!DB.marks || DB.marks.length === 0) {
    if (window.showToast) window.showToast('No test records to export.', 'warning');
    return;
  }

  const fStd = document.getElementById('excel-filter-std') ? document.getElementById('excel-filter-std').value.toString().trim() : 'all';
  const fSource = document.getElementById('excel-filter-source') ? document.getElementById('excel-filter-source').value : 'excel';
  const fDate = document.getElementById('excel-filter-fdate') ? document.getElementById('excel-filter-fdate').value : null;
  const tDate = document.getElementById('excel-filter-tdate') ? document.getElementById('excel-filter-tdate').value : null;

  const filteredMarks = DB.marks.filter(m => {
    if (fStd !== 'all' && m.std && m.std.toString() !== fStd) return false;
    if (fSource !== 'all') {
      const src = m.source || 'excel';
      if (src !== fSource) return false;
    }
    if (fDate && m.date < fDate) return false;
    if (tDate && m.date > tDate) return false;
    return true;
  });

  if (filteredMarks.length === 0) {
    if (window.showToast) window.showToast('No records found matching the current class and date filters.', 'warning');
    return;
  }

  if (window.showToast) window.showToast('Structuring Student-Wise Excel Workbook...', 'info');

  setTimeout(() => {
    const wsData = [];
    wsData.push(['GLORIOUS PUBLIC SCHOOL - ACADEMIC MASTER EXPORT']);
    wsData.push([
      'Generated On:', new Date().toLocaleString(), '', 
      'Class Filter:', fStd === 'all' ? 'All Classes' : `Class ${fStd}`, '',
      'Data Source:', fSource === 'all' ? 'All Records' : (fSource === 'excel' ? 'Excel Uploads Only' : 'Manual Entries'), '',
      'Date Range:', fDate || 'Beginning', 'to', tDate || 'Today'
    ]);
    wsData.push([]);

    // Unique student keys: "std_roll"
    const studentKeys = [...new Set(filteredMarks.map(m => `${m.std || '9'}_${m.roll}`))].sort((a, b) => {
      const [sA, rA] = a.split('_').map(Number);
      const [sB, rB] = b.split('_').map(Number);
      if (sA !== sB) return sA - sB;
      return rA - rB;
    });

    studentKeys.forEach(key => {
      const [stdStr, rollStr] = key.split('_');
      const roll = parseInt(rollStr);
      const stu = DB.students.find(s => s.std.toString() === stdStr && s.roll === roll) || DB.students.find(s => s.roll === roll);
      const name = stu ? stu.name : 'Unknown';
      const std = stu ? stu.std : stdStr;
      const sec = stu ? stu.section || 'A' : '-';
      const gr = stu ? stu.grNo || 'N/A' : 'N/A';
      const mob = stu ? stu.mobile || '-' : '-';

      const stuMarks = filteredMarks.filter(m => (m.std ? m.std.toString() === stdStr : true) && m.roll === roll)
                                    .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (stuMarks.length === 0) return;

      wsData.push(['Roll No:', roll, 'GR No:', gr, 'Student Name:', name, `Class ${std}-${sec}`, 'Contact:', mob]);
      wsData.push(['Date', 'Subject', 'Topic', 'Max Marks', 'Obtained', 'Percentage', 'Grade']);

      let sTot = 0;
      let sObt = 0;

      stuMarks.forEach(m => {
        const pct = m.isAbsent ? 0 : (m.marks / m.total) * 100;
        if (!m.isAbsent) {
          sTot += m.total;
          sObt += m.marks;
        }
        wsData.push([
          typeof formatDateSlash === 'function' ? formatDateSlash(m.date) : (window.formatDateSlash ? window.formatDateSlash(m.date) : m.date),
          typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject) : (window.cleanSubjectName ? window.cleanSubjectName(m.subject) : m.subject),
          m.topic,
          m.total,
          m.isAbsent ? 'AB' : m.marks,
          m.isAbsent ? '-' : `${pct.toFixed(2)}%`,
          m.isAbsent ? 'F' : getGrade(pct).g
        ]);
      });

      const oPct = sTot > 0 ? (sObt / sTot) * 100 : 0;
      wsData.push(['OVERALL TOTAL', '', '', sTot, sObt, `${oPct.toFixed(2)}%`, getGrade(oPct).g]);
      wsData.push([]);
      wsData.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(wsData);
    worksheet['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master_Student_Records');

    const todayStr = new Date().toISOString().split('T')[0];
    const classLabel = (fStd && fStd !== 'all') ? `Class_${fStd}_` : '';
    XLSX.writeFile(workbook, `Glorious_Public_School_Master_Data_${classLabel}${todayStr}.xlsx`);
    if (window.showToast) window.showToast('Master Excel Export Successful!', 'success');
  }, 700);
}

// -------------------------------------------------------------
// WHATSAPP BROADCAST QUEUE & ALERTS
// -------------------------------------------------------------

function loadWhatsAppQueue() {
  const std = document.getElementById('wa-filter-std') ? document.getElementById('wa-filter-std').value : 'all';
  const stuQuery = document.getElementById('wa-filter-student') ? document.getElementById('wa-filter-student').value.trim().toLowerCase() : '';
  const sub = document.getElementById('wa-filter-subject') ? document.getElementById('wa-filter-subject').value.trim().toLowerCase() : '';
  const exam = (document.getElementById('wa-exam-name') ? document.getElementById('wa-exam-name').value.trim() : '') || 'Assessments';
  const fDate = document.getElementById('wa-filter-fdate') ? document.getElementById('wa-filter-fdate').value : '';
  const tDate = document.getElementById('wa-filter-tdate') ? document.getElementById('wa-filter-tdate').value : '';

  const validStudents = DB.students.filter(s => {
    if (std !== 'all' && s.std != std) return false;
    if (stuQuery && !s.name.toLowerCase().includes(stuQuery) && !s.roll.toString().includes(stuQuery)) return false;
    return Boolean(s.mobile);
  });

  waDispatchQueue = [];

  validStudents.forEach(stu => {
    let stuMarks = DB.marks.filter(m => m.roll === stu.roll);
    if (sub) stuMarks = stuMarks.filter(m => m.subject.toLowerCase().includes(sub));
    if (fDate) stuMarks = stuMarks.filter(m => m.date >= fDate);
    if (tDate) stuMarks = stuMarks.filter(m => m.date <= tDate);

    if (stuMarks.length > 0) {
      let totalObt = 0;
      let totalMax = 0;
      const details = stuMarks.slice(0, 6).map(m => {
        if (!m.isAbsent) {
          totalObt += m.marks;
          totalMax += m.total;
        }
        return `• ${m.subject}: ${m.isAbsent ? 'AB' : `${m.marks}/${m.total}`}`;
      }).join('\n');

      const u = new URL(window.location.href);
      u.searchParams.set('student', stu.roll);

      const overall = totalMax > 0 ? ((totalObt / totalMax) * 100).toFixed(1) : '0';
      const msg = `*Glorious Public School - Performance Report*\n\nStudent: *${stu.name}*\nRoll No: ${stu.roll} (Class ${stu.std || '-'})\nPeriod/Exam: ${exam}\n\n*Scores:*\n${details}\n\n*Overall Average: ${overall}%*\n\nView official digital scorecard: ${u.toString()}`;

      waDispatchQueue.push({
        roll: stu.roll,
        name: stu.name,
        mobile: formatPhoneForWA(stu.mobile),
        message: msg
      });
    }
  });

  if (waDispatchQueue.length === 0) {
    if (window.showToast) window.showToast('No students matched criteria or all students missing mobile numbers.', 'warning');
    return;
  }

  document.getElementById('wa-queue-container').classList.remove('hidden');
  renderWaQueue();
}

function loadCustomWhatsAppQueue(items, label = 'Custom Queue') {
  waDispatchQueue = [...items];
  const container = document.getElementById('wa-queue-container');
  if (container) {
    container.classList.remove('hidden');
    renderWaQueue();
    // Scroll to it
    container.scrollIntoView({ behavior: 'smooth' });
  }
}

function renderWaQueue() {
  const countEl = document.getElementById('wa-queue-count');
  const listEl = document.getElementById('wa-queue-list');
  const sendBtn = document.getElementById('wa-btn-send-next');

  if (countEl) countEl.innerText = waDispatchQueue.length;

  if (waDispatchQueue.length === 0) {
    if (listEl) {
      listEl.innerHTML = `
        <div class="text-center text-slate-400 py-6">
          <i class="fa-solid fa-circle-check text-4xl mb-2 text-emerald-400 block"></i>
          <p class="font-bold text-slate-700">All broadcast messages dispatched!</p>
        </div>
      `;
    }
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  if (listEl) {
    listEl.innerHTML = waDispatchQueue.map((item, idx) => `
      <div class="flex items-center justify-between p-3 border-b border-slate-100 ${idx === 0 ? 'bg-emerald-50/70 border-emerald-200 rounded-xl shadow-sm' : ''}">
        <div>
          <span class="font-bold text-slate-800 text-sm">${item.name}</span>
          <span class="text-xs text-slate-500 font-medium ml-2">(+${item.mobile})</span>
        </div>
        ${idx === 0 ? '<span class="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md animate-pulse">UP NEXT</span>' : ''}
      </div>
    `).join('');
  }
}

function sendNextWhatsApp() {
  if (waDispatchQueue.length === 0) return;
  const target = waDispatchQueue.shift();
  renderWaQueue();

  const url = `https://wa.me/${target.mobile}?text=${encodeURIComponent(target.message)}`;
  window.open(url, '_blank');
}

// Global symbols
window.addStudentScorecardToDoc = addStudentScorecardToDoc;
window.renderReportCardBarChartHTML = renderReportCardBarChartHTML;
window.generateEnglishReportCardHTML = generateEnglishReportCardHTML;
window.generateGujaratiReportCardHTML = generateGujaratiReportCardHTML;
window.printBulkReportCards = printBulkReportCards;
window.printSingleStudent = printSingleStudent;
window.printSingleStudentEnglish = printSingleStudent;
window.printSingleStudentGujarati = printSingleStudentGujarati;
window.downloadEnglishPDF = downloadEnglishPDF;
window.downloadGujaratiPDF = downloadGujaratiPDF;
window.generateBulkPDF = generateBulkPDF;
window.generateBulkExcel = generateBulkExcel;
window.loadWhatsAppQueue = loadWhatsAppQueue;
window.loadCustomWhatsAppQueue = loadCustomWhatsAppQueue;
window.renderWaQueue = renderWaQueue;
window.sendNextWhatsApp = sendNextWhatsApp;
