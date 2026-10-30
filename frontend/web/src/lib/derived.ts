// Dispersion diagnostics derived from model fields. These describe how well the air can carry pollution away;
// they are calculations on forecast data, not measurements.

type Hourly = Record<string, Array<string | number | null> | undefined>;

// IMD treats a ventilation index below 6,000 m²/s, with mean wind under 10 km/h, as unfavourable for dispersion.
export const VENTILATION_POOR = 6000;
export const CALM_WIND_KMH = 10;

const WIND_HEIGHTS = ['wind_speed_10m', 'wind_speed_80m', 'wind_speed_120m', 'wind_speed_180m'];

function at(h: Hourly, key: string, i: number): number | null {
  const v = h[key]?.[i];
  return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
}

/** Mean wind (m/s) over the model heights inside the lowest ~180 m. Requires wind_speed_unit=ms. */
export function meanLowWind(h: Hourly, i: number): number | null {
  const vals = WIND_HEIGHTS.map((k) => at(h, k, i)).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Ventilation coefficient (m²/s) = boundary-layer (mixing) height × mean wind in the lowest layer. */
export function ventilation(h: Hourly, i: number): number | null {
  const blh = at(h, 'boundary_layer_height', i);
  const wind = meanLowWind(h, i);
  return blh === null || wind === null ? null : blh * wind;
}

/** Near-surface inversion strength: temperature at 180 m minus 2 m (°C). Positive = warm lid, smoke stays near the ground. */
export function inversion(h: Hourly, i: number): number | null {
  const t180 = at(h, 'temperature_180m', i);
  const t2 = at(h, 'temperature_2m', i);
  return t180 === null || t2 === null ? null : t180 - t2;
}

export type Dispersion = { label: string; tone: 'good' | 'fair' | 'poor'; detail: string };

export function dispersionClass(vc: number | null, windMs: number | null, inv: number | null): Dispersion {
  if (vc === null) return { label: 'Unknown', tone: 'fair', detail: 'Model fields unavailable' };
  const calm = windMs !== null && windMs * 3.6 < CALM_WIND_KMH;
  if (vc < VENTILATION_POOR && calm) {
    return { label: 'Unfavourable', tone: 'poor', detail: inv !== null && inv > 0 ? 'Low mixing, calm wind and an inversion lid' : 'Low mixing and calm wind' };
  }
  if (vc < VENTILATION_POOR || (inv !== null && inv > 0)) {
    return { label: 'Limited', tone: 'fair', detail: vc < VENTILATION_POOR ? 'Shallow mixing layer' : 'Inversion near the surface' };
  }
  return { label: 'Favourable', tone: 'good', detail: 'Deep mixing carries pollution away' };
}
