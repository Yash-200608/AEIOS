import { AlertTriangle, Clock } from 'lucide-react';
import { round } from '../lib/api';
import { ago, gatewayOnline, MODEL_MATURE_PACKETS, modelWarmingUp, NODE_STALE_MS, nodeAqi, nodeFreshness, useAeios } from '../lib/freshness';
import { aqiBasis, checkPm, PM_REJECT_TEXT } from '../lib/pmQuality';

/** A forecast is only shown as current while it is younger than the node staleness limit; older ones are from a past run. */
const currentForecast = (madeUtc: unknown) => Date.now() - Date.parse(String(madeUtc)) <= NODE_STALE_MS;

const TARGET_LABEL: Record<string, string> = { pm2_5: 'PM2.5', pm10: 'PM10' };
const HORIZONS = [5, 15, 30];

// The AEIOS plane: what the gateway Pi measured over LoRa and what its local model predicted from it.
// Gateway link, node packets and model maturity are three separate states and are shown separately.
export default function AeiosPanel() {
  const { data, error } = useAeios();
  const online = gatewayOnline(data);
  const warming = modelWarmingUp(data);
  const nodes = Array.from(new Set([...(data?.latest || []).map((l) => l.node), ...(data?.predictions || []).map((p) => p.node)])).sort();
  const siteOf = (node: string) => data?.nodes.find((n) => n.node === node)?.site_id;

  return (
    <section id="aeios" className="page-section">
      <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
        <div><div className="eyebrow">EDGE INTELLIGENCE · RASPBERRY PI GATEWAY</div><h2 style={{ margin: '4px 0 0' }}>AEIOS sensors &amp; local model</h2></div>
        <span className={`status-chip ${online ? 'status-live' : ''}`}><span className="status-led" /> {data?.gateway ? `GATEWAY ${online ? 'ONLINE' : 'OFFLINE'} · ${data.gateway.device_id} · seen ${ago(data.gateway.last_seen)}` : 'GATEWAY NOT SEEN YET'}</span>
      </div>
      <div className="state-box state-info"><Clock size={14} /><span><b>Gateway online</b> means the Pi was recently seen. It does not mean the nodes below have recently transmitted: check each node's own packet time.</span></div>
      {error && <div className="panel"><div className="panel-subtitle">Could not load gateway data: {error}</div></div>}
      {!error && data && nodes.length === 0 && (
        <div className="panel"><div className="panel-title">Waiting for AEIOS node data</div>
          <div className="panel-subtitle">No real sensor packets have reached the cloud yet. Nothing is simulated or substituted here.</div></div>
      )}
      {warming && data && (
        <div className="state-box state-warm" role="status">
          <AlertTriangle size={14} />
          <span><b>Local model warming up.</b> {data.totalPackets.toLocaleString('en-IN')} real packets stored; the table below is the Pi's own online model. It starts from "same as now" and improves with every packet, so it stays greyed out and unvalidated until {MODEL_MATURE_PACKETS.toLocaleString('en-IN')} packets and stays rough well beyond that. Earlier synthetic-data skill figures only show the pipeline works, not accuracy on real air.</span>
        </div>
      )}
      <div className="aeios-grid">
        {nodes.map((node) => {
          const last = data!.latest.find((l) => l.node === node);
          const fresh = nodeFreshness(last?.rx_utc);
          const stale = fresh !== 'fresh';
          const pm = last ? checkPm(last) : null; // a rejected PM reading is shown as "—" with the reason, never as a value
          const aqi = nodeAqi(data, node);
          const nodePreds = data!.predictions.filter((x) => x.node === node);
          const lastForecast = nodePreds.reduce<string | null>((a, x) => (a === null || String(x.made_utc) > a ? String(x.made_utc) : a), null);
          const forecastOld = lastForecast !== null && !currentForecast(lastForecast);
          return (
            <div className={`panel node-card ${stale ? 'node-stale' : ''}`} key={node}>
              <div className="panel-header">
                <div><div className="panel-title">Node {node}</div>
                  <div className="panel-subtitle">{siteOf(node) ? (siteOf(node) === 'sgt' ? 'SGT University' : 'Chandu village') : 'Site not assigned'}</div></div>
                <span className={`fresh-badge fresh-${fresh}`}>{fresh === 'fresh' ? 'FRESH' : fresh === 'stale' ? 'STALE' : 'NO DATA'}</span>
              </div>
              <div className="last-packet"><Clock size={13} /> Last packet: <b>{ago(last?.rx_utc)}</b>{stale && last ? ' · readings below are old, not current' : ''}</div>
              {last && (
                <div className="telemetry-row" style={{ marginTop: 10 }}>
                  <span>Temp {round(last.temp, 1)}°C</span><span>RH {round(last.rh, 0)}%</span><span>Pressure {round(last.pressure, 0)} hPa</span>
                  <span>PM2.5 {pm?.ok ? round(pm.pm25, 0) : '—'} µg/m³</span>
                  <span>PM10 {pm?.ok ? round(pm.pm10, 0) : '—'} µg/m³</span>
                  <span>MQ135 {round(last.mq_mv, 0)} mV</span>
                  {/* the firmware sends fix = -1 when there is no GPS; only a positive value is a fix */}
                  <span>RSSI {round(last.rssi, 0)} dBm</span><span>SNR {round(last.snr, 1)} dB</span><span>GPS {Number(last.fix) > 0 ? 'FIX' : 'NO FIX'}</span>
                </div>
              )}
              {pm && !pm.ok && <div className="pm-reject" role="note"><AlertTriangle size={13} /> PM reading rejected: {PM_REJECT_TEXT[pm.reason]}.</div>}
              {aqi && (
                <div className="node-aqi" data-aqi-local={aqi.aqi === null ? 'none' : 'value'}>
                  <div><span className="node-aqi__label">Local AQI · indicative, US scale</span>
                    {aqi.aqi === null ? <b className="node-aqi__none">not available</b> : <b>{aqi.aqi} <small>{aqi.category} · {aqi.dominant}</small></b>}</div>
                  <span className="node-aqi__basis">{aqiBasis(aqi)}</span>
                </div>
              )}
              <div className="pred-head">
                <span>Local-model forecast</span>
                <span className={`fresh-badge ${warming ? 'fresh-warm' : 'fresh-fresh'}`}>{warming ? 'WARMING UP · NOT VALIDATED' : 'MODEL ACTIVE'}</span>
              </div>
              <table className={`aeios-table ${warming || stale ? 'pred-muted' : ''}`}>
                <thead><tr><th>Forecast</th>{HORIZONS.map((h) => <th key={h}>+{h} min</th>)}</tr></thead>
                <tbody>
                  {(['pm2_5', 'pm10'] as const).map((t) => (
                    <tr key={t}><td>{TARGET_LABEL[t]}</td>
                      {HORIZONS.map((h) => {
                        const found = nodePreds.find((x) => x.target === t && x.horizon_min === h);
                        const p = found && currentForecast(found.made_utc) ? found : undefined; // an old run is not a current forecast
                        return <td key={h}>{p ? <>{round(p.p50, 0)}{p.p10 !== null && p.p90 !== null ? <small> ({round(p.p10, 0)}–{round(p.p90, 0)})</small> : null}</> : '—'}</td>;
                      })}</tr>
                  ))}
                </tbody>
              </table>
              {forecastOld && <div className="pm-reject" role="note"><Clock size={13} /> No current forecast: the last one was made {ago(lastForecast)}{pm && !pm.ok ? ', because the model needs valid PM readings to forecast' : ''}.</div>}
              <div className="panel-subtitle">µg/m³, median with 80% band · {data!.totalPackets.toLocaleString('en-IN')} real packets stored · <span className="source-badge">AEIOS_MODEL_PREDICTION</span></div>
            </div>
          );
        })}
      </div>
      {data && nodes.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-title">Unusual readings</div>
          {data.anomalies.length ? (
            <div className="telemetry-list">{data.anomalies.map((a) => (
              <div className="telemetry-row" key={a.id}><b>{new Date(a.utc).toLocaleString('en-IN')} · Node {a.node}</b>
                <span>{a.signal}</span><span>value {round(a.value, 1)}</span><span>24 h median {round(a.median_24h, 1)} · z {round(a.z, 1)}</span></div>))}</div>
          ) : <div className="panel-subtitle">No readings flagged in the {data.totalPackets.toLocaleString('en-IN')} packets stored so far.</div>}
        </div>
      )}
    </section>
  );
}
