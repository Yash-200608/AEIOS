// Run with: npm test   (node --test, no dependencies). Excluded from `tsc -b`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertOutcome, aqiCategory, inversionHours, gaugePosition, mixingLayer, profileDomain, flowDuration, ribbonCells, ventilationWindows, situationStatement, assessmentLimits, dispersionEvidence, feedStatus, healthRows, observationHeadline, observationState,
  outlookSummary, packetValues, particulate, verdictView, type AlertRow,
} from './model.ts';

const ago = (iso?: string | null) => (iso ? `AGO(${iso})` : 'never');
const NOW = Date.parse('2026-10-31T12:00:00Z');
const alert = (o: Partial<AlertRow> = {}): AlertRow => ({ id: 1, utc: '2026-10-31T10:00:00Z', site: 'SGT', level: 'WATCH', message: 'WATCH: x', ...o });

test('particulate: negative sentinel and junk are "no reading", never zero', () => {
  assert.equal(particulate(-1), null);
  assert.equal(particulate(null), null);
  assert.equal(particulate(undefined), null);
  assert.equal(particulate(''), null);
  assert.equal(particulate('abc'), null);
  assert.equal(particulate(0), 0); // a real measured zero stays zero
  assert.equal(particulate(64.2), 64.2);
});

test('packetValues keeps nulls null and reads MQ135 in mV', () => {
  const v = packetValues({ pm2_5: -1, pm10: 30, temp: 21.5, rh: null, pressure: 1010, mq_mv: 412 });
  assert.deepEqual(v, { pm25: null, pm10: 30, temp: 21.5, rh: null, pressure: 1010, mqMv: 412 });
  assert.equal(packetValues(undefined).pm25, null);
});

test('observationState: every freshness and sentinel combination', () => {
  assert.equal(observationState({ hasPacket: false, freshness: 'never', pm25: null }), 'no-packet');
  assert.equal(observationState({ hasPacket: true, freshness: 'never', pm25: 5 }), 'no-packet');
  assert.equal(observationState({ hasPacket: true, freshness: 'stale', pm25: 64 }), 'stale'); // old value is not current
  assert.equal(observationState({ hasPacket: true, freshness: 'fresh', pm25: null }), 'no-reading');
  assert.equal(observationState({ hasPacket: true, freshness: 'fresh', pm25: 0 }), 'valid');
  assert.equal(observationState({ hasPacket: true, freshness: 'fresh', pm25: 64 }), 'valid');
});

test('observationHeadline: stale says not current; no node says no node', () => {
  assert.match(observationHeadline('stale', 'N1', '3 days ago').title, /No current reading/);
  assert.match(observationHeadline('stale', 'N1', '3 days ago').detail, /not shown as current/);
  assert.match(observationHeadline('no-packet', undefined, 'never').detail, /No node is assigned/);
  assert.match(observationHeadline('no-reading', 'N2', '1 min ago').title, /No PM reading/);
  assert.match(observationHeadline('valid', 'N1', '20s ago').title, /Current local reading/);
});

test('verdictView: unknown model fields are not presented as a verdict', () => {
  assert.deepEqual(verdictView({ label: 'Unfavourable', tone: 'poor', detail: '' }), { headline: 'Unfavourable dispersion', known: true });
  assert.deepEqual(verdictView({ label: 'Unknown', tone: 'fair', detail: '' }), { headline: 'Dispersion unknown', known: false });
});

test('dispersionEvidence: thresholds come from the caller; nulls are not zero', () => {
  const rows = dispersionEvidence({ vc: 4100, wind: 1.7, inv: 1.8, blh: 2400, poorAt: 6000, calmKmh: 10 });
  assert.equal(rows.length, 4);
  assert.match(rows[0].note, /Below the 6,000 m²\/s/);
  assert.match(rows[2].note, /^Calm/);
  assert.equal(rows[3].value, '+1.8');
  const missing = dispersionEvidence({ vc: null, wind: null, inv: null, blh: null, poorAt: 6000, calmKmh: 10 });
  assert.ok(missing.every((r) => r.value === null && /Not available/.test(r.note)));
  const good = dispersionEvidence({ vc: 9000, wind: 4, inv: -0.5, blh: 1500, poorAt: 6000, calmKmh: 10 });
  assert.match(good[0].note, /At or above/);
  assert.match(good[2].note, /^Not calm/);
  assert.equal(good[3].value, '-0.5');
});

test('assessmentLimits: no valid local reading is always disclosed', () => {
  for (const observation of ['stale', 'no-packet', 'no-reading'] as const) {
    assert.ok(assessmentLimits({ observation, modelStale: false, verdictKnown: true }).some((s) => /no current local PM2\.5/.test(s)));
  }
  const ok = assessmentLimits({ observation: 'valid', modelStale: false, verdictKnown: true });
  assert.ok(!ok.some((s) => /no current local PM2\.5/.test(s)));
  assert.ok(ok.some((s) => /not AEIOS sensor data/.test(s)));
  assert.ok(assessmentLimits({ observation: 'valid', modelStale: true, verdictKnown: false }).length >= 3);
});

test('feedStatus', () => {
  assert.equal(feedStatus({ loadState: 'error', stale: false }).tone, 'critical');
  assert.equal(feedStatus({ loadState: 'loading', stale: false }).label, 'Connecting to model feed');
  assert.equal(feedStatus({ loadState: 'ready', stale: true }).label, 'Cached model run');
  assert.equal(feedStatus({ loadState: 'ready', stale: false }).tone, 'good');
});

const base = { totalPackets: 14, matureAt: 10000, warming: true, fmtAgo: ago };

test('healthRows: gateway online while node stale stays separate', () => {
  const rows = healthRows({
    ...base, loaded: true,
    gateway: { id: 'node-gateway', lastSeen: 'G', online: true },
    nodes: [{ node: 'N1', site: 'SGT University', lastPacket: 'P1', freshness: 'stale' }, { node: 'N2', site: 'Chandu village', lastPacket: null, freshness: 'never' }],
  });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by['gateway'].state, 'online');
  assert.equal(by['node-N1'].state, 'stale');
  assert.equal(by['node-N2'].state, 'nodata');
  assert.match(by['gateway'].detail, /nothing about the nodes/);
  assert.equal(by['model'].state, 'warming');
  assert.match(by['model'].detail, /not validated: 14 of about 10,000/);
  assert.deepEqual(rows.map((r) => r.scope), ['Gateway', 'Node', 'Node', 'Local model']);
});

test('healthRows: loading, gateway never seen, no nodes, mature model', () => {
  assert.equal(healthRows({ ...base, loaded: false, gateway: null, nodes: [] })[0].state, 'unknown');
  const none = healthRows({ ...base, loaded: true, gateway: null, nodes: [] });
  assert.equal(none[0].state, 'offline');
  assert.equal(none[1].state, 'nodata');
  const mature = healthRows({ ...base, warming: false, totalPackets: 12000, loaded: true, gateway: { id: 'g', lastSeen: 'x', online: false }, nodes: [] });
  assert.equal(mature[0].state, 'offline');
  assert.equal(mature[mature.length - 1].state, 'active');
});

test('alertOutcome: loading, error, active, none, cannot-assess are five different outcomes', () => {
  const common = { siteCode: 'SGT', nowMs: NOW, windowHours: 12 };
  assert.deepEqual(alertOutcome({ ...common, alerts: null, error: '', observation: 'valid' }), { kind: 'loading' });
  assert.equal(alertOutcome({ ...common, alerts: null, error: 'boom', observation: 'valid' }).kind, 'error');
  assert.equal(alertOutcome({ ...common, alerts: [], error: '', observation: 'valid' }).kind, 'none');
  assert.equal(alertOutcome({ ...common, alerts: [], error: '', observation: 'stale' }).kind, 'cannot-assess');
  assert.equal(alertOutcome({ ...common, alerts: [], error: '', observation: 'no-packet' }).kind, 'cannot-assess');
  assert.equal(alertOutcome({ ...common, alerts: [], error: '', observation: 'no-reading' }).kind, 'cannot-assess');
});

test('alertOutcome: filters site, test rows and the time window; WARNING outranks WATCH', () => {
  const common = { siteCode: 'SGT', nowMs: NOW, windowHours: 12, error: '', observation: 'valid' as const };
  const wrongSite = alertOutcome({ ...common, alerts: [alert({ site: 'CHANDU' })] });
  assert.equal(wrongSite.kind, 'none');
  assert.equal(alertOutcome({ ...common, alerts: [alert({ message: 'TEST ROW: sample' })] }).kind, 'none');
  assert.equal(alertOutcome({ ...common, alerts: [alert({ utc: '2026-10-30T10:00:00Z' })] }).kind, 'none'); // 26 h old
  const both = alertOutcome({ ...common, alerts: [alert({ id: 1, level: 'WATCH' }), alert({ id: 2, level: 'WARNING' })] });
  assert.equal(both.kind, 'active');
  if (both.kind === 'active') { assert.equal(both.alert.level, 'WARNING'); assert.equal(both.more, 1); }
  // an active alert is shown even when node data is stale: the alert exists regardless of local inputs
  assert.equal(alertOutcome({ ...common, observation: 'stale', alerts: [alert()] }).kind, 'active');
});

test('outlookSummary: takeaway matches the data; nulls are not counted as poor', () => {
  assert.match(outlookSummary([100, 200, 300], 6000).takeaway, /all 3 hours, so dispersion stays poor/);
  assert.match(outlookSummary([7000, 8000], 6000).takeaway, /at or above 6,000 m²\/s for all 2 hours/);
  assert.match(outlookSummary([100, 7000, null], 6000).takeaway, /for 1 of the next 2 hours/);
  const none = outlookSummary([null, null], 6000);
  assert.equal(none.valid, 0);
  assert.equal(none.poor, 0);
  assert.match(none.takeaway, /No model values/);
  assert.equal(outlookSummary([], 6000).valid, 0);
});

test('aqiCategory: US AQI bands, and missing is not a category', () => {
  assert.equal(aqiCategory(null), null);
  assert.equal(aqiCategory(Number.NaN), null);
  assert.equal(aqiCategory(50), 'Good');
  assert.equal(aqiCategory(95), 'Moderate');
  assert.equal(aqiCategory(150), 'Unhealthy for sensitive groups');
  assert.equal(aqiCategory(151), 'Unhealthy');
  assert.equal(aqiCategory(260), 'Very unhealthy');
});

test('inversionHours: only positive inversions count; missing is not an inversion', () => {
  assert.equal(inversionHours([1.8, 0, -0.5, null, 0.1]), 2);
  assert.equal(inversionHours([null, null]), 0);
  assert.equal(inversionHours([]), 0);
});

test('gaugePosition: linear and log scales, clamping flags, null stays null', () => {
  assert.equal(gaugePosition(null, { min: 0, max: 10, scale: 'linear' }), null);
  assert.equal(gaugePosition(5, { min: 0, max: 10, scale: 'linear' })!.pos, 0.5);
  const lo = gaugePosition(-2, { min: 0, max: 10, scale: 'linear' })!;
  assert.deepEqual([lo.pos, lo.below, lo.above], [0, true, false]);
  assert.equal(gaugePosition(1000, { min: 10, max: 100000, scale: 'log' })!.pos, 0.5);
  const hi = gaugePosition(1e6, { min: 10, max: 100000, scale: 'log' })!;
  assert.deepEqual([hi.pos, hi.above], [1, true]);
});

test('mixingLayer: clamps to the chart ceiling and says so; invalid is null', () => {
  assert.deepEqual(mixingLayer(35, 200), { shown: 35, clamped: false });
  assert.deepEqual(mixingLayer(1520, 200), { shown: 200, clamped: true });
  assert.equal(mixingLayer(null, 200), null);
  assert.equal(mixingLayer(-5, 200), null);
});

test('profileDomain: needs two values; pads by 1 degree', () => {
  assert.deepEqual(profileDomain([20.4, 22.1, 24.5, null]), [19, 26]);
  assert.equal(profileDomain([20, null, null]), null);
});

test('flowDuration: faster wind crosses faster; unknown speed never animates', () => {
  assert.equal(flowDuration(null), null);
  assert.equal(flowDuration(-1), null);
  assert.ok(flowDuration(1)! > flowDuration(5)!);
  assert.equal(flowDuration(0), 30);
  assert.equal(flowDuration(50), 1.2);
});

test('ribbonCells and ventilationWindows: unknown is neither poor nor adequate', () => {
  const cells = ribbonCells([
    { time: 'a', vc: 100, inv: 1 }, { time: 'b', vc: 7000, inv: -1 }, { time: 'c', vc: 8000, inv: null },
    { time: 'd', vc: null, inv: null }, { time: 'e', vc: 9000, inv: 0.5 },
  ], 6000);
  assert.deepEqual(cells.map((c) => c.state), ['poor', 'adequate', 'adequate', 'unknown', 'adequate']);
  assert.deepEqual(cells.map((c) => c.inversion), [true, false, false, false, true]);
  assert.deepEqual(ventilationWindows(cells), [{ from: 'b', to: 'c', hours: 2 }, { from: 'e', to: 'e', hours: 1 }]);
  assert.deepEqual(ventilationWindows(ribbonCells([{ time: 'x', vc: 1, inv: null }], 6000)), []);
});

test('situationStatement: built only from the verdict', () => {
  assert.deepEqual(situationStatement({ label: 'Limited', tone: 'fair', detail: '' }), { lead: 'Dispersion is limited.', tone: 'fair' });
  assert.equal(situationStatement({ label: 'Unknown', tone: 'fair', detail: '' }).tone, 'unknown');
});
