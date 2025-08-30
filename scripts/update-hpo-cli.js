// scripts/update-hpo-cli.js
import { updateHpoForecastHourly } from '../src/lib/db/update-hpo-forecast.js';

(async () => {
  try {
    const r = await updateHpoForecastHourly();
    console.log('OK:', r);
  } catch (e) {
    console.error('ERR:', {
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
      status: e?.status,
      name: e?.name
    });
    process.exit(1);
  }
})();
