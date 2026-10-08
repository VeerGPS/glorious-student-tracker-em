// Charts (Chart.js, loaded only when a page needs it).
// Colours are checked for colour-blind safety and contrast; every chart also
// has labels or a table so no value depends on colour alone.

let loading = null;

export function ensureCharts() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/chart.umd.min.js';
      s.onload = () => { setDefaults(window.Chart); resolve(window.Chart); };
      s.onerror = () => { loading = null; reject(new Error('Could not load the charts.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

function dark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function palette() {
  const d = dark();
  return {
    ink: d ? '#f5f5f4' : '#0f172a',
    muted: d ? '#c3c2b7' : '#52514e',
    grid: d ? '#2c2c2a' : '#e1e0d9',
    surface: d ? '#1a1a19' : '#fcfcfb',
    // Result bands: Distinction, First class, Pass, Below pass
    bands: d ? ['#0ca30c', '#3987e5', '#c98500', '#d03b3b'] : ['#0ca30c', '#2a78d6', '#c98500', '#d03b3b'],
    absent: '#898781',
    series1: d ? '#3987e5' : '#2a78d6',
    series2: d ? '#d95926' : '#eb6834',
    aqua: d ? '#199e70' : '#1baf7a',
    violet: d ? '#9085e9' : '#4a3aa7'
  };
}

export const BANDS = [
  { key: 'distinction', label: 'Distinction', range: '80% and above', min: 80 },
  { key: 'first', label: 'First class', range: '60-79%', min: 60 },
  { key: 'pass', label: 'Pass', range: '33-59%', min: 33 },
  { key: 'below', label: 'Below pass', range: 'under 33%', min: -Infinity }
];

export function bandIndex(pct) {
  return BANDS.findIndex(b => pct >= b.min);
}

function setDefaults(Chart) {
  const p = palette();
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = p.muted;
  Chart.defaults.borderColor = p.grid;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.92)';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation.duration = 400;
}

// Writes each bar's value at its tip (skips empty bars).
export const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart, args, opts) {
    const { ctx } = chart;
    const p = palette();
    ctx.save();
    ctx.font = `600 11px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.fillStyle = p.ink;
    ctx.textAlign = 'center';
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((bar, j) => {
        const v = ds.data[j];
        if (v === null || v === undefined) return;
        const text = `${Math.round(v * 10) / 10}${opts && opts.suffix !== undefined ? opts.suffix : '%'}`;
        ctx.fillText(text, bar.x, bar.y - 6);
      });
    });
    ctx.restore();
  }
};

export function makeChart(canvas, config) {
  if (!canvas || !window.Chart || !canvas.isConnected) return null;
  // Pages are redrawn often; free charts whose canvas has left the page.
  Object.values(window.Chart.instances).forEach(c => { if (!c.canvas || !c.canvas.isConnected) c.destroy(); });
  const existing = window.Chart.getChart(canvas);
  if (existing) existing.destroy();
  return new window.Chart(canvas, config);
}

export function percentAxis(p) {
  return {
    min: 0,
    max: 100,
    grid: { color: p.grid },
    border: { display: false },
    ticks: { stepSize: 25, callback: v => `${v}%` }
  };
}
