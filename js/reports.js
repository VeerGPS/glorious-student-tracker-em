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

function addStudentScorecardToDoc(doc, roll, isFirstPage, passedMarks = null, examType = "FIRST TERM EXAMINATIONS", subjectFilter = "All", targetStd = null) {
  const student = DB.students.find(s => s.roll === roll && (targetStd ? s.std.toString() === targetStd.toString() : true)) || DB.students.find(s => s.roll === roll);
  if (!student) return;

  if (!isFirstPage) doc.addPage();

  const marks = passedMarks ? passedMarks.sort((a, b) => new Date(a.date) - new Date(b.date)) : 
    DB.marks.filter(m => m.roll === roll && (m.std ? m.std.toString() === student.std.toString() : true)).sort((a, b) => new Date(a.date) - new Date(b.date));

  const peerRolls = DB.students.filter(s => s.std.toString() === student.std.toString()).map(s => s.roll);

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
          .filter(x => (x.std ? x.std.toString() === student.std.toString() : true) && 
                       peerRolls.includes(x.roll) && 
                       (cleanSubjectName(x.subject) === cleanSub) && 
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
    const pMks = DB.marks.filter(m => (m.std ? m.std.toString() === student.std.toString() : true) && m.roll === pr && !m.isAbsent);
    if (pMks.length > 0) {
      const pTotal = pMks.reduce((s, m) => s + m.marks, 0);
      peerTotals.push({ roll: pr, total: pTotal });
    }
  });
  peerTotals.sort((a, b) => b.total - a.total);
  const oRankIdx = peerTotals.findIndex(pt => pt.roll === roll);
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

  // Notes & Legend
  y += 28;
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

function generateEnglishReportCardHTML(roll, targetStd = null, examType = "FIRST TERM ASSESSMENT", passedMarks = null) {
  const student = DB.students.find(s => s.roll === roll && (targetStd ? s.std.toString() === targetStd.toString() : true)) || DB.students.find(s => s.roll === roll);
  if (!student) return '';

  const marks = passedMarks ? passedMarks.sort((a, b) => new Date(a.date) - new Date(b.date)) : 
    DB.marks.filter(m => m.roll === roll && (m.std ? m.std.toString() === student.std.toString() : true)).sort((a, b) => new Date(a.date) - new Date(b.date));

  const peerRolls = DB.students.filter(s => s.std.toString() === student.std.toString()).map(s => s.roll);

  let totalMax = 0;
  let totalObt = 0;

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
        .filter(x => (x.std ? x.std.toString() === student.std.toString() : true) && 
                     peerRolls.includes(x.roll) && 
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
    const pMks = DB.marks.filter(m => (m.std ? m.std.toString() === student.std.toString() : true) && m.roll === pr && !m.isAbsent);
    if (pMks.length > 0) {
      const pTotal = pMks.reduce((s, m) => s + m.marks, 0);
      peerTotals.push({ roll: pr, total: pTotal });
    }
  });
  peerTotals.sort((a, b) => b.total - a.total);
  const oRankIdx = peerTotals.findIndex(pt => pt.roll === roll);
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

function generateGujaratiReportCardHTML(roll, targetStd = null, examType = "FIRST TERM ASSESSMENT", passedMarks = null) {
  return generateEnglishReportCardHTML(roll, targetStd, examType, passedMarks);
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
    if (a.std !== b.std) return parseInt(a.std) - parseInt(b.std);
    return a.roll - b.roll;
  }).forEach(stu => {
    let mks = DB.marks.filter(m => (m.std ? m.std.toString() === stu.std.toString() : true) && m.roll === stu.roll);
    if (fSub) {
      const cleanFSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(fSub).toLowerCase() : fSub.toLowerCase();
      mks = mks.filter(m => (typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject).toLowerCase() : m.subject.toLowerCase()) === cleanFSub);
    }
    if (mks.length > 0) {
      htmlAll += generateEnglishReportCardHTML(stu.roll, stu.std, fEx, mks);
    }
  });

  if (!htmlAll) {
    if (window.showToast) window.showToast('No marks available for the selected filters.', 'warning');
    return;
  }

  container.innerHTML = htmlAll;
  if (window.showToast) window.showToast('Preparing Report Card print preview...', 'info');

  setTimeout(() => {
    window.print();
  }, 350);
}

function printSingleStudent(roll, targetStd = null, examType = 'FIRST TERM ASSESSMENT') {
  let container = document.getElementById('em-print-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'em-print-container';
    document.body.appendChild(container);
  }

  const html = generateEnglishReportCardHTML(roll, targetStd, examType);
  if (!html) {
    if (window.showToast) window.showToast('Student record not found.', 'error');
    return;
  }

  container.innerHTML = html;
  setTimeout(() => {
    window.print();
  }, 300);
}

function printSingleStudentGujarati(roll, targetStd = null, examType = 'FIRST TERM ASSESSMENT') {
  printSingleStudent(roll, targetStd, examType);
}

async function downloadEnglishPDF(targetStudents, examType, classLabel) {
  let container = document.getElementById('em-print-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'em-print-container';
    document.body.appendChild(container);
  }

  let htmlAll = '';
  targetStudents.forEach(stu => {
    let mks = DB.marks.filter(m => (m.std ? m.std.toString() === stu.std.toString() : true) && m.roll === stu.roll);
    if (mks.length > 0) {
      htmlAll += generateEnglishReportCardHTML(stu.roll, stu.std, examType, mks);
    }
  });

  if (!htmlAll) {
    if (window.showToast) window.showToast('No examination marks available.', 'warning');
    return;
  }

  container.innerHTML = htmlAll;

  // Check if html2canvas and jsPDF are available
  if (typeof html2canvas === 'function' && window.jspdf) {
    try {
      if (window.showToast) window.showToast('Generating high-resolution Report Card PDF...', 'info');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pages = container.querySelectorAll('.em-scorecard-page');

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

      pdf.save(`Glorious_School_Report_Cards_${classLabel || ''}${Date.now()}.pdf`);
      if (window.showToast) window.showToast('Report Cards PDF downloaded successfully!', 'success');
      return;
    } catch (err) {
      console.warn('html2canvas rendering fallback:', err);
    }
  }

  // Fallback to print dialog
  if (window.showToast) window.showToast('Opening print dialog. Select "Save as PDF" to export.', 'info');
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

  const classLabel = (fStd && fStd !== 'all') ? `Class_${fStd}_` : '';
  downloadEnglishPDF(targetStudents, fEx, classLabel);
  return;

  if (window.showToast) window.showToast('Compiling High-Resolution PDF Marksheets...', 'info');

  setTimeout(() => {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      let pageAdded = false;

      targetStudents.sort((a, b) => {
        if (a.std !== b.std) return parseInt(a.std) - parseInt(b.std);
        return a.roll - b.roll;
      }).forEach(stu => {
        let mks = DB.marks.filter(m => (m.std ? m.std.toString() === stu.std.toString() : true) && m.roll === stu.roll);
        if (fSub) {
          const cleanFSub = typeof cleanSubjectName === 'function' ? cleanSubjectName(fSub).toLowerCase() : fSub.toLowerCase();
          mks = mks.filter(m => (typeof cleanSubjectName === 'function' ? cleanSubjectName(m.subject).toLowerCase() : m.subject.toLowerCase()) === cleanFSub);
        }

        if (mks.length > 0) {
          addStudentScorecardToDoc(doc, stu.roll, !pageAdded, mks, fEx, fSub || 'All', stu.std);
          pageAdded = true;
        }
      });

      if (!pageAdded) {
        if (window.showToast) window.showToast('No examination marks found for selected criteria.', 'warning');
        return;
      }

      doc.save(`Glorious_School_Board_Marksheets_${classLabel}${Date.now()}.pdf`);
      if (window.showToast) window.showToast('Marksheet PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('PDF error:', err);
      if (window.showToast) window.showToast('Failed to generate PDF. Check console for details.', 'error');
    }
  }, 600);
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
window.formatGujaratiSection = formatGujaratiSection;
window.generateGujaratiReportCardHTML = generateGujaratiReportCardHTML;
window.printBulkReportCards = printBulkReportCards;
window.printSingleStudentGujarati = printSingleStudentGujarati;
window.downloadGujaratiPDF = downloadGujaratiPDF;
window.generateBulkPDF = generateBulkPDF;
window.generateBulkExcel = generateBulkExcel;
window.loadWhatsAppQueue = loadWhatsAppQueue;
window.loadCustomWhatsAppQueue = loadCustomWhatsAppQueue;
window.renderWaQueue = renderWaQueue;
window.sendNextWhatsApp = sendNextWhatsApp;
