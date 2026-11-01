import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { SourceLabel, StateLabel } from '../design/primitives';
import { motionTokens } from '../design/motion';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { alertChange, changedStates, contextKey, newPackets, type AlertSnapshot, type PacketStamp } from '../motion/changes';
import { nodeFreshness } from '../lib/freshness';
import type { AeiosOverview } from '../lib/api';
import { FIXTURES } from '../components/overview/fixtures.dev';
import { istDateTime } from '../components/overview/format';
import type { AlertRow } from '../components/overview/model';
import { ALERT_WINDOW_HOURS, alertFor, LAB_SITE, observationFor, type Telemetry } from './labModel';

/*
 * Change signals. Each button replaces ONE dimension of the fixture snapshot, as a poll would, and the real change-detection
 * helpers (src/motion/changes.ts) decide whether a signal fires: values are compared, never object identity, and Reset
 * starts a new context (contextKey) so nothing is diffed across it. Signals are one-shot (SIGNAL_S, no loop):
 *   new packet  -> the node timestamp highlights once;
 *   going stale -> the freshness label cross-fades and its text changes;
 *   alert raised -> the alert enters once and stays.
 * The highlighted element carries data-signal only for the signal's duration. One polite live region announces changes.
 */
type SignalKind = 'new-packet' | 'stale' | 'alert-raised';
type Signal = { kind: SignalKind; seq: number };
type Snap = { ctx: string; aeios: AeiosOverview; alerts: AlertRow[] };
const SIGNAL_S = 0.9;

const fixtureAeios = (name: 'normal' | 'stale'): AeiosOverview => FIXTURES[name]().aeios as AeiosOverview;
const fixtureAlerts = (name: 'normal' | 'alert'): AlertRow[] => FIXTURES[name]().alerts ?? [];
const telemetryOf = (s: Snap): Telemetry => ({ aeios: s.aeios, aeiosError: '', alerts: s.alerts, alertsError: '' });

/** The values the detectors compare: newest packet per node, freshness per node + gateway, and the alert outcome. */
function valuesOf(s: Snap) {
  const packets: PacketStamp = {};
  const fresh: Record<string, string> = {};
  for (const n of s.aeios.nodes) {
    const rx = s.aeios.latest.find((l) => l.node === n.node)?.rx_utc ?? null;
    packets[n.node] = rx ? String(rx) : null;
    fresh[n.node] = nodeFreshness(rx);
  }
  const obs = observationFor(telemetryOf(s), LAB_SITE.id);
  const outcome = alertFor(telemetryOf(s), obs.observation);
  const alert: AlertSnapshot = { kind: outcome.kind, id: outcome.kind === 'active' ? outcome.alert.id : null };
  return { packets, fresh, alert, obs, outcome };
}

const clock = (iso: string | null) =>
  iso && Number.isFinite(Date.parse(iso))
    ? `${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST`
    : '—';

export default function ChangeSignals() {
  const { reduced } = useMotionPolicy();
  const [generation, setGeneration] = useState(0);
  const [snap, setSnap] = useState<Snap>(() => ({
    ctx: contextKey(LAB_SITE.id, 'lab-0'),
    aeios: fixtureAeios('normal'),
    alerts: fixtureAlerts('normal'),
  }));
  const [signal, setSignal] = useState<Signal | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // One-shot: the signal clears itself after its duration. Nothing re-arms it except a new detected change.
  useEffect(() => {
    if (!signal) return;
    const id = window.setTimeout(() => setSignal(null), SIGNAL_S * 1000);
    return () => window.clearTimeout(id);
  }, [signal]);

  /** A new snapshot in the same context: diff it against the current one with the real helpers. */
  const receive = (next: Snap) => {
    const a = valuesOf(snap),
      b = valuesOf(next);
    const same = snap.ctx === next.ctx;
    const node = b.obs.node;
    // A changed rx_utc that is OLDER (the stale fixture) is not a new packet.
    const packets = newPackets(same ? a.packets : null, b.packets).filter(
      (n) => n === node && Date.parse(String(b.packets[n])) > Date.parse(String(a.packets[n])),
    );
    const stale = changedStates(same ? a.fresh : null, b.fresh).find((c) => c.key === node && c.to === 'stale');
    const alert = alertChange(same ? a.alert : null, b.alert);
    let kind: SignalKind | null = null;
    let text = '';
    if (alert === 'raised' && b.outcome.kind === 'active') {
      kind = 'alert-raised';
      text = `${b.outcome.alert.level} alert raised for ${LAB_SITE.title}.`;
    } else if (stale) {
      kind = 'stale';
      text = `Node ${stale.key} is now stale: last packet ${b.obs.packetAgo}.`;
    } else if (packets.length) {
      kind = 'new-packet';
      text = `New packet from node ${packets[0]} at ${clock(b.packets[packets[0]])}.`;
    } else if (alert === 'cleared') text = 'The alert has cleared.';
    setSnap(next);
    if (kind) setSignal((s) => ({ kind: kind as SignalKind, seq: (s?.seq ?? 0) + 1 }));
    setAnnouncement(text || 'No change detected.');
  };

  const newPacket = () => receive({ ...snap, aeios: fixtureAeios('normal') });
  const goStale = () => receive({ ...snap, aeios: fixtureAeios('stale') });
  const raiseAlert = () => receive({ ...snap, alerts: fixtureAlerts('alert') });
  const reset = () => {
    const g = generation + 1;
    setGeneration(g);
    setSnap({ ctx: contextKey(LAB_SITE.id, `lab-${g}`), aeios: fixtureAeios('normal'), alerts: fixtureAlerts('normal') });
    setSignal(null);
    setAnnouncement('Signals reset to the normal fixture.');
  };

  const v = valuesOf(snap);
  const node = v.obs.node;
  const rx = node ? v.packets[node] : null;
  const nodeState = v.obs.stationState;
  const on = (k: SignalKind) => (signal?.kind === k ? k : undefined);
  const flash = (k: SignalKind) =>
    signal?.kind === k && (
      <m.span
        key={signal.seq}
        className="ml-sig__flash"
        aria-hidden="true"
        initial={reduced ? false : { opacity: 0 }}
        animate={reduced ? { opacity: 1 } : { opacity: [0, 1, 0] }}
        transition={reduced ? { duration: 0 } : { duration: SIGNAL_S, times: [0, 0.25, 1], ease: 'easeOut' }}
      />
    );
  const fade = { duration: reduced ? 0 : motionTokens.duration.standard };

  return (
    <div className="ml-signals" data-testid="change-signals">
      <div className="ml-controls">
        <button type="button" className="ax-btn" onClick={newPacket}>
          Simulate new packet
        </button>
        <button type="button" className="ax-btn" onClick={goStale}>
          Simulate node going stale
        </button>
        <button type="button" className="ax-btn" onClick={raiseAlert}>
          Simulate alert raised
        </button>
        <button type="button" className="ax-btn" onClick={reset}>
          Reset signals
        </button>
      </div>
      <p className="cc-sr" aria-live="polite">
        {announcement}
      </p>

      <dl className="ml-signals__grid">
        <div>
          <dt>
            Newest packet, {node ? `node ${node}` : 'site node'} <SourceLabel kind="live" />
          </dt>
          <dd>
            <span className="ml-sig" data-signal={on('new-packet')}>
              {flash('new-packet')}
              <span className="ax-mono">{clock(rx)}</span>
            </span>
            <small className="cc-dim">received {v.obs.packetAgo}</small>
          </dd>
        </div>
        <div>
          <dt>Node freshness</dt>
          <dd>
            <span className="ml-sig ml-xfade" data-signal={on('stale')}>
              {flash('stale')}
              <AnimatePresence initial={false}>
                <m.span key={nodeState} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                  <StateLabel state={nodeState} scope={node ? `Node ${node}` : 'Node'} />
                </m.span>
              </AnimatePresence>
            </span>
            <small className="cc-dim">{v.obs.headline.detail}</small>
          </dd>
        </div>
        <div className="ml-signals__alert">
          <dt>
            Smoke alert, {LAB_SITE.title} (last {ALERT_WINDOW_HOURS} h)
          </dt>
          <dd>
            <AnimatePresence initial={false} mode="popLayout">
              {v.outcome.kind === 'active' ? (
                <m.div
                  key={`alert-${v.outcome.alert.id}`}
                  className={`ml-sig-host cc-alert cc-alert--${v.outcome.alert.level.toLowerCase()}`}
                  data-signal={on('alert-raised')}
                  initial={reduced ? false : { opacity: 0, y: motionTokens.distance.small }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : motionTokens.duration.reveal, ease: [...motionTokens.ease.enter] }}
                >
                  {flash('alert-raised')}
                  <div className="cc-health__top">
                    <span className={`ax-state ax-state--${v.outcome.alert.level === 'WARNING' ? 'critical' : 'warning'}`}>
                      <AlertTriangle size={13} aria-hidden="true" /> {v.outcome.alert.level}
                    </span>
                    <span className="ax-mono cc-dim">{istDateTime(v.outcome.alert.utc)}</span>
                  </div>
                  <p className="cc-alert__msg">{v.outcome.alert.message || 'No message recorded.'}</p>
                  {v.outcome.more > 0 && (
                    <span className="cc-dim">
                      {v.outcome.more} more in the last {ALERT_WINDOW_HOURS} hours.
                    </span>
                  )}
                </m.div>
              ) : (
                <m.div key="no-alert" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                  {/* Plain text, not EmptyState (role=status): the panel's only live region is the announcement above. */}
                  {v.outcome.kind === 'cannot-assess' ? (
                    <p className="cc-p">
                      <strong>Cannot assess.</strong> {v.outcome.reason}
                    </p>
                  ) : (
                    <p className="cc-p">
                      <strong>No alerts raised.</strong> No WATCH or WARNING in the last {ALERT_WINDOW_HOURS} hours (fixture).
                    </p>
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </dd>
        </div>
      </dl>
      <p className="ml-status">Gateway, node and alert values here are development fixtures (illustrative), not real data.</p>
    </div>
  );
}
