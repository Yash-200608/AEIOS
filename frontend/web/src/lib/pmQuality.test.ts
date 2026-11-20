import { describe, expect, it } from 'vitest';
import { aqiBasis, checkPm, localAqi, usAqiCategory, usAqiPm10, usAqiPm25 } from './pmQuality';

const NOW = Date.parse('2026-11-19T07:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const pkt = (node: string, minAgo: number, pm1: number, pm2_5: number, pm10: number) => ({ node, rx_utc: at(minAgo), pm1, pm2_5, pm10 });

describe('checkPm: one packet', () => {
  it('rejects the firmware "no PMS frame" marker (-1) and missing columns', () => {
    expect(checkPm({ pm1: -1, pm2_5: -1, pm10: -1 })).toEqual({ ok: false, reason: 'no-frame' });
    expect(checkPm({ pm1: 5, pm2_5: null, pm10: 9 })).toEqual({ ok: false, reason: 'no-frame' });
    expect(checkPm(undefined)).toEqual({ ok: false, reason: 'no-frame' });
  });
  it('rejects values beyond the sensor range', () => {
    expect(checkPm({ pm1: 10, pm2_5: 1200, pm10: 1300 })).toEqual({ ok: false, reason: 'out-of-range' });
  });
  it('rejects PM2.5 above PM10 (and PM1 above PM2.5) beyond rounding', () => {
    expect(checkPm({ pm1: 5, pm2_5: 40, pm10: 20 })).toEqual({ ok: false, reason: 'inconsistent' });
    expect(checkPm({ pm1: 30, pm2_5: 20, pm10: 25 })).toEqual({ ok: false, reason: 'inconsistent' });
    // whole-number rounding can put PM2.5 one or two above PM10 on a working sensor
    expect(checkPm({ pm1: 14, pm2_5: 16, pm10: 15 }).ok).toBe(true);
  });
  it('keeps a real zero and a normal reading', () => {
    expect(checkPm({ pm1: 0, pm2_5: 0, pm10: 0 })).toEqual({ ok: true, pm1: 0, pm25: 0, pm10: 0 });
    expect(checkPm({ pm1: '10', pm2_5: '15', pm10: '18' })).toEqual({ ok: true, pm1: 10, pm25: 15, pm10: 18 });
  });
});

describe('US AQI breakpoints (EPA 2024)', () => {
  it('maps PM2.5 at the band edges', () => {
    expect(usAqiPm25(0)).toBe(0);
    expect(usAqiPm25(9.0)).toBe(50);
    expect(usAqiPm25(9.05)).toBe(50); // truncated to 9.0, never falls in the gap
    expect(usAqiPm25(15)).toBe(62);
    expect(usAqiPm25(35.4)).toBe(100);
    expect(usAqiPm25(55.5)).toBe(151);
    expect(usAqiPm25(400)).toBe(500);
  });
  it('maps PM10 and names categories', () => {
    expect(usAqiPm10(54)).toBe(50);
    expect(usAqiPm10(154.9)).toBe(100);
    expect(usAqiCategory(62)).toBe('Moderate');
    expect(usAqiCategory(320)).toBe('Hazardous');
  });
});

describe('localAqi: the last hour of one node', () => {
  it('gives no AQI for a node whose sensor sends no frames (Chandu N1 since 14 Nov)', () => {
    const ps = [0, 5, 10, 15, 20].map((m) => pkt('N1', m, -1, -1, -1));
    const a = localAqi(ps, 'N1', NOW);
    expect(a.aqi).toBeNull();
    expect(a.reason).toBe('too-few-valid');
    expect(a.rejected['no-frame']).toBe(5);
    expect(aqiBasis(a)).toContain('rejected 5 no sensor data');
  });
  it('uses the median of valid readings and ignores rejected ones', () => {
    const ps = [pkt('N2', 0, 10, 14, 16), pkt('N2', 5, 11, 15, 18), pkt('N2', 10, 12, 16, 19), pkt('N2', 15, -1, -1, -1), pkt('N2', 20, 5, 60, 30)];
    const a = localAqi(ps, 'N2', NOW);
    expect(a.pm25).toBe(15);
    expect(a.aqi).toBe(62);
    expect(a.category).toBe('Moderate');
    expect(a.dominant).toBe('PM2.5');
    expect(a.used).toBe(3);
    expect(a.rejected).toEqual({ 'no-frame': 1, 'out-of-range': 0, inconsistent: 1, spike: 0 });
  });
  it('drops a one-off spike but keeps a genuine shared rise', () => {
    const steady = [0, 5, 10, 15, 20].map((m) => pkt('N2', m, 8, 12, 15));
    const spiked = localAqi([...steady, pkt('N2', 25, 300, 600, 650)], 'N2', NOW);
    expect(spiked.rejected.spike).toBe(1);
    expect(spiked.pm25).toBe(12);
    const rising = [0, 5, 10, 15, 20].map((m, i) => pkt('N2', m, 40 + i * 10, 60 + i * 15, 80 + i * 15));
    expect(localAqi(rising, 'N2', NOW).rejected.spike).toBe(0);
  });
  it('keeps the last AQI of a silent node, marked not current, from the hour before its last packet', () => {
    const lastHour = 14 * 60; // node went quiet 14 h ago
    const ps = [0, 5, 10, 15, 70].map((m) => pkt('N2', lastHour + m, 10, 15, 18));
    const a = localAqi(ps, 'N2', NOW);
    expect(a.aqi).toBe(62);
    expect(a.current).toBe(false);
    expect(a.asOf).toBe(at(lastHour));
    expect(a.used).toBe(4); // the packet 70 min before the last one is outside the window
    expect(aqiBasis(a)).toContain('the 60 min before its last packet');
    const live = localAqi([0, 5, 10].map((m) => pkt('N2', m, 10, 15, 18)), 'N2', NOW);
    expect(live.current).toBe(true);
    expect(aqiBasis(live)).toContain('the last 60 min');
  });
  it('only counts this node and the last hour', () => {
    const ps = [pkt('N2', 0, 10, 14, 16), pkt('N2', 5, 10, 14, 16), pkt('N2', 90, 10, 14, 16), pkt('N1', 0, 10, 14, 16)];
    const a = localAqi(ps, 'N2', NOW);
    expect(a.total).toBe(2);
    expect(a.aqi).toBeNull(); // 2 valid < 3 required
    expect(localAqi([], 'N2', NOW).reason).toBe('no-packets');
  });
});
