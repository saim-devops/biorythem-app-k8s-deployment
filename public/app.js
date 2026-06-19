/* ===== app.js — Biorhythm Dashboard ===== */

const CYCLES = {
  physical:     { period: 23, color: '#f97316', label: 'Physical',     emoji: '💪' },
  emotional:    { period: 28, color: '#a855f7', label: 'Emotional',    emoji: '💜' },
  intellectual: { period: 33, color: '#06b6d4', label: 'Intellectual', emoji: '🧠' },
  intuitive:    { period: 38, color: '#10b981', label: 'Intuitive',    emoji: '✨' },
};

// ---- DOM refs ----
const birthdateInput = document.getElementById('birthdate-input');
const analyzeBtn     = document.getElementById('analyze-btn');
const loading        = document.getElementById('loading');
const resultsEl      = document.getElementById('results');
const ageBanner      = document.getElementById('age-banner');
const statsGrid      = document.getElementById('stats-grid');
const canvas         = document.getElementById('biorhythm-canvas');
const ctx            = canvas.getContext('2d');
const legendEl       = document.getElementById('chart-legend');
const insightBody    = document.getElementById('insight-body');
const resetBtn       = document.getElementById('reset-btn');
const dayBtns        = document.querySelectorAll('.day-btn');

// Limit date to today
const todayStr = new Date().toISOString().split('T')[0];
birthdateInput.setAttribute('max', todayStr);

// Restore last birthdate
const saved = localStorage.getItem('biorythm_birthdate');
if (saved) birthdateInput.value = saved;

// ---- State ----
let currentData   = null;
let currentDays   = 30;
let animFrame     = null;
let animProgress  = 0;
let animStart     = null;

// ---- Helpers ----
function calcCycle(daysSinceBirth, period) {
  return Math.sin((2 * Math.PI * daysSinceBirth) / period);
}

function daysSince(birth) {
  const now = new Date(); now.setHours(0,0,0,0);
  birth = new Date(birth); birth.setHours(0,0,0,0);
  return Math.floor((now - birth) / 86400000);
}

function levelTag(pct) {
  if (pct >= 80) return { text: 'Peak',      bg: 'rgba(16,185,129,0.15)',  color: '#34d399' };
  if (pct >= 60) return { text: 'High',       bg: 'rgba(99,102,241,0.15)',  color: '#818cf8' };
  if (pct >= 40) return { text: 'Neutral',    bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' };
  if (pct >= 20) return { text: 'Low',        bg: 'rgba(249,115,22,0.15)',  color: '#fb923c' };
  return          { text: 'Critical',         bg: 'rgba(239,68,68,0.15)',   color: '#f87171' };
}

function insightText(key, pct) {
  const phrases = {
    physical: {
      high: "Your body is primed — great day for exercise, sports, or demanding physical tasks.",
      mid:  "Moderate physical energy. Steady, consistent effort will serve you well today.",
      low:  "Physical reserves are lower. Prioritize rest, gentle movement, and recovery.",
    },
    emotional: {
      high: "Emotionally vibrant — social interactions, creative work, and relationships will flourish.",
      mid:  "Balanced emotional state. Good for collaborative, day-to-day engagement.",
      low:  "Emotional sensitivity is heightened. Give yourself grace and avoid high-stress situations.",
    },
    intellectual: {
      high: "Your mind is sharp! Tackle complex problems, study, writing, or strategy today.",
      mid:  "Solid mental focus. Routine cognitive tasks and learning are well-supported.",
      low:  "Mental bandwidth is reduced. Keep tasks simple and take more breaks.",
    },
    intuitive: {
      high: "Intuition is flowing. Trust your gut — insights, decisions, and creativity will spark.",
      mid:  "Intuitive senses are stable. Reflection and planning will feel grounded.",
      low:  "Intuition may feel foggy. Rely on data and trusted routines over hunches.",
    },
  };
  const set = phrases[key];
  if (pct >= 60) return set.high;
  if (pct >= 35) return set.mid;
  return set.low;
}

// ---- Fetch & render ----
async function analyze() {
  const bd = birthdateInput.value;
  if (!bd) { birthdateInput.focus(); birthdateInput.style.borderColor = '#f97316'; return; }
  birthdateInput.style.borderColor = '';

  localStorage.setItem('biorythm_birthdate', bd);

  // Show loading
  loading.classList.add('visible');
  resultsEl.hidden = true;

  try {
    const res  = await fetch(`/api/biorhythm?birthdate=${bd}&days=${currentDays}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    currentData = data;
    renderResults(data);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    loading.classList.remove('visible');
  }
}

function renderResults(data) {
  // Age banner
  const age = data.ageYears;
  ageBanner.innerHTML = `You have lived <strong>${data.ageDays.toLocaleString()} days</strong> — that's <strong>${age} year${age !== 1 ? 's' : ''}</strong> of beautiful cycles. Today: <strong>${data.today}</strong>`;

  // Stat cards
  statsGrid.innerHTML = '';
  Object.entries(data.todayValues).forEach(([key, val], i) => {
    const tag = levelTag(val.percent);
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.style.setProperty('--cycle-color', val.color);
    card.style.animationDelay = `${i * 0.08}s`;
    card.innerHTML = `
      <div class="stat-emoji">${val.emoji}</div>
      <div class="stat-label">${val.label}</div>
      <div class="stat-percent" style="color:${val.color}">${val.percent}<span style="font-size:1rem;opacity:0.6">%</span></div>
      <div class="stat-bar"><div class="stat-bar-fill" style="background:${val.color}" data-target="${val.percent}"></div></div>
      <span class="stat-tag" style="background:${tag.bg};color:${tag.color}">${tag.text}</span>
    `;
    statsGrid.appendChild(card);
  });

  // Animate bars after paint
  requestAnimationFrame(() => {
    document.querySelectorAll('.stat-bar-fill').forEach(el => {
      el.style.width = el.dataset.target + '%';
    });
  });

  // Chart
  drawChart(data, currentDays);

  // Legend
  buildLegend();

  // Insights
  buildInsights(data.todayValues);

  // Show results
  resultsEl.hidden = false;
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Chart ----
function buildLegend() {
  legendEl.innerHTML = '';
  Object.values(CYCLES).forEach(c => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-line" style="background:${c.color}"></div>${c.emoji} ${c.label}`;
    legendEl.appendChild(item);
  });
  // Today marker
  const todayItem = document.createElement('div');
  todayItem.className = 'legend-item';
  todayItem.innerHTML = `<div class="legend-dot" style="background:#fff;border:2px solid rgba(255,255,255,0.4)"></div>Today`;
  legendEl.appendChild(todayItem);
}

function drawChart(data, days) {
  const dpr    = window.devicePixelRatio || 1;
  const W_CSS  = canvas.parentElement.clientWidth;
  const H_CSS  = Math.min(300, W_CSS * 0.45);

  canvas.width  = W_CSS * dpr;
  canvas.height = H_CSS * dpr;
  canvas.style.height = H_CSS + 'px';
  ctx.scale(dpr, dpr);

  const W = W_CSS;
  const H = H_CSS;
  const PAD = { top: 20, right: 20, bottom: 36, left: 44 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  const points  = data.dataPoints;
  const total   = points.length;
  const todayIdx = points.findIndex(p => p.offset === 0);

  if (animFrame) cancelAnimationFrame(animFrame);
  animStart = null;
  animProgress = 0;

  function draw(ts) {
    if (!animStart) animStart = ts;
    const elapsed = ts - animStart;
    animProgress = Math.min(elapsed / 900, 1);
    const ease = 1 - Math.pow(1 - animProgress, 3); // cubic ease-out

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    // Horizontal grid lines at -1, -0.5, 0, 0.5, 1
    [-1, -0.5, 0, 0.5, 1].forEach(v => {
      const y = PAD.top + plotH * (1 - (v + 1) / 2);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();

    // Y axis labels
    ctx.save();
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.textAlign = 'right';
    [['100%', 1], ['50%', 0], ['0%', -1]].forEach(([label, v]) => {
      const y = PAD.top + plotH * (1 - (v + 1) / 2);
      ctx.fillText(label, PAD.left - 8, y + 4);
    });
    ctx.restore();

    // Zero line (more prominent)
    const zeroY = PAD.top + plotH / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, zeroY);
    ctx.lineTo(PAD.left + plotW, zeroY);
    ctx.stroke();
    ctx.restore();

    // Today shaded region
    if (todayIdx >= 0) {
      const tx = PAD.left + (todayIdx / (total - 1)) * plotW;
      ctx.save();
      const grad = ctx.createLinearGradient(tx - 18, 0, tx + 18, 0);
      grad.addColorStop(0, 'rgba(168,85,247,0)');
      grad.addColorStop(0.5, 'rgba(168,85,247,0.08)');
      grad.addColorStop(1, 'rgba(168,85,247,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(tx - 18, PAD.top, 36, plotH);
      ctx.restore();
    }

    // Draw each cycle wave (clipped to progress)
    const drawUpTo = Math.floor(total * ease);
    Object.keys(CYCLES).forEach(key => {
      const c = CYCLES[key];
      ctx.save();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap  = 'round';
      ctx.shadowColor  = c.color;
      ctx.shadowBlur   = 8;

      ctx.beginPath();
      for (let i = 0; i <= drawUpTo && i < total; i++) {
        const x = PAD.left + (i / (total - 1)) * plotW;
        const y = PAD.top  + plotH * (1 - (points[i][key] + 1) / 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Dot at today
      if (todayIdx >= 0 && todayIdx <= drawUpTo) {
        const tx = PAD.left + (todayIdx / (total - 1)) * plotW;
        const ty = PAD.top  + plotH * (1 - (points[todayIdx][key] + 1) / 2);
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();
        ctx.strokeStyle = '#080b14';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    });

    // Today vertical line
    if (todayIdx >= 0) {
      const tx = PAD.left + (todayIdx / (total - 1)) * plotW;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(tx, PAD.top);
      ctx.lineTo(tx, PAD.top + plotH);
      ctx.stroke();
      // "Today" label
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Today', tx, PAD.top + plotH + 20);
      ctx.restore();
    }

    // X axis date labels (start, today-ish, end)
    const labelIdxs = [0, Math.floor(total / 2), total - 1];
    ctx.save();
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    ctx.textAlign = 'center';
    labelIdxs.forEach(i => {
      if (i >= total) return;
      const x = PAD.left + (i / (total - 1)) * plotW;
      const label = points[i].date.slice(5); // MM-DD
      ctx.fillText(label, x, H - 8);
    });
    ctx.restore();

    if (animProgress < 1) {
      animFrame = requestAnimationFrame(draw);
    }
  }

  animFrame = requestAnimationFrame(draw);
}

// ---- Insights ----
function buildInsights(todayValues) {
  insightBody.innerHTML = '';
  Object.entries(todayValues).forEach(([key, val]) => {
    const row = document.createElement('div');
    row.className = 'insight-row';
    const text = insightText(key, val.percent);
    row.innerHTML = `
      <div class="insight-icon">${val.emoji}</div>
      <div class="insight-text"><strong>${val.label} (${val.percent}%)</strong> — ${text}</div>
    `;
    insightBody.appendChild(row);
  });
}

// ---- Day range buttons ----
dayBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    dayBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDays = parseInt(btn.dataset.days, 10);
    if (birthdateInput.value) analyze();
  });
});

// ---- Analyze button ----
analyzeBtn.addEventListener('click', analyze);
birthdateInput.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(); });

// ---- Reset ----
resetBtn.addEventListener('click', () => {
  resultsEl.hidden = true;
  document.getElementById('input-section').scrollIntoView({ behavior: 'smooth' });
});

// ---- Redraw on resize ----
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentData) drawChart(currentData, currentDays);
  }, 200);
});

// ---- Auto-analyze if saved date ----
if (saved) {
  setTimeout(analyze, 200);
}
