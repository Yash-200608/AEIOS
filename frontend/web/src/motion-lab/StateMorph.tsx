import { useState } from 'react';
import type { OperationalState } from '../design/primitives';
import MorphStateLabel from '../motion/MorphStateLabel';
import MotionReady from '../motion/MotionReady';

/*
 * Prototype A2: status label morph, using the PRODUCTION component (MorphStateLabel, the same one the Overview uses).
 * A real state change swaps the label with opacity plus a 3 px blur for 120 ms. "Poll again" re-renders the parent with the same
 * state to show that routine polling does nothing visible. The chip does not animate its size: Motion's layout animation needs the
 * larger feature bundle (verified: with the light bundle the width jumps), so this is a label morph, not a shape morph.
 * The state is chosen by the user: nothing here is a measurement.
 */
const STATES: Array<{ state: OperationalState; scope: string; note: string }> = [
  { state: 'fresh', scope: 'Node N1', note: 'A packet arrived inside the freshness window.' },
  { state: 'stale', scope: 'Node N1', note: 'The newest packet is older than the freshness window; the last values are history, not now.' },
  { state: 'nodata', scope: 'Node N1', note: 'The gateway has never received a packet from this node.' },
  { state: 'unavailable', scope: 'Gateway', note: 'The gateway data could not be loaded, so every reading is unknown.' },
];

export default function StateMorph() {
  const [i, setI] = useState(0);
  const [polls, setPolls] = useState(0);
  const cur = STATES[i];
  return (
    <div className="ml-morph" data-testid="state-morph" data-state={cur.state} data-polls={polls}>
      <div className="ml-controls">
        {STATES.map((s, n) => (
          <button key={s.state} type="button" className="ax-btn" aria-pressed={n === i} onClick={() => setI(n)}>
            Show {s.state === 'nodata' ? 'no packet' : s.state === 'unavailable' ? 'gateway error' : s.state}
          </button>
        ))}
        <button type="button" className="ax-btn" onClick={() => setPolls((n) => n + 1)}>
          Poll again (same state)
        </button>
      </div>
      <div className="ml-morph__chip">
        <MotionReady>
          <MorphStateLabel state={cur.state} scope={cur.scope} />
        </MotionReady>
      </div>
      <p className="ml-status" role="status">
        {cur.note}
      </p>
    </div>
  );
}
