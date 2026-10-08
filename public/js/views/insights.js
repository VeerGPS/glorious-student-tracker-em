import { html, openDialog, closeDialog, busy, toast, icon, fmtDate, downloadBlob } from '../ui.js';
import { api, fetchFile } from '../data.js';
import { ensureCharts, makeChart, palette, percentAxis } from '../charts.js';

const TIERS = {
  exceptional: { cls: 'tier-good', emoji: '🏆' },
  steady: { cls: 'tier-info', emoji: '📈' },
  intervention: { cls: 'tier-warn', emoji: '⚠️' },
  critical: { cls: 'tier-bad', emoji: '🚨' },
  none: { cls: 'tier-info', emoji: 'ℹ️' }
};

function body(ins) {
  const r = ins.report;
  const st = ins.student;
  const tier = TIERS[ins.tier] || TIERS.none;
  return html`
    <div class="row between">
      <div>
        <h3 class="ins-name">${st.name}</h3>
        <div class="muted small">Class ${st.std}-${st.section} · Roll ${st.roll}${st.grNo ? ` · GR ${st.grNo}` : ''}</div>
      </div>
    </div>
    <div class="tier-box ${tier.cls}">
      <div class="tier-emoji" aria-hidden="true">${tier.emoji}</div>
      <div><strong>${ins.headline}</strong><p>${ins.message}</p></div>
    </div>
    <div class="ins-stats">
      <div><span>Overall</span><strong>${r.total.pct === null ? '-' : `${r.total.pct}%`}</strong><small>Grade ${r.total.grade}</small></div>
      <div><span>Class rank</span><strong>${r.rank ? r.rank.rank : '-'}</strong><small>${r.rank ? `of ${r.rank.of}` : 'not ranked'}</small></div>
      <div><span>Best subject</span><strong>${ins.topSubject ? ins.topSubject.subject : '-'}</strong><small>${ins.topSubject ? `${ins.topSubject.pct}%` : ''}</small></div>
      <div><span>Needs focus</span><strong>${ins.focusSubject ? ins.focusSubject.subject : '-'}</strong><small>${ins.focusSubject ? `${ins.focusSubject.pct}%` : ''}</small></div>
      <div><span>Attendance</span><strong>${r.attendance ? `${r.attendance.pct}%` : '-'}</strong><small>${r.attendance ? `${r.attendance.present}/${r.attendance.total} days` : 'not recorded'}</small></div>
    </div>
    ${r.rows.length ? html`<div class="chart-grid two">
      <div class="chart-card">
        <h4>Subject strength</h4>
        <div class="chart-box"><canvas id="ins-radar" role="img" aria-label="Percentage in each subject: ${r.subjects.map(s => `${s.subject} ${s.pct}%`).join(', ')}"></canvas></div>
      </div>
      <div class="chart-card">
        <h4>Test by test, compared with the class</h4>
        <div class="chart-box"><canvas id="ins-trend" role="img" aria-label="${ins.timeline.map(t => `${t.name}: ${t.pct}% (class ${t.classAvg}%)`).join(', ')}"></canvas></div>
      </div>
    </div>` : ''}
    <div class="grid-2 mt">
      <div class="list-card good">
        <h4>Strengths</h4>
        ${ins.strengths.length ? html`<ul>${ins.strengths.map(s => html`<li>✓ ${s.subject}: ${s.pct}%</li>`)}</ul>` : html`<p class="muted small">No subject at 75% or above yet.</p>`}
      </div>
      <div class="list-card warn">
        <h4>Needs attention</h4>
        ${ins.weaknesses.length ? html`<ul>${ins.weaknesses.map(s => html`<li>! ${s.subject}: ${s.pct}%</li>`)}</ul>` : html`<p class="muted small">No subject below 50%.</p>`}
      </div>
    </div>
    ${ins.notes.length ? html`<ul class="ins-notes">${ins.notes.map(n => html`<li class="${n.kind}">${n.kind === 'up' ? '▲' : n.kind === 'down' ? '▼' : '●'} ${n.text}</li>`)}</ul>` : ''}
    <div class="form-actions">
      <button class="btn" data-act="ins-pdf">${icon('file')} Report card (PDF)</button>
      <a class="btn wa" href="#/send?kind=report&std=${st.std}&section=${st.section}&student=${st.id}" data-act="ins-send">${icon('chat')} Send to parent</a>
    </div>`;
}

async function drawCharts(ins) {
  if (!ins.report.rows.length) return;
  await ensureCharts();
  const p = palette();
  const subjects = ins.report.subjects;
  makeChart(document.getElementById('ins-radar'), {
    type: subjects.length >= 3 ? 'radar' : 'bar',
    data: {
      labels: subjects.map(s => s.subject),
      datasets: [{
        label: 'Percentage',
        data: subjects.map(s => (s.allAbsent ? 0 : s.pct)),
        backgroundColor: subjects.length >= 3 ? `${p.violet}26` : p.violet,
        borderColor: p.violet,
        borderWidth: 2,
        pointBackgroundColor: p.violet,
        pointBorderColor: p.surface,
        pointBorderWidth: 2,
        pointRadius: 4,
        maxBarThickness: 24,
        borderRadius: 4
      }]
    },
    options: subjects.length >= 3 ? {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw}%` } } },
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent', callback: v => `${v}%` }, grid: { color: p.grid }, angleLines: { color: p.grid }, pointLabels: { color: p.ink, font: { size: 12, weight: '600' } } } }
    } : {
      plugins: { legend: { display: false } },
      scales: { y: percentAxis(p), x: { grid: { display: false } } }
    }
  });
  const tl = ins.timeline;
  makeChart(document.getElementById('ins-trend'), {
    type: 'line',
    data: {
      labels: tl.map(t => t.name),
      datasets: [
        { label: 'This student', data: tl.map(t => t.pct), borderColor: p.series1, backgroundColor: p.series1, borderWidth: 2, pointRadius: 4, pointBorderColor: p.surface, pointBorderWidth: 2, tension: 0.25 },
        { label: 'Class average', data: tl.map(t => t.classAvg), borderColor: p.series2, backgroundColor: p.series2, borderWidth: 2, pointRadius: 4, pointBorderColor: p.surface, pointBorderWidth: 2, tension: 0.25 }
      ]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { title: items => `${items[0].label} (${fmtDate(tl[items[0].dataIndex].date)})`, label: c => ` ${c.dataset.label}: ${c.raw}%` } }
      },
      scales: { y: percentAxis(p), x: { grid: { display: false } } }
    }
  });
}

export async function openInsights(studentId) {
  let ins;
  try {
    ins = await api('GET', `/students/${studentId}/insights`);
  } catch (err) {
    toast(err.message, 'bad');
    return;
  }
  openDialog({
    title: 'AI Insights',
    body: body(ins),
    wide: true,
    handlers: {
      'ins-pdf': el => busy(el, async () => {
        const { blob, fileName } = await fetchFile(`/report-cards.pdf?students=${ins.student.id}&tests=all`);
        downloadBlob(blob, fileName);
      }, 'Preparing...'),
      'ins-send': el => { closeDialog(); location.hash = el.getAttribute('href'); }
    }
  });
  drawCharts(ins).catch(err => toast(err.message, 'bad'));
}
