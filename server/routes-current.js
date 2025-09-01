// server/routes-current.js
import express from 'express';
import { query } from './db.js'; // via shim

export const router = express.Router();

/**
 * Exempel-endpoint: returnera “nuvarande” geomagnetisk status
 * (justera SQL efter din verkliga tabell/kolumn)
 */
router.get('/api/current', async (req, res) => {
  try {
    const { rows } = await query(
      `select *
       from aurora_geomagnetic_now
       order by observed_at desc
       limit 1`
    );
    res.json(rows[0] ?? {});
  } catch (err) {
    console.error('[current] DB error', err);
    res.status(500).json({ error: 'api.error.internal', details: { message: err.message } });
  }
});
