import { Clock } from 'lucide-react';
import { Readout, SourceLabel, StateLabel, type OperationalState } from '../../design/primitives';
import type { ObservationState, PacketValues } from './model';

// 'no-reading' means a fresh packet whose particulate sensor sent no value: the node itself is current.
const NODE_STATE: Record<ObservationState, OperationalState> = { valid: 'fresh', 'no-reading': 'fresh', stale: 'stale', 'no-packet': 'nodata' };

function Row({ label, value, unit, why, note }: { label: string; value: string | null; unit: string; why: string; note?: string }) {
  return (
    <div>
      <dt>{label}{note && <small>{note}</small>}</dt>
      <dd>{value === null ? <span className="cc-none">No reading<small>{why}</small></span> : <><span className="ax-num">{value}</span><small>{unit}</small></>}</dd>
    </div>
  );
}

export default function LocalObservations({ loaded, failed, state, node, headline, values, last, packetAgo }: {
  loaded: boolean; failed: boolean; state: ObservationState; node?: string; headline: { title: string; detail: string };
  values: PacketValues; last: PacketValues | null; packetAgo: string;
}) {
  const fresh = state === 'valid' || state === 'no-reading'; // only a fresh packet supplies current values
  const cur = (v: number | null, digits = 0) => (fresh && v !== null ? (digits ? v.toFixed(digits) : String(Math.round(v))) : null);
  const pm = (v: number | null) => (state === 'valid' ? cur(v) : null);
  const why = failed ? 'Gateway data unavailable.' : state === 'stale' ? 'Not current: the node has not transmitted recently.' : state === 'no-packet' ? 'No packet received.' : 'The particulate sensor sent no value.';
  return (
    <section className="cc-obs" aria-labelledby="cc-obs-h" aria-busy={!loaded}>
      <div className="cc-head">
        <div><div className="ax-eyebrow">Local observations</div><h2 id="cc-obs-h" className="cc-h2">{loaded ? headline.title : 'Checking the gateway…'}</h2></div>
        <div className="cc-aside">
          <SourceLabel kind="live" detail="AEIOS station" />
          {loaded && <StateLabel state={failed ? 'unavailable' : NODE_STATE[state]} scope={node ? `Node ${node}` : 'Node'} />}
        </div>
      </div>
      {loaded && <p className="cc-p">{headline.detail}</p>}
      <div className="cc-lead"><Readout label="PM2.5" value={pm(values.pm25)} unit="µg/m³" missing={why} note="Particulate matter measured at the node." /></div>
      <dl className="cc-obsrows" aria-label="Other local measurements">
        <Row label="PM10" value={pm(values.pm10)} unit="µg/m³" why={failed ? 'Gateway data unavailable.' : fresh ? 'The sensor sent no value.' : 'Not current.'} />
        <Row label="Temperature" value={cur(values.temp, 1)} unit="°C" why="Not current." />
        <Row label="Humidity" value={cur(values.rh)} unit="%" why="Not current." />
        <Row label="Pressure" value={cur(values.pressure)} unit="hPa" why="Not current." />
        <Row label="MQ135 relative gas response" value={cur(values.mqMv)} unit="mV" why="Not current." note="A relative response, not a gas concentration (not ppm)." />
      </dl>
      {state === 'stale' && last && (
        <details className="cc-last">
          <summary><Clock size={14} aria-hidden="true" style={{ marginRight: 6 }} /> Last recorded values (not current, {packetAgo})</summary>
          <dl>
            <div><dt>PM2.5</dt><dd>{last.pm25 === null ? 'no reading' : `${Math.round(last.pm25)} µg/m³`}</dd></div>
            <div><dt>PM10</dt><dd>{last.pm10 === null ? 'no reading' : `${Math.round(last.pm10)} µg/m³`}</dd></div>
            <div><dt>Temperature</dt><dd>{last.temp === null ? '—' : `${last.temp.toFixed(1)} °C`}</dd></div>
            <div><dt>Humidity</dt><dd>{last.rh === null ? '—' : `${Math.round(last.rh)} %`}</dd></div>
            <div><dt>Pressure</dt><dd>{last.pressure === null ? '—' : `${Math.round(last.pressure)} hPa`}</dd></div>
            <div><dt>MQ135 response</dt><dd>{last.mqMv === null ? '—' : `${Math.round(last.mqMv)} mV`}</dd></div>
          </dl>
        </details>
      )}
    </section>
  );
}
