const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;


// Sidecar logging
const LOG_PATH = '/var/log/app/app.log';

function writeLog(message) {
  try {
    fs.appendFileSync(
      LOG_PATH,
      `${new Date().toISOString()} ${message}\n`
    );
  } catch (err) {
    console.log("Log file not available:", err.message);
  }
}


app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// Request logging for sidecar
app.use((req, res, next) => {

  writeLog(`${req.method} ${req.url}`);

  next();

});


// Prometheus metrics
const client = require('prom-client');

const register = new client.Registry();

client.collectDefaultMetrics({
  register
});


// Biorhythm cycle lengths
const CYCLES = {
  physical:     { period: 23, color: '#2d2a29ff', label: 'Physical',     emoji: '💪' },
  emotional:    { period: 28, color: '#a855f7', label: 'Emotional',      emoji: '💜' },
  intellectual: { period: 33, color: '#06b6d4', label: 'Intellectual',  emoji: '🧠' },
  intuitive:    { period: 38, color: '#10b981', label: 'Intuitive',     emoji: '✨' },
};


// Calculate cycle
function calcCycle(daysSinceBirth, period) {

  return Math.sin(
    (2 * Math.PI * daysSinceBirth) / period
  );

}


// Prometheus endpoint
app.get('/metrics', async (req, res) => {

  writeLog("GET /metrics");

  res.set(
    'Content-Type',
    register.contentType
  );

  res.end(
    await register.metrics()
  );

});


// Biorhythm API
app.get('/api/biorhythm', (req, res) => {


  const { birthdate, days = 60 } = req.query;


  writeLog(
    `GET /api/biorhythm birthdate=${birthdate}`
  );


  if (!birthdate) {

    return res.status(400).json({
      error: 'birthdate is required (YYYY-MM-DD)'
    });

  }


  const birth = new Date(birthdate);


  if (isNaN(birth.getTime())) {

    return res.status(400).json({
      error: 'Invalid birthdate format. Use YYYY-MM-DD'
    });

  }


  const today = new Date();

  today.setHours(0,0,0,0);
  birth.setHours(0,0,0,0);



  const totalDays = parseInt(days,10);

  const halfDays =
    Math.floor(totalDays / 2);



  const dataPoints = [];



  for (let i = -halfDays; i <= halfDays; i++) {


    const date = new Date(today);

    date.setDate(
      date.getDate() + i
    );


    const daysSinceBirth =
      Math.floor(
        (date - birth) /
        (1000*60*60*24)
      );


    const point = {

      date:
        date.toISOString()
        .split('T')[0],

      offset: i

    };



    for (
      const [key, cycle]
      of Object.entries(CYCLES)
    ) {

      point[key] =
        parseFloat(
          calcCycle(
            daysSinceBirth,
            cycle.period
          )
          .toFixed(4)
        );

    }


    dataPoints.push(point);

  }



  const todayDays =
    Math.floor(
      (today - birth) /
      (1000*60*60*24)
    );



  const todayValues = {};



  for (
    const [key, cycle]
    of Object.entries(CYCLES)
  ) {


    const val =
      calcCycle(
        todayDays,
        cycle.period
      );



    todayValues[key] = {

      raw:
        parseFloat(
          val.toFixed(4)
        ),

      percent:
        Math.round(
          (val + 1) * 50
        ),

      label: cycle.label,

      emoji: cycle.emoji,

      color: cycle.color

    };

  }



  const ageDays = todayDays;


  const ageYears =
    Math.floor(
      ageDays / 365.25
    );



  res.json({

    birthdate,

    ageDays,

    ageYears,

    today:
      today.toISOString()
      .split('T')[0],

    todayValues,

    cycles: CYCLES,

    dataPoints

  });


});



// SPA fallback
app.get('*', (req,res)=>{


  writeLog(
    `${req.method} ${req.url}`
  );


  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );


});



// Start server
app.listen(PORT,()=>{


  const message =
    `🌊 Biorhythm Dashboard running at http://localhost:${PORT}`;


  console.log(message);


  writeLog(message);


});