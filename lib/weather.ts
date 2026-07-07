/**
 * Current-conditions weather (air temperature + UV index) from
 * Open-Meteo. No API key required, no signup, fair-use free tier.
 *
 * The response is cached by Next's Data Cache for 10 minutes, so a
 * busy site only hits Open-Meteo ~6 times per hour even with hundreds
 * of residents on the page.
 */
import "server-only";
import { POOL_LAT, POOL_LON } from "./config";

export interface WeatherSnapshot {
  airTempF: number;
  uvIndex: number;
}

const FALLBACK: WeatherSnapshot = { airTempF: 84, uvIndex: 7 };
const REVALIDATE_SECONDS = 600;

export async function getWeather(): Promise<WeatherSnapshot> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(POOL_LAT));
    url.searchParams.set("longitude", String(POOL_LON));
    url.searchParams.set("current", "temperature_2m,uv_index");
    url.searchParams.set("temperature_unit", "fahrenheit");

    const res = await fetch(url.toString(), {
      next: { revalidate: REVALIDATE_SECONDS },
      // Tighter timeout than the platform default keeps a hung weather
      // request from blocking the rest of the snapshot.
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; uv_index?: number };
    };
    const tempRaw = json.current?.temperature_2m;
    const uvRaw = json.current?.uv_index;
    if (typeof tempRaw !== "number" || typeof uvRaw !== "number") {
      throw new Error("Unexpected Open-Meteo response shape");
    }
    return {
      airTempF: Math.round(tempRaw),
      uvIndex: Math.max(0, Math.round(uvRaw)),
    };
  } catch (err) {
    console.warn(
      "[weather] falling back to defaults:",
      (err as Error).message,
    );
    return FALLBACK;
  }
}
