import { useEffect, useState } from 'react';
import { api, round, type AeiosOverview } from '../lib/api';

const TARGET_LABEL: Record<string, string> = { pm2_5: 'PM2.5', pm10: 'PM10' };
const HORIZONS = [5, 15, 30];

function ago(iso?: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

// The AEIOS plane: what the gateway Pi measured over LoRa and what its local model predicted from it.
// Kept apart from the Open-Meteo / CAMS model feeds so they are never mistaken for each other.
export default function AeiosPanel() {
  const [data, setData] = useState<AeiosOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api.aeios().then((d) => { if (alive) { setData(d); setError(''); } }).catch((e) => alive && setError(String(e.message || e)));
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const online = data?.gateway && Date.now() - new Date(data.gateway.last_seen).getTime() < 120000;
  const nodes = Array.from(new Set([...(data?.latest || []).map((l) => l.node), ...(data?.predictions || []).map((p) => p.node)])).sort();
  const siteOf = (node: string) => data?.nodes.find((n) => n.node === node)?.site_id;

  return (
    <section id="aeios" className="page-section">
      <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
        <div><div className="eyebrow">EDGE INTELLIGENCE · RASPBERRY PI GATEWAY</div><h2 style={{ margin: '4px 0 0' }}>AEIOS sensors &amp; local model</h2></div>
        <span className={`status-chip ${online ? 'status-live' : ''}`}><span className="status-led" /> {data?.gateway ? `${data.gateway.device_id} · ${online ? 'ONLINE' : 'OFFLINE'} · seen ${ago(data.gateway.last_seen)}` : 'GATEWAY NOT SEEN YET'}</span>
      </div>
      {error && <div className="panel"><div className="panel-subtitle">Could not load gateway data: {error}</div></div>}
      {!error && data && nodes.length === 0 && (
        <div className="panel"><div className="panel-title">Waiting for AEIOS node data</div>
          <div className="panel-subtitle">No real sensor packets have reached the cloud yet. Nothing is simulated or substituted here.</div></div>
      )}
      <div className="aeios-grid">
        {nodes.map((node) => {
          const last = data!.latest.find((l) => l.node === node);
          return (
            <div className="panel" key={node}>
              <div className="panel-header">
                <div><div className="panel-title">Node {node}</div>
                  <div className="panel-subtitle">{siteOf(node) ? (siteOf(node) === 'sgt' ? 'SGT University' : 'Chandu village') : 'Site not assigned'} · last packet {ago(last?.rx_utc)}</div></div>
                <span className="source-badge">LIVE_STATION_TELEMETRY</span>
              </div>
              {last && (
                <div className="telemetry-row" style={{ marginTop: 10 }}>
                  <span>Temp {round(last.temp, 1)}°C</span><span>RH {round(last.rh, 0)}%</span><span>Pressure {round(last.pressure, 0)} hPa</span>
                  <span>PM2.5 {last.pm2_5 >= 0 ? round(last.pm2_5, 0) : '—'} µg/m³</span>
                  <span>PM10 {last.pm10 >= 0 ? round(last.pm10, 0) : '—'} µg/m³</span>
                  <span>MQ135 {round(last.mq_mv, 0)} mV</span>
                  <span>RSSI {round(last.rssi, 0)} dBm</span><span>SNR {round(last.snr, 1)} dB</span><span>GPS {last.fix ? 'FIX' : 'NO FIX'}</span>
                </div>
              )}
              <table className="aeios-table">
                <thead><tr><th>Forecast</th>{HORIZONS.map((h) => <th key={h}>+{h} min</th>)}</tr></thead>
                <tbody>
                  {(['pm2_5', 'pm10'] as const).map((t) => (
                    <tr key={t}><td>{TARGET_LABEL[t]}</td>
                      {HORIZONS.map((h) => {
                        const p = data!.predictions.find((x) => x.node === node && x.target === t && x.horizon_min === h);
                        return <td key={h}>{p ? <>{round(p.p50, 0)}{p.p10 !== null && p.p90 !== null ? <small> ({round(p.p10, 0)}–{round(p.p90, 0)})</small> : null}</> : '—'}</td>;
                      })}</tr>
                  ))}
                </tbody>
              </table>
              <div className="panel-subtitle">µg/m³, median with 80% band · <span className="source-badge">AEIOS_MODEL_PREDICTION</span></div>
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
          ) : <div className="panel-subtitle">None flagged in the uploaded data.</div>}
        </div>
      )}
      <div className="panel-subtitle" style={{ marginTop: 10 }}>
        {data ? `${data.totalPackets} real packets stored. ` : ''}The local model learns online and starts as "same as now"; it needs about a week of real packets before its forecasts mean anything.
        Earlier synthetic-data skill figures only show the pipeline works, not accuracy on real air.
      </div>
    </section>
  );
}
