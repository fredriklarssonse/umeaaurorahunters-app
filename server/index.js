// server/index.js
import express from 'express';
import cors from 'cors';

// Start Express
const app = express();
app.use(cors());
app.use(express.json());

// Root – liten översikt så vi vet att servern lever
app.get('/', (req, res) => {
  res.json({
    ok: true,
    routes: [
      'GET /api/evening?location=Umeå',
      'GET /api/evening?lat=63.8258&lon=20.263',
    ],
  });
});

// --- Mounta våra API-routes ---
import eveningRouter from './routes-evening.js';
app.use('/api/evening', eveningRouter);

// (valfritt) behåll dina andra routes om du har dem
// import currentRouter from './routes-forecast-current.js';
// app.use('/api/forecast/current', currentRouter);

// import hourlyRouter from './routes-forecast-hourly.js';
// app.use('/api/forecast/hourly', hourlyRouter);

// Starta
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
