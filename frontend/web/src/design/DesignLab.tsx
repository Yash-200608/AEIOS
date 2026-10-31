import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Menu, PanelLeftClose, PanelLeftOpen, Palette, X } from 'lucide-react';
import './tokens.css';
import './lab.css';
import {
  ChartFrame, EmptyState, EventItem, InsightPanel, Panel, Readout, SourceLabel, StateLabel,
  type OperationalState, type SourceKind,
} from './primitives';

/*
 * Design System Lab. Development only: main.tsx loads this behind import.meta.env.DEV and ?designlab,
 * so it is removed from production builds. Every value on this page is ILLUSTRATIVE STATIC PREVIEW DATA.
 * Nothing here reads Supabase or the dashboard state, and nothing here is a real observation.
 */

const SECTIONS = [
  ['principles', 'Truth model'],
  ['colour', 'Colour and contrast'],
  ['type', 'Type, space, radius'],
  ['controls', 'Controls and focus'],
  ['labels', 'Source and state labels'],
  ['readouts', 'Readouts'],
  ['insight', 'Insight and events'],
  ['chart', 'Chart frame'],
  ['states', 'Empty, stale, loading, error'],
  ['truth', 'Truth-state examples'],
  ['motion', 'Motion and reduced motion'],
] as const;

// Contrast ratios computed from the token values (WCAG relative luminance), recorded in the spec.
const TEXT_TOKENS: Array<{ token: string; role: string; ratios: [string, string, string, string] }> = [
  { token: '--aeios-text-primary', role: 'Main text and values', ratios: ['16.67', '15.30', '14.28', '12.69'] },
  { token: '--aeios-text-secondary', role: 'Supporting text', ratios: ['10.52', '9.65', '9.01', '8.00'] },
  { token: '--aeios-text-tertiary', role: 'Readable metadata', ratios: ['7.35', '6.75', '6.30', '5.60'] },
  { token: '--aeios-accent', role: 'Interaction, focus', ratios: ['11.20', '10.28', '9.59', '8.53'] },
  { token: '--aeios-source-regional', role: 'Regional model', ratios: ['8.94', '8.21', '7.66', '6.81'] },
  { token: '--aeios-source-model', role: 'AEIOS model', ratios: ['12.00', '11.01', '10.28', '9.13'] },
  { token: '--aeios-source-simulation', role: 'Simulation', ratios: ['9.04', '8.30', '7.74', '6.88'] },
  { token: '--aeios-status-good', role: 'Healthy', ratios: ['10.64', '9.77', '9.11', '8.10'] },
  { token: '--aeios-status-warning', role: 'Caution', ratios: ['10.46', '9.60', '8.96', '7.96'] },
  { token: '--aeios-status-critical', role: 'Critical', ratios: ['7.01', '6.43', '6.00', '5.34'] },
  { token: '--aeios-border-strong', role: 'Control boundary (needs 3:1)', ratios: ['4.28', '3.93', '3.67', '3.26'] },
];

const CHART = [
  { t: '00:00', regional: 62, model: 58, live: 60 }, { t: '03:00', regional: 66, model: 64, live: 67 },
  { t: '06:00', regional: 71, model: 69, live: null }, { t: '09:00', regional: 78, model: 74, live: null },
  { t: '12:00', regional: 74, model: 73, live: null }, { t: '15:00', regional: 69, model: 70, live: null },
  { t: '18:00', regional: 64, model: 66, live: null }, { t: '21:00', regional: 60, model: 63, live: null },
];

function useTokenValue(name: string) {
  const [v, setV] = useState('');
  useEffect(() => { setV(getComputedStyle(document.documentElement).getPropertyValue(name).trim()); }, [name]);
  return v;
}
function Swatch({ token }: { token: string }) {
  const hex = useTokenValue(token);
  return (
    <li className="lab-swatch">
      <span className="lab-swatch__chip" style={{ background: `var(${token})` }} aria-hidden="true" />
      <span><code>{token}</code><br /><span className="ax-mono lab-dim">{hex}</span></span>
    </li>
  );
}

function PreviewNote({ children }: { children?: React.ReactNode }) {
  return <p className="lab-preview-note"><AlertTriangle size={13} aria-hidden="true" /> {children ?? 'Illustrative static preview data. Not a live observation, forecast or event.'}</p>;
}

export default function DesignLab() {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [forceReduced, setForceReduced] = useState(false);
  const [osReduced, setOsReduced] = useState(false);
  const [seg, setSeg] = useState('24h');
  const [changed, setChanged] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setOsReduced(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const wasOpen = useRef(false);
  useEffect(() => {
    // Move focus into the drawer on open and back to the trigger on close; never steal focus on first render.
    if (drawer) { wasOpen.current = true; closeBtn.current?.focus(); }
    else if (wasOpen.current) { wasOpen.current = false; menuBtn.current?.focus({ preventScroll: true }); }
  }, [drawer]);

  const trap = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { setDrawer(false); return; }
    if (e.key !== 'Tab' || !drawerRef.current) return;
    const f = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href], button'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const nav = (
    <nav aria-label="Design lab sections">
      <ul className="lab-nav">
        {SECTIONS.map(([id, label]) => (
          <li key={id}><a href={`#${id}`} onClick={() => setDrawer(false)}><Palette size={16} aria-hidden="true" /><span className="lab-nav__label">{label}</span></a></li>
        ))}
      </ul>
    </nav>
  );

  const states: Array<[OperationalState, string?, string?]> = [
    ['online', 'Gateway'], ['fresh', 'Node N1'], ['stale', 'Node N2'], ['nodata', 'Node N3'],
    ['warming', 'Local model'], ['calibrating', 'MQ135'], ['degraded', 'PMS5003'], ['fault', 'BME688'],
  ];
  const sources: SourceKind[] = ['live', 'regional', 'model', 'simulation'];

  return (
    <div className={`aeios-lab ${forceReduced ? 'aeios-force-reduced-motion' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="lab-skip" href="#main">Skip to content</a>
      <header className="lab-topbar">
        <button ref={menuBtn} className="ax-btn ax-btn--quiet lab-menu-btn" aria-label="Open navigation" aria-expanded={drawer} aria-controls="lab-drawer" onClick={() => setDrawer(true)}><Menu size={20} aria-hidden="true" /></button>
        <div className="lab-brand">AEIOS <span>Sentinel</span> · Design System Lab</div>
        <span className="lab-badge">DEV ONLY · ILLUSTRATIVE DATA</span>
      </header>

      <aside className="lab-side" aria-label="Sidebar">
        <button className="ax-btn ax-btn--quiet lab-collapse" onClick={() => setCollapsed((c) => !c)} aria-pressed={collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}<span className="lab-nav__label">Collapse</span>
        </button>
        {nav}
      </aside>

      {drawer && <div className="lab-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <aside id="lab-drawer" ref={drawerRef} className={`lab-drawer ${drawer ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Navigation" aria-hidden={!drawer} onKeyDown={trap} {...(drawer ? {} : { inert: '' as unknown as undefined })}>
        <button ref={closeBtn} className="ax-btn ax-btn--quiet" aria-label="Close navigation" onClick={() => setDrawer(false)}><X size={20} aria-hidden="true" /></button>
        {nav}
      </aside>

      <main id="main" className="lab-main" aria-hidden={drawer}>
        <div className="lab-banner" role="note"><AlertTriangle size={16} aria-hidden="true" /> <span><strong>Design System Lab, development build only.</strong> Every number, status and sentence below is static, illustrative preview data. Nothing is measured, forecast or read from Supabase.</span></div>

        <h1 className="lab-title">Visual foundation</h1>
        <p className="lab-lede">A midnight scientific instrument panel: graphite surfaces, restrained teal, and a colour grammar that separates where data came from from how healthy a system is. Spec: <code>docs/design/AEIOS_VISUAL_FOUNDATION.md</code>.</p>

        <section id="principles" className="lab-section">
          <h2>Truth model: six dimensions that never collapse into one badge</h2>
          <div className="lab-grid lab-grid--3">
            {[
              ['Provenance', 'Where the value came from: live station, regional model, AEIOS model, simulation.'],
              ['Freshness', 'When it was observed and whether the node, not just the gateway, is current.'],
              ['Sensor quality and state', 'Valid, warming, calibrating, stale, degraded or faulted. Not the same as confidence.'],
              ['Model maturity', 'Whether a model has seen enough real data to mean anything.'],
              ['Event confidence', 'How sure AEIOS is about an interpretation, with evidence for and against.'],
              ['Severity and lifecycle', 'How serious an event is and where it is in its life. Separate fields.'],
            ].map(([h, p]) => <div key={h} className="lab-card"><h3>{h}</h3><p>{p}</p></div>)}
          </div>
        </section>

        <section id="colour" className="lab-section">
          <h2>Colour and contrast</h2>
          <h3>Surfaces</h3>
          <ul className="lab-swatches">{['--aeios-canvas', '--aeios-surface-1', '--aeios-surface-2', '--aeios-surface-3', '--aeios-border-subtle', '--aeios-border-strong'].map((t) => <Swatch key={t} token={t} />)}</ul>
          <h3>Text and interaction</h3>
          <ul className="lab-swatches">{['--aeios-text-primary', '--aeios-text-secondary', '--aeios-text-tertiary', '--aeios-accent'].map((t) => <Swatch key={t} token={t} />)}</ul>
          <h3>Data-source grammar (never reused for severity)</h3>
          <ul className="lab-swatches">{['--aeios-source-live', '--aeios-source-regional', '--aeios-source-model', '--aeios-source-simulation'].map((t) => <Swatch key={t} token={t} />)}</ul>
          <h3>Status (never reused for provenance)</h3>
          <ul className="lab-swatches">{['--aeios-status-good', '--aeios-status-warning', '--aeios-status-critical'].map((t) => <Swatch key={t} token={t} />)}</ul>
          <h3>Computed contrast ratios against each surface</h3>
          <div className="lab-table-wrap">
            <table className="lab-table">
              <caption className="lab-dim">Normal text needs 4.5:1, large text and non-text 3:1. Subtle border (1.2 to 1.5:1) is decorative only and is never the sole boundary of a control.</caption>
              <thead><tr><th scope="col">Token</th><th scope="col">Role</th><th scope="col">Canvas</th><th scope="col">Surface 1</th><th scope="col">Surface 2</th><th scope="col">Surface 3</th></tr></thead>
              <tbody>{TEXT_TOKENS.map((r) => <tr key={r.token}><th scope="row"><code>{r.token}</code></th><td>{r.role}</td>{r.ratios.map((x, i) => <td key={i} className="ax-mono">{x}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>

        <section id="type" className="lab-section">
          <h2>Type, spacing and radius</h2>
          <div className="lab-type">
            <div className="lab-type__row"><span className="lab-dim ax-mono">display</span><span style={{ font: '600 var(--aeios-text-display)/var(--aeios-leading-tight) var(--aeios-font-ui)' }}>SGT University</span></div>
            <div className="lab-type__row"><span className="lab-dim ax-mono">xl 28</span><span style={{ font: '600 var(--aeios-text-xl)/1.2 var(--aeios-font-ui)' }}>Dispersion is unfavourable</span></div>
            <div className="lab-type__row"><span className="lab-dim ax-mono">lg 20</span><span style={{ font: '600 var(--aeios-text-lg)/1.3 var(--aeios-font-ui)' }}>Panel and section titles</span></div>
            <div className="lab-type__row"><span className="lab-dim ax-mono">md 16</span><span style={{ font: '400 var(--aeios-text-md)/1.5 var(--aeios-font-ui)' }}>Body text for explanations and interpretations.</span></div>
            <div className="lab-type__row"><span className="lab-dim ax-mono">base 14</span><span style={{ font: '400 var(--aeios-text-base)/1.55 var(--aeios-font-ui)' }}>Default interface text, evidence lists and controls.</span></div>
            <div className="lab-type__row"><span className="lab-dim ax-mono">sm 13 / xs 12</span><span style={{ font: '400 var(--aeios-text-sm)/1.5 var(--aeios-font-ui)' }}>Notes and timestamps. 12px is the floor for essential labels.</span></div>
            <div className="lab-type__row"><span className="lab-dim ax-mono">mono</span><span style={{ font: '400 var(--aeios-text-base)/1.4 var(--aeios-font-mono)' }}>28.4782° N, 76.9041° E · NODE-01 · 2026-10-31 14:20 IST</span></div>
          </div>
          <div className="lab-radii" aria-label="Spacing and radius scale">
            {[['4', '--aeios-space-1'], ['8', '--aeios-space-2'], ['16', '--aeios-space-4'], ['24', '--aeios-space-6'], ['48', '--aeios-space-12']].map(([px, t]) => <div key={t} className="lab-space"><span style={{ width: `var(${t})`, height: `var(${t})` }} /><small className="ax-mono lab-dim">{px}px</small></div>)}
            {[['6', '--aeios-radius-sm'], ['10', '--aeios-radius-md'], ['14', '--aeios-radius-lg'], ['18', '--aeios-radius-xl']].map(([px, t]) => <div key={t} className="lab-space"><span className="lab-radius" style={{ borderRadius: `var(${t})` }} /><small className="ax-mono lab-dim">r{px}</small></div>)}
          </div>
        </section>

        <section id="controls" className="lab-section">
          <h2>Controls and keyboard focus</h2>
          <p className="lab-dim">Press Tab to see the 3px teal focus ring. Touch targets are 44px; the WCAG 2.2 floor is 24px. Control boundaries use <code>--aeios-border-strong</code>.</p>
          <div className="lab-row">
            <button className="ax-btn ax-btn--primary">Primary action</button>
            <button className="ax-btn">Secondary</button>
            <button className="ax-btn ax-btn--quiet">Quiet</button>
            <button className="ax-btn" disabled>Disabled</button>
            <div className="ax-segmented" role="group" aria-label="Time range">
              {['6h', '24h', '72h'].map((r) => <button key={r} aria-pressed={seg === r} onClick={() => setSeg(r)}>{r}</button>)}
            </div>
            <label className="lab-field">Site<select className="ax-select" defaultValue="sgt"><option value="sgt">SGT University</option><option value="chandu">Chandu village</option></select></label>
          </div>
        </section>

        <section id="labels" className="lab-section">
          <h2>Source and state labels</h2>
          <p className="lab-dim">Source labels use text, an icon and a distinct border pattern (solid, double, dotted, dashed), so they remain distinguishable without colour. Source and operational state are separate dimensions.</p>
          <h3>Provenance</h3>
          <div className="lab-row">{sources.map((s) => <SourceLabel key={s} kind={s} detail={s === 'regional' ? 'CAMS · ~45 km · 3-hourly' : s === 'live' ? 'seen 2 min ago' : s === 'model' ? 'warming up' : 'not a forecast'} />)}</div>
          <h3>Operational state</h3>
          <div className="lab-row">{states.map(([s, scope]) => <StateLabel key={s} state={s} scope={scope} />)}</div>
          <PreviewNote />
        </section>

        <section id="readouts" className="lab-section">
          <h2>Readouts</h2>
          <PreviewNote />
          <div className="lab-grid lab-grid--4">
            <Panel level={3} title="Local PM2.5"><Readout label="Station measurement" value={64} unit="µg/m³" note="Node N1, within the freshness window." source="live" observed="14:20 IST" /></Panel>
            <Panel level={3} title="Local PM2.5 (stale)"><Readout label="Station measurement" value={null} missing="Last packet 3 days ago. The old value is not shown as current." source="live" observed="last packet 3 d ago" /></Panel>
            <Panel level={3} title="Regional air quality"><Readout label="US AQI (modelled)" value={95} note="Moderate. A regional estimate, not measured at this site." source="regional" observed="CAMS · 3-hourly" /></Panel>
            <Panel level={3} title="Local-model forecast"><Readout label="PM2.5 in 30 min" value={66} unit="µg/m³" note="Same as now until enough real packets are stored." source="model" observed="not validated" /></Panel>
          </div>
        </section>

        <section id="insight" className="lab-section">
          <h2>Insight and events</h2>
          <PreviewNote>Illustrative content showing the structure. Phase 02 will only render this when real data supports it; no inference capability is implied here.</PreviewNote>
          <InsightPanel
            source="regional"
            statement="Conditions favour pollution build-up this evening."
            confidence="Moderate. This comes from the regional weather model; no current local measurement is available to confirm it."
            supporting={['Ventilation coefficient below the poor threshold for the next 14 h', 'Surface inversion forecast']}
            contradicting={['Node N1 has not reported for 3 days, so local PM2.5 is unknown', 'Regional model grid is about 45 km']}
            next="Check whether node N1 is powered and transmitting before relying on this assessment."
            caveat="Interpretation of model fields. Not a measurement and not a validated forecast of local PM2.5."
          />
          <div className="lab-grid lab-grid--2 lab-gap-top">
            <EventItem title="Smoke-influenced air (example)" lifecycle="CONFIRMING" severity="moderate" confidence="0.62" sensorQuality="PMS5003 valid · MQ135 warming" evidence="Air-mass pathway estimate passed 7 satellite fire detections. Not source confirmation." />
            <EventItem title="Gas-response spike (example)" lifecycle="CANDIDATE" severity="low" confidence="0.31" sensorQuality="MQ135 only; no corroborating sensor" evidence="A single relative-response sensor is not enough to confirm an environmental event." />
          </div>
        </section>

        <section id="chart" className="lab-section">
          <h2>Chart frame</h2>
          <PreviewNote />
          <Panel level={3}>
            <ChartFrame
              title="PM2.5 over the next 24 hours"
              takeaway="The regional model and the AEIOS model agree on a late-morning peak. Only the first two station points are measured; the rest are model values."
              units="µg/m³" source="regional"
              legend={[{ label: 'Regional model (solid)', color: 'var(--aeios-source-regional)' }, { label: 'AEIOS model (dashed)', color: 'var(--aeios-source-model)', dash: '6 4' }, { label: 'Station measurement (points)', color: 'var(--aeios-source-live)', marker: true }]}
              table={{ columns: ['Time', 'Regional', 'AEIOS model', 'Station'], rows: CHART.map((r) => [r.t, r.regional, r.model, r.live ?? 'no reading']) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={CHART} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="var(--aeios-border-subtle)" vertical={false} />
                  <XAxis dataKey="t" stroke="var(--aeios-border-strong)" tickLine={false} />
                  <YAxis stroke="var(--aeios-border-strong)" tickLine={false} width={40} unit="" label={{ value: 'µg/m³', angle: -90, position: 'insideLeft', style: { fill: 'var(--aeios-text-secondary)', fontSize: 12 } }} />
                  <ReferenceLine y={60} stroke="var(--aeios-status-warning)" strokeDasharray="2 4" label={{ value: 'example threshold 60', position: 'insideTopRight', style: { fill: 'var(--aeios-status-warning)', fontSize: 12 } }} />
                  <Tooltip contentStyle={{ background: 'var(--aeios-surface-3)', border: '1px solid var(--aeios-border-strong)', borderRadius: 10, color: 'var(--aeios-text-primary)' }} labelStyle={{ color: 'var(--aeios-text-secondary)' }} />
                  <Line dataKey="regional" name="Regional model" type="monotone" stroke="var(--aeios-source-regional)" strokeWidth={2.5} dot={false} />
                  <Line dataKey="model" name="AEIOS model" type="monotone" stroke="var(--aeios-source-model)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
                  <Line dataKey="live" name="Station" stroke="var(--aeios-source-live)" strokeWidth={0} dot={{ r: 5, fill: 'var(--aeios-source-live)', stroke: 'var(--aeios-canvas)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </Panel>
        </section>

        <section id="states" className="lab-section">
          <h2>Empty, stale, loading and error states</h2>
          <p className="lab-dim">Six different situations get six different designs. None is ever filled with zero.</p>
          <div className="lab-grid lab-grid--2">
            <EmptyState kind="not-run" title="Not run yet">Choose an event, intensity and duration, then press Run to see the simulated response.</EmptyState>
            <EmptyState kind="no-result" title="No flags in this dataset">0 readings flagged in the 14 packets stored so far.</EmptyState>
            <EmptyState kind="unavailable" title="No satellite observation">This can mean a missed pass, cloud cover or unavailable imagery. It does not mean nothing happened.</EmptyState>
            <EmptyState kind="stale" title="Stale: last packet 3 days ago">The last readings are shown dimmed and are not current evidence.</EmptyState>
            <EmptyState kind="loading" title="Loading regional model">Fetching the latest forecast run.</EmptyState>
            <EmptyState kind="error" title="Feed unavailable" action={<button className="ax-btn lab-gap-top">Retry</button>}>The forecast could not be loaded. Check this device's connection.</EmptyState>
          </div>
          <PreviewNote />
        </section>

        <section id="truth" className="lab-section">
          <h2>Truth-state examples</h2>
          <PreviewNote />
          <div className="lab-grid lab-grid--2">
            <Panel level={3} title="Current live observation" aside={<><SourceLabel kind="live" detail="seen 2 min ago" /><StateLabel state="fresh" scope="Node N1" /></>}><Readout label="PM2.5" value={64} unit="µg/m³" observed="14:20 IST" /></Panel>
            <Panel level={3} title="Stale node, no current reading" aside={<><SourceLabel kind="live" /><StateLabel state="stale" scope="Node N2" /></>}><Readout label="PM2.5" value={null} missing="No packet for 4 days." /></Panel>
            <Panel level={3} title="Gateway online while a node is stale" aside={<><StateLabel state="online" scope="Gateway" /><StateLabel state="stale" scope="Node N1" /></>}><p className="lab-p">The gateway was seen seconds ago. That says nothing about whether the node has transmitted; each has its own state.</p></Panel>
            <Panel level={3} title="Model warming up, not validated" aside={<><SourceLabel kind="model" /><StateLabel state="warming" scope="Local model" /></>}><p className="lab-p">14 real packets stored. Forecasts equal "same as now" until about a week of real data exists.</p></Panel>
            <Panel level={3} title="Regional model estimate" aside={<SourceLabel kind="regional" detail="CAMS · ~45 km" />}><Readout label="US AQI (modelled)" value={95} note="Not a station observation." /></Panel>
            <Panel level={3} title="AEIOS model prediction" aside={<SourceLabel kind="model" detail="not validated" />}><Readout label="PM2.5 in 15 min" value={63} unit="µg/m³" note="From the on-gateway online model." /></Panel>
            <Panel level={3} title="Simulation-only scenario" aside={<SourceLabel kind="simulation" detail="what-if" />}><p className="lab-p">A deterministic perturbation. It is not an observation or a forecast and never changes official data.</p></Panel>
            <Panel level={3} title="Insufficient current data to assess" aside={<StateLabel state="nodata" scope="Alert inputs" />}><EmptyState kind="unavailable" title="Cannot confirm or rule out an episode">No fresh node reading. &quot;No alerts raised&quot; here reflects satellite and air-mass inputs only.</EmptyState></Panel>
          </div>
        </section>

        <section id="motion" className="lab-section">
          <h2>Motion and reduced motion</h2>
          <p className="lab-dim">Motion explains a change of state; it never decorates. Durations: 150 ms micro, 200 ms state, 260 ms navigation. No pulsing, scanning or ambient loops. Essential status never depends on animation.</p>
          <div className="lab-row">
            <button className="ax-btn" onClick={() => setChanged((c) => !c)}>Toggle an illustrative value change</button>
            <label className="lab-check"><input type="checkbox" checked={forceReduced} onChange={(e) => setForceReduced(e.target.checked)} /> Force reduced motion in this lab</label>
          </div>
          <p className="lab-p">Operating-system reduced-motion preference: <strong>{osReduced ? 'reduce (animations disabled)' : 'no preference'}</strong>. Lab override: <strong>{forceReduced ? 'on' : 'off'}</strong>.</p>
          <div className="lab-motion-demo"><Readout label="Illustrative value" value={changed ? 71 : 64} unit="µg/m³" /><div className={`lab-bar ${changed ? 'is-up' : ''}`} aria-hidden="true" /></div>
          <PreviewNote />
        </section>
      </main>
    </div>
  );
}
