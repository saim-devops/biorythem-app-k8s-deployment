const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Biorhythm cycle lengths (in days)
const CYCLES = {
  physical:     { period: 23, color: '#f97316', label: 'Physical',     emoji: '💪' },
  emotional:    { period: 28, color: '#a855f7', label: 'Emotional',    emoji: '💜' },
  intellectual: { period: 33, color: '#06b6d4', label: 'Intellectual', emoji: '🧠' },
  intuitive:    { period: 38, color: '#10b981', label: 'Intuitive',    emoji: '✨' },
};

// Calculate biorhythm value (-1 to 1) for a given day offset
function calcCycle(daysSinceBirth, period) {
  return Math.sin((2 * Math.PI * daysSinceBirth) / period);
}

// API: Get biorhythm data for a birthdate over a date range
app.get('/api/biorhythm', (req, res) => {
  const { birthdate, days = 60 } = req.query;

  if (!birthdate) {
    return res.status(400).json({ error: 'birthdate is required (YYYY-MM-DD)' });
  }

  const birth = new Date(birthdate);
  if (isNaN(birth.getTime())) {
    return res.status(400).json({ error: 'Invalid birthdate format. Use YYYY-MM-DD' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  birth.setHours(0, 0, 0, 0);

  const totalDays = parseInt(days, 10);
  const halfDays = Math.floor(totalDays / 2);

  // Generate data points: from (today - halfDays) to (today + halfDays)
  const dataPoints = [];
  for (let i = -halfDays; i <= halfDays; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const daysSinceBirth = Math.floor((date - birth) / (1000 * 60 * 60 * 24));

    const point = { date: date.toISOString().split('T')[0], offset: i };
    for (const [key, cycle] of Object.entries(CYCLES)) {
      point[key] = parseFloat(calcCycle(daysSinceBirth, cycle.period).toFixed(4));
    }
    dataPoints.push(point);
  }

  // Today's values and percentages
  const todayDays = Math.floor((today - birth) / (1000 * 60 * 60 * 24));
  const todayValues = {};
  for (const [key, cycle] of Object.entries(CYCLES)) {
    const val = calcCycle(todayDays, cycle.period);
    todayValues[key] = {
      raw: parseFloat(val.toFixed(4)),
      percent: Math.round((val + 1) * 50), // 0-100
      label: cycle.label,
      emoji: cycle.emoji,
      color: cycle.color,
    };
  }

  // Age in days
  const ageDays = todayDays;
  const ageYears = Math.floor(ageDays / 365.25);

  res.json({
    birthdate,
    ageDays,
    ageYears,
    today: today.toISOString().split('T')[0],
    todayValues,
    cycles: CYCLES,
    dataPoints,
  });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌊 Biorhythm Dashboard running at http://localhost:${PORT}\n`);
});
