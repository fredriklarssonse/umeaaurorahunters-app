import fetch from 'node-fetch';
import { saveData } from '../db/saveData.js';

/**
 * Hämta historik + senaste datapunkter från NOAA ACE
 * Markerar suspekta värden
 */
export async function fetchSolarWindHistory() {
  try {
    const magRes = await fetch('https://services.swpc.noaa.gov/json/ace/mag/ace_mag_1h.json');
    const magData = await magRes.json();

    const swepamRes = await fetch('https://services.swpc.noaa.gov/json/ace/swepam/ace_swepam_1h.json');
    const swepamData = await swepamRes.json();

    const batchData = [];

    for (let i = 0; i < magData.length; i++) {
      const mag = magData[i];
      const sweep = swepamData[i];

      const row = {
        time_tag: mag.time_tag,
        bx: mag.gsm_bx,
        by: mag.gsm_by,
        bz: mag.gsm_bz,
        bt: mag.bt,
        speed: sweep.speed,
        density: sweep.density,
        source_api: 'NOAA',
        suspect: false
      };

      // Markera suspekta värden
      if (
        row.speed < 100 || row.speed > 2000 ||
        row.density < 0 || row.density > 50 ||
        Math.abs(row.bt) > 100 ||
        Math.abs(row.bz) > 100
      ) {
        row.suspect = true;
      }

      batchData.push(row);
    }

    // Spara allt i batch
    await saveData('aurora_solar_wind', batchData, ['time_tag']);
    console.log('Solar wind history fetched and saved.');

    return batchData;
  } catch (err) {
    console.error('Error fetching NOAA solar wind data:', err);
    return [];
  }
}
