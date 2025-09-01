// server/index.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { eveningRouter } from './routes-evening.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', eveningRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[aurora-api] listening on http://localhost:${PORT}`);
});
