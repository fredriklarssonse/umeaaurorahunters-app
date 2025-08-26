import { createForecast } from '$lib/db/forecasts'
import { saveData } from '$lib/db/saveData'
import { fetchSolarWindNOAA, fetchKpIndexNOAA } from '$lib/api/noaa'

export async function GET() {
  try {
    const forecast_id = await createForecast('default')

    // Lista över datatyper vi vill hämta
    const tasks = [
      { fetchFn: fetchSolarWindNOAA, table: 'aurora_solar_wind', source: 'NOAA' },
      { fetchFn: fetchKpIndexNOAA, table: 'aurora_kp_index', source: 'NOAA' }
      // Lägg till DST och Hemispheric Power här
    ]

    for (const task of tasks) {
      const data = await task.fetchFn()
      await saveData(forecast_id, task.table, task.source, data)
    }

    return new Response(JSON.stringify({ success: true, forecast_id }), { status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 })
  }
}